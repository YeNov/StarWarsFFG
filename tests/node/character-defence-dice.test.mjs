/**
 * Character defence contributed by targeted non-vehicle actors.
 *
 * The attacking skill chooses WHICH stat is read; the max is then taken across
 * targets for that one stat. (The pre-existing code was easy to misread as taking
 * a max across ranged AND melee -- it never did.)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { characterDefenceDice } from "../../modules/helpers/defence-helpers.js";

const trooper = (ranged, melee) => ({
  actor: { type: "character", system: { stats: { defence: { ranged, melee } } } },
});
const ship = () => ({ actor: { type: "vehicle", system: { stats: { shields: { fore: 4 } } } } });

test("a ranged skill reads ranged defence", () => {
  assert.equal(characterDefenceDice({ skillValue: "Ranged: Heavy", targets: [trooper(2, 4)] }), 2);
});

test("gunnery counts as ranged", () => {
  assert.equal(characterDefenceDice({ skillValue: "Gunnery", targets: [trooper(3, 0)] }), 3);
});

test("a melee skill reads melee defence", () => {
  assert.equal(characterDefenceDice({ skillValue: "Lightsaber", targets: [trooper(4, 1)] }), 1);
});

test("a skill in neither list contributes nothing", () => {
  assert.equal(characterDefenceDice({ skillValue: "Piloting: Space", targets: [trooper(3, 3)] }), 0);
  assert.equal(characterDefenceDice({ skillValue: null, targets: [trooper(3, 3)] }), 0);
});

test("the maximum is taken across targets for the chosen stat only", () => {
  const targets = [trooper(1, 9), trooper(3, 9), trooper(2, 9)];
  assert.equal(characterDefenceDice({ skillValue: "Ranged: Light", targets }), 3);
});

test("a targeted vehicle contributes nothing here -- the zone picker owns it", () => {
  assert.equal(characterDefenceDice({ skillValue: "Gunnery", targets: [ship()] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Gunnery", targets: [ship(), trooper(2, 0)] }), 2);
});

test("a vehicle target does not throw despite having no defence stat", () => {
  // The live bug this replaces: reading .ranged off an undefined `defence`.
  assert.doesNotThrow(() => characterDefenceDice({ skillValue: "Ranged: Heavy", targets: [ship()] }));
});

test("missing, malformed or absent targets yield zero", () => {
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: undefined }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [{ actor: null }] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [{ actor: { type: "character" } }] }), 0);
});

test("a negative or non-numeric defence never produces negative dice", () => {
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [trooper(0, -3)] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [trooper(0, "two")] }), 0);
});

test("a Set of targets works, since game.user.targets is one", () => {
  assert.equal(characterDefenceDice({ skillValue: "Brawl", targets: new Set([trooper(0, 2)]) }), 2);
});
