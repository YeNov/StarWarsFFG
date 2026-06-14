/* ============================================================
   VARIATION 03 — "FACTION HUD"  ·  Bold reimagining + theming
   ============================================================ */
const { useState: useStateHud } = React;

const FACTIONS = {
  rebel:    { name: "Rebellion",   accent: "#e8853a", accent2: "#ffd27a", glow: "rgba(232,133,58,.18)" },
  imperial: { name: "Empire",      accent: "#c8362a", accent2: "#ff7a6e", glow: "rgba(200,54,42,.18)" },
  bounty:   { name: "Bounty",      accent: "#3fae7a", accent2: "#8ff0c0", glow: "rgba(63,174,122,.16)" },
  jedi:     { name: "Order",       accent: "#4a90d9", accent2: "#9ec9ff", glow: "rgba(74,144,217,.18)" },
};

const hudBase = {
  bg: "#0a0c0f", panel: "#12161b", panel2: "#181d24", line: "#252d36",
  ink: "#e9eef2", dim: "#8794a0", faint: "#566069",
};

function HudHex({ name, value, accent }) {
  return (
    <div style={{ position: "relative", width: 88, height: 96 }}>
      <div style={{ position: "absolute", inset: 0, background: accent,
        clipPath: "polygon(25% 2%, 75% 2%, 100% 50%, 75% 98%, 25% 98%, 0% 50%)" }}></div>
      <div style={{ position: "absolute", inset: 3, background: hudBase.panel2,
        clipPath: "polygon(25% 2%, 75% 2%, 100% 50%, 75% 98%, 25% 98%, 0% 50%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 30, color: hudBase.ink, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 8, letterSpacing: 1.5, color: accent, marginTop: 2, fontFamily: "Orbitron", fontWeight: 700 }}>{window.SWFFG.ABBR[name]}</span>
      </div>
    </div>
  );
}

function HudVital({ label, cur, max, accent }) {
  const segs = max;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: hudBase.dim, fontFamily: "Orbitron", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 12, color: hudBase.ink }}>{cur}<span style={{ color: hudBase.faint }}>/{max}</span></span>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: segs }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 7, transform: "skewX(-18deg)",
            background: i >= cur ? accent : hudBase.line,
            boxShadow: i >= cur ? "0 0 6px " + accent + "66" : "none" }}></div>
        ))}
      </div>
    </div>
  );
}

function HudDiceBuilder({ skill, faction }) {
  const S = window.SWFFG;
  const p = S.pool(skill);
  const dice = S.poolDice(skill);
  const diff = 2; // illustrative target difficulty
  return (
    <div style={{ background: hudBase.panel2, border: "1px solid " + hudBase.line, padding: "14px 16px",
      clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: faction.accent, fontFamily: "Orbitron", fontWeight: 700 }}>DICE POOL</div>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 20, color: hudBase.ink, letterSpacing: .5 }}>{skill.replace("Knowledge: ", "")}</div>
          <div style={{ fontSize: 10.5, color: hudBase.dim, marginTop: 1 }}>{p.characteristic} {S.CHAR.characteristics[p.characteristic]} · {p.rank} rank{p.rank !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: hudBase.faint, letterSpacing: 1 }}>TARGET</div>
          <Difficulty n={diff} fontSize={20} />
        </div>
      </div>
      {/* assembled pool */}
      <div style={{ background: "#06080a", border: "1px solid " + hudBase.line, borderRadius: 4,
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minHeight: 56 }}>
        {dice.map((d, i) => <Die key={i} type={d} fontSize={30} />)}
        <span style={{ color: hudBase.faint, fontSize: 22, margin: "0 2px" }}>+</span>
        {Array.from({ length: diff }).map((_, i) => <Die key={"d" + i} type="difficulty" fontSize={30} />)}
      </div>
      {/* upgrade controls */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {[["Upgrade ability", faction.accent], ["Add boost", hudBase.dim], ["Add setback", hudBase.dim]].map(([t, c]) => (
          <button key={t} style={{ flex: 1, background: "transparent", border: "1px solid " + hudBase.line,
            color: hudBase.dim, fontSize: 9.5, letterSpacing: .5, padding: "6px 4px", cursor: "pointer",
            fontFamily: "Orbitron", fontWeight: 600, textTransform: "uppercase", borderRadius: 3 }}>{t}</button>
        ))}
        <button style={{ flex: 1.2, background: faction.accent, border: "none", color: "#0a0c0f",
          fontSize: 11, letterSpacing: 1, padding: "6px 4px", cursor: "pointer", fontFamily: "Orbitron",
          fontWeight: 900, textTransform: "uppercase", borderRadius: 3 }}>Roll</button>
      </div>
    </div>
  );
}

function HudSheet() {
  const C = window.SWFFG.CHAR;
  const S = window.SWFFG;
  const [fk, setFk] = useStateHud("bounty");
  const [skill, setSkill] = useStateHud("Skulduggery");
  const faction = FACTIONS[fk];

  // skills the character actually has ranks in or that are career — the "active" list
  const allSkills = [...S.SKILL_GROUPS.Combat, ...S.SKILL_GROUPS.General, ...S.SKILL_GROUPS.Social, ...S.SKILL_GROUPS.Knowledge];
  const ranked = allSkills.filter((s) => S.skillRank(s) > 0 || S.isCareer(s));

  return (
    <div style={{ width: 1000, height: 920, background: hudBase.bg, color: hudBase.ink,
      fontFamily: "Signika, sans-serif", padding: 16, position: "relative", overflow: "hidden",
      backgroundImage: `radial-gradient(700px 420px at 12% -8%, ${faction.glow}, transparent 60%),
        radial-gradient(700px 500px at 110% 110%, ${faction.glow}, transparent 60%)` }}>

      {/* faction switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 9.5, letterSpacing: 3, color: hudBase.faint, fontFamily: "Orbitron", fontWeight: 600 }}>ALLEGIANCE THEME</div>
        <div style={{ display: "flex", gap: 4 }}>
          {Object.entries(FACTIONS).map(([k, f]) => (
            <button key={k} onClick={() => setFk(k)} style={{
              background: fk === k ? f.accent : "transparent", color: fk === k ? "#0a0c0f" : hudBase.dim,
              border: "1px solid " + (fk === k ? f.accent : hudBase.line), cursor: "pointer",
              fontFamily: "Orbitron", fontWeight: 700, fontSize: 10, letterSpacing: 1, padding: "5px 14px",
              textTransform: "uppercase", clipPath: "polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)" }}>{f.name}</button>
          ))}
        </div>
      </div>

      {/* HUD header */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        <image-slot id="hud-portrait" shape="rect"
          style={{ width: 110, height: 124, flex: "none", clipPath: "polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)", border: "1px solid " + faction.accent }}
          placeholder="Portrait"></image-slot>
        <div style={{ flex: 1, background: hudBase.panel, border: "1px solid " + hudBase.line, padding: "12px 18px",
          clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: faction.accent }}></div>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 32, letterSpacing: 1.5, textTransform: "uppercase", lineHeight: 1 }}>{C.name}</div>
          <div style={{ fontSize: 11.5, color: faction.accent2, letterSpacing: 2, marginTop: 5, fontFamily: "Orbitron", fontWeight: 500 }}>{C.archetype.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
            <HudMeta k="Credits" v={C.credits.toLocaleString()} accent={faction.accent2} />
            <HudMeta k="XP" v={C.xp.available + " / " + C.xp.total} accent={faction.accent2} />
            <HudMeta k="Force" v={C.forceRating} accent={faction.accent2} />
            <HudMeta k="Soak" v={C.derived.soak} accent={faction.accent2} />
            <HudMeta k="Defence" v={C.derived.defenceRanged + " / " + C.derived.defenceMelee} accent={faction.accent2} />
          </div>
        </div>
      </div>

      {/* hex cluster + vitals */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14,
        background: hudBase.panel, border: "1px solid " + hudBase.line, padding: "12px 16px",
        clipPath: "polygon(0 0,100% 0,100% 100%,16px 100%,0 calc(100% - 16px))" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(C.characteristics).map(([n, v]) => <HudHex key={n} name={n} value={v} accent={faction.accent} />)}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, paddingLeft: 8 }}>
          <HudVital label="Wounds" cur={C.derived.woundCurrent} max={C.derived.woundThreshold} accent={faction.accent} />
          <HudVital label="Strain" cur={C.derived.strainCurrent} max={C.derived.strainThreshold} accent={faction.accent2} />
        </div>
      </div>

      {/* main: skill list (clickable) + builder + loadout */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
        {/* skill selector */}
        <div style={{ background: hudBase.panel, border: "1px solid " + hudBase.line, padding: 12,
          clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 10, letterSpacing: 2,
            color: faction.accent, textTransform: "uppercase", marginBottom: 8 }}>Trained Skills · tap to build</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflow: "hidden" }}>
            {ranked.map((sk) => {
              const sel = sk === skill;
              return (
                <button key={sk} onClick={() => setSkill(sk)} style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", gap: 8, background: sel ? faction.accent : "transparent",
                  border: "none", borderLeft: "3px solid " + (sel ? faction.accent2 : (S.isCareer(sk) ? faction.accent : "transparent")),
                  color: sel ? "#0a0c0f" : hudBase.ink, cursor: "pointer", padding: "5px 9px", textAlign: "left",
                  fontFamily: "Signika", fontSize: 11.5 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    {sk.replace("Knowledge: ", "")}
                    <span style={{ fontSize: 8, opacity: .7, fontFamily: "Orbitron" }}>{S.ABBR[S.CHAR_OF[sk]]}</span>
                  </span>
                  <span style={{ display: "flex", gap: 1.5 }}>
                    {Array.from({ length: S.skillRank(sk) }).map((_, i) => (
                      <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: sel ? "#0a0c0f" : faction.accent }}></span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* right column: builder + loadout */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <HudDiceBuilder skill={skill} faction={faction} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* weapons */}
            <div style={{ background: hudBase.panel, border: "1px solid " + hudBase.line, padding: 12 }}>
              <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5, letterSpacing: 2, color: faction.accent, textTransform: "uppercase", marginBottom: 8 }}>Weapons</div>
              {C.weapons.map((w) => (
                <div key={w.name} style={{ marginBottom: 9 }}>
                  <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11.5 }}>{w.name}</div>
                  <div style={{ fontSize: 10, color: hudBase.dim, marginTop: 2 }}>DAM {w.dam} · CRIT {w.crit} · {w.range}</div>
                </div>
              ))}
            </div>
            {/* talents */}
            <div style={{ background: hudBase.panel, border: "1px solid " + hudBase.line, padding: 12 }}>
              <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 9.5, letterSpacing: 2, color: faction.accent, textTransform: "uppercase", marginBottom: 8 }}>Talents</div>
              {C.talents.slice(0, 4).map((t) => (
                <div key={t.name} style={{ fontSize: 11, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>{t.name}{t.ranked ? " " + t.rank : ""}</span>
                  <span style={{ fontSize: 8, color: hudBase.faint, letterSpacing: 1, textTransform: "uppercase" }}>{t.act}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HudMeta({ k, v, accent }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, letterSpacing: 1.5, color: hudBase.faint, textTransform: "uppercase" }}>{k}</div>
      <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 15, color: accent }}>{v}</div>
    </div>
  );
}

window.HudSheet = HudSheet;
