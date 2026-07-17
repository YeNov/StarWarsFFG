/**
 * Offline raw-source audit for the DataModel undeclared-paths defect.
 *
 * Reads Foundry LevelDB collections directly (no Foundry boot, no registered
 * schemas), so what it sees IS the persisted database record. Run against
 * working COPIES only.
 *
 * Usage: node audit.js <dbPath> [<dbPath> ...]
 */
const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");

const has = (obj, path) => {
  let cur = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in cur)) return false;
    cur = cur[part];
  }
  return true;
};

// Findings inventory: type -> [F-label, path]
const BASIC_ITEMS = ["gear", "weapon", "armour", "shipweapon", "shipattachment", "itemattachment", "background", "obligation", "motivation"];
const CHECKS = {};
const add = (types, label, path) => { for (const t of types) (CHECKS[t] ??= []).push([label, path]); };

add(BASIC_ITEMS, "F1", "rarity.isrestricted");
add(["weapon", "armour", "shipweapon"], "F2", "status");
add(["character", "minion", "nemesis", "rival"], "F3", "stats.medical.uses");
for (const k of ["strength", "flaw", "desire", "fear"]) add(["character", "nemesis", "rival"], "F4", `motivation.${k}`);
for (const k of ["age", "build", "eyes", "gender", "hair", "height", "notes", "motivation1", "motivation2"]) {
  add(["character", "nemesis", "rival"], "F5", `general.${k}`);
}
add(["character"], "F6", "obligationlist");
add(["character"], "F6", "dutylist");
add(["vehicle"], "F7", "stats.hyperdrive.backup");
for (const p of ["description", "attributes", "price.value", "rarity.isrestricted"]) add(["homesteadupgrade"], "F8", p);
add(["forcepower", "specialization", "signatureability"], "F9", "isEditing");
add(["character", "minion"], "F10", "stats.wounds.real_value");
add(["character", "minion"], "F10", "stats.strain.real_value");

async function auditDb(dbPath, results) {
  const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  for await (const [key, doc] of db.iterator()) {
    if (!doc || typeof doc !== "object" || !doc.type || !doc.system) continue;
    const checks = CHECKS[doc.type];
    if (!checks) continue;
    const present = [], absent = [];
    for (const [label, path] of checks) {
      (has(doc.system, path) ? present : absent).push(`${label}:${path}`);
    }
    results.push({
      db: dbPath.split(/[\\/]/).slice(-2).join("/"),
      key, id: doc._id, name: doc.name, type: doc.type,
      modifiedTime: doc._stats?.modifiedTime ?? null,
      present, absent,
    });
  }
  await db.close();
}

(async () => {
  const results = [];
  for (const p of process.argv.slice(2)) {
    try { await auditDb(p, results); }
    catch (e) { console.error(`ERR ${p}: ${e.message}`); }
  }

  // Summarise per db + type + path
  const summary = {};
  for (const r of results) {
    for (const item of [...r.present.map((x) => [x, "present"]), ...r.absent.map((x) => [x, "absent"])]) {
      const k = `${r.db} | ${r.type} | ${item[0]}`;
      summary[k] ??= { present: 0, absent: 0 };
      summary[k][item[1]]++;
    }
  }
  console.log("=== PER-PATH SUMMARY (raw persisted data) ===");
  for (const k of Object.keys(summary).sort()) {
    const s = summary[k];
    const flag = s.absent > 0 ? (s.present > 0 ? "  <-- MIXED" : "  <-- ALL ABSENT") : "";
    console.log(`${k.padEnd(72)} present=${String(s.present).padStart(4)} absent=${String(s.absent).padStart(4)}${flag}`);
  }
  console.log(`\n=== DOCS SCANNED: ${results.length} ===`);
  require("fs").writeFileSync(__dirname + "/audit-results.json", JSON.stringify(results, null, 1));
  console.log("full results -> audit-results.json");
})().catch((e) => { console.error(e); process.exit(1); });
