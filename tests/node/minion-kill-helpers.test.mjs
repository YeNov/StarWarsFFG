/**
 * The kill and wipe-out updates behind the sheet buttons, the Codex Wipe Out and Apply Crit.
 *
 * Every kill takes exactly one member out of the group and keeps any partial damage already
 * sitting on the next one: a minion group loses a minion, a minion vehicle group loses a vehicle.
 * The track is 1-indexed (a member is lost when the damage EXCEEDS another per-member threshold),
 * so a clean group of 4 with 3 wounds each loses its first minion at 4 wounds, its second at 7,
 * its third at 10 and its last at 13, which is also the wipe-out. A group with partial damage
 * keeps it: 2 wounds is 1 partial wound, so the first kill lands on 5, not 4. Source: the minion
 * rules as `modules/helpers/minion-group.js` renders them and the minion vehicle group design,
 * `docs/superpowers/specs/2026-09-14-minion-vehicle-groups-design.md`. Every value is a literal.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getKillMinionUpdate, getKillMinionGroupUpdate, killMinion } from "../../modules/helpers/minions.js";
import { unitsLeft } from "../../modules/helpers/minion-group.js";

/** A prepared squadron of 4 with 6 hull each. */
const squadron = (value, hull = { value, max: 24, unit: 6 }) => ({
  type: "vehicle",
  flags: { starwarsffg: { config: { minionVehicle: true } } },
  system: { stats: { hullTrauma: hull }, quantity: { value: 4, max: 4 } },
});

/**
 * A prepared minion group: `size` members with `unit` wounds each, `wounds` taken so far.
 * `quantity.value` is the derived count of members standing; it is passed in because the helper
 * must size the group from `quantity.max`, so a test can make the two disagree.
 */
const minionGroup = (wounds, { unit = 3, size = 4, standing = size } = {}) => ({
  type: "minion",
  system: {
    stats: { wounds: { value: wounds, max: unit * size } },
    unit_wounds: { value: unit },
    quantity: { value: standing, max: size },
  },
});

const WOUNDS = "system.stats.wounds.value";

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

test("a plain vehicle is not a group, so killing a minion on it writes nothing", () => {
  const plain = { type: "vehicle", flags: {}, system: { stats: { hullTrauma: { value: 0, max: 6 } } } };
  assert.equal(getKillMinionUpdate(plain), null);
});

test("the first kill on a clean minion group takes it to one past the first member's wounds", () => {
  assert.deepEqual(getKillMinionUpdate(minionGroup(0)), { [WOUNDS]: 4 });
});

test("wiping out a minion group takes it one past the group's wounds", () => {
  assert.deepEqual(getKillMinionGroupUpdate(minionGroup(0)), { [WOUNDS]: 13 });
  assert.deepEqual(getKillMinionGroupUpdate(minionGroup(5)), { [WOUNDS]: 13 });
});

// [wounds before the kill, wounds after], a group of 4 minions with 3 wounds each.
const MINION_KILLS = [
  [0, 4, "a clean group loses its first minion at one past 3"],
  [4, 7, "the second kill adds exactly 3 wounds, not 4"],
  [7, 10, "the third kill adds exactly 3 wounds"],
  [10, 13, "the last minion goes, which is the wipe-out value"],
  [1, 4, "1 wound is a clean group, so the same first kill"],
  [2, 5, "1 partial wound stays on the next minion"],
  [3, 6, "2 partial wounds stay on the next minion"],
  [5, 8, "1 partial wound survives the second kill"],
  [6, 9, "2 partial wounds survive the second kill"],
  [8, 11, "1 partial wound survives the third kill"],
  [9, 12, "2 partial wounds survive the third kill"],
  [11, 13, "the partial wound on the last minion goes with it: the wipe-out value"],
  [12, 13, "the partial wounds on the last minion go with it: the wipe-out value"],
];

test("every minion kill adds exactly one member's wounds and keeps the partial wounds", () => {
  for (const [before, after, why] of MINION_KILLS) {
    assert.deepEqual(getKillMinionUpdate(minionGroup(before)), { [WOUNDS]: after }, `${before} wounds: ${why}`);
  }
});

test("a kill with no minion left to destroy writes nothing, even after a hit that overshot the wipe-out", () => {
  assert.equal(getKillMinionUpdate(minionGroup(13)), null);
  assert.equal(getKillMinionUpdate(minionGroup(14)), null, "one wound past the wipe-out is not pulled back to 13");
  assert.equal(getKillMinionUpdate(minionGroup(20)), null);
  assert.equal(getKillMinionUpdate(squadron(26)), null, "the same for a squadron's hull");
  assert.equal(getKillMinionUpdate(squadron(100)), null);
});

test("a minion group with no wounds per member cannot lose a minion", () => {
  assert.equal(getKillMinionUpdate(minionGroup(0, { unit: 0 })), null);
  assert.equal(getKillMinionUpdate(minionGroup(2, { unit: 0 })), null);
  const noUnit = minionGroup(0);
  delete noUnit.system.unit_wounds;
  assert.equal(getKillMinionUpdate(noUnit), null);
});

test("an empty minion group has nothing to kill, with or without wounds on it", () => {
  assert.equal(getKillMinionUpdate(minionGroup(0, { size: 0 })), null);
  assert.equal(getKillMinionUpdate(minionGroup(1, { size: 0 })), null);
  assert.equal(getKillMinionUpdate(minionGroup(5, { size: 0 })), null, "wounds on an empty group are not rewritten");
});

test("a minion kill sizes the group from its maximum, not from the minions still standing", () => {
  // 10 wounds leaves 1 of 4 standing; the last minion goes, which is 13, not a clamp to a group of 1
  assert.deepEqual(getKillMinionUpdate(minionGroup(10, { standing: 1 })), { [WOUNDS]: 13 });
  assert.deepEqual(getKillMinionUpdate(minionGroup(4, { standing: 3 })), { [WOUNDS]: 7 });
});

test("a group of one minion is lost on the first kill", () => {
  assert.deepEqual(getKillMinionUpdate(minionGroup(0, { unit: 5, size: 1 })), { [WOUNDS]: 6 });
  assert.equal(getKillMinionUpdate(minionGroup(6, { unit: 5, size: 1 })), null);
});

/** A minion actor whose update is applied to its own data, as Foundry does. */
function killableMinion(wounds) {
  const actor = minionGroup(wounds);
  actor.updates = 0;
  actor.update = async (changes) => {
    actor.updates += 1;
    actor.system.stats.wounds.value = changes[WOUNDS];
  };
  return actor;
}

test("kill minion removes exactly one minion each time until none is left", async () => {
  const actor = killableMinion(0);
  const standing = () => unitsLeft(actor.system.stats.wounds.value, 3, 4);

  assert.equal(standing(), 4);
  for (const [wounds, left] of [[4, 3], [7, 2], [10, 1], [13, 0]]) {
    assert.equal(await killMinion(actor), true);
    assert.equal(actor.system.stats.wounds.value, wounds);
    assert.equal(standing(), left, `${wounds} wounds`);
  }

  assert.equal(await killMinion(actor), false, "nothing left to kill");
  assert.equal(actor.updates, 4, "the empty group is not written");
  assert.equal(actor.system.stats.wounds.value, 13);
});

test("kill minion leaves a group that a hit took past the wipe-out as it is", async () => {
  const actor = killableMinion(20);
  assert.equal(await killMinion(actor), false);
  assert.equal(actor.updates, 0);
  assert.equal(actor.system.stats.wounds.value, 20);
});

test("kill minion keeps the partial damage of a hurt group", async () => {
  const actor = killableMinion(2);
  assert.equal(unitsLeft(2, 3, 4), 4);

  await killMinion(actor);
  assert.equal(actor.system.stats.wounds.value, 5);
  assert.equal(unitsLeft(5, 3, 4), 3, "one minion fewer");

  await killMinion(actor);
  assert.equal(actor.system.stats.wounds.value, 8);
  assert.equal(unitsLeft(8, 3, 4), 2, "one minion fewer again");
});
