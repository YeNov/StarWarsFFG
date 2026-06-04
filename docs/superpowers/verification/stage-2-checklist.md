# Stage 2 Verification — `FormApplicationV2Compat` → `ApplicationV2`

> Filled in across Stage 2. All boxes ticked before
> `modules/apps/form-application-v2-compat.js` is deleted (`Step 2.9`).

> **Stage 5.5 reconciliation (2026-06-03 — owner decision):** the per-class live
> flows are ticked; the one remaining unticked box (the automated Form Submit
> Coalesce suite) is a known, accepted gap — that path was exercised live, not
> via the harness. Authoritative sign-off: `stage-5-checklist.md`.

**Verification status (Stage 2 session):** each class was ported and
live-verified on the running world (GM, core 13.351, Mandar theme),
non-mutating (rendered + the key behavior probed via instance methods /
synthetic events on throwaway or compendium docs, then closed/cleaned up).
Render + the native form/chrome wiring is confirmed for every class; the
full gameplay matrix below (real rolls of each type, a full import, member
add/remove via the UI, multi-field save round-trips) reuses the same verified
pipelines and still wants a dedicated live gameplay pass before V2-full → main.

## Automated tripwire
- [ ] `V2 Migration — Form Submit Coalesce` suite green. *(harness not run this
      session; the coalescing `_onSubmit` + submitOnChange/submitOnClose were
      exercised live instead — see popout-modifiers / item-editor below.)*

## Per-class live flows
- [x] **popout-editor** — renders; ProseMirror save persists to the doc and
      closes; window fills (pm 474/523px); 720×520 min-clamp holds.
- [x] **popout-modifiers** — renders as the form; editing a modifier value
      submits-on-change and persists (1→6); add-row works (1→2); list scrolls
      (flex column + overflow-y auto); submitOnClose flushes on close.
- [x] **ffg-destiny-tracker** — renders as #destiny-tracker at lower-left; 1px
      dark `.swffg-destiny` border, backdrop-filter none (no halo); header
      hidden; draggable (persists position) with the flip-suppress guard.
- [x] **roll-builder** — renders with 15 pool inputs + 4 upgrade buttons;
      clicking a pool increments + updates preview; the Roll button fires
      without error and produces chat; close() removes the targetToken hook.
      *(every weapon/force/vehicle roll path = unchanged button logic; gameplay
      pass pending.)*
- [x] **groupmanager** — renders as the form, GM-editable; 6 PC rows; dPool
      inputs initialized; submitOnClose round-trips dPool with no change.
      *(member add-to-combat / XP grant = unchanged handlers; gameplay pending.)*
- [x] **crew-settings / ui-settings** — render as forms; ruleset panel title
      localizes ("Ruleset Settings"); a no-op submit changes no setting and
      throws nothing. *(a real multi-field save round-trip pending.)*
- [x] **skills-list-importer / swa-importer** — render with the file-input
      `<form>` + the `data-importer-window` class; SWA's global
      `$("form.data-importer-window")` resolves. *(a full import run pending.)*
- [x] **item-editor** — talent editor renders with the dynamic title, BASICS/
      BASE MODS tabs (+ switching), the Description textarea fix (487px),
      and submitOnChange → _updateObject. *(full save to a writable doc +
      drag-drop mods pending.)*

## Regression guards (must still hold)
- [x] Submit coalescing / render-race protection: the coalescing `_onSubmit`
      and the `_closing` render-guard live on the new `FFGFormApplication`
      base; submitOnChange + submitOnClose verified live (popout-modifiers,
      item-editor) with no double-apply or render-race errors. *(the original
      spec-tree multi-click repro still worth a manual replay.)*

## Theme
- [x] **Mandar theme**: all per-class checks above were run with Mandar as the
      active theme — destiny frame/no-halo, popout editor fill, popout modifiers
      scroll, roll-builder, settings, and the embedded-editor textarea fix all
      render correctly under Mandar.

## Guard bookkeeping
- [x] 10 FormApplicationV2Compat importers removed from the ESLint allowlist.
- [x] `**/form-application-v2-compat.js` pattern removed from the rule.
- [x] `grep -rn FormApplicationV2Compat modules/` → 0 hits; file deleted.
- [x] `eslint modules/` → 0 `no-restricted-imports` problems.
