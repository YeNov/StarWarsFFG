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
 *   2. Statically scans every file under `tests/node/` — including `_stub/` and this file —
 *      for code that installs a forbidden global.
 *   3. Re-asserts the live global surface at runtime after importing the stub.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./_stub/foundry-stub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
  CONFIG: ["FFG"],
  "CONFIG.FFG": ["characterCreator"],
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
];

/**
 * Present in a bare Node 24 process, so their existence proves nothing about the stub. They stay
 * in the STATIC scan (the stub still must not assign them) but are exempt from the runtime
 * absence assertion.
 */
const NATIVE_IN_NODE = new Set(["navigator"]);

/** Forbidden nested paths — these hang off globals the stub IS allowed to install. */
const FORBIDDEN_PATHS = ["game.socket", "game.packs", "foundry.applications"];

// ---------------------------------------------------------------------------
// 2. Static scan of every file under tests/node/
// ---------------------------------------------------------------------------

/**
 * Blank out comments, preserving length and newlines so reported line numbers stay exact.
 *
 * The scan below covers THIS file too, which is the point — but it therefore also read this
 * file's own prose. A comment naming a forbidden global (the `Object.assign(globalThis, …)`
 * example above) was matched as if it installed one. A comment cannot install a global, so
 * removing them costs the scan nothing: every real installation is code and survives.
 *
 * String literals are deliberately KEPT: `globalThis["Actor"] = …` is a genuine installation
 * whose forbidden name lives inside a literal, and one of the patterns matches exactly that.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k++) out += src[k] === "\n" ? "\n" : " ";
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      // Copy the literal through verbatim so its content stays scannable.
      let k = i + 1;
      while (k < src.length) {
        if (src[k] === "\\") { k += 2; continue; }
        if (src[k] === c) { k++; break; }
        if (src[k] === "\n" && c !== "`") break;
        k++;
      }
      out += src.slice(i, k);
      i = k;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, acc);
    else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Assignment-shaped patterns only — `=(?!=)` and `:(?!=)` keep comparisons such as
 * `globalThis.game?.socket === undefined` (which this very file performs below) from matching,
 * so the scan can honestly cover ITSELF rather than carving out an exemption.
 */
function forbiddenAssignmentPatterns() {
  const patterns = [];
  for (const name of FORBIDDEN_GLOBALS) {
    patterns.push({
      name,
      re: new RegExp(
        `(?:globalThis|global)\\s*(?:\\.\\s*${name}\\s*|\\[\\s*["']${name}["']\\s*\\]\\s*)=(?!=)`,
      ),
    });
    patterns.push({
      name,
      re: new RegExp(`Object\\.defineProperty\\s*\\(\\s*(?:globalThis|global)\\s*,\\s*["']${name}["']`),
    });
    // e.g. Object.assign(globalThis, { Actor: … })
    patterns.push({ name, re: new RegExp(`\\b${name}\\s*:(?!=)`) });
  }
  for (const p of FORBIDDEN_PATHS) {
    const leaf = p.split(".").pop();
    patterns.push({ name: p, re: new RegExp(`\\b${leaf}\\s*(?::(?!=)|=(?!=))`) });
  }
  return patterns;
}

test("the scan still DETECTS a forbidden installation (it did not become a no-op)", () => {
  // The scan passing is only meaningful if it can still fail, so this drives it with sources
  // that DO install forbidden globals.
  //
  // Every such source is BUILT BY INTERPOLATION rather than written as a literal. A file that
  // spells out `globalThis.Actor = …` — even as test data — is itself a violation the scan will
  // and should report, because the scan cannot tell a demonstration from the real thing. That is
  // the same trap that made this test's first draft fail: the fixture must not exist verbatim in
  // a scanned file. Interpolation keeps the shape out of the source while still producing it at
  // runtime, and covers every forbidden name instead of a hand-picked few.
  const patterns = forbiddenAssignmentPatterns();
  const hits = (src) => patterns.filter((p) => p.re.test(stripComments(src))).map((p) => p.name);

  for (const name of FORBIDDEN_GLOBALS) {
    const shapes = [
      `globalThis.${name} = class {};`,
      `globalThis["${name}"] = class {};`,          // inside a literal — literals are kept on purpose
      `Object.defineProperty(globalThis, "${name}", { value: {} });`,
      `Object.assign(globalThis, { ${name}: {} });`,
    ];
    for (const src of shapes) {
      assert.ok(hits(src).includes(name), `the scan no longer detects: ${src}`);
    }
  }

  for (const dotted of FORBIDDEN_PATHS) {
    assert.ok(hits(`globalThis.${dotted} = {};`).includes(dotted),
      `the scan no longer detects an assignment to ${dotted}`);
  }

  // The two things it must stay QUIET about need no fixtures at all: this file contains a
  // comment naming a forbidden global (the `Object.assign` example above) and several
  // `globalThis.game?.socket === undefined` comparisons below. The scan covers this file, so
  // the sibling test passing IS the proof that neither is mistaken for an installation.
});

test("no file under tests/node/ installs a forbidden global", () => {
  const files = collectFiles(HERE);
  assert.ok(files.length > 0, "expected to find files under tests/node/");
  assert.ok(
    files.some((f) => f.includes(`_stub${path.sep}foundry-stub.mjs`)),
    "the scan must cover _stub/ — the stub itself is the file most likely to be widened",
  );

  const patterns = forbiddenAssignmentPatterns();
  const violations = [];
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const { name, re } of patterns) {
      const m = re.exec(src);
      if (m) {
        const line = src.slice(0, m.index).split("\n").length;
        violations.push(`${path.relative(HERE, file)}:${line} installs forbidden "${name}"`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Forbidden globals installed under tests/node/.\n${violations.join("\n")}\n\n` +
    "If a Node test needs one of these, the check does not belong in the Node tier — " +
    "route it to Stage 23 (plan §0.6.6).",
  );
});

// ---------------------------------------------------------------------------
// 3. Runtime assertions against the live global surface
// ---------------------------------------------------------------------------

test("the stub installs exactly the allowed globals", () => {
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

test("the stub installs no forbidden nested path", () => {
  assert.equal(globalThis.game?.socket, undefined, "game.socket must not be stubbed");
  assert.equal(globalThis.game?.packs, undefined, "game.packs must not be stubbed");
  assert.equal(globalThis.foundry?.applications, undefined, "foundry.applications must not be stubbed");
  assert.equal(globalThis.ui?.notifications, undefined, "ui.notifications must not be stubbed");
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

test("the stub uses the real CONFIG.FFG.characterCreator table", () => {
  // Confirmed import-clean at Stage 1, so there is no hand-maintained fixture to drift.
  const cc = globalThis.CONFIG.FFG.characterCreator;
  assert.ok(cc.rules, "characterCreator.rules should be present");
  assert.equal(cc.rules["Force and Destiny"].value, "fad");
  for (const key of ["backgroundTypes", "obligationTypes", "motivationTypes", "startingBonusesRadio"]) {
    assert.ok(cc[key], `characterCreator.${key} should be present`);
  }
});

test("game.i18n.localize is the identity — Covered modules must return i18n KEYS", () => {
  assert.equal(globalThis.game.i18n.localize("SWFFG.CharacterCreator.Anything"),
    "SWFFG.CharacterCreator.Anything");
});
