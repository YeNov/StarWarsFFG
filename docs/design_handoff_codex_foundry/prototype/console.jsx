/* ============================================================
   VARIATION 04 — "CONSOLE"  ·  Retro CRT terminal readout
   Divergent visual: amber phosphor, monospace, scanlines.
   Keeps FFG dice glyphs + notch accents.
   ============================================================ */
const { useState: useStateCon } = React;

const con = {
  bg: "#070b09", frame: "#0c1310", panel: "#0a110d", line: "#1c2a22",
  amber: "#ffb454", amberDim: "#9c6e2e", green: "#5fe39a", greenDim: "#2f6b4c",
  ink: "#cfe8d6", dim: "#6f8a78", mono: 'ui-monospace, "SFMono-Regular", "Courier New", monospace',
};

function ConBar({ cur, max, color }) {
  const filled = max - cur; // remaining
  const segs = 16;
  const on = Math.round((filled / max) * segs);
  return (
    <span style={{ fontFamily: con.mono, letterSpacing: 1, color }}>
      [{Array.from({ length: segs }).map((_, i) => (
        <span key={i} style={{ color: i < on ? color : con.line }}>{i < on ? "█" : "░"}</span>
      ))}]
    </span>
  );
}

function ConHead({ children }) {
  return (
    <div style={{ fontFamily: con.mono, color: con.amber, fontSize: 11, letterSpacing: 2, margin: "0 0 8px",
      display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase" }}>
      <span style={{ color: con.amberDim }}>{"//"}</span>{children}
      <span style={{ flex: 1, borderBottom: "1px dashed " + con.line, marginLeft: 4 }}></span>
    </div>
  );
}

function ConPool({ skill }) {
  const p = window.SWFFG.pool(skill);
  if (!p.total) return <span style={{ color: con.dim }}>· · ·</span>;
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: p.proficiency }).map((_, i) => <span key={"p" + i} style={{ width: 8, height: 8, borderRadius: "50%", background: con.amber, boxShadow: "0 0 4px " + con.amber }}></span>)}
      {Array.from({ length: p.ability }).map((_, i) => <span key={"a" + i} style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid " + con.green, boxSizing: "border-box" }}></span>)}
    </span>
  );
}

function ConsoleSheet() {
  const C = window.SWFFG.CHAR;
  const S = window.SWFFG;
  const G = S.SKILL_GROUPS;
  const D = C.derived;
  const [blink, setBlink] = useStateCon(true);
  React.useEffect(() => { const t = setInterval(() => setBlink((b) => !b), 600); return () => clearInterval(t); }, []);

  const Row = ({ sk }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2.5px 0", fontFamily: con.mono, fontSize: 11.5 }}>
      <span style={{ color: S.isCareer(sk) ? con.amber : con.ink, width: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {S.isCareer(sk) ? "›" : " "} {sk.replace("Knowledge: ", "").toUpperCase()}</span>
      <span style={{ flex: 1, borderBottom: "1px dotted " + con.line, opacity: .6 }}></span>
      <span style={{ color: con.dim, fontSize: 9 }}>{S.ABBR[S.CHAR_OF[sk]]}</span>
      <span style={{ width: 64, textAlign: "right" }}><ConPool skill={sk} /></span>
    </div>
  );

  return (
    <div style={{ width: 1000, height: 920, background: con.bg, color: con.ink, fontFamily: con.mono,
      padding: 16, position: "relative", overflow: "hidden" }}>
      {/* terminal frame */}
      <div style={{ border: "1px solid " + con.line, background: con.frame, height: "100%", display: "flex",
        flexDirection: "column", boxShadow: "inset 0 0 90px rgba(95,227,154,.05)" }}>
        {/* title bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid " + con.line }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: con.amber }}></span>
          <span style={{ color: con.amber, fontSize: 11, letterSpacing: 1 }}>CHARACTER.DAT</span>
          <span style={{ color: con.dim, fontSize: 11 }}>— EotE field terminal v2.3</span>
          <span style={{ marginLeft: "auto", color: con.dim, fontSize: 10 }}>CONN: SECURE ◍</span>
        </div>

        {/* boot line */}
        <div style={{ padding: "12px 16px 6px", fontSize: 13, color: con.green }}>
          <span style={{ color: con.amberDim }}>kessa@outer-rim:~$</span> load profile
          <span style={{ display: "inline-block", width: 9, height: 15, marginLeft: 6, verticalAlign: "-2px",
            background: blink ? con.green : "transparent" }}></span>
        </div>
        <div style={{ padding: "0 16px", display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ color: con.amber, fontSize: 30, letterSpacing: 2, textShadow: "0 0 12px " + con.amber + "66" }}>{C.name.toUpperCase()}</span>
          <span style={{ color: con.dim, fontSize: 12, letterSpacing: 1 }}>// {C.archetype.toUpperCase()} // FR {C.forceRating}</span>
        </div>

        {/* two columns */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, minHeight: 0, marginTop: 12 }}>
          {/* left */}
          <div style={{ padding: "4px 16px 16px", borderRight: "1px solid " + con.line, overflow: "hidden" }}>
            <ConHead>characteristics</ConHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 16 }}>
              {Object.entries(C.characteristics).map(([n, v]) => (
                <div key={n} style={{ border: "1px solid " + con.line, padding: "7px 9px", display: "flex",
                  justifyContent: "space-between", alignItems: "center", background: con.panel }}>
                  <span style={{ color: con.dim, fontSize: 10, letterSpacing: 1 }}>{S.ABBR[n]}</span>
                  <span style={{ color: con.amber, fontSize: 22, fontWeight: 700, textShadow: "0 0 8px " + con.amber + "55" }}>{v}</span>
                </div>
              ))}
            </div>

            <ConHead>vitals</ConHead>
            <div style={{ fontSize: 11.5, lineHeight: 2, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}><span style={{ width: 70, color: con.dim }}>WOUNDS</span><ConBar cur={D.woundCurrent} max={D.woundThreshold} color={con.amber} /><span style={{ color: con.ink }}> {D.woundCurrent}/{D.woundThreshold}</span></div>
              <div style={{ display: "flex", gap: 8 }}><span style={{ width: 70, color: con.dim }}>STRAIN</span><ConBar cur={D.strainCurrent} max={D.strainThreshold} color={con.green} /><span style={{ color: con.ink }}> {D.strainCurrent}/{D.strainThreshold}</span></div>
              <div style={{ display: "flex", gap: 16, marginTop: 4, color: con.ink }}>
                <span>SOAK <b style={{ color: con.amber }}>{D.soak}</b></span>
                <span>DEF <b style={{ color: con.amber }}>{D.defenceRanged}/{D.defenceMelee}</b></span>
                <span>ENC <b style={{ color: con.amber }}>{D.encumbrance}/{D.encumbranceMax}</b></span>
                <span>CR <b style={{ color: con.amber }}>{C.credits.toLocaleString()}</b></span>
              </div>
            </div>

            <ConHead>skills · trained ›</ConHead>
            <div>
              {[...G.Combat, ...G.General].filter((s) => S.skillRank(s) > 0 || S.isCareer(s)).map((sk) => <Row key={sk} sk={sk} />)}
              {[...G.Social, ...G.Knowledge].filter((s) => S.skillRank(s) > 0 || S.isCareer(s)).map((sk) => <Row key={sk} sk={sk} />)}
            </div>
            <div style={{ marginTop: 8, fontSize: 9.5, color: con.dim, display: "flex", gap: 14 }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: con.amber, verticalAlign: "-1px" }}></span> PROF</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "1.5px solid " + con.green, boxSizing: "border-box", verticalAlign: "-1px" }}></span> ABILITY</span>
            </div>
          </div>

          {/* right */}
          <div style={{ padding: "4px 16px 16px", overflow: "hidden" }}>
            <ConHead>loadout</ConHead>
            {C.weapons.map((w) => (
              <div key={w.name} style={{ border: "1px solid " + con.line, background: con.panel, padding: 10, marginBottom: 8,
                display: "flex", gap: 10, alignItems: "center" }}>
                <ItemIcon size={40} tone="dark" accent={con.amberDim} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: con.amber, fontSize: 12.5, letterSpacing: .5 }}>{w.name.toUpperCase()}</div>
                  <div style={{ color: con.dim, fontSize: 10.5, marginTop: 3 }}>DAM {w.dam} · CRIT {w.crit} · {w.range} · {w.special.join(", ")}</div>
                </div>
                <ConPool skill={w.skill} />
              </div>
            ))}
            <div style={{ border: "1px solid " + con.line, background: con.panel, padding: "7px 10px", marginBottom: 16,
              fontSize: 11, color: con.ink, display: "flex", gap: 10, alignItems: "center" }}>
              <ItemIcon size={28} tone="dark" accent={con.amberDim} />
              {C.armor.name.toUpperCase()} · SOAK +{C.armor.soak} · DEF +{C.armor.defence}
            </div>

            <ConHead>talents</ConHead>
            {C.talents.map((t) => (
              <div key={t.name} style={{ fontSize: 11, marginBottom: 7, lineHeight: 1.4 }}>
                <span style={{ color: con.amber }}>› {t.name.toUpperCase()}{t.ranked ? " " + t.rank : ""}</span>
                <span style={{ color: con.dim }}> [{t.act}]</span>
                <div style={{ color: con.ink, opacity: .85, paddingLeft: 12 }}>{t.desc}</div>
              </div>
            ))}

            <ConHead>obligation</ConHead>
            {C.obligations.map((o) => (
              <div key={o.type} style={{ fontSize: 11, color: con.ink, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: con.dim }}>{o.type.toUpperCase()} — {o.note}</span><span style={{ color: con.amber }}>{o.magnitude}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* scanline overlay */}
      <div style={{ position: "absolute", inset: 16, pointerEvents: "none",
        background: "repeating-linear-gradient(rgba(0,0,0,.18) 0 1px, transparent 1px 3px)" }}></div>
      <div style={{ position: "absolute", inset: 16, pointerEvents: "none",
        background: "radial-gradient(120% 120% at 50% 50%, transparent 60%, rgba(0,0,0,.5))" }}></div>
    </div>
  );
}

window.ConsoleSheet = ConsoleSheet;
