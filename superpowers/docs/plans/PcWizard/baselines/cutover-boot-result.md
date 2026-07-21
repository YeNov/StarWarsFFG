# GATE-CUTOVER-BOOT — result

**Date:** 2026-07-21
**Verifier:** owner (human), at a running Foundry v13 world.
**Outcome:** PASS.

## Checks (§0.4)

1. **System loads** — PASS. No `Failed to resolve module specifier` and no module-resolution
   error in the console.
2. **Entry button opens the new wizard** — PASS. The `#ffgCharacterWizard` button opens the
   rewritten `CharacterCreator` (via the one-line shim → `char-creator/pc-wizard.js`).
3. **Opens on `background`, no `rules` tab, all nine tabs render** — PASS. The tab bar renders,
   the wizard opens on Background, there is no Rules tab, and the nine tabs switch.
4. **Console clean** — PASS (owner-confirmed against `console-baseline.txt`).

## Defects found and fixed during the boot check (all pre-commit, Stage 18)

- **Preview build validation** (`name` / `prototypeToken.name` undefined): the draft starts
  unnamed and core `_initializeSource` (actor.mjs:95) only derives the token name from a truthy
  actor name. Fixed in `apply-build.js` with a `"New Character"` fallback (the user's name wins).
- **Header multi-root**: an AppV2 PART must render one root element; `header.html` had three
  (header div + two `{{>}}` partials). Wrapped in a single `.pc-wizard-header`.
- **Tab navigation unwired**: restored `_prepareContext` `tabs: this._prepareTabs("primary")`,
  `_preparePartContext` (assigns `context.tab`), and the `class="tab …" data-group="primary"
  data-tab="…"` wrapper on all nine tab roots.

## Known-deferred (NOT part of this gate — Stage 23 / follow-up)

- **Styling** — the new templates use new class names with no CSS yet (CSS is hand-maintained);
  the wizard renders functional-but-unstyled.
- **Preview panel** — the copied `actor_preview` partials still expect legacy context vars
  (`skillsList`, `combinedPurchases`, `purchase.item.*`); renders sparse until adapted.
- **Content pools** — species/career/gear/etc. load from compendia via the new source loader;
  exercised and verified live at Stage 23.

`GATE-CUTOVER-BOOT` proves the system RUNS and the wizard opens/renders; it proves nothing about
build correctness (preview parity, effect transfer, tree materialization, draft persistence, the
socket round-trip), which remain for Stage 23.
