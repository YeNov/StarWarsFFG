/* ============================================================
   COMPANION — MINION GROUP BLOCK  ·  Codex II language, themeable
   The one actor type with distinct mechanics: a shared wound
   pool and group-skill ranks that scale with headcount. The
   group-size stepper drives both, live.
   ============================================================ */
const { useState: useStateMin } = React;
let MT = window.CDX_THEMES.empire;
const minDark = (t) => t.bg === "#0e0b0b";

function MinHeader({ children, accent, style }) {
  return (
    <div className="notch-top" style={{ background: accent || MT.accent, color: "#fff", fontFamily: "Orbitron, sans-serif",
      fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 10px", ...style }}>{children}</div>
  );
}

function MinChip({ label, value, derived }) {
  return <window.StatChip theme={MT} value={value} label={label} derived={derived} w={68} h={68} />;
}

function CodexMinion({ initialScheme = "empire" }) {
  const M = window.SWFFG.MINION;
  const S = window.SWFFG;
  const [scheme, setScheme] = useStateMin(initialScheme);
  const [size, setSize] = useStateMin(M.groupSize);
  const [dmg, setDmg] = useStateMin(6);
  MT = window.CDX_THEMES[scheme];

  const poolMax = size * M.woundPerMinion;
  const ranks = Math.max(0, size - 1);                 // group adds members − 1 ranks to trained skills
  const downed = Math.floor(Math.min(dmg, poolMax) / M.woundPerMinion);   // removed members
  const alive = Math.max(0, size - downed);

  const StepBtn = ({ on, children, disabled }) => (
    <button onClick={on} disabled={disabled} style={{ width: 26, height: 26, cursor: disabled ? "default" : "pointer",
      background: disabled ? "transparent" : MT.accent, color: disabled ? MT.line : "#fff", border: "1px solid " + (disabled ? MT.line : MT.accent),
      fontFamily: "Orbitron", fontWeight: 900, fontSize: 16, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{children}</button>
  );

  return (
    <div style={{ width: 1000, background: MT.bg, color: MT.ink, fontFamily: "Signika, sans-serif", padding: 12,
      position: "relative", overflow: "hidden",
      backgroundImage: `repeating-linear-gradient(135deg, ${MT.stripe} 0 12px, transparent 12px 24px)` }}>
      <div className="glyph" style={{ position: "absolute", top: -40, right: -30, fontSize: 360, lineHeight: 1, color: MT.watermark, pointerEvents: "none", zIndex: 0 }}>a</div>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* scheme switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
          <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5, letterSpacing: 2.5, color: MT.dim, textTransform: "uppercase" }}>Scheme</span>
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(window.CDX_THEMES).map(([k, th]) => (
              <button key={k} onClick={() => setScheme(k)} style={{ cursor: "pointer",
                background: scheme === k ? MT.accent : "transparent", color: scheme === k ? "#fff" : MT.dim,
                border: "1px solid " + (scheme === k ? MT.accent : MT.line), fontFamily: "Orbitron", fontWeight: 600,
                fontSize: 9.5, letterSpacing: 1, padding: "5px 13px", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{th.name}</button>
            ))}
          </div>
        </div>

        {/* header */}
        <div className="notch" style={{ background: MT.headerBg, color: MT.headerInk, display: "flex", flexDirection: "column", gap: 10, padding: "11px 13px" }}>
          <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
            <image-slot id="min-portrait" shape="rounded" radius="5" style={{ width: 92, height: 92, flex: "none", border: "2px solid rgba(255,255,255,.35)" }} placeholder="Portrait"></image-slot>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>{M.name}</span>
                <span className="notch" style={{ background: MT.brass, color: "#1c1208", fontSize: 11, fontWeight: 800, letterSpacing: 1, padding: "3px 12px", fontFamily: "Orbitron", textTransform: "uppercase" }}>{M.type}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                {[M.species, M.role].map((p, i) => (
                  <span key={i} className="notch" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.3)", fontSize: 10.5, padding: "4px 11px", letterSpacing: .5, textTransform: "uppercase", fontFamily: "Orbitron, sans-serif", fontWeight: 500 }}>{p}</span>
                ))}
                <window.PillStack items={M.forcePowers} title="Show all force powers" bg={window.FORCE_PILL.bg} ink={window.FORCE_PILL.ink} border={window.FORCE_PILL.border} dot={window.FORCE_PILL.dot} />
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, fontStyle: "italic", opacity: .9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.18)" }}>“{M.tagline}”</div>
        </div>

        {/* characteristics + soak */}
        <div style={{ display: "flex", gap: 6, margin: "11px 0", alignItems: "flex-start" }}>
          {Object.entries(M.characteristics).map(([n, v]) => <MinChip key={n} label={n} value={v} />)}
          <div style={{ width: 1, alignSelf: "stretch", background: MT.line, margin: "6px 3px 14px" }}></div>
          <MinChip label="Soak" value={M.soak} derived />
        </div>

        {/* group strength + defence on one line */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "stretch" }}>
          <div className="notch" style={{ flex: 1, background: MT.paper2, border: "1px solid " + MT.line, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <MinHeader>Group Strength</MinHeader>
            <div style={{ padding: "12px 13px", flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
              <StepBtn on={() => setSize((s) => Math.max(1, s - 1))} disabled={size <= 1}>−</StepBtn>
              <div style={{ textAlign: "center", minWidth: 84 }}>
                <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 30, color: MT.ink, lineHeight: 1 }}>{alive}</span>
                <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 30, color: MT.dim }}> / {size}</span>
              </div>
              <StepBtn on={() => setSize((s) => Math.min(8, s + 1))} disabled={size >= 8}>+</StepBtn>
              <span style={{ fontSize: 11, color: MT.dim, letterSpacing: .5 }}>members in the group</span>
              <button onClick={() => setDmg(poolMax)} title="Wipe out the whole group"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
                  background: alive === 0 ? MT.accent : "transparent", color: alive === 0 ? "#fff" : MT.accent,
                  border: "1px solid " + MT.accent, borderRadius: 3, padding: "7px 14px",
                  fontFamily: "Orbitron", fontWeight: 700, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>
                <span style={{ fontSize: 17, lineHeight: 1 }}>{"\u2620\uFE0E"}</span> Wipe out
              </button>
            </div>
          </div>
          {/* defence — matches adversary sheet's stat block */}
          <div className="notch" style={{ flex: "0 0 200px", background: MT.paper2, border: "1px solid " + MT.line, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <MinHeader accent={MT.brown}>Defence</MinHeader>
            <div style={{ padding: "8px 10px 10px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 30, color: MT.ink, lineHeight: 1 }}>{M.defenceRanged}<span style={{ fontSize: 30, color: MT.ink }}> / {M.defenceMelee}</span></div>
              <div style={{ fontSize: 9, color: MT.dim, marginTop: 6, letterSpacing: .5 }}>ranged / melee</div>
            </div>
          </div>
        </div>

        {/* combined wound pool */}
        <div className="notch" style={{ background: MT.paper2, border: "1px solid " + MT.line, overflow: "hidden", marginBottom: 12 }}>
          <MinHeader>Combined Wound Pool · {M.woundPerMinion} per member</MinHeader>
          <div style={{ padding: "10px 13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <StepBtn on={() => setDmg((d) => Math.max(0, d - 1))} disabled={dmg <= 0}>−</StepBtn>
              <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 24, color: MT.ink }}>{Math.min(dmg, poolMax)}<span style={{ fontSize: 24, color: MT.dim }}> / {poolMax}</span></span>
              <StepBtn on={() => setDmg((d) => Math.min(poolMax, d + 1))} disabled={dmg >= poolMax}>+</StepBtn>
              <span style={{ fontSize: 11, color: MT.dim, marginLeft: 2 }}>wounds suffered — every {M.woundPerMinion} removes a member</span>
            </div>
            {/* segmented bar, grouped per member */}
            <div style={{ display: "flex", gap: 5 }}>
              {Array.from({ length: size }).map((_, m) => (
                <div key={m} style={{ flex: 1, display: "flex", gap: 2, padding: 3, border: "1px solid " + MT.line, borderRadius: 3,
                  background: m < alive ? "transparent" : "rgba(0,0,0,.05)" }}>
                  {Array.from({ length: M.woundPerMinion }).map((_, i) => {
                    const idx = m * M.woundPerMinion + i;
                    return <span key={i} style={{ flex: 1, height: 12, borderRadius: 1, background: idx < dmg ? MT.accent : MT.track }}></span>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* group skills + abilities */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <MinHeader style={{ display: "block", marginBottom: 0 }}>Group Skills · +{ranks} rank{ranks !== 1 ? "s" : ""}</MinHeader>
            {M.groupSkills.map((sk, i) => {
              const cval = M.characteristics[S.CHAR_OF[sk]];
              const dice = S.poolDiceWith(cval, ranks);
              return (
                <div key={sk} style={{ display: "grid", gridTemplateColumns: "1fr 54px 1fr", alignItems: "center",
                  background: i % 2 ? MT.paper : MT.paper2, borderBottom: "1px solid " + MT.line, minHeight: 28,
                  opacity: alive > 0 ? 1 : 0.4 }}>
                  <div style={{ padding: "4px 9px", fontSize: 13 }}>{sk.replace("Knowledge: ", "")} <span style={{ fontSize: 8.5, color: MT.dim, fontFamily: "Orbitron" }}>{S.ABBR[S.CHAR_OF[sk]]}</span></div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 3 }}>
                    {Array.from({ length: 5 }).map((_, p) => (
                      <span key={p} style={{ width: 6, height: 6, transform: "rotate(45deg)",
                        background: p < ranks ? MT.accent : "transparent", border: "1px solid " + (p < ranks ? MT.accent : MT.line) }}></span>
                    ))}
                  </div>
                  <div style={{ padding: "2px 9px" }}><DiceList dice={dice} fontSize={14} empty="·" /></div>
                </div>
              );
            })}
            <div style={{ fontSize: 10.5, color: MT.dim, marginTop: 6, lineHeight: 1.4 }}>
              Untrained skills roll characteristic dice only. Trained skills gain ranks equal to members − 1, so the group weakens as it takes casualties.
            </div>
          </div>
          <div>
            <MinHeader accent={MT.brown} style={{ display: "block", marginBottom: 0 }}>Abilities</MinHeader>
            {M.abilities.map((ab) => (
              <div key={ab.name} style={{ padding: "7px 2px", borderBottom: "1px solid " + MT.line }}>
                <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12, color: MT.ink }}>{ab.name}</div>
                <div style={{ fontSize: 11.5, color: MT.dim, marginTop: 2, lineHeight: 1.4 }}>{ab.desc}</div>
              </div>
            ))}
            <div style={{ marginTop: 9 }}>
              <span style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 10, letterSpacing: 1, color: MT.brown, textTransform: "uppercase" }}>Notes</span>
              <div style={{ fontSize: 11.5, color: MT.dim, marginTop: 3, lineHeight: 1.45 }}>{M.desc}</div>
            </div>
          </div>
        </div>

        {/* weapons */}
        <MinHeader style={{ display: "inline-block", margin: "12px 0 8px" }}>Weapons</MinHeader>
        {M.weapons.map((w) => (
          <window.WeaponRow key={w.name} w={w} theme={MT}
            dice={S.poolDiceWith(M.characteristics[S.CHAR_OF[w.skill]], M.groupSkills.includes(w.skill) ? ranks : 0)} />
        ))}
      </div>
    </div>
  );
}

window.CodexMinion = CodexMinion;
