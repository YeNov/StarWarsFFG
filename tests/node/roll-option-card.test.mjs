import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import {
  cardPanelContext, costText, describeCharge, formatRollOptionsLine, keepOffered, optionChoicesContext, optionReasonText,
  rollOptionCardEntries, tickedRowCount,
} from "../../modules/helpers/roll-option-card.js";
import { planOptionStates } from "../../modules/helpers/roll-option-costs.js";

/**
 * The chat card's roll options line (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "Chat card"), formatted with the real English strings.
 */

const EN = JSON.parse(fs.readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
const localize = (key, data = {}) => {
  assert.ok(key in EN, `lang/en.json has ${key}`);
  return EN[key].replace(/\{(\w+)\}/g, (_, name) => String(data[name]));
};

const option = (key, label, { strain = 0, maneuvers = 0, amount = null, ranked = false, rank = 1, twoWeapons = null } = {}) => ({
  key, label, source: label, ranked, rank, hint: null, twoWeapons,
  amount: amount === null ? null : { max: amount, label: null },
  cost: { strain, maneuvers }, dice: {},
});
const pool = (unit = "strain") => ({ path: `system.stats.${unit}.value`, unit, current: 0, threshold: 20 });
const line = ({ offered, selection, twoWeapons = "no", unit = "strain" }) => {
  const states = planOptionStates({ offered, selection, twoWeapons, pool: pool(unit), canCharge: true });
  return formatRollOptionsLine(rollOptionCardEntries({ offered, states, twoWeapons, unit }), localize);
};

test("the spec's example line", () => {
  const offered = [
    option("gb", "Guns Blazing", { strain: 2, twoWeapons: "same" }),
    option("pb", "Point Blank", { ranked: true, rank: 2 }),
    option("fa", "Frenzied Attack", { strain: "amount", amount: 3, ranked: true, rank: 3 }),
  ];
  assert.equal(
    line({ offered, selection: { gb: 1, pb: 1, fa: 2 }, twoWeapons: "same" }),
    "Roll options: Two weapons (same skill), Guns Blazing (2 strain), Point Blank 2, Frenzied Attack 2 (2 strain)",
  );
});

test("maneuvers and wounds", () => {
  const offered = [option("if", "Intense Focus", { strain: 1, maneuvers: 1 })];
  assert.equal(line({ offered, selection: { if: 1 }, unit: "wounds" }), "Roll options: Intense Focus (1 wound, 1 maneuver)");
});

test("nothing used, no line", () => {
  assert.equal(formatRollOptionsLine([], localize), null);
  assert.equal(line({ offered: [option("pb", "Point Blank")], selection: {} }), null);
});

test("an unranked talent shows no number", () => {
  const offered = [option("ss", "Saber Swarm", { strain: 1, maneuvers: 1 })];
  assert.equal(line({ offered, selection: { ss: 1 } }), "Roll options: Saber Swarm (1 strain, 1 maneuver)");
});

test("a maneuver cost per amount shows the resolved count", () => {
  const offered = [option("st", "Steady Aim", { maneuvers: "amount", amount: 3 })];
  const states = planOptionStates({ offered, selection: { st: 3 }, twoWeapons: "no", pool: null, canCharge: false });
  const entries = rollOptionCardEntries({ offered, states, twoWeapons: "no", unit: "strain" });
  assert.equal(entries[0].strain, 0);
  assert.equal(formatRollOptionsLine(entries, localize), "Roll options: Steady Aim 3 (3 maneuvers)");
});

test("two weapons on different skills, and plural strain and wounds", () => {
  const offered = [option("x", "Big", { strain: 3 })];
  assert.equal(line({ offered, selection: { x: 1 }, twoWeapons: "different" }), "Roll options: Two weapons (different skills), Big (3 strain)");
  assert.equal(line({ offered, selection: { x: 1 }, unit: "wounds" }), "Roll options: Big (3 wounds)");
});

test("a row's cost text", () => {
  assert.equal(costText({ strain: 2, maneuvers: 1 }, "strain", localize), "2 strain · 1 maneuver");
  assert.equal(costText({ strain: 1, maneuvers: 0 }, "wounds", localize), "1 wound");
  assert.equal(costText({ strain: 0, maneuvers: 2 }, "strain", localize), "2 maneuvers");
  assert.equal(costText({ strain: 0, maneuvers: 0 }, "strain", localize), "");
});

test("what a charge warning names: the total and the options that cost it", () => {
  const offered = [
    option("gb", "Guns Blazing", { strain: 2, twoWeapons: "same" }),
    option("pb", "Point Blank", { ranked: true, rank: 2 }),
    option("if", "Intense Focus", { strain: 1, maneuvers: 1 }),
  ];
  const states = planOptionStates({ offered, selection: { gb: 1, pb: 1, if: 1 }, twoWeapons: "same", pool: pool(), canCharge: true });
  const entries = rollOptionCardEntries({ offered, states, twoWeapons: "same", unit: "strain" });
  assert.deepEqual(describeCharge(entries, states.strain, "strain", localize), { cost: "3 strain", options: "Guns Blazing, Intense Focus" });
  assert.deepEqual(describeCharge(entries, 1, "wounds", localize).cost, "1 wound");
});

test("a picked choice is named after the amount", () => {
  const ck = {
    ...option("ck", "Clanker Killer", { amount: 3 }),
    dice: { removeBoost: "amount" },
    choices: [{ id: "su", label: "Success", dice: { success: "amount" } }, { id: "ad", label: "Advantage", dice: { advantage: "amount" } }],
  };
  const qe = { ...option("qe", "Questionable Ethics", { strain: "amount", amount: 3 }), choices: [{ id: "su", label: "Success", dice: {} }, { id: "ad", label: "Advantage", dice: {} }] };
  const offered = [ck, qe];
  const states = planOptionStates({ offered, selection: { ck: 2, qe: 2 }, choices: { qe: "ad" }, twoWeapons: "no", pool: pool(), canCharge: true, boostBase: 3 });
  assert.equal(
    formatRollOptionsLine(rollOptionCardEntries({ offered, states, twoWeapons: "no" }), localize),
    "Roll options: Clanker Killer 2: Success, Questionable Ethics 2: Advantage (2 strain)",
  );
});

test("a greyed row keeps its switch, so another branch can be picked (implementation review)", () => {
  const option = { choices: [{ id: "trade", label: "Trade" }, { id: "add", label: "Add" }] };
  assert.deepEqual(optionChoicesContext(option, { disabled: true, choice: "trade" }), [
    { id: "trade", label: "Trade", on: true },
    { id: "add", label: "Add", on: false },
  ]);
  assert.deepEqual(optionChoicesContext(option, null).map((c) => c.on), [true, false], "the first branch by default");
  assert.equal(optionChoicesContext({ choices: null }, null), null);
});

/* The card's context, moved out of RollBuilderFFG so the initiative dialog shares it
   (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md, "Sharing the card's code"). */

const cardContext = ({ offered, selection = {}, pool: payer = pool("strain"), amounts = {}, tooltips = new Map(), buffs = [], tickedBuffKeys = new Set(), twoWeapons = "no" }) => {
  const states = planOptionStates({ offered, selection, twoWeapons, pool: payer, canCharge: true });
  return cardPanelContext({ twoWeaponsAvailable: true, twoWeapons, buffs, tickedBuffKeys, offered, states, amounts, tooltips, pool: payer, localize });
};

test("a greyed row says why", () => {
  const over = optionReasonText({ code: "overThreshold", data: { unit: "strain", value: 13, threshold: 12 } }, localize);
  assert.match(over, /13/);
  assert.match(over, /12/);
  assert.match(optionReasonText({ code: "needsDifficulty", data: { min: 4 } }, localize), new RegExp(EN["SWFFG.DifficultyDaunting"]));
  assert.equal(optionReasonText({ code: "nope", data: {} }, localize), "");
});

test("the card's context", () => {
  const offered = [
    option("pb", "Point Blank", { ranked: true, rank: 2 }),
    option("rr", "Rapid Reaction", { strain: "amount", amount: 3 }),
    { ...option("ta", "True Aim"), hint: "Once per round" },
    option("big", "Big", { strain: 25 }),
  ];
  const ticked = cardContext({ offered, selection: { rr: 2 }, tooltips: new Map([["pb", "<p>x</p>"]]), twoWeapons: "same" });
  assert.equal(ticked.options[0].label, "Point Blank 2");
  assert.equal(ticked.options[0].tooltip, "<p>x</p>");
  assert.equal(ticked.options[1].ticked, true);
  assert.equal(ticked.options[1].amount.value, 2);
  assert.equal(ticked.options[2].note, "Once per round");
  assert.equal(ticked.options[2].reason, false);
  assert.equal(ticked.options[3].disabled, true);
  assert.equal(ticked.options[3].reason, true);
  assert.equal(ticked.options[3].note, optionReasonText({ code: "overThreshold", data: { unit: "strain", value: 27, threshold: 20 } }, localize));
  assert.equal(ticked.footer, localize("SWFFG.RollOptions.Panel.StrainAfter", { value: 2, threshold: 20 }));
  assert.deepEqual(ticked.twoWeapons.choices.map((c) => c.on), [false, true, false]);
  assert.equal(ticked.twoWeapons.available, true);

  const typed = cardContext({ offered, amounts: { rr: 5 } });
  assert.equal(typed.options[1].ticked, false);
  assert.equal(typed.options[1].amount.value, 3, "the typed amount is capped at the row's max");

  const withBuffs = cardContext({ offered, buffs: [{ key: "b", name: "", applied: true }, { key: "c", name: "Cover", source: "Shield" }], tickedBuffKeys: new Set(["c"]) });
  assert.deepEqual(withBuffs.buffs.map(({ name, ticked, locked }) => ({ name, ticked, locked })), [
    { name: EN["SWFFG.OptionalBuffs.Unnamed"], ticked: true, locked: true },
    { name: "Cover", ticked: true, locked: false },
  ]);
});

test("a rival's card counts wounds", () => {
  const offered = [option("rr", "Rapid Reaction", { strain: "amount", amount: 3 })];
  assert.equal(cardContext({ offered, selection: { rr: 2 }, pool: pool("wounds") }).footer,
    localize("SWFFG.RollOptions.Panel.WoundsAfter", { value: 2, threshold: 20 }));
  assert.equal(cardContext({ offered: [option("pb", "Point Blank")] }).footer, null, "no costed row, no footer");
});

test("ticked rows are counted for the fold tab", () => {
  const offered = [option("a", "A"), option("b", "B"), option("c", "C")];
  const states = planOptionStates({ offered, selection: { a: 1, b: 1 }, twoWeapons: "same", pool: pool(), canCharge: true });
  const buffs = [{ key: "x", applied: true }, { key: "y" }, { key: "z" }];
  assert.equal(tickedRowCount({ buffs, tickedBuffKeys: new Set(["y"]), states, twoWeapons: "same" }), 5);
  assert.equal(tickedRowCount({ buffs: [], tickedBuffKeys: new Set(), states, twoWeapons: "no" }), 2);
});

test("a skill change keeps only what is still offered", () => {
  assert.deepEqual(
    keepOffered({ selection: { a: 3, b: 1 }, choices: { a: "x", b: "y" }, buffKeys: new Set(["k1", "k2"]) }, { offered: [{ key: "a" }], buffs: [{ key: "k2" }] }),
    { selection: { a: 3 }, choices: { a: "x" }, buffKeys: new Set(["k2"]) },
  );
});

test("a ticked weapon row shows its numbers before its costs", () => {
  const withWeapon = (opt, weapon) => ({ ...opt, weapon });
  const pb = withWeapon(option("pb", "Point Blank", { ranked: true, rank: 2 }), { damage: 2 });
  assert.equal(line({ offered: [pb], selection: { pb: 1 } }), "Roll options: Point Blank 2 (+2 damage)");
  const hunter = withWeapon(option("h", "Hunter"), { critical: -1 });
  assert.equal(line({ offered: [hunter], selection: { h: 1 } }), "Roll options: Hunter (Crit \u22121)");
  const both = withWeapon(option("x", "X", { strain: 1 }), { damage: 1, critical: 0 });
  assert.equal(line({ offered: [both], selection: { x: 1 } }), "Roll options: X (+1 damage, 1 strain)");
  const states = planOptionStates({ offered: [pb], selection: { pb: 1 }, twoWeapons: "no", pool: pool(), canCharge: true });
  assert.deepEqual(rollOptionCardEntries({ offered: [pb], states, twoWeapons: "no" })[0].weapon, { damage: 2, critical: 0 });
});
