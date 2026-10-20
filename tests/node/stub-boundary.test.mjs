/**
 * The stub-boundary meta-test (plan §0.6.6) — MANDATORY.
 *
 * Why this exists even under default (per-file child-process) isolation: isolation already
 * prevents cross-FILE leakage. This test's real job is different — it stops someone from
 * quietly widening the stub to force a poisoned legacy module through and then claiming Node
 * coverage for it.
 *
 * It does three things:
 *   1. Declares the EXACT allowlist of globals the stub may install.
 *   2. Scans every file under `tests/node/` and `codex/tests/node/` — including `_stub/`, the
 *      scanner and this file — for code that installs a forbidden global or path. The scan reads
 *      the syntax tree (`_guard/forbidden-installs.mjs`), so it tells code from comments and
 *      strings and sees `??=`, `||=`, `&&=`, bracket writes and the `Object.*` / `Reflect.*`
 *      write calls. The fixtures below keep that scanner honest: each forbidden form must be
 *      detected, and comments, strings and the allowed utility assignments must not be.
 *   3. Re-asserts the live global surface at runtime after importing the stub.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./_stub/foundry-stub.mjs";
import { scanSource } from "./_guard/forbidden-installs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
/** Codex II's Node tests: `npm test` runs them too while Codex ships inside the system. */
const CODEX_NODE_TESTS = path.join(ROOT, "codex", "tests", "node");

// ---------------------------------------------------------------------------
// 1. The exact allowlist
// ---------------------------------------------------------------------------

/** The only global names the stub may install. */
const ALLOWED_GLOBALS = ["foundry", "CONFIG", "CONST", "game"];

/** The only property the stub may hang off each allowed global, exactly. */
const ALLOWED_SHAPE = {
  foundry: ["utils"],
  "foundry.utils": [
    "randomID", "deepClone", "mergeObject", "duplicate", "getProperty", "setProperty", "isEmpty",
  ],
  CONFIG: ["FFG", "logger"],
  "CONFIG.FFG": ["characterCreator"],
  "CONFIG.logger": ["debug", "warn", "error", "log"],
  CONST: ["DOCUMENT_OWNERSHIP_LEVELS"],
  game: ["user", "users", "settings", "i18n"],
  "game.users": ["activeGM"],
  "game.settings": ["get"],
  "game.i18n": ["localize"],
};

/**
 * Globals the stub must never install. Stubbing any of these means the test is reaching into
 * the integration surface — route the check to Stage 23 instead (plan §0.6.6).
 */
const FORBIDDEN_GLOBALS = [
  "Actor", "Item", "ActiveEffect", "ChatMessage", "Hooks", "fromUuid", "ui", "TextEditor",
  // DOM / BOM
  "document", "window", "DOMParser", "HTMLElement", "Element", "Node", "navigator", "location",
  // The canvas renderer Foundry hands the system. Not named in the plan's list (applications,
  // documents, sockets, DOM), but the same kind of thing: a runtime surface Node does not have,
  // so a stand-in for it is a second implementation of Foundry. The stub never installs it and a
  // new test must not either. Two existing files do, under DOUBLED_GLOBALS below.
  "PIXI",
];

/**
 * Present in a bare Node 24 process, so their existence proves nothing about the stub. They stay
 * in the STATIC scan (the stub still must not assign them) but are exempt from the runtime
 * absence assertion.
 */
const NATIVE_IN_NODE = new Set(["navigator"]);

/** Forbidden nested paths — these hang off globals the stub IS allowed to install. */
const FORBIDDEN_PATHS = ["game.socket", "game.packs", "foundry.applications"];

/**
 * Test files that install a double of a forbidden global, by file and name. Nothing else may.
 *
 * `adversary-badge-scale` and `minion-count-scale` call the token overlay code, which builds
 * PIXI Containers, Sprites, Graphics and Text, and assert the geometry the product hands them.
 * Their doubles record what is set (positions, sizes, colours); the Sprite one also models the
 * width-to-scale conversion. That conversion, and the badge as the canvas really draws it, are
 * what only Foundry can check, so the exemptions are debt: they go when the overlays are covered
 * on a real canvas (audit finding NF33). They are listed by file, not by global, so a THIRD file
 * installing PIXI fails the scan until someone adds it here on purpose, with a reason.
 *
 * Every entry must still be needed -- see the test that checks the list for stale entries.
 */
const DOUBLED_GLOBALS = [
  { file: "tests/node/adversary-badge-scale.test.mjs", name: "PIXI" },
  { file: "tests/node/minion-count-scale.test.mjs", name: "PIXI" },
];

// ---------------------------------------------------------------------------
// 2. The scan: fixtures for the scanner, then the scan of every file
// ---------------------------------------------------------------------------

const RULES = { globals: FORBIDDEN_GLOBALS, paths: FORBIDDEN_PATHS };

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, acc);
    else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** The names a source text is reported as installing. */
const detected = (source) => scanSource(source, RULES).map((hit) => hit.name);

/**
 * Every fixture below is plain text handed to the scanner, never code in this file: the scan
 * reads this file's syntax tree, where a string is a string, so the fixtures cannot trip the
 * scan of the file that holds them. They are built from the forbidden vocabulary rather than
 * written out one by one, so a name added to the lists above is covered by every form at once.
 */

/** Source text that installs the forbidden global `n`, by form. */
const GLOBAL_INSTALLS = {
  "a direct assignment": (n) => `globalThis.${n} = class {};`,
  "a direct assignment through `global`": (n) => `global.${n} = class {};`,
  "a bracket assignment": (n) => `globalThis["${n}"] = class {};`,
  "a bracket assignment with a template key": (n) => `globalThis[\`${n}\`] = class {};`,
  "a nullish assignment": (n) => `globalThis.${n} ??= class {};`,
  "a logical OR assignment": (n) => `globalThis.${n} ||= class {};`,
  "a logical AND assignment": (n) => `globalThis.${n} &&= class {};`,
  "a bare assignment": (n) => `${n} = class {};`,
  "a destructuring assignment": (n) => `({ value: globalThis.${n} } = source);`,
  "a loop target": (n) => `for (globalThis.${n} of list) {}`,
  "Object.defineProperty": (n) => `Object.defineProperty(globalThis, "${n}", { value: {} });`,
  "Object.defineProperties": (n) => `Object.defineProperties(globalThis, { ${n}: { value: {} } });`,
  "Object.assign with a key": (n) => `Object.assign(globalThis, { ${n}: {} });`,
  "Object.assign with a shorthand key": (n) => `Object.assign(globalThis, { ${n} });`,
  "Object.assign with a quoted key": (n) => `Object.assign(globalThis, { "${n}": {} });`,
  "Object.assign with a bracketed literal key": (n) => `Object.assign(globalThis, { ["${n}"]: {} });`,
  "Reflect.set": (n) => `Reflect.set(globalThis, "${n}", {});`,
  "Reflect.defineProperty": (n) => `Reflect.defineProperty(globalThis, "${n}", { value: {} });`,
  "an assignment through an alias of the global object": (n) => `const g = globalThis;\ng.${n} = {};`,
};

/** Source text that installs the forbidden path `root.leaf`, by form. */
const PATH_INSTALLS = {
  "a direct assignment": (root, leaf) => `${root}.${leaf} = {};`,
  "a direct assignment from the global object": (root, leaf) => `globalThis.${root}.${leaf} = {};`,
  "a nullish assignment": (root, leaf) => `${root}.${leaf} ??= {};`,
  "a logical OR assignment": (root, leaf) => `${root}.${leaf} ||= {};`,
  "a logical AND assignment": (root, leaf) => `${root}.${leaf} &&= {};`,
  "a bracket assignment": (root, leaf) => `${root}["${leaf}"] = {};`,
  "a bracket assignment from the global object": (root, leaf) => `globalThis.${root}["${leaf}"] ??= {};`,
  "an assignment below the path": (root, leaf) => `${root}.${leaf}.api = {};`,
  "an assignment through a nullish-assigned parent": (root, leaf) => `(globalThis.${root} ??= {}).${leaf} = {};`,
  "an assignment through an alias of the parent": (root, leaf) => `const parent = globalThis.${root};\nparent.${leaf} = {};`,
  "an assignment through a destructured parent": (root, leaf) => `const { ${root} } = globalThis;\n${root}.${leaf} = {};`,
  "a literal assigned to the parent": (root, leaf) => `globalThis.${root} = { ${leaf}: {} };`,
  "a literal nullish-assigned to the parent": (root, leaf) => `globalThis.${root} ??= { ${leaf}: {} };`,
  "a literal nested under the parent": (root, leaf) => `globalThis.${root} = { x: { y: 1 }, ${leaf}: { api: {} } };`,
  "Object.defineProperty": (root, leaf) => `Object.defineProperty(${root}, "${leaf}", { value: {} });`,
  "Object.defineProperty on the parent from the global object": (root, leaf) => `Object.defineProperty(globalThis.${root}, "${leaf}", { value: {} });`,
  "Object.defineProperty installing the parent": (root, leaf) => `Object.defineProperty(globalThis, "${root}", { value: { ${leaf}: {} } });`,
  "Object.assign onto the parent": (root, leaf) => `Object.assign(${root}, { ${leaf}: {} });`,
  "Object.assign onto the parent from the global object": (root, leaf) => `Object.assign(globalThis.${root}, { ${leaf}: {} });`,
  "Object.assign installing the parent": (root, leaf) => `Object.assign(globalThis, { ${root}: { ${leaf}: {} } });`,
  "Reflect.set": (root, leaf) => `Reflect.set(${root}, "${leaf}", {});`,
};

for (const [form, build] of Object.entries(GLOBAL_INSTALLS)) {
  test(`the scan detects a forbidden global installed by ${form}`, () => {
    for (const name of FORBIDDEN_GLOBALS) {
      const src = build(name);
      assert.ok(detected(src).includes(name), `the scan no longer detects ${name} in: ${src}`);
    }
  });
}

for (const [form, build] of Object.entries(PATH_INSTALLS)) {
  test(`the scan detects a forbidden path installed by ${form}`, () => {
    for (const dotted of FORBIDDEN_PATHS) {
      const [root, leaf] = dotted.split(".");
      const src = build(root, leaf);
      assert.ok(detected(src).includes(dotted), `the scan no longer detects ${dotted} in: ${src}`);
    }
  });
}

test("the scan reports where each installation is and how it was written", () => {
  const [hit] = scanSource("const a = 1;\n\nfoundry.applications ??= {};", RULES);
  assert.deepEqual(hit, { line: 3, name: "foundry.applications", form: "assignment (??=)" });
});

test("the scan reports a write to the global object whose keys it cannot read", () => {
  // Nothing says what these install, so the scan refuses to call them harmless.
  for (const src of [
    "globalThis[name] = value;",
    "Object.defineProperty(globalThis, name, { value: {} });",
    "Reflect.set(globalThis, name, {});",
    "Object.assign(globalThis, helpers);",
    "Object.assign(globalThis, { ...helpers });",
    "Object.assign(globalThis, { [name]: value });",
    "Object.defineProperties(globalThis, descriptors);",
  ]) {
    assert.equal(scanSource(src, RULES).length, 1, `expected exactly one report for: ${src}`);
  }
});

test("the scan accepts comments, strings, regular expressions, comparisons, reads and local objects", () => {
  const inert = [
    (n) => `// globalThis.${n} = {};`,
    (n) => `/* globalThis.${n} ??= {};\n   Object.assign(globalThis, { ${n} }); */\nconst ok = 1;`,
    (n) => `const text = "globalThis.${n} = {}";`,
    (n) => `const text = 'Object.assign(globalThis, { ${n}: 1 })';`,
    (n) => "const text = `globalThis." + n + " ??= ${anything}`;",
    (n) => `const pattern = /globalThis\\.${n} = /;`,
    (n) => `const same = globalThis.${n} === undefined && globalThis.${n} == null && globalThis.${n} !== 1;`,
    (n) => `const read = globalThis.${n};\nconst optional = globalThis.${n}?.api;`,
    // A key on an object that is not the global object or a forbidden parent installs nothing.
    (n) => `const sheet = { ${n}: 1 };\nsheet.${n} = 2;\nObject.assign(sheet, { ${n}: 3 });`,
    (n) => `const options = {};\nObject.defineProperty(options, "${n}", { value: 1 });`,
    // Declaring a local of the same name is not an assignment to the global.
    (n) => `const ${n} = 1;\nconst copy = ${n};`,
  ];
  for (const build of inert) {
    for (const name of FORBIDDEN_GLOBALS) {
      const src = build(name);
      assert.deepEqual(scanSource(src, RULES), [], `the scan reports an inert source: ${src}`);
    }
  }
  const inertPaths = [
    (root, leaf) => `// ${root}.${leaf} = {};`,
    (root, leaf) => `const text = "${root}.${leaf} ??= {}";`,
    (root, leaf) => `const pattern = /${root}\\.${leaf} = /;`,
    (root, leaf) => `const missing = globalThis.${root}?.${leaf} === undefined;\nconst read = ${root}.${leaf};`,
    (root, leaf) => `const sheet = { ${leaf}: 1 };\nsheet.${leaf} = 2;\nObject.assign(sheet, { ${leaf}: 3 });`,
    (root, leaf) => `const holder = { ${root}: {} };\nholder.${root}.${leaf} = {};`,
  ];
  for (const build of inertPaths) {
    for (const dotted of FORBIDDEN_PATHS) {
      const [root, leaf] = dotted.split(".");
      const src = build(root, leaf);
      assert.deepEqual(scanSource(src, RULES), [], `the scan reports an inert source: ${src}`);
    }
  }
});

test("the scan accepts the stub's own allowed utility assignments", () => {
  // Everything the stub is allowed to hold, written every way the stub and the tests write it.
  const sources = [];
  for (const name of ALLOWED_GLOBALS) {
    sources.push(`globalThis.${name} = {};`, `globalThis.${name} ??= {};`, `${name} ??= {};`);
  }
  for (const [dotted, keys] of Object.entries(ALLOWED_SHAPE)) {
    for (const key of keys) {
      sources.push(`${dotted}.${key} = () => {};`, `${dotted}.${key} ??= () => {};`, `globalThis.${dotted}["${key}"] = 1;`);
    }
  }
  sources.push(
    "foundry.utils.getProperty ??= (object, key) => key.split('.').reduce((node, part) => node?.[part], object);",
    "globalThis.foundry = { utils: { randomID() {}, getProperty() {} } };",
    "globalThis.game = { settings: { get: () => false }, i18n: { localize: (key) => key } };",
    "game.settings.get = (_namespace, key) => key === 'flag';",
    "Object.assign(game, { items: [], actors: [], scenes: [] });",
    "Object.assign(globalThis, { CONFIG: { FFG: {}, logger: {} }, CONST: {} });",
  );
  for (const src of sources) {
    assert.deepEqual(scanSource(src, RULES), [], `the scan reports an allowed assignment: ${src}`);
  }
});

test("the scan fails loudly on a file it cannot parse instead of passing it", () => {
  assert.throws(() => scanSource("globalThis.Actor = = class {};", RULES), SyntaxError);
});

test("the scan reads both module and script syntax", () => {
  assert.deepEqual(detected("import x from 'y';\nglobalThis.Actor = x;"), ["Actor"]);
  assert.deepEqual(detected("var legacy = 1; with (legacy) {}\nglobalThis.Actor = 1;"), ["Actor"]);
});

test("no file under tests/node/ or codex/tests/node/ installs a forbidden global", () => {
  const files = [...collectFiles(HERE), ...collectFiles(CODEX_NODE_TESTS)];
  assert.ok(files.length > 0, "expected to find files under tests/node/");
  assert.ok(
    files.includes(path.join(HERE, "_stub", "foundry-stub.mjs")),
    "the scan must cover _stub/ — the stub itself is the file most likely to be widened",
  );
  assert.ok(
    files.includes(path.join(HERE, "_guard", "forbidden-installs.mjs")),
    "the scan must cover _guard/ — the scanner is scanned like everything else",
  );

  const violations = [];
  for (const file of files) {
    const where = path.relative(ROOT, file).split(path.sep).join("/");
    let hits;
    try {
      hits = scanSource(fs.readFileSync(file, "utf8"), RULES);
    } catch (error) {
      violations.push(`${where} cannot be parsed, so it cannot be checked: ${error.message}`);
      continue;
    }
    for (const { line, name, form } of hits) {
      if (DOUBLED_GLOBALS.some((double) => double.file === where && double.name === name)) continue;
      violations.push(`${where}:${line} installs forbidden "${name}" (${form})`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Forbidden globals installed under tests/node/ or codex/tests/node/.\n${violations.join("\n")}\n\n` +
    "If a Node test needs one of these, the check does not belong in the Node tier — " +
    "route it to Stage 23 (plan §0.6.6).",
  );
});

test("every file allowed to install a forbidden global still does", () => {
  // A stale exemption is a standing hole: the next change to that file would install the global
  // unnoticed. When a file stops needing one, delete the entry.
  for (const { file, name } of DOUBLED_GLOBALS) {
    const hits = scanSource(fs.readFileSync(path.join(ROOT, file), "utf8"), RULES);
    assert.ok(
      hits.some((hit) => hit.name === name),
      `${file} no longer installs ${name}; remove it from DOUBLED_GLOBALS`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Runtime assertions against the live global surface
// ---------------------------------------------------------------------------

test("the stub installs foundry, CONFIG, CONST and game", () => {
  for (const name of ALLOWED_GLOBALS) {
    assert.notEqual(globalThis[name], undefined, `stub should install globalThis.${name}`);
  }
});

test("the stub installs no forbidden global", () => {
  for (const name of FORBIDDEN_GLOBALS) {
    if (NATIVE_IN_NODE.has(name)) continue;
    assert.equal(
      globalThis[name], undefined,
      `globalThis.${name} must not exist — stubbing it would grow a Foundry simulator`,
    );
  }
});

test("the stubbed surface matches the declared allowlist exactly", () => {
  const at = (dotted) => dotted.split(".").reduce((o, k) => o?.[k], globalThis);
  for (const [dotted, expected] of Object.entries(ALLOWED_SHAPE)) {
    const target = at(dotted);
    assert.notEqual(target, undefined, `expected ${dotted} to exist`);
    assert.deepEqual(
      Object.keys(target).sort(),
      [...expected].sort(),
      `${dotted} has drifted from the declared allowlist — widening the stub requires ` +
      "updating this test deliberately, which is the point",
    );
  }
});

test("the stub carries the character-creator rules and option tables the wizard modules read", () => {
  // Confirmed import-clean at Stage 1, so there is no hand-maintained fixture to drift.
  const cc = globalThis.CONFIG.FFG.characterCreator;
  assert.ok(cc.rules, "characterCreator.rules should be present");
  assert.equal(cc.rules["Force and Destiny"].value, "fad");
  for (const key of ["backgroundTypes", "obligationTypes", "motivationTypes", "startingBonusesRadio"]) {
    assert.ok(cc[key], `characterCreator.${key} should be present`);
  }
});

test("the stub's randomID returns an id of the requested length made only of letters and digits", () => {
  // Foundry document ids are 16 characters from this alphabet, and the wizard's id checks
  // (assertWizardIdIntegrity, the commit id) reject anything else.
  assert.match(globalThis.foundry.utils.randomID(16), /^[a-zA-Z0-9]{16}$/);
});

test("game.i18n.localize is the identity — Covered modules must return i18n KEYS", () => {
  assert.equal(globalThis.game.i18n.localize("SWFFG.CharacterCreator.Anything"),
    "SWFFG.CharacterCreator.Anything");
});
