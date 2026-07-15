const { ClassicLevel } = require("D:/SW FFG/Portable FVTT 14/App/resources/app/node_modules/classic-level");
(async () => {
  const m = new Map();
  for (const p of process.argv.slice(2)) {
    let db; try { db = new ClassicLevel(p, { valueEncoding: "json", keyEncoding: "utf8" }); await db.open(); } catch { continue; }
    for await (const [k, d] of db.iterator()) {
      if (!/^!actors![^.]+$/.test(k) || !d?.type) continue;
      const pt = d.prototypeToken || {};
      const key = `${d.type.padEnd(10)} bar1=${JSON.stringify(pt.bar1?.attribute)} bar2=${JSON.stringify(pt.bar2?.attribute)}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
    await db.close();
  }
  console.log("stored prototypeToken bars, by actor type:\n");
  for (const [k, n] of [...m.entries()].sort()) console.log(`  ${String(n).padStart(4)}x  ${k}`);
})();
