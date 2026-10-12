/**
 * Node tests for the single starting-bonus table (Stage 7, KEEP-4 / BUG-2 / Q-2).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  STARTING_BONUS,
  STARTING_BONUS_OPTIONS,
  getStartingBonus,
  getStartingBonusOptions,
} from "../../modules/char-creator/starting-bonus.js";

// Every choice grants exactly these amounts: XP, credits, and the ruleset's own track (Duty for
// Age of Rebellion, Obligation for Edge of the Empire, Morality for Force and Destiny). The three
// "2k" credit choices grant 2,500 on purpose (owner decision R17, recorded in starting-bonus.js).
// Because the object is compared whole, a grant that targets a missing key (bonus[undefined]) fails too.
test("each starting-bonus choice grants exactly its listed XP, credits, Duty, Obligation or Morality, and the 2k credit choices grant 2,500", () => {
  assert.deepEqual(STARTING_BONUS, {
    "aor_5xp": { xp: 5, duty: 5 },
    "aor_10xp": { xp: 10, duty: 10 },
    "aor_1k_credits": { credits: 1000, duty: 5 },
    "aor_2k_credits": { credits: 2500, duty: 10 },
    "aor_5xp_1k_credits": { xp: 5, credits: 1000, duty: 10 },
    "fad_10xp": { xp: 10 },
    "fad_2k_credits": { credits: 2500 },
    "fad_5xp": { xp: 5, credits: 1000 },
    "fad_21_plus_morality": { morality: 21 },
    "fad_21_minus_morality": { morality: -21 },
    "eote_5xp": { xp: 5, obligation: 5 },
    "eote_10xp": { xp: 10, obligation: 10 },
    "eote_1k_credits": { credits: 1000, obligation: 5 },
    "eote_2k_credits": { credits: 2500, obligation: 10 },
    "eote_5xp_1k_credits": { xp: 5, credits: 1000, obligation: 10 },
  });
});

test("getStartingBonus returns {} for unknown choice", () => {
  assert.deepEqual(getStartingBonus("??_5xp"), {});
  assert.deepEqual(getStartingBonus("aor_nope"), {});
  assert.deepEqual(getStartingBonus(null), {});
});

test("option list contains every stored starting bonus id", () => {
  assert.deepEqual(STARTING_BONUS_OPTIONS.map((option) => option.key), Object.keys(STARTING_BONUS));
});

test("ruleset option lists expose only that ruleset's choices", () => {
  assert.deepEqual(getStartingBonusOptions("aor").map((option) => option.key), [
    "aor_5xp", "aor_10xp", "aor_1k_credits", "aor_2k_credits", "aor_5xp_1k_credits",
  ]);
  assert.deepEqual(getStartingBonusOptions("fad").map((option) => option.key), [
    "fad_10xp", "fad_2k_credits", "fad_5xp", "fad_21_plus_morality", "fad_21_minus_morality",
  ]);
  assert.deepEqual(getStartingBonusOptions("eote").map((option) => option.key), [
    "eote_5xp", "eote_10xp", "eote_1k_credits", "eote_2k_credits", "eote_5xp_1k_credits",
  ]);
  assert.deepEqual(getStartingBonusOptions("unknown"), []);
});
