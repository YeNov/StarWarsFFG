const APP = "D:/SW FFG/Portable FVTT 14/App/resources/app";
const SYS = "D:/SW FFG/Portable FVTT/Data/systems/starwarsffg";
await import(`file:///${APP}/common/primitives/_module.mjs`);
const fields = await import(`file:///${APP}/common/data/fields.mjs`);
const dataMod = await import(`file:///${APP}/common/abstract/data.mjs`);
const typeDataMod = await import(`file:///${APP}/common/abstract/type-data.mjs`);
const helpers = await import(`file:///${APP}/common/utils/helpers.mjs`);
globalThis.foundry = { data: { fields, validators: {} }, abstract: { DataModel: dataMod.default, TypeDataModel: typeDataMod.default }, utils: helpers, CONST: {} };
globalThis.CONST = {};
const fs = await import("fs");
const manifest = JSON.parse(fs.readFileSync(`${SYS}/system.json`, "utf8"));
const { modelFor } = await import(`file:///${SYS}/modules/data/models-registry.js`);

// BaseToken: bar2.attribute initial = () => game?.system.secondaryTokenAttribute || null
const bar2Attr = manifest.secondaryTokenAttribute || null;   // what a rival's bar2 becomes post-fix
const bar1Attr = "stats.wounds";                              // still set explicitly by create()

const resolve = (sys, attr) => (attr ? helpers.getProperty(sys, attr) : undefined);

for (const type of ["rival", "minion", "nemesis", "character"]) {
  const sys = new (modelFor("Actor", type))({}, { parent: null });
  // post-fix: rival & minion pass no bar2 -> manifest default; nemesis/character set stats.strain explicitly
  const b2 = ["rival", "minion"].includes(type) ? bar2Attr : "stats.strain";
  const v1 = resolve(sys, bar1Attr), v2 = resolve(sys, b2);
  const bar = (v) => (v === null || v === undefined) ? "no bar" : "BAR RENDERS";
  console.log(`${type.padEnd(10)} bar1 "${bar1Attr}" -> ${bar(v1).padEnd(11)} | bar2 "${b2}" -> ${bar(v2)}`);
}
