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

/**
 * The skills whose attacks are opposed by ranged and melee defence respectively.
 * A skill in neither list is not an attack these stats apply to.
 */
export const RANGED_DEFENCE_SKILLS = ["Ranged: Light", "Ranged: Heavy", "Gunnery"];
export const MELEE_DEFENCE_SKILLS = ["Melee", "Brawl", "Lightsaber"];

/**
 * Setback dice contributed by the defence of targeted CHARACTERS.
 *
 * The attacking skill selects which stat is read; the maximum is then taken across
 * the targeted tokens for that one stat. Vehicles are skipped entirely -- they have
 * no ranged/melee split, and their per-zone defence is resolved by the roll dialog's
 * zone picker instead. Skipping them here is also what stops the old crash: vehicles
 * have no `stats.defence`, and the previous code read `.ranged` straight off it.
 *
 * Pure: no `game`, no DOM, no settings. The caller applies the `useDefense` gate.
 *
 * @param {object} options
 * @param {string|null} options.skillValue the attacking skill's `.value`, e.g. "Ranged: Heavy".
 * @param {Iterable<object>|null|undefined} options.targets `game.user.targets`, or any iterable of Tokens.
 * @returns {number} setback dice, never negative.
 */
export function characterDefenceDice({ skillValue, targets }) {
  const stat = RANGED_DEFENCE_SKILLS.includes(skillValue)
    ? "ranged"
    : MELEE_DEFENCE_SKILLS.includes(skillValue)
      ? "melee"
      : null;
  if (!stat || !targets) return 0;

  let dice = 0;
  for (const token of targets) {
    const actor = token?.actor;
    if (!actor || actor.type === "vehicle") continue;
    const value = Number(actor.system?.stats?.defence?.[stat]);
    if (Number.isFinite(value) && value > dice) dice = value;
  }
  return Math.max(0, dice);
}
