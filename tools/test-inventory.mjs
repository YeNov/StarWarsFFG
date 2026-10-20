#!/usr/bin/env node
/**
 * Test-case inventory generator.
 *
 * Lists every active test case, every generated input case and every commented-out case across
 * the project's test layers, one row per case. Later audit work annotates the listing and
 * re-runs this script to reconcile it, so the enumeration has to be complete and the ids stable
 * for a given tree. Ids are positional: they are assigned in file-path order, then in the order
 * the cases appear within a file, and regenerate on every run.
 *
 * Usage:
 *   node tools/test-inventory.mjs [output-file] [--layers node,functional,playwright,cypress,scripts]
 *
 *   output-file  Where to write the Markdown listing. Without it the listing goes to stdout.
 *   --layers     The layers to enumerate (default: all of them).
 *
 * Exit code 0 = every requested layer enumerated. Anything else = at least one layer could not
 * be enumerated, or was found empty; nothing is written then, so a partial listing can never be
 * mistaken for a complete one.
 *
 * Layers (see docs/superpowers/plans/artifacts/2026-10-11-test-audit/README.md):
 *   node         `npm test`, enumerated through node:test's own run() so every generated case
 *                shows up individually.                                        -> runner
 *   functional   The Mocha suites the Foundry harness (tests/ffg-tests.js) registers, plus
 *                Codex's, collected through the starwarsffg.functionalTests hook. Each suite
 *                module is imported in Node and its registration function called with mocha's
 *                real Suite/Test; a module that cannot load outside Foundry is parsed from
 *                source instead.                                       -> dynamic | static
 *   playwright   `playwright test --list`.                                      -> runner
 *   cypress      Parsed from source; commented-out cases are listed too. -> static | commented-out
 *   scripts      Scripts that print output but assert nothing; paths only, no cases.
 *
 * No Foundry stubs are added to make a module import: a module that needs Foundry globals is
 * parsed statically, and its rows say so.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { run } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", ".git", ".idea", ".vscode", "dist", "coverage"]);

/** The harness files that register Mocha suites, and where else suites may sit unregistered. */
const FUNCTIONAL_REGISTRIES = ["tests/ffg-tests.js", "codex/tests/browser/index.js"];
const FUNCTIONAL_SUITE_DIRS = ["tests", "tests/v2-migration", "codex/tests/browser"];
/** Where Codex's registry is attached to the harness. Checked, not enumerated. */
const FUNCTIONAL_HOOK = {
  hook: "starwarsffg.functionalTests",
  file: "codex/scripts/codex-main.js",
  registry: "codex/tests/browser/index.js",
};

const CYPRESS_DIR = "cypress/e2e";
const CYPRESS_SUFFIX = ".cy.js";
const PLAYWRIGHT_DIR = "e2e";
const PLAYWRIGHT_SUFFIX = ".spec.js";

const SCRIPT_DIRS = ["tools", "tests", "docs/superpowers/plans/artifacts"];
const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

/** Test suites and the harness are not "scripts"; neither are the support folders. */
const isSuiteOrSupportFile = (rel) =>
  /\.test\.m?js$/.test(rel) ||
  rel === "tests/ffg-tests.js" ||
  /(^|\/)(_stub|_fixtures)\//.test(rel);

const LAYERS = ["node", "functional", "playwright", "cypress", "scripts"];
const LAYER_INFO = {
  node: {
    code: "N",
    title: "Node tests",
    how: "running `npm test`'s globs through `node:test`'s own `run()`, so each generated case is reported individually",
  },
  functional: {
    code: "F",
    title: "Foundry functional suites (Mocha)",
    how: "importing the suite modules that `tests/ffg-tests.js` registers (and Codex's, collected through the `starwarsffg.functionalTests` hook) and calling their registration functions against mocha's real `Suite` and `Test`, without running any test body",
  },
  playwright: { code: "P", title: "Playwright", how: "`playwright test --list`" },
  cypress: { code: "C", title: "Cypress", how: "parsing the spec source, because Cypress cannot list cases without running them" },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Repo-relative, forward-slash path. Refuses anything outside the repo. */
function rel(absolute) {
  const r = path.relative(REPO_ROOT, path.resolve(absolute)).split(path.sep).join("/");
  if (r === ".." || r.startsWith("../") || path.isAbsolute(r)) {
    throw new Error(`path outside the repository: ${r}`);
  }
  return r;
}

const abs = (relative) => path.join(REPO_ROOT, ...relative.split("/"));
const read = (relative) => fs.readFileSync(abs(relative), "utf8");
const exists = (relative) => fs.existsSync(abs(relative));

/** Plain code-unit order, so the listing does not depend on the machine's locale. */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Files directly in (or, with `recursive`, anywhere under) a repo-relative directory. */
function listFiles(dir, predicate, recursive = false) {
  if (!exists(dir)) return [];
  const found = [];
  const visit = (relDir) => {
    for (const entry of fs.readdirSync(abs(relDir), { withFileTypes: true })) {
      const relPath = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive && !SKIP_DIRS.has(entry.name)) visit(relPath);
      } else if (predicate(relPath)) {
        found.push(relPath);
      }
    }
  };
  visit(dir);
  return found.sort(byText);
}

/** Error text with this checkout's location removed. */
function sanitize(text) {
  const root = REPO_ROOT.split(path.sep).join("/");
  return String(text)
    .split(REPO_ROOT).join("<repo>")
    .split(root).join("<repo>")
    .split(pathToFileURL(REPO_ROOT).href).join("<repo>");
}

const firstLine = (text) => sanitize(String(text).split(/\r?\n/)[0]);

// ---------------------------------------------------------------------------
// Source scanner (static layers)
// ---------------------------------------------------------------------------

/**
 * Scan JavaScript source without parsing it.
 *
 * Returns `code` — the source with comment bodies and string/template/regex interiors replaced
 * by spaces (same length, newlines kept, quote characters kept), so call sites can be found
 * with a regex that cannot match inside a string or a comment, and every offset still points
 * into the original. `literals` maps the offset of an opening quote to the literal's text, and
 * `comments` records each comment's offset and body. A template literal's value is its raw text,
 * `${...}` placeholders included, because that is how a generated case family reads.
 *
 * Tolerant by design: the same scanner reads commented-out code, which may stop mid-statement.
 *
 * @returns {{code: string, literals: Map<number, {value: string, end: number}>,
 *            comments: Array<{start: number, end: number, text: string}>}}
 */
function scanSource(src) {
  const out = src.split("");
  const literals = new Map();
  const comments = [];
  const stack = [];
  const n = src.length;
  let i = 0;
  let lastSig = "";
  let lastWord = "";

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (src[k] !== "\n" && src[k] !== "\r") out[k] = " ";
  };
  const regexAfter = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">"]);
  const regexAfterWord = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

  const unescape = (text) =>
    text.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|.)/g, (_m, e) => {
      if (e[0] === "u" && e.length > 1) return String.fromCodePoint(parseInt(e.replace(/^u\{?|\}$/g, ""), 16));
      if (e[0] === "x" && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
      if (e === "n") return "\n";
      if (e === "t") return "\t";
      if (e === "r") return "\r";
      if (e === "\n" || e === "\r\n") return "";
      return e;
    });

  /** Read template text from `from`; stops at the closing backtick or at a `${`. */
  const readTemplate = (start, from) => {
    let k = from;
    while (k < n) {
      if (src[k] === "\\") {
        k += 2;
      } else if (src[k] === "`") {
        blank(from, k);
        literals.set(start, { value: src.slice(start + 1, k), end: k });
        lastSig = "`";
        return k + 1;
      } else if (src[k] === "$" && src[k + 1] === "{") {
        blank(from, k);
        stack.push({ template: true, start });
        lastSig = "{";
        return k + 2;
      } else {
        k++;
      }
    }
    blank(from, n);
    literals.set(start, { value: src.slice(start + 1), end: n });
    return n;
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      comments.push({ start: i, end, text: src.slice(i + 2, end) });
      blank(i, end);
      i = end;
    } else if (c === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      comments.push({ start: i, end, text: src.slice(i + 2, close === -1 ? n : close) });
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c && src[k] !== "\n") k += src[k] === "\\" ? 2 : 1;
      literals.set(i, { value: unescape(src.slice(i + 1, k)), end: k });
      blank(i + 1, k);
      i = src[k] === c ? k + 1 : k;
      lastSig = c;
    } else if (c === "`") {
      i = readTemplate(i, i + 1);
    } else if (c === "/" && (regexAfter.has(lastSig) || regexAfterWord.has(lastWord))) {
      let k = i + 1;
      let inClass = false;
      while (k < n && src[k] !== "\n") {
        if (src[k] === "\\") k += 2;
        else if (src[k] === "[") { inClass = true; k++; }
        else if (src[k] === "]") { inClass = false; k++; }
        else if (src[k] === "/" && !inClass) break;
        else k++;
      }
      blank(i + 1, k);
      i = k + 1;
      while (/[a-z]/i.test(src[i] ?? "")) i++;
      lastSig = "a";
      lastWord = "";
    } else if (/[A-Za-z_$]/.test(c)) {
      let k = i + 1;
      while (k < n && /[\w$]/.test(src[k])) k++;
      lastWord = src.slice(i, k);
      lastSig = "a";
      i = k;
    } else {
      if (c === "{") {
        stack.push({ template: false });
      } else if (c === "}") {
        const top = stack.pop();
        if (top?.template) {
          i = readTemplate(top.start, i + 1);
          continue;
        }
      }
      if (!/\s/.test(c)) {
        lastSig = c;
        lastWord = "";
      }
      i++;
    }
  }
  return { code: out.join(""), literals, comments };
}

/** The matching `}` for the `{` at `open`, searching comment-free `code`; -1 if unbalanced. */
function matchBrace(code, open) {
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === "{") depth++;
    else if (code[k] === "}" && --depth === 0) return k;
  }
  return -1;
}

/**
 * Read a call's first argument starting at `from`: a string/template literal, or — for code
 * that builds a title another way — the expression text up to the next top-level comma.
 *
 * @returns {{title: string, literal: boolean, end: number}}
 */
function readTitle(scan, src, from) {
  let k = from;
  while (/\s/.test(src[k] ?? "")) k++;
  const lit = scan.literals.get(k);
  if (lit) {
    let after = lit.end + 1;
    while (/\s/.test(src[after] ?? "")) after++;
    if (src[after] === "," || src[after] === ")") {
      return { title: lit.value, literal: true, end: lit.end + 1 };
    }
  }
  let depth = 0;
  let e = k;
  for (; e < src.length; e++) {
    const ch = scan.code[e];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) { if (depth === 0) break; depth--; }
    else if (ch === "," && depth === 0) break;
  }
  const expression = src.slice(k, e).replace(/\s+/g, " ").trim();
  return { title: `<non-literal title: ${expression}>`, literal: false, end: e };
}

// ---------------------------------------------------------------------------
// Static parsing: Mocha (functional layer fallback)
// ---------------------------------------------------------------------------

/**
 * Cases of a Mocha suite module written in this repo's registration style:
 *   const _suite = suiteInstance.create(suite, "Title");
 *   _suite.addTest(new Test("name", function () { ... }));
 * A case created in a loop keeps its `${...}` placeholders and is not expanded.
 */
function parseMochaSource(src) {
  const scan = scanSource(src);
  const suites = new Map();
  const suiteRe = /\b(?:const|let|var)\s+([\w$]+)\s*=\s*[\w$]+\.create\(\s*([\w$]+)\s*,/g;
  for (const m of scan.code.matchAll(suiteRe)) {
    suites.set(m[1], { parent: m[2], title: readTitle(scan, src, m.index + m[0].length).title });
  }
  const pathOf = (name) => {
    const trail = [];
    for (let v = name, guard = 0; suites.has(v) && guard < 20; v = suites.get(v).parent, guard++) {
      trail.unshift(suites.get(v).title);
    }
    return trail;
  };

  const cases = [];
  for (const m of scan.code.matchAll(/\b([\w$]+)\.addTest\(\s*new\s+[\w$.]+\(/g)) {
    const owner = m[1];
    const { title } = readTitle(scan, src, m.index + m[0].length);
    cases.push({ suite: suites.has(owner) ? pathOf(owner) : [`<unresolved suite: ${owner}>`], name: title });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Static parsing: Cypress
// ---------------------------------------------------------------------------

const CYPRESS_CALL_RE = /(?<![\w$.])(describe|context|xdescribe|xcontext|it|xit|specify|xspecify)(?:\.(skip|only))?\s*\(/g;

/** Suites (with the span of their callback body) and cases found in one piece of source. */
function findCypressCalls(src, { requireLiteral }) {
  const scan = scanSource(src);
  const suites = [];
  const cases = [];
  for (const m of scan.code.matchAll(CYPRESS_CALL_RE)) {
    const isSuite = /describe|context/.test(m[1]);
    const t = readTitle(scan, src, m.index + m[0].length);
    if (requireLiteral && !t.literal) continue;
    const skipped = m[1][0] === "x" || m[2] === "skip";
    if (isSuite) {
      const open = scan.code.indexOf("{", t.end);
      const close = open === -1 ? -1 : matchBrace(scan.code, open);
      if (close !== -1) suites.push({ title: t.title, open, close });
    } else {
      cases.push({ name: skipped ? `${t.title} [skipped]` : t.title, at: m.index });
    }
  }
  const trailAt = (at) => suites.filter((s) => s.open < at && at < s.close).map((s) => s.title);
  return { scan, cases: cases.map((c) => ({ ...c, suite: trailAt(c.at) })), trailAt };
}

/** Active and commented-out cases of one Cypress spec, in the order they appear in the file. */
function parseCypressSource(src) {
  const live = findCypressCalls(src, { requireLiteral: false });
  const found = live.cases.map((c) => ({ suite: c.suite, name: c.name, enumeration: "static", at: c.at }));
  for (const comment of live.scan.comments) {
    // Only a case with a literal title counts: prose such as "it (the sheet) ..." is not a test.
    const inner = findCypressCalls(comment.text, { requireLiteral: true });
    const outer = live.trailAt(comment.start);
    for (const c of inner.cases) {
      found.push({ suite: [...outer, ...c.suite], name: c.name, enumeration: "commented-out", at: comment.start + c.at });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// Layer: Node (runner)
// ---------------------------------------------------------------------------

/** The globs `npm test` passes to `node --test`, read from package.json so they cannot drift. */
function readNodeTestGlobs() {
  const script = JSON.parse(read("package.json")).scripts?.test ?? "";
  const m = /^node --test((?:\s+"[^"]+")+)\s*$/.exec(script);
  if (!m) {
    throw new Error(`package.json "test" script is no longer \`node --test "<glob>" ...\` (found: ${script}); teach tools/test-inventory.mjs the new shape`);
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((g) => g[1]);
}

/** A path as node:test names a file-level test: absolute, or relative to the working directory. */
const relativeName = (name) => path.relative(REPO_ROOT, path.resolve(REPO_ROOT, name)).split(path.sep).join("/");

async function enumerateNode() {
  const globs = readNodeTestGlobs();
  const stream = run({ globPatterns: globs, cwd: REPO_ROOT, concurrency: true });

  const perFile = new Map();
  const stateFor = (file) => {
    if (!perFile.has(file)) perFile.set(file, { stack: [], entries: [] });
    return perFile.get(file);
  };
  let runnerTotal = null;
  // Why a file failed to load is only in what it wrote to stderr; keep its first error line.
  const loadError = new Map();

  for await (const { type, data } of stream) {
    if (type === "test:start") {
      const st = stateFor(rel(data.file));
      if (st.stack.length < data.nesting) {
        throw new Error(`node:test reported "${data.name}" at depth ${data.nesting} with no parent`);
      }
      st.stack.length = data.nesting;
      st.entries.push({ nesting: data.nesting, name: data.name, line: data.line, column: data.column, suite: [...st.stack], done: false });
      st.stack.push(data.name);
    } else if (type === "test:pass" || type === "test:fail") {
      const st = stateFor(rel(data.file));
      const entry = st.entries.find((e) => !e.done && e.nesting === data.nesting && e.name === data.name && e.line === data.line && e.column === data.column);
      if (!entry) throw new Error(`node:test reported a result for "${data.name}" that never started`);
      entry.done = true;
      entry.kind = data.details?.type ?? "test";
      entry.failed = type === "test:fail";
      entry.skip = data.skip !== undefined && data.skip !== false;
      entry.todo = data.todo !== undefined && data.todo !== false;
      entry.error = data.details?.error;
    } else if (type === "test:stderr") {
      const file = rel(data.file);
      const line = /^\s*[A-Za-z]*Error\b.*/m.exec(data.message)?.[0].trim();
      if (line && !loadError.has(file)) loadError.set(file, line);
    } else if (type === "test:diagnostic" && data.nesting === 0) {
      const t = /^tests (\d+)$/.exec(data.message);
      if (t) runnerTotal = Number(t[1]);
    }
  }

  if (perFile.size === 0) throw new Error(`node:test found no files for ${globs.join(" ")}`);

  const rows = [];
  let counted = 0;
  for (const file of [...perFile.keys()].sort(byText)) {
    const { entries } = perFile.get(file);
    const unfinished = entries.find((e) => !e.done);
    if (unfinished) throw new Error(`${file}: "${unfinished.name}" never reported a result`);

    // A file with no tests, or one that fails to load, is reported as a single test named
    // after the file itself.
    const isFileEntry = (e) => e.nesting === 0 && e.line === 1 && e.column === 1 && relativeName(e.name) === file;
    const fileEntry = entries.find(isFileEntry);
    if (fileEntry?.failed) {
      throw new Error(`${file} failed to load: ${firstLine(loadError.get(file) ?? "no error text on stderr")}`);
    }
    const cases = entries.filter((e) => e.kind === "test" && !isFileEntry(e));
    counted += entries.filter((e) => e.kind === "test").length;
    if (cases.length === 0) {
      rows.push({ file, suite: [], name: "(no cases in this file)", enumeration: "runner", empty: true });
    }
    for (const e of cases) {
      const flags = [e.skip ? "skipped" : "", e.todo ? "todo" : ""].filter(Boolean);
      rows.push({ file, suite: e.suite, name: flags.length ? `${e.name} [${flags.join(", ")}]` : e.name, enumeration: "runner", failing: e.failed });
    }
  }

  if (runnerTotal === null) throw new Error("node:test did not report a tally to check the listing against");
  if (runnerTotal !== counted) throw new Error(`the runner tallied ${runnerTotal} tests but ${counted} were listed`);
  const notes = [`The runner's own tally (\`tests ${runnerTotal}\`) equals the number of tests listed.`];
  const failing = rows.filter((r) => r.failing).length;
  if (failing) notes.push(`${failing} case(s) failed when the runner executed them; they are still listed.`);
  return { rows, files: [...perFile.keys()], notes };
}

// ---------------------------------------------------------------------------
// Layer: Foundry functional suites (Mocha)
// ---------------------------------------------------------------------------

/** What a harness file registers: the suite modules it imports and the functions it calls. */
function readRegistry(registry) {
  const src = read(registry);
  const scan = scanSource(src);
  const imports = new Map();
  for (const m of scan.code.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*(?=["'])/g)) {
    const spec = scan.literals.get(m.index + m[0].length)?.value;
    if (!spec?.startsWith(".") || !spec.endsWith(".test.js")) continue; // suite modules only, not the runner
    const target = rel(path.resolve(path.dirname(abs(registry)), spec));
    for (const name of m[1].split(",").map((s) => s.trim()).filter(Boolean)) imports.set(name, target);
  }
  const called = new Set();
  const registered = [];
  // A registry calls each suite with (suite, suiteInstance, Test, chai), plus the run's harness.
  for (const m of scan.code.matchAll(/(?<![\w$.])([\w$]+)\(\s*suite\s*,\s*suiteInstance\s*,\s*Test\s*,\s*chai\s*(?:,\s*harness\s*)?\)/g)) {
    called.add(m[1]);
    if (imports.has(m[1])) registered.push({ fn: m[1], file: imports.get(m[1]) });
  }
  // tests/ffg-tests.js lists its suites as ["ExportName", () => import("./file.js")] instead.
  for (const m of scan.code.matchAll(/\[\s*(["'])[ ]*\1\s*,\s*\(\s*\)\s*=>\s*import\s*\(\s*(?=["'])/g)) {
    const fn = scan.literals.get(m.index + m[0].indexOf(m[1]))?.value;
    const spec = scan.literals.get(m.index + m[0].length)?.value;
    if (fn && spec?.startsWith(".")) registered.push({ fn, file: rel(path.resolve(path.dirname(abs(registry)), spec)) });
  }
  const neverCalled = [...imports.keys()].filter((name) => !called.has(name));
  return { registered, neverCalled };
}

/** Collect one suite module's cases by running its registration function against real mocha. */
async function collectDynamic(Mocha, chai, { fn, file }) {
  const mod = await import(pathToFileURL(abs(file)).href);
  if (typeof mod[fn] !== "function") throw new Error(`${file} does not export ${fn}`);
  const root = new Mocha.Suite("Functional Tests");
  await mod[fn](root, Mocha.Suite, Mocha.Test, chai);
  const cases = [];
  const visit = (suite, trail) => {
    for (const t of suite.tests) cases.push({ suite: trail, name: t.pending ? `${t.title} [pending]` : t.title });
    for (const child of suite.suites) visit(child, [...trail, child.title]);
  };
  visit(root, []);
  return cases;
}

async function enumerateFunctional() {
  const Mocha = require("mocha");
  const chai = require("chai");

  const registered = [];
  const notes = [];
  for (const registry of FUNCTIONAL_REGISTRIES) {
    const r = readRegistry(registry);
    if (r.registered.length === 0) throw new Error(`${registry} registers no suites; its call shape probably changed`);
    registered.push(...r.registered);
    if (r.neverCalled.length) notes.push(`${registry} imports but never calls: ${r.neverCalled.join(", ")}.`);
  }

  const hookLiterals = [...scanSource(read(FUNCTIONAL_HOOK.file)).literals.values()].map((l) => l.value);
  const wired = hookLiterals.includes(FUNCTIONAL_HOOK.hook) &&
    hookLiterals.some((v) => v.startsWith(".") && path.posix.join(path.posix.dirname(FUNCTIONAL_HOOK.file), v) === FUNCTIONAL_HOOK.registry);
  notes.push(wired
    ? `\`${FUNCTIONAL_HOOK.file}\` attaches \`${FUNCTIONAL_HOOK.registry}\` to the \`${FUNCTIONAL_HOOK.hook}\` hook.`
    : `WARNING: \`${FUNCTIONAL_HOOK.file}\` no longer attaches \`${FUNCTIONAL_HOOK.registry}\` to the \`${FUNCTIONAL_HOOK.hook}\` hook, so the Codex suites never run in the harness.`);

  const registeredFiles = new Set(registered.map((r) => r.file));
  const unregistered = FUNCTIONAL_SUITE_DIRS
    .flatMap((dir) => listFiles(dir, (p) => p.endsWith(".test.js")))
    .filter((f) => !registeredFiles.has(f));
  notes.push(unregistered.length
    ? `Not registered by any harness file (enumerated anyway): ${unregistered.map((f) => `\`${f}\``).join(", ")}.`
    : "Every `*.test.js` suite file in the suite directories is registered by a harness file.");

  const rows = [];
  const fallbacks = [];
  const targets = [...registered, ...unregistered.map((file) => ({ fn: null, file }))];
  for (const target of targets) {
    if (!exists(target.file)) throw new Error(`${target.file} is registered but missing`);
    let cases;
    let enumeration = "dynamic";
    try {
      if (!target.fn) throw new Error("not registered, so there is no function to call");
      cases = await collectDynamic(Mocha, chai, target);
    } catch (err) {
      if (/does not export/.test(err.message)) throw err;
      enumeration = "static";
      cases = parseMochaSource(read(target.file));
      fallbacks.push({ file: target.file, reason: firstLine(err.message) });
    }
    if (cases.length === 0) {
      rows.push({ file: target.file, suite: [], name: "(no cases in this file)", enumeration, empty: true });
    }
    for (const c of cases) rows.push({ file: target.file, suite: c.suite, name: c.name, enumeration });
  }

  if (fallbacks.length) {
    const families = rows.filter((r) => r.enumeration === "static" && r.name.includes("${")).length;
    notes.push(`Parsed statically because the module cannot be imported or registered outside Foundry. A case generated in a loop is one row here with its \`\${...}\` placeholder unexpanded (${families} such rows), so these files hold more cases than rows:`);
    for (const f of fallbacks) notes.push(`  - \`${f.file}\` (${f.reason})`);
  }
  return { rows, files: targets.map((t) => t.file), notes };
}

// ---------------------------------------------------------------------------
// Layer: Playwright (runner)
// ---------------------------------------------------------------------------

function enumeratePlaywright() {
  const cli = require.resolve("@playwright/test/cli");
  const res = spawnSync(process.execPath, [cli, "test", "--list", "--reporter=json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error) throw new Error(`could not start playwright: ${sanitize(res.error.message)}`);
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    throw new Error(`playwright --list produced no JSON (exit ${res.status}): ${firstLine(res.stderr || res.stdout)}`);
  }
  if (res.status !== 0 || report.errors?.length) {
    throw new Error(`playwright --list failed (exit ${res.status}): ${firstLine(report.errors?.[0]?.message ?? res.stderr)}`);
  }

  const rows = [];
  const withCases = new Set();
  const visit = (suite, trail) => {
    for (const spec of suite.specs ?? []) {
      const file = rel(path.resolve(report.config.rootDir, spec.file));
      withCases.add(file);
      rows.push({ file, suite: trail, name: spec.title, enumeration: "runner", at: spec.line * 1000 + spec.column });
    }
    for (const child of suite.suites ?? []) visit(child, [...trail, child.title]);
  };
  // Each top-level suite is a file and is titled with its name; only describe blocks below it form a path.
  for (const fileSuite of report.suites) visit(fileSuite, []);

  const onDisk = listFiles(PLAYWRIGHT_DIR, (p) => p.endsWith(PLAYWRIGHT_SUFFIX), true);
  for (const file of onDisk.filter((f) => !withCases.has(f))) {
    rows.push({ file, suite: [], name: "(no cases in this file)", enumeration: "runner", empty: true });
  }
  rows.sort((a, b) => byText(a.file, b.file) || (a.at ?? 0) - (b.at ?? 0));
  const projects = report.config.projects.map((p) => p.name).join(", ");
  return {
    rows,
    files: [...new Set([...onDisk, ...withCases])].sort(byText),
    notes: [`Listed once per case, not once per project (projects: ${projects}).`],
  };
}

// ---------------------------------------------------------------------------
// Layer: Cypress (static)
// ---------------------------------------------------------------------------

function enumerateCypress() {
  const files = listFiles(CYPRESS_DIR, (p) => p.endsWith(CYPRESS_SUFFIX), true);
  const rows = [];
  for (const file of files) {
    const found = parseCypressSource(read(file));
    if (found.length === 0) rows.push({ file, suite: [], name: "(no cases in this file)", enumeration: "static", empty: true });
    for (const c of found) rows.push({ file, suite: c.suite, name: c.name, enumeration: c.enumeration });
  }
  return {
    rows,
    files,
    notes: ["`commented-out` rows are cases inside a comment: they do not run. A case's name is read from its `it(...)` title; commented-out cases keep the suite they sat in."],
  };
}

// ---------------------------------------------------------------------------
// Layer: scripts that print but assert nothing
// ---------------------------------------------------------------------------

function enumerateScripts() {
  const printRe = /\bconsole\.(?:log|info|warn|error|table|dir)\s*\(|\bprocess\.(?:stdout|stderr)\.write\s*\(/;
  const scripts = SCRIPT_DIRS
    .flatMap((dir) => listFiles(dir, (p) => SCRIPT_EXTENSIONS.has(path.extname(p)) && !isSuiteOrSupportFile(p), true))
    .filter((file) => printRe.test(scanSource(read(file)).code));
  if (scripts.length === 0) throw new Error(`no printing scripts found under ${SCRIPT_DIRS.join(", ")}`);
  return { scripts: [...new Set(scripts)].sort(byText) };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Inline code span that survives pipes, backticks and newlines in the text. */
function span(text) {
  const t = String(text).replace(/\r?\n/g, "\\n").replace(/\|/g, "\\|");
  if (t === "") return "";
  const longest = Math.max(0, ...[...t.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = t.startsWith("`") || t.endsWith("`") ? " " : "";
  return `${fence}${pad}${t}${pad}${fence}`;
}

function git(args) {
  const res = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : null;
}

function describeCommit(outputRel) {
  const sha = git(["rev-parse", "--short=8", "HEAD"]);
  if (!sha) return "unknown (not a git checkout)";
  const dirty = (git(["status", "--porcelain"]) ?? "")
    .split("\n")
    .filter(Boolean)
    .filter((line) => line.slice(3).replace(/"/g, "") !== outputRel);
  return dirty.length ? `${sha} (working tree had uncommitted changes)` : sha;
}

function render(results, outputRel) {
  const lines = [];
  const counts = [];

  for (const layer of LAYERS.filter((l) => l !== "scripts" && results[l])) {
    const { rows, files } = results[layer];
    const real = rows.filter((r) => !r.empty);
    const tally = (e) => real.filter((r) => r.enumeration === e).length;
    counts.push(`| ${LAYER_INFO[layer].code} | ${LAYER_INFO[layer].title} | ${files.length} | ${real.length} | ${tally("runner")} | ${tally("dynamic")} | ${tally("static")} | ${tally("commented-out")} |`);
  }

  lines.push("# Test-case inventory", "");
  lines.push("Generated by `tools/test-inventory.mjs`; see [README.md](README.md) for how to regenerate it and what the columns mean. **Ids are positional**: they are assigned in file-path order, then in the order cases appear in the file, so they regenerate on every run and shift when a case is added or removed. Cite an id only together with the commit above.", "");
  lines.push("| | |", "| --- | --- |");
  lines.push(`| Generated | ${new Date().toISOString().slice(0, 10)} |`);
  lines.push(`| Commit | ${describeCommit(outputRel)} |`);
  lines.push(`| Node | ${process.version} |`);
  lines.push("");
  lines.push("| Code | Layer | Files | Cases | runner | dynamic | static | commented-out |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  lines.push(...counts);
  if (results.scripts) {
    lines.push("", `Scripts that print output and assert nothing: ${results.scripts.scripts.length} (listed at the end; they have no cases and no ids).`);
  }

  for (const layer of LAYERS.filter((l) => l !== "scripts" && results[l])) {
    const { code, title, how } = LAYER_INFO[layer];
    const { rows, notes } = results[layer];
    lines.push("", `## ${code}: ${title}`, "", `Enumerated by ${how}.`, "");
    for (const note of notes ?? []) lines.push(note.startsWith("  - ") ? note : `- ${note}`);
    lines.push("", "| id | file | suite path | case name | enumeration |", "| --- | --- | --- | --- | --- |");
    let n = 0;
    for (const r of rows) {
      const id = r.empty ? "-" : `${code}${String(++n).padStart(4, "0")}`;
      lines.push(`| ${id} | ${span(r.file)} | ${span(r.suite.join(" › "))} | ${r.empty ? r.name : span(r.name)} | ${r.enumeration} |`);
    }
  }

  if (results.scripts) {
    lines.push("", "## Not automated tests", "",
      "Scripts under `tools/`, `tests/` and `docs/superpowers/plans/artifacts/` that print output. They check nothing by themselves, so they are neither cases nor counted above. Path only.", "");
    for (const s of results.scripts.scripts) lines.push(`- ${span(s)}`);
  }

  return `${lines.join("\n")}\n`;
}

/** The listing is committed to a public repository: refuse to emit anything machine-specific. */
function assertNoPrivateText(text) {
  const checks = [
    [/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/, "a drive-letter path"],
    [/(^|[\s"'`(])\/(?:Users|home)\//, "a home-directory path"],
    [/[\w.+-]+@[\w-]+\.[\w.-]+/, "an email address"],
  ];
  const root = REPO_ROOT.split(path.sep).join("/");
  const bad = text.split("\n").map((line, i) => {
    const hit = line.includes(REPO_ROOT) || line.includes(root) ? "this checkout's location" : checks.find(([re]) => re.test(line))?.[1];
    return hit ? `line ${i + 1}: ${hit}` : null;
  }).filter(Boolean);
  if (bad.length) {
    throw new Error(`refusing to write a listing that contains private text (${bad.slice(0, 5).join("; ")})`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ENUMERATORS = {
  node: enumerateNode,
  functional: enumerateFunctional,
  playwright: enumeratePlaywright,
  cypress: enumerateCypress,
  scripts: enumerateScripts,
};

async function main(argv) {
  const layerIdx = argv.indexOf("--layers");
  const layers = layerIdx === -1 ? LAYERS : (argv[layerIdx + 1] ?? "").split(",").filter(Boolean);
  const unknown = layers.filter((l) => !LAYERS.includes(l));
  if (unknown.length || layers.length === 0) {
    process.stderr.write(`unknown layer(s): ${unknown.join(", ") || "(none given)"}; choose from ${LAYERS.join(", ")}\n`);
    return 2;
  }
  const positional = argv.filter((a, i) => !a.startsWith("--") && (layerIdx === -1 || i !== layerIdx + 1));
  const strayFlags = argv.filter((a) => a.startsWith("--") && a !== "--layers");
  if (strayFlags.length || positional.length > 1) {
    process.stderr.write("usage: node tools/test-inventory.mjs [output-file] [--layers node,functional,playwright,cypress,scripts]\n");
    return 2;
  }
  const outputPath = positional[0] ? path.resolve(positional[0]) : null;

  // The test modules sit in a package with no "type": Node warns about each one it re-parses.
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const code = typeof rest[0] === "object" ? rest[0]?.code : rest[1];
    if (code !== "MODULE_TYPELESS_PACKAGE_JSON") emit.call(process, warning, ...rest);
  };

  const results = {};
  const failures = [];
  for (const layer of layers) {
    try {
      const result = await ENUMERATORS[layer]();
      if (layer !== "scripts") {
        if (result.rows.filter((r) => !r.empty).length === 0) throw new Error("no cases found");
        // Array#sort is stable, so cases keep the order they have within their file.
        result.rows.sort((a, b) => byText(a.file, b.file));
      }
      results[layer] = result;
    } catch (err) {
      failures.push(`${layer}: ${firstLine(err.message)}`);
    }
  }
  if (failures.length) {
    process.stderr.write(`test-inventory: could not enumerate\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
    return 1;
  }

  const outputRel = outputPath ? rel(outputPath) : null;
  let text;
  try {
    text = render(results, outputRel);
    assertNoPrivateText(text);
  } catch (err) {
    process.stderr.write(`test-inventory: ${sanitize(err.message)}\n`);
    return 1;
  }

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, text);
  } else {
    process.stdout.write(text);
  }
  const summary = layers
    .filter((l) => l !== "scripts")
    .map((l) => `${l} ${results[l].rows.filter((r) => !r.empty).length}`);
  if (results.scripts) summary.push(`scripts ${results.scripts.scripts.length}`);
  process.stderr.write(`test-inventory: ${summary.join(", ")}${outputRel ? ` -> ${outputRel}` : ""}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
