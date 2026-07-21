/**
 * Node tests for the single starting-bonus table (Stage 7, KEEP-4 / BUG-2 / Q-2).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { STARTING_BONUS, getStartingBonus } from "../../modules/char-creator/starting-bonus.js";

test("every rules × choice cell matches the transcription", () => {
  assert.deepEqual(STARTING_BONUS.fad, {
    "10xp": { xp: 10 },
    "2k_credits": { credits: 2500 },
    "5xp": { xp: 5, credits: 1000 },
    "21_plus_morality": { morality: 21 },
    "21_minus_morality": { morality: -21 },
  });
  assert.deepEqual(STARTING_BONUS.eote, {
    "5xp": { xp: 5, obligation: 5 },
    "10xp": { xp: 10, obligation: 10 },
    "1k_credits": { credits: 1000, obligation: 5 },
    "2k_credits": { credits: 2500, obligation: 10 },
  });
  assert.deepEqual(STARTING_BONUS.aor, {
    "5xp": { xp: 5, duty: 5 },
    "10xp": { xp: 10, duty: 10 },
    "1k_credits": { credits: 1000, duty: 5 },
    "2k_credits": { credits: 2500, duty: 10 },
  });
});

test("BUG-2: aor/eote grants target bonus.duty / bonus.obligation, never bonus[undefined]", () => {
  for (const choice of ["5xp", "10xp", "1k_credits", "2k_credits"]) {
    const aor = getStartingBonus("aor", choice);
    const eote = getStartingBonus("eote", choice);
    assert.ok("duty" in aor && aor.duty > 0, `aor ${choice} must set bonus.duty`);
    assert.ok("obligation" in eote && eote.obligation > 0, `eote ${choice} must set bonus.obligation`);
    assert.ok(!("undefined" in aor) && !("undefined" in eote));
  }
});

test("Q-2: 2k_credits grants 2500 in every ruleset", () => {
  assert.equal(getStartingBonus("fad", "2k_credits").credits, 2500);
  assert.equal(getStartingBonus("eote", "2k_credits").credits, 2500);
  assert.equal(getStartingBonus("aor", "2k_credits").credits, 2500);
});

test("getStartingBonus returns {} for unknown ruleset or choice", () => {
  assert.deepEqual(getStartingBonus("??", "5xp"), {});
  assert.deepEqual(getStartingBonus("aor", "nope"), {});
  assert.deepEqual(getStartingBonus("aor", null), {});
});

test("the table is frozen", () => {
  assert.ok(Object.isFrozen(STARTING_BONUS));
  assert.ok(Object.isFrozen(STARTING_BONUS.aor));
  assert.ok(Object.isFrozen(STARTING_BONUS.aor["5xp"]));
});
