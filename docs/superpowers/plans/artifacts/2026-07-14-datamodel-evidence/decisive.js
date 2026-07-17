/**
 * DECISIVE TEST: does a document SAVED AFTER the cutover retain its
 * undeclared-in-template.json fields?
 *
 * If yes -> the pruning/data-loss premise is WRONG.
 * If no  -> pruning is real and those docs are damaged.
 */
const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");

const CUTOVER = Date.parse("2026-07-08T00:00:00Z"); // generous: DataModel commits ~07-09
const has = (o, p) => { let c = o; for (const k of p.split(".")) { if (c === null || typeof c !== "object" || !(k in c)) return false; c = c[k]; } return true; };

const PROBE = {
  gear: "rarity.isrestricted", weapon: "rarity.isrestricted", armour: "rarity.isrestricted",
  shipweapon: "rarity.isrestricted", shipattachment: "rarity.isrestricted",
  forcepower: "isEditing", specialization: "isEditing",
};

(async () => {
  const rows = [];
  for (const dbPath of process.argv.slice(2)) {
    const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
    await db.open();
    for await (const [key, doc] of db.iterator()) {
      if (!doc?.type || !doc.system) continue;
      const path = PROBE[doc.type];
      if (!path) continue;
      const mt = doc._stats?.modifiedTime;
      if (!mt) continue;
      rows.push({ name: doc.name, type: doc.type, mt, saved: new Date(mt).toISOString().slice(0, 16), post: mt > CUTOVER, hasField: has(doc.system, path), path });
    }
    await db.close();
  }
  const post = rows.filter((r) => r.post);
  const pre = rows.filter((r) => !r.post);
  console.log(`Docs with modifiedTime: ${rows.length}`);
  console.log(`  saved BEFORE cutover (${new Date(CUTOVER).toISOString().slice(0,10)}): ${pre.length}  -> field present on ${pre.filter(r=>r.hasField).length}`);
  console.log(`  saved AFTER  cutover: ${post.length}  -> field present on ${post.filter((r) => r.hasField).length}`);
  console.log(`\n=== DOCS SAVED AFTER CUTOVER (the ones pruning would have damaged) ===`);
  for (const r of post.sort((a, b) => b.mt - a.mt).slice(0, 25)) {
    console.log(`${r.saved}  ${r.hasField ? "HAS  " : "LOST?"} ${r.path.padEnd(22)} ${r.type.padEnd(14)} ${String(r.name).slice(0, 40)}`);
  }
  const newest = rows.sort((a, b) => b.mt - a.mt)[0];
  console.log(`\nNewest saved doc overall: ${newest?.saved} (${newest?.name}) hasField=${newest?.hasField}`);
})().catch((e) => { console.error(e); process.exit(1); });
