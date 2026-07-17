const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");
(async () => {
  const dist = new Map(); let total = 0, withStrain = 0;
  for (const p of process.argv.slice(2)) {
    let db; try { db = new ClassicLevel(p, { valueEncoding: "json", keyEncoding: "utf8" }); await db.open(); } catch { continue; }
    for await (const [, d] of db.iterator()) {
      if (d?.type !== "rival") continue;
      total++;
      const s = d.system?.stats?.strain;
      if (!s) continue;
      withStrain++;
      const k = `value=${JSON.stringify(s.value)} min=${JSON.stringify(s.min)} max=${JSON.stringify(s.max)}`;
      dist.set(k, (dist.get(k) || 0) + 1);
    }
    await db.close();
  }
  console.log(`rivals scanned: ${total} | storing stats.strain: ${withStrain}\n`);
  console.log("distinct stored strain shapes:");
  for (const [k, n] of [...dist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`  ${String(n).padStart(4)}x  ${k}`);
})();
