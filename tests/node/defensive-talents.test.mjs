import test from "node:test";
import assert from "node:assert/strict";

import { MELEE_DEFENCE_SKILLS, RANGED_DEFENCE_SKILLS } from "../../modules/helpers/defence-helpers.js";
import {
  DEFENSIVE_TALENT_LISTS,
  RULESET_RESPECIALIZED,
  RULESET_VANILLA,
  cheapestCost,
  classifyAttack,
  defenceCost,
  defenceCostPool,
  parseTalentNames,
  planDefenceControls,
  planDefensiveTalent,
  readCostPool,
  unitLabelKey,
  wouldIncapacitate,
} from "../../modules/helpers/defensive-talents.js";

/**
 * Parry, Reflect and the GM-listed talents beside them. Everything the Apply Damage dialog and
 * the GM bridge's writer decide about them is decided here, without Foundry.
 */

/** The name lists exactly as the world defaults parse. */
const DEFAULT_NAMES = Object.fromEntries(DEFENSIVE_TALENT_LISTS.map((list) => [list.field, parseTalentNames(list.default)]));

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";

const talent = (name, rank = 1) => ({ name, rank });
const target = ({ type = "character", talents = [], strain = [0, 10], wounds = [0, 12] } = {}) => ({
  type,
  talentList: talents,
  system: { stats: { strain: { value: strain[0], max: strain[1] }, wounds: { value: wounds[0], max: wounds[1] } } },
});
const plan = (actor, { attack = "melee", ruleset = RULESET_VANILLA, names = DEFAULT_NAMES } = {}) =>
  planDefensiveTalent({ actor, attack, ruleset, names });

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

test("a name list is split on commas, trimmed, lowercased and deduplicated", () => {
  assert.deepEqual(parseTalentNames(" Parry ,BLOCK,, parry ,"), ["parry", "block"]);
  assert.deepEqual(parseTalentNames(""), []);
  assert.deepEqual(parseTalentNames("  ,  "), []);
  assert.deepEqual(parseTalentNames(undefined), []);
});

test("the world defaults cover the book, the OggDude and the reSpecialized v.56 names", () => {
  // reSpecialized v.56 adds Block, Deflect and Unarmed Block, and has no Supreme variant.
  assert.deepEqual(DEFAULT_NAMES, {
    melee: ["parry", "block"],
    ranged: ["reflect", "deflect"],
    meleeSupreme: ["parry (supreme)", "supreme parry"],
    rangedSupreme: ["reflect (supreme)", "supreme reflect"],
    unarmed: ["unarmed parry", "unarmed block"],
  });
});

test("names match whole: Improved, Supreme and Unarmed Parry are not Parry", () => {
  const actor = target({ talents: [talent("Parry (Improved)"), talent("Unarmed Parry"), talent("Parry (Supreme)")] });
  assert.equal(plan(actor), null);
});

test("names match regardless of case and surrounding spaces", () => {
  assert.equal(plan(target({ talents: [talent("  PARRY ")] })).reduction, 3);
});

test("an emptied list turns that row off", () => {
  const actor = target({ talents: [talent("Parry", 2)] });
  assert.equal(plan(actor, { names: { ...DEFAULT_NAMES, melee: [] } }), null);
});

// ---------------------------------------------------------------------------
// Which attack
// ---------------------------------------------------------------------------

test("the attacking skill decides melee or ranged, and nothing else qualifies", () => {
  for (const skill of MELEE_DEFENCE_SKILLS) assert.equal(classifyAttack(skill), "melee");
  for (const skill of RANGED_DEFENCE_SKILLS) assert.equal(classifyAttack(skill), "ranged");
  for (const skill of ["Astrogation", "melee", "", undefined, null]) assert.equal(classifyAttack(skill), null);
});

test("a melee talent is never offered against a ranged hit, nor the reverse", () => {
  assert.equal(plan(target({ talents: [talent("Parry", 2)] }), { attack: "ranged" }), null);
  assert.equal(plan(target({ talents: [talent("Reflect", 2)] }), { attack: "melee" }), null);
  assert.equal(plan(target({ talents: [talent("Parry", 2)] }), { attack: null }), null);
});

test("a target with no talent list, or a vehicle, offers nothing", () => {
  assert.equal(plan({ type: "character", system: { stats: {} } }), null);
  assert.equal(plan(target({ type: "vehicle", talents: [talent("Parry", 2)] })), null);
});

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

test("vanilla reduces by 2 plus ranks, summed over every matching entry", () => {
  assert.equal(plan(target({ talents: [talent("Parry", 1)] })).reduction, 3);
  assert.equal(plan(target({ talents: [talent("Parry", 3)] })).reduction, 5);
  // A tree's Parry and an attachment's innate Parry are two talentList entries.
  const summed = plan(target({ talents: [talent("Parry", 2), talent("Parry", 1)] }));
  assert.equal(summed.ranks, 3);
  assert.equal(summed.reduction, 5);
});

test("an unranked entry counts as one rank", () => {
  assert.equal(plan(target({ talents: [talent("Block", "N/A")] })).reduction, 3);
  assert.equal(plan(target({ talents: [talent("Block", "N/A"), talent("Parry", 2)] })).reduction, 5);
});

test("reSpecialized reduces by a flat 4 for every listed name, whatever the ranks", () => {
  // v.56 Block and Deflect: 3 strain, 4 off the hit before soak, no ranks (see Task 0's sources).
  const respec = { ruleset: RULESET_RESPECIALIZED };
  assert.equal(plan(target({ talents: [talent("Parry", 3)] }), respec).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Block", "N/A")] }), respec).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Block", "N/A"), talent("Parry", 2)] }), respec).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Reflect", 2)] }), { ...respec, attack: "ranged" }).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Deflect", "N/A")] }), { ...respec, attack: "ranged" }).reduction, 4);
});

test("a reSpecialized v.56 character: Block and Deflect take 4 off, Unarmed Block cuts melee only", () => {
  // The names the v.56 Martial Artist and Pit Fighter trees and the Arbiter tree print.
  // Improved Unarmed Block disarms an attacker; it is neither Block nor Unarmed Block.
  const actor = target({
    talents: [talent("Block", "N/A"), talent("Unarmed Block", "N/A"), talent("Improved Unarmed Block", "N/A"), talent("Deflect", "N/A")],
  });
  const respec = { ruleset: RULESET_RESPECIALIZED };
  const pool = readCostPool(actor);

  const block = plan(actor, respec);
  assert.deepEqual(block.talentNames, ["Block"]);
  assert.equal(block.reduction, 4);
  assert.equal(block.formula.key, "SWFFG.ApplyDamage.Defence.FormulaRespec");
  assert.equal(block.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyBlock");
  assert.equal(block.hasUnarmed, true);
  assert.equal(block.hasSupreme, false); // reSpecialized has no Supreme Block
  assert.equal(cheapestCost(block), 2);
  assert.equal(planDefenceControls(block, pool, { on: true }).cost, 3);
  assert.equal(planDefenceControls(block, pool, { on: true, unarmed: true }).cost, 2);

  const deflect = plan(actor, { ...respec, attack: "ranged" });
  assert.deepEqual(deflect.talentNames, ["Deflect"]);
  assert.equal(deflect.reduction, 4);
  assert.equal(deflect.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyDeflect");
  assert.equal(deflect.hasUnarmed, false);
  assert.equal(deflect.hasSupreme, false);
  assert.equal(cheapestCost(deflect), 3);
  assert.equal(planDefenceControls(deflect, pool, { on: true, unarmed: true }).cost, 3);

  assert.equal(plan(target({ talents: [talent("Improved Unarmed Block", "N/A")] }), respec), null);
});

test("in a reSpecialized world Parry and Reflect, and their modifiers, stand in for Block and Deflect", () => {
  const actor = target({
    talents: [talent("Parry", 2), talent("Supreme Parry"), talent("Unarmed Parry"), talent("Reflect", 3), talent("Reflect (Supreme)")],
  });
  const respec = { ruleset: RULESET_RESPECIALIZED };

  const parry = plan(actor, respec);
  assert.equal(parry.reduction, 4);
  assert.equal(parry.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyBlock");
  assert.equal(parry.hasSupreme, true);
  assert.equal(parry.hasUnarmed, true);
  assert.equal(cheapestCost(parry), 1);

  const reflect = plan(actor, { ...respec, attack: "ranged" });
  assert.equal(reflect.reduction, 4);
  assert.equal(reflect.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyDeflect");
  assert.equal(reflect.hasSupreme, true);
  assert.equal(reflect.hasUnarmed, false);
  assert.equal(cheapestCost(reflect), 1);

  // Unarmed Block is Unarmed Parry's effect under a new name, so it lowers an old Parry too.
  const mixed = plan(target({ talents: [talent("Parry", 1), talent("Unarmed Block", "N/A")] }), respec);
  assert.equal(mixed.hasUnarmed, true);
  assert.equal(cheapestCost(mixed), 2);
});

test("labels follow the ruleset and the attack", () => {
  const parry = target({ talents: [talent("Parry", 2)] });
  const reflect = target({ talents: [talent("Reflect", 1)] });
  const respec = { ruleset: RULESET_RESPECIALIZED };
  assert.equal(plan(parry).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyParry");
  assert.equal(plan(reflect, { attack: "ranged" }).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyReflect");
  assert.equal(plan(parry, respec).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyBlock");
  assert.equal(plan(reflect, { ...respec, attack: "ranged" }).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyDeflect");
  assert.equal(plan(parry).publicKey, "SWFFG.ApplyDamage.Defence.PublicMelee");
  assert.equal(plan(reflect, { attack: "ranged" }).publicKey, "SWFFG.ApplyDamage.Defence.PublicRanged");
});

test("the formula explains the reduction for the GM", () => {
  assert.deepEqual(plan(target({ talents: [talent("Parry", 2)] })).formula,
    { key: "SWFFG.ApplyDamage.Defence.FormulaVanilla", ranks: 2 });
  assert.deepEqual(plan(target({ talents: [talent("Parry", 1)] })).formula,
    { key: "SWFFG.ApplyDamage.Defence.FormulaVanillaOne", ranks: 1 });
  assert.equal(plan(target({ talents: [talent("Parry", 2)] }), { ruleset: RULESET_RESPECIALIZED }).formula.key,
    "SWFFG.ApplyDamage.Defence.FormulaRespec");
});

test("matched talent names are reported once each, as the target spells them", () => {
  assert.deepEqual(plan(target({ talents: [talent("Parry", 1), talent("parry", 1), talent("Block", "N/A")] })).talentNames,
    ["Parry", "Block"]);
});

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

test("the cost is 3, Supreme makes it 1, Unarmed takes 1 off but never below 1", () => {
  assert.equal(defenceCost(), 3);
  assert.equal(defenceCost({ supreme: true }), 1);
  assert.equal(defenceCost({ unarmed: true }), 2);
  assert.equal(defenceCost({ supreme: true, unarmed: true }), 1);
});

test("Supreme is per category, and Unarmed is melee only", () => {
  const melee = plan(target({ talents: [talent("Parry"), talent("Parry (Supreme)"), talent("Unarmed Parry")] }));
  assert.equal(melee.hasSupreme, true);
  assert.equal(melee.hasUnarmed, true);

  const ranged = plan(target({ talents: [talent("Reflect"), talent("Supreme Parry"), talent("Unarmed Parry")] }), { attack: "ranged" });
  assert.equal(ranged.hasSupreme, false);
  assert.equal(ranged.hasUnarmed, false);
  assert.equal(plan(target({ talents: [talent("Reflect"), talent("Supreme Reflect")] }), { attack: "ranged" }).hasSupreme, true);
});

test("the cheapest cost is what the target's own modifiers allow", () => {
  assert.equal(cheapestCost({ hasSupreme: false, hasUnarmed: false }), 3);
  assert.equal(cheapestCost({ hasSupreme: false, hasUnarmed: true }), 2);
  assert.equal(cheapestCost({ hasSupreme: true, hasUnarmed: false }), 1);
  assert.equal(cheapestCost({ hasSupreme: true, hasUnarmed: true }), 1);
});

test("characters and nemeses pay strain; rivals pay wounds; minions and vehicles cannot activate", () => {
  for (const type of ["character", "nemesis"]) {
    assert.equal(defenceCostPool(type).path, STRAIN);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).costPath, STRAIN);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).unit, "strain");
  }
  for (const type of ["rival"]) {
    assert.equal(defenceCostPool(type).path, WOUNDS);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).costPath, WOUNDS);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).unit, "wounds");
  }
  for (const type of ["minion", "vehicle"]) {
    assert.equal(defenceCostPool(type), null);
    assert.equal(readCostPool(target({ type })), null);
    for (const ruleset of [RULESET_VANILLA, RULESET_RESPECIALIZED]) {
      assert.equal(plan(target({ type, talents: [talent("Parry")] }), { ruleset }), null);
    }
  }
});

test("the cost pool is read from the actor as it stands", () => {
  assert.deepEqual(readCostPool(target({ strain: [7, 10] })), { path: STRAIN, unit: "strain", current: 7, threshold: 10 });
  assert.deepEqual(readCostPool(target({ type: "rival", wounds: [4, 9] })), { path: WOUNDS, unit: "wounds", current: 4, threshold: 9 });
});

// ---------------------------------------------------------------------------
// Incapacitation
// ---------------------------------------------------------------------------

test("only exceeding the threshold incapacitates", () => {
  assert.equal(wouldIncapacitate({ current: 6, threshold: 10 }, 3), false);
  assert.equal(wouldIncapacitate({ current: 7, threshold: 10 }, 3), false);
  assert.equal(wouldIncapacitate({ current: 8, threshold: 10 }, 3), true);
  assert.equal(wouldIncapacitate({ current: 11, threshold: 10 }, 1), true);
});

test("an unknown threshold never disables anything", () => {
  for (const threshold of [0, -2, NaN, undefined]) {
    assert.equal(wouldIncapacitate({ current: 50, threshold }, 3), false);
  }
});

test("the toggle is greyed out when even the cheapest cost incapacitates", () => {
  const parryOnly = plan(target({ talents: [talent("Parry")], strain: [8, 10] }));
  const controls = planDefenceControls(parryOnly, readCostPool(target({ strain: [8, 10] })), { on: false });
  assert.equal(controls.toggleDisabled, true);
  assert.equal(controls.on, false);
  assert.equal(controls.applyDisabled, false);
});

test("Apply is greyed out while the selected cost is too much but a cheaper one is not", () => {
  const actor = target({ talents: [talent("Parry"), talent("Supreme Parry")], strain: [8, 10] });
  const parry = plan(actor);
  const pool = readCostPool(actor);

  const full = planDefenceControls(parry, pool, { on: true });
  assert.deepEqual(full, { toggleDisabled: false, on: true, supreme: false, unarmed: false, cost: 3, applyDisabled: true });

  const supreme = planDefenceControls(parry, pool, { on: true, supreme: true });
  assert.deepEqual(supreme, { toggleDisabled: false, on: true, supreme: true, unarmed: false, cost: 1, applyDisabled: false });
});

test("a modifier the target lacks, or a toggle left off, changes nothing", () => {
  const actor = target({ talents: [talent("Parry")] });
  const parry = plan(actor);
  assert.equal(planDefenceControls(parry, readCostPool(actor), { on: true, supreme: true, unarmed: true }).cost, 3);
  assert.deepEqual(planDefenceControls(parry, readCostPool(actor), { supreme: true }),
    { toggleDisabled: false, on: false, supreme: false, unarmed: false, cost: 3, applyDisabled: false });
});

test("the controls fall back to the plan's numbers when no live pool is given", () => {
  const parry = plan(target({ talents: [talent("Parry")], strain: [8, 10] }));
  assert.equal(planDefenceControls(parry, null, { on: false }).toggleDisabled, true);
});

test("a selected defence stays selected after strain rises and a modifier refreshes", () => {
  const actor = target({ talents: [talent("Parry"), talent("Supreme Parry"), talent("Unarmed Parry")], strain: [7, 10] });
  const parry = plan(actor);
  const selection = { on: true, supreme: true, unarmed: false };
  assert.equal(planDefenceControls(parry, readCostPool(actor), selection).applyDisabled, false);

  actor.system.stats.strain.value = 10;
  selection.unarmed = true; // a visible modifier click triggers refresh
  const controls = planDefenceControls(parry, readCostPool(actor), selection);
  assert.equal(controls.on, true);
  assert.equal(controls.supreme, true);
  assert.equal(controls.unarmed, true);
  assert.equal(controls.applyDisabled, true);
  assert.equal(controls.toggleDisabled, false); // the user can explicitly turn it off
  assert.deepEqual(selection, { on: true, supreme: true, unarmed: true });

  selection.on = false;
  const off = planDefenceControls(parry, readCostPool(actor), selection);
  assert.equal(off.on, false);
  assert.equal(off.toggleDisabled, true);
  assert.equal(off.applyDisabled, false);
});

test("unit words follow the pool and the count", () => {
  assert.equal(unitLabelKey("strain", 1), "SWFFG.ApplyDamage.Defence.UnitStrain");
  assert.equal(unitLabelKey("strain", 3), "SWFFG.ApplyDamage.Defence.UnitStrain");
  assert.equal(unitLabelKey("wounds", 1), "SWFFG.ApplyDamage.Defence.UnitWound");
  assert.equal(unitLabelKey("wounds", 3), "SWFFG.ApplyDamage.Defence.UnitWounds");
});
