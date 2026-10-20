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
};

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
 * @param {Array<{rows: Array<{modtype: string, mod: string, value: number}>}>} buffs
 * @param {object} [skill]
 * @param {number|null} [skill.characteristic] - the rolled characteristic's value
 * @param {number|null} [skill.rank] - the skill's rank before any buff
 * @returns {DicePoolFFG}
 */
export function applyOfferedBuffs(pool, buffs, { characteristic = null, rank = null } = {}) {
  const result = new DicePoolFFG(pool);
  const rows = (buffs ?? []).flatMap((buff) => buff?.rows ?? []);
  const sum = (match) => rows.filter(match).reduce((total, row) => total + (Number(row.value) || 0), 0);

  // 1. Skill Rank: rebuild the positive dice for the higher rank, and keep the difference.
  const extraRank = sum((row) => row.modtype === "Skill Rank");
  if (extraRank !== 0 && characteristic !== null && rank !== null) {
    const upgrades = Number(pool.upgrades) || 0;
    const before = positiveDice(characteristic, rank, upgrades);
    const after = positiveDice(characteristic, rank + extraRank, upgrades);
    result.ability += after.ability - before.ability;
    result.proficiency += after.proficiency - before.proficiency;
  }

  // 2. Counts.
  for (const row of rows) {
    const field = countFieldOf(row);
    if (field) result[field] += Number(row.value) || 0;
  }

  // 3. Ability upgrades, then 4. difficulty upgrades.
  result.upgrade(sum((row) => row.modtype === "Skill Add Upgrade" || (row.modtype === "Dice Modifiers" && row.mod === "Upgrade Ability")));
  result.upgrade(-sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Downgrade Ability"));
  result.upgradeDifficulty(sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Upgrade Difficulty"));
  result.upgradeDifficulty(-sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Downgrade Difficulty"));

  // 5. No count below zero.
  for (const field of COUNTS) result[field] = Math.max(0, result[field]);
  return result;
}
