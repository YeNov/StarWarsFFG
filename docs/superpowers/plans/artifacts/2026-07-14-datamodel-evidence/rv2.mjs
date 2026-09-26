// Foundry install's `resources/app`; set FVTT_APP (see README).
const APP = process.env.FVTT_APP;
// This system's checkout; set FVTT_SYS (see README).
const SYS = process.env.FVTT_SYS;
await import(`file:///${APP}/common/primitives/_module.mjs`);
const fields = await import(`file:///${APP}/common/data/fields.mjs`);
const dataMod = await import(`file:///${APP}/common/abstract/data.mjs`);
const typeDataMod = await import(`file:///${APP}/common/abstract/type-data.mjs`);
const helpers = await import(`file:///${APP}/common/utils/helpers.mjs`);
globalThis.foundry = { data: { fields, validators: {} }, abstract: { DataModel: dataMod.default, TypeDataModel: typeDataMod.default }, utils: helpers, CONST: {} };
globalThis.CONST = {};
const { CharacterDataModel } = await import(`file:///${SYS}/modules/data/models/actor/character.js`);
const plain = new CharacterDataModel({}, { parent: null }).toObject();
const rv = plain.stats.wounds.real_value;
console.log("value:", JSON.stringify(rv), "| typeof:", typeof rv);
console.log("survives JSON round-trip (i.e. would persist to the DB)? ->",
  "real_value" in JSON.parse(JSON.stringify(plain)).stats.wounds);
console.log("migration guard `rv != null` would fire? ->", rv != null, "(must be false)");
