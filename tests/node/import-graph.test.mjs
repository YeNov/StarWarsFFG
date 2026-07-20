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

/** The poison root and everything §0.6.1 traced back to it. */
const POISONED = [
  "modules/apps/ffg-form-application.js",
  "modules/popout-modifiers.js",
  "modules/helpers/modifiers.js",
  "modules/helpers/actor-helpers.js",
  "modules/helpers/item-helpers.js",
  "modules/actors/actor-ffg.js",
];

/** §0.6.1's CLEAN verdicts — both are load-bearing (see the header). */
const CLEAN = [
  "modules/config/ffg-active-effect-modes.js",
  "modules/config/ffg-character-creator.js",
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

for (const rel of POISONED) {
  test(`${rel} is NOT importable under Node — foundry is not defined`, () => {
    const { ok, stderr } = importInChild(rel);
    assert.equal(ok, false, `${rel} imported cleanly — §0.6.1 lists it as POISONED`);
    assert.match(
      stderr,
      /ReferenceError: foundry is not defined/,
      `${rel} failed, but not for the reason §0.6.1 records:\n${stderr}`,
    );
  });
}

for (const rel of CLEAN) {
  test(`${rel} IS importable under Node`, () => {
    const { ok, stderr } = importInChild(rel);
    assert.equal(ok, true, `${rel} is relied on as import-clean but failed:\n${stderr}`);
  });
}

test("the modules/ ESM boundary is explicit — no MODULE_TYPELESS_PACKAGE_JSON warning (DEV-11)", () => {
  // §0.5: modules/package.json exists precisely so Node stops heuristically reparsing these
  // files as ESM. If the warning comes back, that boundary has been lost.
  const { stderr } = importInChild("modules/config/ffg-active-effect-modes.js");
  assert.doesNotMatch(stderr, /MODULE_TYPELESS_PACKAGE_JSON/, stderr);
});
