/**
 * The chat card's roll options line (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "Chat card"):
 *
 *   Roll options: Two weapons (same skill), Guns Blazing (2 strain), Point Blank 2, Frenzied Attack 2 (2 strain)
 *
 * Each option shows its label, then the amount the player picked (for an option with an amount) or
 * its rank (for a ranked talent), then its costs. The costs come from the dialog's row states,
 * already resolved for the chosen amount. Options never change the weapon, so the line is the only
 * record of Linked, extra damage or range on the card.
 *
 * Localization is passed in, so Node covers it (tests/node/roll-option-card.test.mjs).
 */

const TWO_WEAPONS_KEYS = Object.freeze({
  same: "SWFFG.RollOptions.Card.TwoWeaponsSame",
  different: "SWFFG.RollOptions.Card.TwoWeaponsDifferent",
});

/**
 * The entries of the line: Two weapons first, then each ticked option in the order offered.
 * @param {object} params
 * @param {object[]} params.offered - from collectOfferedOptions
 * @param {{rows: object[]}} params.states - from planOptionStates
 * @param {"no"|"same"|"different"} params.twoWeapons
 * @param {"strain"|"wounds"} [params.unit] - what the payer pays in
 * @returns {Array<{label: string|null, labelKey: string|null, number: number|null, strain: number, unit: string, maneuvers: number}>}
 */
export function rollOptionCardEntries({ offered, states, twoWeapons, unit = "strain" }) {
  const entries = [];
  if (TWO_WEAPONS_KEYS[twoWeapons]) {
    entries.push({ label: null, labelKey: TWO_WEAPONS_KEYS[twoWeapons], number: null, strain: 0, unit, maneuvers: 0 });
  }
  const rows = new Map((states?.rows ?? []).map((row) => [row.key, row]));
  for (const option of offered ?? []) {
    const row = rows.get(option.key);
    if (!row?.ticked) continue;
    const number = option.amount ? row.amount : option.ranked ? option.rank : null;
    entries.push({ label: option.label, labelKey: null, number, strain: row.cost.strain, unit, maneuvers: row.cost.maneuvers });
  }
  return entries;
}

/**
 * The line's text, or null when nothing was used.
 * @param {ReturnType<typeof rollOptionCardEntries>} entries
 * @param {(key: string, data?: object) => string} localize - game.i18n.format, or localize when there is no data
 * @returns {string|null}
 */
export function formatRollOptionsLine(entries, localize) {
  if (!entries?.length) return null;
  const parts = entries.map((entry) => {
    let text = entry.labelKey ? localize(entry.labelKey) : entry.label;
    if (entry.number !== null && entry.number !== undefined) text += ` ${entry.number}`;
    const costs = [];
    if (entry.strain > 0) {
      const key = entry.unit === "wounds"
        ? (entry.strain === 1 ? "SWFFG.RollOptions.Cost.Wound" : "SWFFG.RollOptions.Cost.Wounds")
        : "SWFFG.RollOptions.Cost.Strain";
      costs.push(localize(key, { n: entry.strain }));
    }
    if (entry.maneuvers > 0) {
      const key = entry.maneuvers === 1 ? "SWFFG.RollOptions.Cost.Maneuver" : "SWFFG.RollOptions.Cost.Maneuvers";
      costs.push(localize(key, { n: entry.maneuvers }));
    }
    if (costs.length > 0) text += ` (${costs.join(", ")})`;
    return text;
  });
  return localize("SWFFG.RollOptions.CardLine", { entries: parts.join(", ") });
}
