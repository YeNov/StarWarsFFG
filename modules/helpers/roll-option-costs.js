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
import { diceWord, LIVE_WORDS, WEAPON_KEYS } from "./roll-options.js";

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
 * @param {boolean} [params.initiative] - the roll is an initiative roll
 * @returns {{items: object[], context: object, pool: object|null, canCharge: boolean}}
 */
export function rollOptionInputs(actor, { skillKey = null, item = null, configuredSkills = null, hasActiveGM = false, initiative = false } = {}) {
  const type = item?.type;
  const context = {
    skillKey: skillKey ?? null,
    skillType: skillTypeOf(actor ?? null, skillKey ?? null, configuredSkills),
    weaponId: type === "weapon" ? (item.id ?? item._id ?? null) : null,
    isAttack: type === "weapon" || type === "shipweapon",
    isForcePower: type === "forcepower",
    isInitiative: initiative === true,
    forceRating: actor ? Number(actor.system?.stats?.forcePool?.max) || 0 : 0,
    // The rank of the skill the roll was opened with; a ticked skill swap does not change it.
    skillRank: actor && skillKey ? Number(actor.system?.skills?.[skillKey]?.rank) || 0 : 0,
  };
  if (!actor) return { items: [], context, pool: null, canCharge: false };
  return {
    items: [...(actor.items ?? [])],
    context,
    pool: readCostPool(actor),
    canCharge: canChargeFor({ hasActiveGM, isOwner: actor.isOwner === true }),
  };
}

/**
 * What the live words stand for right now: the rolling actor's Force rating less its committed
 * Force dice (as the sheet counts them: forcePool.max − forcePool.value), and the Destiny pool's
 * light and dark points. The dialog reads these every time it plans, and again at Roll.
 * @param {object|null} actor
 * @param {{destinyLight?: number, destinyDark?: number}} [destiny] - the world's Destiny pool
 * @returns {{forceAvailable: number, destinyLight: number, destinyDark: number}}
 */
export function liveOptionValues(actor, { destinyLight = 0, destinyDark = 0 } = {}) {
  const whole = (value) => Math.max(0, Math.trunc(Number(value) || 0));
  const force = actor?.system?.stats?.forcePool;
  return {
    forceAvailable: whole((Number(force?.max) || 0) - (Number(force?.value) || 0)),
    destinyLight: whole(destinyLight),
    destinyDark: whole(destinyDark),
  };
}

/**
 * The numbers a ticked swap rolls with: the named characteristic's value, the named skill's rank.
 * Null for a field that is not swapped, or when there is no actor to read.
 * @param {object|null} actor
 * @param {{characteristic?: string|null, skill?: string|null}} swap
 * @returns {{swapCharacteristic: number|null, swapRank: number|null}}
 */
export function swapValues(actor, { characteristic = null, skill = null } = {}) {
  if (!actor) return { swapCharacteristic: null, swapRank: null };
  return {
    swapCharacteristic: characteristic ? Number(actor.system?.characteristics?.[characteristic]?.value) || 0 : null,
    swapRank: skill ? Number(actor.system?.skills?.[skill]?.rank) || 0 : null,
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
 * A dice value or amount max as a number now: "amount" from the picked amount, the live words from
 * `live` (both with their sign). "ranks" and "forceRating" were resolved when the row was offered.
 */
function resolveValue(value, { amount = 1, live = {} } = {}) {
  if (typeof value === "number") return value;
  const word = diceWord(value);
  if (!word) return Number(value) || 0;
  if (word.word === "amount") return word.sign * amount;
  if (LIVE_WORDS.includes(word.word)) return word.sign * (Number(live?.[word.word]) || 0);
  return 0;
}

/** The option's dice plus the chosen branch's, each value a number. */
function resolvedDice(option, branch, amount, live) {
  const dice = {};
  for (const source of [option.dice ?? {}, branch?.dice ?? {}]) {
    for (const [key, value] of Object.entries(source)) dice[key] = (dice[key] ?? 0) + resolveValue(value, { amount, live });
  }
  return dice;
}

/** The option's weapon changes as numbers, every key present; null for an option without `weapon`. */
function resolvedWeapon(option, amount, live) {
  if (!option.weapon) return null;
  return Object.fromEntries(WEAPON_KEYS.map((key) => [key, key in option.weapon ? resolveValue(option.weapon[key], { amount, live }) : 0]));
}

const hasDice = (option, branch, key) => key in (option.dice ?? {}) || key in (branch?.dice ?? {});

/**
 * How many Boost dice a trade takes for an amount a: perAmount * a + fixed, from the option's own
 * removeBoost and the picked branch's together, as resolvedDice adds them.
 */
function tradeDemand(option, branch, live) {
  const fixed = resolvedDice(option, branch, 0, live).removeBoost ?? 0;
  const perAmount = (resolvedDice(option, branch, 1, live).removeBoost ?? 0) - fixed;
  return { fixed, perAmount };
}

/** The smallest of the caps that are finite, or null when there is none. */
function smallestCap(...caps) {
  const finite = caps.filter((cap) => cap !== null && cap !== undefined && Number.isFinite(cap));
  return finite.length > 0 ? Math.min(...finite) : null;
}

/**
 * The state of every offered row for the current selection and Two weapons choice.
 *
 * Talent review batch (2026-10-22): an amount with `max: null` has no cap beyond the payer's strain
 * (and, for a Boost trade, the Boost dice left); live words are read from `live`; a row with a
 * minimum difficulty waits until `difficultyCount` reaches it; only one row adding Force dice may
 * be ticked; swaps of one field must agree; Boost trades share one supply (`boostBase` plus the
 * Boost the other ticked rows add), fitted after every other row; a row with choices uses the
 * picked branch (the first by default), whose dice add to the option's own.
 *
 * @param {object} params
 * @param {object[]} params.offered - from collectOfferedOptions
 * @param {Record<string, number>} params.selection - ticked keys → amount
 * @param {Record<string, string>} [params.choices] - keys → picked branch id
 * @param {"no"|"same"|"different"} params.twoWeapons
 * @param {{unit: string, current: number, threshold: number}|null} params.pool - readCostPool(actor)
 * @param {boolean} params.canCharge
 * @param {{forceAvailable?: number, destinyLight?: number, destinyDark?: number}} [params.live]
 * @param {number} [params.difficultyCount] - difficulty and challenge dice in the pool (no gating when left out)
 * @param {number} [params.boostBase] - Boost dice in the pool before any option (no limit when left out)
 * @param {boolean} [params.swapAvailable] - whether the roll knows the characteristic and rank to swap from
 * @returns {{rows: object[], selection: Record<string, number>, choices: Record<string, string>, strain: number, maneuvers: number, after: number|null}}
 */
export function planOptionStates({
  offered, selection, choices = {}, twoWeapons, pool, canCharge,
  live = {}, difficultyCount = Infinity, boostBase = Infinity, swapAvailable = true,
}) {
  const rows = offered ?? [];
  const reasonFor = (code, data = {}) => ({ code, data });
  const overThreshold = (used, cost) => reasonFor("overThreshold", {
    unit: pool?.unit ?? "strain",
    value: (Number(pool?.current) || 0) + used + cost,
    threshold: Number(pool?.threshold),
  });

  // The picked branch of every row with choices: the one asked for, else the first.
  const picks = {};
  for (const option of rows) {
    if (!Array.isArray(option.choices) || option.choices.length === 0) continue;
    const asked = choices?.[option.key];
    picks[option.key] = option.choices.some((choice) => choice.id === asked) ? asked : option.choices[0].id;
  }
  const branchOf = (option) => (option.key in picks ? option.choices.find((choice) => choice.id === picks[option.key]) : null);
  const maxOf = (option) => (option.amount
    ? (option.amount.max === null || option.amount.max === undefined ? null : resolveValue(option.amount.max, { live }))
    : null);
  const isTrade = (option) => hasDice(option, branchOf(option), "removeBoost");

  // 0. Only offered keys stay selected; an amount is a whole number of 1 or more.
  const wanted = {};
  for (const option of rows) {
    if (!(option.key in (selection ?? {}))) continue;
    const amount = Number(selection[option.key]);
    wanted[option.key] = Number.isInteger(amount) && amount >= 1 ? amount : 1;
  }

  // 1. Reasons that block a row whatever else is ticked.
  const blocked = new Map();
  for (const option of rows) {
    let reason = null;
    const zeroWord = [...Object.values(option.dice ?? {}), ...Object.values(branchOf(option)?.dice ?? {})]
      .map((value) => diceWord(value))
      .find((word) => word && LIVE_WORDS.includes(word.word) && !(Number(live?.[word.word]) > 0));
    const max = maxOf(option);
    if (!twoWeaponsMatches(option.twoWeapons, twoWeapons)) reason = reasonFor("needsTwoWeapons", { choice: option.twoWeapons });
    else if (option.minDifficulty != null && difficultyCount < option.minDifficulty) reason = reasonFor("needsDifficulty", { min: option.minDifficulty });
    else if ((option.characteristic || option.skill) && !swapAvailable) reason = reasonFor("cannotSwap");
    else if (strainKind(option) !== "none" && !pool) reason = reasonFor("cannotPay");
    else if (strainKind(option) !== "none" && !canCharge) reason = reasonFor("needsWriter");
    else if (option.amount && max !== null && !(max >= 1)) reason = reasonFor("zeroMax");
    else if (zeroWord) reason = reasonFor("zeroValue", { word: zeroWord.word });
    if (reason) blocked.set(option.key, reason);
  }

  // 2. Ticked rows in offered order: every other row first, then the Boost trades, so a trade
  //    sees all the Boost the ticked rows add. One Force row; swaps of one field must agree.
  const capacity = capacityOf(pool);
  let used = 0;
  let boostAdded = 0;
  let boostUsed = 0;
  let forceBy = null;
  const swapBy = { characteristic: null, skill: null };
  const kept = new Map(); // key → {amount, cost, dice}

  const conflictOf = (option) => {
    if (hasDice(option, branchOf(option), "force") && forceBy !== null) return reasonFor("forceTaken", { label: forceBy });
    for (const field of ["characteristic", "skill"]) {
      const taken = swapBy[field];
      if (option[field] && taken && taken.value !== option[field]) return reasonFor("swapTaken", { label: taken.label });
    }
    return null;
  };
  const supplyLeft = () => boostBase + boostAdded - boostUsed;

  const fit = (option) => {
    const max = maxOf(option);
    let amount = option.amount ? (max === null ? wanted[option.key] : Math.min(wanted[option.key], max)) : 1;
    const kind = strainKind(option);
    if (kind === "fixed" && Number(option.cost.strain) > capacity - used) return null;
    if (kind === "amount") amount = Math.min(amount, capacity - used);
    if (isTrade(option)) {
      const { fixed, perAmount } = tradeDemand(option, branchOf(option), live);
      const room = supplyLeft() - fixed;
      if (perAmount > 0) amount = Math.min(amount, Math.floor(room / perAmount));
      else if (room < 0) return null;
    }
    if (amount < 1) return null;
    return {
      amount,
      cost: resolvedCost(option, amount),
      dice: resolvedDice(option, branchOf(option), amount, live),
      weapon: resolvedWeapon(option, amount, live),
    };
  };

  for (const trades of [false, true]) {
    for (const option of rows) {
      if (!(option.key in wanted) || blocked.has(option.key) || isTrade(option) !== trades) continue;
      if (conflictOf(option)) continue;
      const fitted = fit(option);
      if (!fitted) continue;
      kept.set(option.key, fitted);
      used += fitted.cost.strain;
      boostAdded += trades ? 0 : (fitted.dice.boost ?? 0);
      boostUsed += trades ? (fitted.dice.removeBoost ?? 0) : 0;
      if (hasDice(option, branchOf(option), "force")) forceBy ??= option.label;
      for (const field of ["characteristic", "skill"]) {
        if (option[field]) swapBy[field] ??= { value: option[field], label: option.label };
      }
    }
  }

  // 3. Every row's state, the unticked ones against what the ticked rows left.
  const states = rows.map((option) => {
    const base = { key: option.key, choice: picks[option.key] ?? null };
    const kind = strainKind(option);
    const trade = isTrade(option);
    const demand = trade ? tradeDemand(option, branchOf(option), live) : { fixed: 0, perAmount: 0 };
    const scales = demand.perAmount > 0;
    const max = maxOf(option);
    const blockedReason = blocked.get(option.key);
    if (blockedReason) {
      return { ...base, ticked: false, amount: 1, maxAmount: null, cost: resolvedCost(option, 1), dice: null, disabled: true, reason: blockedReason };
    }
    const own = kept.get(option.key);
    if (own) {
      const strainCap = kind === "amount" ? capacity - (used - own.cost.strain) : null;
      const boostCap = scales ? Math.floor((supplyLeft() + (own.dice.removeBoost ?? 0) - demand.fixed) / demand.perAmount) : null;
      const maxAmount = option.amount ? smallestCap(max, strainCap, boostCap) : null;
      return { ...base, ticked: true, amount: own.amount, maxAmount, cost: own.cost, dice: own.dice, disabled: false, reason: null };
    }
    const cost = resolvedCost(option, 1);
    const conflict = conflictOf(option);
    if (conflict) return { ...base, ticked: false, amount: 1, maxAmount: null, cost, dice: null, disabled: true, reason: conflict };
    const left = capacity - used;
    if ((kind === "fixed" && cost.strain > left) || (kind === "amount" && left < 1)) {
      return { ...base, ticked: false, amount: 1, maxAmount: null, cost, dice: null, disabled: true, reason: overThreshold(used, cost.strain) };
    }
    const needed = demand.fixed + demand.perAmount;
    if (trade && supplyLeft() < needed) {
      return { ...base, ticked: false, amount: 1, maxAmount: null, cost, dice: null, disabled: true, reason: reasonFor("noBoost") };
    }
    const maxAmount = option.amount
      ? smallestCap(max, kind === "amount" ? left : null, scales ? Math.floor((supplyLeft() - demand.fixed) / demand.perAmount) : null)
      : null;
    return { ...base, ticked: false, amount: 1, maxAmount, cost, dice: null, disabled: false, reason: null };
  });

  const finalSelection = {};
  let maneuvers = 0;
  for (const [key, { amount, cost }] of kept) {
    finalSelection[key] = amount;
    maneuvers += cost.maneuvers;
  }
  return {
    // The weapon numbers belong to ticked rows only, like their dice.
    rows: states.map((state) => ({ ...state, weapon: state.ticked ? kept.get(state.key)?.weapon ?? null : null })),
    selection: finalSelection,
    choices: picks,
    strain: used,
    maneuvers,
    after: pool ? (Number(pool.current) || 0) + used : null,
  };
}
