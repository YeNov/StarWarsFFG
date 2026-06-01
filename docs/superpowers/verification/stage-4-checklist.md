# Stage 4 Verification — Actor sheets → native `DocumentSheetV2`

> Filled in by Stage 4's first PR. All boxes ticked before
> `actor-sheet-v2-compat.js` / `document-sheet-v2-compat.js` are deleted
> (`Step 4.9`).

## Automated tripwires
- [ ] All three `V2 Migration — *` suites green.

## Per-type open/edit/save (no console errors)
- [ ] character, nemesis, rival
- [ ] minion
- [ ] vehicle
- [ ] homestead

## Behavior guards (must still hold)
- [ ] Drag-drop items / effects / folders / actors onto the sheet.
- [ ] Equip; roll skill/weapon/force; apply damage.
- [ ] Edit mode begin / end (AE suspend / restore).
- [ ] Minimize / restore via header dblclick; resize handle hidden when
      minimized; width fits the title.
- [ ] Header dblclick on Sheet Options / legacy header links does NOT minimize.
- [ ] Minion derived fields update immediately on input change
      (unit_wounds, quantity.max, current wounds, group-skill toggle).
- [ ] Editing an owned item re-renders the actor sheet immediately.
- [ ] Active-effect render suppression: editing armour defence stays correct
      mid-edit and on close (no one-edit-behind).
- [ ] Sheet Options single-instance.

## Sheet wrapper collapse
- [ ] `actor-sheet-ffg-v2.js` + `adversary-sheet-ffg-v2.js` collapsed to
      deprecated aliases; one real registration per kind + deprecated alias.
- [ ] World with `actor.flags.core.sheetClass === "ffg.ActorSheetFFGV2"` /
      `"ffg.AdversarySheetFFGV2"` opens without fallback.

## Theme
- [ ] **Mandar theme**: character (no gray strip), minion (derived fields),
      vehicle (body flex), header glyph colors, chat-action button layout.

## Guard bookkeeping
- [ ] Remaining sheet importers + internal compat imports removed from the
      ESLint allowlist; `**/sheets/*-v2-compat.js` pattern removed.
- [ ] No `*-v2-compat.js` files remain under `modules/sheets/`.
