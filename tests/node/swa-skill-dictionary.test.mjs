/**
 * SWA (Adversaries) importer skill dictionary.
 *
 * The importer stamps a whole `system.skills` dictionary onto every actor it creates. While
 * template.json was the actor schema, Foundry deep-merged that dictionary over the template's own
 * `skills` block, so an entry carrying only `{rank, careerskill, Key}` still reached the database
 * with `characteristic`, `type`, `groupskill` and `max` attached. A registered DataModel does not
 * merge: `skills` is a TypedObjectField whose `initial` applies only when the key is absent, and
 * each per-skill value is a freeform ObjectField stored verbatim. Whatever the importer omits is
 * simply gone from the imported actor.
 *
 * The two symptoms that follow are what these tests pin:
 *   - no `characteristic` -> the skill rolls an empty pool (only the ranked skills the adversary
 *     data names get one patched in from the SWA skills file), and
 *   - no `type` -> the skill matches none of the buckets `_createSkillColumns` builds from
 *     `system.skilltypes`, so it renders under no category header.
 *
 * `CONFIG.FFG.skills` cannot paper over either one: the stock table in ffg-skills.js carries
 * presentation keys only (value/label/abrev), so the merge in `FFGActor.prepareDerivedData`
 * restores labels and nothing else. The dictionary has to be complete at the source.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { defaultSkillList } from "../../modules/config/ffg-skillslist.js";
import { SWA_SKILL_KEYS, buildSwaSkillDictionary } from "../../modules/importer/swa-skills.js";

const stockSkills = defaultSkillList.find((list) => list.id === "starwars").skills;

test("every stock skill arrives with the keys the sheet and the dice pool read", () => {
  const skills = buildSwaSkillDictionary(defaultSkillList, "starwars");

  assert.deepEqual(
    Object.keys(skills).filter((name) => name !== "Cybernetics").sort(),
    Object.keys(stockSkills).sort(),
  );

  for (const [name, skill] of Object.entries(skills)) {
    assert.ok(skill.characteristic, `${name} has no characteristic — it would roll an empty pool`);
    assert.ok(skill.type, `${name} has no type — it would render under no category`);
    assert.equal(typeof skill.rank, "number", `${name} has no rank`);
  }

  // The stock definitions must come through untouched, not re-typed by hand.
  for (const [name, stock] of Object.entries(stockSkills)) {
    assert.equal(skills[name].characteristic, stock.characteristic, name);
    assert.equal(skills[name].type, stock.type, name);
    assert.equal(skills[name].max, stock.max, name);
    assert.equal(skills[name].groupskill, stock.groupskill, name);
  }
});

test("keeps the OggDude skill keys the importer has always written", () => {
  const skills = buildSwaSkillDictionary(defaultSkillList, "starwars");

  assert.equal(Object.keys(SWA_SKILL_KEYS).length, Object.keys(stockSkills).length + 1);
  for (const [name, key] of Object.entries(SWA_SKILL_KEYS)) {
    assert.equal(skills[name].Key, key, name);
  }
});

test("adds Cybernetics, which the adversary data uses and the stock list does not have", () => {
  const skills = buildSwaSkillDictionary(defaultSkillList, "starwars");

  assert.equal(stockSkills.Cybernetics, undefined);
  assert.deepEqual(skills.Cybernetics, {
    rank: 0,
    careerskill: false,
    Key: "CYBERNETICS",
    custom: true,
    type: "General",
    characteristic: "Intellect",
    label: "Cybernetics",
  });
});

test("uses a selected alternate skill theme as-is", () => {
  const skills = buildSwaSkillDictionary(defaultSkillList, "genesys");
  const genesys = defaultSkillList.find((list) => list.id === "genesys").skills;

  assert.deepEqual(Object.keys(skills).sort(), Object.keys(genesys).sort());
  // Alternate themes ship their own complete lists; the starwars-only extras stay out of them.
  assert.equal(skills.Cybernetics, undefined);
  assert.equal(skills.Athletics?.Key, undefined);
});

test("falls back to the stock list when the configured theme is gone", () => {
  const skills = buildSwaSkillDictionary(defaultSkillList, "a-theme-that-was-uninstalled");

  assert.deepEqual(
    Object.keys(skills).sort(),
    Object.keys(buildSwaSkillDictionary(defaultSkillList, "starwars")).sort(),
  );
});

test("returns a copy, so an import cannot corrupt the shared skill list", () => {
  const skills = buildSwaSkillDictionary(defaultSkillList, "starwars");
  skills.Brawl.rank = 4;
  skills.Brawl.characteristic = "Presence";

  assert.equal(stockSkills.Brawl.rank, 0);
  assert.equal(stockSkills.Brawl.characteristic, "Brawn");
});
