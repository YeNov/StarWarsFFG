# Stage 1 Verification — `DialogV2Compat` → `DialogV2`

> Filled in by Stage 1's first PR. Every box must be ticked on the deletion
> PR (`Step 1.8`) description before `modules/apps/dialog-v2-compat.js` is
> removed. Driven live in the running world (GM) + the V2-migration suite.

## Automated tripwire
- [ ] `V2 Migration — Dialog Submit` suite green (run the Functional Tests
      harness; or `import()` it from the console).

## Per-cluster live flows
- [ ] **Helpers** — apply-crit + apply-damage chat buttons open their dialog,
      confirm applies once, cancel/✕/Esc close cleanly.
- [ ] **Startup/migration** — reload world; any migration dialog renders and
      its action runs exactly once.
- [ ] **Combat** — initiative / setup dialogs (4 sites in combat-ffg.js) open
      and resolve during a combat round.
- [ ] **Group manager** — both dialogs open and resolve.
- [ ] **Sheet Options** — actor + item; rapid double-click brings the existing
      dialog to front (no stack); ✕/Esc release the single-instance lock.
- [ ] **Item sheet** — Add Source, Add Tag (focus lands in the text field, not
      the submit button), plus the 3 internal purchase/config dialogs.
- [ ] **Actor sheet** — XP adjust (no double-apply), purchase, drop-talent,
      character-creator entry, and the remaining dialogs.

## Regression guards (must still hold)
- [ ] Single-instance: two fast clicks → one dialog.
- [ ] Focus: `[autofocus]` markup keeps keyboard focus on the field.
- [ ] Close-path cleanup: button / ✕ / Esc all release locks.
- [ ] z-index: dialog renders above its parent sheet.

## Guard bookkeeping
- [ ] 12 DialogV2Compat importers removed from the ESLint allowlist.
- [ ] `**/dialog-v2-compat.js` pattern removed from the restricted-imports rule.
- [ ] `grep -rn DialogV2Compat modules/` → 0 hits; file deleted.
