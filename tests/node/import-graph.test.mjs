/**
 * The §0.6.1 import-graph sweep, EXECUTED (plan §2 work item 3).
 *
 * §0.6.1 was traced statically by reading import lines. Plan §2 requires converting it into an
 * executed check: the poisoned set must genuinely fail to import under Node, and the two clean
 * config modules must genuinely succeed. Both halves matter —
 *
 *   - if a "poisoned" module ever becomes importable, the §0.6.3 residual-risk table is claiming
 *     an exemption it no longer needs, and coverage decisions were made on a false premise;
 *   - if a "clean" module ever stops importing, the stub's real `CONFIG.FFG.characterCreator`
 *     table (§0.6.6) silently loses its source and rule 7's named exception is no longer sound.
 *
 * Each candidate is imported in its OWN child process. A failed import can leave partially
 * evaluated modules in the loader cache, so sharing one process would let a later result depend
 * on an earlier failure. Nothing here is imported into the test process itself.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The genuine UI files that destructure `foundry.applications.*` at module-eval
 * time — the actual poison roots, legitimately NOT Node targets (ApplicationV2
 * subclasses/consumers). Unchanged by the 2026-07-21 untangling.
 */
const POISONED_FOUNDRY = [
  "modules/apps/ffg-form-application.js",
  "modules/popout-modifiers.js",
];

/**
 * CLEAN verdicts. The two config modules are load-bearing (see the header). The
 * three helpers were UNPOISONED on 2026-07-21 and are now genuinely
 * Node-importable:
 *   - helpers/modifiers.js      — imports popout-modifiers.js LAZILY (two async
 *                                 UI handlers) instead of at module scope;
 *   - helpers/actor-helpers.js  — was only transitively poisoned via modifiers;
 *   - helpers/item-helpers.js   — likewise.
 * If any regresses to unimportable, a module-scope import of a poisoned UI file
 * has crept back in — fix that, do not relist it as poisoned.
 */
const CLEAN = [
  "modules/config/ffg-active-effect-modes.js",
  "modules/config/ffg-character-creator.js",
  "modules/helpers/modifiers.js",
  "modules/helpers/actor-helpers.js",
  "modules/helpers/item-helpers.js",
];

/**
 * actor-ffg.js is no longer foundry-poisoned (its dead `PopoutEditor` import was
 * removed 2026-07-21) but is STILL not Node-importable, for a different inherent
 * reason: `class ActorFFG extends Actor` binds the `Actor` global at
 * class-definition time. That cannot be deferred without a class-factory refactor
 * (the same cascade refused for ffg-form-application). Asserting the DISTINCT
 * error proves the poison was cut without claiming the module became importable.
 */
const ACTOR_GLOBAL = [
  "modules/actors/actor-ffg.js",
];

/** Import `rel` in a fresh child process. @returns {{ok: boolean, stderr: string}} */
function importInChild(rel) {
  const href = pathToFileURL(path.join(REPO_ROOT, rel)).href;
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(href)});`],
    { encoding: "utf8" },
  );
  return { ok: r.status === 0, stderr: r.stderr ?? "" };
}

for (const rel of POISONED_FOUNDRY) {
  test(`${rel} is NOT importable under Node — foundry is not defined`, () => {
    const { ok, stderr } = importInChild(rel);
    assert.equal(ok, false, `${rel} imported cleanly — it is listed as a foundry-poison root`);
    assert.match(
      stderr,
      /ReferenceError: foundry is not defined/,
      `${rel} failed, but not for the recorded reason:\n${stderr}`,
    );
  });
}

for (const rel of CLEAN) {
  test(`${rel} IS importable under Node`, () => {
    const { ok, stderr } = importInChild(rel);
    assert.equal(ok, true, `${rel} is relied on as import-clean but failed:\n${stderr}`);
  });
}

for (const rel of ACTOR_GLOBAL) {
  test(`${rel} is NOT importable under Node — Actor is not defined (poison cut, but extends a global)`, () => {
    const { ok, stderr } = importInChild(rel);
    assert.equal(ok, false, `${rel} imported cleanly — unexpected; revisit the coverage decisions it drives`);
    assert.match(
      stderr,
      /ReferenceError: Actor is not defined/,
      `${rel} failed for a DIFFERENT reason than the expected Actor-global bind:\n${stderr}`,
    );
    assert.doesNotMatch(
      stderr,
      /ReferenceError: foundry is not defined/,
      `${rel} is still foundry-poisoned — the 2026-07-21 untangling regressed:\n${stderr}`,
    );
  });
}

test("the modules/ ESM boundary is explicit — no MODULE_TYPELESS_PACKAGE_JSON warning (DEV-11)", () => {
  // §0.5: modules/package.json exists precisely so Node stops heuristically reparsing these
  // files as ESM. If the warning comes back, that boundary has been lost.
  const { stderr } = importInChild("modules/config/ffg-active-effect-modes.js");
  assert.doesNotMatch(stderr, /MODULE_TYPELESS_PACKAGE_JSON/, stderr);
});
