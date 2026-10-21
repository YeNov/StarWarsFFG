/**
 * What the roll dialog needs to show its option rows: the inputs it reads off the rolling actor,
 * which rows can be ticked, what each costs once its amount is known, and how much the payer can
 * still take (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Costs and what can
 * be ticked").
 *
 * The payer pool is defensive-talents.js's: strain for characters and nemeses, wounds for rivals,
 * none for minions and vehicles. Its remaining capacity is the threshold, minus the current value,
 * minus the strain of the options already ticked; it is unlimited when the threshold is unknown,
 * as wouldIncapacitate treats it. Reaching the threshold is allowed; going over is not.
 *
 * A row's strain cost is fixed (a number), follows the amount the player picks ("amount"), or is
 * zero. Only a strain cost is limited by the payer: a free option, or one whose maneuvers follow
 * the amount, keeps its whole amount range.
 *
 * Free of Foundry globals, so Node covers it (tests/node/roll-option-costs.test.mjs).
 */
import { readCostPool } from "./defensive-talents.js";
import { skillTypeOf } from "./roll-options-offer.js";

/**
 * Whether a charge for this actor can reach a writer: the active GM, or an owner who is rolling.
 * The GM bridge's coordinator applies the same rule (actor-apply-coordinator.js, `apply`).
 * @param {{hasActiveGM: boolean, isOwner: boolean}} who
 * @returns {boolean}
 */
export function canChargeFor({ hasActiveGM, isOwner }) {
  return Boolean(hasActiveGM) || Boolean(isOwner);
}

/**
 * Everything the dialog reads off the rolling actor, safe for a roll with no actor.
 * @param {object|null} actor
 * @param {object} params
 * @param {string|null} [params.skillKey]
 * @param {object|null} [params.item] - the item rolled with
 * @param {object|null} [params.configuredSkills] - e.g. CONFIG.FFG.skills
 * @param {boolean} [params.hasActiveGM]
 * @returns {{items: object[], context: object, pool: object|null, canCharge: boolean}}
 */
export function rollOptionInputs(actor, { skillKey = null, item = null, configuredSkills = null, hasActiveGM = false } = {}) {
  const type = item?.type;
  const context = {
    skillKey: skillKey ?? null,
    skillType: skillTypeOf(actor ?? null, skillKey ?? null, configuredSkills),
    weaponId: type === "weapon" ? (item.id ?? item._id ?? null) : null,
    isAttack: type === "weapon" || type === "shipweapon",
    isForcePower: type === "forcepower",
    forceRating: actor ? Number(actor.system?.stats?.forcePool?.max) || 0 : 0,
  };
  if (!actor) return { items: [], context, pool: null, canCharge: false };
  return {
    items: [...(actor.items ?? [])],
    context,
    pool: readCostPool(actor),
    canCharge: canChargeFor({ hasActiveGM, isOwner: actor.isOwner === true }),
  };
}

const strainKind = (option) => {
  const strain = option.cost?.strain;
  if (strain === "amount") return "amount";
  return Number(strain) > 0 ? "fixed" : "none";
};

const twoWeaponsMatches = (needed, choice) => {
  if (!needed) return true;
  if (needed === "any") return choice !== "no";
  return needed === choice;
};

/** The row's cost once its amount is known. */
function resolvedCost(option, amount) {
  const kind = strainKind(option);
  const strain = kind === "amount" ? amount : kind === "fixed" ? Number(option.cost.strain) : 0;
  const maneuvers = option.cost?.maneuvers === "amount" ? amount : Number(option.cost?.maneuvers) || 0;
  return { strain, maneuvers };
}

/** How much the payer can take before going over its threshold; unlimited when it is unknown. */
function capacityOf(pool) {
  if (!pool) return 0;
  const threshold = Number(pool.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return Infinity;
  return threshold - (Number(pool.current) || 0);
}

/**
 * The state of every offered row for the current selection and Two weapons choice.
 * @param {object} params
 * @param {object[]} params.offered - from collectOfferedOptions
 * @param {Record<string, number>} params.selection - ticked keys → amount
 * @param {"no"|"same"|"different"} params.twoWeapons
 * @param {{unit: string, current: number, threshold: number}|null} params.pool - readCostPool(actor)
 * @param {boolean} params.canCharge
 * @returns {{rows: object[], selection: Record<string, number>, strain: number, maneuvers: number, after: number|null}}
 */
export function planOptionStates({ offered, selection, twoWeapons, pool, canCharge }) {
  const rows = offered ?? [];
  const reasonFor = (code, data = {}) => ({ code, data });
  const overThreshold = (used, cost) => reasonFor("overThreshold", {
    unit: pool?.unit ?? "strain",
    value: (Number(pool?.current) || 0) + used + cost,
    threshold: Number(pool?.threshold),
  });

  // 0. Only offered keys stay selected; an amount is a whole number of 1 or more.
  const wanted = {};
  for (const option of rows) {
    if (!(option.key in (selection ?? {}))) continue;
    const amount = Number(selection[option.key]);
    wanted[option.key] = Number.isInteger(amount) && amount >= 1 ? amount : 1;
  }

  // 1–3. Reasons that block a row whatever the payer can take.
  const blocked = new Map();
  for (const option of rows) {
    let reason = null;
    if (!twoWeaponsMatches(option.twoWeapons, twoWeapons)) reason = reasonFor("needsTwoWeapons", { choice: option.twoWeapons });
    else if (strainKind(option) !== "none" && !pool) reason = reasonFor("cannotPay");
    else if (strainKind(option) !== "none" && !canCharge) reason = reasonFor("needsWriter");
    else if (option.amount && !(Number(option.amount.max) >= 1)) reason = reasonFor("zeroMax");
    if (reason) blocked.set(option.key, reason);
  }

  // 4. Ticked rows, in offered order, against the capacity left so far.
  const capacity = capacityOf(pool);
  let used = 0;
  const kept = new Map(); // key → {amount, cost}
  for (const option of rows) {
    if (!(option.key in wanted) || blocked.has(option.key)) continue;
    const max = option.amount ? Number(option.amount.max) : null;
    let amount = option.amount ? Math.min(wanted[option.key], max) : 1;
    const kind = strainKind(option);
    if (kind === "fixed" && Number(option.cost.strain) > capacity - used) continue;
    if (kind === "amount") {
      amount = Math.min(amount, capacity - used);
      if (amount < 1) continue;
    }
    const cost = resolvedCost(option, amount);
    used += cost.strain;
    kept.set(option.key, { amount, cost });
  }

  // 5. Every row's state, the unticked ones against the capacity left after all ticked rows.
  const states = rows.map((option) => {
    const max = option.amount ? Number(option.amount.max) : null;
    const blockedReason = blocked.get(option.key);
    if (blockedReason) {
      return { key: option.key, ticked: false, amount: 1, maxAmount: null, cost: resolvedCost(option, 1), disabled: true, reason: blockedReason };
    }
    const kind = strainKind(option);
    const own = kept.get(option.key);
    if (own) {
      const others = used - own.cost.strain;
      const maxAmount = max === null ? null : kind === "amount" ? Math.min(max, capacity - others) : max;
      return { key: option.key, ticked: true, amount: own.amount, maxAmount, cost: own.cost, disabled: false, reason: null };
    }
    const left = capacity - used;
    const cost = resolvedCost(option, 1);
    if ((kind === "fixed" && cost.strain > left) || (kind === "amount" && left < 1)) {
      return { key: option.key, ticked: false, amount: 1, maxAmount: null, cost, disabled: true, reason: overThreshold(used, cost.strain) };
    }
    const maxAmount = max === null ? null : kind === "amount" ? Math.min(max, left) : max;
    return { key: option.key, ticked: false, amount: 1, maxAmount, cost, disabled: false, reason: null };
  });

  const finalSelection = {};
  let maneuvers = 0;
  for (const [key, { amount, cost }] of kept) {
    finalSelection[key] = amount;
    maneuvers += cost.maneuvers;
  }
  return {
    rows: states,
    selection: finalSelection,
    strain: used,
    maneuvers,
    after: pool ? (Number(pool.current) || 0) + used : null,
  };
}
