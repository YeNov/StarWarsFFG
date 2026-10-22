import test from "node:test";
import assert from "node:assert/strict";

import { DicePoolFFG } from "../../modules/dice/pool.js";
import { layerPool, optionDiceRows } from "../../modules/dice/roll-option-pool.js";

/**
 * What Two weapons and ticked roll options do to the dialog's pool, and the order every layer goes
 * on in (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "What a ticked option
 * does to the pool").
 */

// The planner resolves every value ("amount", live words) before the pool sees it.
const ticked = (dice, floor = null) => ({ dice, floor });
const counts = (pool) => ({
  ability: pool.ability, proficiency: pool.proficiency, difficulty: pool.difficulty, challenge: pool.challenge,
  boost: pool.boost, setback: pool.setback,
});
const layer = (base, { options = [], twoWeapons = "no", ...rest } = {}) =>
  layerPool(new DicePoolFFG(base), { rows: optionDiceRows(options, twoWeapons), ...rest });

test("two weapons add one or two difficulty dice", () => {
  assert.equal(layer({ difficulty: 2 }, { twoWeapons: "same" }).difficulty, 3);
  assert.equal(layer({ difficulty: 2 }, { twoWeapons: "different" }).difficulty, 4);
  assert.equal(layer({ difficulty: 2 }, { twoWeapons: "no" }).difficulty, 2);
});

test("Guns Blazing cancels the Two weapons die exactly, around an Adversary upgrade", () => {
  const withBoth = layer({ ability: 2, difficulty: 2 }, { twoWeapons: "same", options: [ticked({ difficulty: -1 })], adversaryRanks: 1 });
  const withNeither = layer({ ability: 2, difficulty: 2 }, { adversaryRanks: 1 });
  assert.deepEqual({ difficulty: withBoth.difficulty, challenge: withBoth.challenge }, { difficulty: 1, challenge: 1 });
  assert.deepEqual(counts(withBoth), counts(withNeither));
});

test("options and buffs share one pass", () => {
  const buffs = [{ rows: [{ modtype: "Dice Modifiers", mod: "Upgrade Difficulty", value: 1 }] }];
  const pool = layer({ difficulty: 0 }, { twoWeapons: "same", buffs });
  assert.deepEqual({ difficulty: pool.difficulty, challenge: pool.challenge }, { difficulty: 0, challenge: 1 });
});

test("resolved dice become counts and upgrades", () => {
  const pool = layer({ ability: 3 }, { options: [ticked({ upgradeAbility: 2 })] });
  assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: 1, proficiency: 2 });
  assert.equal(layer({ ability: 1 }, { options: [ticked({ boost: 2 })] }).boost, 2);
});

test("every dice key reaches the pool", () => {
  const pool = layer({ ability: 2, proficiency: 1, difficulty: 2, challenge: 1, setback: 2 }, {
    options: [ticked({ boost: 1, setback: 1, removeSetback: 1, downgradeAbility: 1, downgradeDifficulty: 1 })],
  });
  assert.deepEqual(
    { boost: pool.boost, setback: pool.setback, remsetback: pool.remsetback, ability: pool.ability, proficiency: pool.proficiency, difficulty: pool.difficulty, challenge: pool.challenge },
    { boost: 1, setback: 3, remsetback: 1, ability: 3, proficiency: 0, difficulty: 3, challenge: 0 },
  );
});

test("the base pool is never changed", () => {
  const base = new DicePoolFFG({ ability: 2, difficulty: 2, setback: 1 });
  const before = JSON.stringify(base);
  layerPool(base, { rows: optionDiceRows([ticked({ upgradeAbility: 2, difficulty: 1 })], "different"), defence: 2, adversaryRanks: 1 });
  assert.equal(JSON.stringify(base), before);
});

test("a negative manual setback survives and cancels defence", () => {
  assert.equal(layer({ setback: -1 }, { defence: 2 }).setback, 1);
  assert.equal(layer({ setback: -2 }, { defence: 1 }).setback, 0);
});

test("the Adversary upgrade waits for difficulty", () => {
  const none = layer({ difficulty: 0 }, { adversaryRanks: 2 });
  assert.deepEqual({ difficulty: none.difficulty, challenge: none.challenge }, { difficulty: 0, challenge: 0 });
  const twoWeapons = layer({ difficulty: 0 }, { twoWeapons: "same", adversaryRanks: 2 });
  assert.deepEqual({ difficulty: twoWeapons.difficulty, challenge: twoWeapons.challenge }, { difficulty: 1, challenge: 1 });
});

test("adversaryMode false skips the upgrade", () => {
  const pool = layer({ difficulty: 2 }, { adversaryRanks: 2, adversaryMode: false });
  assert.deepEqual({ difficulty: pool.difficulty, challenge: pool.challenge }, { difficulty: 2, challenge: 0 });
});

/* The talent review batch (2026-10-22). */

test("results, Force dice and Boost removal reach the pool", () => {
  const pool = layer({ boost: 2 }, { options: [ticked({ success: 1, advantage: 2, triumph: 1, threat: 1, failure: 1, despair: 1, force: 3, removeBoost: 1 })] });
  assert.deepEqual(
    [pool.success, pool.advantage, pool.triumph, pool.threat, pool.failure, pool.despair, pool.force, pool.boost],
    [1, 2, 1, 1, 1, 1, 3, 1],
  );
});

test("lowering difficulty removes difficulty dice, then challenge dice", () => {
  const pool = layer({ difficulty: 1, challenge: 2 }, { options: [ticked({ difficulty: -2 })] });
  assert.deepEqual({ difficulty: pool.difficulty, challenge: pool.challenge }, { difficulty: 0, challenge: 1 });
});

test("a floor stops its own reduction, and floored reductions go first", () => {
  const both = layer({ difficulty: 2 }, { options: [ticked({ difficulty: -1 }), ticked({ difficulty: -1 }, 1)] });
  assert.equal(both.difficulty, 0, "the floored one first (2 to 1), then the other (1 to 0)");
  assert.equal(layer({ difficulty: 1 }, { options: [ticked({ difficulty: -1 }, 1)] }).difficulty, 1);
  const red = layer({ challenge: 1 }, { options: [ticked({ difficulty: -1 }, 1)] });
  assert.deepEqual({ difficulty: red.difficulty, challenge: red.challenge }, { difficulty: 0, challenge: 1 }, "a red die counts toward the floor");
  assert.equal(layer({ difficulty: 0 }, { options: [ticked({ difficulty: -1 }, 1)] }).difficulty, 0, "a floor never adds dice");
});

test("Guns Blazing still cancels the Two weapons die exactly when the pool holds red dice", () => {
  const withBoth = layer({ challenge: 1 }, { twoWeapons: "same", options: [ticked({ difficulty: -1 })] });
  const withNeither = layer({ challenge: 1 });
  assert.deepEqual(counts(withBoth), counts(withNeither));
});

test("a swap travels to the pool through the skill layer", () => {
  const pool = layerPool(new DicePoolFFG({ ability: 1, proficiency: 1 }), { skill: { characteristic: 1, rank: 2, swapCharacteristic: 2 } });
  assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: 0, proficiency: 2 });
});
