const APP = "D:/SW FFG/Portable FVTT 14/App/resources/app";
const SYS = "D:/SW FFG/Portable FVTT/Data/systems/starwarsffg";
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
