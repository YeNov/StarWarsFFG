# Codex II — Eldritch Horror Color Scheme Plan

**Date:** 2026-07-10
**Status:** Implemented — pending Foundry visual QA
**Scope:** A new Codex II color scheme with major visual changes and no to minimal layout changes.

## Outcome

Implement **Eldritch Horror** as a sixth Codex II scheme using the existing Codex actor and item sheets. The first pass should preserve the current DOM, data bindings, interactions, dimensions, and information hierarchy. The visual transformation should come from scheme registration, new CSS tokens, scheme-scoped component overrides, typography, and a small set of original decorative assets.

Do not create a new sheet class, duplicate the character template, or alter the actor/item data model.

## Why this is a reskin

The existing Codex character sheet already matches the supplied reference's major regions:

- `templates/actors/codex/codex-character.html`
  - `.cdx-header` and `.cdx-portrait`
  - `.cdx-derived` with Wounds, Strain, and Defence
  - `.cdx-tabstrip`
  - `.cdx-chiprow` for characteristics and Force
  - tab panes for Skills, inventory, injuries, talents, biography, XP, and effects
- `templates/parts/codex/cdx-skills.html`
  - two-column skill layout, category headers, career state, rank, and dice pool
- `styles/cdx.css`
  - five existing scheme palettes, all scoped under `.cdx`
  - shared component styling for actor sheets, item sheets, embedded editors, and progression trees

The reference changes visual language much more than information architecture. That makes a new scheme and targeted CSS overrides the appropriate implementation boundary.

## Non-character sheet scope

The character sheet is the high-fidelity visual reference, not the only implementation target. **Eldritch Horror must not be exposed in the setting or scheme pickers until every currently supported Codex sheet is coherent and legible with it.** Shared tokens provide the baseline, followed by dedicated passes for sheet-specific components.

| Sheet family | Existing structure | Eldritch Horror treatment |
|---|---|---|
| Rival and Nemesis | Reuse `templates/actors/codex/codex-character.html` with actor-type guards | Receive the complete character reskin automatically while retaining their conditional fields and current layout. |
| Adversary | `CodexAdversarySheet` also reuses `codex-character.html` | Receive the same full treatment; preserve adversary-specific data and behavior. |
| Minion | `templates/actors/codex/codex-minion.html` | Dedicated styling for the header, group-strength counter, combined wound pool, defence, characteristics, skills, and weapon cards. Preserve the compact layout. |
| Vehicle | `templates/actors/codex/codex-vehicle.html` | Dedicated styling for the header, rarity, hull trauma, system strain, speed, vehicle systems, defence zones/radar, crew, cargo, and vehicle cards. Preserve the existing two-column layout and radar geometry. |
| Standard Codex item sheets | `templates/items/codex/codex-*.html` | Apply the shared paper, border, typography, input, tab, condition, and stat-grid language to weapon, armour, gear, talent, attachment, critical, ship weapon, and generic Codex item sheets. |
| Progression-tree item sheets | Force power, specialization, and signature-ability templates using `.cdx-ft-*` | Reskin banners, cards, states, connectors, controls, and descriptions without changing tree grids, linkage, resizing, purchase behavior, or edit mode. |
| Embedded item editors | `modules/items/item-editor.js` plus `.cdx.cdx-embed` styling | Inherit `scheme-eldritch`, including readable labels, inputs, selects, tabs, and modifier/attachment controls on dark surfaces. |
| Codex-triggered dice dialogs | Existing `.cdx-dice` treatment | Add the dark-surface contrast rules required for setback dice, dark-side pips, and text glyphs; do not structurally redesign the dialog. |

### Non-character implementation order

1. Establish shared semantic tokens and complete the character-sheet fidelity pass.
2. Apply and verify the Minion-specific selectors (`.cdx-minion-*`, `.cdx-gs-*`, and `.cdx-wp-*`).
3. Apply and verify the Vehicle-specific selectors (`.cdx-veh-*`, vehicle tracks, defence zones, and vehicle cards).
4. Polish standard item headers, stat grids, tabs, cards, fields, and embedded editors.
5. Polish `.cdx-ft-*` progression trees and verify every state and connector remains readable.
6. Run the full actor/item QA matrix before adding Eldritch Horror to the user-facing setting and pickers.

### Sheets deliberately unchanged

- **Homestead** is not currently registered as a Codex actor sheet. It remains on its stock sheet; adding a Codex Homestead would be a separate template and layout project rather than part of this color scheme.
- Stock-only item types, including **Career, Species, and Item Modifier**, remain on their stock sheets.
- Global chat cards, combat tracker, token HUD, group manager, and unrelated Foundry windows are not part of this Codex color scheme.
- No stock sheet receives partial Eldritch overrides. The scheme remains strictly scoped under `.cdx`.

## Design translation

### Palette starting point

These values are starting tokens, to be adjusted during visual comparison rather than treated as immutable final colors.

| Role | Suggested value |
|---|---|
| Canvas | `#0b0d0c` |
| Primary panel | `#111412` |
| Raised panel | `#171a17` |
| Primary ink | `#d6cbb9` |
| Muted ink | `#988a75` |
| Hairline border | `#4d4232` |
| Aged brass | `#9a7335` |
| Bright brass | `#c19749` |
| Occult rust | `#67251d` |
| Track background | `#39362f` |
| Warning gold | `#d5a22b` |

Map these into the existing variables where their semantics fit:

```css
--cdx-bg: #0b0d0c;
--cdx-paper: #111412;
--cdx-paper2: #171a17;
--cdx-ink: #d6cbb9;
--cdx-dim: #988a75;
--cdx-line: #4d4232;
--cdx-accent: #9a7335;
--cdx-accent2: #6f5229;
--cdx-brown: #76582e;
--cdx-brass: #c19749;
--cdx-career: rgba(154, 115, 53, 0.13);
--cdx-career-line: #9a7335;
--cdx-track: #39362f;
--cdx-warn: #d5a22b;
--cdx-head: linear-gradient(180deg, rgba(20, 22, 20, 0.97), rgba(9, 11, 10, 0.99));
--cdx-head-ink: #d6cbb9;
```

### Visual language

- Near-black charcoal paper with a restrained mottled texture and vignette.
- Warm ivory text rather than pure white.
- Muted antique-brass labels, borders, and active states.
- Fine double rules and clipped/chamfered corners.
- Serif display, label, numeral, and body typography.
- Circular portrait with concentric aged-metal rings.
- A faint original occult diagram in the header background.
- Rust red reserved for Force, restricted/danger states, and selected accents.
- Existing green/yellow/red gameplay feedback and dice colors remain recognizable.

### Typography

Use the system's already bundled `ElektraMediumPro-Bold.otf` as the Eldritch display face through a Codex-specific `@font-face` alias, making it available even when Mandar is not the active host theme. Use a robust Georgia/Palatino serif stack for body copy. This avoids a new network or font-license dependency while preserving the reference's serif language.

Keep the system's dice fonts and Font Awesome declarations untouched.

Introduce semantic font variables:

```css
--cdx-font-display: "Orbitron", sans-serif;
--cdx-font-body: "Signika", sans-serif;
```

Existing schemes retain those defaults. `scheme-eldritch` replaces both with the bundled serif family. Mechanically replace repeated Codex `font-family:"Orbitron"` and `font-family:"Signika"` declarations with these variables while preserving Font Awesome and dice-glyph selectors.

## Implementation plan

### Phase 1 — Register the sixth scheme

1. Update `modules/actors/codex-sheets.js`:
   - Add `"eldritch"` to `CDX_SCHEMES`.
   - Add a label map/helper so actor and item pickers show **Eldritch Horror**, not merely `Eldritch`.
   - Continue using the internal slug `eldritch`, the form class `scheme-eldritch`, and the setting value `codex-eldritch`.
   - The existing `_getLegacyRootClasses()`, `_applyLegacyRootClasses()`, per-actor flag, and `cdxDefaultScheme()` paths should require no structural changes.
2. Update `modules/items/codex-item-sheet.js` to use the shared display label in its scheme picker. Its scheme validation already imports `CDX_SCHEMES`.
3. Update `modules/settings/settings-helpers.js`:
   - Add `"codex-eldritch": "Codex II — Eldritch Horror"` to `defaultSheetTheme.choices`.
4. Update the duplicated scheme validation list in `modules/items/item-editor.js` so embedded attachment/modifier editors inherit Eldritch correctly.
5. Update comments that say "five palettes" or "five schemes."

Do not add `styles/cdx.css` to `system.json`. `modules/swffg-main.js` already appends it after the active UI theme, which is necessary under Mandar Beskar.

### Phase 2 — Add an extensible token layer

1. Add `.cdx form.scheme-eldritch` beside the existing palette blocks in `styles/cdx.css`.
2. Add semantic variables with backward-compatible fallbacks for properties that the current palette cannot express:
   - `--cdx-font-display`
   - `--cdx-font-body`
   - `--cdx-heading-bg`
   - `--cdx-heading-ink`
   - `--cdx-active-bg`
   - `--cdx-active-ink`
   - `--cdx-panel-shadow`
   - `--cdx-surface-texture`
   - `--cdx-portrait-radius`
3. Refactor shared declarations to use the new variables while making their defaults reproduce the existing five schemes exactly.
4. Keep Eldritch-specific geometry and decorative rules below the shared Codex rules and scoped with `.scheme-eldritch`.

This token refactor is important: a palette-only implementation would leave solid sci-fi header bars, Orbitron typography, and current active-tab shapes, producing a dark Codex theme rather than the supplied occult-horror look.

### Phase 3 — Reskin the existing components

#### Shell and header

Target:

- `.cdx > form.window-content`
- `.cdx-header`
- `.cdx-header-wrap`
- `.cdx-portrait`
- `.cdx-name`
- `.cdx-pill`
- `.cdx-square`
- `.cdx-hcollapse-btn`

Changes:

- Layer a dark radial vignette, subtle paper texture, and low-opacity noise over the shell.
- Make the header a nearly black panel with fine outer and inset rules.
- Add the sigil through `.cdx-header::after`, positioned as a non-interactive background decoration.
- Make the portrait circular through CSS only and add concentric ring effects with its wrapper/pseudo-elements.
- Convert XP/Credits and pills into dark/brass plaques without moving them.
- Preserve expanded/collapsed header behavior and all hit targets.

#### Wounds, Strain, Defence, and other stat panels

Target:

- `.cdx-derived`
- `.cdx-stat`
- `.cdx-stat-head`
- `.cdx-stat-body`
- `.cdx-step`
- `.cdx-rest`
- `.cdx-track`
- `.cdx-pip`
- `.cdx-def-*`

Changes:

- Replace solid accent header bars with charcoal surfaces, brass labels, and separator rules.
- Use thin double outlines and restrained inset shadows.
- Make steppers resemble small antique-metal controls while retaining visible hover and focus states.
- Preserve the existing dynamic wound/strain thresholds and their green/amber/red feedback.

#### Tabs

Target:

- `.cdx-tabstrip`
- `.cdx-tab`
- `.cdx-tab.active`
- `.cdx-tab-badge`

Changes:

- Use a thin brass baseline and transparent tabs.
- Represent the active tab with an outlined/dark plaque and brighter text instead of a large solid fill.
- Retain wrapping and existing tab dimensions unless serif metrics require a small padding adjustment.

#### Characteristics and Force

Target:

- `.cdx-chiprow`
- `.cdx-chip`
- `.cdx-chip-box`
- `.cdx-chip-label`
- `.cdx-ratio-*`

Changes:

- Preserve the current equal-width row and responsive abbreviations.
- Restyle characteristic boxes as framed octagonal plaques with inset double lines.
- Use warm ivory numerals and brass labels.
- Give the Force chip the reference's restrained rust-red surface while preserving good/neutral/evil state contrast and controls.

#### Skills

Target:

- `.cdx-skills`
- `.cdx-skill-col`
- `.cdx-sk-head`
- `.cdx-sk-row`
- `.cdx-sk-name`
- `.cdx-sk-rank`
- `.cdx-sk-pool`

Changes:

- Use dark transparent rows with fine horizontal dividers.
- Replace solid category bars with darker framed headers and brass text.
- Preserve career highlighting through a subtle brass wash and left rule.
- Keep dice images at their current size and color; add only the contrast treatment required for dark setback/dark-side assets.

#### Cards, panels, item sheets, and trees

Apply the same surface, border, typography, and state tokens to:

- `.cdx-card`
- `.cdx-panel`
- `.cdx-table`
- `.cdx-ihead`
- `.cdx-istat`
- `.cdx-idesc-*`
- `.cdx-ft-*`
- `.cdx.cdx-embed`

The character sheet is the fidelity target, but the scheme is available to every supported Codex actor and item sheet as soon as it is registered. All those surfaces must therefore remain coherent and legible before release.

### Phase 4 — Extend dark-surface compatibility

Several rules currently special-case only `.scheme-dark`. Eldritch must receive equivalent treatment for:

- neutral Force-chip backgrounds;
- setback dice and dark-side pips;
- rollable-item hover icons;
- card metadata and controls;
- native select options;
- embedded-editor labels;
- text dice glyphs and description glyphs.

Prefer grouping dark schemes with `:is(.scheme-dark, .scheme-eldritch)` or a similarly explicit selector. Do not globally change light-scheme behavior.

### Phase 5 — Add original assets

Implemented paths:

```text
fonts/ElektraMediumPro-Bold.otf        # existing bundled font
images/codex/eldritch/paper.svg
images/codex/eldritch/sigil.svg
```

Asset requirements:

- The texture must be seamless, small, compressed, and low contrast.
- The sigil must be original line art, readable only as atmosphere rather than foreground content.
- Do not use official Eldritch Horror logos, art, frames, or copied ornamentation.
- Record font and asset licensing with the existing Codex licensing documentation.

### Phase 6 — Documentation and tests

1. Update `CODEX.md`:
   - Add `Codex II — Eldritch Horror` to the enabling instructions.
   - Change references from five to six schemes.
   - Mention the bundled font and original decorative assets.
2. Add an in-Foundry test covering:
   - `CDX_SCHEMES` contains `eldritch`;
   - `codex-eldritch` resolves as the default scheme;
   - actor and item scheme flags resolve to `scheme-eldritch`;
   - switching away removes the stale class;
   - the setting choice is registered.
3. Preserve the existing in-Foundry Mocha/Quench-style harness conventions; this repository does not have a normal `npm test` command.

## Visual and functional QA matrix

### Primary character-sheet states

- Default 630px width and a wide 900–1100px reference view.
- Header expanded and collapsed.
- Edit mode on and off.
- XP-buy mode on and off.
- Force enabled and disabled.
- Neutral, good, and evil Force alignment.
- Split and combined inventory styles.
- Empty and fully populated actor.
- Large skill pools and long localized labels.

### Document coverage

- Character, rival, and nemesis.
- Minion.
- Vehicle.
- Adversary.
- Weapon, armour, gear, talent, force power, specialization, signature ability, ship weapon, and attachments.
- Embedded modifier/attachment editor.

### Host-theme coverage

- Mandar Beskar Astromech UI theme.
- Stock/default system theme.
- Foundry application light and dark schemes where relevant.

### Regression checks

- Capture representative screenshots of all five existing Codex schemes before the token refactor.
- After refactoring fonts and heading/active-state variables, compare the same sheets and ensure the existing schemes are visually unchanged.
- Verify inputs, tab switching, steppers, healing, strain recovery, XP mode, item controls, drag/drop, scrolling, and sheet resizing.
- Confirm no duplicate inputs or changed `name=` paths were introduced.

### Accessibility checks

- Body text contrast of at least 4.5:1 against its actual textured surface.
- Large text and prominent labels at least 3:1.
- Visible keyboard focus that does not depend on color alone.
- Texture opacity low enough that it does not interfere with small text.
- Disabled/editable inputs distinguishable without becoming illegible.
- Dark dice and control icons remain visible at normal and reduced zoom.

## Acceptance criteria

- “Codex II — Eldritch Horror” appears in the Default Sheet Theme setting and actor/item scheme pickers.
- The setting value is `codex-eldritch`; the persisted document flag is `eldritch`; the applied class is `scheme-eldritch`.
- Actor, item, and embedded-editor scheme inheritance works.
- No new sheet class, template copy, data-model field, or duplicated input is introduced.
- The character sheet's layout, tab structure, interaction hooks, and responsive behavior remain intact.
- The result is recognizably transformed from science-fiction Codex into dark occult dossier styling through typography, surface, border, portrait, and ornament changes.
- All supported Codex sheets are legible, even when the character sheet is the high-fidelity target.
- Existing five Codex schemes remain visually and functionally unchanged.
- All new visual assets are original or properly open-licensed.

## Explicitly out of scope for the first pass

- Moving Credits or XP to match the reference header exactly.
- Removing or renaming tabs.
- Reordering characteristics or derived stats.
- Changing sheet default dimensions.
- Replacing system dice artwork.
- New actor/item data or gameplay behavior.
- Official Eldritch Horror branding or copied game artwork.

If the CSS-only first pass cannot achieve the desired header fidelity, a second pass may make small markup changes, but only after the reskin has been evaluated at both the default and reference widths.

## Inspection note

This plan is based on the supplied character-sheet image and direct inspection of the repository's Codex templates, scheme registration, CSS, settings, item inheritance, and test conventions. Live computed-style inspection was deliberately omitted because the in-app browser repeatedly destabilized the Codex desktop app during this task.
