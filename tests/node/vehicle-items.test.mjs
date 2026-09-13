/**
 * Which items a vehicle may hold. Character-only item types are refused, except the
 * Adversary talent: a vehicle can carry it so that attacks against it are upgraded the
 * way attacks against an NPC are. The roll dialog and the token badge find that talent
 * by its exact name, so a vehicle must accept exactly the name they count and nothing
 * looser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { vehicleItemRefusal } from "../../modules/helpers/vehicle-items.js";

const item = (type, name) => ({ type, name });

test("a vehicle accepts the talent named by the Adversary setting", () => {
  assert.equal(vehicleItemRefusal(item("talent", "Adversary"), "Adversary"), null);
});

test("a vehicle refuses every other talent", () => {
  assert.equal(vehicleItemRefusal(item("talent", "Grit"), "Adversary"), "notAdversary");
});

test("the accepted talent follows a renamed setting", () => {
  assert.equal(vehicleItemRefusal(item("talent", "Nemesis"), "Nemesis"), null);
  assert.equal(vehicleItemRefusal(item("talent", "Adversary"), "Nemesis"), "notAdversary");
});

test("the talent name must match exactly, as the roll dialog and token badge match it", () => {
  // Anything looser lets a talent onto the vehicle that neither of them counts.
  assert.equal(vehicleItemRefusal(item("talent", "adversary"), "Adversary"), "notAdversary");
  assert.equal(vehicleItemRefusal(item("talent", "Adversary "), "Adversary"), "notAdversary");
});

test("other character-only item types are refused even when named after the setting", () => {
  for (const type of ["career", "forcepower", "signatureability", "specialization", "species", "ability"]) {
    assert.equal(vehicleItemRefusal(item(type, "Adversary"), "Adversary"), "characterOnly", type);
  }
});

test("the items a vehicle carries are accepted", () => {
  for (const type of ["shipweapon", "shipattachment", "weapon", "armour", "gear", "criticaldamage"]) {
    assert.equal(vehicleItemRefusal(item(type, "Adversary"), "Adversary"), null, type);
  }
});
