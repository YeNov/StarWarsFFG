import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { normalizeName, parseOptionText, validateOptions } from "../../modules/helpers/roll-options.js";

/**
 * The roll option format and what its validator refuses
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "The option format").
 */

test("one option or a list both validate to a list", () => {
  assert.deepEqual(validateOptions({ label: "A" }), { ok: true, options: [{ label: "A" }] });
  assert.equal(validateOptions([{}, { label: "B" }]).options.length, 2);
});

test("broken JSON reports a whole-text error", () => {
  const r = parseOptionText("[{");
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map(({ option, code }) => ({ option, code })), [{ option: null, code: "json" }]);
});

test("unknown keys are named with their option", () => {
  assert.deepEqual(validateOptions([{}, { lable: "x" }]).errors, [{ option: 2, key: "lable", code: "unknownKey" }]);
  assert.equal(validateOptions({ offer: { skill: ["Melee"] } }).errors[0].key, "offer.skill");
});

test("costs are whole numbers of 0 or more, or amount", () => {
  for (const strain of [-2, 1.5, Infinity, "2"]) {
    assert.deepEqual(validateOptions({ amount: { max: 2 }, cost: { strain } }).errors, [{ option: 1, key: "cost.strain", code: "notCost" }]);
  }
  assert.equal(validateOptions({ cost: { strain: 0, maneuvers: 0 } }).ok, true);
  assert.equal(validateOptions({ amount: { max: "ranks" }, cost: { strain: "amount" } }).ok, true);
});

test("amount.max is a positive whole number or ranks / forceRating", () => {
  for (const max of [0, -1, 2.5, "amount", "rank"]) assert.equal(validateOptions({ amount: { max } }).errors[0].code, "notMax");
  for (const max of [1, 3, "ranks", "forceRating"]) assert.equal(validateOptions({ amount: { max } }).ok, true);
});

test("amount words need an amount", () => {
  assert.deepEqual(validateOptions({ dice: { upgradeAbility: "amount" } }).errors,
    [{ option: 1, key: "dice.upgradeAbility", code: "amountWithoutAmount" }]);
  assert.equal(validateOptions({ cost: { strain: "amount" } }).errors[0].code, "amountWithoutAmount");
});

test("dice values are whole numbers (negative allowed) or ranks / amount / forceRating", () => {
  assert.equal(validateOptions({ dice: { difficulty: -1, boost: "ranks", setback: "forceRating" } }).ok, true);
  assert.equal(validateOptions({ dice: { boost: 0.5 } }).errors[0].code, "notDiceValue");
  assert.equal(validateOptions({ dice: { ability: 1 } }).errors[0].code, "unknownKey");
});

test("offer checks skills, skill types, attack and twoWeapons", () => {
  assert.equal(validateOptions({ offer: { skills: ["Melee"], skillTypes: ["Combat"], attack: true, twoWeapons: "any" } }).ok, true);
  assert.equal(validateOptions({ offer: { skills: "Melee" } }).errors[0].code, "notTextList");
  assert.equal(validateOptions({ offer: { skillTypes: ["Fighting"] } }).errors[0].code, "notSkillType");
  assert.equal(validateOptions({ offer: { attack: "yes" } }).errors[0].code, "notBoolean");
  assert.equal(validateOptions({ offer: { twoWeapons: "no" } }).errors[0].code, "notTwoWeapons");
});

test("label, hint and id are non-empty text when given", () => {
  assert.equal(validateOptions({ label: "" }).errors[0].code, "notText");
  assert.equal(validateOptions({ hint: 3 }).errors[0].key, "hint");
});

test("an explicit id may appear only once in a macro", () => {
  assert.deepEqual(validateOptions([{ id: "x" }, { id: "y" }, { id: "x" }]).errors, [{ option: 3, key: "id", code: "duplicateId" }]);
  assert.equal(validateOptions([{ id: "1" }, {}]).ok, true); // an id that looks like a position is fine
});

test("every error in a list is reported, not just the first", () => {
  assert.equal(validateOptions([{ lable: 1 }, { cost: { strain: -1 } }]).errors.length, 2);
});

test("normalizeName ignores case, spaces, hyphens, punctuation and accents", () => {
  assert.equal(normalizeName(" Auto-Fire "), "autofire");
  assert.equal(normalizeName("Visée juste"), "viseejuste");
  assert.notEqual(normalizeName("Point Blank (Improved)"), normalizeName("Point Blank"));
});
