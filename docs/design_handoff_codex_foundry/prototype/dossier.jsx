/* ============================================================
   VARIATION 05 — "DOSSIER"  ·  Editorial profile, item-forward
   Magazine hierarchy with large item imagery (image-slots the
   user can fill). Warm dark + parchment, oxblood + brass.
   ============================================================ */
const dos = {
  bg: "#14110d", band: "#1d1812", paper: "#ece6d8", paper2: "#f4efe4",
  ink: "#1c1814", inkDim: "#6b6457", cream: "#e9e3d4", creamDim: "#a89e89",
  line: "#332b20", lineLt: "#d8d0bf", oxblood: "#8a1714", brass: "#c8a24a",
};

function DosStamp({ k, v, accent }) {
  return (
    <div style={{ textAlign: "center", minWidth: 60 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: dos.creamDim, textTransform: "uppercase", fontFamily: "Orbitron" }}>{k}</div>
      <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 22, color: accent || dos.cream, lineHeight: 1.2 }}>{v}</div>
    </div>
  );
}

function DosBar({ label, cur, max, color }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.5, color: dos.creamDim, fontFamily: "Orbitron", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12, color: dos.cream }}>{cur} / {max}</span>
      </div>
      <div style={{ height: 8, background: "#0c0a07", border: "1px solid " + dos.line, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: ((max - cur) / max * 100) + "%", background: color }}></div>
      </div>
    </div>
  );
}

function DosItemCard({ slotId, name, kicker, stats, pills }) {
  return (
    <div style={{ flex: 1, background: dos.paper, border: "1px solid " + dos.lineLt, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <image-slot id={slotId} shape="rect" style={{ width: "100%", height: 104, display: "block", borderBottom: "2px solid " + dos.oxblood }}
        placeholder={kicker}></image-slot>
      <div style={{ padding: "9px 11px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 8.5, letterSpacing: 2, color: dos.oxblood, textTransform: "uppercase", fontFamily: "Orbitron", fontWeight: 700 }}>{kicker}</div>
        <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 14, color: dos.ink, lineHeight: 1.1, marginTop: 2 }}>{name}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
          {stats.map(([k, v]) => (
            <span key={k}><span style={{ fontSize: 8, color: dos.inkDim, letterSpacing: 1 }}>{k} </span>
              <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 14, color: dos.oxblood }}>{v}</span></span>
          ))}
        </div>
        {pills && <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {pills.map((p) => <span key={p} style={{ fontSize: 9, background: "#efe7d2", border: "1px solid " + dos.brass,
            color: "#7a5a1e", borderRadius: 10, padding: "2px 8px", display: "inline-flex", alignItems: "center", lineHeight: 1, whiteSpace: "nowrap" }}>{p}</span>)}
        </div>}
      </div>
    </div>
  );
}

function DossierSheet() {
  const C = window.SWFFG.CHAR;
  const S = window.SWFFG;
  const G = S.SKILL_GROUPS;
  const D = C.derived;

  const SkillCol = ({ skills }) => (
    <div>
      {skills.map((sk) => {
        const career = S.isCareer(sk);
        return (
          <div key={sk} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0",
            borderBottom: "1px solid " + dos.line }}>
            <span style={{ flex: 1, fontSize: 12, color: career ? dos.brass : dos.cream, fontWeight: career ? 600 : 400,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sk.replace("Knowledge: ", "")}</span>
            <span style={{ display: "flex", gap: 1.5 }}>
              {Array.from({ length: S.skillRank(sk) }).map((_, i) => (
                <span key={i} style={{ width: 5, height: 5, transform: "rotate(45deg)", background: dos.brass }}></span>
              ))}
            </span>
            <span style={{ width: 56, textAlign: "right" }}><DicePool skill={sk} fontSize={13} empty="·" /></span>
          </div>
        );
      })}
    </div>
  );

  const SectionLabel = ({ children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 11px" }}>
      <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12, letterSpacing: 3, color: dos.brass, textTransform: "uppercase" }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: dos.line }}></span>
    </div>
  );

  return (
    <div style={{ width: 1000, height: 1040, background: dos.bg, color: dos.cream, fontFamily: "Signika, sans-serif",
      padding: 26, overflow: "hidden" }}>

      {/* ===== HERO ===== */}
      <div style={{ display: "flex", gap: 22, paddingBottom: 20, borderBottom: "2px solid " + dos.oxblood }}>
        <image-slot id="dos-portrait" shape="rect" style={{ width: 168, height: 210, flex: "none", border: "1px solid " + dos.line }}
          placeholder="Character portrait"></image-slot>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: dos.brass, fontFamily: "Orbitron", fontWeight: 600 }}>PERSONNEL DOSSIER · {C.species.toUpperCase()}</div>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 52, letterSpacing: 1, textTransform: "uppercase", lineHeight: .98, color: "#fff", marginTop: 6 }}>{C.name}</div>
          <div style={{ fontSize: 14, letterSpacing: 2, color: dos.cream, marginTop: 7, fontFamily: "Orbitron", fontWeight: 500 }}>{C.archetype.toUpperCase()}</div>
          <div style={{ fontSize: 14, fontStyle: "italic", color: dos.creamDim, marginTop: 10, maxWidth: 520 }}>“{C.tagline}”</div>
          <div style={{ display: "flex", gap: 26, marginTop: "auto", paddingTop: 14 }}>
            <DosStamp k="Soak" v={D.soak} accent={dos.brass} />
            <DosStamp k="Defence" v={D.defenceRanged + " / " + D.defenceMelee} accent={dos.brass} />
            <DosStamp k="Force" v={C.forceRating} accent={dos.brass} />
            <DosStamp k="XP" v={C.xp.available} accent={dos.brass} />
            <DosStamp k="Credits" v={C.credits.toLocaleString()} accent={dos.brass} />
          </div>
        </div>
      </div>

      {/* ===== CHARACTERISTICS + VITALS ===== */}
      <div style={{ display: "flex", gap: 24, margin: "18px 0", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 0, flex: "none" }}>
          {Object.entries(C.characteristics).map(([n, v], i) => (
            <div key={n} style={{ textAlign: "center", padding: "0 16px", borderRight: i < 5 ? "1px solid " + dos.line : "none" }}>
              <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 30, color: "#fff", lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 8.5, letterSpacing: 1.5, color: dos.creamDim, marginTop: 4, fontFamily: "Orbitron", fontWeight: 600 }}>{S.ABBR[n]}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <DosBar label="Wounds" cur={D.woundCurrent} max={D.woundThreshold} color={dos.oxblood} />
          <DosBar label="Strain" cur={D.strainCurrent} max={D.strainThreshold} color={dos.brass} />
        </div>
      </div>

      {/* ===== LOADOUT GALLERY (big item imagery) ===== */}
      <SectionLabel>Loadout</SectionLabel>
      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        <DosItemCard slotId="dos-w1" kicker="Ranged · Light" name={C.weapons[0].name}
          stats={[["DAM", C.weapons[0].dam], ["CRIT", C.weapons[0].crit], ["RNG", C.weapons[0].range]]} pills={C.weapons[0].special} />
        <DosItemCard slotId="dos-w2" kicker="Melee" name={C.weapons[1].name}
          stats={[["DAM", C.weapons[1].dam], ["CRIT", C.weapons[1].crit], ["RNG", C.weapons[1].range]]} pills={C.weapons[1].special} />
        <DosItemCard slotId="dos-armor" kicker="Armor" name={C.armor.name}
          stats={[["SOAK", "+" + C.armor.soak], ["DEF", "+" + C.armor.defence]]} pills={["Equipped"]} />
      </div>

      {/* ===== SKILLS + TALENTS ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 26 }}>
        <div>
          <SectionLabel>Skills</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
            <SkillCol skills={[...G.General].slice(0, 9)} />
            <SkillCol skills={[...G.General.slice(9), ...G.Combat]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px", marginTop: 4 }}>
            <SkillCol skills={G.Social} />
            <SkillCol skills={G.Knowledge} />
          </div>
        </div>
        <div>
          <SectionLabel>Talents</SectionLabel>
          {C.talents.map((t) => (
            <div key={t.name} style={{ marginBottom: 11, borderBottom: "1px solid " + dos.line, paddingBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 12, color: dos.cream }}>{t.name}{t.ranked ? " " + t.rank : ""}</span>
                <span style={{ fontSize: 8, color: dos.creamDim, letterSpacing: 1, textTransform: "uppercase" }}>{t.act}</span>
              </div>
              <div style={{ fontSize: 11, color: dos.creamDim, marginTop: 2, lineHeight: 1.4 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.DossierSheet = DossierSheet;
