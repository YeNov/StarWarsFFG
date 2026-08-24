/**
 * The skill dictionary the SWA (Adversaries) importer writes to `system.skills` on every actor it
 * creates.
 *
 * It has to be COMPLETE. Under template.json the importer could get away with a partial
 * dictionary — Foundry deep-merged it over the template's `skills` block on create, so entries
 * carrying only a rank still landed with `characteristic`/`type`/`groupskill`/`max`. A registered
 * DataModel does not do that: `skills` is a `TypedObjectField` whose `initial` (the stock list, see
 * data/actor-templates.js) applies only when the key is absent, and each per-skill value is a
 * freeform `ObjectField` stored exactly as given. Anything omitted here is missing on the imported
 * actor for good — a skill with no `characteristic` rolls an empty pool, and one with no `type`
 * belongs to none of the categories `_createSkillColumns` builds from `system.skilltypes`.
 *
 * So the definitions come straight from the active skill theme (which is where the actor's own
 * default comes from too) rather than being restated here. Only the two things the theme cannot
 * supply are added on top: the OggDude skill keys, and the Cybernetics skill that the adversary
 * data uses but the stock Star Wars list does not define.
 */

import { pickSkillTheme } from "../helpers/skill-defaults.js";

/**
 * OggDude skill keys, kept because the importer has always written them (`import-helpers.js`
 * matches skills by `Key` when an OggDude character or adversary is imported over an actor).
 * Star Wars theme only — alternate themes have their own key spaces.
 */
export const SWA_SKILL_KEYS = {
  "Astrogation": "ASTRO",
  "Athletics": "ATHL",
  "Brawl": "BRAWL",
  "Charm": "CHARM",
  "Coercion": "COERC",
  "Computers": "COMP",
  "Cool": "COOL",
  "Coordination": "COORD",
  "Deception": "DECEP",
  "Discipline": "DISC",
  "Gunnery": "GUNN",
  "Leadership": "LEAD",
  "Lightsaber": "LTSABER",
  "Mechanics": "MECH",
  "Medicine": "MED",
  "Melee": "MELEE",
  "Negotiation": "NEG",
  "Perception": "PERC",
  "Piloting: Planetary": "PILOTPL",
  "Piloting: Space": "PILOTSP",
  "Ranged: Heavy": "RANGHVY",
  "Ranged: Light": "RANGLT",
  "Resilience": "RESIL",
  "Skulduggery": "SKUL",
  "Stealth": "STEAL",
  "Streetwise": "SW",
  "Survival": "SURV",
  "Vigilance": "VIGIL",
  "Knowledge: Core Worlds": "CORE",
  "Knowledge: Education": "EDU",
  "Knowledge: Lore": "LORE",
  "Knowledge: Outer Rim": "OUT",
  "Knowledge: Underworld": "UND",
  "Knowledge: Warfare": "WARF",
  "Knowledge: Xenology": "XEN",
  "Cybernetics": "CYBERNETICS",
};

/**
 * Cybernetics is referenced by the SWA data set but is not part of the stock Star Wars skill list,
 * so it is imported as a custom skill. `custom: true` is what keeps `prepareDerivedData` from
 * pruning it (it prunes every skill that is neither custom nor present in `CONFIG.FFG.skills`).
 */
const SWA_CUSTOM_SKILLS = {
  "Cybernetics": {
    "rank": 0,
    "careerskill": false,
    "Key": "CYBERNETICS",
    "custom": true,
    "type": "General",
    "characteristic": "Intellect",
    "label": "Cybernetics",
  },
};

/**
 * Build the skill dictionary for an SWA import.
 *
 * @param {Array<{id: string, skills: object}>} skillLists the available skill themes, i.e.
 *   `CONFIG.FFG.alternateskilllists`.
 * @param {string} skilltheme id of the theme configured for the world.
 * @returns {object} a fresh, complete skill dictionary; the caller may mutate it freely.
 */
export function buildSwaSkillDictionary(skillLists, skilltheme) {
  // pickSkillTheme falls back to the stock list, so a theme that has been uninstalled since the
  // world was configured cannot take the import down with it.
  const list = pickSkillTheme(skillLists, skilltheme);
  const skills = structuredClone(list?.skills ?? {});

  // Alternate themes ship complete lists of their own; the Star Wars extras do not belong in them.
  if (list?.id !== "starwars") {
    return skills;
  }

  for (const [name, key] of Object.entries(SWA_SKILL_KEYS)) {
    if (skills[name]) {
      skills[name].Key = key;
    }
  }
  for (const [name, skill] of Object.entries(SWA_CUSTOM_SKILLS)) {
    if (!skills[name]) {
      skills[name] = structuredClone(skill);
    }
  }

  return skills;
}
