/**
 * GATE-IMPORTS rules 1, 2 and 5 — resolution tests (plan §0.4).
 *
 * These rules were repaired after their first real run produced false positives, and a repair
 * that quietly turns a rule into "reports nothing" is indistinguishable from a fix by looking
 * at the exit code. So each repaired rule is pinned from BOTH sides here: the case that used to
 * be mis-reported must now pass, AND the defect the rule exists to catch must still fail.
 *
 * Fixtures are written into throwaway roots and the checker is pointed at them with `--root`,
 * so the real repo is never mutated.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import "./_stub/foundry-stub.mjs";
import { checkImports } from "../../tools/check-imports.mjs";

/** @param {Record<string,string>} files repo-relative path -> source */
function withFixture(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swffg-rules-"));
  try {
    for (const [rel, src] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, src);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const rule = (root, n) => checkImports({ root, cutover: false }).filter((f) => f.rule === n);

test("shared character assembler remains in the import-clean closure", () => {
  const findings = checkImports({ cutover: false }).filter((finding) =>
    finding.rule === 7
    && finding.file === "modules/char-creator/assemble-character-source.js");
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// Rule 1 — relative specifiers must resolve, exact-path and extension-required
// ---------------------------------------------------------------------------

test("rule 1 STILL fails on a relative import that does not resolve", () => {
  withFixture({
    "modules/char-creator/preview.js": 'import { gone } from "./not-here.js";\nexport const p = gone;\n',
  }, (root) => {
    const findings = rule(root, 1);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0].file, "modules/char-creator/preview.js");
    assert.equal(findings[0].line, 1);
  });
});

test("rule 1 STILL fails on an extensionless relative import (the browser does not resolve it)", () => {
  withFixture({
    "modules/char-creator/constants.js": "export const X = 1;\n",
    "modules/char-creator/preview.js": 'import { X } from "./constants";\nexport const p = X;\n',
  }, (root) => {
    assert.equal(rule(root, 1).length, 1);
  });
});

test("rule 1 STILL fails inside tests/node/ — those files are real source, not exempt", () => {
  withFixture({
    "tests/node/some.test.mjs": 'import { gone } from "../../modules/not-here.js";\nexport const t = gone;\n',
  }, (root) => {
    const findings = rule(root, 1);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0].file, "tests/node/some.test.mjs");
  });
});

test("rule 1 passes on a resolving relative import, and reports the right line", () => {
  withFixture({
    "modules/char-creator/constants.js": "export const X = 1;\n",
    "modules/char-creator/preview.js":
      "// a leading comment\n" +
      'import { X } from "./constants.js";\n' +
      "export const p = X;\n",
  }, (root) => {
    assert.deepEqual(rule(root, 1), []);
  });
});

test("rule 1 does NOT read specifiers out of string literals (the tests/node fixture case)", () => {
  // This is the exact shape that produced 20 false positives: a test file holding fixture
  // SOURCE in a string constant was scanned as if those were its own imports.
  withFixture({
    "tests/node/fixture-holder.test.mjs":
      "const FIXTURE_A = 'import { STARTING_BONUS } from \"./starting-bonus.js\";\\n';\n" +
      'const FIXTURE_B =\n' +
      '  \'import x from "../actors/actor-ffg.js";\\n\' +\n' +
      '  \'export const applyBuild = () => x;\\n\';\n' +
      "export const fixtures = [FIXTURE_A, FIXTURE_B];\n",
  }, (root) => {
    assert.deepEqual(checkImports({ root, cutover: false }), []);
  });
});

test("a file holding a fixture in a string STILL has its own real imports checked", () => {
  // The load-bearing half of the previous test: ignoring literal content must not degrade into
  // ignoring the file.
  withFixture({
    "tests/node/fixture-holder.test.mjs":
      "const FIXTURE = 'import { ok } from \"./fine.js\";\\n';\n" +
      'import { broken } from "./actually-missing.js";\n' +
      "export const f = [FIXTURE, broken];\n",
  }, (root) => {
    const findings = rule(root, 1);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.match(findings[0].message, /actually-missing\.js/);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — Foundry-style paths
// ---------------------------------------------------------------------------

test("rule 2 STILL fails on a Foundry-style path that resolves to nothing", () => {
  withFixture({
    "modules/apps/sheet.js":
      'const t = "systems/starwarsffg/templates/actors/ffg-nope.html";\nexport const x = t;\n',
  }, (root) => {
    const findings = rule(root, 2);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.match(findings[0].message, /ffg-nope\.html/);
  });
});

test("rule 2 accepts a path prefix that is an existing DIRECTORY", () => {
  // actor-sheet-ffg.js:59-61 builds its template path in two halves; the base half is a real
  // directory, and resolving it as a file was the checker's error.
  withFixture({
    "templates/actors/ffg-character-sheet.html": "<div></div>\n",
    "modules/actors/actor-sheet-ffg.js":
      'const base = "systems/starwarsffg/templates/actors";\n' +
      "export const template = `${base}/ffg-character-sheet.html`;\n",
  }, (root) => {
    assert.deepEqual(rule(root, 2), []);
  });
});

test("rule 2 STILL fails on a path prefix naming a directory that does NOT exist", () => {
  // The directory acceptance must not become "anything without an extension passes".
  withFixture({
    "modules/actors/actor-sheet-ffg.js":
      'const base = "systems/starwarsffg/templates/typo-here";\nexport const b = base;\n',
  }, (root) => {
    const findings = rule(root, 2);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.match(findings[0].message, /typo-here/);
  });
});

test("rule 2 STILL fails on an unresolvable Foundry-style IMPORT specifier, directory or not", () => {
  // Import position is stricter than string position: a module specifier must be a FILE.
  withFixture({
    "templates/actors/x.html": "<div></div>\n",
    "modules/apps/sheet.js":
      'import x from "/systems/starwarsffg/templates/actors";\nexport const y = x;\n',
  }, (root) => {
    assert.equal(rule(root, 2).length, 1);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — bare specifiers in modules/**
// ---------------------------------------------------------------------------

test("rule 5 STILL fails on a genuine bare specifier in modules/**", () => {
  withFixture({
    "modules/char-creator/preview.js": 'import _ from "lodash";\nexport const p = _;\n',
  }, (root) => {
    const findings = rule(root, 5);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.match(findings[0].message, /lodash/);
  });
});

test("rule 5 does NOT match `import` occurring inside an unrelated string literal", () => {
  // The exact false positive: `icon: "fas fa-file-import", label: "…"` was extracted as a bare
  // specifier `", label: "` from data-importer.js:75.
  withFixture({
    "modules/importer/data-importer.js":
      'const buttons = [{ type: "submit", icon: "fas fa-file-import", label: "SWFFG.ImportFile" }];\n' +
      "export const b = buttons;\n",
  }, (root) => {
    assert.deepEqual(checkImports({ root, cutover: false }), []);
  });
});

test("rule 5 is scoped to modules/** — a bare specifier under tests/ is not its business", () => {
  withFixture({
    "tests/node/uses-node-builtin.test.mjs": 'import fs from "node:fs";\nexport const f = fs;\n',
  }, (root) => {
    assert.deepEqual(rule(root, 5), []);
  });
});
