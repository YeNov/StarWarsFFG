/**
 * The missing half of generic-audit.mjs: report leaf paths whose VALUE the model
 * changes (type coercion), not just paths it drops. A declaration cannot fix a
 * coercion, so each needs a widen-or-accept decision.
 *
 * Usage: node changed-audit.mjs <label>=<dbPath> ...
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

function leaves(obj, prefix = "", out = new Map()) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) { out.set(prefix, obj); return out; }
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) leaves(v, p, out);
    else out.set(p, v);
  }
  return out;
}

const changed = new Map(); // type|path -> {count, samples:Set, fatal}
const fatal = [];
let scanned = 0;

for (const arg of process.argv.slice(2)) {
  const [label, dbPath] = arg.split("=");
  const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  for await (const [, doc] of db.iterator()) {
    const docName = doc?.type && modelFor("Item", doc.type) ? "Item" : (modelFor("Actor", doc?.type) ? "Actor" : null);
    if (!docName || !doc.system) continue;
    const Cls = modelFor(docName, doc.type);
    scanned++;
    let out;
    try {
      // fallback:true mirrors how Foundry actually loads documents from the DB
      out = new Cls(structuredClone(doc.system), { parent: null, strict: false, fallback: true }).toObject();
    } catch (e) {
      fatal.push({ label, type: doc.type, name: doc.name, msg: String(e.message).split("\n")[0] });
      continue;
    }
    const before = leaves(doc.system), after = leaves(out);
    for (const [p, v] of before) {
      if (!after.has(p)) continue;
      const w = after.get(p);
      if (JSON.stringify(v) === JSON.stringify(w)) continue;
      const key = `${doc.type}|${p}`;
      const rec = changed.get(key) ?? { count: 0, samples: new Set() };
      rec.count++;
      if (rec.samples.size < 4) rec.samples.add(`${JSON.stringify(v)} -> ${JSON.stringify(w)}`);
      changed.set(key, rec);
    }
  }
  await db.close();
}

console.log(`=== CHANGED-VALUE AUDIT — ${scanned} docs (model loaded the way Foundry loads: non-strict + fallback) ===\n`);
if (!changed.size) console.log("No value changed. Every stored value round-trips through its field unchanged.");
const rows = [...changed.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [k, rec] of rows.slice(0, 25)) {
  const [type, path] = k.split("|");
  console.log(`${(type + " . " + path).padEnd(46)} ${String(rec.count).padStart(5)} docs`);
  for (const s of rec.samples) console.log(`      ${s}`);
}
if (rows.length > 25) console.log(`... +${rows.length - 25} more paths`);
if (fatal.length) {
  console.log(`\n=== FAILED EVEN WITH FALLBACK (${fatal.length}) ===`);
  for (const f of fatal.slice(0, 8)) console.log(`  [${f.label}] ${f.type} "${String(f.name).slice(0, 40)}": ${f.msg}`);
}
