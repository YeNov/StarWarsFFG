/**
 * The single starting-bonus table (KEEP-4) — the one source of truth for what each
 * `rules × choice` starting bonus grants.
 *
 * Covered (plan §0.6.2). Imports nothing.
 *
 * Transcribed exactly from CharacterCreator.selectStartingBonus (character-creator.js:865-908)
 * and the calcObligation branches (:1554-1600). Each cell is the set of NON-ZERO
 * `grants.bonus` deltas for that choice; the wizard-state mutator zeroes the bonus
 * fields first and then applies the cell, and calculators.calcObligation reads the
 * SAME cell for its morality/obligation/duty adjustment — so the two can never drift
 * (the KEEP-4 coupling the legacy code duplicated).
 *
 * BUG-2: the aor/eote duty/obligation grants land in `bonus.duty` / `bonus.obligation`
 * here — the legacy code routed them to `bonus[undefined]` by reading a nonexistent
 * `grants.rules` field. The table makes the target explicit and correct.
 *
 * Q-2 (preserved quirk, flagged at Stage 22): `2k_credits` grants 2500, not 2000.
 */

export const STARTING_BONUS = Object.freeze({
  fad: Object.freeze({
    "10xp": Object.freeze({ xp: 10 }),
    "2k_credits": Object.freeze({ credits: 2500 }), // Q-2
    "5xp": Object.freeze({ xp: 5, credits: 1000 }),
    "21_plus_morality": Object.freeze({ morality: 21 }),
    "21_minus_morality": Object.freeze({ morality: -21 }),
  }),
  eote: Object.freeze({
    "5xp": Object.freeze({ xp: 5, obligation: 5 }),
    "10xp": Object.freeze({ xp: 10, obligation: 10 }),
    "1k_credits": Object.freeze({ credits: 1000, obligation: 5 }),
    "2k_credits": Object.freeze({ credits: 2500, obligation: 10 }), // Q-2
  }),
  aor: Object.freeze({
    "5xp": Object.freeze({ xp: 5, duty: 5 }),
    "10xp": Object.freeze({ xp: 10, duty: 10 }),
    "1k_credits": Object.freeze({ credits: 1000, duty: 5 }),
    "2k_credits": Object.freeze({ credits: 2500, duty: 10 }), // Q-2
  }),
});

/** The bonus fields the starting-bonus mutator zeroes before applying a cell. */
export const BONUS_FIELDS = Object.freeze(["xp", "credits", "duty", "obligation", "conflict", "morality"]);

/**
 * Look up a starting-bonus cell, or an empty object when none applies.
 * @param {string} rules
 * @param {string} choice
 * @returns {object}
 */
export function getStartingBonus(rules, choice) {
  return STARTING_BONUS[rules]?.[choice] ?? {};
}

/**
 * Apply a starting-bonus choice to a wizard state (BUG-2, KEEP-4). Zeroes every
 * bonus field, then materializes the STARTING_BONUS cell for the current ruleset —
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
  const cell = getStartingBonus(data.selected.rules, choice);
  for (const [field, value] of Object.entries(cell)) {
    data.grants.bonus[field] = value;
  }
  data.selected.startingBonus = choice;
  return data;
}
