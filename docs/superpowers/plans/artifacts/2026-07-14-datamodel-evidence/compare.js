/**
 * Per-document, full-subtree comparison: pre-cutover backup vs live world.
 * Finds any leaf path present in the backup but ABSENT in the live record.
 * This is the definitive data-loss test (offline, raw, no Foundry).
 */
const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");

function leaves(obj, prefix = "", out = new Map()) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) { out.set(prefix, obj); return out; }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) leaves(v, p, out);
    else out.set(p, v);
  }
  return out;
}

async function load(dbPath) {
  const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  const map = new Map();
  for await (const [key, doc] of db.iterator()) if (doc?._id && doc.system) map.set(doc._id, doc);
  await db.close();
  return map;
}

(async () => {
  const [bakDir, liveDir] = process.argv.slice(2);
  const results = { comparedDocs: 0, docsWithLostPaths: 0, lostPaths: [], onlyInLive: 0, missingDocs: 0 };
  for (const col of ["actors", "items"]) {
    const bak = await load(`${bakDir}/${col}`);
    const live = await load(`${liveDir}/${col}`);
    for (const [id, bdoc] of bak) {
      const ldoc = live.get(id);
      if (!ldoc) { results.missingDocs++; continue; }
      results.comparedDocs++;
      const bl = leaves(bdoc.system), ll = leaves(ldoc.system);
      const lost = [];
      for (const p of bl.keys()) if (!ll.has(p)) lost.push(p);
      if (lost.length) {
        results.docsWithLostPaths++;
        results.lostPaths.push({
          col, id, name: bdoc.name, type: bdoc.type,
          liveModified: ldoc._stats?.modifiedTime ? new Date(ldoc._stats.modifiedTime).toISOString().slice(0, 16) : null,
          lost: lost.map((p) => ({ path: p, wasValue: bl.get(p) })),
        });
      }
    }
    for (const id of live.keys()) if (!bak.has(id)) results.onlyInLive++;
  }
  console.log("=== PRE-CUTOVER BACKUP (2026-07-04) vs LIVE V13 WORLD ===");
  console.log(`Docs compared (present in both): ${results.comparedDocs}`);
  console.log(`Docs created after backup (live only, no baseline): ${results.onlyInLive}`);
  console.log(`Docs deleted since backup: ${results.missingDocs}`);
  console.log(`\n>>> Docs with ANY system path lost: ${results.docsWithLostPaths}`);
  for (const d of results.lostPaths) {
    console.log(`\n  ${d.type} "${d.name}" (${d.id}) [live saved: ${d.liveModified}]`);
    for (const l of d.lost.slice(0, 12)) console.log(`      LOST ${l.path} = ${JSON.stringify(l.wasValue)}`);
    if (d.lost.length > 12) console.log(`      ... +${d.lost.length - 12} more`);
  }
  require("fs").writeFileSync(__dirname + "/compare-results.json", JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
