/* ============================================================
   VARIATION 01 — "CODEX"  ·  Faithful refresh, durasteel light
   ============================================================ */
const { useState: useStateCodex } = React;

const codexT = {
  bg: "#d7d3ca", paper: "#ece8df", paper2: "#f5f2ea", ink: "#1c1814", dim: "#6b6458",
  line: "#bdb6a8", oxblood: "#791311", brown: "#5a3a1e", brass: "#a87f2e",
  chipLabel: "#171310", career: "#f3e6c4", careerLine: "#caa64e",
};

function CdxNotchHeader({ children, bg = codexT.oxblood, color = "#fff", style }) {
  return (
    <div className="notch" style={{
      background: bg, color, textTransform: "uppercase", letterSpacing: "1.5px",
      fontFamily: "Orbitron, sans-serif", fontWeight: 700, fontSize: 11,
      padding: "5px 12px", ...style,
    }}>{children}</div>
  );
}

function CdxChar({ name }) {
  const val = window.SWFFG.CHAR.characteristics[name];
  const abbr = window.SWFFG.ABBR[name];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
      <div style={{ width: 78, height: 78, borderRadius: 14, border: "4px double " + codexT.ink,
        background: codexT.paper2, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", boxShadow: "inset 0 2px 6px rgba(0,0,0,.12)" }}>
        <span style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 38, color: codexT.ink }}>{val}</span>
      </div>
      <div className="notch" style={{ marginTop: -10, background: codexT.chipLabel, color: "#fff",
        fontSize: 10, letterSpacing: 1.5, padding: "3px 14px", textTransform: "uppercase",
        fontFamily: "Orbitron, sans-serif", fontWeight: 600, zIndex: 2 }}>{name}</div>
      <div style={{ fontSize: 9, color: codexT.dim, marginTop: 4, letterSpacing: 1 }}>{abbr}</div>
    </div>
  );
}

function CdxStat({ label, children, sub, wide }) {
  return (
    <div style={{ flex: wide ? 1.4 : 1, background: codexT.paper, border: "1px solid " + codexT.line,
      display: "flex", flexDirection: "column", minWidth: 0 }}>
      <CdxNotchHeader bg={codexT.brown} style={{ fontSize: 9.5, padding: "4px 8px", borderRadius: 0 }}>{label}</CdxNotchHeader>
      <div style={{ padding: "8px 6px", textAlign: "center", flex: 1, display: "flex",
        flexDirection: "column", justifyContent: "center" }}>
        {children}
        {sub && <div style={{ fontSize: 9, color: codexT.dim, marginTop: 2, letterSpacing: .5 }}>{sub}</div>}
      </div>
    </div>
  );
}

function CdxBigVal({ a, b }) {
  return (
    <div style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, color: codexT.ink, lineHeight: 1 }}>
      <span style={{ fontSize: 30 }}>{a}</span>
      {b != null && <span style={{ fontSize: 16, color: codexT.dim }}> / {b}</span>}
    </div>
  );
}

function CdxSkillTable({ title, skills }) {
  const S = window.SWFFG;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 26px 54px 1fr", background: codexT.oxblood,
        color: "#fff", fontFamily: "Orbitron, sans-serif", fontWeight: 600, fontSize: 9, letterSpacing: .5,
        textTransform: "uppercase" }}>
        <div style={{ padding: "4px 8px" }}>{title}</div>
        <div style={{ padding: "4px 2px", textAlign: "center" }}>C</div>
        <div style={{ padding: "4px 2px", textAlign: "center" }}>Rank</div>
        <div style={{ padding: "4px 8px" }}>Pool</div>
      </div>
      {skills.map((sk, i) => {
        const rank = S.skillRank(sk);
        const career = S.isCareer(sk);
        const ch = S.CHAR_OF[sk];
        return (
          <div key={sk} style={{ display: "grid", gridTemplateColumns: "1fr 26px 54px 1fr",
            alignItems: "center", background: i % 2 ? codexT.paper : codexT.paper2,
            borderLeft: career ? "3px solid " + codexT.careerLine : "3px solid transparent",
            minHeight: 24 }}>
            <div style={{ padding: "3px 6px 3px 8px", fontSize: 11.5, color: codexT.ink,
              display: "flex", alignItems: "baseline", gap: 5 }}>
              <span>{sk.replace("Knowledge: ", "")}</span>
              <span style={{ fontSize: 8.5, color: codexT.dim, letterSpacing: .5 }}>{S.ABBR[ch]}</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: career ? codexT.careerLine : "transparent",
                border: "1px solid " + (career ? codexT.careerLine : codexT.line) }}></span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, p) => (
                <span key={p} style={{ width: 6, height: 6, transform: "rotate(45deg)",
                  background: p < rank ? codexT.oxblood : "transparent",
                  border: "1px solid " + (p < rank ? codexT.oxblood : codexT.line) }}></span>
              ))}
            </div>
            <div style={{ padding: "2px 8px" }}><DicePool skill={sk} fontSize={14} /></div>
          </div>
        );
      })}
    </div>
  );
}

function CodexSheet() {
  const C = window.SWFFG.CHAR;
  const G = window.SWFFG.SKILL_GROUPS;
  const [tab, setTab] = useStateCodex("skills");
  const tabs = [["skills", "Skills"], ["combat", "Combat"], ["talents", "Talents"], ["gear", "Gear"], ["bio", "Bio"]];

  return (
    <div style={{ width: 1000, background: codexT.bg, color: codexT.ink,
      fontFamily: "Signika, sans-serif", padding: 14,
      backgroundImage: "repeating-linear-gradient(135deg, rgba(0,0,0,.018) 0 12px, transparent 12px 24px)" }}>

      {/* ===== Header band ===== */}
      <div className="notch" style={{ background: "linear-gradient(180deg,#8a1714,#6c1110)",
        display: "flex", gap: 14, padding: 14, alignItems: "stretch", color: "#fff" }}>
        <image-slot id="cdx-portrait" shape="rounded" radius="6"
          style={{ width: 104, height: 124, flex: "none", border: "2px solid rgba(255,255,255,.35)" }}
          placeholder="Portrait"></image-slot>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Orbitron, sans-serif", fontWeight: 900, fontSize: 30,
            letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>{C.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
            {[C.species, C.career, C.specialization].map((p, i) => (
              <span key={i} className="notch" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.3)",
                fontSize: 10.5, padding: "3px 11px", letterSpacing: .5, textTransform: "uppercase",
                fontFamily: "Orbitron, sans-serif", fontWeight: 500 }}>{p}</span>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, fontStyle: "italic", opacity: .92, maxWidth: 460 }}>
            “{C.tagline}”</div>
          <div style={{ marginTop: 8, fontSize: 10.5, letterSpacing: .5, opacity: .85 }}>
            <b style={{ fontFamily: "Orbitron", fontWeight: 600 }}>{C.motivation.type.toUpperCase()}</b> · {C.motivation.value}</div>
        </div>
        {/* right meta column */}
        <div style={{ flex: "none", width: 168, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="notch" style={{ background: "rgba(0,0,0,.25)", padding: "7px 12px",
            display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 9.5, letterSpacing: 1, opacity: .8 }}>XP AVAILABLE</span>
            <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 19 }}>{C.xp.available}</span>
          </div>
          <div className="notch" style={{ background: "rgba(0,0,0,.25)", padding: "7px 12px",
            display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 9.5, letterSpacing: 1, opacity: .8 }}>XP TOTAL</span>
            <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 15 }}>{C.xp.total}</span>
          </div>
          <div className="notch" style={{ background: codexT.brass, color: "#1c1208", padding: "7px 12px",
            display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 9.5, letterSpacing: 1, fontWeight: 700 }}>CREDITS</span>
            <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 16 }}>{C.credits.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ===== Characteristics ===== */}
      <div style={{ display: "flex", gap: 4, margin: "14px 0 12px", justifyContent: "space-between" }}>
        {Object.keys(C.characteristics).map((n) => <CdxChar key={n} name={n} />)}
      </div>

      {/* ===== Derived stats ===== */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        <CdxStat label="Soak"><CdxBigVal a={C.derived.soak} /></CdxStat>
        <CdxStat label="Wounds" wide sub="current / threshold"><CdxBigVal a={C.derived.woundCurrent} b={C.derived.woundThreshold} /></CdxStat>
        <CdxStat label="Strain" wide sub="current / threshold"><CdxBigVal a={C.derived.strainCurrent} b={C.derived.strainThreshold} /></CdxStat>
        <CdxStat label="Defence" wide sub="ranged / melee"><CdxBigVal a={C.derived.defenceRanged} b={C.derived.defenceMelee} /></CdxStat>
        <CdxStat label="Encumb." wide sub="used / max"><CdxBigVal a={C.derived.encumbrance} b={C.derived.encumbranceMax} /></CdxStat>
        <CdxStat label="Force"><CdxBigVal a={C.forceRating} /></CdxStat>
      </div>

      {/* ===== Tabs ===== */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid " + codexT.oxblood, marginBottom: 12 }}>
        {tabs.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            border: "none", cursor: "pointer", padding: "7px 18px", fontSize: 11,
            fontFamily: "Orbitron, sans-serif", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
            background: tab === id ? codexT.oxblood : "transparent", color: tab === id ? "#fff" : codexT.dim,
            clipPath: tab === id ? "polygon(0 0, calc(100% - 8px) 0, 100% 100%, 0 100%)" : "none",
          }}>{lbl}</button>
        ))}
      </div>

      {/* ===== Tab body ===== */}
      {tab === "skills" && (
        <div style={{ display: "flex", gap: 10 }}>
          <CdxSkillTable title="General" skills={G.General} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <CdxSkillTable title="Combat" skills={G.Combat} />
            <CdxSkillTable title="Social" skills={G.Social} />
            <CdxSkillTable title="Knowledge" skills={G.Knowledge} />
          </div>
        </div>
      )}

      {tab === "combat" && <CdxCombat />}
      {tab === "talents" && <CdxTalents />}
      {tab === "gear" && <CdxGear />}
      {tab === "bio" && <CdxBio />}
    </div>
  );
}

function CdxCard({ children }) {
  return <div className="notch" style={{ background: codexT.paper2, border: "1px solid " + codexT.line, padding: 12, marginBottom: 10 }}>{children}</div>;
}

function CdxCombat() {
  const C = window.SWFFG.CHAR;
  return (
    <div>
      <CdxNotchHeader style={{ display: "inline-block", marginBottom: 10 }}>Weapons</CdxNotchHeader>
      {C.weapons.map((w) => (
        <div key={w.name} className="notch" style={{ background: codexT.paper2, border: "1px solid " + codexT.line,
          padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 14, color: codexT.ink }}>{w.name}</div>
            <div style={{ fontSize: 10.5, color: codexT.dim, marginTop: 2 }}>{w.skill} · <DicePool skill={w.skill} fontSize={13} /></div>
          </div>
          {[["DAM", w.dam], ["CRIT", w.crit], ["RANGE", w.range]].map(([k, v]) => (
            <div key={k} style={{ textAlign: "center", minWidth: 52 }}>
              <div style={{ fontSize: 8.5, color: codexT.dim, letterSpacing: 1 }}>{k}</div>
              <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 18, color: codexT.oxblood }}>{v}</div>
            </div>
          ))}
          <div style={{ flex: 1.2, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {w.special.map((s) => <span key={s} style={{ fontSize: 9.5, background: codexT.career,
              border: "1px solid " + codexT.careerLine, borderRadius: 10, padding: "2px 9px", color: codexT.brown }}>{s}</span>)}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <CdxCard>
          <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: codexT.brown, textTransform: "uppercase" }}>Armor</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{C.armor.name} — Soak +{C.armor.soak}, Defence +{C.armor.defence}</div>
        </CdxCard>
        <CdxCard>
          <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: codexT.brown, textTransform: "uppercase" }}>Critical Injuries</div>
          <div style={{ fontSize: 13, marginTop: 4, color: codexT.dim, fontStyle: "italic" }}>None currently</div>
        </CdxCard>
      </div>
    </div>
  );
}

function CdxTalents() {
  const C = window.SWFFG.CHAR;
  const tierColor = { 1: "#7a2c12", 2: "#5a3a1e", 3: "#3a3550" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {C.talents.map((t) => (
        <div key={t.name} className="notch" style={{ background: codexT.paper2, border: "1px solid " + codexT.line, overflow: "hidden" }}>
          <div className="notch-top" style={{ background: tierColor[t.tier] || codexT.oxblood, color: "#fff",
            padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12.5, letterSpacing: .5 }}>{t.name}{t.ranked ? " " + t.rank : ""}</span>
            <span style={{ fontSize: 9, letterSpacing: 1, opacity: .85 }}>TIER {t.tier} · {t.act.toUpperCase()}</span>
          </div>
          <div style={{ padding: "8px 12px 10px", fontSize: 11.5, color: codexT.ink, lineHeight: 1.45 }}>{t.desc}</div>
        </div>
      ))}
      <div className="notch" style={{ gridColumn: "1 / -1", background: "#efe7d2", border: "1px solid " + codexT.careerLine, padding: 12 }}>
        <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: codexT.brown, textTransform: "uppercase", marginBottom: 4 }}>Force Rating {C.force.rating} · {C.force.power}</div>
        <div style={{ fontSize: 12, color: codexT.ink }}>{C.force.desc}</div>
      </div>
    </div>
  );
}

function CdxGear() {
  const C = window.SWFFG.CHAR;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", background: codexT.oxblood, color: "#fff",
        fontFamily: "Orbitron", fontWeight: 600, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase" }}>
        <div style={{ padding: "5px 12px" }}>Item</div>
        <div style={{ padding: "5px 8px", textAlign: "center" }}>Qty</div>
        <div style={{ padding: "5px 8px", textAlign: "center" }}>Enc</div>
      </div>
      {C.gear.map((g, i) => (
        <div key={g.name} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", alignItems: "center",
          background: i % 2 ? codexT.paper : codexT.paper2, borderBottom: "1px solid " + codexT.line }}>
          <div style={{ padding: "6px 12px", fontSize: 12.5 }}>{g.name}</div>
          <div style={{ textAlign: "center", fontFamily: "Orbitron", fontWeight: 700, fontSize: 13 }}>{g.qty}</div>
          <div style={{ textAlign: "center", fontSize: 12, color: codexT.dim }}>{g.enc}</div>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 10, fontSize: 11.5, color: codexT.dim }}>
        <span>Total encumbrance: <b style={{ color: codexT.ink }}>{C.derived.encumbrance} / {C.derived.encumbranceMax}</b></span>
        <span>Credits: <b style={{ color: codexT.brass }}>{C.credits.toLocaleString()}</b></span>
      </div>
    </div>
  );
}

function CdxBio() {
  const C = window.SWFFG.CHAR;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
      <CdxCard>
        <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: codexT.brown, textTransform: "uppercase", marginBottom: 6 }}>Background</div>
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>{C.bio}</div>
      </CdxCard>
      <CdxCard>
        <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1, color: codexT.brown, textTransform: "uppercase", marginBottom: 6 }}>Obligation</div>
        {C.obligations.map((o) => (
          <div key={o.type} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px dashed " + codexT.line, fontSize: 12.5 }}>
            <span>{o.type} <span style={{ color: codexT.dim, fontSize: 11 }}>· {o.note}</span></span>
            <b style={{ fontFamily: "Orbitron" }}>{o.magnitude}</b>
          </div>
        ))}
      </CdxCard>
    </div>
  );
}

window.CodexSheet = CodexSheet;
