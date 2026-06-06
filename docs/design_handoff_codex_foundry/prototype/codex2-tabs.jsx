/* ============================================================
   CODEX II — Tab content components (Skills, Combat, Injuries,
   Talents, Gear, Bio). Each receives `theme` as a prop.
   ============================================================ */

/* ---- Skills ---- */
function Cdx2SkillRow({ skill, theme, isLast }) {
  const S = window.SWFFG;
  const TH = theme;
  const rank = S.skillRank(skill);
  const career = S.isCareer(skill);
  const ch = S.CHAR_OF[skill];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 58px 1fr", alignItems: "center",
      background: career ? TH.career : TH.paper,
      borderLeft: "3px solid " + (career ? TH.careerLine : "transparent"),
      borderBottom: isLast ? "none" : "1px solid " + TH.line, minHeight: 26 }}>
      <div style={{ padding: "3px 6px 3px 8px", fontSize: 11, color: TH.ink, display: "flex", alignItems: "baseline", gap: 5 }}>
        <span>{skill.replace("Knowledge: ", "Kn: ")}</span>
        <span style={{ fontSize: 8, color: TH.dim, letterSpacing: .5 }}>{S.ABBR[ch]}</span>
      </div>
      <div style={{ textAlign: "center" }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: career ? TH.careerLine : "transparent",
          border: "1.5px solid " + (career ? TH.careerLine : TH.line) }}></span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
        {Array.from({ length: 5 }).map((_, p) => (
          <span key={p} style={{ width: 6, height: 6, transform: "rotate(45deg)",
            background: p < rank ? TH.accent : "transparent",
            border: "1px solid " + (p < rank ? TH.accent : TH.line) }}></span>
        ))}
      </div>
      <div style={{ padding: "2px 8px" }}>
        <DicePool skill={skill} fontSize={13} />
      </div>
    </div>
  );
}

function Cdx2SkillTable({ title, skills, theme }) {
  const TH = theme;
  return (
    <div style={{ flex: 1, minWidth: 0, marginBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 58px 1fr",
        background: TH.accent, color: "#fff", fontFamily: "Orbitron, sans-serif",
        fontWeight: 600, fontSize: 9, letterSpacing: .5, textTransform: "uppercase" }}>
        <div style={{ padding: "4px 8px" }}>{title}</div>
        <div style={{ padding: "4px 2px", textAlign: "center" }}>C</div>
        <div style={{ padding: "4px 2px", textAlign: "center" }}>Rank</div>
        <div style={{ padding: "4px 8px" }}>Pool</div>
      </div>
      {skills.map((sk, i) => (
        <Cdx2SkillRow key={sk} skill={sk} theme={TH} isLast={i === skills.length - 1} />
      ))}
    </div>
  );
}

function Cdx2Skills({ theme }) {
  const G = window.SWFFG.SKILL_GROUPS;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ flex: 1.2, minWidth: 0 }}>
        <Cdx2SkillTable title="General" skills={G.General} theme={theme} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Cdx2SkillTable title="Combat" skills={G.Combat} theme={theme} />
        <Cdx2SkillTable title="Social" skills={G.Social} theme={theme} />
        <Cdx2SkillTable title="Knowledge" skills={G.Knowledge} theme={theme} />
      </div>
    </div>
  );
}

/* ---- Combat ---- */
function Cdx2ArmorRow({ armor, theme }) {
  const TH = theme;
  const dark = TH.bg === "#0e0b0b";
  const [equipped, setEquipped] = React.useState(armor.equipped !== false);
  return (
    <div className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line,
      padding: "9px 12px", display: "grid", gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center", gap: 11, opacity: equipped ? 1 : 0.72 }}>
      {/* left: icon + equip + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <ItemIcon size={44} radius={6} tone={dark ? "dark" : "light"} accent={TH.line} />
        <button title={equipped ? "Equipped — click to unequip" : "Not equipped — click to equip"} onClick={() => setEquipped((v) => !v)}
          style={{ width: 30, height: 30, flex: "none", cursor: "pointer", borderRadius: 5, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "1px solid " + (equipped ? TH.accent : TH.line), background: equipped ? TH.accent : "transparent",
            color: equipped ? "#fff" : TH.dim }}>
          <window.WR_Hand />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 14.5 }}>{armor.name}</div>
          <div style={{ fontSize: 11, color: TH.dim, marginTop: 2 }}>Worn armour</div>
        </div>
      </div>
      {/* center: SOAK / DEF / ENC */}
      <div style={{ display: "flex" }}>
        {[["SOAK", "+" + armor.soak], ["DEF", "+" + armor.defence], ["ENC", armor.enc != null ? armor.enc : "—"]].map(([k, v]) => (
          <div key={k} style={{ textAlign: "center", width: 62, padding: "0 2px" }}>
            <div style={{ fontSize: 8.5, color: TH.dim, letterSpacing: 1 }}>{k}</div>
            <div style={{ fontFamily: "Orbitron", fontWeight: 900,
              fontSize: String(v).length > 4 ? 12 : 18, color: TH.accent, whiteSpace: "nowrap", lineHeight: 1.5 }}>{v}</div>
          </div>
        ))}
      </div>
      {/* right: spacer to keep stats centered (matches weapons) */}
      <div></div>
    </div>
  );
}

function Cdx2Combat({ theme }) {
  const TH = theme;
  const C = window.SWFFG.CHAR;
  return (
    <div>
      <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
        color: TH.brown, textTransform: "uppercase", marginBottom: 10 }}>Weapons</div>
      {C.weapons.map((w) => (
        <WeaponRow key={w.name} w={w} theme={TH} />
      ))}
      <div style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
        color: TH.brown, textTransform: "uppercase", margin: "12px 0 10px" }}>Armor</div>
      <Cdx2ArmorRow armor={C.armor} theme={TH} />
    </div>
  );
}

/* ---- Injuries ---- */
function Cdx2Injuries({ theme }) {
  const C = window.SWFFG.CHAR;
  return <CriticalList items={C.criticalInjuries} theme={theme} />;
}

/* ---- Talents ---- */
function Cdx2Talents({ theme }) {
  const TH = theme;
  const C = window.SWFFG.CHAR;
  const tierBg = (t) => [TH.accent, TH.brown, TH.accent2, "#4a3a88", "#2a5a38"][t - 1] || TH.accent;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {C.talents.map((t) => (
          <div key={t.name} className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line, overflow: "hidden" }}>
            <div className="notch-top" style={{ background: tierBg(t.tier), color: "#fff",
              padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12.5 }}>
                {t.name}{t.ranked ? " " + t.rank : ""}
              </span>
              <span style={{ fontSize: 8.5, letterSpacing: 1, opacity: .85 }}>T{t.tier} · {t.act.toUpperCase()}</span>
            </div>
            <div style={{ padding: "8px 12px 10px", fontSize: 12, color: TH.ink, lineHeight: 1.45 }}>{t.desc}</div>
          </div>
        ))}
      </div>
      <div className="notch" style={{ background: TH.career, border: "1px solid " + TH.careerLine, overflow: "hidden" }}>
        <div className="notch-top" style={{ background: "#5b4bb3", color: "#fff", fontFamily: "Orbitron",
          fontWeight: 700, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", padding: "5px 12px" }}>
          Force Rating {C.force.rating} · {C.force.power}
        </div>
        <div style={{ padding: "8px 14px 10px", fontSize: 12.5, color: TH.ink, lineHeight: 1.5 }}>{C.force.desc}</div>
      </div>
    </div>
  );
}

/* ---- Gear ---- */
function Cdx2Gear({ theme, credits, setCredits }) {
  const TH = theme;
  const C = window.SWFFG.CHAR;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px",
        background: TH.accent, color: "#fff", fontFamily: "Orbitron", fontWeight: 600,
        fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase" }}>
        <div style={{ padding: "5px 12px" }}>Item</div>
        <div style={{ padding: "5px 8px", textAlign: "center" }}>Qty</div>
        <div style={{ padding: "5px 8px", textAlign: "center" }}>Enc</div>
      </div>
      {C.gear.map((g, i) => (
        <div key={g.name} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px",
          alignItems: "center", background: i % 2 ? TH.paper : TH.paper2,
          borderBottom: "1px solid " + TH.line }}>
          <div style={{ padding: "7px 12px", fontSize: 12.5 }}>{g.name}</div>
          <div style={{ textAlign: "center", fontFamily: "Orbitron", fontWeight: 700, fontSize: 14 }}>{g.qty}</div>
          <div style={{ textAlign: "center", fontSize: 12, color: TH.dim }}>{g.enc}</div>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 10, fontSize: 11.5, color: TH.dim }}>
        <span>Encumbrance: <b style={{ color: TH.ink }}>{C.derived.encumbrance} / {C.derived.encumbranceMax}</b></span>
        <span>Credits: <b style={{ fontFamily: "Orbitron", fontSize: 13, color: TH.brass }}>{credits.toLocaleString()}</b></span>
      </div>
    </div>
  );
}

/* ---- Bio ---- */
function Cdx2Bio({ theme }) {
  const TH = theme;
  const C = window.SWFFG.CHAR;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
      <div className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line, padding: 14 }}>
        <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1,
          color: TH.brown, textTransform: "uppercase", marginBottom: 8 }}>Background</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: TH.ink }}>{C.bio}</div>
      </div>
      <div className="notch" style={{ background: TH.paper2, border: "1px solid " + TH.line, padding: 14 }}>
        <div style={{ fontFamily: "Orbitron", fontWeight: 600, fontSize: 11, letterSpacing: 1,
          color: TH.brown, textTransform: "uppercase", marginBottom: 8 }}>Obligations</div>
        {C.obligations.map((o) => (
          <div key={o.type} style={{ display: "flex", justifyContent: "space-between",
            padding: "7px 0", borderBottom: "1px dashed " + TH.line, fontSize: 12.5 }}>
            <div>
              <span style={{ fontFamily: "Orbitron", fontWeight: 700, fontSize: 12 }}>{o.type}</span>
              <span style={{ color: TH.dim, fontSize: 11, marginLeft: 6 }}>· {o.note}</span>
            </div>
            <b style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 16, color: TH.accent }}>{o.magnitude}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Cdx2Skills, Cdx2Combat, Cdx2Injuries, Cdx2Talents, Cdx2Gear, Cdx2Bio });
