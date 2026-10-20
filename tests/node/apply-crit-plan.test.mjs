import test from "node:test";
import assert from "node:assert/strict";

import {
  critFormula,
  critResultItemUuid,
  pickCritResult,
  planCritSeed,
  talentRanks,
  visibilityOf,
} from "../../modules/helpers/apply-crit-plan.js";

/**
 * The Apply Crit decisions: what the dialog opens with, the formula it rolls, which table row
 * the total lands on, which item that row adds, and who sees the result.
 *
 * The dialog, the table draw and the chat messages stay in `ApplyCrit.show()`
 * (modules/helpers/apply-crit.js), which needs Foundry.
 */

/** A roll formula's total for a fixed d100, so the arithmetic can be checked by hand. */
const totalFor = (formula, d100) => {
  const expression = formula.replace("1d100", String(d100));
  assert.match(expression, /^[\d\s+\-max(),]+$/, `unexpected formula: ${formula}`);
  return new Function("max", `return ${expression};`)(Math.max);
};

const row = (lo, hi, extra = {}) => ({ range: [lo, hi], drawn: false, ...extra });

// ---------------------------------------------------------------------------
// Talent ranks
// ---------------------------------------------------------------------------

test("a ranked talent's ranks come from the prepared talent list", () => {
  const actor = { talentList: [{ name: "Grit", rank: 3 }, { name: "Lethal Blows", rank: 2 }] };

  assert.equal(talentRanks(actor, "Lethal Blows"), 2);
});

test("talent names match whatever their case", () => {
  assert.equal(talentRanks({ talentList: [{ name: "lethal blows", rank: 1 }] }, "Lethal Blows"), 1);
});

test("an unranked talent counts as one rank", () => {
  assert.equal(talentRanks({ talentList: [{ name: "Durable", rank: "N/A" }] }, "Durable"), 1);
});

test("without a prepared talent list, the ranks of matching talent items add up", () => {
  const actor = {
    items: [
      { type: "talent", name: "Durable", system: { ranks: { ranked: true, current: 2 } } },
      { type: "talent", name: "Durable", system: { ranks: { ranked: true, current: 1 } } },
      { type: "weapon", name: "Durable", system: {} },
    ],
  };

  assert.equal(talentRanks(actor, "Durable"), 3);
});

test("an actor without the talent has no ranks", () => {
  assert.equal(talentRanks({ talentList: [{ name: "Grit", rank: 2 }] }, "Durable"), 0);
  assert.equal(talentRanks(null, "Durable"), 0);
});

// ---------------------------------------------------------------------------
// The dialog's starting values
// ---------------------------------------------------------------------------

const viciousRifle = [{ name: "Vicious Quality", totalRanks: 2 }, { name: "Pierce", totalRanks: 1 }];

test("the attacker's Lethal Blows ranks are added to a crit on a character", () => {
  const seed = planCritSeed({
    attacker: { talentList: [{ name: "Lethal Blows", rank: 2 }] },
    target: { type: "character", items: [], talentList: [] },
    qualities: [],
  });

  assert.equal(seed.lethalRanks, 2);
});

test("Lethal Blows does not apply to a vehicle's critical hit", () => {
  const seed = planCritSeed({
    attacker: { talentList: [{ name: "Lethal Blows", rank: 2 }] },
    target: { type: "vehicle", items: [] },
    qualities: [],
  });

  assert.equal(seed.lethalRanks, 0);
});

test("the seed counts the target's crits and Durable and the weapon's Vicious", () => {
  const target = {
    type: "rival",
    items: [{ type: "criticalinjury" }, { type: "criticalinjury" }, { type: "talent" }],
    talentList: [{ name: "Durable", rank: 1 }],
  };

  const seed = planCritSeed({ attacker: null, target, qualities: viciousRifle });

  assert.deepEqual(seed, { existingCrits: 2, durableRanks: 1, viciousRanks: 2, lethalRanks: 0 });
});

// ---------------------------------------------------------------------------
// The formula
// ---------------------------------------------------------------------------

test("each rank of Vicious and Lethal Blows adds ten, Durable takes ten away", () => {
  const formula = critFormula({ modifier: 20, durableRanks: 1, viciousRanks: 2, lethalRanks: 1 });

  // 50 + 20 - 10 + 20 + 10
  assert.equal(totalFor(formula, 50), 90);
});

test("the crit total never drops below one", () => {
  const formula = critFormula({ modifier: 0, durableRanks: 3, viciousRanks: 0, lethalRanks: 0 });

  assert.equal(totalFor(formula, 5), 1);
});

// ---------------------------------------------------------------------------
// Which row the total lands on
// ---------------------------------------------------------------------------

const table = [row(1, 5, { name: "Minor Nick" }), row(6, 150, { name: "Middle" }), row(151, 200, { name: "Dead" })];

test("a total inside a row's range lands on that row", () => {
  assert.equal(pickCritResult(table, 120).name, "Middle");
});

test("a total above every row lands on the top row instead of being rerolled", () => {
  assert.equal(pickCritResult(table, 230).name, "Dead");
});

test("a total below every row lands on the bottom row", () => {
  assert.equal(pickCritResult([row(10, 50, { name: "Bottom" }), row(51, 100, { name: "Top" })], 3).name, "Bottom");
});

test("rows already drawn are passed over", () => {
  const drawnTop = [row(1, 150, { name: "Lower" }), row(151, 200, { name: "Top", drawn: true })];

  assert.equal(pickCritResult(drawnTop, 120).name, "Lower");
  assert.equal(pickCritResult(drawnTop, 180).name, "Lower");
});

test("a total in a gap between rows lands nowhere", () => {
  assert.equal(pickCritResult([row(1, 10), row(20, 30)], 15), null);
});

test("a table with no rows left lands nowhere", () => {
  assert.equal(pickCritResult([], 50), null);
});

// ---------------------------------------------------------------------------
// The item a row adds
// ---------------------------------------------------------------------------

test("a row linked to a compendium item adds that item", () => {
  const result = { type: "document", documentUuid: "Compendium.world.crits.Item.abc123" };

  assert.equal(critResultItemUuid(result), "Compendium.world.crits.Item.abc123");
});

test("a row linked to a world item adds that item", () => {
  assert.equal(critResultItemUuid({ type: "document", documentUuid: "Item.abc123" }), "Item.abc123");
});

test("a text row adds no item", () => {
  assert.equal(critResultItemUuid({ type: "text", description: "Bruised" }), null);
});

// ---------------------------------------------------------------------------
// Who sees the result
// ---------------------------------------------------------------------------

test("a crit from a public attack is public", () => {
  assert.deepEqual(visibilityOf({ whisper: [], blind: false }), { messageMode: "public", whisper: [], blind: false });
});

test("a crit from a whispered attack is whispered to the same users", () => {
  assert.deepEqual(visibilityOf({ whisper: ["gm1", "player2"], blind: false }), {
    messageMode: "gm", whisper: ["gm1", "player2"], blind: false,
  });
});

test("the attacker still sees a crit from their own GM-only attack", () => {
  const attack = { whisper: ["gm1"], blind: false, author: { id: "player2" } };

  assert.deepEqual(visibilityOf(attack), { messageMode: "gm", whisper: ["gm1", "player2"], blind: false });
});

test("a crit from a blind attack stays blind", () => {
  assert.deepEqual(visibilityOf({ whisper: ["gm1"], blind: true }), { messageMode: "blind", whisper: ["gm1"], blind: true });
});
