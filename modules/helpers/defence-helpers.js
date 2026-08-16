export const MAX_CHARACTER_DEFENCE = 4;

/**
 * Apply the Star Wars FFG maximum to a character or NPC's prepared defence.
 *
 * This intentionally mutates only the prepared data passed by the actor. The
 * stored source value remains intact, so disabling the world rule restores any
 * higher value instead of permanently discarding it.
 *
 * @param {object | undefined} defence The actor's melee/ranged defence object.
 * @param {boolean} enforce Whether the rules cap is enabled for the world.
 * @returns {object | undefined} The same defence object.
 */
export function applyCharacterDefenceCap(defence, enforce = true) {
  if (!enforce || !defence || typeof defence !== "object") return defence;

  for (const key of ["melee", "ranged"]) {
    const value = Number(defence[key]);
    if (Number.isFinite(value) && value > MAX_CHARACTER_DEFENCE) {
      defence[key] = MAX_CHARACTER_DEFENCE;
    }
  }

  return defence;
}
