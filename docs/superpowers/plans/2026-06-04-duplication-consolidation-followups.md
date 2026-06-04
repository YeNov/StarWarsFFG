# Duplication consolidation — follow-up plan (handoff)

**Date:** 2026-06-04 · **Branch baseline:** `V2-full` · **Status:** planning / not started

## Why this exists
A codebase-wide duplication sweep (2026-06-04) found ~700–800 lines of
consolidatable JS plus heavy CSS duplication. The **low-risk, behavior-preserving
subset was already done** on `V2-full`:

| Commit | What was consolidated |
|---|---|
| `776e7fc1` | `_handleSourceControl`/`_handleTagControl` → `FFGDocumentSheet` (−124 dup) + dead `Helpers.diff` line |
| `120f2adb` | `_onPopoutEditor` → `FFGDocumentSheet` (overridable height floor) |
| `76cd2d44` | removed one adjacent byte-identical `.attributes` cluster in `mandar.css` |
| `881b608a` | (`/simplify`) dropped dead V1 render-state vestiges from the base |

This doc covers the **deferred, more complex refactors** — they were held back
because they touch fragile paths and/or need live verification, not because
they're low value.

## Read first — cautions (grounded in `memory/`)
- **Submit / edit-mode / Active-Effects / drag-drop are fragile.** The minion
  close-button bug (submit-on-close) and stale derived-stat bugs both lived
  here. Clusters **A, B, C** below touch these. Keep each refactor
  behavior-identical and verify live.
- **CSS is hand-maintained; do NOT recompile** (`gulp css`). Both
  `styles/starwarsffg.css` and `styles/mandar.css` are edited by hand; the live
  theme is `styles/mandarBeskarAstromech.css` which `@import`s `mandar.css`.
- **Execution model:** do this on its **own branch** (off `V2-full`, or off
  `main` after `V2-full` lands) — NOT inline on the release branch. One cluster
  per commit/PR, each with the verification listed under it.
- Line numbers below are approximate (they shift as edits land) — grep the named
  symbol to relocate.

---

## A. `SheetOptions` base — collapse the two options classes  ★ highest value
**Files:** `modules/actors/actor-ffg-options.js` (~232 ln) vs
`modules/items/item-ffg-options.js` (~195 ln) — ~95% identical (~150–190 dup ln).

Identical: `constructor`, `init` (header-button injection + the pointerdown-capture
comment), `_findSheetRoot`, `register`/`registerMany`/`unregister`/`clear`, and
the `_openDialogs` single-instance guard. They diverge only in: the `.actor`/`.item`
class token in `_findSheetRoot`, the dialog title key, and the accept-callback's
persistence (actor writes `flags.starwarsffg.*` + edit-mode AE suspend/restore via
`_suspendedAECache`; item does `item.setFlag` per key).

**Plan:** new `modules/apps/sheet-options.js` (`SheetOptions`) holding everything;
two thin subclasses override `_sheetTypeClass` (getter), the title key, and an
overridable `_applyOptions(updateObject)` / `_persist()` hook. The actor subclass
keeps `_suspendedAECache` + edit-mode logic inside its hook.

**Effort:** med · **Risk:** low–med.
**⚠ Verify:** Sheet Options dialog opens on an actor AND an item; rapid
double-click brings the existing dialog to front (single-instance); the actor's
**edit-mode AE suspend/restore** still works (toggle edit mode on/off after the
dialog persists) — this is the AE-fragile bit.

This also absorbs 2 of the single-instance-guard duplications (cluster F.6).

---

## B. `FFGWindowMixin` — dedup the two native bases  ★ high value, submit path
**Files:** `modules/apps/ffg-form-application.js` vs
`modules/apps/ffg-document-sheet.js` (~110–120 dup ln).

Duplicated, near-verbatim:
- **Resize trio** — `_minDimensions` + `minimize` (the `_minimizing` flag) +
  `setPosition` clamp (document adds a `_minimizing||minimized` early-return).
- **Coalescing `_onSubmit`** loop — `_submitting`/`_submitPending`/`_submitInFlight`,
  the `iter > 8` bail, the do/while flush. (Document additionally honours
  `preventClose`/`closeOnSubmit`; form delegates closeOnSubmit to native.)
- **`_getSubmitData`** — identical except document passes `{ editors: this.editors }`.
- **Range-slider mirroring** in `_onChangeForm`/`_onChangeInput`.
- **close/`_closing` render guard.**

**Plan:** extract `FFGWindowMixin(Base)` applied to both
`HandlebarsApplicationMixin(ApplicationV2)` and
`HandlebarsApplicationMixin(DocumentSheetV2)`. The two bases keep their genuinely
different bits (document: editor lifecycle, `_toggleDisabled`, header projection;
form: native-handler wiring). The `_onSubmit` post-loop close behavior differs
between the two — **parameterize it** (e.g. a `_afterSubmitFlush()` hook) rather
than forcing one variant.

**Effort:** med–high · **Risk:** med.
**⚠ Verify (this is the path the minion close bug came from):** on an **actor
sheet** AND the **group manager** AND a **settings panel** — submit-on-change,
submit-on-close (× to close, and the close actually tears down), the
spec-tree/checkbox multi-click coalescing case, and minimize/restore.

---

## C. Actor drag/drop vs stock `ActorSheetV2`  — defer / quantify-only
**File:** `modules/apps/ffg-actor-sheet.js` (~105–130 ln).
`_onDrop`, `_onDropActiveEffect`, `_onDropActor`, `_onDropItem`, `_onDropFolder`,
`_onDropItemCreate`, `_onSortItem`, `_onDragStart`, `_canDragStart/Drop` are
near-verbatim copies of `foundry.applications.sheets.ActorSheetV2`.

**Why it's hard:** `FFGActorSheet extends FFGDocumentSheet` (→ `DocumentSheetV2`)
specifically to share the system's submit/editor machinery with item sheets; it
**can't simply `extends ActorSheetV2`**. Options: (a) mix in just the
`ActorSheetV2` drag-drop slice, (b) leave as-is with a "mirrors stock" comment.
`_onDropItem` is already overridden in `ActorSheetFFG`; `_onSortItem`/
`_onDropItemCreate` are genuinely used.

**Effort:** med · **Risk:** med–high (interaction-critical; stock code drifts
across Foundry versions). **Lowest value × safety — defer, or just annotate.**
**⚠ Verify if attempted:** drop item / effect / folder / actor onto an actor
sheet; same-actor item sort; cross-sheet drag.

---

## D. Slide-toggle expand/collapse helper  (was #7 in the "safe batch", pulled out)
**Files:** ~6 sites — `item-sheet-ffg.js` (`_itemDisplayDetails`, `_itemDisplayDesc`),
`actor-sheet-ffg.js` (`_itemDisplayDetails`, `_forcePowerDisplayDetails`),
`swffg-main.js` (~`1110`), + a partial in `actor-sheet-ffg.js`. (~70 ln.)

The `if (li.hasClass("expanded")) { details.slideUp(200, …remove()) } else {
…append/show; slideDown(200) } li.toggleClass("expanded")` skeleton repeats; the
bodies differ only in how the inner `.item-details` HTML is built (enrichHTML vs
renderDiceImages vs property tags) and one uses `.hide()` not `.remove()`.

**Plan:** `Helpers.toggleSlideDetails(li, contentFactory, { remove = true })` in
`modules/helpers/common.js`; each caller passes its content builder.

**Effort:** low · **Risk:** low–med (jQuery animation/interaction; the
`.remove` vs `.hide` and async-content variations are the trap).
**⚠ Verify:** expand/collapse an item row on an item sheet AND an actor sheet AND
the swffg-main site; confirm re-expand rebuilds content (the `.remove` variant).

---

## E. CSS cross-file dedup — `mandar.css` re-copies the base  ★ big, visual-verified
From the CSS scan: `mandar.css` and `starwarsffg.css` share **538 selectors**;
**370 are byte-identical** (mandar just copies the base) vs 168 real overrides.
Since `system.json` loads `starwarsffg.css` too, those **370 identical rules are
redundant** — deleting them lets the base show through unchanged (976 → ~600 rules).
Also two within-file cross-gap dups remain (the 3rd `.attributes` copy; the minion
`table.items`/`biography-editor` pair).

**Plan:** remove the 370 byte-identical rules from `mandar.css` (script the
identification — see the throwaway parser used in the sweep), keeping only real
overrides + mandar-only rules.

**Effort:** med · **Risk:** med — hand-maintained theme under V13 `@layer`
ordering (mandar wins). **Must do a before/after visual diff.**
**⚠ Verify:** screenshot every sheet + dialog under the **live Mandar theme**
before and after; diff. Do NOT recompile.

---

## F. Lower-priority / opportunistic
- **F.9 `foundry.utils` sweep (do first — mechanical, safe, own PR):**
  `JSON.parse(JSON.stringify(x))` → `foundry.utils.deepClone(x)` (~20 sites:
  `import-helpers.js`, `swffg-main.js`, `actor-ffg.js`, `item-ffg.js`,
  `swa-importer.js`…); `new Date().getTime()` ID generation →
  `foundry.utils.randomID()` (~10 sites: `item-editor.js`, `character-creator.js`,
  `swffg-migration.js`…). Behavior-preserving; fixes collision-prone timestamp IDs.
- **F.6 single-instance dialog guard** → `Helpers.openSingletonDialog(key, factory)`;
  largely collapses once **A** lands.
- **F.10 `crew-settings.js`** re-implements `ffgSettings._buildSettingsContext`
  (~18 ln); the 7 `ui-settings.js` subclasses repeat an identical `static PARTS`
  (move to the `ffgSettings` base).
- **F.11 `apply-crit.js` / `apply-damage.js`** share a chat-button bind + target
  resolution skeleton (~25–30 ln) → a small `chat-actions.js` helper. Keep the
  permission gate semantics exactly (they route through `gm-bridge`).
- **F.12 `confirmDialog({title, content, onConfirm, …})` factory** for the ~30
  `DialogV2.wait` two-button sites — **conservative: only the plain confirm/cancel
  cases**; leave bespoke dialogs (3-button, custom icons, render/close hooks) alone.
  Note DialogV2 callbacks are `(event, button, dialog)`.

---

## Recommended order (value × safety)
1. **F.9** `foundry.utils` sweep — mechanical, touches nothing fragile.
2. **A** `SheetOptions` base — biggest single win; drains F.6.
3. **D** slide-toggle helper.
4. **B** `FFGWindowMixin` — high value but it's the submit path; test hardest.
5. **E** `mandar.css` cross-file dedup — visual-verified.
6. **C** actor drag/drop — defer or quantify-only.
7. **F.10 / F.11 / F.12** — opportunistic.

## Verification assets
- `tests/v2-migration/{sheet-tab-cache,form-submit-coalesce}.test.js` (in-Foundry
  Functional Tests panel) cover tab cache + submit coalescing — run after **B**.
- Per-stage manual checklists in `docs/superpowers/verification/`.
- The duplication sweep's full findings are summarized in the session transcript
  that produced this doc (2026-06-04).
