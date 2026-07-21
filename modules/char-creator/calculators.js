/**
 * Pure XP / credit / obligation calculators for the PC Wizard.
 *
 * Ported verbatim from CharacterCreator.calcXp (character-creator.js:1529-1552),
 * calcCredits (:1633-1645) and calcObligation (:1554-1600). Each takes the wizard
 * `data` state and returns plain numbers — no `this`, no documents, no async.
 *
 * Covered (plan §0.6.2). At Stage 7 this module gains a single Covered→Covered
 * import of starting-bonus.js (allowed by the rule-7 closure); until that file
 * exists, calcObligation keeps the inline per-choice branches (the KEEP-4 seam).
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
  const total = (data.selected.species?.snapshot?.system?.startingXP || 0) + data.grants.bonus.xp;
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
  const total = data.grants.gm.credits + data.grants.bonus.credits;
  let available = total;
  for (const purchase of data.purchases.credits) {
    available -= purchase.cost;
  }

  return { total, available };
}

/**
 * Starting and adjusted morality / obligation / duty, plus the field key.
 *
 * The `key` is "morality" (fad), "obligation" (eote) or "duty" (aor). The starting
 * value comes from initial.*; the starting-bonus choice then shifts `available`.
 *
 * KEEP-4 seam: at Stage 5 the per-choice adjustments are still the inline branches
 * transcribed from calcObligation:1563-1593. Stage 7 imports starting-bonus.js and
 * replaces the inline branch bodies with a read from the STARTING_BONUS table so it
 * is the single source of truth — the branches below mark exactly where that lands.
 *
 * @param {object} data  wizard state
 * @returns {{starting: number, available: number, key: (string|undefined)}}
 */
export function calcObligation(data) {
  let starting = 0;
  let available = 0;
  let key;

  const rules = data.selected.rules;
  const choice = data.selected.startingBonus;

  if (rules === "fad") {
    starting = data.initial.morality;
    available = starting;
    key = "morality";
    if (choice === "21_plus_morality") {
      available += 21;
    } else if (choice === "21_minus_morality") {
      available -= 21;
    }
  } else if (rules === "eote") {
    starting = data.initial.obligation;
    available = starting;
    key = "obligation";
    if (choice === "5xp") {
      available += 5;
    } else if (choice === "10xp") {
      available += 10;
    } else if (choice === "1k_credits") {
      available += 5;
    } else if (choice === "2k_credits") {
      available += 10;
    }
  } else if (rules === "aor") {
    starting = data.initial.duty;
    available = starting;
    key = "duty";
    if (choice === "5xp") {
      available -= 5;
    } else if (choice === "10xp") {
      available -= 10;
    } else if (choice === "1k_credits") {
      available -= 5;
    } else if (choice === "2k_credits") {
      available -= 10;
    }
  }

  return { starting, available, key };
}
