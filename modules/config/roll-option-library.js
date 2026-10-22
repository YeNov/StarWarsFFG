/**
 * The roll option library: ready-made option code for well-known talents and qualities
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "The library").
 *
 * The entries are data, in one list in roll-option-library-entries.js; this file turns them into
 * the frozen library and finds an entry by kind and name.
 *
 * The GM's library run (modules/helpers/roll-option-library-run.js) writes each entry into a world
 * macro and links that macro into every item with a matching name. Names match through
 * normalizeName, so "Auto-fire", "Autofire" and "Auto Fire" are one name. The OggDude importer
 * produces these same names. A run made after new entries arrive creates only their macros and
 * leaves the existing ones alone, so a world that already has a macro keeps its old text until the
 * GM edits it.
 */
import { normalizeName } from "../helpers/roll-options.js";
import { LIBRARY_ENTRIES } from "./roll-option-library-entries.js";

const entry = (id, kind, names, options) => Object.freeze({
  id,
  kind,
  names: Object.freeze(names),
  macroName: `Roll option: ${names[0]}`,
  options: Object.freeze(options),
});

/** Every entry, in the list's order; an entry is a talent unless it names another kind. */
export const ROLL_OPTION_LIBRARY = Object.freeze(
  LIBRARY_ENTRIES.map(({ id, kind = "talent", names, options }) => entry(id, kind, names, options)),
);

/**
 * The library entry for an item of this kind and name, or null.
 * @param {"talent"|"quality"} kind
 * @param {string} name
 * @returns {object|null}
 */
export function libraryEntryFor(kind, name) {
  const key = normalizeName(name);
  if (!key) return null;
  return ROLL_OPTION_LIBRARY.find((e) => e.kind === kind && e.names.some((n) => normalizeName(n) === key)) ?? null;
}
