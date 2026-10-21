import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { canChargeFor, planOptionStates, rollOptionInputs } from "../../modules/helpers/roll-option-costs.js";

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
