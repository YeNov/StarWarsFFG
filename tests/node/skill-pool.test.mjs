import test from "node:test";
import assert from "node:assert/strict";

import { DicePoolFFG } from "../../modules/dice/pool.js";
import { skillDicePool } from "../../modules/dice/skill-pool.js";

/**
 * The dice a skill rolls, as get_dice_pool builds them for crew rolls and modules such as Token
 * Action HUD. They must match DiceHelpers.rollSkill's, which applies the skill's upgrades (talents
 * such as a Skill Add Upgrade); get_dice_pool used to record them without applying them.
 */

/** What DiceHelpers.rollSkill builds: ability = max, then upgrade(min + the skill's upgrades). */
const sheetRoll = (characteristic, rank, upgrades) => {
  const pool = new DicePoolFFG({ ability: Math.max(characteristic, rank), upgrades });
  pool.upgrade(Math.min(characteristic, rank) + upgrades);
  return pool;
};
const dice = (pool) => ({ ability: pool.ability, proficiency: pool.proficiency });

for (const [c, r, u] of [[3, 1, 1], [1, 1, 2], [2, 3, 0], [4, 2, 3], [0, 2, 1], [2, 0, 1]]) {
  test(`characteristic ${c}, rank ${r}, ${u} skill upgrades: the same dice as a sheet roll`, () => {
    const pool = skillDicePool({ characteristic: c, rank: r, skill: { upgrades: u } });
    assert.deepEqual(dice(pool), dice(sheetRoll(c, r, u)));
    assert.equal(pool.upgrades, u, "the upgrades stay recorded for a swap or a Skill Rank buff");
  });
}

test("the incoming pool's other dice, the skill's extras and its difficulty upgrades are kept", () => {
  const incoming = new DicePoolFFG({ difficulty: 2, boost: 1, setback: 1, challenge: 1 });
  const skill = { upgrades: 1, boost: 1, setback: 1, advantage: 1, difficulty: 1, upgradeDifficulty: 1, remsetback: 1 };
  const pool = skillDicePool({ characteristic: 3, rank: 2, skill, incoming });
  assert.deepEqual(dice(pool), { ability: 0, proficiency: 3 });
  assert.deepEqual(
    { boost: pool.boost, setback: pool.setback, advantage: pool.advantage, remsetback: pool.remsetback, difficulty: pool.difficulty, challenge: pool.challenge },
    { boost: 2, setback: 2, advantage: 1, remsetback: 1, difficulty: 2, challenge: 2 },
  );
});

test("without skill upgrades the dice are what they always were", () => {
  const incoming = new DicePoolFFG({ ability: 1, proficiency: 1 });
  const pool = skillDicePool({ characteristic: 3, rank: 1, skill: {}, incoming });
  assert.deepEqual(dice(pool), { ability: 2, proficiency: 2 }, "max + incoming ability, less min + incoming proficiency");
});

test("get_dice_pool builds its dice with skillDicePool", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("../../modules/helpers/dice-helpers.js", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export function get_dice_pool("), source.indexOf("function resolveDicePoolActor("));
  assert.ok(body.includes("return skillDicePool({ characteristic: characteristicValue, rank: skillRank, skill, incoming: incomingPool });"));
});
