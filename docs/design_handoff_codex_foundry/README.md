# Handoff: Codex II Character Sheet → Foundry VTT (Star Wars FFG)

## Overview
This package is everything needed to implement the **Codex II** actor-sheet skin for the
**Star Wars FFG** Foundry VTT system, against the fork
[`YeNov/StarWarsFFG` · branch `V2-full`](https://github.com/YeNov/StarWarsFFG/tree/V2-full)
(Foundry **v13**, ApplicationV2).

The Codex II sheet is a **reskin + small markup changes + one new per-client theme setting**,
delivered as a **separate, user-selectable sheet** that lives alongside the stock sheets
(originals are never modified).

## ⭐ Start here: `Foundry Implementation Plan.md`
That document (in this folder) is the **authoritative implementation spec**. It was written
against the actual repo source and survived multiple code-review passes. It contains:
- the staged plan (Stage 0 register → 1 CSS → 2 header → 3 gear → 4 themes → 5 other actors),
- exact data paths and the legacy `data.*` input-name caveat,
- the CSS load-order trap (default `mandarBeskarAstromech` theme disables `starwarsffg.css`),
- the `_getLegacyRootClasses` / `_applyLegacyRootClasses` mechanism for the scheme class,
- the partial copy + `TemplateHelpers.preload()` requirement,
- the encumbrance reconciliation rules,
- and five open product decisions to confirm before/while building.

**Read the plan first.** This README is the visual-reference companion to it.

## About the design files
The files in `prototype/` are a **design reference built in HTML/React** — a prototype that
shows the intended look and behavior. They are **not** production code to copy into Foundry.
The task is to **recreate this look inside the Star Wars FFG system** using its existing
Handlebars templates, `ffg-block` partials, and CSS — exactly as the plan describes.

Open `prototype/index.html` in a browser to see the live design canvas (Codex II character
sheet plus companion sheets: vehicle, adversary, minion, item detail, and HUD variants).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, bevels, and interactions. Recreate
pixel-faithfully using the system's templates + a scoped CSS file. Exact values are in the
prototype source (`prototype/codex2.jsx`, `codex2-sheet.jsx`, `codex2-tabs.jsx`, `shared.jsx`).

---

## Screens / Views (v1 scope = `character` only)

### Character sheet (the v1 target)
A 1000px-wide actor sheet. Source: `prototype/codex2-sheet.jsx` (+ `codex2-tabs.jsx` for tab bodies).

**Header** (`CodexSheet2` top block)
- Left: portrait slot (≈90px), then **name** (Orbitron 900, 26–28px, uppercase, letter-spacing 1).
- Below the name, an inline row of pills: **species**, **career** (notched chips), the
  **specialization** PillStack and **force-power** PillStack (stacked, only the top pill shows
  text when collapsed), and the **tagline** in italics inline at the end.
- Right: two compact square blocks — **XP** (dark, "XP / available / of total") and **Credits**
  (brass, "CR / value / credits") with a hover-reveal **Change** tab beneath it.
- A **SCHEME** switcher strip sits above the header in the prototype; in Foundry this becomes
  the per-client setting (Stage 4), not an in-sheet strip (optional in-sheet button later).

**Characteristics row**
- The 6 characteristics as chips (Orbitron 900 big value, notched label), then a thin vertical
  divider, then **Soak** and **Force** chips (brass accent) in the same row.

**Derived row**
- **Wounds** and **Strain** interactive blocks (current/threshold, a damage track, −/+ steppers
  flanking the bar on one line, a rest glyph in the block header; Wounds also has a
  "Healing 0/5" stepper row). **Defence** and **Encumbrance** split blocks.

**Tabs:** Skills · Combat · Injuries · Talents · Gear · Bio (Injuries carries a count badge).
- **Skills:** career-highlighted rows, rank pips, dice-pool glyphs.
- **Combat:** weapon cards + an armor card sharing one layout — icon, equip toggle, name, and
  **centered DAM / CRIT / RANGE / ENC** stat columns (armor: SOAK / DEF / ENC).
- **Talents:** tier-colored cards + a force-power card.
- **Gear:** item rows with quantity steppers; encumbrance + credits summary.
- **Bio:** background + obligations.

> In Foundry these map onto the existing tab structure and partials — see plan Stages 2–3.
> The prototype's pills/talents/gear are **items** on a real actor, not static data.

### Companion sheets (Stage 5, later)
`prototype/vehicle.jsx`, `adversary.jsx`, `minion.jsx`, `items.jsx`, `hud.jsx`, `hud2.jsx`,
`console.jsx`, `dossier.jsx` — same visual language for the other actor types. Out of scope for v1.

---

## Design tokens

### Theme palettes (the 5 schemes)
Exact values live in `prototype/codex2.jsx` → `CDX_THEMES`. Each scheme is a set of CSS vars
applied via a `scheme-*` class. Republic shown as the reference; the other four
(empire / dark / light / mercenary) follow the same key set:

```
republic:
  bg #cdd4dc   stripe rgba(20,40,70,.05)
  paper #e9edf2  paper2 #f5f7fa  ink #16202b  dim #5d6b78  line #b9c3cd
  accent #1f4e8c  accent2 #16407a  brown #2a5fa0  brass #b9892f
  career #e6eefb  careerLine #3a78c0  track #c2ccd6
  headerBg linear-gradient(180deg,#2a649f,#1b4474)  headerInk #fff
```
Empire (greys/red), Dark (near-black/crimson/gold), Light (blue), Mercenary (tan/bronze) —
copy the full objects from `CDX_THEMES`.

### Typography
- **Display:** `Orbitron` (700/900) — names, stat values, labels, tabs. **Must be bundled**
  (Google Font) into the system's `fonts/` + `@font-face`.
- **Body:** `Signika` (already shipped in the system's `fonts/`).
- **Dice glyphs:** the system already ships `EotESymbol` / genesys glyph fonts — reuse them.
- See `prototype/fonts.css` for the @font-face block and `prototype/fonts/` for the files.

### Shape language
- The signature **notch bevel**: `clip-path` octagon, `--notch: 9px` (see `prototype/fonts.css`
  `.notch` / `.notch-top`). Reused everywhere — port to the scoped Codex CSS.
- Centered stat columns: fixed-width cells (~62px), long values (e.g. "Engaged") drop to a
  smaller font so they don't overflow the next column.

---

## Assets
- **Fonts:** `prototype/fonts/` (Signika, Orbitron must be added, EotE/genesys glyph fonts).
- **Portrait / item images:** the prototype uses drop slots / placeholders; in Foundry these are
  the actor `img` and item `img` already provided by the system.
- No other raster assets — the look is CSS (bevels, gradients, type).

## Files in this bundle
- `Foundry Implementation Plan.md` — **the spec. Read first.**
- `prototype/index.html` — open in a browser to view the live design canvas.
- `prototype/codex2-sheet.jsx` — the Codex II character sheet (header, stat blocks, tabs).
- `prototype/codex2-tabs.jsx` — tab bodies (skills, combat + armor, injuries, talents, gear, bio).
- `prototype/codex2.jsx` — `CDX_THEMES` palettes, `PillStack`, helpers.
- `prototype/shared.jsx` — shared render helpers (WeaponRow, StatChip/Panel, DamageTrack, QualityPills).
- `prototype/sheet-data.js` — sample character/vehicle/adversary/minion data (`window.SWFFG`).
- `prototype/codex.jsx` — an earlier "Codex" variation (reference only).
- `prototype/vehicle.jsx`, `adversary.jsx`, `minion.jsx`, `items.jsx`, `hud.jsx`, `hud2.jsx`,
  `console.jsx`, `dossier.jsx` — companion sheets (Stage 5).
- `prototype/app.jsx`, `design-canvas.jsx` — the canvas host that lays the sheets out.
- `prototype/fonts.css`, `prototype/fonts/` — type + the `.notch` bevel.

## Suggested workflow in Claude Code
1. Clone your `YeNov/StarWarsFFG` fork (branch `V2-full`); create a working branch.
2. Open `Foundry Implementation Plan.md` and work Stage 0 → 1 → 3 first (character-only deliverable).
3. Keep `prototype/index.html` open as the visual target; lift exact hex/spacing/type from the
   `prototype/*.jsx` sources.
4. Test in a v13 dev world with a **fully-populated** character, **under the default
   `mandarBeskarAstromech` UI theme** (the CSS-load-order trap).
