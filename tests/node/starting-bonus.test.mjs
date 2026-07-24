/**
 * Node tests for the single starting-bonus table (Stage 7, KEEP-4 / BUG-2 / Q-2).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { STARTING_BONUS, STARTING_BONUS_OPTIONS, getStartingBonus } from "../../modules/char-creator/starting-bonus.js";

test("every self-identifying starting bonus cell matches the transcription", () => {
  assert.deepEqual(STARTING_BONUS, {
    "aor_5xp": { xp: 5, duty: 5 },
    "aor_10xp": { xp: 10, duty: 10 },
    "aor_1k_credits": { credits: 1000, duty: 5 },
    "aor_2k_credits": { credits: 2500, duty: 10 },
    "fad_10xp": { xp: 10 },
    "fad_2k_credits": { credits: 2500 },
    "fad_5xp": { xp: 5, credits: 1000 },
    "fad_21_plus_morality": { morality: 21 },
    "fad_21_minus_morality": { morality: -21 },
    "eote_5xp": { xp: 5, obligation: 5 },
    "eote_10xp": { xp: 10, obligation: 10 },
    "eote_1k_credits": { credits: 1000, obligation: 5 },
    "eote_2k_credits": { credits: 2500, obligation: 10 },
  });
});

test("BUG-2: aor/eote grants target bonus.duty / bonus.obligation, never bonus[undefined]", () => {
  for (const choice of ["5xp", "10xp", "1k_credits", "2k_credits"]) {
    const aor = getStartingBonus(`aor_${choice}`);
    const eote = getStartingBonus(`eote_${choice}`);
    assert.ok("duty" in aor && aor.duty > 0, `aor ${choice} must set bonus.duty`);
    assert.ok("obligation" in eote && eote.obligation > 0, `eote ${choice} must set bonus.obligation`);
    assert.ok(!("undefined" in aor) && !("undefined" in eote));
  }
});

test("Q-2: 2k_credits grants 2500 in every book-family option", () => {
  assert.equal(getStartingBonus("fad_2k_credits").credits, 2500);
  assert.equal(getStartingBonus("eote_2k_credits").credits, 2500);
  assert.equal(getStartingBonus("aor_2k_credits").credits, 2500);
});

test("getStartingBonus returns {} for unknown choice", () => {
  assert.deepEqual(getStartingBonus("??_5xp"), {});
  assert.deepEqual(getStartingBonus("aor_nope"), {});
  assert.deepEqual(getStartingBonus(null), {});
});

test("option list exposes every flattened starting bonus id", () => {
  assert.deepEqual(STARTING_BONUS_OPTIONS.map((option) => option.key), Object.keys(STARTING_BONUS));
});

test("the table is frozen", () => {
  assert.ok(Object.isFrozen(STARTING_BONUS));
  assert.ok(Object.isFrozen(STARTING_BONUS["aor_5xp"]));
  assert.ok(Object.isFrozen(STARTING_BONUS_OPTIONS));
});
