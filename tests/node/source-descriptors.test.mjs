/**
 * Node tests for the content-source descriptors + predicates (Stage 8; N-1, N-4, D7).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  SOURCE_DESCRIPTORS,
  getDescriptor,
  sourceIdOf,
  isSourceEnabled,
  UnknownPoolKeyError,
} from "../../modules/char-creator/source-descriptors.js";

test("forcePower maps to setting forcePowerCompendiums and item type forcepower", () => {
  const d = getDescriptor("forcePower");
  assert.equal(d.settingKey, "forcePowerCompendiums");
  assert.deepEqual(d.worldItemTypes, ["forcepower"]);
});

test("gear unions all five item types under the one itemCompendiums setting", () => {
  const d = getDescriptor("gear");
  assert.equal(d.settingKey, "itemCompendiums");
  assert.deepEqual(d.worldItemTypes, ["weapon", "armour", "gear", "itemattachment", "itemmodifier"]);
});

test("N-1: career maps to the world type `career`, not `careers`", () => {
  const d = getDescriptor("career");
  assert.equal(d.settingKey, "careerCompendiums");
  assert.deepEqual(d.worldItemTypes, ["career"]);
  assert.ok(!d.worldItemTypes.includes("careers"));
});

test("species / obligation / motivation / background / specialization settings are correct", () => {
  assert.equal(getDescriptor("species").settingKey, "speciesCompendiums");
  assert.equal(getDescriptor("obligation").settingKey, "obligationCompendiums");
  assert.equal(getDescriptor("motivation").settingKey, "motivationCompendiums");
  assert.equal(getDescriptor("background").settingKey, "backgroundCompendiums");
  assert.equal(getDescriptor("specialization").settingKey, "specializationCompendiums");
});

test("talent / signatureAbility pools are deliberately NOT consumed", () => {
  assert.ok(!("talent" in SOURCE_DESCRIPTORS));
  assert.ok(!("signatureAbility" in SOURCE_DESCRIPTORS));
});

test("getDescriptor throws UnknownPoolKeyError on an unknown poolKey", () => {
  assert.throws(() => getDescriptor("nonsense"), UnknownPoolKeyError);
  assert.throws(() => getDescriptor(undefined), UnknownPoolKeyError);
});

test("sourceIdOf derives a pack collection id and the world sentinel", () => {
  assert.equal(sourceIdOf({ collection: "starwarsffg.species" }), "starwarsffg.species");
  assert.equal(sourceIdOf({ metadata: { id: "world.custom" } }), "world.custom");
  assert.equal(sourceIdOf("world"), "world");
});

test("isSourceEnabled defaults on and honours per-pool exclusions (D7)", () => {
  assert.equal(isSourceEnabled("species", "pack1"), true); // no exclusions → on
  assert.equal(isSourceEnabled("species", "pack1", {}), true);
  assert.equal(isSourceEnabled("species", "pack1", { species: ["pack1"] }), false);
  // an exclusion in one pool does not disable another pool's same-id source
  assert.equal(isSourceEnabled("gear", "pack1", { species: ["pack1"] }), true);
  // a new (unlisted) pack stays enabled even when the pool has other exclusions
  assert.equal(isSourceEnabled("species", "packNew", { species: ["pack1"] }), true);
});

test("the descriptor table is frozen", () => {
  assert.ok(Object.isFrozen(SOURCE_DESCRIPTORS));
  assert.ok(Object.isFrozen(SOURCE_DESCRIPTORS.gear));
  assert.ok(Object.isFrozen(SOURCE_DESCRIPTORS.gear.worldItemTypes));
});
