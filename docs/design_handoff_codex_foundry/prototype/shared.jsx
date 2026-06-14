/* Shared render helpers used by all three sheet variations */
const { useState } = React;

// A run of dice glyphs for a given skill's pool. `gap` may be negative
// (applied as inter-glyph margin) to pull the dice closer together.
function DicePool({ skill, fontSize = 16, gap = 2, empty = "—" }) {
  const dice = window.SWFFG.poolDice(skill);
  if (!dice.length) return <span style={{ opacity: 0.35, fontSize: fontSize - 3 }}>{empty}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {dice.map((d, i) => (
        <span key={i} className={"glyph g-" + (d === "proficiency" ? "prof" : "ability")}
          style={{ fontSize, marginLeft: i === 0 ? 0 : gap }}>{window.SWFFG.GLYPH[d]}</span>
      ))}
    </span>
  );
}

// Single die glyph
function Die({ type, fontSize = 16 }) {
  const cls = { proficiency: "g-prof", ability: "g-ability", boost: "g-boost",
    difficulty: "g-difficulty", challenge: "g-challenge", setback: "g-setback", force: "g-force" }[type];
  return <span className={"glyph " + cls} style={{ fontSize }}>{window.SWFFG.GLYPH[type]}</span>;
}

// Inline difficulty preview (purple diamonds) — decorative
function Difficulty({ n = 2, fontSize = 14 }) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {Array.from({ length: n }).map((_, i) => <Die key={i} type="difficulty" fontSize={fontSize} />)}
    </span>
  );
}

// Reserved layout for an item's image/icon. Lightweight striped placeholder
// (real Foundry items ship an img) — communicates the slot without faking art.
function ItemIcon({ size = 36, radius = 5, tone = "dark", accent }) {
  const c = tone === "light"
    ? { a: "#d9d2c4", b: "#cdc4b2", line: "#bdb6a8", mark: "#9a907c" }
    : { a: "#1b2129", b: "#222b34", line: "#2c353e", mark: "#566069" };
  return (
    <div style={{ width: size, height: size, flex: "none", borderRadius: radius,
      border: "1px solid " + (accent || c.line), boxSizing: "border-box",
      background: `repeating-linear-gradient(135deg, ${c.a} 0 5px, ${c.b} 5px 10px)`,
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <span style={{ width: size * 0.34, height: size * 0.34, border: "1.5px solid " + c.mark,
        borderRadius: 2, display: "block" }}></span>
    </div>
  );
}

// Render an explicit array of die types (for NPC/vehicle pools)
function DiceList({ dice, fontSize = 15, empty = "—" }) {
  if (!dice || !dice.length) return <span style={{ opacity: 0.35, fontSize: fontSize - 3 }}>{empty}</span>;
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {dice.map((d, i) => (
        <span key={i} className={"glyph g-" + (d === "proficiency" ? "prof" : "ability")}
          style={{ fontSize }}>{window.SWFFG.GLYPH[d]}</span>
      ))}
    </span>
  );
}

Object.assign(window, { DicePool, Die, Difficulty, ItemIcon, DiceList });

/* ============================================================
   WEAPON ROW — shared preset used by every actor sheet.
   Single source of truth: edit this and it changes everywhere.
   Props: w (weapon), theme (active scheme tokens), dice (optional
   explicit die-type array; defaults to the character's pool for w.skill).
   ============================================================ */
function WR_Step({ kind, onClick, accent }) {
  return (
    <button onClick={onClick} style={{ width: 20, height: 20, flex: "none", cursor: "pointer",
      border: "1px solid " + accent, background: "transparent", color: accent, borderRadius: 4,
      fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 13, lineHeight: 1, padding: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{kind === "inc" ? "+" : "\u2212"}</button>
  );
}
const WR_Hand = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0"></path><path d="M14 10V4a2 2 0 0 0-4 0v2"></path><path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path></svg>
);
const WR_Ammo = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5h3l.8 2.2H5.2L6 4.5zM5 8h5v11.5H5zM12 4.5h3l.8 2.2h-4.6L12 4.5zM11 8h5v11.5h-5z"></path></svg>
);
function WR_Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

function WeaponRow({ w, theme, dice }) {
  const TH = theme;
  const dark = TH.bg === "#0e0b0b";
  const [equipped, setEquipped] = React.useState(w.equipped !== false);
  const [ammo, setAmmo] = React.useState(w.ammo ? w.ammo.cur : 0);
  const [ammoType, setAmmoType] = React.useState(w.ammoType || null);
  const [menu, setMenu] = React.useState(null);
  const dd = dice || window.SWFFG.poolDice(w.skill);
  const openMenu = (e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ top: r.bottom + 4, left: r.left }); };
  return (
    <div className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line,
      padding: "9px 12px", marginBottom: 7, display: "grid", gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center", gap: 11, opacity: equipped ? 1 : 0.72 }}>
      {/* left: icon + equip + name/specials */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <ItemIcon size={44} radius={6} tone={dark ? "dark" : "light"} accent={TH.line} />
        <button title={equipped ? "Equipped — click to unequip" : "Not equipped — click to equip"} onClick={() => setEquipped((v) => !v)}
          style={{ width: 30, height: 30, flex: "none", cursor: "pointer", borderRadius: 5, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "1px solid " + (equipped ? TH.accent : TH.line), background: equipped ? TH.accent : "transparent",
            color: equipped ? "#fff" : TH.dim }}><WR_Hand /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 14.5 }}>{w.name}</div>
          <div style={{ fontSize: 11, color: TH.dim, margin: "2px 0 5px" }}>{w.skill} · <DiceList dice={dd} fontSize={13} empty="·" /></div>
          <QualityPills items={w.special} theme={TH} />
        </div>
      </div>
      {/* center: DAM / CRIT / RANGE / ENC — centered AND aligned across rows */}
      <div style={{ display: "flex" }}>
        {[["DAM", w.dam], ["CRIT", w.crit], ["RANGE", w.range], ["ENC", w.enc != null ? w.enc : "—"]].map(([k, v]) => (
          <div key={k} style={{ textAlign: "center", width: 62, padding: "0 2px" }}>
            <div style={{ fontSize: 8.5, color: TH.dim, letterSpacing: 1 }}>{k}</div>
            <div style={{ fontFamily: "Orbitron", fontWeight: 900,
              fontSize: String(v).length > 4 ? 12 : 18, color: TH.accent, whiteSpace: "nowrap", lineHeight: 1.5 }}>{v}</div>
          </div>
        ))}
      </div>
      {/* right: ammo slot pinned to the track end */}
      <div style={{ justifySelf: "end", width: 128, paddingLeft: 11, borderLeft: w.ammo ? "1px solid " + TH.line : "1px solid transparent",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, justifyContent: "center" }}>
        {w.ammo && (
          <React.Fragment>
            <div style={{ fontSize: 8.5, color: TH.dim, letterSpacing: 1 }}>AMMO</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <WR_Step kind="dec" accent={TH.accent} onClick={() => setAmmo((a) => Math.max(0, a - 1))} />
              <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 17, color: TH.ink, minWidth: 38, textAlign: "center" }}>{ammo} / {w.ammo.max}</span>
              <WR_Step kind="inc" accent={TH.accent} onClick={() => setAmmo((a) => Math.min(w.ammo.max, a + 1))} />
            </div>
            <button onClick={openMenu} title="Select ammo type" style={{ cursor: "pointer", display: "inline-flex",
              alignItems: "center", gap: 6, border: "1px solid " + TH.careerLine, background: TH.career, color: TH.ink,
              borderRadius: 10, padding: "3px 10px", fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5,
              letterSpacing: .5, textTransform: "uppercase" }}>
              <WR_Ammo size={12} />{ammoType}
            </button>
          </React.Fragment>
        )}
      </div>
      {menu && (
        <WR_Portal>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setMenu(null)}>
            <div onClick={(e) => e.stopPropagation()} className="notch" style={{ position: "fixed", top: menu.top, left: menu.left,
              background: TH.paper2, border: "1px solid " + TH.line, boxShadow: "0 10px 30px rgba(0,0,0,.4)", padding: 4, minWidth: 140 }}>
              {w.ammoTypes.map((t) => (
                <button key={t} onClick={() => { setAmmoType(t); setMenu(null); }} style={{ display: "flex", width: "100%",
                  alignItems: "center", gap: 8, cursor: "pointer", border: "none", textAlign: "left",
                  background: t === ammoType ? TH.career : "transparent", color: TH.ink, padding: "7px 10px",
                  fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: .5 }}>
                  <WR_Ammo size={12} />{t}
                </button>
              ))}
            </div>
          </div>
        </WR_Portal>
      )}
    </div>
  );
}

window.WeaponRow = WeaponRow;

/* ============================================================
   SHARED STAT PRESETS — one source of truth for chips, panels,
   damage tracks, threshold values and quality pills. Every actor
   & vehicle sheet renders these, passing its own `theme` tokens.
   ============================================================ */

// Characteristic / derived chip: big value + notched label.
// derived=true draws the accent ring + filled label (Soak, Force, Armour…).
function StatChip({ value, label, theme, derived, accent, sub, w = 72, h = 72 }) {
  const TH = theme;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
      <div style={{ width: w, height: h, borderRadius: 13,
        border: derived ? "3px solid " + (accent || TH.brass) : "4px double " + TH.ink,
        background: TH.paper2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,.12)" }}>
        <span style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 32, color: TH.ink, lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 8, color: TH.dim, marginTop: 2 }}>{sub}</span>}
      </div>
      <div className="notch" style={{ marginTop: -9, background: derived ? (accent || TH.brass) : TH.chipLabel,
        color: TH.chipInk, fontSize: 9.5, letterSpacing: 1.1, padding: "3px 12px",
        textTransform: "uppercase", fontFamily: "Orbitron, sans-serif", fontWeight: 600, zIndex: 2, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}

// Damage escalates green -> amber -> red as current nears threshold.
function dmgColor(cur, max) {
  const r = max ? cur / max : 0;
  if (r >= 0.8) return "#a51f17";
  if (r >= 0.5) return "#c8902e";
  return "#3f7d3a";
}

// Damage track: cur = damage TAKEN, fills left->right (number & bar climb
// together). Pips (A) by default; continuous bar + cap (B) once max >= 20.
function DamageTrack({ cur, max, theme }) {
  const TH = theme;
  const col = dmgColor(cur, max);
  if (max >= 20) {
    return (
      <div style={{ height: 12, border: "1px solid " + TH.line, background: TH.track, borderRadius: 2, overflow: "hidden", position: "relative", marginTop: 8 }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: (cur / max * 100) + "%", background: col }}></div>
        <div style={{ position: "absolute", top: -2, bottom: -2, right: 0, width: 2, background: TH.ink }}></div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 2, marginTop: 8, justifyContent: "center" }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ flex: "1 1 0", maxWidth: 12, height: 9, borderRadius: 1, background: i < cur ? col : TH.track }}></span>
      ))}
    </div>
  );
}

// "a / b" with both numbers the same size (b dimmed unless blackB).
function ThresholdNum({ a, b, theme, size = 30, blackB }) {
  const TH = theme;
  return (
    <div style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, color: TH.ink, lineHeight: 1 }}>
      <span style={{ fontSize: size }}>{a}</span>
      {b != null && <span style={{ fontSize: size, color: blackB ? TH.ink : TH.dim }}> / {b}</span>}
    </div>
  );
}

// Notched stat panel: accent header + big value (+ optional damage track + sub).
function StatPanel({ label, value, sub, damage, flex = 1, accent, blackB, theme }) {
  const TH = theme;
  const ac = accent || TH.accent;
  const size = damage ? 30 : 42;
  return (
    <div className="notch" style={{ flex, background: TH.paper2, border: "1px solid " + TH.line,
      display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
      <div className="notch-top" style={{ background: ac, color: "#fff", fontFamily: "Orbitron, sans-serif",
        fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 10px" }}>{label}</div>
      <div style={{ padding: "6px 8px 8px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <ThresholdNum a={value.a} b={value.b} size={size} blackB={blackB} theme={TH} />
        {damage && <DamageTrack cur={damage.cur} max={damage.max} theme={TH} />}
        {sub && <div style={{ fontSize: 9, color: TH.dim, marginTop: 6, letterSpacing: .5 }}>{sub}</div>}
      </div>
    </div>
  );
}

// Rounded quality / special pills (weapon qualities, item traits, etc).
function QualityPills({ items, theme, size = 9.5 }) {
  const TH = theme;
  if (!items || !items.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {items.map((s) => <span key={s} style={{ fontSize: size, background: TH.career,
        border: "1px solid " + TH.careerLine, borderRadius: 10, padding: "2px 9px", color: TH.ink, whiteSpace: "nowrap" }}>{s}</span>)}
    </span>
  );
}

Object.assign(window, { StatChip, StatPanel, DamageTrack, ThresholdNum, QualityPills, dmgColor, WR_Hand });

/* Attachment / modification card: notched accent header + description. */
function AttachmentCard({ name, desc, theme }) {
  const TH = theme;
  return (
    <div className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line, overflow: "hidden" }}>
      <div className="notch-top" style={{ background: TH.brown, color: "#fff", fontFamily: "Orbitron, sans-serif",
        fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 10px" }}>{name}</div>
      <div style={{ padding: "8px 12px 10px", fontSize: 12, lineHeight: 1.45, color: TH.ink }}>{desc}</div>
    </div>
  );
}

/* Critical list: severity shown as purple difficulty dice. Serves both the
   character's Critical Injuries and the vehicle's Critical Hits. */
function CriticalList({ items, theme, title = "Critical Injuries", emptyLabel = "No critical injuries currently sustained." }) {
  const TH = theme;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12, letterSpacing: 1.5, color: TH.brown, textTransform: "uppercase" }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: TH.line }}></span>
        <span style={{ fontSize: 10.5, color: TH.dim }}>severity</span>
        <span style={{ display: "inline-flex", gap: 1 }}><Die type="difficulty" fontSize={15} /><Die type="difficulty" fontSize={15} /></span>
      </div>
      {(!items || items.length === 0) && (
        <div className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line, padding: 14, fontSize: 12.5, color: TH.dim, fontStyle: "italic" }}>{emptyLabel}</div>
      )}
      {(items || []).map((c) => (
        <div key={c.name} className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line,
          padding: "10px 13px", marginBottom: 7, display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 14, color: TH.ink }}>{c.name}</div>
            <div style={{ fontSize: 12, color: TH.dim, marginTop: 2, lineHeight: 1.4 }}>{c.desc}</div>
          </div>
          <div style={{ flex: "none", textAlign: "center" }}>
            <div style={{ fontSize: 8.5, color: TH.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Severity</div>
            <div style={{ display: "inline-flex", gap: 2 }}>
              {Array.from({ length: c.severity }).map((_, i) => <Die key={i} type="difficulty" fontSize={20} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { AttachmentCard, CriticalList });
