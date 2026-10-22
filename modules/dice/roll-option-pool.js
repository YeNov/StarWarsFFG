/**
 * What Two weapons and ticked roll options do to the roll dialog's pool, and the whole order the
 * dialog layers its pool in (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "What a ticked option does to the pool").
 *
 * Options become ordinary optional-buff rows, so one pass of applyOfferedBuffs applies the ticked
 * buffs, Two weapons and the ticked options together: counts first (so Two weapons' die and Guns
 * Blazing's -1 cancel exactly), then ability upgrades, then difficulty upgrades. Target defence and
 * the Adversary upgrade go on last, as RollBuilderFFG#_effectivePool always did. Living here, the
 * order is the same for the dialog and for the player who rolls a pool the GM sent.
 *
 * Imports only pool code, so Node covers it (tests/node/roll-option-pool.test.mjs).
 */
import { applyOfferedBuffs } from "./optional-buff-pool.js";

/** Each `dice` key as the optional-buff row it stands for (removeBoost is a negative Add Boost). */
const DICE_ROWS = Object.freeze({
  boost: ["Roll Modifiers", "Add Boost"],
  setback: ["Roll Modifiers", "Add Setback"],
  removeSetback: ["Roll Modifiers", "Remove Setback"],
  difficulty: ["Dice Modifiers", "Add Difficulty"],
  upgradeAbility: ["Dice Modifiers", "Upgrade Ability"],
  downgradeAbility: ["Dice Modifiers", "Downgrade Ability"],
  upgradeDifficulty: ["Dice Modifiers", "Upgrade Difficulty"],
  downgradeDifficulty: ["Dice Modifiers", "Downgrade Difficulty"],
  success: ["Result Modifiers", "Add Success"],
  advantage: ["Result Modifiers", "Add Advantage"],
  triumph: ["Result Modifiers", "Add Triumph"],
  threat: ["Result Modifiers", "Add Threat"],
  failure: ["Result Modifiers", "Add Failure"],
  despair: ["Result Modifiers", "Add Despair"],
  force: ["Dice Modifiers", "Add Force"],
  removeBoost: ["Roll Modifiers", "Add Boost"],
});

/** Difficulty dice a two-weapon attack adds (spec, "Two weapons"). */
const TWO_WEAPONS_DIFFICULTY = Object.freeze({ no: 0, same: 1, different: 2 });

/**
 * The rows Two weapons and the ticked options add. The planner has already resolved every value
 * (planOptionStates, a ticked row's `dice`); a difficulty row keeps its option's floor, so the
 * reduction stops there (applyOfferedBuffs).
 * @param {Array<{dice: Record<string, number>, floor?: number|null}>} applied - the ticked rows
 * @param {"no"|"same"|"different"} twoWeapons
 * @returns {Array<{modtype: string, mod: string, value: number, floor?: number}>}
 */
export function optionDiceRows(applied, twoWeapons) {
  const rows = [];
  const extra = TWO_WEAPONS_DIFFICULTY[twoWeapons] ?? 0;
  if (extra > 0) rows.push({ modtype: "Dice Modifiers", mod: "Add Difficulty", value: extra });
  for (const { dice, floor = null } of applied ?? []) {
    for (const [key, raw] of Object.entries(dice ?? {})) {
      const target = DICE_ROWS[key];
      if (!target) continue;
      const value = (Number(raw) || 0) * (key === "removeBoost" ? -1 : 1);
      if (value === 0) continue;
      const row = { modtype: target[0], mod: target[1], value };
      if (key === "difficulty" && Number.isInteger(floor)) row.floor = floor;
      rows.push(row);
    }
  }
  return rows;
}

/**
 * The pool to show and roll: a new pool, `base` left as it is.
 * @param {import("./pool.js").DicePoolFFG} base - the player's pool, with their manual edits
 * @param {object} [layers]
 * @param {Array<{rows: object[]}>} [layers.buffs] - ticked optional buffs
 * @param {object[]} [layers.rows] - from optionDiceRows
 * @param {{characteristic?: number|null, rank?: number|null, swapCharacteristic?: number|null, swapRank?: number|null}} [layers.skill]
 *   - for Skill Rank buffs and a ticked characteristic or skill swap
 * @param {number} [layers.defence] - setback dice from the target's defence
 * @param {number} [layers.adversaryRanks]
 * @param {boolean} [layers.adversaryMode] - false when the player chose the base pool
 * @returns {import("./pool.js").DicePoolFFG}
 */
export function layerPool(base, { buffs = [], rows = [], skill = {}, defence = 0, adversaryRanks = 0, adversaryMode = true } = {}) {
  const groups = rows.length > 0 ? [...buffs, { rows }] : buffs;
  const pool = applyOfferedBuffs(base, groups, skill);
  // A negative setback is the player's "ignore N defence": it cancels defence, then floors at zero.
  pool.setback = Math.max(0, pool.setback + (Number(defence) || 0));
  if (adversaryMode && adversaryRanks > 0 && pool.difficulty > 0) pool.upgradeDifficulty(adversaryRanks);
  return pool;
}
