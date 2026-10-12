/**
 * Where a Sheet Options option lives on its document.
 *
 * Most options are sheet flags: `flags.starwarsffg.config.<name>`. An option registered with a
 * `path` is document data other code reads -- the vehicle defence-zone override lives in
 * `system.stats.defenceZones`, where the roll dialog finds it on the targeted vehicle -- so it is
 * read from and written to that path instead.
 *
 * Pure and dependency-free (no imports, no `game`, no DOM, nothing from `foundry` at load) so the
 * read and write rules can be unit tested headlessly. `ActorOptions` supplies
 * `foundry.utils.getProperty` and does the dialog and the document update itself.
 */

/**
 * The value an option shows: what the document stores for it, or its default.
 *
 * Read only -- this runs on every render, so it must not write. Accepting the dialog is what
 * creates the config flag.
 *
 * @param {object} document  The document the sheet shows.
 * @param {string} name      The option's registered name.
 * @param {{path?: string, default?: *}} option
 * @param {(object: object, path: string) => *} getProperty  `foundry.utils.getProperty`.
 * @returns {*}
 */
export function readSheetOptionValue(document, name, option, getProperty) {
  if (option.path) return getProperty(document, option.path) ?? option.default;
  return document.flags?.starwarsffg?.config?.[name] ?? option.default;
}

/**
 * The document path Accept writes an option's value to: its own `path`, or a sheet flag named
 * after the dialog control (`config.<name>`).
 *
 * @param {{path?: string}} option
 * @param {string} controlName  The dialog control's `name` attribute.
 * @returns {string}
 */
export function sheetOptionWritePath(option, controlName) {
  return option.path ?? `flags.starwarsffg.${controlName}`;
}
