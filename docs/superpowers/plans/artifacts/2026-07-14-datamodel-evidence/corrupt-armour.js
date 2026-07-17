/**
 * List the armour records whose stored defence/soak value is non-numeric, with
 * enough identity to actually find them: LevelDB key, item id, parent actor,
 * and a resolvable UUID.
 */
const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");
const PACK = process.argv[2];
const PACK_ID = process.argv[3] || "yehors-sw-ffg-shared-data.v12-export-actors";

const bad = (v) => v !== undefined && (typeof v !== "number") && !Number.isFinite(Number(v));

(async () => {
  const db = new ClassicLevel(PACK, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();

  // First pass: map actor id -> actor name (top-level !actors! keys)
  const actors = new Map();
  for await (const [k, v] of db.iterator()) {
    if (/^!actors![^.]+$/.test(k) && v?.name) actors.set(v._id, v.name);
  }

  const rows = [];
  for await (const [key, doc] of db.iterator()) {
    if (doc?.type !== "armour" || !doc.system) continue;
    const d = doc.system?.defence?.value;
    const s = doc.system?.soak?.value;
    const issues = [];
    if (bad(d)) issues.push(["defence.value", d]);
    if (bad(s)) issues.push(["soak.value", s]);
    if (!issues.length) continue;
    // embedded key looks like !actors.items!<actorId>.<itemId>
    const m = key.match(/^!actors\.items!([^.]+)\.(.+)$/);
    const actorId = m?.[1] ?? null;
    rows.push({
      itemName: doc.name,
      itemId: doc._id,
      actorId,
      actorName: actorId ? (actors.get(actorId) ?? "(unknown actor)") : "(not embedded)",
      key,
      issues,
    });
  }
  await db.close();

  console.log(`Found ${rows.length} armour record(s) with a non-numeric defence/soak value\n`);
  rows.forEach((r, i) => {
    console.log(`${i + 1}. "${r.itemName}"`);
    for (const [path, val] of r.issues) {
      console.log(`     ${path} = ${JSON.stringify(val)}   (Number(${JSON.stringify(val)}) = NaN -> falls back to 0)`);
    }
    console.log(`     item id    : ${r.itemId}`);
    console.log(`     parent     : "${r.actorName}"  (${r.actorId})`);
    console.log(`     uuid       : Compendium.${PACK_ID}.Actor.${r.actorId}.Item.${r.itemId}`);
    console.log(`     leveldb key: ${r.key}\n`);
  });
})().catch((e) => { console.error(e); process.exit(1); });
