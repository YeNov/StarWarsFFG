import test from "node:test";
import assert from "node:assert/strict";

import { DicePoolFFG } from "../../modules/dice/pool.js";
import { applyOfferedBuffs } from "../../modules/dice/optional-buff-pool.js";

/**
 * What ticked optional buffs do to the roll dialog's pool: the same as the same rows would as
 * ordinary modifiers (docs/superpowers/specs/2026-10-20-optional-buffs-design.md, "What a ticked
 * row does to the pool").
 */

const offered = (rows) => [{ key: "k", name: "B", source: "S", rows }];
const row = (modtype, mod, value) => ({ modtype, mod, value });

for (const [r, field, want] of [
  [row("Skill Boost", "Charm", 2), "boost", 2],
  [row("Skill Remove Setback", "Charm", 1), "remsetback", 1],
  [row("Skill Add Advantage", "Charm", 1), "advantage", 1],
  [row("Roll Modifiers", "Add Setback", 1), "setback", 1],
  [row("Result Modifiers", "Add Triumph", 1), "triumph", 1],
  [row("Dice Modifiers", "Add Difficulty", 1), "difficulty", 3],
]) {
  test(`${r.modtype} ${r.mod} adds to ${field}`, () => {
    assert.equal(applyOfferedBuffs(new DicePoolFFG({ ability: 2, difficulty: 2 }), offered([r]))[field], want);
  });
}

test("Skill Add Upgrade upgrades an ability die", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2 }), offered([row("Skill Add Upgrade", "Charm", 1)]));

  assert.deepEqual([p.ability, p.proficiency], [1, 1]);
});

test("Upgrade Difficulty upgrades a difficulty die", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ difficulty: 2 }), offered([row("Dice Modifiers", "Upgrade Difficulty", 1)]));

  assert.deepEqual([p.difficulty, p.challenge], [1, 1]);
});

test("a rank below the characteristic turns an ability die into proficiency", () => {
  // characteristic 3, rank 1: 2 ability + 1 proficiency; rank 2: 1 ability + 2 proficiency
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2, proficiency: 1, boost: 1 }),
    offered([row("Skill Rank", "Charm", 1)]), { characteristic: 3, rank: 1 });

  assert.deepEqual([p.ability, p.proficiency, p.boost], [1, 2, 1]);
});

test("a rank at the characteristic adds an ability die", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ proficiency: 2 }),
    offered([row("Skill Rank", "Charm", 1)]), { characteristic: 2, rank: 2 });

  assert.deepEqual([p.ability, p.proficiency], [1, 2]);
});

test("Skill Rank does nothing when the characteristic is unknown", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2 }), offered([row("Skill Rank", "Charm", 1)]));

  assert.deepEqual([p.ability, p.proficiency], [2, 0]);
});

test("downgrades never leave a negative count", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 1, difficulty: 1 }),
    offered([row("Dice Modifiers", "Downgrade Ability", 5), row("Dice Modifiers", "Downgrade Difficulty", 5)]));

  for (const f of ["ability", "proficiency", "difficulty", "challenge"]) assert.ok(p[f] >= 0, f);
});

test("a negative count the player entered by hand survives a tick", () => {
  // A negative setback is the dialog's "ignore N defence"; a negative threat cancels one.
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2, setback: -1, threat: -1 }),
    offered([row("Result Modifiers", "Add Advantage", 1)]));

  assert.deepEqual([p.setback, p.threat, p.advantage], [-1, -1, 1]);
});

test("the pool given is left as it was", () => {
  const base = new DicePoolFFG({ ability: 2 });

  applyOfferedBuffs(base, offered([row("Skill Boost", "Charm", 1), row("Skill Add Upgrade", "Charm", 1)]));

  assert.deepEqual([base.ability, base.proficiency, base.boost], [2, 0, 0]);
});
