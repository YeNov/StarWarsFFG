/**
 * The minion group rules shared by minions and minion vehicle groups.
 *
 * A group has a size, a per-unit threshold and one combined damage track. A unit is lost each
 * time the damage EXCEEDS another per-unit threshold (the track is 1-indexed), and group skills
 * rank at units left - 1, capped at 5. The stepper arithmetic was lifted out of the Codex minion
 * sheet, so it is pinned against a verbatim copy of the original.
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

test("a unit is lost only when the damage exceeds another per-unit threshold", () => {
  const left = (damage) => unitsLeft(damage, 6, 4);
  assert.equal(left(0), 4);
  assert.equal(left(6), 4);
  assert.equal(left(7), 3);
  assert.equal(left(12), 3);
  assert.equal(left(13), 2);
  assert.equal(left(24), 1);
  assert.equal(left(25), 0);
  assert.equal(left(99), 0);
});

test("a per-unit threshold of zero never divides by zero", () => {
  assert.equal(unitsLeft(0, 0, 4), 4);
  assert.equal(unitsLeft(1, 0, 4), 0);
  assert.equal(unitsLeft(3, 6, 0), 0);
});

test("group skills rank at units left minus one, between 0 and 5", () => {
  assert.equal(groupSkillRank(0), 0);
  assert.equal(groupSkillRank(1), 0);
  assert.equal(groupSkillRank(2), 1);
  assert.equal(groupSkillRank(4), 3);
  assert.equal(groupSkillRank(6), 5);
  assert.equal(groupSkillRank(9), 5);
});

test("destroying a unit keeps the partial damage on the next one", () => {
  assert.equal(stepUnits(0, 6, 4, -1), 7, "a clean group loses one unit with no partial");
  assert.equal(stepUnits(7, 6, 4, -1), 13, "then exactly one threshold more");
  assert.equal(stepUnits(3, 6, 4, -1), 9, "2 partial damage is carried over");
  assert.equal(unitsLeft(9, 6, 4), 3);
  assert.equal(stepUnits(25, 6, 4, -1), 25, "nothing left to destroy");
});

test("reviving a unit is the reverse, and a clean group stays clean", () => {
  assert.equal(stepUnits(13, 6, 4, 1), 7);
  assert.equal(stepUnits(9, 6, 4, 1), 3);
  assert.equal(stepUnits(7, 6, 4, 1), 0);
  assert.equal(stepUnits(3, 6, 4, 1), 3);
  assert.equal(stepUnits(0, 6, 4, 1), 0);
});

/** The Codex minion stepper's arithmetic, copied verbatim from codex-sheets.js before it moved. */
function codexMinionStep(woundsValue, unitWounds, quantityMax, dir) {
  const unit = Math.max(1, Math.trunc(Number(unitWounds) || 1));
  const qmax = Math.max(0, Math.trunc(Number(quantityMax) || 0));
  const cur = Math.max(0, Math.trunc(Number(woundsValue) || 0));
  const ceiling = qmax * unit + 1;
  const deaths = cur >= 1 ? Math.floor((cur - 1) / unit) : 0;
  const partial = cur >= 1 ? (cur - 1) - deaths * unit : 0;
  const targetDeaths = Math.max(0, Math.min(qmax, deaths - dir));
  return (targetDeaths === 0 && partial === 0)
    ? 0
    : Math.max(0, Math.min(ceiling, targetDeaths * unit + partial + 1));
}

test("stepping reproduces the Codex minion stepper exactly", () => {
  for (const unit of [0, 1, 2, 3, 5, 12]) {
    for (const size of [0, 1, 3, 6]) {
      for (let wounds = 0; wounds <= 80; wounds++) {
        for (const dir of [-1, 1]) {
          assert.equal(
            stepUnits(wounds, unit, size, dir),
            codexMinionStep(wounds, unit, size, dir),
            `wounds ${wounds}, unit ${unit}, size ${size}, dir ${dir}`,
          );
        }
      }
    }
  }
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
