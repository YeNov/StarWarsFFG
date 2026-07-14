/**
 * End-to-end proof against REAL stored documents: with the fields declared, does
 * the prepared view (what sheets and code actually read) now show the values
 * that were sitting in the database all along?
 */
const APP = "D:/SW FFG/Portable FVTT 14/App/resources/app";
const SYS = "D:/SW FFG/Portable FVTT/Data/systems/starwarsffg";
await import(`file:///${APP}/common/primitives/_module.mjs`);
const fields = await import(`file:///${APP}/common/data/fields.mjs`);
const dataMod = await import(`file:///${APP}/common/abstract/data.mjs`);
const typeDataMod = await import(`file:///${APP}/common/abstract/type-data.mjs`);
const helpers = await import(`file:///${APP}/common/utils/helpers.mjs`);
globalThis.foundry = { data: { fields, validators: {} }, abstract: { DataModel: dataMod.default, TypeDataModel: typeDataMod.default }, utils: helpers, CONST: {} };
globalThis.CONST = {};
const { modelFor } = await import(`file:///${SYS}/modules/data/models-registry.js`);
const { ClassicLevel } = (await import("module")).createRequire(import.meta.url)(`${APP}/node_modules/classic-level`);

const SP = "C:/Users/novak/AppData/Local/Temp/claude/D--SW-FFG-Portable-FVTT-Data-systems-starwarsffg/b2b0c6fa-2fc8-4ccf-a427-ca1170a66f54/scratchpad/dbwork";
const get = (o, p) => p.split(".").reduce((c, k) => (c == null ? c : c[k]), o);

// [docName, dbPath, type, path, human label]
const CASES = [
  ["Item", `${SP}/oggdude/yn-weapons`, "weapon", "rarity.isrestricted", "restricted flag"],
  ["Item", `${SP}/oggdude/yn-weapons`, "weapon", "status", "damage condition"],
  ["Item", `${SP}/oggdude/yn-weapons`, "weapon", "skill.value", "roll skill"],
  ["Item", `${SP}/dbwork/../dbwork/v13/items`, "weapon", "rarity.isrestricted", "world weapon restricted"],
];

async function firstWithPath(dbPath, type, path) {
  const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  let found = null;
  for await (const [, doc] of db.iterator()) {
    if (doc?.type !== type || !doc.system) continue;
    const v = get(doc.system, path);
    if (v !== undefined && v !== "" && v !== false) { found = doc; break; }
    if (!found && v !== undefined) found = doc;
  }
  await db.close();
  return found;
}

console.log("Reading REAL documents from the database, constructing them through the");
console.log("registered model, and reading the prepared view a sheet would see:\n");
for (const [docName, dbPath, type, path, label] of CASES) {
  const doc = await firstWithPath(dbPath, type, path).catch(() => null);
  if (!doc) { console.log(`  (no ${type} with ${path} in ${dbPath.split("/").pop()})`); continue; }
  const Cls = modelFor(docName, type);
  const stored = get(doc.system, path);
  const prepared = get(new Cls(structuredClone(doc.system), { parent: null }), path);
  const ok = JSON.stringify(stored) === JSON.stringify(prepared);
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label.padEnd(24)} "${String(doc.name).slice(0, 22)}"`);
  console.log(`       in database : ${JSON.stringify(stored)}`);
  console.log(`       sheet reads : ${JSON.stringify(prepared)}${ok ? "" : "   <-- STILL INVISIBLE"}`);
}

// Shipweapon skill: the path that broke ship attack rolls.
const sw = await firstWithPath(`${SP}/oggdude/yn-items`, "shipweapon", "skill.value").catch(() => null);
if (sw) {
  const m = new (modelFor("Item", "shipweapon"))(structuredClone(sw.system), { parent: null });
  console.log(`\n  ship weapon roll skill "${sw.name}": database=${JSON.stringify(get(sw.system, "skill.value"))} sheet reads=${JSON.stringify(m.skill?.value)}`);
}
