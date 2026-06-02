# Stage 4 Verification — Actor sheets → native `DocumentSheetV2`

> Filled in across Stage 4 (commit `ba9b00a3`). `actor-sheet-v2-compat.js` and
> `document-sheet-v2-compat.js` are deleted (`Step 4.9`); `ActorSheetFFG` now
> extends the shared native bases `FFGActorSheet → FFGDocumentSheet`
> (`modules/apps/`).

**Verification status:** ported and live-verified on the running world (GM,
core 13.351, live Mandar theme `mandarBeskarAstromech.css`). Render tests were
non-mutating (closed with `{submit:false}`). Write/drag tests used throwaway
`ZZ_S4_*` actors deleted immediately after; no leftover test docs / open sheets
remain.

## Automated tripwires
- [ ] `V2 Migration — *` suites — *(harness not run this session; the relevant
      paths were exercised live instead.)*

## Architecture (probed live)
- [x] Native chain `ActorSheetFFG → FFGActorSheet → FFGDocumentSheet →
      HandlebarsApplication → DocumentSheetV2 → ApplicationV2`; no
      `ActorSheetV2Compat`/`FFGDocumentSheetV2`.
- [x] Registration: `ffg.ActorSheetFFG` = "Actor Sheet", `default: true`;
      `ffg.AdversarySheetFFG` = "Adversary Sheet" (types: character); both V2
      names registered without `makeDefault` as "… (deprecated, use …)" aliases.
- [x] Reload clean: `ready`, GM, `system: starwarsffg`; no console errors; system
      loads without EITHER deleted compat file.

## Per-type open (all six; throwaway actors)
- [x] character — renders, `.actor.v2`, form class `character`, 9 tabs, Sheet
      Options present, unique id.
- [x] nemesis, rival — render, form class `character` (type→`character` map), 8
      tabs, Sheet Options.
- [x] minion — renders, form class `minion`, 6 tabs, Sheet Options.
- [x] vehicle — renders, form class `vehicle`, 7 tabs, Sheet Options.
- [x] homestead — renders, form class `homestead`, 3 tabs (no Sheet Options —
      pre-existing).

## Behavior guards
- [x] **Drag-drop item onto the sheet** — dispatching a real `drop` with item
      drag data created the embedded item (`items 0→1`), exercising the
      option-based path: DragDrop wiring (`_dragDrop.length === 1`) → `_onDrop`
      (FFGActorSheet) → `_onDropItem` (ActorSheetFFG) → `_onDropItemCreate`.
- [~] **Effects / folders / actors drop** — same `_onDrop` dispatcher + unchanged
      `_onDropActiveEffect`/`_onDropFolder`/`_onDropActor` handlers on
      `FFGActorSheet`; only the item case was simulated live.
- [x] **Write path** — submit-on-change (`name`) and submit-on-close persist
      through the migrated pipeline (incl. `FFGActorSheet._getSubmitData`).
- [ ] **Equip / roll skill·weapon·force / apply damage** — NOT run live
      (mutating, gameplay); handler code unchanged. Deferred to Stage 5.5.
- [x] **Edit mode getData branch** — sheet renders with
      `config.enableEditMode` both true and false. *(Full AE suspend/restore is
      unchanged `ActorHelpers.beginEditMode/endEditMode`; the AE-override
      stripping in `_getSubmitData` is byte-identical to the compat.)*
- [~] **Minimize / restore (header dblclick), resize-handle hide, width-fits-
      title** — base machinery (`FFGDocumentSheet`, verified structurally in
      Stage 3); not re-clicked live for actors.
- [ ] **Minion derived fields update on input** — unchanged listener body; not
      driven live. Deferred to Stage 5.5.
- [ ] **Owned-item edit re-renders the actor sheet** — unchanged
      `ItemHelpers.itemUpdate` + explicit render; not driven live.
- [x] **Sheet Options injection** — present on character/minion/vehicle/
      nemesis/rival (ActorOptions via `data-appid` on `.starwarsffg.sheet.actor`).

## Sheet wrapper collapse
- [x] `actor-sheet-ffg-v2.js` + `adversary-sheet-ffg-v2.js` → empty
      `extends …` aliases (+ `@deprecated`). One real registration per kind +
      one deprecated alias each.
- [x] Forcing `flags.core.sheetClass = "ffg.ActorSheetFFGV2"` →
      `ActorSheetFFGV2` instance (chain `…FFGV2 → ActorSheetFFG → FFGActorSheet`),
      renders with `.v2`. Forcing `"ffg.AdversarySheetFFGV2"` →
      `AdversarySheetFFGV2` (chain `…FFGV2 → AdversarySheetFFG → ActorSheetFFG`),
      renders with `.adversary.v2`.

## Theme
- [x] **Live Mandar theme**: `.actor.v2` present on every actor sheet so the
      theme rules apply. Visual check — a real character sheet (Jovel Nial)
      renders correctly: portrait, Species/Career/Specs/Force-Power drag zones,
      WOUNDS/STRAIN/SOAK/DEFENSE blocks, the six characteristic dials, the full
      General/Combat/Social skills grids with dice glyphs, the vertical `.v2` tab
      strip, and the injected Sheet Options link. No CSS changed in Stage 4.

## Guard bookkeeping
- [x] All sheet importers + internal compat imports removed; the entire
      `no-restricted-imports` rule + allowlist override removed from
      `eslint.config.mjs` (nothing left to guard → also completes Step 5.2).
- [x] No `*-v2-compat.js` files remain anywhere in `modules/`.
- [x] `eslint modules/` → 0 `no-restricted-imports` problems; total problems
      dropped 606→580 (compat deletion), no new errors.

## Deferred to Stage 5 (final sweep)
- 5.3 SCSS `_v2_compat.scss` rename/prune (blocked on the hand-maintained-CSS
      rule — the served CSS is edited directly, the SCSS is not recompiled).
- 5.4 memory/handoff update (incl. the `mandar.css` vs `mandarBeskarAstromech.css`
      clarification — the active theme `@import`s `mandar.css`, so the existing
      memory guidance still holds).
- 5.5 full live gameplay regression (rolls, apply-damage, equip, minion derived
      inputs, minimize-restore, multi-field round-trips) under both themes.
- 5.6 merge `V2-full` → `main` (requires explicit go-ahead).
- Trivial: 5 historical `ItemSheetV2Compat` mentions remain as code comments in
      `item-sheet-ffg.js` (Stage 5's zero-grep acceptance wants them reworded).
