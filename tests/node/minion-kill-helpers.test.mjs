/**
 * The kill and wipe-out updates behind the sheet buttons, the Codex Wipe Out and Apply Crit.
 * A minion vehicle group loses a whole vehicle and keeps the partial hull damage on the next one.
 * Minions keep their existing arithmetic.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getKillMinionUpdate, getKillMinionGroupUpdate } from "../../modules/helpers/minions.js";

/** A prepared squadron of 4 with 6 hull each. */
const squadron = (value, hull = { value, max: 24, unit: 6 }) => ({
  type: "vehicle",
  flags: { starwarsffg: { config: { minionVehicle: true } } },
  system: { stats: { hullTrauma: hull }, quantity: { value: 4, max: 4 } },
});

test("destroying a vehicle in a minion vehicle group keeps the partial hull damage", () => {
  assert.deepEqual(getKillMinionUpdate(squadron(0)), { "system.stats.hullTrauma.value": 7 });
  assert.deepEqual(getKillMinionUpdate(squadron(3)), { "system.stats.hullTrauma.value": 9 });
  assert.equal(getKillMinionUpdate(squadron(25)), null);
});

test("a group with no per-vehicle hull cannot lose a vehicle", () => {
  assert.equal(getKillMinionUpdate(squadron(0, { value: 0, max: 0, unit: 0 })), null);
});

test("wiping out a minion vehicle group takes it one past the group threshold", () => {
  assert.deepEqual(getKillMinionGroupUpdate(squadron(3)), { "system.stats.hullTrauma.value": 25 });
});

test("a plain vehicle is not a group, and minions keep their existing arithmetic", () => {
  const plain = { type: "vehicle", flags: {}, system: { stats: { hullTrauma: { value: 0, max: 6 } } } };
  assert.equal(getKillMinionUpdate(plain), null);

  const minion = {
    type: "minion",
    system: { stats: { wounds: { value: 0, max: 12 } }, unit_wounds: { value: 3 }, quantity: { value: 4, max: 4 } },
  };
  assert.deepEqual(getKillMinionUpdate(minion), { "system.stats.wounds.value": 4 });
  assert.deepEqual(getKillMinionGroupUpdate(minion), { "system.stats.wounds.value": 13 });
});
