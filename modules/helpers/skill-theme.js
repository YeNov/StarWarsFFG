/**
 * Whether a newly created actor should have its skill dictionary replaced with the world's skill
 * theme.
 *
 * The `createActor` hook that calls this exists for exactly one situation: an actor is created
 * blank, so its `system.skills` is whatever the DataModel's `initial` supplied (the stock Star Wars
 * list), and the world runs a different theme. Re-theming it there is the point.
 *
 * Every other new actor already carries authored skills, and the theme dictionary holds `rank: 0`
 * for every skill — so applying it is not a re-theme, it is an erase. That is issue #62: an
 * adversary from the Adversaries (SWA) importer stores the custom `Cybernetics` skill, so its key
 * set never equals the stock theme's, and a sidebar duplicate has its
 * `flags.starwarsffg.ffgimportid` stripped on purpose (registerDuplicateIdentityHooks, so the copy
 * does not claim the original's OggDude identity). The import id was the only guard, so the copy
 * landed with every rank zeroed.
 *
 * Provenance is therefore read from `_stats` as well: Foundry stamps `duplicateSource` on a UI
 * duplicate and `compendiumSource` on a document dragged out of a compendium. Either one means the
 * skills came from an existing document rather than from the DataModel default.
 *
 * Deliberately Foundry-free so it can be unit tested; the caller owns the settings read, the clone
 * and the `update()`.
 *
 * @param {{flags?: object, _stats?: object, system?: {skills?: object}}} actor the created actor
 *   (or an equivalent source object).
 * @param {object} themeSkills the configured theme's skill dictionary.
 * @returns {boolean} true when the theme should replace the actor's skills.
 */
export function shouldApplySkillTheme(actor, themeSkills) {
  const themeKeys = Object.keys(themeSkills ?? {});
  if (!themeKeys.length) return false;

  // Imported actors keep the dictionary their importer wrote.
  const ffg = actor?.flags?.starwarsffg;
  if (ffg && Object.prototype.hasOwnProperty.call(ffg, "ffgimportid")) return false;

  // Copies of an existing document carry that document's authored skills.
  if (actor?._stats?.duplicateSource || actor?._stats?.compendiumSource) return false;

  const actorKeys = Object.keys(actor?.system?.skills ?? {});
  return JSON.stringify(themeKeys.sort()) !== JSON.stringify(actorKeys.sort());
}
