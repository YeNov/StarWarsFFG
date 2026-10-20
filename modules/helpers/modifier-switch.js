/**
 * When a modifier is switched off -- the one rule every modifier consumer reads.
 *
 * Two things can be switched off, both by an explicit `active: false` and by nothing else:
 *
 *   - a quality or modification (`{name, system: {active, attributes}}`), whether it sits
 *     directly on a weapon or armour or is installed in an attachment. An attachment's
 *     Installed? box writes its `system.active`. A quality dropped into an attachment, or
 *     imported straight onto an item, often has no `active` at all, and that counts as
 *     installed (open decisions R14, R33);
 *   - one of an item's own modifier rows (`system.attributes[key]`), whose Enabled box writes
 *     the row's `active`. Storing it on the row, not only on the row's Active Effect, is what
 *     lets equipping, unequipping and reconciling the item keep it off (open decisions R34).
 *
 * A leaf module: it imports nothing, so the planner, the live effect sync, the dice pool, the
 * item adjustments, Apply Damage and the importers can all share it without an import cycle.
 */

const switchedOff = (active) => active === false;

/**
 * True when a quality or modification is switched off.
 * @param {object} modifier - `{name, system: {active}}`
 * @returns {boolean}
 */
export function isModifierSuspended(modifier) {
  return switchedOff(modifier?.system?.active);
}

/**
 * True when one of an item's own modifier rows is switched off with its Enabled box.
 * @param {object} attribute - one `system.attributes` entry `{modtype, mod, value, active}`
 * @returns {boolean}
 */
export function isAttributeSuspended(attribute) {
  return switchedOff(attribute?.active);
}

/**
 * The qualities or modifications of a list that are not switched off.
 * @param {Array<object>} modifiers
 * @returns {Array<object>}
 */
export function switchedOn(modifiers) {
  return Array.isArray(modifiers) ? modifiers.filter((modifier) => !isModifierSuspended(modifier)) : [];
}

/**
 * Whether a modifier row's Enabled box shows ticked: never for a row switched off, otherwise
 * whatever its Active Effect says. An effect left disabled by an interrupted bulk suspend (Edit
 * Mode), or by an unequipped item, therefore shows unticked.
 *
 * @param {object} attribute - the row
 * @param {object} [effect] - the row's Active Effect, if it has one
 * @returns {boolean}
 */
export function attributeShowsEnabled(attribute, effect) {
  if (isAttributeSuspended(attribute)) return false;
  return !effect?.disabled;
}

/**
 * What ticking or unticking a row's Enabled box writes: the row's own `active`, which the
 * equip toggle and the reconciler read back, and its Active Effect's `disabled`.
 *
 * Ticking switches the effect on at once, as the box always has, even on an unequipped item:
 * the box doubles as the way to recover an effect an interrupted Edit Mode suspend left off,
 * and a vehicle's ship weapons have no equip toggle at all. The next equip, unequip or
 * reconcile applies the item's equip state again.
 *
 * @param {object} itemData - an ItemFFG or plain `{type, system}`
 * @param {string} key - the row's key in `system.attributes`
 * @param {boolean} enabled - the box's new state
 * @returns {{update: object, effectDisabled: boolean}|null} null when the item has no such row
 */
export function planAttributeToggle(itemData, key, enabled) {
  if (!itemData?.system?.attributes?.[key]) return null;
  const on = Boolean(enabled);
  return {
    update: { [`system.attributes.${key}.active`]: on },
    effectDisabled: !on,
  };
}
