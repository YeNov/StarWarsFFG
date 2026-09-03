/**
 * When the `createActor` hook may overwrite a new actor's whole skill dictionary with the world's
 * skill theme.
 *
 * The hook exists for one case only: a blank actor is created, its `system.skills` came from the
 * DataModel's `initial` (the stock Star Wars list), and the world is configured for a different
 * theme. Re-theming it there is right. Doing it to an actor that was created FROM authored data is
 * not — the theme's dictionary carries `rank: 0` for every skill, so the write erases the ranks.
 *
 * That is issue #62. An adversary from the Adversaries (SWA) importer carries the custom
 * `Cybernetics` skill, so its key set never matches the stock theme's, and duplicating it in the
 * sidebar strips `flags.starwarsffg.ffgimportid` (registerDuplicateIdentityHooks, by design) —
 * which was the only thing holding the hook off. The copy landed with every rank zeroed.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { defaultSkillList } from "../../modules/config/ffg-skillslist.js";
import { shouldApplySkillTheme } from "../../modules/helpers/skill-theme.js";

const themeSkills = defaultSkillList.find((list) => list.id === "genesys").skills;

/** A blank actor as the DataModel initialises it: the stock list, nothing authored. */
const stockActor = () => ({
  flags: {},
  _stats: {},
  system: { skills: structuredClone(defaultSkillList.find((list) => list.id === "starwars").skills) },
});

/** An SWA-imported adversary: theme skills + the custom Cybernetics entry, with ranks. */
const adversary = () => {
  const skills = structuredClone(themeSkills);
  skills.Cybernetics = { rank: 0, custom: true, type: "General", characteristic: "Intellect" };
  Object.values(skills)[0].rank = 3;
  return {
    flags: { starwarsffg: { ffgimportid: "Adversaries-Rival-Bounty Hunter" } },
    _stats: {},
    system: { skills },
  };
};

test("a blank actor in a re-themed world is re-themed", () => {
  assert.equal(shouldApplySkillTheme(stockActor(), themeSkills), true);
});

test("an actor whose skills already match the theme is left alone", () => {
  const actor = stockActor();
  actor.system.skills = structuredClone(themeSkills);
  assert.equal(shouldApplySkillTheme(actor, themeSkills), false);
});

test("an imported actor is left alone", () => {
  assert.equal(shouldApplySkillTheme(adversary(), themeSkills), false);
});

test("a sidebar duplicate is left alone even though the copy lost its import id", () => {
  const copy = adversary();
  delete copy.flags.starwarsffg.ffgimportid;
  copy._stats.duplicateSource = "Actor.abc123";
  assert.equal(shouldApplySkillTheme(copy, themeSkills), false);
});

test("an actor dragged out of a compendium is left alone", () => {
  const copy = adversary();
  delete copy.flags.starwarsffg.ffgimportid;
  copy._stats.compendiumSource = "Compendium.world.adversaries.Actor.abc123";
  assert.equal(shouldApplySkillTheme(copy, themeSkills), false);
});

test("an empty or missing theme is never applied", () => {
  assert.equal(shouldApplySkillTheme(stockActor(), {}), false);
  assert.equal(shouldApplySkillTheme(stockActor(), undefined), false);
});
