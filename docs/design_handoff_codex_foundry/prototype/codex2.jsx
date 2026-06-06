/* ============================================================
   WINNER — "CODEX II"  ·  themeable
   Five colour schemes (Republic / Empire / Dark / Light /
   Mercenary), each with a subtle background emblem. Talents
   carry no image. One layout, swap the palette.
   ============================================================ */
const { useState: useStateCdx2 } = React;

const CDX_THEMES = {
  republic: {
    name: "Republic",
    bg: "#cdd4dc", stripe: "rgba(20,40,70,.05)",
    paper: "#e9edf2", paper2: "#f5f7fa", ink: "#16202b", dim: "#5d6b78", line: "#b9c3cd",
    accent: "#1f4e8c", accent2: "#16407a", brown: "#2a5fa0", brass: "#b9892f",
    career: "#e6eefb", careerLine: "#3a78c0", track: "#c2ccd6",
    chipLabel: "#16202b", chipInk: "#fff",
    headerBg: "linear-gradient(180deg,#2a649f,#1b4474)", headerInk: "#fff",
    watermark: "rgba(31,78,140,.07)",
  },
  empire: {
    name: "Empire",
    bg: "#c8c9cc", stripe: "rgba(0,0,0,.05)",
    paper: "#e5e6e8", paper2: "#f1f1f3", ink: "#14151a", dim: "#5d5f66", line: "#b4b5ba",
    accent: "#1b1c21", accent2: "#2b2c32", brown: "#7c1411", brass: "#7d8086",
    career: "#e9e9ec", careerLine: "#9a1f1b", track: "#bcbdc2",
    chipLabel: "#000", chipInk: "#fff",
    headerBg: "linear-gradient(180deg,#26272c,#131418)", headerInk: "#fff",
    watermark: "rgba(0,0,0,.06)",
  },
  dark: {
    name: "Dark",
    bg: "#0e0b0b", stripe: "rgba(255,255,255,.02)",
    paper: "#1a1413", paper2: "#221917", ink: "#ece4df", dim: "#9a8e88", line: "#3a2c29",
    accent: "#8a1714", accent2: "#5d1110", brown: "#6e2a22", brass: "#c8a24a",
    career: "rgba(200,162,74,.12)", careerLine: "#c8a24a", track: "#3a2c29",
    chipLabel: "#000", chipInk: "#fff",
    headerBg: "linear-gradient(180deg,#6e1411,#380a09)", headerInk: "#fff",
    watermark: "rgba(165,31,23,.12)",
  },
  light: {
    name: "Light",
    bg: "#dde6ec", stripe: "rgba(47,111,158,.045)",
    paper: "#f3f7fa", paper2: "#ffffff", ink: "#1b2a33", dim: "#5f7079", line: "#c5d2db",
    accent: "#2f6f9e", accent2: "#245880", brown: "#3a86b5", brass: "#b0902c",
    career: "#e4f1f8", careerLine: "#4a9bc8", track: "#cad9e2",
    chipLabel: "#1b2a33", chipInk: "#fff",
    headerBg: "linear-gradient(180deg,#56a0c4,#2f6f9e)", headerInk: "#fff",
    watermark: "rgba(47,111,158,.06)",
  },
  mercenary: {
    name: "Mercenary",
    bg: "#c9bdac", stripe: "rgba(60,40,20,.05)",
    paper: "#e6dccb", paper2: "#f1ebdd", ink: "#241c12", dim: "#6e6047", line: "#bcae95",
    accent: "#7a4a22", accent2: "#5e3818", brown: "#8a5a2a", brass: "#b07a30",
    career: "#efe2c8", careerLine: "#b07a30", track: "#cdbfa3",
    chipLabel: "#241c12", chipInk: "#f1ebdd",
    headerBg: "linear-gradient(180deg,#3b4148,#22262b)", headerInk: "#f1ebdd",
    watermark: "rgba(122,74,34,.08)",
  },
};

let T = CDX_THEMES.republic;

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

const FORCE_PILL = { bg: "#5b4bb3", ink: "#fff", border: "rgba(255,255,255,.45)", dot: "#fff" };

function PillStack({ items, title, w = 168, bg, ink, border, dot }) {
  const [open, setOpen] = useStateCdx2(false);
  const PILL_H = 22;
  const peek = 8;
  const notchClip = "polygon(0% 6px, 6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px))";
  if (!items || items.length === 0) return null;
  return (
    <div onClick={() => setOpen((o) => !o)} title={open ? "Collapse" : title}
      style={{ width: w, flex: "none", cursor: "pointer" }}>
      {items.map((p, i) => (
        <div key={p} style={{ position: "relative", zIndex: items.length - i,
          marginTop: i === 0 ? 0 : (open ? 5 : -(PILL_H - peek)),
          height: PILL_H, boxSizing: "border-box", clipPath: notchClip,
          background: bg, color: ink, border: "1px solid " + border,
          fontSize: 10.5, padding: "0 12px", letterSpacing: .5, textTransform: "uppercase",
          fontFamily: "Orbitron, sans-serif", fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
          boxShadow: "0 -1px 0 rgba(255,255,255,.4) inset, 0 3px 5px rgba(0,0,0,.28)", whiteSpace: "nowrap" }}>
          {(open || i === 0) && (
            <React.Fragment>
              <span style={{ width: 5, height: 5, transform: "rotate(45deg)", background: dot || ink, display: "inline-block", flex: "none" }}></span>
              {p}
              {i === 0 && items.length > 1 && !open && (
                <span style={{ marginLeft: "auto", fontSize: 8, fontWeight: 800, opacity: .7 }}>+{items.length - 1}</span>
              )}
            </React.Fragment>
          )}
        </div>
      ))}
    </div>
  );
}

function CodexSheet2({ initialScheme = "republic" }) {
  return <div style={{ color: "#fff", padding: "20px" }}>Codex2 Placeholder</div>;
}

window.CodexSheet2 = CodexSheet2;
window.CDX_THEMES = CDX_THEMES;
window.PillStack = PillStack;
window.FORCE_PILL = FORCE_PILL;
