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
import { addLink, linkChangeVerdict, removeLink } from "./roll-option-links.js";

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

/**
 * The link list as the shared partial shows it (templates/parts/shared/ffg-roll-option-links.html).
 * @param {string[]|undefined} uuids
 * @returns {Array<{uuid: string, name: string, missing: boolean}>}
 */
export function describeRollOptionLinks(uuids) {
  return (Array.isArray(uuids) ? uuids : []).map((uuid) => {
    let macro = null;
    try {
      macro = foundry.utils.fromUuidSync(uuid);
    } catch {
      macro = null;
    }
    return macro
      ? { uuid, name: macro.name ?? uuid, missing: false }
      : { uuid, name: game.i18n.localize("SWFFG.RollOptions.Links.Missing"), missing: true };
  });
}

/**
 * Wire a rendered link list: drop a macro to link it (refused, with the errors, when its text does
 * not validate), open a linked macro, remove a link. Used by the item sheets (and so the Codex II
 * sheets) and by the embedded item popups, each with its own `save`.
 * @param {HTMLElement|jQuery} root
 * @param {object} params
 * @param {(change: (links: string[]) => string[]) => Promise<void>} params.save
 */
export function bindRollOptionLinks(root, { save }) {
  const element = root instanceof HTMLElement ? root : root?.[0];
  const section = element?.querySelector?.(".roll-option-links");
  if (!section) return;

  section.addEventListener("dragover", (event) => event.preventDefault());
  section.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data?.type !== "Macro" || !data.uuid) return;
    const macro = await foundry.utils.fromUuid(data.uuid);
    if (!macro) return;
    const result = parseOptionText(macro.command);
    if (!result.ok) {
      const lines = [game.i18n.format("SWFFG.RollOptions.Links.Invalid", { name: macro.name }), ...localizeOptionErrors(result.errors)];
      ui.notifications.warn(lines.join(" "), { permanent: true });
      return;
    }
    await save((links) => addLink(links, macro.uuid));
    // Mark it as an option macro, so a later edit of its text is checked on save.
    if (macro.getFlag?.("starwarsffg", "rollOption") !== true && macro.isOwner && !macro.compendium?.locked) {
      await macro.setFlag("starwarsffg", "rollOption", true);
    }
  });

  section.addEventListener("click", async (event) => {
    const control = event.target.closest?.(".roll-option-link-control");
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    const uuid = control.closest(".roll-option-link")?.dataset.uuid;
    if (!uuid) return;
    if (control.dataset.action === "open") {
      const macro = await foundry.utils.fromUuid(uuid);
      macro?.sheet?.render(true);
    } else if (control.dataset.action === "remove") {
      await save((links) => removeLink(links, uuid));
    }
  });
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
