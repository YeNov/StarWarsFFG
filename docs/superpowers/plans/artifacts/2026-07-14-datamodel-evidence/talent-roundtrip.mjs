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
const Talent = modelFor("Item", "talent");

let shown = 0, checked = 0, bad = 0;
for (const p of process.argv.slice(2)) {
  let db; try { db = new ClassicLevel(p, { valueEncoding: "json", keyEncoding: "utf8" }); await db.open(); } catch { continue; }
  for await (const [, d] of db.iterator()) {
    if (d?.type !== "talent" || !d.system?.trees?.length) continue;
    checked++;
    const m = new Talent(structuredClone(d.system), { parent: null });
    const back = m.toObject().trees;
    const ok = JSON.stringify(back) === JSON.stringify(d.system.trees);
    // the actual consumer: item-sheet-ffg.js does system.trees.includes(spec.id)
    const memberOk = d.system.trees.every((id) => m.trees.includes(id));
    if (!ok || !memberOk) { bad++; console.log(`  FAIL "${d.name}" ${JSON.stringify(d.system.trees)} -> ${JSON.stringify(back)}`); }
    else if (shown < 3) { console.log(`  OK   "${String(d.name).slice(0,26).padEnd(26)}" trees=${JSON.stringify(d.system.trees)}  .includes(id) still true`); shown++; }
  }
  await db.close();
}
console.log(`\n  talents with non-empty trees checked: ${checked} | round-trip failures: ${bad}`);
