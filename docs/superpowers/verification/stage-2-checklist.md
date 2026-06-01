# Stage 2 Verification — `FormApplicationV2Compat` → `ApplicationV2`

> Filled in by Stage 2's first PR. All boxes ticked before
> `modules/apps/form-application-v2-compat.js` is deleted (`Step 2.9`).

## Automated tripwire
- [ ] `V2 Migration — Form Submit Coalesce` suite green.

## Per-class live flows
- [ ] **popout-editor** — open from a notable-features / description block;
      edit; Save persists and closes; window fills; min-size sane.
- [ ] **popout-modifiers** — long modifier list scrolls within the window.
- [ ] **ffg-destiny-tracker** — blur halo hugs the widget + 10px gap; pool
      add/spend works.
- [ ] **roll-builder** — skill / weapon / force / vehicle rolls each build and
      submit a pool.
- [ ] **groupmanager** — member add/remove; destiny pool.
- [ ] **crew-settings / ui-settings** — save/load round-trip.
- [ ] **skills-list-importer / swa-importer** — complete one import each.
- [ ] **item-editor** — embedded talent/upgrade/force-power editor save
      lifecycle (no biography-editor-style regression).

## Regression guards (must still hold)
- [ ] Submit coalescing / render-race protection: repeat each original repro.

## Theme
- [ ] **Mandar theme**: destiny halo, popout editor fill, popout modifiers
      scroll, dice pool all render correctly under Mandar.

## Guard bookkeeping
- [ ] 10 FormApplicationV2Compat importers removed from the ESLint allowlist.
- [ ] `**/form-application-v2-compat.js` pattern removed from the rule.
- [ ] `grep -rn FormApplicationV2Compat modules/` → 0 hits; file deleted.
