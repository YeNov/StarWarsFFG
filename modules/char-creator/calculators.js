/**
 * Pure XP / credit / obligation calculators for the PC Wizard.
 *
 * Ported verbatim from CharacterCreator.calcXp (character-creator.js:1529-1552),
 * calcCredits (:1633-1645) and calcObligation (:1554-1600). Each takes the wizard
 * `data` state and returns plain numbers — no `this`, no documents, no async.
 *
 * Covered (plan §0.6.2).
 */

/**
 * Total and remaining XP.
 *
 * total = species starting XP + the bonus XP grant; available = total minus every
 * XP purchase across characteristics / skills / talents / specializations / force
 * powers. The species starting XP comes from the selected species SelectionRef's
 * snapshot (the new state stores snapshots, never live Documents).
 *
 * @param {object} data  wizard state
 * @returns {{total: number, available: number}}
 */
export function calcXp(data) {
  const total = (data.selected.species?.snapshot?.system?.startingXP || 0) + data.grants.bonus.xp + (data.grants.extra?.xp ?? 0);
  let available = total;
  for (const purchase of data.purchases.xp.characteristics) {
    available -= purchase.cost;
  }
  for (const purchase of data.purchases.xp.skills) {
    available -= purchase.cost;
  }
  for (const purchase of data.purchases.xp.talents) {
    available -= purchase.cost;
  }
  for (const purchase of data.purchases.xp.specializations) {
    available -= purchase.cost;
  }
  for (const purchase of data.purchases.xp.forcePowers) {
    available -= purchase.cost;
  }

  return { total, available };
}

/**
 * Total and remaining credits.
 *
 * total = the GM credit grant + the bonus credit grant; available = total minus
 * every credit-purchased item's cost.
 *
 * @param {object} data  wizard state
 * @returns {{total: number, available: number}}
 */
export function calcCredits(data) {
  const total = data.grants.gm.credits + data.grants.bonus.credits + (data.grants.extra?.credits ?? 0);
  let available = total;
  for (const purchase of data.purchases.credits) {
    available -= purchase.cost;
  }

  return { total, available };
}

/**
 * Starting and adjusted morality / obligation / duty.
 *
 * The cross-ruleset wizard keeps all three tracks visible and independent. Starting
 * bonus application writes field-specific deltas into grants.bonus; this calculator
 * simply combines those deltas with the configured starting values.
 *
 * @param {object} data  wizard state
 * @returns {{obligation: object, duty: object, morality: object}}
 */
export function calcObligation(data) {
  const obligation = Number(data.initial?.obligation) || 0;
  const duty = Number(data.initial?.duty) || 0;
  const morality = Number(data.initial?.morality) || 0;
  return {
    obligation: { starting: obligation, available: obligation + (Number(data.grants?.bonus?.obligation) || 0), key: "obligation" },
    duty: { starting: duty, available: duty - (Number(data.grants?.bonus?.duty) || 0), key: "duty" },
    morality: { starting: morality, available: morality + (Number(data.grants?.bonus?.morality) || 0), key: "morality" },
  };
}
