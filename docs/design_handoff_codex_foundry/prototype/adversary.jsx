/* ============================================================
   COMPANION — ADVERSARY SHEET (Nemesis)  ·  Codex II language
   Compact NPC stat block, themeable.
   ============================================================ */
const { useState: useStateAdv } = React;
let AT = window.CDX_THEMES.empire;
const advDark = (t) => t.bg === "#0e0b0b";

function AdvHeader({ children, accent, style }) {
  return (
    <div className="notch-top" style={{ background: accent || AT.accent, color: "#fff", fontFamily: "Orbitron, sans-serif",
      fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 10px", ...style }}>{children}</div>
  );
}

function AdvChip({ label, value, derived }) {
  return <window.StatChip theme={AT} value={value} label={label} derived={derived} w={70} h={70} />;
}

function AdvStat({ label, cur, max, sub, accent, blackB }) {
  return <window.StatPanel theme={AT} label={label} accent={accent} value={{ a: cur, b: max }} sub={sub} blackB={blackB} />;
}

function CodexAdversary({ initialScheme = "empire" }) {
  const A = window.SWFFG.ADVERSARY;
  const S = window.SWFFG;
  const [scheme, setScheme] = useStateAdv(initialScheme);
  AT = window.CDX_THEMES[scheme];
  const D = A.derived;
  const trained = Object.keys(A.skills);

  return (
    <div style={{ width: 1000, background: AT.bg, color: AT.ink, fontFamily: "Signika, sans-serif", padding: 12,
      position: "relative", overflow: "hidden",
      backgroundImage: `repeating-linear-gradient(135deg, ${AT.stripe} 0 12px, transparent 12px 24px)` }}>
      <div className="glyph" style={{ position: "absolute", top: -40, right: -30, fontSize: 360, lineHeight: 1, color: AT.watermark, pointerEvents: "none", zIndex: 0 }}>a</div>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* scheme switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
          <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5, letterSpacing: 2.5, color: AT.dim, textTransform: "uppercase" }}>Scheme</span>
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(window.CDX_THEMES).map(([k, th]) => (
              <button key={k} onClick={() => setScheme(k)} style={{ cursor: "pointer",
                background: scheme === k ? AT.accent : "transparent", color: scheme === k ? "#fff" : AT.dim,
                border: "1px solid " + (scheme === k ? AT.accent : AT.line), fontFamily: "Orbitron", fontWeight: 600,
                fontSize: 9.5, letterSpacing: 1, padding: "5px 13px", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{th.name}</button>
            ))}
          </div>
        </div>

        {/* header */}
        <div className="notch" style={{ background: AT.headerBg, color: AT.headerInk, display: "flex", flexDirection: "column", gap: 10, padding: "11px 13px" }}>
          <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
            <image-slot id="adv-portrait" shape="rounded" radius="5" style={{ width: 92, height: 92, flex: "none", border: "2px solid rgba(255,255,255,.35)" }} placeholder="Portrait"></image-slot>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>{A.name}</span>
                <span className="notch" style={{ background: AT.brass, color: "#1c1208", fontSize: 11, fontWeight: 800, letterSpacing: 1, padding: "3px 12px", fontFamily: "Orbitron", textTransform: "uppercase" }}>{A.type}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                {[A.species, A.role].map((p, i) => (
                  <span key={i} className="notch" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.3)", fontSize: 10.5, padding: "4px 11px", letterSpacing: .5, textTransform: "uppercase", fontFamily: "Orbitron, sans-serif", fontWeight: 500 }}>{p}</span>
                ))}
                <window.PillStack items={A.forcePowers} title="Show all force powers" bg={window.FORCE_PILL.bg} ink={window.FORCE_PILL.ink} border={window.FORCE_PILL.border} dot={window.FORCE_PILL.dot} />
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, fontStyle: "italic", opacity: .9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.18)" }}>“{A.tagline}”</div>
        </div>

        {/* characteristics + soak */}
        <div style={{ display: "flex", gap: 6, margin: "11px 0", alignItems: "flex-start" }}>
          {Object.entries(A.characteristics).map(([n, v]) => <AdvChip key={n} label={n} value={v} />)}
          <div style={{ width: 1, alignSelf: "stretch", background: AT.line, margin: "6px 3px 14px" }}></div>
          <AdvChip label="Soak" value={D.soak} derived />
        </div>

        {/* derived */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
          <AdvStat label="Wounds" cur={D.woundCurrent} max={D.woundThreshold} sub="current / threshold" accent={AT.accent} />
          <AdvStat label="Strain" cur={D.strainCurrent} max={D.strainThreshold} sub="current / threshold" accent={AT.accent} />
          <AdvStat label="Defence" cur={D.defenceRanged} max={D.defenceMelee} sub="ranged / melee" accent={AT.brown} blackB />
        </div>

        {/* skills + abilities */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <AdvHeader style={{ display: "block", marginBottom: 0 }}>Skills</AdvHeader>
            <div>
              {trained.map((sk, i) => {
                const rank = A.skills[sk];
                const cval = A.characteristics[S.CHAR_OF[sk]];
                const dice = S.poolDiceWith(cval, rank);
                return (
                  <div key={sk} style={{ display: "grid", gridTemplateColumns: "1fr 54px 1fr", alignItems: "center",
                    background: i % 2 ? AT.paper : AT.paper2, borderBottom: "1px solid " + AT.line, minHeight: 26 }}>
                    <div style={{ padding: "4px 9px", fontSize: 12.5 }}>{sk.replace("Knowledge: ", "")} <span style={{ fontSize: 8.5, color: AT.dim, fontFamily: "Orbitron" }}>{S.ABBR[S.CHAR_OF[sk]]}</span></div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 3 }}>
                      {Array.from({ length: 5 }).map((_, p) => (
                        <span key={p} style={{ width: 6, height: 6, transform: "rotate(45deg)",
                          background: p < rank ? AT.accent : "transparent", border: "1px solid " + (p < rank ? AT.accent : AT.line) }}></span>
                      ))}
                    </div>
                    <div style={{ padding: "2px 9px" }}><DiceList dice={dice} fontSize={14} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <AdvHeader accent={AT.brown} style={{ display: "block", marginBottom: 0 }}>Abilities</AdvHeader>
            {A.abilities.map((ab) => (
              <div key={ab.name} style={{ padding: "7px 2px", borderBottom: "1px solid " + AT.line }}>
                <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12, color: AT.ink }}>{ab.name}</div>
                <div style={{ fontSize: 11.5, color: AT.dim, marginTop: 2, lineHeight: 1.4 }}>{ab.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* weapons */}
        <AdvHeader style={{ display: "inline-block", margin: "12px 0 8px" }}>Weapons</AdvHeader>
        {A.weapons.map((w) => (
          <window.WeaponRow key={w.name} w={w} theme={AT}
            dice={S.poolDiceWith(A.characteristics[S.CHAR_OF[w.skill]], A.skills[w.skill] || 0)} />
        ))}

        {/* gear */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <span style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: AT.brown, textTransform: "uppercase", alignSelf: "center" }}>Gear:</span>
          {A.gear.map((g) => <span key={g} className="notch" style={{ background: AT.paper2, border: "1px solid " + AT.line, fontSize: 11.5, padding: "4px 11px", color: AT.ink, whiteSpace: "nowrap" }}>{g}</span>)}
        </div>
      </div>
    </div>
  );
}

window.CodexAdversary = CodexAdversary;
