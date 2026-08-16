import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyCharacterDefenceCap,
  MAX_CHARACTER_DEFENCE,
} from "../../modules/helpers/defence-helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("the Star Wars FFG character defence maximum is 4", () => {
  assert.equal(MAX_CHARACTER_DEFENCE, 4);
});

test("enabled rule caps melee and ranged defence independently", () => {
  const defence = { melee: 7, ranged: 5 };

  assert.equal(applyCharacterDefenceCap(defence, true), defence);
  assert.deepEqual(defence, { melee: 4, ranged: 4 });
});

test("enabled rule leaves values at or below the maximum unchanged", () => {
  const defence = { melee: 4, ranged: 2 };

  applyCharacterDefenceCap(defence, true);

  assert.deepEqual(defence, { melee: 4, ranged: 2 });
});

test("disabled rule permits defence above 4", () => {
  const defence = { melee: 6, ranged: 8 };

  applyCharacterDefenceCap(defence, false);

  assert.deepEqual(defence, { melee: 6, ranged: 8 });
});

test("defence cap setting is default-on, world-scoped, and listed under Combat", () => {
  const registrations = read("modules/settings/settings-helpers.js");
  const combatMenu = read("modules/settings/ui-settings.js");
  const actor = read("modules/actors/actor-ffg.js");

  const registration = registrations.match(
    /game\.settings\.register\("starwarsffg", "enforceDefenseMaximum", \{([\s\S]*?)\n    \}\);/,
  )?.[1] ?? "";

  assert.match(registration, /scope: "world"/);
  assert.match(registration, /default: true/);
  assert.match(registration, /type: Boolean/);
  assert.match(combatMenu, /export class combatSettings[\s\S]*?"starwarsffg\.enforceDefenseMaximum"/);
  assert.match(actor, /game\.settings\.get\("starwarsffg", "enforceDefenseMaximum"\)/);
});
