/**
 * What ticked roll options do to the attacking weapon: its damage and critical rating for that one
 * attack (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Amendments: weapon
 * damage and crit from options").
 *
 * The dialog sums the ticked rows from the entries it captured when Roll was clicked, so the
 * numbers are the ones the chat line names and the charge pays for. The roll carries the sum, and
 * the chat card applies it to its weapon copy every time it renders, after reloading that copy
 * from the item. The copy records what it got, so a copy that was not reloaded is not changed twice.
 *
 * cardWeaponStats is the one rule for which numbers the card and Apply Damage use.
 *
 * Imports nothing, so Node covers it (tests/node/roll-option-weapon.test.mjs).
 */

const number = (value) => Number(value) || 0;

/**
 * The weapon changes of the ticked rows, added up.
 * @param {Array<{weapon?: {damage?: number, critical?: number}|null}>} entries - rollOptionCardEntries
 * @returns {{damage: number, critical: number}|null} null when nothing changes
 */
export function sumWeaponAdjust(entries) {
  let damage = 0;
  let critical = 0;
  for (const entry of entries ?? []) {
    damage += number(entry?.weapon?.damage);
    critical += number(entry?.weapon?.critical);
  }
  return damage === 0 && critical === 0 ? null : { damage, critical };
}

/** A stat's starting number: the adjusted one, or the raw one on a copy never adjusted. */
const startOf = (stat, fallsBack) => (fallsBack ? number(stat?.value) : number(stat?.adjusted));

/**
 * Put the options' changes on the chat card's weapon copy, in place: damage never below 0, crit
 * never below 1. Records them as `system.rollOptionWeapon`, and does nothing on a copy that has
 * them already.
 * @param {object} itemData - the weapon copy the chat card renders
 * @param {{damage: number, critical: number}|null} adjust - from sumWeaponAdjust
 * @returns {object} itemData
 */
export function applyWeaponAdjust(itemData, adjust) {
  const system = itemData?.system;
  if (!adjust || !system?.damage || system.rollOptionWeapon) return itemData;
  // As the card has always read the copy: an adjusted damage of 0 means "never adjusted".
  const fallsBack = number(system.damage.adjusted) === 0;
  system.damage.adjusted = Math.max(0, startOf(system.damage, fallsBack) + number(adjust.damage));
  system.crit = system.crit ?? {};
  system.crit.adjusted = Math.max(1, startOf(system.crit, fallsBack) + number(adjust.critical));
  system.rollOptionWeapon = { damage: number(adjust.damage), critical: number(adjust.critical) };
  return itemData;
}

/**
 * The damage and crit the chat card shows and Apply Damage starts from. A copy an option changed
 * uses its adjusted numbers, even a damage of 0. Any other copy keeps the card's old rule: the
 * adjusted numbers when the adjusted damage is not 0, the raw ones otherwise.
 * @param {object} itemSystem - the weapon copy's `system`
 * @returns {{damage: number, crit: number}}
 */
export function cardWeaponStats(itemSystem) {
  const damage = itemSystem?.damage;
  const crit = itemSystem?.crit;
  const fallsBack = !itemSystem?.rollOptionWeapon && number(damage?.adjusted) === 0;
  return { damage: startOf(damage, fallsBack), crit: startOf(crit, fallsBack) };
}
