/**
 * GATE-IMPORTS rule 6 — activation tests (plan §2, §0.4 rule 6).
 *
 * Rule 6 (the Stage 18 shim assertion) is gated behind an explicit `--cutover` flag rather than
 * a heuristic. The plan's stated rationale: activating "when the file already looks like a shim"
 * would let a MALFORMED shim silently skip the assertion. That is exactly the property these
 * tests pin down — the activation condition gets its own tests.
 *
 * The checker is exercised against throwaway fixture trees via its `--root` option, so these
 * tests never mutate the real repo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import "./_stub/foundry-stub.mjs";
import { checkImports } from "../../tools/check-imports.mjs";

const SHIM = "modules/helpers/character-creator.js";

/** Build a throwaway repo root whose only interesting file is the shim. */
function withFixture(shimSource, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swffg-rule6-"));
  try {
    fs.mkdirSync(path.join(root, "modules/helpers"), { recursive: true });
    fs.mkdirSync(path.join(root, "modules/char-creator"), { recursive: true });
    // The re-export target must exist or rule 1 fires and muddies the assertion.
    fs.writeFileSync(path.join(root, "modules/char-creator/pc-wizard.js"),
      "export class CharacterCreator {}\n");
    if (shimSource !== null) {
      fs.writeFileSync(path.join(root, SHIM), shimSource);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const rule6 = (root, cutover) => checkImports({ root, cutover }).filter((f) => f.rule === 6);

const VALID_SHIM = 'export { CharacterCreator } from "../char-creator/pc-wizard.js";\n';

test("without --cutover the rule is skipped even on a valid shim", () => {
  withFixture(VALID_SHIM, (root) => {
    assert.deepEqual(rule6(root, false), []);
    // and the tree as a whole is clean
    assert.deepEqual(checkImports({ root, cutover: false }), []);
  });
});

test("without --cutover the rule is skipped even on a MALFORMED shim", () => {
  // The load-bearing case: a heuristic "looks like a shim" activation would silently pass here.
  withFixture("export class CharacterCreator {\n  // 1846 lines of implementation\n}\n", (root) => {
    assert.deepEqual(rule6(root, false), []);
  });
});

test("with --cutover a valid single-line named re-export passes", () => {
  withFixture(VALID_SHIM, (root) => {
    assert.deepEqual(rule6(root, true), []);
  });
});

test("with --cutover a valid shim preceded by comments still passes", () => {
  const src = "// Compatibility shim — plan §0.8.\n/* block */\n" + VALID_SHIM;
  withFixture(src, (root) => {
    assert.deepEqual(rule6(root, true), []);
  });
});

test("with --cutover a large implementation file fails", () => {
  const body = Array.from({ length: 1846 }, (_, i) => `  const line${i} = ${i};`).join("\n");
  const src = `export class CharacterCreator {\n${body}\n}\n`;
  withFixture(src, (root) => {
    const findings = rule6(root, true);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /single re-export line/);
  });
});

test("with --cutover a shim naming the wrong export fails", () => {
  withFixture('export { PcWizard } from "../char-creator/pc-wizard.js";\n', (root) => {
    const findings = rule6(root, true);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /not a named re-export of CharacterCreator/);
  });
});

test("with --cutover a multi-line shim fails", () => {
  const src =
    'import { CharacterCreator } from "../char-creator/pc-wizard.js";\n' +
    "export { CharacterCreator };\n";
  withFixture(src, (root) => {
    const findings = rule6(root, true);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /found 2 non-comment lines/);
  });
});

test("with --cutover a star re-export fails (it does not NAME CharacterCreator)", () => {
  withFixture('export * from "../char-creator/pc-wizard.js";\n', (root) => {
    assert.equal(rule6(root, true).length, 1);
  });
});

test("with --cutover a missing shim file fails (plan §0.8: it must not be deleted)", () => {
  withFixture(null, (root) => {
    const findings = rule6(root, true);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /does not exist/);
  });
});
