/**
 * The syntax-aware scan behind `tests/node/stub-boundary.test.mjs`.
 *
 * It parses a source file (acorn) and reports every WRITE that would install a forbidden global
 * (`Actor`, `document`, `PIXI`, ...) or a forbidden nested path (`game.socket`,
 * `foundry.applications`, ...). Reading the syntax tree instead of matching text is what lets it
 * tell code from comments, strings, regular expressions and object keys that merely share a
 * forbidden name -- the regex scan it replaces could not, and it also missed the logical
 * assignments (`??=`, `||=`, `&&=`) that put `foundry.applications` into a Node test.
 *
 * Forms detected, for a target that resolves to a forbidden global or path:
 *   - assignment of any operator: `=`, `??=`, `||=`, `&&=` (and the arithmetic ones), including
 *     destructuring targets and `for (x.y of list)` heads
 *   - member syntax in either spelling: `globalThis.Actor`, `globalThis["Actor"]`, `global.Actor`,
 *     `foundry.applications`, `globalThis.foundry.applications`, `foundry["applications"]`
 *   - `Object.defineProperty`, `Object.defineProperties`, `Object.assign` and `Reflect.set` /
 *     `Reflect.defineProperty`, with the key as a literal or inside an object literal
 *   - object literals assigned or merged into an ancestor, however deeply nested:
 *     `globalThis.foundry = { applications: {} }`, `Object.assign(globalThis, { game: { socket } })`
 *   - one level of aliasing: `const g = globalThis; g.Actor = ...`, `const { foundry } = globalThis`
 *   - a write to the global object whose key or contents cannot be read from the source
 *     (`globalThis[name] = ...`, `Object.assign(globalThis, helpers)`), because the scan cannot
 *     prove such a write is harmless
 *
 * Deliberately NOT detected: values held in variables (`globalThis.game = fixture` is not
 * followed into `fixture`), `eval` / `new Function`, and scope. A local that shares a global's name
 * is treated as the global, which can only over-report; a name that was renamed through anything
 * but the one-level alias above is not followed. The runtime assertions in the test file cover the
 * stub's actual surface; this scan covers what test files write.
 *
 * `acorn` is a declared devDependency (package.json), not a transitive one.
 */

import { parse } from "acorn";

/** Identifiers that are the global object itself. */
const GLOBAL_OBJECTS = new Set(["globalThis", "global"]);

/** How an assignment is named in a report: every operator writes its left-hand side. */
const ASSIGNMENT_FORM = (operator) => `assignment (${operator})`;

function parseSource(source) {
  const options = { ecmaVersion: "latest", locations: true, allowHashBang: true, allowAwaitOutsideFunction: true };
  try {
    return parse(source, { ...options, sourceType: "module" });
  } catch (moduleError) {
    try {
      return parse(source, { ...options, sourceType: "script" });
    } catch {
      throw moduleError;
    }
  }
}

/** Visit every node of an acorn tree, parents before children, in source order. */
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else if (child && typeof child === "object") {
      walk(child, visit);
    }
  }
}

/** The property name a key node spells out, or `undefined` when it is only known at run time. */
function staticKey(node, computed) {
  if (!node) return undefined;
  if (!computed) {
    if (node.type === "Identifier") return node.name;
    if (node.type === "Literal") return String(node.value);
    return undefined;
  }
  if (node.type === "Literal") return String(node.value);
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return undefined;
}

/**
 * Resolve an expression to the global-relative paths it can name. Each candidate is
 * `{ path: string[], dynamic: boolean }`; `path: []` is the global object itself and
 * `dynamic: true` means "some child of `path` whose name is not known statically".
 * A bare identifier resolves to itself AND to whatever it was aliased to, so shadowing can only
 * make the scan report more, never less.
 */
function resolve(node, aliases) {
  if (!node) return [];
  switch (node.type) {
    case "Identifier": {
      if (GLOBAL_OBJECTS.has(node.name)) return [{ path: [], dynamic: false }];
      return [{ path: [node.name], dynamic: false }, ...(aliases.get(node.name) ?? [])];
    }
    case "MemberExpression": {
      const key = staticKey(node.property, node.computed);
      const out = [];
      for (const base of resolve(node.object, aliases)) {
        if (base.dynamic) continue;
        out.push(key === undefined
          ? { path: base.path, dynamic: true }
          : { path: [...base.path, key], dynamic: false });
      }
      return out;
    }
    case "ChainExpression":
      return resolve(node.expression, aliases);
    case "AssignmentExpression":
      // `(globalThis.foundry ??= {}).applications = ...` writes through the assigned target.
      return resolve(node.left, aliases);
    default:
      return [];
  }
}

/** Record `const alias = <global-rooted expression>` and `const { a, b: c } = <...>` bindings. */
function collectAliases(ast) {
  const aliases = new Map();
  const bind = (pattern, candidates) => {
    if (!pattern || candidates.length === 0) return;
    if (pattern.type === "Identifier") {
      const kept = candidates.filter((c) => !c.dynamic);
      if (kept.length) aliases.set(pattern.name, [...(aliases.get(pattern.name) ?? []), ...kept]);
    } else if (pattern.type === "ObjectPattern") {
      for (const property of pattern.properties) {
        if (property.type !== "Property") continue;
        const key = staticKey(property.key, property.computed);
        if (key === undefined) continue;
        const children = candidates.filter((c) => !c.dynamic).map((c) => ({ path: [...c.path, key], dynamic: false }));
        bind(property.value.type === "AssignmentPattern" ? property.value.left : property.value, children);
      }
    }
  };
  walk(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.init) bind(node.id, resolve(node.init, aliases));
  });
  return aliases;
}

/** The expression nodes a destructuring or plain assignment target writes to. */
function targetsOf(pattern) {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
    case "MemberExpression":
      return [pattern];
    case "ObjectPattern":
      return pattern.properties.flatMap((p) => targetsOf(p.type === "RestElement" ? p.argument : p.value));
    case "ArrayPattern":
      return pattern.elements.flatMap(targetsOf);
    case "AssignmentPattern":
      return targetsOf(pattern.left);
    case "RestElement":
      return targetsOf(pattern.argument);
    default:
      return [];
  }
}

/** The `value` of a property descriptor written as an object literal, if it is one. */
function descriptorValue(node) {
  if (node?.type !== "ObjectExpression") return undefined;
  return node.properties.find((p) => p.type === "Property" && staticKey(p.key, p.computed) === "value")?.value;
}

/**
 * Scan one source text.
 *
 * @param {string} source
 * @param {{ globals: string[], paths: string[] }} rules  forbidden global names and dotted paths
 * @returns {{ line: number, name: string, form: string }[]}  one entry per offending write
 * @throws {SyntaxError} when the source does not parse -- a file the scan cannot read must fail
 *   the caller loudly, not be skipped.
 */
export function scanSource(source, rules) {
  const ast = parseSource(source);
  const aliases = collectAliases(ast);
  const pathRules = rules.paths.map((dotted) => ({ dotted, segments: dotted.split(".") }));
  const violations = [];

  /** The forbidden global or path a written location falls on or under, if any. */
  const classify = (path) => {
    if (path.length === 1 && rules.globals.includes(path[0])) return path[0];
    return pathRules.find(({ segments }) => segments.length <= path.length
      && segments.every((segment, i) => path[i] === segment))?.dotted;
  };

  const report = (node, name, form) => {
    const line = node.loc.start.line;
    if (!violations.some((v) => v.line === line && v.name === name && v.form === form)) {
      violations.push({ line, name, form });
    }
  };

  /**
   * One write of `value` to every location `candidates` names. An object literal is followed
   * into its own properties so `globalThis.foundry = { applications: {} }` is seen.
   */
  const checkWrite = (node, candidates, value, form) => {
    for (const candidate of candidates) {
      if (candidate.dynamic) {
        if (candidate.path.length === 0) report(node, "globalThis[<computed>]", `${form}, computed key`);
        continue;
      }
      const hit = classify(candidate.path);
      if (hit) {
        report(node, hit, form);
      } else if (value?.type === "ObjectExpression") {
        checkProperties(node, candidate, value, form);
      }
    }
  };

  /** Each property of an object literal written onto `base`; `valueOf` picks what is written. */
  const checkProperties = (node, base, literal, form, valueOf = (property) => property.value) => {
    for (const property of literal.properties) {
      if (property.type === "SpreadElement") {
        if (base.path.length === 0) report(node, "globalThis{...}", `${form}, spread`);
        continue;
      }
      const key = staticKey(property.key, property.computed);
      const next = key === undefined
        ? { path: base.path, dynamic: true }
        : { path: [...base.path, key], dynamic: false };
      checkWrite(node, [next], valueOf(property), form);
    }
  };

  /** `Object.assign(target, ...sources)` / `Object.defineProperties(target, props)`: keys from literals. */
  const checkMerge = (node, targets, sources, form, valueOf) => {
    for (const target of targets) {
      if (target.dynamic) continue;
      for (const source of sources) {
        if (source.type === "ObjectExpression") {
          checkProperties(node, target, source, form, valueOf);
        } else if (target.path.length === 0) {
          report(node, "globalThis{...}", `${form}, source is not an object literal`);
        }
      }
    }
  };

  walk(ast, (node) => {
    if (node.type === "AssignmentExpression") {
      const form = ASSIGNMENT_FORM(node.operator);
      const simple = node.left.type === "Identifier" || node.left.type === "MemberExpression";
      for (const target of targetsOf(node.left)) {
        checkWrite(node, resolve(target, aliases), simple ? node.right : undefined, form);
      }
    } else if ((node.type === "ForOfStatement" || node.type === "ForInStatement") && node.left.type !== "VariableDeclaration") {
      for (const target of targetsOf(node.left)) checkWrite(node, resolve(target, aliases), undefined, "loop target");
    } else if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier") {
      const owner = node.callee.object.name;
      const method = staticKey(node.callee.property, node.callee.computed);
      const [first, second, third] = node.arguments;
      if (!first) return;
      const targets = resolve(first, aliases).filter((t) => !t.dynamic);
      const form = `${owner}.${method}`;
      if ((owner === "Object" && method === "defineProperty") || (owner === "Reflect" && (method === "defineProperty" || method === "set"))) {
        const key = staticKey(second, true);
        const written = targets.map((t) => (key === undefined
          ? { path: t.path, dynamic: true }
          : { path: [...t.path, key], dynamic: false }));
        checkWrite(node, written, method === "set" ? third : descriptorValue(third), form);
      } else if (owner === "Object" && method === "assign") {
        checkMerge(node, targets, node.arguments.slice(1), form);
      } else if (owner === "Object" && method === "defineProperties") {
        checkMerge(node, targets, node.arguments.slice(1), form, (property) => descriptorValue(property.value));
      }
    }
  });

  return violations;
}
