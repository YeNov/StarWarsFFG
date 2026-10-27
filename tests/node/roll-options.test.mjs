import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { normalizeName, optionErrorKey, parseOptionText, validateOptions } from "../../modules/helpers/roll-options.js";

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

test("every error the validator can report has an English message", async () => {
  const fs = await import("node:fs");
  const EN = JSON.parse(fs.readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
  const samples = [
    parseOptionText("[{"),
    validateOptions(3),
    validateOptions([1, { offer: 1 }]),
    validateOptions({ lable: 1, label: "", offer: { skills: "x", skillTypes: ["Fighting"], attack: 1, twoWeapons: "no" } }),
    validateOptions({ amount: { max: 0 }, cost: { strain: -1 }, dice: { boost: 0.5 } }),
    validateOptions({ dice: { boost: "amount" } }),
    validateOptions([{ id: "a" }, { id: "a" }]),
  ];
  const errors = samples.flatMap((r) => r.errors);
  const codes = new Set(errors.map((e) => e.code));
  for (const code of ["json", "notList", "notObject", "unknownKey", "notText", "notTextList", "notSkillType", "notBoolean",
    "notTwoWeapons", "notCost", "notMax", "notDiceValue", "amountWithoutAmount", "duplicateId"]) {
    assert.ok(codes.has(code), `sample covers ${code}`);
  }
  for (const error of errors) {
    const key = optionErrorKey(error);
    assert.ok(key in EN, `${key} is in lang/en.json`);
  }
  assert.equal(optionErrorKey({ code: "notObject", key: "" }), "SWFFG.RollOptions.Error.NotObjectOption");
  assert.equal(optionErrorKey({ code: "notObject", key: "offer" }), "SWFFG.RollOptions.Error.NotObject");
});

/* The talent review batch (2026-10-22): results, Force dice, Boost trades, live and signed words,
 * uncapped amounts, the Daunting condition, difficulty floors, swaps and either/or choices. */

test("results, Force dice and Boost trades are dice keys", () => {
  const all = { success: 1, advantage: "ranks", triumph: 1, threat: 2, failure: 1, despair: 1, force: "forceAvailable", removeBoost: "amount" };
  assert.equal(validateOptions({ amount: {}, dice: all }).ok, true);
});

test("live words and signed words are dice values", () => {
  assert.equal(validateOptions({ dice: { difficulty: "-ranks", success: "destinyLight", threat: "destinyDark", setback: "-forceRating" } }).ok, true);
  assert.equal(validateOptions({ amount: { max: 3 }, dice: { difficulty: "-amount" } }).ok, true);
  assert.equal(validateOptions({ dice: { difficulty: "-amount" } }).errors[0].code, "amountWithoutAmount");
  for (const value of ["-rank", "--ranks", "+ranks", "-"]) assert.equal(validateOptions({ dice: { boost: value } }).errors[0].code, "notDiceValue");
});

test("amount.max may be left out, or be a live word, but never negative", () => {
  assert.equal(validateOptions({ amount: { label: "Stealth ranks" }, dice: { success: "amount" } }).ok, true);
  for (const max of ["forceAvailable", "destinyLight", "destinyDark"]) assert.equal(validateOptions({ amount: { max } }).ok, true);
  assert.equal(validateOptions({ amount: { max: "-ranks" } }).errors[0].code, "notMax");
});

test("offer.minDifficulty is a whole number of 1 or more", () => {
  assert.equal(validateOptions({ offer: { minDifficulty: 4 } }).ok, true);
  for (const min of [0, 1.5, "4", -2]) assert.equal(validateOptions({ offer: { minDifficulty: min } }).errors[0].code, "notMinDifficulty");
});

test("difficultyFloor is a whole number of 0 or more", () => {
  assert.equal(validateOptions({ difficultyFloor: 1, dice: { difficulty: -1 } }).ok, true);
  assert.equal(validateOptions({ difficultyFloor: 0 }).ok, true);
  for (const floor of [-1, "1", 0.5]) assert.equal(validateOptions({ difficultyFloor: floor }).errors[0].code, "notFloor");
});

test("a characteristic swap names a characteristic, a skill swap names a skill", () => {
  for (const characteristic of ["Brawn", "Agility", "Intellect", "Cunning", "Willpower", "Presence"]) {
    assert.equal(validateOptions({ characteristic }).ok, true);
  }
  assert.equal(validateOptions({ characteristic: "Cunnings" }).errors[0].code, "notCharacteristic");
  assert.equal(validateOptions({ skill: "Athletics" }).ok, true);
  assert.equal(validateOptions({ skill: "" }).errors[0].code, "notText");
});

test("choices are two or more branches, each with its own id, a label and dice", () => {
  const branch = (id, dice) => ({ id, label: id, dice });
  const ok = { amount: { max: "ranks" }, dice: { removeBoost: "amount" }, choices: [branch("success", { success: "amount" }), branch("advantage", { advantage: "amount" })] };
  assert.equal(validateOptions(ok).ok, true);
  assert.equal(validateOptions({ choices: "success" }).errors[0].code, "notChoices");
  assert.equal(validateOptions({ choices: [branch("a", {})] }).errors[0].code, "notChoices");
  assert.deepEqual(validateOptions({ choices: [branch("a", {}), branch("a", {})] }).errors, [{ option: 1, key: "choices[2].id", code: "duplicateChoiceId" }]);
  assert.deepEqual(validateOptions({ choices: [branch("a", {}), { id: "b", dice: {} }] }).errors, [{ option: 1, key: "choices[2].label", code: "notText" }]);
  assert.deepEqual(validateOptions({ choices: [branch("a", { success: 0.5 }), branch("b", {})] }).errors, [{ option: 1, key: "choices[1].dice.success", code: "notDiceValue" }]);
  assert.deepEqual(validateOptions({ choices: [branch("a", {}), { ...branch("b", {}), cost: {} }] }).errors, [{ option: 1, key: "choices[2].cost", code: "unknownKey" }]);
  assert.deepEqual(validateOptions({ choices: [branch("a", { success: "amount" }), branch("b", {})] }).errors, [{ option: 1, key: "choices[1].dice.success", code: "amountWithoutAmount" }]);
});

test("every error the batch's keys can report has an English message", async () => {
  const fs = await import("node:fs");
  const EN = JSON.parse(fs.readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
  const errors = [
    validateOptions({ offer: { minDifficulty: 0 } }),
    validateOptions({ difficultyFloor: -1 }),
    validateOptions({ characteristic: "Luck" }),
    validateOptions({ choices: 1 }),
    validateOptions({ choices: [{ id: "a", label: "a", dice: {} }, { id: "a", label: "a", dice: {} }] }),
  ].flatMap((r) => r.errors);
  assert.deepEqual(errors.map((e) => e.code), ["notMinDifficulty", "notFloor", "notCharacteristic", "notChoices", "duplicateChoiceId"]);
  for (const error of errors) assert.ok(optionErrorKey(error) in EN, `${optionErrorKey(error)} is in lang/en.json`);
});

test("normalizeName ignores case, spaces, hyphens, punctuation and accents", () => {
  assert.equal(normalizeName(" Auto-Fire "), "autofire");
  assert.equal(normalizeName("Visée juste"), "viseejuste");
  assert.notEqual(normalizeName("Point Blank (Improved)"), normalizeName("Point Blank"));
});

test("offer.initiative is a boolean", () => {
  assert.equal(validateOptions({ offer: { initiative: true } }).ok, true);
  assert.equal(validateOptions({ offer: { initiative: false } }).ok, true);
  const [error] = validateOptions({ offer: { initiative: "yes" } }).errors;
  assert.deepEqual([error.key, error.code], ["offer.initiative", "notBoolean"]);
});

test("weapon takes damage and critical, as numbers or words", () => {
  assert.equal(validateOptions([{ id: "a", weapon: { damage: 2, critical: "-ranks" } }]).ok, true);
  assert.equal(validateOptions({ weapon: { damage: "skillRank" } }).ok, true);
  assert.deepEqual(validateOptions({ weapon: { pierce: 1 } }).errors, [{ option: 1, key: "weapon.pierce", code: "unknownKey" }]);
  assert.deepEqual(validateOptions({ weapon: { damage: "lots" } }).errors, [{ option: 1, key: "weapon.damage", code: "notDiceValue" }]);
  assert.deepEqual(validateOptions({ weapon: 3 }).errors, [{ option: 1, key: "weapon", code: "notObject" }]);
  assert.deepEqual(validateOptions({ weapon: { damage: "amount" } }).errors, [{ option: 1, key: "weapon.damage", code: "amountWithoutAmount" }]);
  assert.equal(validateOptions({ amount: { max: 2 }, weapon: { damage: "amount" } }).ok, true);
});

test("weapon is not allowed inside choices", () => {
  const choices = [{ id: "a", label: "A", weapon: { damage: 1 } }, { id: "b", label: "B" }];
  assert.deepEqual(validateOptions({ choices }).errors, [{ option: 1, key: "choices[1].weapon", code: "unknownKey" }]);
});

test("skillRank is a word for dice, weapon and amount.max", () => {
  assert.equal(validateOptions({ dice: { boost: "skillRank", setback: "-skillRank" } }).ok, true);
  assert.equal(validateOptions({ amount: { max: "skillRank" } }).ok, true);
  assert.equal(validateOptions({ amount: { max: "-skillRank" } }).errors[0].code, "notMax");
});
