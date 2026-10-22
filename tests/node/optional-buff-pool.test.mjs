import test from "node:test";
import assert from "node:assert/strict";

import { DicePoolFFG } from "../../modules/dice/pool.js";
import { applyOfferedBuffs, boostSupply } from "../../modules/dice/optional-buff-pool.js";

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

/* The talent review batch (2026-10-22): Force dice, lowering difficulty, swaps. */

test("Dice Modifiers Add Force adds Force dice", () => {
  assert.equal(applyOfferedBuffs(new DicePoolFFG({ ability: 2 }), offered([row("Dice Modifiers", "Add Force", 2)])).force, 2);
});

test("a negative Add Difficulty removes difficulty dice, then challenge dice", () => {
  const pool = applyOfferedBuffs(new DicePoolFFG({ difficulty: 1, challenge: 1 }), offered([row("Dice Modifiers", "Add Difficulty", -2)]));
  assert.deepEqual({ difficulty: pool.difficulty, challenge: pool.challenge }, { difficulty: 0, challenge: 0 });
});

/** The positive dice a characteristic, rank and upgrades build, as DiceHelpers.rollSkill does. */
const built = (characteristic, rank, upgrades = 0) => {
  const pool = new DicePoolFFG({ ability: Math.max(characteristic, rank), upgrades });
  pool.upgrade(Math.min(characteristic, rank) + upgrades);
  return pool;
};

for (const [c, r, u, c2] of [[1, 2, 0, 2], [4, 2, 2, 2], [3, 2, 0, 1], [2, 2, 0, 4], [0, 2, 0, 3], [2, 0, 1, 3]]) {
  test(`a characteristic swap ${c} to ${c2} at rank ${r} with ${u} upgrades rebuilds the positive dice`, () => {
    const pool = applyOfferedBuffs(built(c, r, u), [], { characteristic: c, rank: r, swapCharacteristic: c2 });
    const want = built(c2, r, u);
    assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: want.ability, proficiency: want.proficiency });
  });
}

test("a skill swap keeps the characteristic and takes the new skill's rank", () => {
  const pool = applyOfferedBuffs(built(3, 1), [], { characteristic: 3, rank: 1, swapRank: 3 });
  assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: 0, proficiency: 3 });
});

test("a swap keeps the player's own extra dice", () => {
  const base = built(1, 2);
  base.ability += 1; // one green added by hand
  const pool = applyOfferedBuffs(base, [], { characteristic: 1, rank: 2, swapCharacteristic: 2 });
  assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: 1, proficiency: 2 });
});

test("a swap with no characteristic or rank known does nothing", () => {
  const pool = applyOfferedBuffs(built(1, 2), [], { characteristic: null, rank: 2, swapCharacteristic: 3 });
  assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: 1, proficiency: 1 });
});

/* Implementation review (2026-10-22). */

/** As DiceHelpers.rollSkill builds a pool, then an item's Upgrade / Downgrade Ability modifiers. */
const builtWithItem = (characteristic, rank, upgrades, modUpgrades, modDowngrades) => {
  const pool = new DicePoolFFG({ ability: Math.max(characteristic, rank), upgrades, modUpgrades, modDowngrades });
  pool.upgrade(Math.min(characteristic, rank) + upgrades);
  pool.upgrade(modUpgrades);
  pool.upgrade(-modDowngrades);
  return pool;
};

for (const [c, r, up, down, c2] of [[1, 2, 1, 0, 2], [3, 2, 0, 1, 1], [2, 2, 2, 0, 3], [1, 1, 1, 1, 3]]) {
  test(`a swap ${c} to ${c2} at rank ${r} keeps ${up} item upgrades and ${down} item downgrades`, () => {
    const pool = applyOfferedBuffs(builtWithItem(c, r, 0, up, down), [], { characteristic: c, rank: r, swapCharacteristic: c2 });
    const want = builtWithItem(c2, r, 0, up, down);
    assert.deepEqual({ ability: pool.ability, proficiency: pool.proficiency }, { ability: want.ability, proficiency: want.proficiency });
  });
}

test("a pool keeps its item upgrades and downgrades through a copy and through JSON", () => {
  const pool = new DicePoolFFG({ ability: 1, modUpgrades: 2, modDowngrades: 1 });
  assert.deepEqual([new DicePoolFFG(pool).modUpgrades, new DicePoolFFG(pool).modDowngrades], [2, 1]);
  const again = new DicePoolFFG(JSON.parse(JSON.stringify(pool)));
  assert.deepEqual([again.modUpgrades, again.modDowngrades], [2, 1]);
});

test("the Boost supply counts the buffs' signed Boost without clamping", () => {
  const base = new DicePoolFFG({ boost: 0 });
  assert.equal(boostSupply(base, offered([row("Roll Modifiers", "Add Boost", -1)])), -1);
  assert.equal(boostSupply(new DicePoolFFG({ boost: 2 }), offered([row("Skill Boost", "Charm", 1)])), 3);
});
