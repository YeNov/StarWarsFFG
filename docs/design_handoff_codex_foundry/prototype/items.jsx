/* ============================================================
   COMPANION — ITEM DETAIL SHEETS  ·  Codex II language, themeable
   One frame, four item types (weapon / armour / gear / talent).
   Talents carry no image. Weapon & armour show a condition track.
   ============================================================ */
const { useState: useStateItem } = React;
let IT = window.CDX_THEMES.republic;
const itemDark = (t) => t.bg === "#0e0b0b";
const ITEM_STATES = ["Undamaged", "Minor", "Moderate", "Major"];
const ACTIVATIONS = ["Passive", "Active - Maneuver", "Active - OOT", "Active - Incidental"];

function ItemStat({ label, value, wide }) {
  return (
    <div className="notch" style={{ background: IT.paper2, border: "1px solid " + IT.line, overflow: "hidden",
      minWidth: 74, flex: wide ? "1 1 0" : "0 0 auto" }}>
      <div className="notch-top" style={{ background: IT.brown, color: "#fff", fontFamily: "Orbitron, sans-serif",
        fontWeight: 700, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px" }}>{label}</div>
      <div style={{ padding: "6px 8px", textAlign: "center", fontFamily: "Orbitron", fontWeight: 900,
        fontSize: 20, color: IT.ink, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function ItemCondition({ state }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 9.5, letterSpacing: 1.5, color: IT.brown, textTransform: "uppercase" }}>Condition</span>
        <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 11, color: state === 0 ? IT.dim : IT.accent }}>{ITEM_STATES[state]}</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {ITEM_STATES.map((lbl, i) => (
          <div key={lbl} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ height: 9, borderRadius: 2, border: "1px solid " + IT.line,
              background: i >= 1 && i <= state ? IT.accent : (i === 0 && state === 0 ? IT.careerLine : IT.track) }}></div>
            <div style={{ fontSize: 8, color: i === state ? IT.ink : IT.dim, letterSpacing: .5, marginTop: 3, fontFamily: "Orbitron", fontWeight: i === state ? 700 : 400 }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemCheck({ label, checked, onClick, danger }) {
  const onBg = danger ? "#8a1714" : IT.career;
  const onLine = danger ? "#c0392b" : IT.careerLine;
  const boxOn = danger ? "#c0392b" : IT.accent;
  return (
    <div onClick={onClick} className="notch" style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 10,
      background: checked ? onBg : IT.paper2, border: "1px solid " + (checked ? onLine : IT.line), padding: "9px 13px" }}>
      <span style={{ width: 18, height: 18, flex: "none", borderRadius: 3, boxSizing: "border-box",
        border: "2px solid " + (checked ? boxOn : IT.dim), background: checked ? boxOn : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900 }}>{checked ? "\u2713" : ""}</span>
      <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 11, letterSpacing: .5, textTransform: "uppercase",
        color: checked && danger ? "#fff" : IT.ink }}>{label}</span>
    </div>
  );
}

function ItemSelect({ label, value, options, onChange }) {
  return (
    <div className="notch" style={{ background: IT.paper2, border: "1px solid " + IT.line, overflow: "hidden", flex: "1 1 0" }}>
      <div className="notch-top" style={{ background: IT.brown, color: "#fff", fontFamily: "Orbitron, sans-serif",
        fontWeight: 700, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px" }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", border: "none",
        background: "transparent", color: IT.ink, fontFamily: "Orbitron", fontWeight: 700, fontSize: 13,
        padding: "7px 8px", cursor: "pointer", appearance: "none", textAlign: "center", textAlignLast: "center" }}>
        {options.map((o) => <option key={o} value={o} style={{ color: "#111" }}>{o}</option>)}
      </select>
    </div>
  );
}

function TalentSheetBody({ item }) {
  const [activation, setActivation] = useStateItem(item.activation || "Passive");
  const [ranked, setRanked] = useStateItem(!!item.ranked);
  const [forceTalent, setForceTalent] = useStateItem(!!item.forceTalent);
  const [conflict, setConflict] = useStateItem(!!item.conflict);
  return (
    <React.Fragment>
      {/* tier + activation (+ rank when ranked) */}
      <div style={{ display: "flex", gap: 5, margin: "11px 0" }}>
        <ItemStat label="Tier" value={item.tier} />
        <ItemSelect label="Activation" value={activation} options={ACTIVATIONS} onChange={setActivation} />
        {ranked && <ItemStat label="Rank" value={item.rank || 1} />}
      </div>
      {/* flag checkboxes */}
      <div style={{ display: "flex", gap: 6, marginBottom: 11 }}>
        <ItemCheck label="Ranked" checked={ranked} onClick={() => setRanked((v) => !v)} />
        <ItemCheck label="Force Talent" checked={forceTalent} onClick={() => setForceTalent((v) => !v)} />
        <ItemCheck label="Conflict" checked={conflict} onClick={() => setConflict((v) => !v)} danger />
      </div>
      {/* description */}
      <div className="notch" style={{ background: IT.paper2, border: "1px solid " + IT.line, padding: 12 }}>
        <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 9.5, letterSpacing: 1.5, color: IT.brown, textTransform: "uppercase", marginBottom: 6 }}>Description</div>
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>{item.desc}</div>
      </div>
    </React.Fragment>
  );
}

function ItemSheet({ which = 0, initialScheme = "republic" }) {
  const item = window.SWFFG.ITEMS[which];
  const [scheme, setScheme] = useStateItem(initialScheme);
  IT = window.CDX_THEMES[scheme];
  const showImg = item.type !== "talent";
  const showState = item.type === "weapon" || item.type === "armour";
  const isEncHp = (l) => l === "Encum" || l === "HP";
  const stats = item.stats || [];
  const sec = stats.filter(([l]) => l === "Price" || l === "Rarity");
  // gear keeps Quantity + Encum on one line; weapon/armour split Encum+HP onto their own line
  const encHp = item.type === "gear" ? [] : stats.filter(([l]) => isEncHp(l));
  const mainRow = item.type === "gear"
    ? stats.filter(([l]) => l !== "Price" && l !== "Rarity")
    : stats.filter(([l]) => !isEncHp(l) && l !== "Price" && l !== "Rarity");

  return (
    <div style={{ width: 540, background: IT.bg, color: IT.ink, fontFamily: "Signika, sans-serif", padding: 12,
      position: "relative", overflow: "hidden",
      backgroundImage: `repeating-linear-gradient(135deg, ${IT.stripe} 0 12px, transparent 12px 24px)` }}>
      <div className="glyph" style={{ position: "absolute", top: -30, right: -24, fontSize: 240, lineHeight: 1, color: IT.watermark, pointerEvents: "none", zIndex: 0 }}>a</div>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* scheme switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9, letterSpacing: 2, color: IT.dim, textTransform: "uppercase" }}>Scheme</span>
          {Object.entries(window.CDX_THEMES).map(([k, th]) => (
            <button key={k} onClick={() => setScheme(k)} style={{ cursor: "pointer",
              background: scheme === k ? IT.accent : "transparent", color: scheme === k ? "#fff" : IT.dim,
              border: "1px solid " + (scheme === k ? IT.accent : IT.line), fontFamily: "Orbitron", fontWeight: 600,
              fontSize: 9, letterSpacing: .5, padding: "4px 9px", textTransform: "uppercase",
              display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{th.name}</button>
          ))}
        </div>

        {/* header — name / type / kicker (image moved to its own panel) */}
        <div className="notch" style={{ background: IT.headerBg, color: IT.headerInk, padding: "11px 14px" }}>
          <span className="notch" style={{ display: "inline-block", background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.3)",
            fontSize: 9, padding: "2px 10px", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "Orbitron, sans-serif", fontWeight: 700, marginBottom: 6 }}>{item.type}</span>
          <div style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 25, letterSpacing: .5, textTransform: "uppercase", lineHeight: 1 }}>{item.name}</div>
          <div style={{ fontSize: 11.5, opacity: .9, marginTop: 5, letterSpacing: .5 }}>{item.kicker}</div>
        </div>

        {/* talent layout is fully custom */}
        {item.type === "talent" ? <TalentSheetBody item={item} /> : (
        <React.Fragment>
        {/* big image (weapon/armour/gear) + stats */}
        <div style={{ display: "flex", gap: 10, margin: "11px 0" }}>
          {showImg && (
            <image-slot id={"item-" + item.type} shape="rounded" radius="6"
              style={{ width: 196, height: 168, flex: "none", border: "1px solid " + IT.line }} placeholder="Item image"></image-slot>
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {mainRow.map(([l, v]) => <ItemStat key={l} label={l} value={v} wide={showImg} />)}
            </div>
            {encHp.length > 0 && (
              <div style={{ display: "flex", gap: 5 }}>
                {encHp.map(([l, v]) => <ItemStat key={l} label={l} value={v} wide />)}
              </div>
            )}
            {sec.length > 0 && (
              <div style={{ display: "flex", gap: 5 }}>
                {sec.map(([l, v]) => <ItemStat key={l} label={l} value={v} wide />)}
              </div>
            )}
          </div>
        </div>

        {/* condition (weapon / armour) */}
        {showState && <ItemCondition state={item.state || 0} />}

        {/* qualities / properties */}
        {item.qualities && item.qualities.length > 0 && (
          <div style={{ marginBottom: 11 }}>
            <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 9.5, letterSpacing: 1.5, color: IT.brown, textTransform: "uppercase", marginBottom: 6 }}>
              Qualities</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {item.qualities.map((q) => <span key={q} style={{ fontSize: 11, background: IT.career, border: "1px solid " + IT.careerLine, borderRadius: 12, padding: "3px 12px", color: IT.ink, whiteSpace: "nowrap" }}>{q}</span>)}
            </div>
          </div>
        )}

        {/* description */}
        <div className="notch" style={{ background: IT.paper2, border: "1px solid " + IT.line, padding: 12 }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 9.5, letterSpacing: 1.5, color: IT.brown, textTransform: "uppercase", marginBottom: 6 }}>Description</div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{item.desc}</div>
        </div>
        </React.Fragment>
        )}
      </div>
    </div>
  );
}

window.ItemSheet = ItemSheet;
