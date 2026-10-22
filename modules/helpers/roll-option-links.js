/**
 * Roll option link lists, and the rule that only the GM changes them
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Link lists on items").
 *
 * An item links option macros by uuid in `system.rollOptions`, and so do the copies it holds:
 * qualities (`system.itemmodifier`), attachments (`system.itemattachment`) and their qualities,
 * and specialization tree nodes (`system.talents.<slot>.rollOptions`).
 *
 * The guard compares an item before and after an update. Copies are matched by identity, not by
 * position: a quality or attachment by its id and name, a tree node by its slot and the talent it
 * holds. A copy present on both sides must keep exactly the same links; a copy removed, added,
 * replaced or moved is fine, so players keep every ordinary way of handling their items.
 *
 * Free of Foundry globals, so Node covers it (tests/node/roll-option-links.test.mjs).
 */

const listOf = (value) => (Array.isArray(value) ? value : []);
const joined = (links) => listOf(links).join("\n");

/**
 * A link list with `uuid` added once.
 * @param {string[]|undefined} list
 * @param {string} uuid
 * @returns {string[]}
 */
export function addLink(list, uuid) {
  const next = [...listOf(list)];
  if (!next.includes(uuid)) next.push(uuid);
  return next;
}

/**
 * A link list without `uuid`.
 * @param {string[]|undefined} list
 * @param {string} uuid
 * @returns {string[]}
 */
export function removeLink(list, uuid) {
  return listOf(list).filter((link) => link !== uuid);
}

/**
 * Which copy this is, within the list that holds it.
 * @param {object} copy - a quality or attachment held by another item
 * @returns {string}
 */
export function copyIdentity(copy) {
  return `${copy?._id ?? copy?.id ?? ""}|${copy?.name ?? ""}`;
}

/**
 * Which talent a specialization tree slot holds.
 * @param {string} slotKey - e.g. "talent3"
 * @param {object} node
 * @returns {string}
 */
export function nodeIdentity(slotKey, node) {
  return `${slotKey}|${node?.itemId || node?.name || ""}`;
}

/**
 * A copy of `list` where the copy with this identity links `links`.
 * @param {object[]} list
 * @param {string} identity - from copyIdentity
 * @param {string[]} links
 * @returns {object[]}
 */
export function withCopyLinks(list, identity, links) {
  return listOf(list).map((copy) => (copyIdentity(copy) === identity
    ? { ...copy, system: { ...(copy.system ?? {}), rollOptions: [...links] } }
    : copy));
}

/** Fields a modification form never carries, put back on save: identity, and the links. */
const KEPT_IDENTITY = ["_id", "id", "type", "img"];

/**
 * Put back what a form-rebuilt list of copies lost. Saving an attachment (its popup, or its own
 * sheet) rebuilds the modifications inside it from the form, which carries only their name,
 * description, switches, rank and modifier rows: their ids and roll option links would be dropped.
 * Each rebuilt copy is matched to the stored one at the same place with the same name, else the
 * first unmatched one with that name, else (when nothing was added or removed, so a rename) the
 * one at the same place. Only fields the form lacks are taken from it, so edits and removed
 * modifier rows stay as the form has them.
 * @param {object[]|undefined} stored - the copies as stored before the save
 * @param {object[]} edited - the copies the form built
 * @returns {object[]}
 */
export function keepCopyFields(stored, edited) {
  const before = listOf(stored);
  const after = listOf(edited);
  const used = new Set();
  const take = (index) => {
    used.add(index);
    return before[index];
  };
  return after.map((copy, index) => {
    let match = null;
    if (before[index] && !used.has(index) && before[index]?.name === copy?.name) match = take(index);
    if (!match) {
      const found = before.findIndex((old, i) => !used.has(i) && old?.name === copy?.name);
      if (found >= 0) match = take(found);
    }
    if (!match && before.length === after.length && before[index] && !used.has(index)) match = take(index);
    if (!match || !copy || typeof copy !== "object") return copy;

    const next = { ...copy };
    for (const key of KEPT_IDENTITY) {
      if (next[key] === undefined && match[key] !== undefined) next[key] = match[key];
    }
    const links = match.system?.rollOptions;
    if (Array.isArray(links) && !Array.isArray(next.system?.rollOptions)) {
      next.system = { ...(next.system ?? {}), rollOptions: [...links] };
    }
    return next;
  });
}

/**
 * Every link list an item holds, by where it sits.
 * @param {object} itemData - plain item data
 * @returns {Map<string, string>} "self", "q:<id>", "a:<id>", "a:<id>/q:<id>", "t:<slot>|<talent>" → links joined by "\n"
 */
export function linkSnapshot(itemData) {
  const system = itemData?.system ?? {};
  const snapshot = new Map([["self", joined(system.rollOptions)]]);
  for (const q of listOf(system.itemmodifier)) snapshot.set(`q:${copyIdentity(q)}`, joined(q?.system?.rollOptions));
  for (const a of listOf(system.itemattachment)) {
    const attachment = `a:${copyIdentity(a)}`;
    snapshot.set(attachment, joined(a?.system?.rollOptions));
    for (const q of listOf(a?.system?.itemmodifier)) snapshot.set(`${attachment}/q:${copyIdentity(q)}`, joined(q?.system?.rollOptions));
  }
  const talents = system.talents;
  if (talents && typeof talents === "object" && !Array.isArray(talents)) {
    for (const [slot, node] of Object.entries(talents)) {
      if (node && typeof node === "object") snapshot.set(`t:${nodeIdentity(slot, node)}`, joined(node.rollOptions));
    }
  }
  return snapshot;
}

/**
 * Whether an update may go ahead as far as roll option links are concerned.
 * @param {object} before - the item's data before the update
 * @param {object} after - the item's data with the update applied
 * @param {{isGM: boolean}} user - who is making it
 * @returns {{ok: true} | {ok: false, where: string}}
 */
export function linkChangeVerdict(before, after, { isGM }) {
  if (isGM) return { ok: true };
  const was = linkSnapshot(before);
  const now = linkSnapshot(after);
  for (const [where, links] of was) {
    if (now.has(where) && now.get(where) !== links) return { ok: false, where };
  }
  return { ok: true };
}
