/**
 * The minion group rules shared by minions and minion vehicle groups.
 *
 * A group has a size, a per-unit threshold and one combined damage track. A unit is lost each
 * time the damage EXCEEDS another per-unit threshold (the track is 1-indexed), and group skills
 * rank at units left - 1, capped at 5. Rule source: FFG Core Rulebook, "Minions", as this system
 * renders it in `modules/helpers/minion-group.js` and in
 * `docs/superpowers/specs/2026-09-14-minion-vehicle-groups-design.md` section 3.
 *
 * Every expected value below is a literal worked out by hand from that rule; nothing computes an
 * expectation with a second copy of the formula. The property tests compare units left before and
 * after a step, and the track bounds, never the stepper's own arithmetic.
 *
 * A worked track, 4 units at 6 per unit: damage 0-6 leaves 4 up, 7-12 leaves 3, 13-18 leaves 2,
 * 19-24 leaves 1, and 25 or more leaves none (25 is "one past the group threshold of 24").
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  HULL_PIP_LIMIT,
  groupThreshold,
  unitsLeft,
  groupSkillRank,
  stepUnits,
  wipeOutDamage,
  hullPoolSegments,
  prepareMinionVehicleHull,
} from "../../modules/helpers/minion-group.js";

test("the group threshold is the per-unit threshold times the group size", () => {
  assert.equal(groupThreshold(6, 4), 24);
  assert.equal(groupThreshold(0, 4), 0);
  assert.equal(groupThreshold(6, 0), 0);
  assert.equal(groupThreshold(-2, 4), 0);
});

// [per-unit threshold, group size, damage, units left]. For each loss point the rows sit just
// below the per-unit threshold (nothing lost), exactly on it (still nothing lost: the damage must
// EXCEED the threshold) and one above it (a unit is lost).
const UNITS_LEFT_BY_DAMAGE = [
  [6, 4, 0, 4],
  [6, 4, 5, 4],
  [6, 4, 6, 4],
  [6, 4, 7, 3],
  [6, 4, 11, 3],
  [6, 4, 12, 3],
  [6, 4, 13, 2],
  [6, 4, 23, 1],
  [6, 4, 24, 1],
  [6, 4, 25, 0],
  [6, 4, 26, 0],
  [6, 4, 99, 0],
  // one point per unit: every point of damage past the first costs a unit
  [1, 3, 1, 3],
  [1, 3, 2, 2],
  [1, 3, 3, 1],
  [1, 3, 4, 0],
  // a one-unit group is lost the moment its threshold is exceeded; a six-unit group of 3 keeps its last unit through 18
  [5, 1, 4, 1],
  [5, 1, 5, 1],
  [5, 1, 6, 0],
  [3, 6, 18, 1],
  [3, 6, 19, 0],
];

test("a unit is lost only when the damage exceeds another per-unit threshold", () => {
  for (const [perUnit, size, damage, left] of UNITS_LEFT_BY_DAMAGE) {
    assert.equal(
      unitsLeft(damage, perUnit, size),
      left,
      `${size} units of ${perUnit} at ${damage} damage`,
    );
  }
});

test("units left never rise with more damage and stay between none and the group size", () => {
  for (const perUnit of [1, 2, 3, 6]) {
    for (const size of [0, 1, 2, 5]) {
      let previous = size;
      for (let damage = 0; damage <= perUnit * size + 2 * perUnit; damage++) {
        const left = unitsLeft(damage, perUnit, size);
        const where = `${size} units of ${perUnit} at ${damage} damage`;
        assert.ok(left >= 0 && left <= size, `${where}: ${left} outside 0..${size}`);
        assert.ok(left <= previous, `${where}: ${left} units after ${previous}`);
        previous = left;
      }
    }
  }
});

test("a per-unit threshold of 0 keeps a clean group intact and wipes it out above 0 damage; a size-0 group has no units left", () => {
  assert.equal(unitsLeft(0, 0, 4), 4, "a clean group with no threshold is untouched");
  assert.equal(unitsLeft(1, 0, 4), 0, "any damage wipes out a group with no threshold");
  assert.equal(unitsLeft(0, -3, 4), 4, "a negative threshold behaves like 0");
  assert.equal(unitsLeft(2, -3, 4), 0);
  assert.equal(unitsLeft(3, 6, 0), 0, "no units to start with");
  assert.equal(unitsLeft(0, 6, 0), 0, "a clean empty group has no units either");
  assert.equal(unitsLeft(0, 0, 0), 0);
  assert.equal(unitsLeft(0, 6, -2), 0, "a negative size is an empty group");
});

test("group skills rank at units left minus one, between 0 and 5", () => {
  assert.equal(groupSkillRank(0), 0);
  assert.equal(groupSkillRank(1), 0);
  assert.equal(groupSkillRank(2), 1);
  assert.equal(groupSkillRank(4), 3);
  assert.equal(groupSkillRank(6), 5);
  assert.equal(groupSkillRank(9), 5);
  assert.equal(groupSkillRank(-3), 0);
});

// [damage, damage after destroying one unit]; 4 units of 6, so the group threshold is 24 and
// the wiped-out damage is 25. The partial damage is what sits on the unit after the lost ones.
const DESTROY_ONE_UNIT = [
  [0, 7, "a clean group loses a unit at one past the threshold, with no partial damage"],
  [1, 7, "1 damage carries no partial damage, so exactly one threshold more"],
  [3, 9, "2 partial damage is carried to the next unit"],
  [5, 11, "just below the per-unit threshold: 4 partial damage is carried"],
  [6, 12, "on the per-unit threshold no unit is lost yet: 5 partial damage is carried"],
  [7, 13, "just above the threshold one unit is already lost, so exactly one threshold more"],
  [12, 18, "partial damage survives the second loss"],
  [13, 19, "no partial damage, exactly one threshold more"],
  [18, 24, "2 units up to 1: the third loss keeps its 5 partial damage"],
  [19, 25, "the last unit goes, taking the group to the wiped-out damage"],
  [24, 25, "the last unit goes with partial damage on it, which cannot be kept"],
  [25, 25, "nothing left to destroy"],
];

test("destroying a unit keeps the partial damage on the next one", () => {
  for (const [damage, expected, why] of DESTROY_ONE_UNIT) {
    assert.equal(stepUnits(damage, 6, 4, -1), expected, `${damage} damage: ${why}`);
  }
  assert.equal(unitsLeft(stepUnits(9, 6, 4, -1), 6, 4), 2, "a unit fewer after the step");
});

// [damage, damage after reviving one unit]; the same 4 units of 6. Damage past the wipe-out (25)
// is the same wiped-out group: it is read as 25 before the unit moves, so one revive leaves
// exactly one unit up and no partial damage, however far the hits overshot.
const REVIVE_ONE_UNIT = [
  [25, 19, "a wiped-out group gets one unit back, with no partial damage"],
  [26, 19, "one point past the wipe-out is still a wiped-out group"],
  [100, 19, "damage far past the wipe-out revives exactly one unit"],
  [19, 13, "one more threshold comes off"],
  [13, 7, "one more threshold comes off"],
  [7, 0, "reviving the last lost unit leaves a clean group"],
  [24, 18, "5 partial damage is kept on the unit that stays"],
  [12, 6, "5 partial damage is kept when the first lost unit returns"],
  [11, 5, "4 partial damage is kept when the first lost unit returns"],
  [9, 3, "2 partial damage is kept when the first lost unit returns"],
  [6, 6, "no unit is lost, so there is nothing to revive and the partial damage stays"],
  [5, 5, "no unit is lost, so there is nothing to revive and the partial damage stays"],
  [1, 1, "no unit is lost, so there is nothing to revive and a single point of damage stays"],
  [0, 0, "a clean group stays clean"],
];

test("reviving a unit removes one threshold of damage, keeps partial damage, and leaves a clean group at 0", () => {
  for (const [damage, expected, why] of REVIVE_ONE_UNIT) {
    assert.equal(stepUnits(damage, 6, 4, 1), expected, `${damage} damage: ${why}`);
  }
  assert.equal(unitsLeft(stepUnits(13, 6, 4, 1), 6, 4), 3, "a unit more after the step");
});

test("a full group cannot gain a unit and loses one at a time; a wiped-out group cannot lose one", () => {
  assert.equal(unitsLeft(0, 6, 4), 4);
  assert.equal(stepUnits(0, 6, 4, 1), 0, "nothing to revive in a full group");
  assert.equal(unitsLeft(stepUnits(0, 6, 4, -1), 6, 4), 3, "the first loss from a full group");
  assert.equal(unitsLeft(25, 6, 4), 0);
  assert.equal(stepUnits(25, 6, 4, -1), 25, "nothing to destroy in a wiped-out group");
  assert.equal(unitsLeft(stepUnits(25, 6, 4, 1), 6, 4), 1, "the first unit back after a wipe-out");
});

test("an empty group has no unit to destroy or revive", () => {
  assert.equal(groupThreshold(6, 0), 0);
  assert.equal(unitsLeft(0, 6, 0), 0);
  assert.equal(stepUnits(0, 6, 0, -1), 0);
  assert.equal(stepUnits(0, 6, 0, 1), 0);
  assert.equal(stepUnits(1, 6, 0, -1), 1, "the one point past a threshold of 0 stays");
  assert.equal(stepUnits(1, 6, 0, 1), 1);
  assert.equal(wipeOutDamage(6, 0), 1, "one past a threshold of 0");
});

// The property tests walk a small grid of per-unit thresholds, group sizes and damage values.
// The last point of the damage track is one past the group threshold, the whole group lost.
const THRESHOLDS = [1, 2, 3, 6];
const SIZES = [0, 1, 2, 5];
const lastPoint = (perUnit, size) => perUnit * size + 1;
/** The damage already sitting on the unit that is up: nothing for a clean group. */
const partialOn = (damage, perUnit) => (damage >= 1 ? (damage - 1) % perUnit : 0);

test("one step changes the units left by exactly one where a unit can move, and by none at the ends", () => {
  for (const perUnit of THRESHOLDS) {
    for (const size of SIZES) {
      // past the last point too: a hit can overshoot the wipe-out, and a revive still brings one unit back
      for (let damage = 0; damage <= lastPoint(perUnit, size) + 2 * perUnit + 3; damage++) {
        for (const dir of [-1, 1]) {
          const before = unitsLeft(damage, perUnit, size);
          const after = unitsLeft(stepUnits(damage, perUnit, size, dir), perUnit, size);
          const canMove = dir === -1 ? before > 0 : before < size;
          assert.equal(
            after - before,
            canMove ? dir : 0,
            `${size} units of ${perUnit}, ${damage} damage, ${dir === -1 ? "destroy" : "revive"}`,
          );
        }
      }
    }
  }
});

// Spec section 3: a step "returns the input unchanged at either end": nothing to destroy in a
// wiped-out group, nothing to revive in a group that has lost no unit. That includes damage 1,
// which loses no unit and leaves no partial damage.
test("a step that cannot move a unit leaves the damage as it is", () => {
  for (const perUnit of THRESHOLDS) {
    for (const size of SIZES) {
      for (let damage = 0; damage <= lastPoint(perUnit, size); damage++) {
        const left = unitsLeft(damage, perUnit, size);
        if (left === 0) {
          assert.equal(stepUnits(damage, perUnit, size, -1), damage, `${size} units of ${perUnit}, ${damage} damage, destroy`);
        }
        if (left === size) {
          assert.equal(stepUnits(damage, perUnit, size, 1), damage, `${size} units of ${perUnit}, ${damage} damage, revive`);
        }
      }
    }
  }
});

test("a step keeps the damage on the track and the units left within the group", () => {
  for (const perUnit of THRESHOLDS) {
    for (const size of SIZES) {
      // past the last point too: a hit can overshoot the wipe-out
      for (let damage = 0; damage <= lastPoint(perUnit, size) + 2 * perUnit + 3; damage++) {
        for (const dir of [-1, 1]) {
          const result = stepUnits(damage, perUnit, size, dir);
          const where = `${size} units of ${perUnit}, ${damage} damage, dir ${dir}`;
          assert.ok(result >= 0 && result <= lastPoint(perUnit, size), `${where}: ${result} off the track`);
          const left = unitsLeft(result, perUnit, size);
          assert.ok(left >= 0 && left <= size, `${where}: ${left} units outside 0..${size}`);
        }
      }
    }
  }
});

test("a step keeps the partial damage unless it wipes out the group", () => {
  for (const perUnit of THRESHOLDS) {
    for (const size of SIZES) {
      for (let damage = 0; damage <= lastPoint(perUnit, size); damage++) {
        for (const dir of [-1, 1]) {
          const result = stepUnits(damage, perUnit, size, dir);
          if (unitsLeft(result, perUnit, size) === 0) continue;
          assert.equal(
            partialOn(result, perUnit),
            partialOn(damage, perUnit),
            `${size} units of ${perUnit}, ${damage} damage, dir ${dir}: partial damage changed`,
          );
        }
      }
    }
  }
});

test("destroying the last unit lands on the wiped-out damage", () => {
  for (const perUnit of THRESHOLDS) {
    for (const size of SIZES) {
      for (let damage = 0; damage <= lastPoint(perUnit, size); damage++) {
        if (unitsLeft(damage, perUnit, size) !== 1) continue;
        assert.equal(
          stepUnits(damage, perUnit, size, -1),
          wipeOutDamage(perUnit, size),
          `${size} units of ${perUnit}, ${damage} damage`,
        );
      }
    }
  }
});

// Spec section 3 (stepUnits row) and "Error handling": inputs are truncated to whole numbers, the
// per-unit threshold is floored at 1 and the size and damage at 0, as the Codex stepper always did.
// A per-unit threshold of 0 therefore steps like 1 here, while `unitsLeft` treats 0 as "no
// threshold" (the case above).
test("the stepper reads a per-unit threshold below 1 as 1, and a negative size or damage as 0", () => {
  assert.equal(stepUnits(0, 0, 4, -1), 2, "threshold 0 steps as 1: one threshold plus one");
  assert.equal(stepUnits(0, -3, 4, -1), 2, "a negative threshold steps as 1");
  assert.equal(stepUnits(2, 0, 4, 1), 0, "threshold 0 revives as 1");
  assert.equal(stepUnits(-5, 6, 4, -1), 7, "negative damage is a clean group");
  assert.equal(stepUnits(-5, 6, 4, 1), 0);
  assert.equal(stepUnits(0, 6, -2, -1), 0, "a negative size is an empty group");
  assert.equal(stepUnits(0, 6, -2, 1), 0);
});

test("the stepper truncates fractional inputs to whole numbers", () => {
  assert.equal(stepUnits(7.9, 6, 4, -1), 13, "damage 7.9 is 7");
  assert.equal(stepUnits(0, 6.9, 4, -1), 7, "threshold 6.9 is 6");
  assert.equal(stepUnits(19, 6, 4.9, -1), 25, "size 4.9 is 4, so the group ends at 25");
  assert.equal(stepUnits(25, 6, 4.9, 1), 19);
});

// code-only: the module and spec do not name non-numeric input, a step direction other than -1 or
// +1, or fractional/stringy values for the other helpers. These pin what the code does today so a
// change is deliberate; they are not a documented rule.
test("the stepper reads non-numeric damage and size as 0 and a numeric string as its number (code-only)", () => {
  assert.equal(stepUnits(undefined, 6, 4, -1), 7, "missing damage is a clean group");
  assert.equal(stepUnits("abc", 6, 4, -1), 7, "text damage is a clean group");
  assert.equal(stepUnits(NaN, 6, 4, -1), 7);
  assert.equal(stepUnits("7", 6, 4, -1), 13, "a numeric string is read as its number");
  assert.equal(stepUnits(0, 6, undefined, -1), 0, "a missing size is an empty group");
});

test("a step with no direction, or a direction of 0, moves no unit when a unit is already lost (code-only)", () => {
  assert.equal(stepUnits(7, 6, 4, 0), 7);
  assert.equal(stepUnits(9, 6, 4, 0), 9, "the partial damage is re-attached as it was");
  assert.equal(stepUnits(7, 6, 4, undefined), 7);
});

test("the other group helpers truncate fractions and read non-numeric input as 0 (code-only)", () => {
  assert.equal(groupThreshold("6", 4), 24);
  assert.equal(groupThreshold(6.9, 4.9), 24, "whole numbers only");
  assert.equal(groupThreshold(undefined, 4), 0);
  assert.equal(unitsLeft(NaN, 6, 4), 4);
  assert.equal(unitsLeft(7.9, 6, 4), 3);
  assert.equal(groupSkillRank(undefined), 0);
  assert.equal(groupSkillRank(2.9), 1);
});

test("wiping out a group takes it one past the group threshold", () => {
  assert.equal(wipeOutDamage(6, 4), 25);
  assert.equal(unitsLeft(wipeOutDamage(6, 4), 6, 4), 0);
  assert.equal(unitsLeft(wipeOutDamage(0, 4), 0, 4), 0);
});

test("the hull pool shows one row of pips per vehicle below the pip limit", () => {
  assert.deepEqual(hullPoolSegments(8, 3, 3), [
    { bar: false, pips: [true, true, true] },
    { bar: false, pips: [true, true, true] },
    { bar: false, pips: [true, true, false] },
  ]);
  assert.deepEqual(hullPoolSegments(5, 3, 0), []);
});

test("a per-vehicle hull at the pip limit or above is one bar per vehicle", () => {
  assert.deepEqual(hullPoolSegments(30, HULL_PIP_LIMIT, 2), [
    { bar: true, pct: 100 },
    { bar: true, pct: 50 },
  ]);
});

test("preparing a minion vehicle pools the hull once, however often it runs", () => {
  const system = { stats: { hullTrauma: { value: 13, max: 6 } }, quantity: { value: 1, max: 4 } };
  prepareMinionVehicleHull(system);
  assert.deepEqual(system.stats.hullTrauma, { value: 13, max: 24, unit: 6 });
  assert.equal(system.quantity.value, 2);
  prepareMinionVehicleHull(system);
  assert.equal(system.stats.hullTrauma.max, 24);
  assert.equal(system.quantity.value, 2);
  assert.doesNotThrow(() => prepareMinionVehicleHull({}));
});
