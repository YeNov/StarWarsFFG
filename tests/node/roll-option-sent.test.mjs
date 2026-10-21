import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { DicePoolFFG } from "../../modules/dice/pool.js";
import { layerPool, optionDiceRows } from "../../modules/dice/roll-option-pool.js";
import { packSentLayers, readSentLayers } from "../../modules/dice/roll-option-sent.js";
import { planOptionStates } from "../../modules/helpers/roll-option-costs.js";

/**
 * A pool the GM sends to a player carries its layers apart from the base pool, so the player's
 * dialog applies them in the usual order and can untick them
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "A pool the GM sends to a player").
 */

const gunsBlazing = {
  key: "gb", label: "Guns Blazing", source: "Guns Blazing", ranked: false, rank: 1, hint: null, twoWeapons: "same",
  amount: null, cost: { strain: 2, maneuvers: 0 }, dice: { difficulty: -1 },
};
const counts = (pool) => ({
  ability: pool.ability, proficiency: pool.proficiency, difficulty: pool.difficulty, challenge: pool.challenge,
  boost: pool.boost, setback: pool.setback,
});
/** The base pool as it reaches the player: through the message's flags. */
const sent = (pool) => new DicePoolFFG(JSON.parse(JSON.stringify(pool)));

test("layers round-trip", () => {
  const layers = { defence: 2, adversaryRanks: 1, adversaryMode: false, options: { gb: 1, fa: 3 }, buffs: ["b1"], twoWeapons: "same" };
  assert.deepEqual(readSentLayers({ sentLayers: packSentLayers(layers) }), { v: 1, ...layers });
  assert.deepEqual(readSentLayers({ sentLayers: JSON.parse(JSON.stringify(packSentLayers(layers))) }), { v: 1, ...layers });
});

test("an old message has no layers", () => {
  assert.equal(readSentLayers({ roll: { appliedBuffs: [{ key: "k" }] } }), null);
  assert.equal(readSentLayers(undefined), null);
});

test("the recipient's pool matches the sender's", () => {
  const buffs = [{ rows: [{ modtype: "Roll Modifiers", mod: "Add Boost", value: 1 }] }];
  const cases = [
    { base: { ability: 2, difficulty: 2 }, defence: 1, adversaryRanks: 1, twoWeapons: "same", options: { gb: 1 } },
    { base: { ability: 2, difficulty: 2, setback: -1 }, defence: 2, adversaryRanks: 0, twoWeapons: "no", options: {} },
  ];
  for (const c of cases) {
    const base = new DicePoolFFG(c.base);
    const ticked = Object.keys(c.options).map(() => ({ option: gunsBlazing, amount: 1 }));
    const sender = layerPool(base, {
      buffs, rows: optionDiceRows(ticked, c.twoWeapons), defence: c.defence, adversaryRanks: c.adversaryRanks, adversaryMode: true,
    });

    const layers = readSentLayers({ sentLayers: packSentLayers({
      defence: c.defence, adversaryRanks: c.adversaryRanks, adversaryMode: true, options: c.options, buffs: ["b1"], twoWeapons: c.twoWeapons,
    }) });
    const received = Object.entries(layers.options).map(([, amount]) => ({ option: gunsBlazing, amount }));
    const recipient = layerPool(sent(base), {
      buffs, rows: optionDiceRows(received, layers.twoWeapons),
      defence: layers.defence, adversaryRanks: layers.adversaryRanks, adversaryMode: layers.adversaryMode,
    });
    assert.deepEqual(counts(recipient), counts(sender), JSON.stringify(c));
  }
});

test("a sent option that no longer fits arrives unticked", () => {
  const layers = readSentLayers({ sentLayers: packSentLayers({ options: { gb: 1 }, twoWeapons: "same" }) });
  const states = planOptionStates({
    offered: [gunsBlazing], selection: layers.options, twoWeapons: layers.twoWeapons,
    pool: { unit: "strain", current: 11, threshold: 12 }, canCharge: true,
  });
  assert.deepEqual(states.selection, {});
});

test("bad layers are cleaned", () => {
  const layers = readSentLayers({ sentLayers: {
    v: 1, defence: -3, adversaryRanks: -1, adversaryMode: "yes", options: { a: 2, b: 1.5, c: 0, d: "2" }, buffs: ["k", 3, ""], twoWeapons: "both",
  } });
  assert.deepEqual(layers, { v: 1, defence: 0, adversaryRanks: 0, adversaryMode: true, options: { a: 2 }, buffs: ["k"], twoWeapons: "no" });
});
