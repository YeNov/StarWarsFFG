/**
 * What ticked optional buffs do to a dice pool: the same as the same rows would as ordinary
 * modifiers (docs/superpowers/specs/2026-10-20-optional-buffs-design.md). The order follows the
 * ordinary path: DiceHelpers.rollSkill builds the positive dice from rank and characteristic,
 * then ModifierHelpers.getDicePoolModifiers adds counts and upgrades.
 *
 * Imports only pool.js, so Node covers it (tests/node/optional-buff-pool.test.mjs).
 */
import { DicePoolFFG } from "./pool.js";

/** Rows that add to one count of the pool, keyed `modtype|mod`, or `modtype|*` for any skill. */
const COUNT_FIELDS = {
  "Skill Boost|*": "boost",
  "Skill Setback|*": "setback",
  "Skill Remove Setback|*": "remsetback",
  "Skill Add Success|*": "success",
  "Skill Add Advantage|*": "advantage",
  "Skill Add Triumph|*": "triumph",
  "Skill Add Light|*": "light",
  "Skill Add Failure|*": "failure",
  "Skill Add Threat|*": "threat",
  "Skill Add Despair|*": "despair",
  "Skill Add Dark|*": "dark",
  "Roll Modifiers|Add Boost": "boost",
  "Roll Modifiers|Add Setback": "setback",
  "Roll Modifiers|Remove Setback": "remsetback",
  "Result Modifiers|Add Success": "success",
  "Result Modifiers|Add Advantage": "advantage",
  "Result Modifiers|Add Triumph": "triumph",
  "Result Modifiers|Add Light": "light",
  "Result Modifiers|Add Failure": "failure",
  "Result Modifiers|Add Threat": "threat",
  "Result Modifiers|Add Despair": "despair",
  "Result Modifiers|Add Dark": "dark",
  "Dice Modifiers|Add Difficulty": "difficulty",
  "Dice Modifiers|Add Force": "force",
};

const isDifficultyRow = (row) => row.modtype === "Dice Modifiers" && row.mod === "Add Difficulty";

/**
 * Take `times` difficulty dice off the pool: difficulty (purple) first, then challenge (red),
 * never below `floor` dice of the two together.
 */
function removeDifficulty(pool, times, floor = 0) {
  for (let i = 0; i < times; i++) {
    if (pool.difficulty + pool.challenge <= floor) return;
    if (pool.difficulty > 0) pool.difficulty--;
    else if (pool.challenge > 0) pool.challenge--;
    else return;
  }
}

const COUNTS = [
  "proficiency", "ability", "challenge", "difficulty", "boost", "setback", "remsetback", "force",
  "advantage", "success", "threat", "failure", "light", "dark", "triumph", "despair",
];

const countFieldOf = (row) => COUNT_FIELDS[`${row.modtype}|${row.mod}`] ?? COUNT_FIELDS[`${row.modtype}|*`];

/** The positive dice `DiceHelpers.rollSkill` builds for a characteristic, rank and upgrades. */
function positiveDice(characteristic, rank, upgrades) {
  const pool = new DicePoolFFG({ ability: Math.max(characteristic, rank) });
  pool.upgrade(Math.min(characteristic, rank) + upgrades);
  return pool;
}

/**
 * A copy of `pool` with every row of `buffs` applied.
 * @param {DicePoolFFG} pool - left unchanged
 * @param {Array<{rows: Array<{modtype: string, mod: string, value: number, floor?: number}>}>} buffs
 * @param {object} [skill]
 * @param {number|null} [skill.characteristic] - the rolled characteristic's value
 * @param {number|null} [skill.rank] - the skill's rank before any buff
 * @param {number|null} [skill.swapCharacteristic] - a ticked characteristic swap: the new value
 * @param {number|null} [skill.swapRank] - a ticked skill swap: the new skill's rank
 * @returns {DicePoolFFG}
 */
export function applyOfferedBuffs(pool, buffs, { characteristic = null, rank = null, swapCharacteristic = null, swapRank = null } = {}) {
  const result = new DicePoolFFG(pool);
  const rows = (buffs ?? []).flatMap((buff) => buff?.rows ?? []);
  const sum = (match) => rows.filter(match).reduce((total, row) => total + (Number(row.value) || 0), 0);

  // 1. Skill Rank and swaps: rebuild the positive dice for the new characteristic and rank, and
  //    keep the difference, so the player's own extra dice stay as they are.
  const extraRank = sum((row) => row.modtype === "Skill Rank");
  const swapped = swapCharacteristic !== null || swapRank !== null;
  if ((extraRank !== 0 || swapped) && characteristic !== null && rank !== null) {
    const upgrades = Number(pool.upgrades) || 0;
    const before = positiveDice(characteristic, rank, upgrades);
    const after = positiveDice(swapCharacteristic ?? characteristic, (swapRank ?? rank) + extraRank, upgrades);
    result.ability += after.ability - before.ability;
    result.proficiency += after.proficiency - before.proficiency;
  }

  // 2. Counts. A negative Add Difficulty is set aside for step 2b.
  const reductions = [];
  for (const row of rows) {
    const value = Number(row.value) || 0;
    if (isDifficultyRow(row) && value < 0) {
      reductions.push({ times: -value, floor: Number.isInteger(row.floor) ? row.floor : null });
      continue;
    }
    const field = countFieldOf(row);
    if (field) result[field] += value;
  }

  // 2b. Lowering difficulty, after every die is added (so Guns Blazing still cancels Two weapons'
  //     die exactly): difficulty dice first, then challenge dice; a reduction with a floor ("to a
  //     minimum of Easy") stops there, and those go first.
  for (const { times, floor } of reductions.filter((r) => r.floor !== null)) removeDifficulty(result, times, floor);
  for (const { times } of reductions.filter((r) => r.floor === null)) removeDifficulty(result, times);

  // 3. Ability upgrades, then 4. difficulty upgrades.
  result.upgrade(sum((row) => row.modtype === "Skill Add Upgrade" || (row.modtype === "Dice Modifiers" && row.mod === "Upgrade Ability")));
  result.upgrade(-sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Downgrade Ability"));
  result.upgradeDifficulty(sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Upgrade Difficulty"));
  result.upgradeDifficulty(-sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Downgrade Difficulty"));

  // 5. No count below zero, unless the player had already set it below zero by hand (a
  //    negative setback is the dialog's "ignore N defence"): a tick must not undo that.
  for (const field of COUNTS) {
    const floor = Math.min(0, Number(pool[field]) || 0);
    result[field] = Math.max(floor, result[field]);
  }
  return result;
}
