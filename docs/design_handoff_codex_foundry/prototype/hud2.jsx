/* ============================================================
   VARIATION 03b — "HUD II"  ·  Refined faction HUD
   No dice-roll builder. Force/Soak/Defence promoted to bold
   readouts. Minimal skills panel gains category tabs + a
   dot pool (● proficiency / ○ ability "green die").
   ============================================================ */
const { useState: useStateHud2 } = React;

const FACTIONS2 = {
  rebel:    { name: "Rebellion", accent: "#e8853a", accent2: "#ffd27a", glow: "rgba(232,133,58,.18)" },
  imperial: { name: "Empire",    accent: "#c8362a", accent2: "#ff7a6e", glow: "rgba(200,54,42,.18)" },
  bounty:   { name: "Bounty",    accent: "#3fae7a", accent2: "#8ff0c0", glow: "rgba(63,174,122,.16)" },
  jedi:     { name: "Order",     accent: "#4a90d9", accent2: "#9ec9ff", glow: "rgba(74,144,217,.18)" },
};
const h2 = { bg: "#0a0c0f", panel: "#12161b", panel2: "#181d24", panel3: "#212a32",
  line: "#252d36", ink: "#e9eef2", dim: "#8794a0", faint: "#566069", abilityDie: "#f2f5f8" };

function H2Hex({ name, value, accent }) {
  return (
    <div style={{ position: "relative", width: 82, height: 90 }}>
      <div style={{ position: "absolute", inset: 0, background: accent,
        clipPath: "polygon(25% 2%, 75% 2%, 100% 50%, 75% 98%, 25% 98%, 0% 50%)" }}></div>
      <div style={{ position: "absolute", inset: 3, background: h2.panel2,
        clipPath: "polygon(25% 2%, 75% 2%, 100% 50%, 75% 98%, 25% 98%, 0% 50%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 28, color: h2.ink, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 7.5, letterSpacing: 1.5, color: accent, marginTop: 2, fontFamily: "Orbitron", fontWeight: 700 }}>{window.SWFFG.ABBR[name]}</span>
      </div>
    </div>
  );
}

function H2Vital({ label, cur, max, accent }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9.5, letterSpacing: 1.5, color: h2.dim, fontFamily: "Orbitron", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 13, color: h2.ink }}>{cur}<span style={{ color: h2.faint }}>/{max}</span></span>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 9, transform: "skewX(-18deg)",
            background: i >= cur ? accent : h2.line,
            boxShadow: i >= cur ? "0 0 6px " + accent + "66" : "none" }}></div>
        ))}
      </div>
    </div>
  );
}

/* prominent defensive readout badge */
function H2Badge({ label, value, accent, big }) {
  return (
    <div style={{ flex: 1, background: h2.panel2, border: "1px solid " + h2.line, position: "relative",
      padding: "10px 12px", clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: accent }}></div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: h2.dim, fontFamily: "Orbitron", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: big ? 30 : 24, color: accent, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* dot pool: ● proficiency (solid accent) + ○ ability (white ring) */
function H2Pool({ skill, accent }) {
  const p = window.SWFFG.pool(skill);
  if (p.total === 0) return <span style={{ color: h2.faint, fontSize: 11 }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 2.5, alignItems: "center" }}>
      {Array.from({ length: p.proficiency }).map((_, i) => (
        <span key={"p" + i} style={{ width: 9, height: 9, borderRadius: "50%", background: accent }}></span>
      ))}
      {Array.from({ length: p.ability }).map((_, i) => (
        <span key={"a" + i} style={{ width: 9, height: 9, borderRadius: "50%",
          border: "1.5px solid " + h2.abilityDie, boxSizing: "border-box" }}></span>
      ))}
    </span>
  );
}

function HudSheet2() {
  const C = window.SWFFG.CHAR;
  const S = window.SWFFG;
  const [fk, setFk] = useStateHud2("bounty");
  const [cat, setCat] = useStateHud2("Combat");
  const faction = FACTIONS2[fk];
  const cats = ["Combat", "General", "Social", "Knowledge"];

  return (
    <div style={{ width: 1000, height: 1020, background: h2.bg, color: h2.ink, fontFamily: "Signika, sans-serif",
      padding: 16, position: "relative", overflow: "hidden",
      backgroundImage: `radial-gradient(700px 420px at 12% -8%, ${faction.glow}, transparent 60%),
        radial-gradient(700px 500px at 110% 110%, ${faction.glow}, transparent 60%)` }}>

      {/* faction switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
        <div style={{ fontSize: 9.5, letterSpacing: 3, color: h2.faint, fontFamily: "Orbitron", fontWeight: 600 }}>ALLEGIANCE THEME</div>
        <div style={{ display: "flex", gap: 4 }}>
          {Object.entries(FACTIONS2).map(([k, f]) => (
            <button key={k} onClick={() => setFk(k)} style={{
              background: fk === k ? f.accent : "transparent", color: fk === k ? "#0a0c0f" : h2.dim,
              border: "1px solid " + (fk === k ? f.accent : h2.line), cursor: "pointer",
              fontFamily: "Orbitron", fontWeight: 700, fontSize: 10, letterSpacing: 1, padding: "6px 20px",
              textTransform: "uppercase", textAlign: "center", display: "inline-flex", alignItems: "center",
              justifyContent: "center", lineHeight: 1, clipPath: "polygon(9px 0,100% 0,calc(100% - 9px) 100%,0 100%)" }}>{f.name}</button>
          ))}
        </div>
      </div>

      {/* header */}
      <div style={{ display: "flex", gap: 14, marginBottom: 13 }}>
        <image-slot id="hud2-portrait" shape="rect"
          style={{ width: 104, height: 116, flex: "none", clipPath: "polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)", border: "1px solid " + faction.accent }}
          placeholder="Portrait"></image-slot>
        <div style={{ flex: 1, background: h2.panel, border: "1px solid " + h2.line, padding: "12px 18px",
          clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: faction.accent }}></div>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 30, letterSpacing: 1.5, textTransform: "uppercase", lineHeight: 1 }}>{C.name}</div>
          <div style={{ fontSize: 11.5, color: faction.accent2, letterSpacing: 2, marginTop: 5, fontFamily: "Orbitron", fontWeight: 500 }}>{C.archetype.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 22, marginTop: 11 }}>
            <H2Meta k="Credits" v={C.credits.toLocaleString()} c={faction.accent2} />
            <H2Meta k="XP" v={C.xp.available + " / " + C.xp.total} c={faction.accent2} />
            <H2Meta k="Obligation" v={C.obligations.reduce((a, o) => a + o.magnitude, 0)} c={faction.accent2} />
            <H2Meta k="Encumbrance" v={C.derived.encumbrance + " / " + C.derived.encumbranceMax} c={faction.accent2} />
          </div>
        </div>
      </div>

      {/* hex cluster + vitals */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12,
        background: h2.panel, border: "1px solid " + h2.line, padding: "12px 16px",
        clipPath: "polygon(0 0,100% 0,100% 100%,16px 100%,0 calc(100% - 16px))" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(C.characteristics).map(([n, v]) => <H2Hex key={n} name={n} value={v} accent={faction.accent} />)}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13, paddingLeft: 6 }}>
          <H2Vital label="Wounds" cur={C.derived.woundCurrent} max={C.derived.woundThreshold} accent={faction.accent} />
          <H2Vital label="Strain" cur={C.derived.strainCurrent} max={C.derived.strainThreshold} accent={faction.accent2} />
        </div>
      </div>

      {/* PROMINENT defensive readouts */}
      <div style={{ display: "flex", gap: 8, marginBottom: 13 }}>
        <H2Badge label="Soak" value={C.derived.soak} accent={faction.accent} big />
        <H2Badge label="Defence · Ranged" value={C.derived.defenceRanged} accent={faction.accent} />
        <H2Badge label="Defence · Melee" value={C.derived.defenceMelee} accent={faction.accent} />
        <H2Badge label="Force Rating" value={C.forceRating} accent={faction.accent2} big />
      </div>

      {/* main: skills (tabs+dots) | loadout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* skills */}
        <div style={{ background: h2.panel, border: "1px solid " + h2.line, padding: 13 }}>
          <div style={{ display: "flex", gap: 3, marginBottom: 11 }}>
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} style={{ flex: 1, cursor: "pointer",
                background: cat === c ? faction.accent : "transparent", color: cat === c ? "#0a0c0f" : h2.dim,
                border: "1px solid " + (cat === c ? faction.accent : h2.line),
                fontFamily: "Orbitron", fontWeight: 700, fontSize: 9, letterSpacing: .5, padding: "7px 2px",
                textTransform: "uppercase", textAlign: "center", display: "inline-flex", alignItems: "center",
                justifyContent: "center", lineHeight: 1 }}>{c}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {S.SKILL_GROUPS[cat].map((sk) => {
              const career = S.isCareer(sk);
              return (
                <div key={sk} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "4px 9px", borderLeft: "2px solid " + (career ? faction.accent : "transparent"),
                  background: career ? "rgba(255,255,255,.03)" : "transparent" }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12.5, color: h2.ink }}>{sk.replace("Knowledge: ", "")}</span>
                    <span style={{ fontSize: 8, color: h2.faint, fontFamily: "Orbitron" }}>{S.ABBR[S.CHAR_OF[sk]]}</span>
                  </span>
                  <H2Pool skill={sk} accent={faction.accent} />
                </div>
              );
            })}
          </div>
          {/* legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 11, paddingTop: 10, borderTop: "1px solid " + h2.line, fontSize: 9.5, color: h2.faint }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: faction.accent }}></span> Proficiency die</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid " + h2.abilityDie, boxSizing: "border-box" }}></span> Ability die</span>
          </div>
        </div>

        {/* loadout — weapons + talents (expanded) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: h2.panel, border: "1px solid " + h2.line, padding: 13 }}>
            <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 10, letterSpacing: 2, color: faction.accent, textTransform: "uppercase", marginBottom: 9 }}>Weapons</div>
            {C.weapons.map((w) => (
              <div key={w.name} style={{ background: h2.panel2, border: "1px solid " + h2.line, borderLeft: "3px solid " + faction.accent,
                padding: "8px 11px", marginBottom: 7, display: "flex", gap: 11, alignItems: "flex-start" }}>
                <ItemIcon size={42} tone="dark" accent={faction.accent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12.5 }}>{w.name}</span>
                    <span style={{ fontSize: 10, color: h2.dim }}>{w.skill}</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center" }}>
                    {[["DAM", w.dam], ["CRIT", w.crit], ["RANGE", w.range]].map(([k, v]) => (
                      <span key={k}><span style={{ fontSize: 8, color: h2.faint, letterSpacing: 1 }}>{k} </span>
                        <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12, color: faction.accent2 }}>{v}</span></span>
                    ))}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      {w.special.map((s) => <span key={s} style={{ fontSize: 8.5, color: h2.dim, background: h2.panel3, borderRadius: 8, padding: "3px 9px", display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{s}</span>)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: h2.panel, border: "1px solid " + h2.line, padding: 13, flex: 1 }}>
            <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 10, letterSpacing: 2, color: faction.accent, textTransform: "uppercase", marginBottom: 9 }}>Talents</div>
            {C.talents.map((t) => (
              <div key={t.name} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid " + h2.line }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11.5 }}>{t.name}{t.ranked ? " " + t.rank : ""}</span>
                  <span style={{ fontSize: 8, color: t.act === "Passive" ? h2.faint : faction.accent2, letterSpacing: 1, textTransform: "uppercase" }}>T{t.tier} · {t.act}</span>
                </div>
                <div style={{ fontSize: 10.5, color: h2.dim, marginTop: 3, lineHeight: 1.4 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function H2Meta({ k, v, c }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, letterSpacing: 1.5, color: h2.faint, textTransform: "uppercase" }}>{k}</div>
      <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 15, color: c }}>{v}</div>
    </div>
  );
}

window.HudSheet2 = HudSheet2;
