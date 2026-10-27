import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { applyWeaponAdjust, cardWeaponStats, sumWeaponAdjust } from "../../modules/helpers/roll-option-weapon.js";
import { rollOptionCardEntries } from "../../modules/helpers/roll-option-card.js";
import { planOptionStates } from "../../modules/helpers/roll-option-costs.js";

/**
 * What ticked roll options do to the attacking weapon's chat card copy
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Amendments: weapon damage and
 * crit from options").
 */

const copy = ({ damage = 5, damageAdjusted = damage, crit = 3, critAdjusted = crit } = {}) =>
  ({ name: "Blaster", system: { damage: { value: damage, adjusted: damageAdjusted }, crit: { value: crit, adjusted: critAdjusted } } });

test("the sum of the entries' weapon numbers", () => {
  assert.deepEqual(sumWeaponAdjust([{ weapon: { damage: 2, critical: 0 } }, { weapon: { damage: 1, critical: -1 } }, { weapon: null }, {}]),
    { damage: 3, critical: -1 });
  assert.equal(sumWeaponAdjust([{ weapon: { damage: 0, critical: 0 } }]), null);
  assert.equal(sumWeaponAdjust([]), null);
  assert.equal(sumWeaponAdjust(undefined), null);
});

test("the numbers come from the entries captured at the click, not a later plan", () => {
  const pointBlank = {
    key: "pb", label: "Point Blank", source: "Point Blank", ranked: true, rank: 2, hint: null, twoWeapons: null,
    amount: null, cost: { strain: 0, maneuvers: 0 }, dice: {}, weapon: { damage: 2 },
  };
  const planWith = (selection) => planOptionStates({ offered: [pointBlank], selection, twoWeapons: "no", pool: null, canCharge: true });
  const captured = rollOptionCardEntries({ offered: [pointBlank], states: planWith({ pb: 1 }), twoWeapons: "no" });
  const atClick = sumWeaponAdjust(captured);
  // A target change during the awaits re-plans the card, here with the row unticked.
  const later = rollOptionCardEntries({ offered: [pointBlank], states: planWith({}), twoWeapons: "no" });
  assert.deepEqual(atClick, { damage: 2, critical: 0 });
  assert.deepEqual(sumWeaponAdjust(captured), { damage: 2, critical: 0 });
  assert.equal(sumWeaponAdjust(later), null);
});

test("the bonus goes on top of the adjusted values", () => {
  const data = applyWeaponAdjust(copy({ damage: 5, damageAdjusted: 7 }), { damage: 2, critical: 0 });
  assert.equal(data.system.damage.adjusted, 9);
  assert.equal(data.system.crit.adjusted, 3);
});

test("a copy never adjusted in the sheet starts from its raw values", () => {
  const data = applyWeaponAdjust(copy({ damage: 5, damageAdjusted: 0, crit: 3, critAdjusted: 0 }), { damage: 2, critical: -1 });
  assert.equal(data.system.damage.adjusted, 7);
  assert.equal(data.system.crit.adjusted, 2);
});

test("damage stops at 0 and crit at 1", () => {
  assert.equal(applyWeaponAdjust(copy({ crit: 1 }), { damage: 0, critical: -1 }).system.crit.adjusted, 1);
  assert.equal(applyWeaponAdjust(copy({ damage: 1 }), { damage: -3, critical: 0 }).system.damage.adjusted, 0);
});

test("applying twice changes nothing more", () => {
  const data = applyWeaponAdjust(copy(), { damage: 2, critical: -1 });
  applyWeaponAdjust(data, { damage: 2, critical: -1 });
  assert.deepEqual([data.system.damage.adjusted, data.system.crit.adjusted], [7, 2]);
});

test("nothing to apply, or nothing to apply it to", () => {
  assert.deepEqual(applyWeaponAdjust(copy(), null), copy());
  const gear = { name: "Comlink", system: {} };
  assert.deepEqual(applyWeaponAdjust(gear, { damage: 1, critical: 0 }), { name: "Comlink", system: {} });
});

test("the card's numbers keep an option's 0 damage and its crit", () => {
  const data = applyWeaponAdjust(copy({ damage: 1, crit: 3 }), { damage: -1, critical: -1 });
  assert.deepEqual(cardWeaponStats(data.system), { damage: 0, crit: 2 });
});

test("without an option, the card's numbers follow today's rule", () => {
  assert.deepEqual(cardWeaponStats(copy({ damage: 5, damageAdjusted: 7, crit: 3, critAdjusted: 2 }).system), { damage: 7, crit: 2 });
  assert.deepEqual(cardWeaponStats(copy({ damage: 5, damageAdjusted: 0, crit: 3, critAdjusted: 2 }).system), { damage: 5, crit: 3 });
  assert.deepEqual(cardWeaponStats({}), { damage: 0, crit: 0 });
});
