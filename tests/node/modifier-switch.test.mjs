import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import {
  attributeShowsEnabled,
  isAttributeSuspended,
  isModifierSuspended,
  planAttributeToggle,
  switchedOn,
} from "../../modules/helpers/modifier-switch.js";
import ItemHelpers from "../../modules/helpers/item-helpers.js";
import ModifierHelpers from "../../modules/helpers/modifiers.js";

/**
 * One rule for when a modifier is switched off (open decisions R14, R33, R34):
 *
 *   - a quality or modification is off only when its `system.active` is exactly `false`. A
 *     quality dropped into an attachment has no `active` at all and counts as installed (R33);
 *   - an item's own modifier row is off only when its `active` is exactly `false`. The row's
 *     Enabled box writes that value, so equipping, unequipping and reconciling the item can read
 *     it back instead of switching the row on again (R34).
 */

// --- the rule ------------------------------------------------------------------------

test("only an explicit `active: false` switches a quality or modification off", () => {
  assert.equal(isModifierSuspended({ system: { active: false } }), true);
  assert.equal(isModifierSuspended({ system: { active: true } }), false);
  assert.equal(isModifierSuspended({ system: {} }), false);
  assert.equal(isModifierSuspended({ name: "no system" }), false);
  assert.equal(isModifierSuspended(undefined), false);
});

test("only an explicit `active: false` switches one of an item's own modifier rows off", () => {
  assert.equal(isAttributeSuspended({ modtype: "Stat", mod: "Soak", value: 1, active: false }), true);
  assert.equal(isAttributeSuspended({ modtype: "Stat", mod: "Soak", value: 1, active: true }), false);
  assert.equal(isAttributeSuspended({ modtype: "Stat", mod: "Soak", value: 1 }), false);
  assert.equal(isAttributeSuspended(undefined), false);
});

test("a list keeps the qualities that are not switched off, in order", () => {
  const list = [
    { name: "Unset", system: {} },
    { name: "Off", system: { active: false } },
    { name: "On", system: { active: true } },
  ];

  assert.deepEqual(switchedOn(list).map((modifier) => modifier.name), ["Unset", "On"]);
  assert.deepEqual(switchedOn(undefined), []);
});

// --- what the Enabled box shows --------------------------------------------------------

test("the Enabled box is unticked for a row switched off, whatever its effect says", () => {
  assert.equal(attributeShowsEnabled({ active: false }, { disabled: false }), false);
  assert.equal(attributeShowsEnabled({ active: false }, { disabled: true }), false);
  assert.equal(attributeShowsEnabled({ active: false }, undefined), false);
});

test("otherwise the Enabled box shows the row's effect, so an effect stuck off shows unticked", () => {
  assert.equal(attributeShowsEnabled({}, { disabled: true }), false);
  assert.equal(attributeShowsEnabled({}, { disabled: false }), true);
  assert.equal(attributeShowsEnabled({ active: true }, { disabled: false }), true);
  assert.equal(attributeShowsEnabled({}, undefined), true);
});

// --- what the Enabled box writes -------------------------------------------------------

const soak = (extra = {}) => ({ modtype: "Stat", mod: "Soak", value: 1, ...extra });

test("unticking Enabled stores `active: false` on the row and disables its effect", () => {
  const weapon = { type: "weapon", system: { equippable: { equipped: true }, attributes: { attr1700000000001: soak() } } };

  assert.deepEqual(planAttributeToggle(weapon, "attr1700000000001", false), {
    update: { "system.attributes.attr1700000000001.active": false },
    effectDisabled: true,
  });
});

test("ticking Enabled stores `active: true` and enables the effect at once, equipped or not", () => {
  // The box is also the way to recover an effect an interrupted Edit Mode suspend left off, and
  // a vehicle's ship weapons are never equipped; equip state applies again at the next toggle.
  for (const equipped of [true, false]) {
    const weapon = { type: "weapon", system: { equippable: { equipped }, attributes: { attr1700000000001: soak({ active: false }) } } };

    assert.deepEqual(planAttributeToggle(weapon, "attr1700000000001", true), {
      update: { "system.attributes.attr1700000000001.active": true },
      effectDisabled: false,
    });
  }
});

test("a row the item does not carry plans no write", () => {
  const weapon = { type: "weapon", system: { equippable: { equipped: true }, attributes: {} } };

  assert.equal(planAttributeToggle(weapon, "attr1700000000001", false), null);
});

// --- the toggle survives equip, unequip and reconcile ----------------------------------

/**
 * An item document reduced to what the Enabled toggle, the equip / carried loop and the
 * reconciler read and write: its data, its effects, and the four writes they make.
 */
function fakeItem({ type = "weapon", system, flags = {}, effects }) {
  const fakeEffect = (id, data) => ({
    id,
    ...data,
    async update(changes) { Object.assign(this, changes); },
  });
  return {
    type,
    name: "Fixture",
    pack: null,
    isEmbedded: false,
    system,
    flags,
    effects: effects.map((effect, index) => fakeEffect(`effect${index}`, effect)),
    getEmbeddedCollection() { return this.effects; },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(this, path, value);
    },
    async updateEmbeddedDocuments(_type, updates) {
      for (const { _id, ...data } of updates) Object.assign(this.effects.find((effect) => effect.id === _id), data);
    },
    async createEmbeddedDocuments(_type, data) {
      for (const entry of data) this.effects.push(fakeEffect(`effect${this.effects.length}`, entry));
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects = this.effects.filter((effect) => !ids.includes(effect.id));
    },
  };
}

/** The two own rows of the fixture weapon, Soak +1 and Defence-Melee +1, with matching effects. */
function weaponWithTwoRows({ equipped = true, soakEffectDisabled = false } = {}) {
  return fakeItem({
    system: {
      equippable: { equipped },
      attributes: {
        attr1700000000001: soak(),
        attr1700000000002: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
      },
      itemmodifier: [],
      itemattachment: [],
    },
    effects: [
      {
        name: "attr1700000000001",
        changes: [{ key: "system.stats.soak.value", mode: AE_MODES.ADD, value: "1" }],
        disabled: soakEffectDisabled || !equipped,
      },
      {
        name: "attr1700000000002",
        changes: [{ key: "system.stats.defence.melee", mode: AE_MODES.ADD, value: "1" }],
        disabled: !equipped,
      },
    ],
  });
}

/** What ItemFFG#_onUpdate does when the equipped state changes. */
async function setEquipped(item, equipped) {
  item.system.equippable.equipped = equipped;
  await ItemHelpers.followItemState(item, item.getEmbeddedCollection("ActiveEffect"), equipped, { equip: true });
  await ItemHelpers.reconcileModifierEffects(item, { applyRenames: false });
}

const states = (item) => item.effects.map((effect) => [effect.name, effect.disabled]);

test("a row switched off stays off through unequip, equip and a reconcile", async () => {
  const weapon = weaponWithTwoRows();

  await ModifierHelpers.setAttributeEnabled(weapon, "attr1700000000001", false);
  assert.equal(weapon.system.attributes.attr1700000000001.active, false);
  assert.deepEqual(states(weapon), [["attr1700000000001", true], ["attr1700000000002", false]]);

  await setEquipped(weapon, false);
  assert.deepEqual(states(weapon), [["attr1700000000001", true], ["attr1700000000002", true]]);

  await setEquipped(weapon, true);
  assert.deepEqual(states(weapon), [["attr1700000000001", true], ["attr1700000000002", false]]);

  await ItemHelpers.reconcileModifierEffects(weapon);
  assert.deepEqual(states(weapon), [["attr1700000000001", true], ["attr1700000000002", false]]);
  assert.equal(weapon.system.attributes.attr1700000000001.active, false);
});

test("a row switched back on stays on through unequip and equip", async () => {
  const weapon = weaponWithTwoRows();
  await ModifierHelpers.setAttributeEnabled(weapon, "attr1700000000001", false);
  await setEquipped(weapon, false);

  await ModifierHelpers.setAttributeEnabled(weapon, "attr1700000000001", true);
  assert.equal(weapon.system.attributes.attr1700000000001.active, true);
  // ticking switches the effect on at once, as it always has (see planAttributeToggle)
  assert.deepEqual(states(weapon), [["attr1700000000001", false], ["attr1700000000002", true]]);

  await setEquipped(weapon, true);
  assert.deepEqual(states(weapon), [["attr1700000000001", false], ["attr1700000000002", false]]);

  await setEquipped(weapon, false);
  assert.deepEqual(states(weapon), [["attr1700000000001", true], ["attr1700000000002", true]]);
});

test("a gear row switched off stays off when the gear is set down and picked up again", async () => {
  const gear = fakeItem({
    type: "gear",
    flags: { starwarsffg: { carried: true } },
    system: { attributes: { attr1700000000001: soak(), attr1700000000002: soak() } },
    effects: [
      { name: "attr1700000000001", changes: [], disabled: false },
      { name: "attr1700000000002", changes: [], disabled: false },
    ],
  });

  await ModifierHelpers.setAttributeEnabled(gear, "attr1700000000001", false);
  await ItemHelpers.followItemState(gear, gear.getEmbeddedCollection("ActiveEffect"), false);
  assert.deepEqual(states(gear), [["attr1700000000001", true], ["attr1700000000002", true]]);

  await ItemHelpers.followItemState(gear, gear.getEmbeddedCollection("ActiveEffect"), true);
  assert.deepEqual(states(gear), [["attr1700000000001", true], ["attr1700000000002", false]]);
});

test("an effect switched off by hand before rows stored their state comes back on at the next equip", async () => {
  // Migration-free on purpose: the row itself never recorded the click, so there is nothing to
  // honour. Switching it off once more stores the state (CHANGELOG, Unreleased).
  const weapon = weaponWithTwoRows({ soakEffectDisabled: true });

  await setEquipped(weapon, false);
  await setEquipped(weapon, true);

  assert.deepEqual(states(weapon), [["attr1700000000001", false], ["attr1700000000002", false]]);
});
