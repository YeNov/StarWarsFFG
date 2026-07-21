/**
 * Pure XP / credit / obligation calculators for the PC Wizard.
 *
 * Ported verbatim from CharacterCreator.calcXp (character-creator.js:1529-1552),
 * calcCredits (:1633-1645) and calcObligation (:1554-1600). Each takes the wizard
 * `data` state and returns plain numbers — no `this`, no documents, no async.
 *
 * Covered (plan §0.6.2). Imports starting-bonus.js (Covered→Covered, allowed by the
 * rule-7 closure) so calcObligation reads its adjustment from the one table.
 */

import { getStartingBonus } from "./starting-bonus.js";

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
 * KEEP-4 (closed at Stage 7): the per-choice adjustment is read from the one
 * STARTING_BONUS table, the same cell the grants.bonus display uses, so the two can
 * never drift. The ruleset supplies the sign convention transcribed from the legacy
 * calcObligation branches (:1554-1600): morality and obligation ADD their bonus,
 * duty SUBTRACTS it — matching the original numbers exactly.
 *
 * @param {object} data  wizard state
 * @returns {{starting: number, available: number, key: (string|undefined)}}
 */
export function calcObligation(data) {
  let starting = 0;
  let available = 0;
  let key;

  const rules = data.selected.rules;
  const bonus = getStartingBonus(rules, data.selected.startingBonus);

  if (rules === "fad") {
    starting = data.initial.morality;
    key = "morality";
    available = starting + (bonus.morality ?? 0);
  } else if (rules === "eote") {
    starting = data.initial.obligation;
    key = "obligation";
    available = starting + (bonus.obligation ?? 0);
  } else if (rules === "aor") {
    starting = data.initial.duty;
    key = "duty";
    available = starting - (bonus.duty ?? 0);
  }

  return { starting, available, key };
}
