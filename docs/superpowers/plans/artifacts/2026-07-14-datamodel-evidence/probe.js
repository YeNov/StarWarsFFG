// Offline LevelDB probe: reads Foundry world/pack databases WITHOUT booting Foundry.
// Read-only in intent; run against working COPIES only, never live data or the snapshot.
const CL = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");
const { ClassicLevel } = CL;

const dbPath = process.argv[2];

(async () => {
  const db = new ClassicLevel(dbPath, { valueEncoding: "json", keyEncoding: "utf8" });
  await db.open();
  let n = 0;
  const keys = [];
  for await (const [k, v] of db.iterator()) {
    if (n < 5) keys.push({ key: k, type: v?.type, name: v?.name, systemKeys: v?.system ? Object.keys(v.system) : null });
    n++;
  }
  console.log(JSON.stringify({ dbPath, totalKeys: n, sample: keys }, null, 2));
  await db.close();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
