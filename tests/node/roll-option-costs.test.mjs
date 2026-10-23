import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { canChargeFor, liveOptionValues, planOptionStates, rollOptionInputs, swapValues } from "../../modules/helpers/roll-option-costs.js";

/**
 * Which option rows can be ticked, what each costs once its amount is known, and how much the
 * payer can still take (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Costs and
 * what can be ticked").
 */

const option = (key, { strain = 0, maneuvers = 0, amount = null, twoWeapons = null } = {}) => ({
  key, label: key, source: key, ranked: false, rank: 1, hint: null, twoWeapons,
  amount: amount === null ? null : { max: amount, label: null },
  cost: { strain, maneuvers }, dice: {},
});
const strainPool = (current, threshold, unit = "strain") =>
  ({ path: `system.stats.${unit}.value`, unit, current, threshold });
const plan = ({ offered, selection = {}, twoWeapons = "no", pool = strainPool(0, 12), canCharge = true }) =>
  planOptionStates({ offered, selection, twoWeapons, pool, canCharge });
const row = (result, key) => result.rows.find((r) => r.key === key);

const gunsBlazing = option("gb", { strain: 2 });
const intenseFocus = option("if", { strain: 1, maneuvers: 1 });
const frenzied = option("fa", { strain: "amount", amount: 5 });

test("exactly at the threshold is allowed, over is not", () => {
  const result = plan({ offered: [gunsBlazing, intenseFocus], selection: { gb: 1 }, pool: strainPool(10, 12) });
  assert.equal(row(result, "gb").ticked, true);
  assert.equal(result.after, 12);
  assert.equal(row(result, "if").disabled, true);
  assert.deepEqual(row(result, "if").reason, { code: "overThreshold", data: { unit: "strain", value: 13, threshold: 12 } });
});

test("strain-per-amount is capped to the remaining capacity", () => {
  const result = plan({ offered: [frenzied], selection: { fa: 5 }, pool: strainPool(9, 12) });
  const fa = row(result, "fa");
  assert.deepEqual({ ticked: fa.ticked, amount: fa.amount, maxAmount: fa.maxAmount, strain: fa.cost.strain }, { ticked: true, amount: 3, maxAmount: 3, strain: 3 });
  assert.deepEqual(result.selection, { fa: 3 });
});

test("a strain-per-amount option with no remaining capacity greys out", () => {
  const fa = row(plan({ offered: [frenzied], pool: strainPool(12, 12) }), "fa");
  assert.equal(fa.disabled, true);
  assert.equal(fa.reason.code, "overThreshold");
});

test("a free amount option keeps its full range at the threshold", () => {
  const sniper = option("ss", { maneuvers: 1, amount: 2 });
  const unticked = row(plan({ offered: [sniper], pool: strainPool(12, 12) }), "ss");
  assert.deepEqual({ disabled: unticked.disabled, maxAmount: unticked.maxAmount }, { disabled: false, maxAmount: 2 });
  const ticked = plan({ offered: [sniper], selection: { ss: 2 }, pool: strainPool(12, 12) });
  assert.equal(row(ticked, "ss").amount, 2);
  assert.deepEqual(ticked.selection, { ss: 2 });
});

test("a fixed-cost amount option keeps its full range", () => {
  const fixed = option("fx", { strain: 1, amount: 3 });
  const unticked = row(plan({ offered: [fixed], pool: strainPool(11, 12) }), "fx");
  assert.deepEqual({ disabled: unticked.disabled, maxAmount: unticked.maxAmount }, { disabled: false, maxAmount: 3 });
  const ticked = row(plan({ offered: [fixed], selection: { fx: 3 }, pool: strainPool(11, 12) }), "fx");
  assert.deepEqual({ ticked: ticked.ticked, amount: ticked.amount, strain: ticked.cost.strain }, { ticked: true, amount: 3, strain: 1 });
  const full = row(plan({ offered: [fixed], pool: strainPool(12, 12) }), "fx");
  assert.equal(full.reason.code, "overThreshold");
});

test("a maneuver cost per amount resolves with the amount and charges no strain", () => {
  const steady = option("st", { maneuvers: "amount", amount: 3 });
  const result = plan({ offered: [steady], selection: { st: 3 }, pool: null });
  assert.equal(row(result, "st").ticked, true);
  assert.deepEqual(row(result, "st").cost, { strain: 0, maneuvers: 3 });
  assert.deepEqual({ maneuvers: result.maneuvers, strain: result.strain }, { maneuvers: 3, strain: 0 });
});

test("a roll with no actor gives empty, safe inputs", () => {
  const inputs = rollOptionInputs(null, { skillKey: "Melee", item: null, configuredSkills: { Melee: { type: "Combat" } }, hasActiveGM: true });
  assert.deepEqual(inputs.items, []);
  assert.equal(inputs.pool, null);
  assert.equal(inputs.canCharge, false);
  assert.equal(inputs.context.forceRating, 0);
  assert.equal(inputs.context.skillType, "Combat");
  assert.deepEqual(planOptionStates({ offered: [], selection: {}, twoWeapons: "no", pool: null, canCharge: false }).rows, []);
});

test("inputs read the actor", () => {
  const actor = {
    type: "character", isOwner: true, items: [{ id: "i1" }],
    system: { stats: { strain: { value: 3, max: 12 }, forcePool: { max: 2 } }, skills: { Melee: { type: "Combat" } } },
  };
  const weapon = { id: "w1", type: "weapon" };
  const inputs = rollOptionInputs(actor, { skillKey: "Melee", item: weapon, configuredSkills: null, hasActiveGM: false });
  assert.equal(inputs.context.forceRating, 2);
  assert.equal(inputs.pool.current, 3);
  assert.equal(inputs.canCharge, true);
  assert.deepEqual(inputs.items, [{ id: "i1" }]);
  assert.deepEqual(
    { weaponId: inputs.context.weaponId, isAttack: inputs.context.isAttack, isForcePower: inputs.context.isForcePower, skillType: inputs.context.skillType },
    { weaponId: "w1", isAttack: true, isForcePower: false, skillType: "Combat" },
  );
  assert.equal(rollOptionInputs(actor, { item: { type: "shipweapon" } }).context.weaponId, null);
  assert.equal(rollOptionInputs(actor, { item: { type: "shipweapon" } }).context.isAttack, true);
});

test("a zero maximum greys the option", () => {
  const result = plan({ offered: [option("z", { amount: 0 }), option("ok", { amount: 2 })] });
  assert.equal(row(result, "z").disabled, true);
  assert.equal(row(result, "z").reason.code, "zeroMax");
  for (const r of result.rows) {
    if (!r.disabled && r.maxAmount !== null) assert.ok(Number.isInteger(r.maxAmount) && r.maxAmount >= 1, r.key);
  }
});

test("minions and vehicles cannot pay strain but keep free options", () => {
  const pointBlank = option("pb");
  const result = plan({ offered: [gunsBlazing, pointBlank], selection: { gb: 1, pb: 1 }, pool: null });
  assert.equal(row(result, "gb").reason.code, "cannotPay");
  assert.equal(row(result, "gb").ticked, false);
  assert.equal(row(result, "pb").disabled, false);
  assert.equal(row(result, "pb").ticked, true);
  assert.deepEqual(result.selection, { pb: 1 });
});

test("rivals are measured in wounds", () => {
  const result = plan({ offered: [option("x", { strain: 3 })], pool: strainPool(8, 10, "wounds") });
  assert.equal(row(result, "x").reason.data.unit, "wounds");
});

test("without a writer, costed options grey out", () => {
  const result = plan({ offered: [gunsBlazing, option("pb")], canCharge: false });
  assert.equal(row(result, "gb").reason.code, "needsWriter");
  assert.equal(row(result, "pb").disabled, false);
});

test("dependencies follow the Two weapons choice and untick", () => {
  const gb = option("gb", { strain: 2, twoWeapons: "same" });
  for (const choice of ["no", "different"]) {
    const result = plan({ offered: [gb], selection: { gb: 1 }, twoWeapons: choice });
    assert.equal(row(result, "gb").ticked, false, choice);
    assert.deepEqual(row(result, "gb").reason, { code: "needsTwoWeapons", data: { choice: "same" } }, choice);
  }
  const same = plan({ offered: [gb], selection: { gb: 1 }, twoWeapons: "same" });
  assert.equal(row(same, "gb").ticked, true);

  const any = option("any", { twoWeapons: "any" });
  assert.equal(row(plan({ offered: [any], twoWeapons: "no" }), "any").disabled, true);
  assert.equal(row(plan({ offered: [any], twoWeapons: "different" }), "any").disabled, false);
});

test("ticked rows are fitted in order", () => {
  const result = plan({ offered: [gunsBlazing, intenseFocus], selection: { gb: 1, if: 1 }, pool: strainPool(10, 12) });
  assert.equal(row(result, "gb").ticked, true);
  assert.equal(row(result, "if").ticked, false);
  assert.equal(row(result, "if").reason.code, "overThreshold");
  assert.deepEqual(result.selection, { gb: 1 });
  assert.deepEqual({ strain: result.strain, maneuvers: result.maneuvers }, { strain: 2, maneuvers: 0 });
});

test("an unknown threshold never refuses", () => {
  const result = plan({ offered: [gunsBlazing, intenseFocus, frenzied], selection: { gb: 1, if: 1, fa: 5 }, pool: strainPool(40, 0) });
  assert.ok(result.rows.every((r) => !r.disabled && r.ticked));
  assert.equal(row(result, "fa").amount, 5);
});

test("a selection key that is not offered is dropped", () => {
  assert.deepEqual(plan({ offered: [gunsBlazing], selection: { gone: 1 } }).selection, {});
});

test("canChargeFor", () => {
  assert.equal(canChargeFor({ hasActiveGM: true, isOwner: true }), true);
  assert.equal(canChargeFor({ hasActiveGM: true, isOwner: false }), true);
  assert.equal(canChargeFor({ hasActiveGM: false, isOwner: true }), true);
  assert.equal(canChargeFor({ hasActiveGM: false, isOwner: false }), false);
});

/* The talent review batch (2026-10-22): uncapped amounts, live words, the Daunting condition, one
 * Force row per check, swaps, a shared Boost supply for trades, and either/or choices. */

const opt = (key, { strain = 0, maneuvers = 0, max, dice = {}, choices = null, minDifficulty = null, characteristic = null, skill = null } = {}) => ({
  key, label: key, source: key, ranked: false, rank: 1, hint: null, twoWeapons: null, minDifficulty,
  amount: max === undefined ? null : { max, label: null },
  cost: { strain, maneuvers }, dice, difficultyFloor: null, characteristic, skill, choices,
});
const plan2 = ({ offered, selection = {}, choices = {}, pool = strainPool(0, 12), live = {}, difficultyCount, boostBase, swapAvailable }) =>
  planOptionStates({ offered, selection, choices, twoWeapons: "no", pool, canCharge: true, live, difficultyCount, boostBase, swapAvailable });

test("an uncapped amount is limited only by strain room", () => {
  const strainy = opt("s", { strain: "amount", max: null });
  const r1 = plan2({ offered: [strainy], selection: { s: 7 } });
  assert.deepEqual([row(r1, "s").amount, row(r1, "s").maxAmount], [7, 12]);
  const free = opt("f", { max: null, dice: { success: "amount" } });
  const r2 = plan2({ offered: [free], selection: { f: 9 } });
  assert.deepEqual([row(r2, "f").amount, row(r2, "f").maxAmount], [9, null]);
  const fixed = opt("x", { strain: 2, max: null, dice: { boost: "amount" } });
  const r3 = plan2({ offered: [fixed], selection: { x: 5 }, pool: strainPool(9, 12) });
  assert.deepEqual([row(r3, "x").ticked, row(r3, "x").amount, row(r3, "x").cost.strain], [true, 5, 2]);
});

test("live words resolve from the values of the moment", () => {
  const live = { forceAvailable: 2, destinyLight: 3, destinyDark: 1 };
  const r = plan2({ offered: [opt("a", { dice: { force: "forceAvailable", success: "destinyLight", threat: "destinyDark" } })], selection: { a: 1 }, live });
  assert.deepEqual(row(r, "a").dice, { force: 2, success: 3, threat: 1 });
  const lower = plan2({ offered: [opt("b", { max: "destinyLight", dice: { difficulty: "-amount" } })], selection: { b: 2 }, live });
  assert.deepEqual([row(lower, "b").dice, row(lower, "b").maxAmount], [{ difficulty: -2 }, 3]);
});

test("a live word worth nothing greys the row", () => {
  const offered = [opt("f", { dice: { force: "forceAvailable" } }), opt("d", { max: "destinyDark", dice: { success: "amount" } })];
  const r = plan2({ offered, selection: { f: 1, d: 1 }, live: { forceAvailable: 0, destinyDark: 0 } });
  assert.deepEqual(row(r, "f").reason, { code: "zeroValue", data: { word: "forceAvailable" } });
  assert.equal(row(r, "d").reason.code, "zeroMax");
  assert.deepEqual(r.selection, {});
});

test("an option with a minimum difficulty waits until the check is that hard", () => {
  const odds = opt("odds", { minDifficulty: 4, dice: { boost: 1 } });
  assert.deepEqual(row(plan2({ offered: [odds], selection: { odds: 1 }, difficultyCount: 3 }), "odds").reason, { code: "needsDifficulty", data: { min: 4 } });
  assert.equal(row(plan2({ offered: [odds], selection: { odds: 1 }, difficultyCount: 4 }), "odds").ticked, true);
  assert.equal(row(plan2({ offered: [odds], selection: { odds: 1 } }), "odds").ticked, true, "no count given: not gated");
});

test("only one Force row per check", () => {
  const a = opt("a", { dice: { force: "forceAvailable" } });
  const b = opt("b", { dice: { force: "forceAvailable" } });
  const live = { forceAvailable: 3 };
  const both = plan2({ offered: [a, b], selection: { a: 1, b: 1 }, live });
  assert.deepEqual([row(both, "a").ticked, row(both, "b").ticked], [true, false]);
  assert.deepEqual(row(both, "b").reason, { code: "forceTaken", data: { label: "a" } });
  const none = plan2({ offered: [a, b], live });
  assert.deepEqual([row(none, "a").disabled, row(none, "b").disabled], [false, false]);
});

test("swaps: the same swap applies once, a different one on the same field is refused", () => {
  const offered = [opt("a", { characteristic: "Willpower" }), opt("b", { characteristic: "Willpower" }), opt("c", { characteristic: "Cunning" }), opt("d", { skill: "Athletics" })];
  const r = plan2({ offered, selection: { a: 1, b: 1, c: 1, d: 1 } });
  assert.deepEqual(["a", "b", "c", "d"].map((k) => row(r, k).ticked), [true, true, false, true]);
  assert.deepEqual(row(r, "c").reason, { code: "swapTaken", data: { label: "a" } });
  assert.deepEqual(row(plan2({ offered, selection: { a: 1 }, swapAvailable: false }), "a").reason, { code: "cannotSwap", data: {} });
});

const trade = (key, extra = {}) => opt(key, { max: null, dice: { removeBoost: "amount", success: "amount" }, ...extra });

test("Boost trades share one supply of Boost dice", () => {
  const two = plan2({ offered: [trade("t1"), trade("t2")], selection: { t1: 2, t2: 2 }, boostBase: 2 });
  assert.deepEqual([row(two, "t1").amount, row(two, "t2").ticked], [2, false]);
  assert.deepEqual(row(two, "t2").reason, { code: "noBoost", data: {} });
  const three = plan2({ offered: [trade("t1"), trade("t2")], selection: { t1: 2, t2: 2 }, boostBase: 3 });
  assert.deepEqual([row(three, "t1").amount, row(three, "t2").amount], [2, 1]);
  assert.deepEqual([row(three, "t1").maxAmount, row(three, "t2").maxAmount], [2, 1]);
  assert.deepEqual(row(three, "t1").dice, { removeBoost: 2, success: 2 });
});

test("options that add Boost feed the trades", () => {
  const adder = opt("add", { dice: { boost: 2 } });
  assert.equal(row(plan2({ offered: [trade("t"), adder], selection: { t: 2, add: 1 }, boostBase: 0 }), "t").amount, 2);
  assert.equal(row(plan2({ offered: [trade("t"), adder], selection: { t: 2 }, boostBase: 0 }), "t").reason.code, "noBoost");
});

test("a trade is also capped by strain and by its own max", () => {
  const assassinate = trade("as", { strain: "amount", dice: { removeBoost: "amount", advantage: "amount" } });
  const r = plan2({ offered: [assassinate], selection: { as: 5 }, boostBase: 5, pool: strainPool(10, 12) });
  assert.deepEqual([row(r, "as").amount, row(r, "as").cost.strain, row(r, "as").maxAmount], [2, 2, 2]);
  const clanker = trade("ck", { max: 1 });
  assert.equal(row(plan2({ offered: [clanker], selection: { ck: 3 }, boostBase: 3 }), "ck").amount, 1);
});

test("a fixed-cost trade needs only its fixed strain", () => {
  const trigger = trade("td", { strain: 2, dice: { removeBoost: "amount", advantage: "amount" } });
  assert.equal(row(plan2({ offered: [trigger], selection: { td: 1 }, boostBase: 3, pool: strainPool(11, 12) }), "td").reason.code, "overThreshold");
  const r = plan2({ offered: [trigger], selection: { td: 3 }, boostBase: 3 });
  assert.deepEqual([row(r, "td").amount, row(r, "td").cost.strain], [3, 2]);
});

test("choices: the first is the default, the pick is kept, and its dice add to the option's", () => {
  const branches = [{ id: "su", label: "Success", dice: { success: "amount" } }, { id: "ad", label: "Advantage", dice: { advantage: "amount" } }];
  const ck = opt("ck", { max: null, dice: { removeBoost: "amount" }, choices: branches });
  const first = plan2({ offered: [ck], selection: { ck: 1 }, boostBase: 2 });
  assert.deepEqual([row(first, "ck").choice, row(first, "ck").dice, first.choices], ["su", { removeBoost: 1, success: 1 }, { ck: "su" }]);
  const picked = plan2({ offered: [ck], selection: { ck: 2 }, choices: { ck: "ad" }, boostBase: 2 });
  assert.deepEqual(row(picked, "ck").dice, { removeBoost: 2, advantage: 2 });
  assert.equal(plan2({ offered: [ck], selection: { ck: 1 }, choices: { ck: "zz" }, boostBase: 2 }).choices.ck, "su");
  assert.deepEqual(plan2({ offered: [ck], choices: { ck: "ad" }, boostBase: 2 }).choices, { ck: "ad" }, "an unticked row keeps its pick");
});

test("ticked rows carry their resolved dice, unticked rows none", () => {
  const r = plan2({ offered: [opt("a", { dice: { boost: 1 } }), opt("b", { dice: { boost: 1 } })], selection: { a: 1 } });
  assert.deepEqual([row(r, "a").dice, row(r, "b").dice], [{ boost: 1 }, null]);
});

test("live values: Force rating less committed dice, and the Destiny pool", () => {
  const actor = { system: { stats: { forcePool: { max: 3, value: 1 } } } };
  assert.deepEqual(liveOptionValues(actor, { destinyLight: 2, destinyDark: 4 }), { forceAvailable: 2, destinyLight: 2, destinyDark: 4 });
  assert.equal(liveOptionValues({ system: { stats: { forcePool: { max: 1, value: 3 } } } }, {}).forceAvailable, 0);
  assert.deepEqual(liveOptionValues(null, { destinyLight: "2" }), { forceAvailable: 0, destinyLight: 2, destinyDark: 0 });
});

test("swap values read the actor's characteristic and skill", () => {
  const actor = { system: { characteristics: { Cunning: { value: 4 } }, skills: { Survival: { rank: 2 } } } };
  assert.deepEqual(swapValues(actor, { characteristic: "Cunning", skill: "Survival" }), { swapCharacteristic: 4, swapRank: 2 });
  assert.deepEqual(swapValues(actor, { characteristic: "Presence", skill: "Lore" }), { swapCharacteristic: 0, swapRank: 0 });
  assert.deepEqual(swapValues(actor, {}), { swapCharacteristic: null, swapRank: null });
  assert.deepEqual(swapValues(null, { characteristic: "Cunning" }), { swapCharacteristic: null, swapRank: null });
});

/* Implementation review (2026-10-22). */

test("a negative Boost supply is not lifted by the options' Boost", () => {
  const adder = opt("add", { dice: { boost: 1 } });
  const r = plan2({ offered: [adder, trade("t", { strain: 1 })], selection: { add: 1, t: 1 }, boostBase: -1 });
  assert.equal(row(r, "t").ticked, false);
  assert.equal(row(r, "t").reason.code, "noBoost");
  assert.equal(r.strain, 0);
});

test("a trade's Boost demand adds the option's own and the branch's", () => {
  const branches = [
    { id: "su", label: "Success", dice: { removeBoost: "amount", success: "amount" } },
    { id: "ad", label: "Advantage", dice: { removeBoost: "amount", advantage: "amount" } },
  ];
  const both = opt("b", { max: null, dice: { removeBoost: 1 }, choices: branches });
  const r = plan2({ offered: [both], selection: { b: 2 }, boostBase: 2 });
  assert.deepEqual([row(r, "b").amount, row(r, "b").maxAmount, row(r, "b").dice], [1, 1, { removeBoost: 2, success: 1 }]);
  assert.equal(row(plan2({ offered: [both], selection: { b: 1 }, boostBase: 1 }), "b").reason.code, "noBoost");
});

test("a live word worth nothing in the picked branch greys the row", () => {
  const branches = [
    { id: "light", label: "Light", dice: { success: "destinyLight" } },
    { id: "force", label: "Force", dice: { force: "forceAvailable" } },
  ];
  const o = opt("o", { strain: 1, choices: branches });
  const none = plan2({ offered: [o], selection: { o: 1 }, live: { destinyLight: 0, forceAvailable: 0 } });
  assert.deepEqual(row(none, "o").reason, { code: "zeroValue", data: { word: "destinyLight" } });
  assert.equal(none.strain, 0);
  const force = plan2({ offered: [o], selection: { o: 1 }, choices: { o: "force" }, live: { destinyLight: 2, forceAvailable: 0 } });
  assert.deepEqual(row(force, "o").reason, { code: "zeroValue", data: { word: "forceAvailable" } });
  const light = plan2({ offered: [o], selection: { o: 1 }, live: { destinyLight: 2 } });
  assert.deepEqual(row(light, "o").dice, { success: 2 });
});

test("inputs mark an initiative roll", () => {
  assert.equal(rollOptionInputs(null, { skillKey: "Cool", initiative: true }).context.isInitiative, true);
  assert.equal(rollOptionInputs(null, { skillKey: "Cool" }).context.isInitiative, false);
});
