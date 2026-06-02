# Stage 3 Verification — Item sheets → native `DocumentSheetV2`

> Filled in across Stage 3 (commit `d12758be`). `item-sheet-v2-compat.js` is
> deleted (`Step 3.8`); `ItemSheetFFG` now extends the shared native base
> `FFGDocumentSheet` (`modules/apps/ffg-document-sheet.js`).

**Verification status:** ported and live-verified on the running world (GM,
core 13.351, live Mandar theme `mandarBeskarAstromech.css`). Render tests were
non-mutating (rendered + inspected, then closed with `{submit: false}` so
`submitOnClose` never fired). Write-path tests used clearly-named throwaway
`ZZ_*` items deleted immediately after; no leftover test items / open sheets
remain on the world.

## Automated tripwires
- [ ] `V2 Migration — Sheet Tab Cache` suite — *(harness not run this session;
      the tab cache was exercised live instead, see below.)*
- [ ] `V2 Migration — Form Submit Coalesce` suite — *(harness not run; the
      coalescing `_onSubmit` was exercised live via submit-on-change /
      submit-on-close.)*

## Architecture (probed live)
- [x] Native chain `ItemSheetFFG → FFGDocumentSheet → HandlebarsApplication →
      DocumentSheetV2 → ApplicationV2`; no `ItemSheetV2Compat`/`FFGDocumentSheetV2`
      in the item chain.
- [x] Registration: `ffg.ItemSheetFFG` = "Item Sheet", `default: true`;
      `ffg.ItemSheetFFGV2` = "Item Sheet v2 (deprecated, use Item Sheet)",
      `default: false`.
- [x] Reload clean: `ready`, GM joined, `system: starwarsffg`, no console errors.
- [x] Unique per-document ids (`data-appid = ItemSheetFFG-Item-<id>`), matching
      `appId` so `ItemOptions` resolves the right root (compat's literal
      `id:"item"` collision gone).

## Per-type open (16 of ~20 types; all render, `.v2`, unique id)
- [x] weapon, armour, gear  *(Sheet Options button present — gear/weapon/armour only)*
- [x] talent, force power, signature ability, specialization  *(tree grids:
      specialization 21 nodes @850×1005, signatureability 9 nodes @720×600 —
      `_minDimensions` floor path)*
- [x] career *(locked compendium → non-editable: 73 inputs disabled, exercises
      the `_toggleDisabled` fix)*, species, ability *(→ `item-sheet-talent`)*
- [ ] background, motivation, obligation, homestead upgrade *(absent from world +
      available compendiums; generic `item-sheet-<type>` path, low risk — NOT
      directly tested)*
- [x] critical injury, critical damage *(criticaldamage → `item-sheet-criticalinjury`)*
- [x] item attachment, item modifier *(itemmodifier → `item-sheet-modifiers`)*
- [x] ship weapon *(→ `item-sheet-vehicle-weapon`)*, ship attachment
      *(→ `item-sheet-vehicle-attachment`)*

## Write path (throwaway `ZZ_*` items, deleted after)
- [x] Submit-on-change, document field — `name` persisted.
- [x] Submit-on-change, system field — `data.damage.value` input → 17 →
      `system.damage.value === 17` (the `data.*`→`system.*` map via
      `ItemHelpers.itemUpdate`).
- [x] Submit-on-close — a pending `name` edit flushed on `close()`.

## Behavior guards
- [x] **Biography / embedded editor save lifecycle** — ProseMirror editor mounts
      (`instance.view`), `.editor.prosemirror.editor-active` applied, edit button
      hidden during edit; `_destroyEditor` tears down and restores the button.
      Save routes through the verified `_onSubmit`.
- [x] **Drag-drop wiring** — preserved by construction: the sheet binds
      `foundry.applications.ux.DragDrop` in `activateListeners` against
      `form.editable.item-sheet-<type>`; both classes confirmed present and
      `activateListeners` runs clean for all types; `_onDrop*` handlers unchanged.
      *(A full live drop / purchase-flow simulation was not run — it exercises
      unchanged handler logic, not migration risk.)*
- [ ] **Purchase flow** (buy talent/force/spec upgrade) — NOT run live (mutating;
      handler code unchanged).
- [~] **Sheet Options + Add Source / Add Tag** — Sheet Options button injection
      verified live; the dialogs themselves are native DialogV2 (Stage 1, already
      verified) and their handlers are unchanged. The dialogs were not re-opened
      live this session.
- [x] **Active-tab cache** — open weapon (`attributes`) → click `tags` → close →
      reopen → active tab is `tags` (`cacheWorks: true`).
- [ ] **Embedded-item edit re-renders owning actor sheet** — an actor-sheet
      interaction; deferred to Stage 4.

## Sheet wrapper collapse
- [x] `item-sheet-ffg-v2.js` collapsed to `export class ItemSheetFFGV2 extends
      ItemSheetFFG {}` (+ `@deprecated` JSDoc); one real registration
      (`ItemSheetFFG`, makeDefault) + one deprecated alias entry.
- [x] Forcing `flags.core.sheetClass = "ffg.ItemSheetFFGV2"` yields an
      `ItemSheetFFGV2` instance that renders identically with `.v2` + a unique id.

## Theme
- [x] **Live Mandar theme** (`mandarBeskarAstromech.css`): `.v2` present on every
      sheet so the theme's `.starwarsffg.sheet.item.v2` layout rules apply
      unchanged. Visual check: weapon sheet correct (attribute blocks,
      skill/range/status dropdowns, attachments + qualities tables, vertical tab
      strip, injected Sheet Options link). No CSS changes needed in Stage 3.
      - NOTE: live theme file is `mandarBeskarAstromech.css`, not `mandar.css`
        (auto-memory said `mandar.css`). Moot for Stage 3 (no CSS touched);
        reconcile before any future CSS edit.

## Guard bookkeeping
- [x] `item-sheet-ffg.js` + `item-sheet-v2-compat.js` removed from the ESLint
      allowlist; `**/item-sheet-v2-compat.js` removed from the restricted pattern.
      Added `ProseMirror` to the globals.
- [x] `grep -rn ItemSheetV2Compat modules/` → comments only; file deleted.
- [x] `eslint modules/` → 0 `no-restricted-imports` problems.

## Carried forward to Stage 4
- The `_toggleDisabled` crash still affects **non-editable actor sheets** via the
  untouched compat `FFGDocumentSheetV2`; resolved when actors move to
  `FFGDocumentSheet`.
- `FFGDocumentSheetV2` + `actor-sheet-v2-compat.js` deletion, their allowlist
  entries, and the `**/*-v2-compat.js` restricted patterns clear in Stage 4.9.
- A dedicated live pass for the purchase flow, Add Source/Tag dialogs, and the
  embedded-item → actor re-render is wanted before the V2-full → main merge.
