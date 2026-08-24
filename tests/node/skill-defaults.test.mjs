/**
 * The defaults `FFGActor.prepareDerivedData` merges under an actor's stored skills.
 *
 * That merge used to be against `CONFIG.FFG.skills` alone, which is the presentation table from
 * config/ffg-skills.js — `value`/`label`/`abrev` and nothing else. It therefore restored a skill's
 * NAME but never its `characteristic` or `type`. That was invisible while template.json guaranteed
 * every stored skill already carried them; a DataModel does not, so any actor written with a
 * partial `skills` dictionary (the Adversaries importer wrote one for years) renders skills that
 * roll an empty pool and belong to no category.
 *
 * The defaults have to come from the active skill theme, which is the same place the DataModel's
 * own `initial` comes from. These tests pin that, and pin that stored values still win.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { defaultSkillList } from "../../modules/config/ffg-skillslist.js";
import { skills as configSkills } from "../../modules/config/ffg-skills.js";
import { buildSkillDefaults, pickSkillTheme } from "../../modules/helpers/skill-defaults.js";

/** An adversary as the SWA importer used to store it: ranks only, no definitions. */
const degradedSkills = {
  Astrogation: { rank: 0, careerskill: false, Key: "ASTRO" },
  Brawl: { rank: 2, careerskill: false, Key: "BRAWL", groupskill: false, characteristic: "Brawn" },
  Discipline: { rank: 4, careerskill: false, Key: "DISC", groupskill: false, characteristic: "Willpower" },
};

test("the defaults carry the definitions the presentation table cannot", () => {
  const defaults = buildSkillDefaults(configSkills, defaultSkillList, "starwars");

  for (const [name, skill] of Object.entries(defaults)) {
    assert.ok(skill.characteristic, `${name} has no characteristic`);
    assert.ok(skill.type, `${name} has no type`);
    assert.equal(skill.label, configSkills[name].label, `${name} lost its label`);
    assert.equal(skill.abrev, configSkills[name].abrev, `${name} lost its abbreviation`);
  }
});

test("an actor stored without definitions gets them back, keeping its own ranks", () => {
  const defaults = buildSkillDefaults(configSkills, defaultSkillList, "starwars");
  const merged = foundry.utils.mergeObject(defaults, degradedSkills);

  assert.equal(merged.Astrogation.characteristic, "Intellect");
  assert.equal(merged.Astrogation.type, "General");
  assert.equal(merged.Astrogation.rank, 0);

  assert.equal(merged.Brawl.type, "Combat");
  assert.equal(merged.Brawl.rank, 2, "the stored rank must win over the default");
  assert.equal(merged.Discipline.rank, 4, "the stored rank must win over the default");

  // Skills the actor never stored are still fully defined, so they render and roll.
  assert.equal(merged.Stealth.characteristic, "Agility");
  assert.equal(merged.Stealth.type, "General");
});

test("a stored characteristic override still wins over the theme", () => {
  const defaults = buildSkillDefaults(configSkills, defaultSkillList, "starwars");
  assert.equal(defaults.Lightsaber.characteristic, "Brawn");

  const merged = foundry.utils.mergeObject(defaults, {
    Lightsaber: { rank: 3, characteristic: "Cunning" },
  });
  assert.equal(merged.Lightsaber.characteristic, "Cunning");
});

test("a configured alternate theme supplies the definitions", () => {
  const genesys = defaultSkillList.find((list) => list.id === "genesys").skills;
  const defaults = buildSkillDefaults(genesys, defaultSkillList, "genesys");

  for (const [name, skill] of Object.entries(defaults)) {
    assert.equal(skill.characteristic, genesys[name].characteristic, name);
    assert.equal(skill.type, genesys[name].type, name);
  }
});

test("the presentation table still fixes the key order", () => {
  // `prepareDerivedData` derives `system.skilltypes` — the order the sheet prints skill categories
  // in — from the order of this dictionary. Taking the order from the theme instead reshuffles the
  // categories on every sheet (on the genesys list it moves Magic from second to last).
  const defaults = buildSkillDefaults(configSkills, defaultSkillList, "starwars");
  assert.deepEqual(Object.keys(defaults), Object.keys(configSkills));

  const genesys = defaultSkillList.find((list) => list.id === "genesys").skills;
  const shuffled = Object.fromEntries(Object.keys(genesys).reverse().map((name) => [name, genesys[name]]));
  assert.deepEqual(Object.keys(buildSkillDefaults(shuffled, defaultSkillList, "genesys")), Object.keys(shuffled));
});

test("no skill lists means the old behaviour, not a crash", () => {
  assert.deepEqual(buildSkillDefaults(configSkills, undefined, "starwars"), configSkills);
  assert.deepEqual(buildSkillDefaults(configSkills, [], "starwars"), configSkills);
});

test("the defaults are a copy of the shared tables, never the tables themselves", () => {
  const defaults = buildSkillDefaults(configSkills, defaultSkillList, "starwars");
  defaults.Brawl.rank = 5;
  defaults.Brawl.label = "clobbered";

  assert.equal(defaultSkillList.find((list) => list.id === "starwars").skills.Brawl.rank, 0);
  assert.equal(configSkills.Brawl.label, "SWFFG.SkillsNameBrawl");
});

test("a nested value in an imported skill list is copied, not shared", () => {
  // The per-skill copy is key-by-key for speed, which is only a full clone while the values are
  // primitives. A skill list imported into a world is not guaranteed to be that flat, and the
  // caller merges the actor's stored skills straight into what it gets back.
  const lists = [{ id: "starwars", skills: { Brawl: { rank: 0, type: "Combat", meta: { source: "core" } } } }];
  const defaults = buildSkillDefaults({ Brawl: { value: "Brawl" } }, lists, "starwars");

  defaults.Brawl.meta.source = "clobbered";
  assert.equal(lists[0].skills.Brawl.meta.source, "core");
});

test("an uninstalled theme falls back to the stock list", () => {
  assert.equal(pickSkillTheme(defaultSkillList, "gone")?.id, "starwars");
  assert.equal(pickSkillTheme(defaultSkillList, "terrinoth")?.id, "terrinoth");
  assert.equal(pickSkillTheme([], "starwars"), undefined);
});
