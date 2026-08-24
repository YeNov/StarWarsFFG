/**
 * Skill defaults — what an actor's stored `system.skills` is merged over during
 * `prepareDerivedData`.
 *
 * There are two separate skill tables in play and neither is sufficient on its own:
 *
 *   - `CONFIG.FFG.skills` (config/ffg-skills.js) is a PRESENTATION table — `value`, `label`,
 *     `abrev`. It is what the sheet localizes names from, and it is also the membership list the
 *     prune step in `prepareDerivedData` checks against.
 *   - the active skill theme (`CONFIG.FFG.alternateskilllists`, seeded from config/ffg-skillslist.js
 *     and overridable per world) holds the DEFINITIONS — `characteristic`, `type`, `max`,
 *     `groupskill`, `careerskill`, `rank`. It is also where the actor DataModel's own `initial`
 *     skill dictionary comes from (see data/actor-templates.js).
 *
 * Merging over the presentation table alone was harmless while template.json guaranteed that every
 * stored skill already carried its definition. Under a DataModel it is not: `skills` is a
 * TypedObjectField of freeform ObjectFields, so a document created with a partial dictionary keeps
 * exactly what it was given. A skill left without a `characteristic` rolls a pool with no dice, and
 * one left without a `type` matches none of the `system.skilltypes` buckets the sheet groups by, so
 * it renders under no category header.
 */

/**
 * Resolve the skill theme configured for the world, falling back to the stock Star Wars list when
 * the configured one is not installed (a theme can be removed after actors were built on it).
 *
 * @param {Array<{id: string, skills: object}>} skillLists usually `CONFIG.FFG.alternateskilllists`.
 * @param {string} skilltheme id of the configured theme.
 * @returns {{id: string, skills: object}|undefined} the theme, or undefined if none are available.
 */
export function pickSkillTheme(skillLists, skilltheme) {
  const lists = Array.isArray(skillLists) ? skillLists : [];
  return lists.find((entry) => entry?.id === skilltheme) ?? lists.find((entry) => entry?.id === "starwars");
}

/**
 * Build the per-skill defaults to merge an actor's stored skills over: the active theme's
 * definitions with the presentation table laid on top.
 *
 * @param {object} configSkills the presentation table, i.e. `CONFIG.FFG.skills`.
 * @param {Array<{id: string, skills: object}>} skillLists usually `CONFIG.FFG.alternateskilllists`.
 * @param {string} skilltheme id of the configured theme.
 * @returns {object} a fresh dictionary; the caller may mutate it freely.
 */
export function buildSkillDefaults(configSkills, skillLists, skilltheme) {
  const themeSkills = pickSkillTheme(skillLists, skilltheme)?.skills ?? {};
  const defaults = {};

  // `CONFIG.FFG.skills` is walked FIRST because it fixes the key order, and key order is not
  // cosmetic here: `prepareDerivedData` derives `system.skilltypes` — the order the sheet prints
  // skill categories in — from the order the skills come out of this dictionary. Basing it on the
  // theme instead would silently reshuffle the categories on every sheet.
  for (const name of Object.keys(configSkills ?? {})) {
    defaults[name] = copySkill(copySkill({}, themeSkills[name]), configSkills[name]);
  }
  for (const name of Object.keys(themeSkills)) {
    if (!(name in defaults)) {
      defaults[name] = copySkill({}, themeSkills[name]);
    }
  }

  return defaults;
}

/**
 * Copy one skill definition onto `target`.
 *
 * This runs for every skill of every actor on every data preparation, so it stays a key-by-key
 * copy rather than a `structuredClone` of the whole entry — a skill definition is a flat record of
 * primitives, which makes the copy a full clone at a fraction of the cost. Only a nested value
 * (which a world-imported skill list could hold) needs the deep clone, or the caller's merge would
 * write straight into the shared config table.
 */
function copySkill(target, skill) {
  for (const key of Object.keys(skill ?? {})) {
    const value = skill[key];
    target[key] = value !== null && typeof value === "object" ? structuredClone(value) : value;
  }
  return target;
}
