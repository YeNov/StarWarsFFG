/**
 * The single starting-bonus table (KEEP-4) — the one source of truth for what each
 * starting bonus grants.
 *
 * Covered (plan §0.6.2). Imports nothing.
 *
 * Transcribed exactly from CharacterCreator.selectStartingBonus (character-creator.js:865-908)
 * and the calcObligation branches (:1554-1600). Each cell is the set of NON-ZERO
 * `grants.bonus` deltas for that choice; the wizard-state mutator zeroes the bonus
 * fields first and then applies the cell. The choice ids include their old book family
 * prefix so the cross-ruleset wizard does not need a separate book selector to interpret
 * ambiguous choices like `5xp`.
 *
 * BUG-2: the aor/eote duty/obligation grants land in `bonus.duty` / `bonus.obligation`
 * here — the legacy code routed them to `bonus[undefined]` by reading a nonexistent
 * legacy field. The table makes the target explicit and correct.
 *
 * Q-2 (preserved quirk, flagged at Stage 22): `2k_credits` grants 2500, not 2000.
 */

export const STARTING_BONUS = Object.freeze({
  "aor_5xp": Object.freeze({ xp: 5, duty: 5 }),
  "aor_10xp": Object.freeze({ xp: 10, duty: 10 }),
  "aor_1k_credits": Object.freeze({ credits: 1000, duty: 5 }),
  "aor_2k_credits": Object.freeze({ credits: 2500, duty: 10 }), // Q-2
  "fad_10xp": Object.freeze({ xp: 10 }),
  "fad_2k_credits": Object.freeze({ credits: 2500 }), // Q-2
  "fad_5xp": Object.freeze({ xp: 5, credits: 1000 }),
  "fad_21_plus_morality": Object.freeze({ morality: 21 }),
  "fad_21_minus_morality": Object.freeze({ morality: -21 }),
  "eote_5xp": Object.freeze({ xp: 5, obligation: 5 }),
  "eote_10xp": Object.freeze({ xp: 10, obligation: 10 }),
  "eote_1k_credits": Object.freeze({ credits: 1000, obligation: 5 }),
  "eote_2k_credits": Object.freeze({ credits: 2500, obligation: 10 }), // Q-2
});

export const STARTING_BONUS_OPTIONS = Object.freeze([
  Object.freeze({ key: "aor_5xp", labelKey: "SWFFG.CharacterCreator.startingBonus.aor.5xp" }),
  Object.freeze({ key: "aor_10xp", labelKey: "SWFFG.CharacterCreator.startingBonus.aor.10xp" }),
  Object.freeze({ key: "aor_1k_credits", labelKey: "SWFFG.CharacterCreator.startingBonus.aor.1k_credits" }),
  Object.freeze({ key: "aor_2k_credits", labelKey: "SWFFG.CharacterCreator.startingBonus.aor.2k_credits" }),
  Object.freeze({ key: "fad_10xp", labelKey: "SWFFG.CharacterCreator.startingBonus.fad.10xp" }),
  Object.freeze({ key: "fad_2k_credits", labelKey: "SWFFG.CharacterCreator.startingBonus.fad.2k_credits" }),
  Object.freeze({ key: "fad_5xp", labelKey: "SWFFG.CharacterCreator.startingBonus.fad.5xp" }),
  Object.freeze({ key: "fad_21_plus_morality", labelKey: "SWFFG.CharacterCreator.startingBonus.fad.plus_21_morality" }),
  Object.freeze({ key: "fad_21_minus_morality", labelKey: "SWFFG.CharacterCreator.startingBonus.fad.minus_21_morality" }),
  Object.freeze({ key: "eote_5xp", labelKey: "SWFFG.CharacterCreator.startingBonus.eote.5xp" }),
  Object.freeze({ key: "eote_10xp", labelKey: "SWFFG.CharacterCreator.startingBonus.eote.10xp" }),
  Object.freeze({ key: "eote_1k_credits", labelKey: "SWFFG.CharacterCreator.startingBonus.eote.1k_credits" }),
  Object.freeze({ key: "eote_2k_credits", labelKey: "SWFFG.CharacterCreator.startingBonus.eote.2k_credits" }),
]);

export const RULESET_KEYS = Object.freeze(["fad", "aor", "eote"]);

/**
 * Return only the starting-bonus choices belonging to one ruleset.
 * @param {string} rules
 * @returns {Array<{key: string, labelKey: string}>}
 */
export function getStartingBonusOptions(rules) {
  if (!RULESET_KEYS.includes(rules)) return [];
  return STARTING_BONUS_OPTIONS.filter((option) => option.key.startsWith(`${rules}_`));
}

/** The bonus fields the starting-bonus mutator zeroes before applying a cell. */
export const BONUS_FIELDS = Object.freeze(["xp", "credits", "duty", "obligation", "conflict", "morality"]);

/**
 * Look up a starting-bonus cell, or an empty object when none applies.
 * @param {string} choice
 * @returns {object}
 */
export function getStartingBonus(choice) {
  return STARTING_BONUS[choice] ?? {};
}

/**
 * Apply a starting-bonus choice to a wizard state (BUG-2, KEEP-4). Zeroes every
 * bonus field, then materializes the STARTING_BONUS cell for the chosen bonus —
 * so aor/eote duty and obligation grants land in bonus.duty / bonus.obligation,
 * NEVER in bonus[undefined]. Mutates and returns `data`.
 *
 * This mutator lives here (not in wizard-state.js) because the frozen rule-7 closure
 * (plan §0.6.4) forbids wizard-state from importing this module; this module owns the
 * table and imports nothing, so the mutation is self-contained and closure-legal.
 *
 * Note: unlike the legacy reset (which left `morality` untouched across re-selection,
 * risking a stale value), this zeroes morality too, so the result is deterministic
 * regardless of the previously-selected bonus.
 *
 * @param {object} data
 * @param {string|null} choice
 * @returns {object} data
 */
export function applyStartingBonus(data, choice) {
  for (const field of BONUS_FIELDS) {
    data.grants.bonus[field] = 0;
  }
  const validChoice = choice?.startsWith?.(`${data.selected.rules}_`) ? choice : null;
  const cell = getStartingBonus(validChoice);
  for (const [field, value] of Object.entries(cell)) {
    data.grants.bonus[field] = value;
  }
  data.selected.startingBonus = validChoice;
  return data;
}
