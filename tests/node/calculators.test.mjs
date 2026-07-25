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
      startingBonus: undefined,
      rules: "fad",
    },
    grants: {
      bonus: { xp: 0, credits: 0 },
      gm: { credits: 500 },
      extra: { xp: 0, credits: 0 },
    },
    initial: { morality: 50, obligation: 10, duty: 10 },
    purchases: {
      xp: { characteristics: [], skills: [], talents: [], specializations: [], forcePowers: [] },
      credits: [],
    },
  };
}

/** A default draft with bonus grants applied, for obligation cases. */
function withBonus(bonus = {}) {
  const data = makeData();
  data.grants.bonus = { ...data.grants.bonus, ...bonus };
  return data;
}

test("calcXp: total = species startingXP + bonus.xp + extra.xp", () => {
  const data = makeData();
  data.grants.bonus.xp = 10;
  data.grants.extra.xp = 5;
  const { total, available } = calcXp(data);
  assert.equal(total, 115);
  assert.equal(available, 115);
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

test("calcCredits: total = gm + bonus + extra, available subtracts purchases", () => {
  const data = makeData();
  data.grants.bonus.credits = 100;
  data.grants.extra.credits = 25;
  data.purchases.credits = [{ cost: 250 }, { cost: 50 }];
  const { total, available } = calcCredits(data);
  assert.equal(total, 625);
  assert.equal(available, 325);
});

test("calcObligation returns the selected ruleset track", () => {
  assert.deepEqual(calcObligation(withBonus()), {
    starting: 50,
    available: 50,
    key: "morality",
  });
});

test("calcObligation applies field-specific bonus conventions", () => {
  const eote5 = withBonus({ obligation: 5 });
  eote5.selected.rules = "eote";
  assert.equal(calcObligation(eote5).available, 15);
  const eote10 = withBonus({ obligation: 10 });
  eote10.selected.rules = "eote";
  assert.equal(calcObligation(eote10).available, 20);

  const aor5 = withBonus({ duty: 5 });
  aor5.selected.rules = "aor";
  assert.equal(calcObligation(aor5).available, 5);
  const aor10 = withBonus({ duty: 10 });
  aor10.selected.rules = "aor";
  assert.equal(calcObligation(aor10).available, 0);

  assert.equal(calcObligation(withBonus({ morality: 21 })).available, 71);
  assert.equal(calcObligation(withBonus({ morality: -21 })).available, 29);
});
