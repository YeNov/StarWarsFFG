import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { formatRollOptionsLine, rollOptionCardEntries } from "../../modules/helpers/roll-option-card.js";
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
