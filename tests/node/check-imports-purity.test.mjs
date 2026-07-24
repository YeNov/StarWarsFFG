/**
 * GATE-IMPORTS rule 7 — Node-purity allowlist negative tests (plan §2, §0.4 rule 7, §0.6.4).
 *
 * Rule 7 is the automated enforcement of the frozen closure: every Covered module may import
 * ONLY from §0.6.4, and the check is transitive over the whole Covered closure. Without these
 * negative tests the rule could silently degrade into "reports nothing", which would look
 * exactly like passing.
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

/**
 * Build a throwaway repo root containing the given files, plus every poisoned/exception module
 * a fixture might point at (so rule 1 stays quiet and only rule 7 speaks).
 *
 * @param {Record<string,string>} files repo-relative path -> source
 */
function withFixture(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swffg-rule7-"));
  const write = (rel, src) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src);
  };
  try {
    // Import targets a fixture may legitimately reference.
    write("modules/config/ffg-active-effect-modes.js", "export const AE_MODES = {};\n");
    write("modules/helpers/xp-entry-builders.js", "export function buildXpSpendEntry() {}\n");
    // Poisoned modules — present so the FAILURE is rule 7's, not rule 1's.
    write("modules/helpers/modifiers.js", "export default {};\n");
    write("modules/helpers/item-helpers.js", "export default {};\n");
    write("modules/helpers/actor-helpers.js", "export default {};\n");
    write("modules/actors/actor-ffg.js", "export function getActorCreationDefaults() {}\n");
    write("modules/apps/ffg-form-application.js", "export class FFGFormApplication {}\n");
    write("modules/char-creator/enrich.js", "export function enrichDescription() {}\n");

    for (const [rel, src] of Object.entries(files)) write(rel, src);
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const rule7 = (root) => checkImports({ root, cutover: false }).filter((f) => f.rule === 7);
const other = (root) => checkImports({ root, cutover: false }).filter((f) => f.rule !== 7);

// ---------------------------------------------------------------------------
// Allowed edges
// ---------------------------------------------------------------------------

test("Covered -> Covered passes", () => {
  withFixture({
    "modules/char-creator/starting-bonus.js": "export const STARTING_BONUS = {};\n",
    "modules/char-creator/calculators.js":
      'import { STARTING_BONUS } from "./starting-bonus.js";\nexport const calcXp = () => STARTING_BONUS;\n',
  }, (root) => {
    assert.deepEqual(rule7(root), []);
    assert.deepEqual(other(root), []);
  });
});

test("Covered -> helpers/xp-entry-builders.js passes (named external exception)", () => {
  withFixture({
    "modules/char-creator/constants.js": "export const DRAFT_SCHEMA_VERSION = 1;\n",
    "modules/char-creator/build-item-schema.js": "export const projectItemSource = (x) => x;\n",
    "modules/char-creator/commit-normalize.js":
      'import { buildXpSpendEntry } from "../helpers/xp-entry-builders.js";\n' +
      'import { DRAFT_SCHEMA_VERSION } from "./constants.js";\n' +
      'import { projectItemSource } from "./build-item-schema.js";\n' +
      "export const normalizeCommitSource = () => [buildXpSpendEntry, DRAFT_SCHEMA_VERSION, projectItemSource];\n",
  }, (root) => {
    assert.deepEqual(rule7(root), []);
  });
});

test("Covered -> config/ffg-active-effect-modes.js passes (named external exception)", () => {
  withFixture({
    "modules/char-creator/constants.js": "export const X = 1;\n",
    "modules/char-creator/build-item-schema.js": "export const projectItemSource = (x) => x;\n",
    "modules/char-creator/to-item-data.js":
      'import { AE_MODES } from "../config/ffg-active-effect-modes.js";\n' +
      'import { X } from "./constants.js";\n' +
      'import { projectItemSource } from "./build-item-schema.js";\n' +
      "export const toItemData = () => [AE_MODES, X, projectItemSource];\n",
  }, (root) => {
    assert.deepEqual(rule7(root), []);
  });
});

test("a Covered module that imports nothing passes", () => {
  withFixture({
    "modules/char-creator/build-deps.js": "export function makeBuildDependencies() {}\n",
  }, (root) => {
    assert.deepEqual(rule7(root), []);
  });
});

// ---------------------------------------------------------------------------
// Forbidden edges — one per named poisoned module
// ---------------------------------------------------------------------------

for (const [label, spec] of [
  ["actor-ffg.js", "../actors/actor-ffg.js"],
  ["item-helpers.js", "../helpers/item-helpers.js"],
  ["actor-helpers.js", "../helpers/actor-helpers.js"],
  ["modifiers.js", "../helpers/modifiers.js"],
  ["apps/ffg-form-application.js", "../apps/ffg-form-application.js"],
  ["enrich.js", "./enrich.js"],
]) {
  test(`Covered -> ${label} fails`, () => {
    withFixture({
      "modules/char-creator/apply-build.js":
        `import x from "${spec}";\nexport const applyBuild = () => x;\n`,
    }, (root) => {
      const findings = rule7(root);
      assert.equal(findings.length, 1, `expected exactly one rule-7 finding, got ${JSON.stringify(findings)}`);
      assert.equal(findings[0].file, "modules/char-creator/apply-build.js");
      assert.match(findings[0].message, /not in the frozen/);
      // rule 1 must NOT be what caught it — the target exists on disk.
      assert.deepEqual(other(root), []);
    });
  });
}

test("Covered -> an arbitrary out-of-closure system module fails", () => {
  withFixture({
    "modules/helpers/dice-helpers.js": "export default {};\n",
    "modules/char-creator/validate.js":
      'import d from "../helpers/dice-helpers.js";\nexport const validateDraft = () => d;\n',
  }, (root) => {
    assert.equal(rule7(root).length, 1);
  });
});

test("Covered -> a bare npm specifier fails", () => {
  withFixture({
    "modules/char-creator/wizard-state.js":
      'import _ from "lodash";\nexport const createInitialData = () => _;\n',
  }, (root) => {
    const findings = rule7(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /lodash/);
  });
});

// ---------------------------------------------------------------------------
// Transitivity
// ---------------------------------------------------------------------------

test("a forbidden edge reached TRANSITIVELY through another Covered module is still detected", () => {
  withFixture({
    // apply-build -> calculators is allowed …
    "modules/char-creator/apply-build.js":
      'import { calcXp } from "./calculators.js";\nexport const applyBuild = () => calcXp;\n',
    // … but calculators reaches a poisoned module one hop away.
    "modules/char-creator/calculators.js":
      'import { getActorCreationDefaults } from "../actors/actor-ffg.js";\n' +
      "export const calcXp = () => getActorCreationDefaults;\n",
  }, (root) => {
    const findings = rule7(root);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0].file, "modules/char-creator/calculators.js");
    assert.match(findings[0].message, /poisoned/);
  });
});

test("a two-hop chain of Covered modules ending in a poisoned import is detected", () => {
  withFixture({
    "modules/char-creator/constants.js":
      'import m from "../helpers/modifiers.js";\nexport const CHANNEL = m;\n',
    "modules/char-creator/wizard-state.js":
      'import { CHANNEL } from "./constants.js";\nexport const createInitialData = () => CHANNEL;\n',
    "modules/char-creator/notify-policy.js":
      'import { CHANNEL } from "./constants.js";\nexport const shouldAcceptAck = () => CHANNEL;\n',
  }, (root) => {
    const findings = rule7(root);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0].file, "modules/char-creator/constants.js");
  });
});

// ---------------------------------------------------------------------------
// The named exceptions must themselves stay import-clean
// ---------------------------------------------------------------------------

test("an allowed exception that later gains a forbidden import is rejected", () => {
  withFixture({
    "modules/config/ffg-active-effect-modes.js":
      'import m from "../helpers/modifiers.js";\nexport const AE_MODES = m;\n',
    "modules/char-creator/constants.js": "export const X = 1;\n",
    "modules/char-creator/build-item-schema.js": "export const projectItemSource = (x) => x;\n",
    "modules/char-creator/to-item-data.js":
      'import { AE_MODES } from "../config/ffg-active-effect-modes.js";\n' +
      "export const toItemData = () => AE_MODES;\n",
  }, (root) => {
    const findings = rule7(root);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0].file, "modules/config/ffg-active-effect-modes.js");
    assert.match(findings[0].message, /must stay import-clean/);
  });
});

test("an allowed exception that gains ANY import is rejected, even a harmless one", () => {
  withFixture({
    "modules/helpers/xp-entry-builders.js":
      'import { X } from "../char-creator/constants.js";\nexport const buildXpSpendEntry = () => X;\n',
    "modules/char-creator/constants.js": "export const X = 1;\n",
  }, (root) => {
    const findings = rule7(root);
    // xp-entry-builders.js is BOTH Covered (allowed: nothing) and a named exception, so the
    // forbidden import is reported under both halves of the rule.
    assert.ok(findings.length >= 1, JSON.stringify(findings));
    assert.ok(findings.every((f) => f.file === "modules/helpers/xp-entry-builders.js"));
  });
});

// ---------------------------------------------------------------------------
// Vacuity guard
// ---------------------------------------------------------------------------

test("rule 7 is vacuous — not broken — when no Covered module exists yet", () => {
  withFixture({}, (root) => {
    assert.deepEqual(rule7(root), []);
    assert.deepEqual(other(root), []);
  });
});
