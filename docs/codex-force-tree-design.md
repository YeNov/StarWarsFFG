# Codex II — Force-Power Tree Design System

A developer reference for the bespoke **force-power upgrade tree** in the Codex II
sheets, and the blueprint for building the matching **specialization** and
**signature-ability** trees. The tree is built from scratch (`.cdx-ft-*`) — it does
**not** reuse the stock `.talent-*` markup — and binds only the system's data and
behaviour hooks so the existing item-sheet JS still drives it.

## File map

| Concern | Location |
|---------|----------|
| Template | `templates/items/codex/codex-forcepower.html` |
| Styles | `styles/cdx.css` — the `.cdx-ft-*` block |
| Sheet JS (edit toggle, tab switch, `isEditing`) | `modules/items/codex-item-sheet.js` |
| Data prep + control handlers | `modules/items/item-sheet-ffg.js` (`_prepareTalentTrees`, `canPurchaseNode`, `_onClickUpgradeEdit`, `_onClickTalentControl`) |
| Registration | `CODEX_DETAILED` set + `template()` (codex-item-sheet.js); `CODEX_ITEM_TYPES` + `loadTemplates` (swffg-main.js) |

## Data model

Force-power and signature-ability nodes live in `item.system.upgrades[key]`;
specialization nodes live in `item.system.talents[key]`. Each node carries:

- `islearned`, `name`, `cost`, `size` / `sizeInt` (1–4 columns), `visible`
- `links-top-1..4`, `links-right` — the connector booleans

Derived in `getData` (do not persist): `isTop{N}Learned`, `isRightLearned`,
`canPurchase` (via `canPurchaseNode`), `canCombine`, `canSplit`, `canLinkTop`,
`canLinkRight`, `enrichedDescription`. The transient edit flag is surfaced as
`ctx.data.isEditing` (see [Edit mode](#3-edit-mode)).

---

## 1) Tabs

Bespoke tab strip, **not** native `.sheet-tabs`: `<nav class="cdx-tabstrip cdx-ft-tabs">`
of `<button class="cdx-tab" data-tab="…">`, paired with `<section class="cdx-pane" data-tab="…">`
panes. The codex tab JS in `codex-item-sheet.js#activateListeners` toggles `.active`
on the matching button + pane and remembers the active tab (`_cdxTab`) across
re-renders. `.cdx-ft-tabs` makes the strip compact (`font-size:8px; font-weight:700;
padding:1px 10px`, no text-shadow, 1px bottom border). Tabs: **talents / sources / tags**.
The strip sits above the banner.

## 2) Header / banner

```
<header class="cdx-ft-banner">        ← display:contents (drops its own box)
  <div class="cdx-ft-power on">        ← the visible red banner block
    .cdx-ft-power-row   (FR)
    .cdx-ft-power-name  (Orbitron 900 / 24px)
    .cdx-ft-power-sub   (subtype label)
    .cdx-ft-desc        (popout-editor description)
    .cdx-ft-power-foot  (cost + .cdx-ft-power-actions: cog / pen / image)
```

The wrapper is `display:contents` so `.cdx-ft-power` becomes the **direct
full-width child** of the scrolling window-content column. `.cdx-ft-power` paints
`background:var(--cdx-accent)` with a `clip-path` notch and head-ink text; it gets a
glow via `.on` when `item.isOwned`. Every definition field (name, FR, cost) renders
as plain **text** in play mode and as an `<input>` in edit mode, gated on
`data.isEditing` and styled identically so the layout never shifts.

> **Naming:** the wrapper must be `.cdx-ft-banner`, **not** `.cdx-ft-head` — that's
> the card head class. See [Gotchas](#gotchas).

## 3) Edit mode

Edit is a **transient, per-session toggle** (`this._cdxEdit`, default OFF) — *not* the
persisted `system.isEditing`. `getData` forces `ctx.data.isEditing = !!this._cdxEdit`;
the pen button `.cdx-ft-edit-toggle` flips it and calls `render({ force:true })`. The
template adds `.cdx-ft-edit` to `.cdx-ft-grid` while editing, and that class is the
single gate that reveals: connector toggles (`.cdx-ft-toggle`), combine/split
(`.cdx-ft-resize`), the per-card cog (`.cdx-ft-edit-actions`), and the text→input
field swaps. Read-only mode is a clean tree with none of those affordances.

## 4) Cards

- `.cdx-ft-node` — the grid item: `position:relative; grid-column:span sizeInt`.
  `.on` = learned; `.cdx-ft-gone` = not visible (`display:none`).
- `.cdx-ft-card` — the visual card: flex column, `min-height:118px`,
  `background:var(--cdx-paper2)`, `clip-path:var(--cdx-clip)`, and a `drop-shadow`
  for depth. **No border** — a border plus a clip-path frays the notched corners,
  so depth comes from the drop-shadow; learned cards swap it for an accent glow.
- Card parts: `.cdx-ft-head` (head row — `--cdx-head` gradient + `clip-path:var(--cdx-clip-top)`),
  `.cdx-ft-body` (`flex:1`, the popout-editor description), `.cdx-ft-foot`
  (cost + edit cog, `border-top`).

The grid uses `align-items:stretch`, so every card in a row matches the tallest one.

## 5) Buy button & learnt checkbox

- **Learnt** — `.cdx-ft-state input[type=checkbox]`, styled as a custom *radio*
  (`appearance:none`, 13px circle, head-ink border, filled dot + glow when checked),
  bound to `data.upgrades.{key}.islearned`. Non-GM viewers get `onclick="return false"`
  (read-only).
- **Buy** — `.cdx-ft-buy .ffg-purchase` (FA `circle-up`), rendered **only** when
  `item.isOwned && upgrade.canPurchase` (the stock tree's exact gate). It carries the
  stock buy hooks: `data-buy-action="forcepower-upgrade"` plus
  `data-cost` / `-upgrade-id` / `-upgrade-name` / `-base-item-name`. CSS forces
  `display:inline-flex` to override the codex default that hides `i.ffg-purchase`
  outside XP-buy mode.

Both sit in the card head: state on the left, name `flex:1`, buy on the right.

## 6) Connections between cards

A 4-column CSS grid; nodes span columns via `grid-column`. **Connector lines live in
the grid gaps**, sized by CSS vars on `.cdx-ft-grid`: `--ft-rowgap:32px` (vertical),
`--ft-colgap:16px` (horizontal), `--ft-line:3px` (thickness).

- **Up** — `.cdx-ft-uplinks` is absolutely positioned in the row-gap above the card
  (`bottom:100%`, height = rowgap) as a flex row of `.cdx-ft-upcell` (one per spanned
  column); each holds a vertical `.cdx-ft-up` line for its `links-top-N`.
- **Right** — `.cdx-ft-rightlink` sits in the column-gap to the right
  (`left:100%`, width = colgap) with a horizontal `.cdx-ft-right` line for `links-right`.

A `.cdx-ft-line` is muted (`var(--cdx-line)`, opacity .5); `.on` switches it to
`var(--cdx-accent)` with a double box-shadow glow. **"on" means *both* endpoints are
purchased** — the template uses `{{#if (and upgrade.islearned upgrade.isTopNLearned)}}`.

In edit mode the `.cdx-ft-toggle` anchors (`data-action="link-top|link-right"`) become
clickable inside the gaps (`.set` when linked; `canLinkTop/Right` gate visibility), and
**combine/split** appears as `.cdx-ft-resize` in the right gap between cards
(`data-action="combine|split"`, gated on `canCombine`/`canSplit`).

## 7) Fonts & general layout

- **Grid:** `repeat(4, 1fr)`, gap `32px / 16px`, `padding-top:32px`, `align-items:stretch`.
  Card `min-height:118px`.
- **Fonts:** Orbitron for the banner name (900 / 24px), card name (700 / 11px), cost
  (700 / 10.8px) and tabs (700 / 8px); Signika for descriptions (11px).
- **Colours** (per-scheme CSS vars): banner `--cdx-accent` / head-ink; card head
  `--cdx-head` gradient / head-ink; card body `--cdx-paper2` / ink; cost `--cdx-brass`
  (value) and `--cdx-dim` (label); connectors `--cdx-line` → `--cdx-accent` glow.
- **Notch:** `clip-path:var(--cdx-clip)` (octagon) on cards and the banner;
  `var(--cdx-clip-top)` on the card head.
- **Scroll:** the *whole sheet* scrolls via the window-content (`overflow-y:auto`);
  `.cdx-ft-tree` is a `flex:none` flowing block with no inner scroll, so the banner and
  the tree scroll together.

---

## Reusing this for the specialization & signature trees

The `.cdx-ft-*` CSS is generic — none of it is force-power-specific. To add
`codex-specialization.html` / `codex-signatureability.html`:

1. Copy `codex-forcepower.html`.
2. Swap the `{{#each data.upgrades}}` loop to the right source: **specialization** uses
   `data.talents` (`talent{N}` keys, 20 nodes, *not* size-aware); **signature** keeps
   `data.upgrades` (size-aware). `_prepareTalentTrees(prefix, …)` already prepares both.
3. Adapt **only the banner** — a specialization shows its career/affiliation, not the
   force rating and "basic power" line.
4. Register the type: add it to `CODEX_DETAILED`, `template()`, the `getData` `isEditing`
   list, `CODEX_ITEM_TYPES`, and `loadTemplates`.

The card / grid / connector / edit machinery is identical.

## Gotchas

- **Class-name collisions (bit us twice).** The per-card internals own
  `.cdx-ft-head`, `.cdx-ft-body`, `.cdx-ft-foot`, `.cdx-ft-card`. Never reuse those
  names for a *section/wrapper* element — same-name rules collide at equal specificity
  and the card rule wins, painting/clamping the wrapper. This caused the
  "header outside the scroll area" bug (`.cdx-ft-body` reused for the tree body →
  `flex:1` clamp) and the "gradient behind the banner" bug (`.cdx-ft-head` reused for
  the banner wrapper → the card-head `--cdx-head` gradient). Wrappers use distinct
  names: `.cdx-ft-tree`, `.cdx-ft-banner`, `.cdx-ft-grid`, `.cdx-ft-node`. When an
  override "won't take", grep `cdx.css` for a second rule with the same class **before**
  fighting specificity; a one-line computed-style dump
  (`getComputedStyle(el).display` / `.backgroundImage`) pinpoints it instantly.
- **No border on clipped cards.** A `border` plus `clip-path` frays the notch corners —
  use `drop-shadow` for depth instead.
- **Window auto-resize.** Item sheets must not let content changes resize the window;
  the base sheet pins the numeric size into `this.options.position` after render (the
  per-type default for the force power is 720×840).
