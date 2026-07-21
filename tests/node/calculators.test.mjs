/**
 * Node tests for the pure PC Wizard calculators (Stage 5).
 *
 * calcObligation's per-choice adjustments are the Stage-5 inline branches; Stage 7
 * moves them to the STARTING_BONUS table and this suite re-runs against it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { calcXp, calcCredits, calcObligation } from "../../modules/char-creator/calculators.js";

/** A fresh, fully-formed default wizard state; tests mutate the returned object. */
function makeData() {
  return {
    selected: {
      species: { snapshot: { system: { startingXP: 100 } } },
      rules: "fad",
      startingBonus: undefined,
    },
    grants: {
      bonus: { xp: 0, credits: 0 },
      gm: { credits: 500 },
    },
    initial: { morality: 50, obligation: 10, duty: 10 },
    purchases: {
      xp: { characteristics: [], skills: [], talents: [], specializations: [], forcePowers: [] },
      credits: [],
    },
  };
}

/** A default draft with rules/startingBonus applied, for obligation cases. */
function withChoice(rules, startingBonus) {
  const data = makeData();
  data.selected.rules = rules;
  data.selected.startingBonus = startingBonus;
  return data;
}

test("calcXp: total = species startingXP + bonus.xp", () => {
  const data = makeData();
  data.grants.bonus.xp = 10;
  const { total, available } = calcXp(data);
  assert.equal(total, 110);
  assert.equal(available, 110);
});

test("calcXp: available subtracts every XP purchase category", () => {
  const data = makeData();
  data.purchases.xp.characteristics = [{ cost: 30 }];
  data.purchases.xp.skills = [{ cost: 10 }, { cost: 5 }];
  data.purchases.xp.talents = [{ cost: 5 }];
  data.purchases.xp.specializations = [{ cost: 20 }];
  data.purchases.xp.forcePowers = [{ cost: 25 }];
  const { total, available } = calcXp(data);
  assert.equal(total, 100);
  assert.equal(available, 100 - 30 - 15 - 5 - 20 - 25);
});

test("calcXp: missing species snapshot startingXP defaults to 0", () => {
  const data = makeData();
  data.selected.species = {};
  assert.equal(calcXp(data).total, 0);
});

test("calcCredits: total = gm + bonus, available subtracts purchases", () => {
  const data = makeData();
  data.grants.bonus.credits = 100;
  data.purchases.credits = [{ cost: 250 }, { cost: 50 }];
  const { total, available } = calcCredits(data);
  assert.equal(total, 600);
  assert.equal(available, 300);
});

test("calcObligation fad: morality key, +21 and -21 branches", () => {
  assert.deepEqual(calcObligation(withChoice("fad", undefined)),
    { starting: 50, available: 50, key: "morality" });
  assert.deepEqual(calcObligation(withChoice("fad", "21_plus_morality")),
    { starting: 50, available: 71, key: "morality" });
  assert.deepEqual(calcObligation(withChoice("fad", "21_minus_morality")),
    { starting: 50, available: 29, key: "morality" });
});

test("calcObligation eote: obligation key, xp/credit choices ADD", () => {
  assert.equal(calcObligation(withChoice("eote", "5xp")).available, 15);
  assert.equal(calcObligation(withChoice("eote", "10xp")).available, 20);
  assert.equal(calcObligation(withChoice("eote", "1k_credits")).available, 15);
  assert.equal(calcObligation(withChoice("eote", "2k_credits")).available, 20);
  assert.equal(calcObligation(withChoice("eote", undefined)).key, "obligation");
});

test("calcObligation aor: duty key, xp/credit choices SUBTRACT", () => {
  assert.equal(calcObligation(withChoice("aor", "5xp")).available, 5);
  assert.equal(calcObligation(withChoice("aor", "10xp")).available, 0);
  assert.equal(calcObligation(withChoice("aor", "1k_credits")).available, 5);
  assert.equal(calcObligation(withChoice("aor", "2k_credits")).available, 0);
  assert.equal(calcObligation(withChoice("aor", undefined)).key, "duty");
});

test("calcObligation: unknown ruleset yields no key and zeros", () => {
  assert.deepEqual(calcObligation(withChoice("??", undefined)), { starting: 0, available: 0, key: undefined });
});
