/* ============================================================
   CODEX II — Main CodexSheet2 component
   Depends on: codex2.jsx · codex2-tabs.jsx · shared.jsx
   ============================================================ */
const { useState: useStateSheet2 } = React;

/* ---- Icon glyphs ---- */
const LongRestIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4v16"/><path d="M2 9h13a4 4 0 0 1 4 4v7"/><path d="M2 17h20"/><path d="M6 9v2.5"/>
  </svg>
);
const PostRestIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
  </svg>
);

/* ---- XP compact square block ---- */
function XPBlock({ xp }) {
  return (
    <div className="notch" style={{ width: 66, padding: "7px 6px", background: "rgba(0,0,0,.28)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontFamily: "Orbitron", fontSize: 8.5, letterSpacing: 1.5, fontWeight: 600, opacity: .72, textTransform: "uppercase" }}>XP</div>
      <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 22, lineHeight: 1.05 }}>{xp.available}</div>
      <div style={{ fontFamily: "Orbitron", fontSize: 8, opacity: .55 }}>of {xp.total}</div>
    </div>
  );
}

/* ---- Credits compact square block with hover "Change" below ---- */
function S2Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

function CreditsBlock({ credits, onEdit, theme }) {
  const TH = theme;
  const [hover, setHover] = useStateSheet2(false);
  const [editing, setEditing] = useStateSheet2(false);
  const [draft, setDraft] = useStateSheet2("");
  const [pos, setPos] = useStateSheet2(null);
  const ref = React.useRef(null);
  const hideTimer = React.useRef(null);
  const open = () => {
    clearTimeout(hideTimer.current);
    if (ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom - 16, left: r.left, width: r.width }); }
    setHover(true);
  };
  const scheduleClose = () => { hideTimer.current = setTimeout(() => setHover(false), 90); };
  const startEdit = () => { setDraft(String(credits)); setEditing(true); setHover(false); };
  const commit = () => { const n = parseInt(draft.replace(/[,\s]/g, "")); onEdit(isNaN(n) ? credits : n); setEditing(false); };
  const fmt = credits.toLocaleString("en-US").replace(/,/g, "\u2009");
  return (
    <div ref={ref} className="notch" onMouseEnter={open} onMouseLeave={scheduleClose}
      style={{ width: 78, background: TH.brass, padding: "7px 6px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontFamily: "Orbitron", fontSize: 8.5, letterSpacing: 1.5, fontWeight: 700,
        color: TH.chipLabel, opacity: .75, textTransform: "uppercase" }}>CR</div>
      {editing ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 15, color: TH.chipLabel,
            background: "rgba(255,255,255,.25)", border: "1px solid rgba(0,0,0,.25)", borderRadius: 3,
            padding: "1px 4px", width: 64, textAlign: "center" }} />
      ) : (
        <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 19, color: TH.chipLabel, lineHeight: 1.05 }}>{fmt}</div>
      )}
      <div style={{ fontFamily: "Orbitron", fontSize: 8, opacity: .6, color: TH.chipLabel }}>credits</div>
      {hover && !editing && pos && (
        <S2Portal>
          <button onMouseEnter={open} onMouseLeave={scheduleClose} onClick={startEdit}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, height: 40, cursor: "pointer",
              background: "color-mix(in srgb, " + TH.brass + " 55%, transparent)",
              border: "1.5px solid " + TH.brass, color: TH.chipLabel,
              clipPath: "polygon(0% 0%, 100% 0%, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0% calc(100% - 7px))",
              display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5,
              fontFamily: "Orbitron", fontWeight: 700, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase",
              boxShadow: "0 4px 12px rgba(0,0,0,.3)", zIndex: 80 }}>
            Change
          </button>
        </S2Portal>
      )}
    </div>
  );
}

/* ---- shared bits for the wound/strain blocks ---- */
function stepBtn(TH) {
  return { width: 26, height: 26, flex: "none", cursor: "pointer", borderRadius: 3,
    border: "1px solid " + TH.line, background: "transparent", color: TH.dim,
    fontFamily: "Orbitron", fontWeight: 900, fontSize: 14,
    display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 };
}

function BlockHeader({ label, onAction, actionTitle, icon, theme }) {
  const TH = theme;
  return (
    <div className="notch-top" style={{ background: TH.accent, color: "#fff", fontFamily: "Orbitron",
      fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
      padding: "3px 6px 3px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span>{label}</span>
      <button onClick={onAction} title={actionTitle} style={{ width: 22, height: 22, flex: "none", cursor: "pointer",
        borderRadius: 3, border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.12)",
        color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        {icon}
      </button>
    </div>
  );
}

/* ---- Wounds interactive block ---- */
function WoundsBlock({ value, threshold, healUses, healMax, onChange, onHealChange, onLongRest, theme }) {
  const TH = theme;
  const btn = stepBtn(TH);
  return (
    <div className="notch" style={{ flex: 1.5, background: TH.paper2, border: "1px solid " + TH.line, overflow: "hidden", minWidth: 0 }}>
      <BlockHeader label="Wounds" onAction={onLongRest} actionTitle="Long rest: −1 wound, reset healing" icon={<LongRestIcon />} theme={TH} />
      <div style={{ padding: "8px 12px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={btn} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ textAlign: "center", marginBottom: 2 }}><ThresholdNum a={value} b={threshold} theme={TH} size={26} blackB /></div>
            <DamageTrack cur={value} max={threshold} theme={TH} />
          </div>
          <button style={btn} onClick={() => onChange(Math.min(threshold, value + 1))}>+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 8, paddingTop: 7, borderTop: "1px solid " + TH.line }}>
          <span style={{ fontSize: 10, color: TH.dim, fontFamily: "Orbitron", letterSpacing: .5, textTransform: "uppercase" }}>Healing</span>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <button style={{ ...btn, width: 22, height: 22, fontSize: 13 }} onClick={() => onHealChange(Math.max(0, healUses - 1))}>−</button>
            <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 14, color: TH.ink, minWidth: 34, textAlign: "center" }}>{healUses}/{healMax}</span>
            <button style={{ ...btn, width: 22, height: 22, fontSize: 13 }} onClick={() => onHealChange(Math.min(healMax, healUses + 1))}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Strain interactive block ---- */
function StrainBlock({ value, threshold, onChange, onRest, theme }) {
  const TH = theme;
  const btn = stepBtn(TH);
  return (
    <div className="notch" style={{ flex: 1.5, background: TH.paper2, border: "1px solid " + TH.line, overflow: "hidden", minWidth: 0 }}>
      <BlockHeader label="Strain" onAction={onRest} actionTitle="Post-encounter rest: recover all strain" icon={<PostRestIcon />} theme={TH} />
      <div style={{ padding: "8px 12px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={btn} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ textAlign: "center", marginBottom: 2 }}><ThresholdNum a={value} b={threshold} theme={TH} size={26} blackB /></div>
            <DamageTrack cur={value} max={threshold} theme={TH} />
          </div>
          <button style={btn} onClick={() => onChange(Math.min(threshold, value + 1))}>+</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Main sheet ---- */
function CodexSheet2({ initialScheme = "republic" }) {
  const C = window.SWFFG.CHAR;
  const D = C.derived;
  const CDX = window.CDX_THEMES;

  const [scheme, setScheme] = useStateSheet2(initialScheme);
  const [tab, setTab] = useStateSheet2("skills");
  const [credits, setCredits] = useStateSheet2(C.credits);
  const [woundCur, setWoundCur] = useStateSheet2(D.woundCurrent);
  const [strainCur, setStrainCur] = useStateSheet2(D.strainCurrent);
  const [healUses, setHealUses] = useStateSheet2(0);
  const HEAL_MAX = 5;

  const T = CDX[scheme];
  const injuryCount = C.criticalInjuries.length;
  const tabs = [["skills","Skills",0],["combat","Combat",0],["injuries","Injuries",injuryCount],["talents","Talents",0],["gear","Gear",0],["bio","Bio",0]];

  return (
    <div style={{ width: 1000, background: T.bg, color: T.ink, fontFamily: "Signika, sans-serif", padding: 14,
      backgroundImage: "repeating-linear-gradient(135deg," + T.stripe + " 0 12px,transparent 12px 24px)" }}>

      {/* ===== Scheme switcher (above header) ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
        <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5, letterSpacing: 2.5, color: T.dim, textTransform: "uppercase" }}>Scheme</span>
        <div style={{ display: "flex", gap: 4 }}>
          {Object.entries(CDX).map(([k, th]) => (
            <button key={k} onClick={() => setScheme(k)} style={{ cursor: "pointer",
              fontFamily: "Orbitron", fontWeight: 600, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", padding: "4px 12px",
              background: scheme === k ? T.accent : "transparent", color: scheme === k ? "#fff" : T.dim,
              border: "1px solid " + (scheme === k ? T.accent : "transparent"), borderRadius: 2,
              display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{th.name}</button>
          ))}
        </div>
      </div>

      {/* ===== Header ===== */}
      <div className="notch" style={{ background: T.headerBg, color: T.headerInk, display: "flex", gap: 14, padding: 14, alignItems: "center" }}>
        <image-slot id="cdx2-portrait" shape="rounded" radius="6"
          style={{ width: 96, height: 84, flex: "none", border: "2px solid rgba(255,255,255,.35)" }}
          placeholder="Portrait"></image-slot>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 28, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>{C.name}</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            {[C.species, C.career].map((p) => (
              <span key={p} className="notch" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.26)",
                fontSize: 10, padding: "3px 11px", letterSpacing: .5, textTransform: "uppercase", fontFamily: "Orbitron", fontWeight: 500 }}>{p}</span>
            ))}
            <window.PillStack items={C.specializations} title="Specializations" w={160}
              bg="rgba(0,0,0,.4)" ink="rgba(255,255,255,.92)" border="rgba(255,255,255,.28)" dot="rgba(255,255,255,.65)" />
            {C.forcePowers && C.forcePowers.length > 0 && (
              <window.PillStack items={C.forcePowers} title="Force powers" w={110}
                bg={window.FORCE_PILL.bg} ink={window.FORCE_PILL.ink} border={window.FORCE_PILL.border} dot={window.FORCE_PILL.dot} />
            )}
            <span style={{ fontSize: 12, fontStyle: "italic", opacity: .85, marginLeft: 4 }}>"{C.tagline}"</span>
          </div>
        </div>
        {/* XP + Credits compact squares — centered */}
        <div style={{ flex: "none", display: "flex", gap: 7, alignItems: "center" }}>
          <XPBlock xp={C.xp} />
          <CreditsBlock credits={credits} onEdit={setCredits} theme={T} />
        </div>
      </div>

      {/* ===== Characteristics + Soak + Force (same row) ===== */}
      <div style={{ display: "flex", gap: 4, margin: "8px 0 12px", alignItems: "center" }}>
        {Object.entries(C.characteristics).map(([name, val]) => (
          <StatChip key={name} value={val} label={name} theme={T} />
        ))}
        <div style={{ width: 1, alignSelf: "stretch", background: T.line, margin: "0 6px", flex: "none" }}></div>
        <StatChip value={D.soak} label="Soak" theme={T} derived accent={T.brass} />
        <StatChip value={C.forceRating} label="Force" theme={T} derived accent={T.brass} />
      </div>

      {/* ===== Derived: Wounds + Strain + Defence + Encumbrance ===== */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <WoundsBlock value={woundCur} threshold={D.woundThreshold} healUses={healUses} healMax={HEAL_MAX}
          onChange={setWoundCur} onHealChange={setHealUses}
          onLongRest={() => { setWoundCur((w) => Math.max(0, w - 1)); setHealUses(0); }} theme={T} />
        <StrainBlock value={strainCur} threshold={D.strainThreshold}
          onChange={setStrainCur} onRest={() => setStrainCur(0)} theme={T} />
        <StatPanel label="Defence" value={{ a: D.defenceRanged, b: D.defenceMelee }} theme={T} sub="ranged / melee" blackB />
        <StatPanel label="Encumbrance" value={{ a: D.encumbrance, b: D.encumbranceMax }} theme={T} sub="used / max" blackB />
      </div>

      {/* ===== Tabs ===== */}
      <div style={{ display: "flex", borderBottom: "2px solid " + T.accent, marginBottom: 12 }}>
        {tabs.map(([id, lbl, badge]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: "none", cursor: "pointer",
            padding: "7px 18px", fontSize: 11, fontFamily: "Orbitron", fontWeight: 600, letterSpacing: 1,
            textTransform: "uppercase", position: "relative", background: tab === id ? T.accent : "transparent",
            color: tab === id ? "#fff" : T.dim,
            clipPath: tab === id ? "polygon(0 0,calc(100% - 8px) 0,100% 100%,0 100%)" : "none" }}>
            {lbl}
            {badge > 0 && <span style={{ position: "absolute", top: 3, right: 4, width: 15, height: 15,
              borderRadius: "50%", background: "#a51f17", color: "#fff", fontSize: 8.5, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
          </button>
        ))}
      </div>

      {/* ===== Tab body ===== */}
      {tab === "skills"   && <window.Cdx2Skills   theme={T} />}
      {tab === "combat"   && <window.Cdx2Combat   theme={T} />}
      {tab === "injuries" && <window.Cdx2Injuries theme={T} />}
      {tab === "talents"  && <window.Cdx2Talents  theme={T} />}
      {tab === "gear"     && <window.Cdx2Gear     theme={T} credits={credits} setCredits={setCredits} />}
      {tab === "bio"      && <window.Cdx2Bio      theme={T} />}
    </div>
  );
}

window.CodexSheet2 = CodexSheet2;
