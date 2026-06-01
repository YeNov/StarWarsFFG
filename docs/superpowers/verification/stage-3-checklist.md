# Stage 3 Verification — Item sheets → native `DocumentSheetV2`

> Filled in by Stage 3's first PR. All boxes ticked before
> `modules/sheets/item-sheet-v2-compat.js` is deleted (`Step 3.8`).

## Automated tripwires
- [ ] `V2 Migration — Sheet Tab Cache` suite green.
- [ ] `V2 Migration — Form Submit Coalesce` suite green.

## Per-type open/edit/save (no console errors)
- [ ] weapon, armour, gear
- [ ] talent, specialization, force power, signature ability
- [ ] career, species, ability
- [ ] background, motivation, obligation, homestead upgrade
- [ ] critical injury, critical damage
- [ ] item attachment, item modifier
- [ ] ship weapon, ship attachment

## Behavior guards (must still hold)
- [ ] Biography / embedded editor save lifecycle (no disappear-on-save).
- [ ] Drag-drop into the sheet; drop-talent; purchase flow.
- [ ] Sheet Options + Add Source / Add Tag: single-instance, field focus,
      close-path cleanup.
- [ ] Active-tab cache: select a tab, close, reopen → same tab; in-place
      re-render does not snap back to default.
- [ ] Editing an embedded item re-renders the owning actor sheet immediately.

## Sheet wrapper collapse
- [ ] `item-sheet-ffg-v2.js` collapsed to a deprecated alias; one real item
      registration + at most one deprecated alias entry.
- [ ] World with `item.flags.core.sheetClass === "ffg.ItemSheetFFGV2"` opens
      without fallback; alias visible in sheet-config picker with new label.

## Theme
- [ ] **Mandar theme**: representative subset (weapon, talent, career, species,
      item attachment + Add Source/Tag + Sheet Options) — body overflow flex,
      `.metadata-add-control` position, sheet-body scroll, Sheet Options grid.

## Guard bookkeeping
- [ ] `item-sheet-ffg.js` (if Stage 1 cleared its dialog imports) and
      `item-sheet-ffg-v2.js` removed from the ESLint allowlist.
- [ ] `grep -rn ItemSheetV2Compat modules/` → 0 hits; file deleted.
