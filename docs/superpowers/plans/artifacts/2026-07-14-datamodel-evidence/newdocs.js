// Do documents CREATED after the cutover still carry undeclared fields?
// (Tests whether create/import payloads survive client-side cleaning.)
const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");
const CUTOVER = Date.parse("2026-07-08T00:00:00Z");
const has = (o, p) => { let c = o; for (const k of p.split(".")) { if (c === null || typeof c !== "object" || !(k in c)) return false; c = c[k]; } return true; };
const PROBE = { gear: "rarity.isrestricted", weapon: "rarity.isrestricted", armour: "rarity.isrestricted", shipweapon: "rarity.isrestricted" };

(async () => {
  const rows = [];
  for (const dbPath of process.argv.slice(2)) {
    const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
    await db.open();
    for await (const [, doc] of db.iterator()) {
      const path = PROBE[doc?.type];
      if (!path || !doc.system) continue;
      const ct = doc._stats?.createdTime;
      if (!ct || ct <= CUTOVER) continue;
      rows.push({ name: doc.name, type: doc.type, created: new Date(ct).toISOString().slice(0, 16), hasField: has(doc.system, path) });
    }
    await db.close();
  }
  rows.sort((a, b) => a.created.localeCompare(b.created));
  console.log(`=== Docs CREATED after cutover: ${rows.length} ===`);
  for (const r of rows) console.log(`${r.created}  ${r.hasField ? "HAS  " : "NO   "} rarity.isrestricted  ${r.type.padEnd(10)} ${String(r.name).slice(0, 44)}`);
  console.log(`\nwith field: ${rows.filter((r) => r.hasField).length} / ${rows.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
