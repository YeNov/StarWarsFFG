/**
 * Every DISTINCT before->after pair per coerced path, so lossy cases can't hide
 * behind a representative sample. Flags anything where the coercion loses
 * information (NaN/fallback, or a value that doesn't round-trip).
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
globalThis.logger = console; // fallback path logs through this
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
const SKIP = /description|biography|longDesc|special\.value|features|notes/;

const pairs = new Map(); // type|path -> Map("before->after" -> {n, names:[]})
for (const arg of process.argv.slice(2)) {
  const db = new ClassicLevel(arg, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  for await (const [, doc] of db.iterator()) {
    const docName = modelFor("Item", doc?.type) ? "Item" : (modelFor("Actor", doc?.type) ? "Actor" : null);
    if (!docName || !doc.system) continue;
    let out;
    try { out = new (modelFor(docName, doc.type))(structuredClone(doc.system), { parent: null, strict: false, fallback: true }).toObject(); }
    catch { continue; }
    const before = leaves(doc.system), after = leaves(out);
    for (const [p, v] of before) {
      if (SKIP.test(p) || !after.has(p)) continue;
      const w = after.get(p);
      if (JSON.stringify(v) === JSON.stringify(w)) continue;
      const key = `${doc.type}|${p}`;
      const m = pairs.get(key) ?? new Map();
      const pk = `${JSON.stringify(v)} -> ${JSON.stringify(w)}`;
      const rec = m.get(pk) ?? { n: 0, names: [] };
      rec.n++; if (rec.names.length < 2) rec.names.push(String(doc.name).slice(0, 34));
      m.set(pk, rec); pairs.set(key, m);
    }
  }
  await db.close();
}

const lossy = [];
for (const [key, m] of [...pairs.entries()].sort()) {
  const [type, path] = key.split("|");
  const total = [...m.values()].reduce((a, r) => a + r.n, 0);
  console.log(`\n${type} . ${path}   (${total} docs, ${m.size} distinct transformation${m.size > 1 ? "s" : ""})`);
  for (const [pk, rec] of [...m.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const [b, a] = pk.split(" -> ");
    // lossy = the coerced value does not represent the original
    const bv = JSON.parse(b);
    const av = a === "null" ? null : JSON.parse(a);
    const roundTrips = String(av) === String(bv).trim() || (typeof bv === "string" && Number(bv) === av);
    const flag = roundTrips ? "" : "   <-- INFORMATION CHANGED";
    if (!roundTrips) lossy.push(`${type}.${path}: ${pk} (${rec.n} docs, e.g. "${rec.names[0]}")`);
    console.log(`   ${String(rec.n).padStart(4)}x  ${pk}${flag}`);
  }
}
console.log(`\n${"=".repeat(70)}`);
if (lossy.length) { console.log("NOT a clean string->number normalisation:"); for (const l of lossy) console.log("  " + l); }
else console.log("Every coercion round-trips: the number means exactly what the string said.");
