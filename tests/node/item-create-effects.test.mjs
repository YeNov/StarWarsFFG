import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import ModifierHelpers from "../../modules/helpers/modifiers.js";

/**
 * An item's generated Active Effects used to be written AFTER the item was created, by
 * `ItemFFG#_onCreate`. That hook runs on every connected client whose logged-in user matches
 * the creating user -- and Foundry lets one user be connected from several windows, so each of
 * them performed its own create and the item ended up with one duplicate effect per extra
 * session. Verified live: two windows open as the same GM gave every talent two identical
 * effects and doubled its modifier.
 *
 * The effects are now planned as plain data and folded into the item's own source during
 * `_preCreate`, which runs once on the initiating client only. The item arrives complete, so
 * there is no follow-up write left for a second window to repeat.
 *
 * These cover the planners. The wiring assertion at the bottom guards the property that
 * actually fixes the bug: nothing creates these effects after the fact any more.
 */

const item = (type, system = {}, effects = []) => ({ type, img: "icons/test.webp", system, effects });

test("plans the inherent effect a gear item is created with", () => {
  const planned = ModifierHelpers.planInherentEffect(item("gear"));

  assert.equal(planned.name, "(inherent)");
  assert.deepEqual(planned.changes, [
    { key: "system.stats.encumbrance.value", mode: AE_MODES.ADD, value: 0 },
  ]);
});

test("plans one change per exploded path, so armour covers all three stats", () => {
  const planned = ModifierHelpers.planInherentEffect(item("armour"));

  assert.deepEqual(planned.changes.map((c) => c.key), [
    "system.stats.encumbrance.value",
    "system.stats.defence.melee",
    "system.stats.defence.ranged",
    "system.stats.soak.value",
  ]);
});

test("builds a species' inherent changes from its own attributes", () => {
  const planned = ModifierHelpers.planInherentEffect(item("species", {
    attributes: {
      Brawn: { modtype: "Characteristic", value: 3 },
      // user-added attributes are named attr<timestamp> and are not part of the species grant
      attr1750000000000: { modtype: "Characteristic", value: 99 },
    },
  }));

  assert.deepEqual(planned.changes, [
    { key: "system.characteristics.Brawn.value", mode: AE_MODES.ADD, value: 3 },
    { key: "system.stats.encumbrance.max", mode: AE_MODES.ADD, value: 3 },
    { key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 3 },
  ]);
});

test("gives a shipattachment its hard-point change, zeroed until the sheet is saved", () => {
  const planned = ModifierHelpers.planInherentEffect(item("shipattachment"));

  assert.deepEqual(planned.changes, [
    { key: "system.stats.customizationHardPoints.value", mode: AE_MODES.ADD, value: 0 },
  ]);
});

test("gives career and specialization their placeholder career-skill slots", () => {
  assert.equal(ModifierHelpers.planInherentEffect(item("career")).changes.length, 8);
  assert.equal(ModifierHelpers.planInherentEffect(item("specialization")).changes.length, 5);
});

test("plans no inherent effect for a type that does not own one", () => {
  assert.equal(ModifierHelpers.planInherentEffect(item("talent")), null);
  assert.equal(ModifierHelpers.planInherentEffect(undefined), null);
});

test("plans nothing when the item already carries the effect", () => {
  // A compendium copy, a duplicate, or a re-drop arrives with its effects already attached.
  const existing = item("gear", {}, [{ name: "(inherent)", changes: [] }]);

  assert.deepEqual(ModifierHelpers.planMissingEffects(existing), []);
});

test("plans a talent's attribute effects for the item to be created with", () => {
  const talent = item("talent", {
    attributes: { "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 } },
  });

  assert.deepEqual(ModifierHelpers.planMissingEffects(talent), [{
    name: "Piloting:_Space",
    img: "icons/test.webp",
    changes: [{ key: "system.skills.Piloting: Space.remsetback", mode: AE_MODES.ADD, value: 1 }],
  }]);
});

test("plans both kinds at once and skips only the kind already present", () => {
  const species = item("species",
    { attributes: { Brawn: { modtype: "Characteristic", value: 1 } } },
    [{ name: "(inherent)", changes: [] }]);
  // the inherent one exists; nothing else is planned for a species
  assert.deepEqual(ModifierHelpers.planMissingEffects(species), []);

  const talent = item("talent",
    { attributes: { Cool: { mod: "Cool", modtype: "Skill Boost", value: 1 } } },
    [{ name: "Cool", changes: [] }]);
  assert.deepEqual(ModifierHelpers.planMissingEffects(talent), []);
});

test("every planned effect carries the item's image", () => {
  assert.equal(ModifierHelpers.planInherentEffect(item("gear")).img, "icons/test.webp");
});

test("the generated effects are folded into the item, not written after it is created", () => {
  // The property that fixes the duplication: _preCreate runs once, on the initiating client,
  // so no second window can repeat the write. If these creates come back, so does the bug.
  const source = fs.readFileSync(new URL("../../modules/items/item-ffg.js", import.meta.url), "utf8");

  const preCreate = source.slice(source.indexOf("async _preCreate("), source.indexOf("async _onCreate("));
  assert.match(preCreate, /planMissingEffects/, "_preCreate must plan the effects");
  assert.match(preCreate, /updateSource\(/, "_preCreate must fold them into the item's own source");

  const onCreate = source.slice(source.indexOf("async _onCreate("), source.indexOf("async _onCreateAEs("));
  assert.doesNotMatch(onCreate, /createEmbeddedDocuments\(\s*["']ActiveEffect["']/,
    "_onCreate must not create Active Effects any more");
});
