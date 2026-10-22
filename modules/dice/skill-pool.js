/**
 * The dice a skill rolls for a characteristic and rank, on top of a pool the caller already has:
 * the arithmetic of get_dice_pool (helpers/dice-helpers.js), which crew rolls and modules such as
 * Token Action HUD build their pools with.
 *
 * The skill's upgrades (talents such as a Skill Add Upgrade) are applied to the dice, as
 * DiceHelpers.rollSkill does for a roll from the sheet, and stay recorded in `upgrades` for a swap
 * or a Skill Rank buff to rebuild from.
 *
 * Imports only pool.js, so Node covers it (tests/node/skill-pool.test.mjs).
 */
import { DicePoolFFG } from "./pool.js";

/**
 * @param {object} params
 * @param {number} params.characteristic - the characteristic's value
 * @param {number} params.rank - the skill's rank (for a minion group, its group rank)
 * @param {object} [params.skill] - the actor's skill data: boost, setback, upgrades, difficulty…
 * @param {DicePoolFFG|object} [params.incoming] - the pool the caller started from
 * @returns {DicePoolFFG}
 */
export function skillDicePool({ characteristic, rank, skill = {}, incoming = {} }) {
  const from = incoming instanceof DicePoolFFG ? incoming : new DicePoolFFG(incoming ?? {});
  const high = Math.max(characteristic, rank);
  const low = Math.min(characteristic, rank);
  const pool = new DicePoolFFG({
    ability: high + from.ability - (low + from.proficiency),
    proficiency: low + from.proficiency,
    boost: (skill.boost ?? 0) + from.boost,
    setback: (skill.setback ?? 0) + from.setback,
    force: (skill.force ?? 0) + from.force,
    advantage: (skill.advantage ?? 0) + from.advantage,
    dark: (skill.dark ?? 0) + from.dark,
    light: (skill.light ?? 0) + from.light,
    failure: (skill.failure ?? 0) + from.failure,
    threat: (skill.threat ?? 0) + from.threat,
    success: (skill.success ?? 0) + from.success,
    triumph: (skill.triumph ?? 0) + from.triumph,
    despair: (skill.despair ?? 0) + from.despair,
    upgrades: (skill.upgrades ?? 0) + from.upgrades,
    modUpgrades: from.modUpgrades,
    modDowngrades: from.modDowngrades,
    remsetback: (skill.remsetback ?? 0) + from.remsetback,
    difficulty: +from.difficulty + (skill.difficulty ?? 0),
    challenge: +from.challenge,
  });
  // The skill's own upgrades, as rollSkill applies them; the incoming pool's are already in its dice.
  pool.upgrade(Number(skill.upgrades) || 0);
  pool.upgradeDifficulty(skill.upgradeDifficulty ?? 0);
  return pool;
}
