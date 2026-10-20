/**
 * system.json's esmodules (modules/dice-pool-ffg.js, modules/swffg-main.js and
 * codex/scripts/codex-main.js, then a vendored library) are each loaded as their own
 * <script type="module">: separate roots of the module graph, evaluated in that order.
 *
 * modules/swffg-main.js builds globalThis.starwarsffg from classes it imports (ActorSheetFFG,
 * ffgSettings, ...) while it is being evaluated, and some modules in its own import graph import it
 * back (modules/actors/actor-sheet-ffg.js does). That cycle is safe only while swffg-main.js is the
 * first module of it to be entered. If an esmodule listed BEFORE it ever reached swffg-main.js
 * through static imports, swffg-main.js would be evaluated in the middle of the cycle with those
 * classes still in their temporal dead zone, and the whole system would fail to load with a
 * ReferenceError -- something no other test, and not `npm run check:imports`, would notice.
 *
 * So this walks the static imports (import ... from, a bare import, export ... from) of every
 * esmodule listed before modules/swffg-main.js, and fails, printing the chain, if the walk reaches
 * it. A dynamic import() is not followed: it evaluates later, from a root of its own. An import the
 * walk cannot place in this repository (a bare specifier, an absolute path outside the system)
 * fails the walk rather than being skipped, because it could be hiding the edge.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Canonical paths, so one file reached by two spellings (or by a different case on Windows) is one file.
const canonical = (file) => fs.realpathSync.native(file);
const ROOT = canonical(fileURLToPath(new URL("../../", import.meta.url)));
const SYSTEM_MAIN = "modules/swffg-main.js";
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
/** How Foundry serves this system's own files; an import may name one by this absolute path. */
const SERVED = `/systems/${manifest.id}/`;
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");

// ---------------------------------------------------------------------------
// Reading the static imports of a script
// ---------------------------------------------------------------------------

/** A "/" opens a regex literal, not a division, when the token before it is one of these. */
const REGEX_AFTER = new Set([
  "", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">",
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await",
]);

/** Where the regex literal opening at `start` ends (exclusive), or -1 when it does not close on its line. */
function regexEnd(source, start) {
  let inClass = false;
  for (let at = start + 1; at < source.length && source[at] !== "\n"; at++) {
    if (source[at] === "\\") at++;
    else if (source[at] === "[") inClass = true;
    else if (source[at] === "]") inClass = false;
    else if (source[at] === "/" && !inClass) return at + 1;
  }
  return -1;
}

/**
 * `source` with everything that is not code blanked out -- comments, and the inside of string,
 * template and regex literals -- so that a pattern cannot match text that merely looks like an
 * import. Offsets are kept, and so is the value of each string literal, by its opening quote.
 */
function scanCode(source) {
  const code = source.split("");
  const literals = new Map();
  const blank = (from, to) => {
    for (let at = from; at < Math.min(to, source.length); at++) if (code[at] !== "\n") code[at] = " ";
  };

  // Scans code from `start`. For the expression in a template's ${ ... }, stops after its closing brace.
  const scan = (start, inTemplate) => {
    let at = start;
    let depth = 0;
    let previous = ""; // the previous token: a word, or one punctuation character
    while (at < source.length) {
      const c = source[at];

      if (c === "/" && source[at + 1] === "/") {
        const end = source.indexOf("\n", at);
        const stop = end === -1 ? source.length : end;
        blank(at, stop);
        at = stop;
        continue;
      }
      if (c === "/" && source[at + 1] === "*") {
        const end = source.indexOf("*/", at + 2);
        const stop = end === -1 ? source.length : end + 2;
        blank(at, stop);
        at = stop;
        continue;
      }
      if (c === '"' || c === "'") {
        let end = at + 1;
        let value = "";
        while (end < source.length && source[end] !== c && source[end] !== "\n") {
          if (source[end] === "\\") end++;
          value += source[end] ?? "";
          end++;
        }
        if (source[end] === c) {
          literals.set(at, value);
          blank(at + 1, end);
          previous = c;
          at = end + 1;
        } else {
          at++; // an unterminated quote: carry on as code
        }
        continue;
      }
      if (c === "`") {
        let end = at + 1;
        while (end < source.length && source[end] !== "`") {
          if (source[end] === "\\") end += 2;
          else if (source[end] === "$" && source[end + 1] === "{") end = scan(end + 2, true);
          else end++;
        }
        blank(at + 1, end);
        previous = c;
        at = end + 1;
        continue;
      }
      if (c === "/" && REGEX_AFTER.has(previous)) {
        const end = regexEnd(source, at);
        if (end !== -1) {
          blank(at, end);
          previous = "regex";
          at = end;
          continue;
        }
      }
      if (/[\w$]/.test(c)) {
        let end = at + 1;
        while (end < source.length && /[\w$]/.test(source[end])) end++;
        previous = source.slice(at, end);
        at = end;
        continue;
      }

      if (c === "}" && inTemplate && depth === 0) return at + 1;
      if (c === "{") depth++;
      if (c === "}") depth--;
      if (!/\s/.test(c)) previous = c;
      at++;
    }
    return at;
  };

  scan(0, false);
  return { code: code.join(""), literals };
}

/** `import ... from "x"` and `export ... from "x"`: no semicolon can sit between the keyword and `from`. */
const FROM_CLAUSE = /\b(?:import|export)\b[^;]*?\bfrom\s*(["'])/gd;
/** `import "x"`, which only runs the module. */
const BARE_IMPORT = /\bimport\s*(["'])/gd;

/** The specifiers of the static imports in a script, in no particular order. */
function staticSpecifiers(source) {
  const { code, literals } = scanCode(source);
  const found = new Map(); // opening quote -> specifier, so a literal matched by both patterns counts once
  for (const pattern of [FROM_CLAUSE, BARE_IMPORT]) {
    for (const match of code.matchAll(pattern)) {
      const quote = match.indices[1][0];
      if (literals.has(quote)) found.set(quote, literals.get(quote));
    }
  }
  return [...found.values()];
}

// ---------------------------------------------------------------------------
// Walking the graph
// ---------------------------------------------------------------------------

/** The file a static import specifier names; throws when it names nothing the walk can read. */
function resolveImport(from, specifier) {
  const bare = specifier.replace(/[?#].*$/, "");
  let target;
  if (bare.startsWith("./") || bare.startsWith("../")) {
    target = path.resolve(path.dirname(from), bare);
  } else if (bare.startsWith(SERVED)) {
    target = path.join(ROOT, bare.slice(SERVED.length));
  } else {
    throw new Error(
      `${rel(from)} imports "${specifier}", which the walk cannot place in this repository ` +
      "(a bare or foreign absolute specifier); teach tests/node/esmodule-load-order.test.mjs to resolve it",
    );
  }
  if (!fs.existsSync(target)) throw new Error(`${rel(from)} imports "${specifier}", which does not exist`);
  return canonical(target);
}

/**
 * Every file `entry` reaches through static imports, each mapped to the file that first imported it
 * (breadth first, so a chain read back from the map is a shortest one). With `stopAt`, the walk ends
 * the moment it reaches that file: what lies beyond it does not matter, and need not be resolvable.
 */
function reachableFrom(entry, stopAt) {
  const start = canonical(entry);
  const importedBy = new Map([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const specifier of staticSpecifiers(fs.readFileSync(file, "utf8"))) {
      const target = resolveImport(file, specifier);
      if (importedBy.has(target)) continue;
      importedBy.set(target, file);
      if (target === stopAt) return importedBy;
      queue.push(target);
    }
  }
  return importedBy;
}

/** The files from the walk's entry to `file`, entry first. */
function chainTo(importedBy, file) {
  const chain = [];
  for (let at = file; at; at = importedBy.get(at)) chain.unshift(at);
  return chain;
}

/** The esmodules system.json loads ahead of modules/swffg-main.js. */
function esmodulesBeforeMain() {
  const at = manifest.esmodules.indexOf(SYSTEM_MAIN);
  assert.ok(at >= 0, `system.json does not load ${SYSTEM_MAIN}`);
  return manifest.esmodules.slice(0, at).map((entry) => path.join(ROOT, entry));
}

const mainFile = () => canonical(path.join(ROOT, SYSTEM_MAIN));

// ---------------------------------------------------------------------------
// The load order
// ---------------------------------------------------------------------------

test("system.json loads modules/swffg-main.js", () => {
  assert.ok(manifest.esmodules.includes(SYSTEM_MAIN), `system.json esmodules no longer lists ${SYSTEM_MAIN}`);
});

test("no esmodule listed before modules/swffg-main.js reaches it through static imports", () => {
  const main = mainFile();
  const chains = [];
  for (const entry of esmodulesBeforeMain()) {
    const importedBy = reachableFrom(entry, main);
    if (importedBy.has(main)) chains.push(chainTo(importedBy, main).map(rel).join("\n      -> "));
  }
  assert.equal(
    chains.length, 0,
    `${SYSTEM_MAIN} is reached by static imports from an esmodule that system.json loads before it, ` +
    "so it would be evaluated in the middle of its own import cycles, with the classes it publishes " +
    `still uninitialised:\n    ${chains.join("\n\n    ")}\n` +
    "Import it lazily with import(), or have system.json load that esmodule after it.",
  );
});

test("at least one static import is followed from the esmodules loaded before swffg-main.js", () => {
  const entries = esmodulesBeforeMain();
  assert.ok(
    entries.length > 0,
    `system.json lists nothing before ${SYSTEM_MAIN}, so there is nothing to walk; ` +
    "if it now loads first, this guard is no longer needed",
  );
  const main = mainFile();
  const visited = new Set(entries.flatMap((entry) => [...reachableFrom(entry, main).keys()]));
  assert.ok(
    visited.size > entries.length,
    `the walk from ${entries.map(rel).join(", ")} found no static import to follow`,
  );
});

// ---------------------------------------------------------------------------
// The walk itself must still be able to fail
// ---------------------------------------------------------------------------

/** Run `fn` on a throwaway tree of the given files, which never touches the repository. */
function withTree(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swffg-load-order-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), source);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("the walk finds a module reached through a chain of static imports, and not through import()", () => {
  withTree({
    "entry.js": 'import { mid } from "./sub/mid.js";\nawait import("./lazy.js");\n',
    "sub/mid.js": 'export * from "../target.js";\n',
    "target.js": "export const target = 1;\n",
    "lazy.js": "export const lazy = 1;\n",
  }, (root) => {
    const importedBy = reachableFrom(path.join(root, "entry.js"));
    const chain = chainTo(importedBy, canonical(path.join(root, "target.js"))).map((file) => path.relative(canonical(root), file));
    assert.deepEqual(chain, ["entry.js", path.join("sub", "mid.js"), "target.js"]);
    assert.equal(importedBy.has(canonical(path.join(root, "lazy.js"))), false, "import() must not be followed");
  });
});

test("the walk refuses an import it cannot place instead of skipping it", () => {
  for (const specifier of ["lodash", "/scripts/foundry.mjs", "node:fs", "./missing.js"]) {
    withTree({ "entry.js": `import "${specifier}";\n` }, (root) => {
      assert.throws(() => reachableFrom(path.join(root, "entry.js")), (error) => error.message.includes(specifier), specifier);
    });
  }
});

// ---------------------------------------------------------------------------
// The import scan
// ---------------------------------------------------------------------------

test("the import scan reads every kind of static import", () => {
  const cases = [
    ['import a from "./a.js";', ["./a.js"]],
    ["import { b, c as d } from './b.js';", ["./b.js"]],
    ['import * as e from "./c.js";', ["./c.js"]],
    ['import "./d.js";', ["./d.js"]],
    ['import f, {\n  g,\n} from "./e.js";', ["./e.js"]],
    ['export { h } from "./f.js";', ["./f.js"]],
    ['export * from "./g.js";', ["./g.js"]],
    ['export * as i from "./h.js";', ["./h.js"]],
    ['import j from "./i.json" with { type: "json" };', ["./i.json"]],
    ['import { "k-name" as k } from "./j.js";', ["./j.js"]],
    ['import a from "./a.js"\nimport "./b.js"\nexport * from "./c.js"', ["./a.js", "./b.js", "./c.js"]],
    ['const total = 4 / 2;\nimport l from "./k.js";', ["./k.js"]],
    ['const quote = /"/;\nimport m from "./l.js";', ["./l.js"]],
    ['const text = `${"{"} }`;\nimport n from "./m.js";', ["./m.js"]],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(staticSpecifiers(source).sort(), expected, source);
  }
});

test("the import scan ignores what only looks like an import", () => {
  const cases = [
    '// import a from "./a.js";',
    '/* import a from "./a.js"; */',
    '/*\n * import a from "./a.js";\n */',
    "const s = 'import a from \"./a.js\"';",
    'const s = "import a from \'./a.js\'";',
    'const s = `import a from "./a.js"`;',
    'const s = `${"x"} import a from "./a.js" ${`y`}`;',
    'const r = /import a from "x"/;',
    'await import("./a.js");',
    "const m = import.meta.url;",
    'const o = { import: 1, from: "./a.js" };',
    'const f = Array.from("abc");',
  ];
  for (const source of cases) {
    assert.deepEqual(staticSpecifiers(source), [], source);
  }
});
