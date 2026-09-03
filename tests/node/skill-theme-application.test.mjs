/**
 * When a newly created actor may have its whole skill dictionary replaced by the world's skill
 * theme.
 *
 * The `preCreateActor` hook that asks this exists for one case: an actor created blank, whose
 * `system.skills` is therefore the DataModel's `initial` — `STOCK_SKILLS()`, a clone of the stock
 * Star Wars list (data/actor-templates.js:24) — in a world configured for a different theme.
 *
 * Every other new actor already carries authored skills, and a theme dictionary is `rank: 0`
 * throughout, so writing it over them is an erase. That was issue #62: an SWA adversary carries the
 * custom `Cybernetics` skill, so its key set never equalled the theme's, and a sidebar duplicate is
 * deliberately stripped of `flags.starwarsffg.ffgimportid` — which was the only guard. The copy
 * landed with every rank zeroed.
 *
 * The invariant these tests pin is the one that matters, not the shape of the guard: an actor whose
 * skills are not structurally identical to the model default is never rewritten, whatever its
 * provenance. Key order is not authorship, so it does not count as a difference.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { defaultSkillList } from "../../modules/config/ffg-skillslist.js";
import { buildSwaSkillDictionary } from "../../modules/importer/swa-skills.js";
import { shouldApplySkillTheme } from "../../modules/helpers/skill-theme.js";

/** `STOCK_SKILLS()` — what the DataModel puts on an actor created with no skills of its own. */
const stock = () => structuredClone(defaultSkillList.find((l) => l.id === "starwars").skills);
const genesys = () => structuredClone(defaultSkillList.find((l) => l.id === "genesys").skills);

/** A real SWA adversary dictionary, from the importer's own builder, with a rank on it. */
const adversarySkills = (themeId = "starwars") => {
  const skills = buildSwaSkillDictionary(defaultSkillList, themeId);
  skills[Object.keys(skills)[0]].rank = 3;
  return skills;
};

test("a blank actor in a re-themed world is re-themed", () => {
  assert.equal(shouldApplySkillTheme(stock(), genesys(), stock()), true);
});

test("a blank actor in a stock-theme world is left alone", () => {
  assert.equal(shouldApplySkillTheme(stock(), stock(), stock()), false);
});

test("an SWA adversary is never rewritten, in either kind of world", () => {
  assert.equal(shouldApplySkillTheme(adversarySkills("starwars"), stock(), stock()), false);
  assert.equal(shouldApplySkillTheme(adversarySkills("genesys"), genesys(), stock()), false);
});

test("the SWA dictionary really does differ from the model default", () => {
  // Guards the test above from passing for the wrong reason: if the importer ever wrote the stock
  // dictionary unchanged, "left alone" would be trivially true and prove nothing.
  assert.notDeepEqual(adversarySkills("starwars"), stock());
  assert.ok("Cybernetics" in adversarySkills("starwars"), "the custom skill that started issue #62");
});

test("a single authored rank is enough to make an actor off-limits", () => {
  const authored = stock();
  authored.Astrogation.rank = 1;
  assert.equal(shouldApplySkillTheme(authored, genesys(), stock()), false);
});

test("an added custom skill is enough to make an actor off-limits", () => {
  const authored = stock();
  authored.Cybernetics = { rank: 0, custom: true, type: "General", characteristic: "Intellect" };
  assert.equal(shouldApplySkillTheme(authored, genesys(), stock()), false);
});

test("a removed skill is enough to make an actor off-limits", () => {
  const authored = stock();
  delete authored.Astrogation;
  assert.equal(shouldApplySkillTheme(authored, genesys(), stock()), false);
});

test("a nested difference is not missed", () => {
  const authored = stock();
  authored.Astrogation = { ...authored.Astrogation, nested: { deep: 1 } };
  assert.equal(shouldApplySkillTheme(authored, genesys(), stock()), false);
});

test("key order does not decide the answer", () => {
  const reordered = Object.fromEntries(Object.entries(stock()).reverse());
  assert.equal(shouldApplySkillTheme(reordered, genesys(), stock()), true);
});

test("an actor with no skills at all is never rewritten", () => {
  // Vehicles and homesteads have no `skills` in their schema.
  assert.equal(shouldApplySkillTheme(undefined, genesys(), stock()), false);
  assert.equal(shouldApplySkillTheme({}, genesys(), stock()), false);
});

test("a missing or empty theme is never applied", () => {
  assert.equal(shouldApplySkillTheme(stock(), {}, stock()), false);
  assert.equal(shouldApplySkillTheme(stock(), undefined, stock()), false);
});

test("a missing stock reference never authorises a write", () => {
  // Fail closed: if the caller cannot supply the model default, nothing can be proven unauthored.
  assert.equal(shouldApplySkillTheme(stock(), genesys(), undefined), false);
  assert.equal(shouldApplySkillTheme(stock(), genesys(), {}), false);
});
