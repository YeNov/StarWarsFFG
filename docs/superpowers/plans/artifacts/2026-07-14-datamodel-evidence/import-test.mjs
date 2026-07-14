// Import the real entry point exactly as swffg-main.js does, to prove the
// index -> conformance-report -> models-registry chain resolves with no cycle.
const APP = "D:/SW FFG/Portable FVTT 14/App/resources/app";
const SYS = "D:/SW FFG/Portable FVTT/Data/systems/starwarsffg";
await import(`file:///${APP}/common/primitives/_module.mjs`);
const fields = await import(`file:///${APP}/common/data/fields.mjs`);
const dataMod = await import(`file:///${APP}/common/abstract/data.mjs`);
const typeDataMod = await import(`file:///${APP}/common/abstract/type-data.mjs`);
const helpers = await import(`file:///${APP}/common/utils/helpers.mjs`);
globalThis.foundry = { data: { fields, validators: {} }, abstract: { DataModel: dataMod.default, TypeDataModel: typeDataMod.default }, utils: helpers, CONST: {} };
globalThis.CONST = {};

const idx = await import(`file:///${SYS}/modules/data/index.js`);
console.log("index.js imported OK");
console.log("  registerSystemDataModels:", typeof idx.registerSystemDataModels);
console.log("  reportDataModelConformance:", typeof idx.reportDataModelConformance);
console.log("  ITEM_MODELS types:", Object.keys(idx.ITEM_MODELS).length);
console.log("  ACTOR_MODELS types:", Object.keys(idx.ACTOR_MODELS).length);
console.log("  modelFor('Item','weapon'):", idx.modelFor("Item", "weapon")?.name);
console.log("  modelFor('Actor','rival'):", idx.modelFor("Actor", "rival")?.name);
const undef = Object.entries({...idx.ITEM_MODELS, ...idx.ACTOR_MODELS}).filter(([, v]) => !v);
console.log("  any undefined binding (cycle symptom)?", undef.length ? undef.map(e=>e[0]) : "none");

// Simulate registration the way init does.
globalThis.CONFIG = { Item: { dataModels: {} }, Actor: { dataModels: {} } };
idx.registerSystemDataModels();
console.log("  registered Item types:", Object.keys(CONFIG.Item.dataModels).length, "| Actor types:", Object.keys(CONFIG.Actor.dataModels).length);
