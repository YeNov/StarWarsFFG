/* ============================================================
   COMPANION — VEHICLE SHEET  ·  Codex II language, themeable
   Defence compass (2 or 4 zones), compact damage tracks,
   critical hits. Reuses window.CDX_THEMES + shared helpers.
   ============================================================ */
const { useState: useStateVeh } = React;
let VT = window.CDX_THEMES.republic;
const vehDark = (t) => t.bg === "#0e0b0b";

function VehHeader({ children, accent, style }) {
  return (
    <div className="notch-top" style={{ background: accent || VT.accent, color: "#fff", fontFamily: "Orbitron, sans-serif",
      fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 10px", ...style }}>{children}</div>
  );
}

function VehChip({ label, value, sub }) {
  return <window.StatChip theme={VT} value={value} label={label} sub={sub} w={74} h={70} />;
}

/* one bearing on the defence compass: a notched value box + label tag */
function VehZone({ value, label, pos }) {
  return (
    <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, ...pos }}>
      <div className="notch" style={{ width: 50, height: 50, background: VT.paper2, border: "2px solid " + VT.ink,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Orbitron", fontWeight: 900, fontSize: 24, color: VT.ink,
        boxShadow: "0 2px 6px rgba(0,0,0,.18)" }}>{value}</div>
      <div className="notch" style={{ background: VT.accent, color: "#fff", fontSize: 8.5, letterSpacing: 1.5,
        padding: "2px 9px", textTransform: "uppercase", fontFamily: "Orbitron", fontWeight: 700, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}

function VehCompass({ zones }) {
  const d = window.SWFFG.VEHICLE.defence;
  return (
    <div className="notch" style={{ background: VT.paper2, border: "1px solid " + VT.line, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1 }}>
      <VehHeader accent={VT.brown}>Defence · {zones}-zone</VehHeader>
      <div style={{ position: "relative", flex: 1, minHeight: 250, margin: "6px 6px 8px",
        background: `radial-gradient(circle at 50% 50%, ${VT.career} 0%, transparent 62%),
          repeating-radial-gradient(circle at 50% 50%, ${VT.line} 0 1px, transparent 1px 20px)` }}>
        {/* ship silhouette (fillable) */}
        <image-slot id="veh-silhouette" shape="rounded" radius="6"
          style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: 80, height: 58, border: "1px solid " + VT.line, opacity: .96 }} placeholder="Top view"></image-slot>

        {zones === 4 ? (
          <React.Fragment>
            <VehZone value={d.fore} label="Fore" pos={{ top: 0, left: "50%", transform: "translateX(-50%)" }} />
            <VehZone value={d.aft} label="Aft" pos={{ bottom: 0, left: "50%", transform: "translateX(-50%)" }} />
            <VehZone value={d.port} label="Port" pos={{ left: 2, top: "50%", transform: "translateY(-50%)" }} />
            <VehZone value={d.starboard} label="Stbd" pos={{ right: 2, top: "50%", transform: "translateY(-50%)" }} />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <VehZone value={d.fore} label="Forward" pos={{ top: 0, left: "50%", transform: "translateX(-50%)" }} />
            <VehZone value={d.aft} label="Aft" pos={{ bottom: 0, left: "50%", transform: "translateX(-50%)" }} />
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* compact damage track — shared StatPanel + DamageTrack preset, themed */
function VehTrack({ label, cur, max, accent }) {
  return <window.StatPanel theme={VT} label={label} accent={accent} value={{ a: cur, b: max }}
    damage={{ cur, max }} sub="cur / thr" />;
}

function VehMetaRow({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed " + VT.line, fontSize: 11.5 }}>
      <span style={{ color: VT.dim }}>{k}</span><b style={{ fontFamily: "Orbitron", fontWeight: 700, color: VT.ink }}>{v}</b>
    </div>
  );
}

function CodexVehicle({ initialScheme = "mercenary", zones = 4 }) {
  const V = window.SWFFG.VEHICLE;
  const [scheme, setScheme] = useStateVeh(initialScheme);
  const [vtab, setVtab] = useStateVeh("weapons");
  VT = window.CDX_THEMES[scheme];

  return (
    <div style={{ width: 1000, background: VT.bg, color: VT.ink, fontFamily: "Signika, sans-serif", padding: 12,
      position: "relative", overflow: "hidden",
      backgroundImage: `repeating-linear-gradient(135deg, ${VT.stripe} 0 12px, transparent 12px 24px)` }}>
      <div className="glyph" style={{ position: "absolute", top: -40, right: -30, fontSize: 360, lineHeight: 1, color: VT.watermark, pointerEvents: "none", zIndex: 0 }}>a</div>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* scheme switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
          <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5, letterSpacing: 2.5, color: VT.dim, textTransform: "uppercase" }}>Scheme</span>
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(window.CDX_THEMES).map(([k, th]) => (
              <button key={k} onClick={() => setScheme(k)} style={{ cursor: "pointer",
                background: scheme === k ? VT.accent : "transparent", color: scheme === k ? "#fff" : VT.dim,
                border: "1px solid " + (scheme === k ? VT.accent : VT.line), fontFamily: "Orbitron", fontWeight: 600,
                fontSize: 9.5, letterSpacing: 1, padding: "5px 13px", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{th.name}</button>
            ))}
          </div>
        </div>

        {/* header */}
        <div className="notch" style={{ background: VT.headerBg, color: VT.headerInk, display: "flex", gap: 13, padding: "11px 13px", alignItems: "center" }}>
          <image-slot id="veh-portrait" shape="rounded" radius="5" style={{ width: 150, height: 92, flex: "none", border: "2px solid rgba(255,255,255,.35)" }} placeholder="Ship"></image-slot>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>{V.name}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              {[V.model, "Starship"].map((p, i) => (
                <span key={i} className="notch" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.3)", fontSize: 10.5, padding: "3px 11px", letterSpacing: .5, textTransform: "uppercase", fontFamily: "Orbitron, sans-serif", fontWeight: 500 }}>{p}</span>
              ))}
              <span style={{ fontSize: 12, fontStyle: "italic", opacity: .9, marginLeft: 4 }}>“{V.bio}”</span>
            </div>
          </div>
          <div style={{ flex: "none", display: "flex", gap: 7 }}>
            {[["HP", V.hardpoints.used + "/" + V.hardpoints.max, "hardpoints"], ["RARITY", V.rarity, "cost " + (V.cost / 1000) + "k"]].map(([k, v, s], i) => (
              <div key={k} className="notch" style={{ background: i ? VT.brass : "rgba(0,0,0,.28)", color: "#fff", padding: "7px 13px", textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 9, letterSpacing: 1, opacity: .85, fontWeight: 700 }}>{k}</div>
                <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 17, lineHeight: 1.1 }}>{v}</div>
                <div style={{ fontSize: 8, opacity: .7 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* two columns: left chips/tracks/systems · right compass (full height) */}
        <div style={{ display: "flex", gap: 10, margin: "12px 0", alignItems: "stretch" }}>
          <div style={{ flex: 1.55, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <VehChip label="Silhouette" value={V.silhouette} />
              <VehChip label="Speed" value={V.speed} sub={"max " + V.speedMax} />
              <VehChip label="Handling" value={V.handling > 0 ? "+" + V.handling : V.handling} />
              <VehChip label="Armour" value={V.armour} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <VehTrack label="Hull Trauma" cur={V.hullTrauma.cur} max={V.hullTrauma.max} accent={VT.accent} />
              <VehTrack label="System Strain" cur={V.systemStrain.cur} max={V.systemStrain.max} accent={VT.accent} />
            </div>
            <div className="notch" style={{ background: VT.paper2, border: "1px solid " + VT.line, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
              <VehHeader accent={VT.brown}>Systems</VehHeader>
              <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16, alignContent: "space-between", flex: 1 }}>
                <VehMetaRow k="Hyperdrive" v={V.hyperdrive} />
                <VehMetaRow k="Sensors" v={V.sensor} />
                <VehMetaRow k="Consumables" v={V.consumables} />
                <VehMetaRow k="Navicomputer" v={V.navicomputer ? "Yes" : "Astromech"} />
                <VehMetaRow k="Crew" v={V.crew} />
                <VehMetaRow k="Passengers" v={V.passengers} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 262, maxWidth: 312, display: "flex" }}><VehCompass zones={zones} /></div>
        </div>

        {/* lower section — tabs fill the remaining width */}
        <div style={{ display: "flex", borderBottom: "2px solid " + VT.accent, marginBottom: 10 }}>
          {[["weapons", "Weapon Systems"], ["attachments", "Attachments"], ["crits", "Critical Hits", V.criticalHits.length]].map(([id, lbl, badge]) => (
            <button key={id} onClick={() => setVtab(id)} style={{ border: "none", cursor: "pointer",
              padding: "7px 20px", fontSize: 11.5, fontFamily: "Orbitron, sans-serif", fontWeight: 600,
              letterSpacing: 1, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 7,
              background: vtab === id ? VT.accent : "transparent", color: vtab === id ? "#fff" : VT.dim,
              clipPath: vtab === id ? "polygon(0 0, calc(100% - 8px) 0, 100% 100%, 0 100%)" : "none" }}>
              {lbl}
              {badge > 0 && (
                <span style={{ minWidth: 17, height: 17, padding: "0 4px", boxSizing: "border-box", borderRadius: 9,
                  background: vtab === id ? "rgba(255,255,255,.9)" : VT.accent, color: vtab === id ? VT.accent : "#fff",
                  fontFamily: "Orbitron", fontWeight: 800, fontSize: 10, display: "inline-flex", alignItems: "center",
                  justifyContent: "center", lineHeight: 1 }}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        {vtab === "weapons" && (
          <div>
            {V.weapons.map((w) => {
              const dark = vehDark(VT);
              return (
                <div key={w.name} className="notch" style={{ background: VT.paper2, border: "1px solid " + VT.line,
                  padding: "9px 12px", marginBottom: 7, display: "grid", gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center", gap: 11 }}>
                  {/* left: icon + name / arc / qualities */}
                  <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                    <ItemIcon size={44} radius={6} tone={dark ? "dark" : "light"} accent={VT.line} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 14.5 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: VT.dim, margin: "2px 0 5px" }}>Fire Arc · {w.arc}</div>
                      <QualityPills items={w.special} theme={VT} />
                    </div>
                  </div>
                  {/* center: DAM / CRIT / RANGE — same labeled columns as personal weapons */}
                  <div style={{ display: "flex" }}>
                    {[["DAM", w.dam], ["CRIT", w.crit], ["RANGE", w.range]].map(([k, v]) => (
                      <div key={k} style={{ textAlign: "center", width: 56 }}>
                        <div style={{ fontSize: 8.5, color: VT.dim, letterSpacing: 1 }}>{k}</div>
                        <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 18, color: VT.accent }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {/* right: empty spacer to keep stats centered (matches personal weapons) */}
                  <div></div>
                </div>
              );
            })}
          </div>
        )}

        {vtab === "attachments" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {V.attachments.map((a) => <window.AttachmentCard key={a.name} name={a.name} desc={a.desc} theme={VT} />)}
          </div>
        )}

        {vtab === "crits" && (
          <window.CriticalList theme={VT} items={V.criticalHits} title="Critical Hits"
            emptyLabel="No critical hits currently sustained." />
        )}
      </div>
    </div>
  );
}

window.CodexVehicle = CodexVehicle;
