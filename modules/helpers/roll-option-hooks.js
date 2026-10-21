/**
 * Foundry-side wiring for roll options (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md):
 *
 * - the link guard: a non-GM update that changes a roll option link list is refused, whether the
 *   list is the item's own or a copy's (a quality, an attachment, a tree node). The decision lives
 *   in roll-option-links.js; this only runs it. It runs on the client that makes the update, which
 *   is as far as Foundry lets a system enforce it;
 * - the save check: when a GM saves an option macro with text that does not validate, they are
 *   told what is wrong. Foundry's macro editor closes and drops the text when a save is refused
 *   (checked in Foundry 14, plan Task 0), so the save goes through with a warning, and the dialog
 *   skips the macro until it is fixed.
 */
import { optionErrorKey, parseOptionText } from "./roll-options.js";
import { linkChangeVerdict } from "./roll-option-links.js";

/** The `system` keys under which an item holds link lists, its own or its copies'. */
const LINKED_KEYS = Object.freeze(["rollOptions", "itemmodifier", "itemattachment", "talents"]);

/**
 * Validation errors as sentences for the GM.
 * @param {Array<{option: number|null, key: string, code: string, detail?: string}>} errors
 * @returns {string[]}
 */
export function localizeOptionErrors(errors) {
  return (errors ?? []).map((error) => game.i18n.format(optionErrorKey(error), {
    option: error.option ?? "",
    key: error.key ?? "",
    detail: error.detail ?? "",
  }));
}

/**
 * Tell the GM what is wrong with a macro's option text, until they dismiss it.
 * @param {string} name - the macro's name
 * @param {Array<object>} errors - from parseOptionText
 */
export function warnOptionErrors(name, errors) {
  const lines = [game.i18n.format("SWFFG.RollOptions.Error.Header", { name }), ...localizeOptionErrors(errors)];
  ui.notifications.warn(lines.join(" "), { permanent: true });
}

function touchesLinks(changes) {
  const system = foundry.utils.expandObject(changes ?? {})?.system;
  return !!system && typeof system === "object" && LINKED_KEYS.some((key) => key in system);
}

function guardLinks(item, changes, _options, userId) {
  if (!touchesLinks(changes)) return true;
  const user = game.users.get(userId) ?? game.user;
  if (user?.isGM) return true;
  const before = item.toObject();
  const after = foundry.utils.mergeObject(item.toObject(), foundry.utils.expandObject(changes), { inplace: false, performDeletions: true });
  const verdict = linkChangeVerdict(before, after, { isGM: false });
  if (verdict.ok) return true;
  ui.notifications.warn(game.i18n.localize("SWFFG.RollOptions.Links.NotAllowed"));
  CONFIG.logger?.warn?.(`Refused a roll option link change on ${item.uuid} (${verdict.where})`);
  return false;
}

function checkOptionMacro(macro, changes) {
  if (changes?.command === undefined) return;
  const flag = foundry.utils.getProperty(foundry.utils.expandObject(changes), "flags.starwarsffg.rollOption");
  const flagged = flag === true || (flag === undefined && macro.getFlag?.("starwarsffg", "rollOption") === true);
  if (!flagged) return;
  const result = parseOptionText(changes.command);
  if (!result.ok) warnOptionErrors(macro.name, result.errors);
}

/** Register the link guard and the option macro save check. Call once, at init. */
export function registerRollOptionHooks() {
  Hooks.on("preUpdateItem", guardLinks);
  Hooks.on("preUpdateMacro", checkOptionMacro);
}
