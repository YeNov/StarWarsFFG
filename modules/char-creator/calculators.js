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
    const quantity = Math.max(1, Math.trunc(Number(purchase.quantity) || 1));
    available -= purchase.cost * quantity;
  }

  return { total, available };
}

export function obligationKeyForRules(rules) {
  return { fad: "morality", aor: "duty", eote: "obligation" }[rules];
}

/**
 * Starting and adjusted morality / obligation / duty for the selected ruleset.
 *
 * @param {object} data  wizard state
 * @returns {{starting: number, available: number, key: (string|undefined)}}
 */
export function calcObligation(data) {
  const key = obligationKeyForRules(data.selected.rules);
  if (!key) return { starting: 0, available: 0, key: undefined };

  const starting = Number(data.initial?.[key]) || 0;
  const bonus = Number(data.grants?.bonus?.[key]) || 0;
  const available = key === "duty" ? starting - bonus : starting + bonus;
  return { starting, available, key };
}
