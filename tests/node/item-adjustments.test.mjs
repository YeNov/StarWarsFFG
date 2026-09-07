/**
 * The item's derived ("adjusted") numbers.
 *
 * These pin the arithmetic that used to live inside `ItemFFG#prepareData` — an
 * `async` override Foundry never awaited, so the owning actor read the previous
 * pass's `.adjusted` values. The numbers below were taken from that code before
 * the move; they must not change now that it runs synchronously from
 * `prepareDerivedData()`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";

import { applyItemAdjustments, capitalize } from "../../modules/helpers/item-adjustments.js";
import { personal_ranges } from "../../modules/config/ffg-ranges.js";

const vehicle_ranges = {
  Close: { value: "Close", label: "SWFFG.VehicleRangeClose" },
  Short: { value: "Short", label: "SWFFG.VehicleRangeShort" },
  Medium: { value: "Medium", label: "SWFFG.VehicleRangeMedium" },
  Long: { value: "Long", label: "SWFFG.VehicleRangeLong" },
  Extreme: { value: "Extreme", label: "SWFFG.VehicleRangeExtreme" },
};

const ctx = (over = {}) => ({ ranges: personal_ranges, vehicleRanges: vehicle_ranges, ...over });

/** A quality/modifier row as it is embedded on a weapon or armour. */
const quality = (name, attributes, { rank = null } = {}) => ({
  name,
  type: "itemmodifier",
  system: { rank, attributes },
});

/** One `system.attributes` entry. */
const attr = (mod, modtype, value) => ({ mod, modtype, value });

function weapon(over = {}) {
  return {
    damage: { value: 6 },
    crit: { value: 3 },
    encumbrance: { value: 4 },
    price: { value: 500 },
    rarity: { value: 5 },
    hardpoints: { value: 3 },
    range: { value: "Medium" },
    characteristic: { value: "" },
    attributes: {},
    itemmodifier: [],
    itemattachment: [],
    ...over,
  };
}

function armour(over = {}) {
  return {
    soak: { value: 2 },
    defence: { value: 1 },
    encumbrance: { value: 4 },
    price: { value: 500 },
    rarity: { value: 5 },
    hardpoints: { value: 3 },
    attributes: {},
    itemmodifier: [],
    itemattachment: [],
    ...over,
  };
}

test("a bare weapon's adjusted values are its own values, parsed as integers", () => {
  const data = applyItemAdjustments(weapon({ damage: { value: "6" }, crit: { value: "3" } }), "weapon", ctx());
  assert.equal(data.damage.adjusted, 6);
  assert.equal(data.crit.adjusted, 3);
  assert.equal(data.encumbrance.adjusted, 4);
  assert.equal(data.price.adjusted, 500);
  assert.equal(data.rarity.adjusted, 5);
  assert.equal(data.hardpoints.adjusted, 3);
  assert.equal(data.range.adjusted, "Medium");
  assert.equal(data.range.label, "SWFFG.WeaponRangeMedium");
  assert.deepEqual(data.adjusteditemmodifier, []);
});

test("a weapon's qualities add to damage, crit and range, multiplied by their rank", () => {
  const data = applyItemAdjustments(weapon({
    itemmodifier: [
      quality("Vicious", { 0: attr("critical", "Weapon Stat", 1) }, { rank: 2 }),
      quality("Cumbersome", { 0: attr("encumbrance", "Weapon Stat", 1) }),
      quality("Long Barrel", { 0: attr("range", "Weapon Stat", 1) }),
    ],
  }), "weapon", ctx());
  // Vicious rank 2 → crit +2; Cumbersome has no rank → treated as rank 1.
  assert.equal(data.crit.adjusted, 5);
  assert.equal(data.encumbrance.adjusted, 5);
  // Range is shifted from the SOURCE band, one step up from Medium.
  assert.equal(data.range.adjusted, "Long");
  assert.equal(data.range.label, "SWFFG.WeaponRangeLong");
  // Every quality is summarized for display, with its own `system` copy.
  assert.deepEqual(data.adjusteditemmodifier.map((m) => m.name), ["Vicious", "Cumbersome", "Long Barrel"]);
  assert.equal(data.adjusteditemmodifier[0].system.rank_current, 2);
  assert.notEqual(data.adjusteditemmodifier[0].system, data.itemmodifier[0].system);
});

test("range never walks off either end of the band table", () => {
  const up = applyItemAdjustments(weapon({
    range: { value: "Extreme" },
    itemmodifier: [quality("Long Barrel", { 0: attr("range", "Weapon Stat", 3) })],
  }), "weapon", ctx());
  assert.equal(up.range.adjusted, "Extreme");

  const down = applyItemAdjustments(weapon({
    range: { value: "Engaged" },
    itemmodifier: [quality("Shortened", { 0: attr("range", "Weapon Stat", -3) })],
  }), "weapon", ctx());
  assert.equal(down.range.adjusted, "Engaged");
});

test("a ship weapon takes its range label and bands from the vehicle scale", () => {
  const data = applyItemAdjustments(weapon({ range: { value: "Close" } }), "shipweapon", ctx());
  assert.equal(data.range.label, "SWFFG.VehicleRangeClose");
});

test("an attachment folds its own stats and its active qualities into the weapon", () => {
  const attachment = {
    name: "Augmented Barrel",
    type: "itemattachment",
    system: {
      rank: null,
      hardpoints: { value: 1 },
      attributes: { 0: attr("damage", "Weapon Stat", 1) },
      itemmodifier: [
        quality("Pierce", { 0: attr("damage", "Weapon Stat", 0) }, { rank: 1 }),
        // Inactive and broken rows are ignored on both counts.
        { name: "Inferior", type: "itemmodifier", system: { rank: 1, active: false, attributes: {} } },
      ],
    },
  };
  attachment.system.itemmodifier[0].system.active = true;

  const data = applyItemAdjustments(weapon({ itemattachment: [attachment] }), "weapon", ctx());
  assert.equal(data.damage.adjusted, 7);
  // The attachment's active quality is listed, flagged as attachment-derived.
  assert.deepEqual(data.adjusteditemmodifier.map((m) => m.name), ["Pierce"]);
  assert.equal(data.adjusteditemmodifier[0].adjusted, true);
  assert.equal(data.adjusteditemmodifier[0].system.rank_current, 1);
  // Hard points: the attachment spends one of the weapon's three.
  assert.equal(data.hardpoints.current, 2);
});

test("a quality the weapon already carries gains a rank from the attachment instead of a second row", () => {
  const attachment = {
    name: "Vicious Mod",
    type: "itemattachment",
    system: {
      rank: null,
      hardpoints: { value: 0 },
      attributes: {},
      itemmodifier: [{ name: "Vicious", type: "itemmodifier", system: { rank: 1, active: true, attributes: {} } }],
    },
  };
  const data = applyItemAdjustments(weapon({
    itemmodifier: [quality("Vicious", { 0: attr("critical", "Weapon Stat", 1) }, { rank: 2 })],
    itemattachment: [attachment],
  }), "weapon", ctx());
  assert.equal(data.adjusteditemmodifier.length, 1);
  assert.equal(data.adjusteditemmodifier[0].system.rank_current, 3);
  // The source quality is untouched by the display-only stacking.
  assert.equal(data.itemmodifier[0].system.rank, 2);
});

test("adjusted crit never drops below 1", () => {
  const attachment = {
    name: "Blunted",
    type: "itemattachment",
    system: { rank: null, hardpoints: { value: 0 }, attributes: { 0: attr("critical", "Weapon Stat", -9) }, itemmodifier: [] },
  };
  const data = applyItemAdjustments(weapon({ itemattachment: [attachment] }), "weapon", ctx());
  assert.equal(data.crit.adjusted, 1);
});

test("a weapon's own modifier rows add damage unless their backing effect is switched off", () => {
  const system = weapon({ attributes: { "Sharpened": attr("damage", "Weapon Stat", 2) } });
  assert.equal(applyItemAdjustments(structuredClone(system), "weapon", ctx()).damage.adjusted, 8);
  assert.equal(
    applyItemAdjustments(structuredClone(system), "weapon", ctx({ isEffectDisabled: (name) => name === "Sharpened" })).damage.adjusted,
    6,
  );
});

test("a wielded weapon adds the linked characteristic to damage, and a vehicle's never does", () => {
  const system = weapon({ characteristic: { value: "Brawn" } });
  const characteristics = { Brawn: { value: 3 } };
  assert.equal(
    applyItemAdjustments(structuredClone(system), "weapon", ctx({ isEmbedded: true, characteristics })).damage.adjusted,
    9,
  );
  // Unowned: no actor, no characteristic bonus.
  assert.equal(applyItemAdjustments(structuredClone(system), "weapon", ctx()).damage.adjusted, 6);
  // Mounted on a ship: the whole self-modifier block is skipped.
  assert.equal(
    applyItemAdjustments(structuredClone(system), "weapon", ctx({ isEmbedded: true, characteristics, actorType: "vehicle" })).damage.adjusted,
    6,
  );
});

test("a second pass over the same system object rebuilds every adjusted value from scratch", () => {
  // ActorFFG#prepareDerivedData re-prepares the actor's weapons, because Foundry prepares
  // embedded items BEFORE it applies the actor's Active Effects -- so the first pass folds in
  // the pre-effect characteristic. The second pass must land on exactly the values a single
  // pass at the final characteristic would produce: nothing counted twice, nothing left over.
  const build = () => weapon({
    characteristic: { value: "Brawn" },
    attributes: { "Sharpened": attr("damage", "Weapon Stat", 1) },
    itemmodifier: [quality("Vicious", { 0: attr("critical", "Weapon Stat", 1) }, { rank: 2 })],
    itemattachment: [{
      name: "Vicious Mod",
      type: "itemattachment",
      system: {
        rank: null,
        hardpoints: { value: 1 },
        attributes: { 0: attr("damage", "Weapon Stat", 1) },
        itemmodifier: [{ name: "Vicious", type: "itemmodifier", system: { rank: 1, active: true, attributes: {} } }],
      },
    }],
  });
  const characteristics = (value) => ({ Brawn: { value } });

  // Pass one with the base Brawn, pass two on the SAME object once the effects have applied.
  const twice = build();
  applyItemAdjustments(twice, "weapon", ctx({ isEmbedded: true, characteristics: characteristics(2) }));
  applyItemAdjustments(twice, "weapon", ctx({ isEmbedded: true, characteristics: characteristics(4) }));

  const once = applyItemAdjustments(build(), "weapon", ctx({ isEmbedded: true, characteristics: characteristics(4) }));

  assert.deepEqual(twice, once);
  // 6 base + 1 attachment + 1 own row + Brawn 4 — the Brawn is added once, not twice.
  assert.equal(twice.damage.adjusted, 12);
  // Vicious rank 2 + 1 from the attachment, and it is still listed once.
  assert.equal(twice.adjusteditemmodifier.length, 1);
  assert.equal(twice.adjusteditemmodifier[0].system.rank_current, 3);
  assert.equal(twice.crit.adjusted, 5);
  assert.equal(twice.hardpoints.current, 2);
});

test("armour sums soak and defence from its qualities, attachments and own rows", () => {
  const attachment = {
    name: "Reinforcement",
    type: "itemattachment",
    system: {
      rank: null,
      hardpoints: { value: 1 },
      attributes: { 0: attr("soak", "Armor Stat", 1), 1: attr("Soak", "Stat", 1) },
      itemmodifier: [],
    },
  };
  const data = applyItemAdjustments(armour({
    itemmodifier: [quality("Deflective", { 0: attr("defence", "Armor Stat", 1) }, { rank: 2 })],
    itemattachment: [attachment],
    attributes: { "Padding": attr("encumbrance", "Armor Stat", 1) },
  }), "armour", ctx());
  assert.equal(data.soak.adjusted, 4);      // 2 base + 1 "Armor Stat" + 1 "Stat"
  assert.equal(data.defence.adjusted, 3);   // 1 base + Deflective rank 2
  assert.equal(data.encumbrance.adjusted, 5);
  assert.equal(data.hardpoints.current, 2);
  assert.deepEqual(data.adjusteditemmodifier.map((m) => m.name), ["Deflective"]);
});

test("armour skips a modifier row whose backing effect is switched off", () => {
  const system = armour({ attributes: { "Padding": attr("soak", "Armor Stat", 2) } });
  assert.equal(applyItemAdjustments(structuredClone(system), "armour", ctx()).soak.adjusted, 4);
  assert.equal(
    applyItemAdjustments(structuredClone(system), "armour", ctx({ isEffectDisabled: () => true })).soak.adjusted,
    2,
  );
});

test("a talent gets a localization key for its activation, and gear its parsed encumbrance", () => {
  const talent = applyItemAdjustments({ activation: { value: "Active (Incidental)" } }, "talent", ctx());
  assert.equal(talent.activation.label, "SWFFG.TalentActivationsActiveIncidental");

  const gear = applyItemAdjustments({ encumbrance: { value: "2" } }, "gear", ctx());
  assert.equal(gear.encumbrance.value, 2);
});

test("capitalize tolerates a non-string", () => {
  assert.equal(capitalize("medium"), "Medium");
  assert.equal(capitalize(undefined), "");
});
