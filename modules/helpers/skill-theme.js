/**
 * Whether a newly created actor should have its skill dictionary replaced by the world's skill
 * theme.
 *
 * The hook that asks this exists for one situation: an actor is created blank, so its
 * `system.skills` is whatever the DataModel's `initial` supplied — `STOCK_SKILLS()`, a clone of the
 * stock Star Wars list (data/actor-templates.js:24) — and the world runs a different theme.
 *
 * Every other new actor already carries authored skills, and a theme dictionary holds `rank: 0` for
 * every skill, so applying it there is not a re-theme but an erase. That is issue #62: an adversary
 * from the Adversaries (SWA) importer stores the custom `Cybernetics` skill, and a sidebar
 * duplicate has its `flags.starwarsffg.ffgimportid` stripped on purpose so the copy does not claim
 * the original's OggDude identity. The old guard — "no import id, and the key set differs from the
 * theme's" — read that copy as blank and zeroed every rank.
 *
 * So the test is equality with the model default, not inequality with the theme. That is the only
 * thing that actually distinguishes "nobody has written skills here yet" from "these skills are
 * someone's data", and it needs no provenance flags: an imported actor, a duplicate, a compendium
 * import and a wizard-built character all differ from the default and are all left alone. Where the
 * comparison cannot be made — no dictionary, no theme, no default to compare against — the answer
 * is no, because the cost of a false positive is destroyed data and the cost of a false negative is
 * a blank actor keeping stock skill names.
 *
 * Compare against the actor's SOURCE skills (`actor._source.system.skills`), never the prepared
 * ones: `prepareDerivedData` (actors/actor-ffg.js:186) merges the active theme's definitions in and
 * prunes anything outside `CONFIG.FFG.skills`, so a prepared dictionary already looks like the
 * theme and tells you nothing about what was stored.
 *
 * Deliberately Foundry-free so it can be unit tested; the caller owns the settings read, the clone
 * and the write.
 *
 * @param {object|undefined} actorSkills the actor's stored `system.skills`.
 * @param {object|undefined} themeSkills the configured theme's skill dictionary.
 * @param {object|undefined} stockSkills the DataModel default, i.e. the stock Star Wars list.
 * @returns {boolean} true when the theme should replace the actor's skills.
 */
export function shouldApplySkillTheme(actorSkills, themeSkills, stockSkills) {
  if (!countsAsDictionary(actorSkills)) return false;
  if (!countsAsDictionary(themeSkills)) return false;
  if (!countsAsDictionary(stockSkills)) return false;

  // Untouched since the DataModel wrote it, and not already what the theme would write.
  return deepEquals(actorSkills, stockSkills) && !deepEquals(actorSkills, themeSkills);
}

/** A usable, non-empty skill dictionary — vehicles and homesteads have no `skills` at all. */
function countsAsDictionary(value) {
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}

/**
 * Structural equality, order-insensitive.
 *
 * A skill entry is normally a flat record of primitives, but a world-imported skill list may nest,
 * so this recurses rather than comparing `JSON.stringify` output — which would also make the answer
 * depend on key order, and key order is not authorship.
 */
function deepEquals(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, i) => deepEquals(entry, b[i]));
  }

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEquals(a[key], b[key]));
}
