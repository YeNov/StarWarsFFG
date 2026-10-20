/**
 * Optional buffs: named groups of modifier rows on an item that apply to a roll only when the
 * player ticks them in the roll dialog (docs/superpowers/specs/2026-10-20-optional-buffs-design.md).
 *
 * This module holds the list itself: which items carry buffs, which row types a buff may hold,
 * and the edits the item sheets make. Stored as `system.optionalBuffs`:
 *   [{ id, name, rows: [{ modtype, mod, value }] }]
 * Rows are shaped like the item's ordinary modifier rows in `system.attributes`, but they never
 * become Active Effects and never count anywhere except a roll they were ticked for.
 *
 * Free of Foundry globals beyond `foundry.utils.randomID`, so Node covers it
 * (tests/node/optional-buffs.test.mjs).
 */

/** The item types that carry optional buffs. */
export const BUFF_ITEM_TYPES = ["weapon", "armour", "gear", "talent", "itemattachment"];

/** The row types a buff may hold: the ones that change a roll's dice. */
export const BUFF_MODTYPES = [
  "Roll Modifiers",
  "Dice Modifiers",
  "Result Modifiers",
  "Skill Add Advantage",
  "Skill Add Dark",
  "Skill Add Despair",
  "Skill Add Failure",
  "Skill Add Light",
  "Skill Add Success",
  "Skill Add Threat",
  "Skill Add Triumph",
  "Skill Add Upgrade",
  "Skill Boost",
  "Skill Rank",
  "Skill Remove Setback",
  "Skill Setback",
];

const BUFF_MODTYPE_SET = new Set(BUFF_MODTYPES);

/**
 * Whether a row type targets one skill (its `mod` is a skill key) rather than the roll as a whole.
 * @param {string} modtype
 * @returns {boolean}
 */
export function isSkillModtype(modtype) {
  return typeof modtype === "string" && modtype.startsWith("Skill ");
}

/**
 * The modifier type picker for buff rows: the given types, kept to those a buff may hold.
 * @param {object} allTypes - shaped like `CONFIG.FFG.allowableModifierTypes` (key → `{value, label}`)
 * @returns {object}
 */
export function buffModifierTypes(allTypes) {
  return Object.fromEntries(Object.entries(allTypes ?? {}).filter(([key]) => BUFF_MODTYPE_SET.has(key)));
}

/** @returns {{id: string, name: string, rows: Array}} */
export function newBuff() {
  return { id: foundry.utils.randomID(), name: "", rows: [] };
}

/** @returns {{modtype: string, mod: string, value: number}} */
export function newBuffRow() {
  return { modtype: "Roll Modifiers", mod: "Add Boost", value: 1 };
}

const wholeNumber = (value) => parseInt(value, 10) || 0;

function cleanRow(row) {
  if (!row || typeof row !== "object" || !BUFF_MODTYPE_SET.has(row.modtype)) return null;
  return { modtype: row.modtype, mod: row.mod == null ? "" : String(row.mod), value: wholeNumber(row.value) };
}

/**
 * Read a stored buff list, dropping what a buff can't hold instead of throwing on it. A buff
 * stored without an id gets one from its position, so it keeps the same id on every read and the
 * sheet's edits can find it again.
 * @param {unknown} raw
 * @returns {Array<{id: string, name: string, rows: Array}>}
 */
export function cleanBuffs(raw) {
  if (!Array.isArray(raw)) return [];
  const buffs = [];
  raw.forEach((buff, index) => {
    if (!buff || typeof buff !== "object") return;
    const id = typeof buff.id === "string" && buff.id ? buff.id : `buff-${index}`;
    const name = typeof buff.name === "string" ? buff.name : "";
    const rows = Array.isArray(buff.rows) ? buff.rows.map(cleanRow).filter(Boolean) : [];
    buffs.push({ id, name, rows });
  });
  return buffs;
}

/** Apply `change` to the buff with `buffId` in a cleaned copy of `buffs`. */
function editBuff(buffs, buffId, change) {
  return cleanBuffs(buffs).map((buff) => (buff.id === buffId ? change(buff) : buff));
}

export function addBuff(buffs) {
  return [...cleanBuffs(buffs), newBuff()];
}

export function removeBuff(buffs, buffId) {
  return cleanBuffs(buffs).filter((buff) => buff.id !== buffId);
}

export function renameBuff(buffs, buffId, name) {
  return editBuff(buffs, buffId, (buff) => ({ ...buff, name: typeof name === "string" ? name : "" }));
}

export function addBuffRow(buffs, buffId) {
  return editBuff(buffs, buffId, (buff) => ({ ...buff, rows: [...buff.rows, newBuffRow()] }));
}

/**
 * Change one row of one buff. `patch` may set `modtype`, `mod` and `value`; the value is kept a
 * whole number, and a row whose type a buff can't hold is dropped.
 */
export function setBuffRow(buffs, buffId, index, patch) {
  return editBuff(buffs, buffId, (buff) => ({
    ...buff,
    rows: buff.rows.map((row, i) => (i === index ? cleanRow({ ...row, ...patch }) : row)).filter(Boolean),
  }));
}

export function removeBuffRow(buffs, buffId, index) {
  return editBuff(buffs, buffId, (buff) => ({ ...buff, rows: buff.rows.filter((_, i) => i !== index) }));
}
