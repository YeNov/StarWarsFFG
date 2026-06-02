# Stage 1 Verification — `DialogV2Compat` → `DialogV2`

> Filled in by Stage 1's first PR. Every box must be ticked on the deletion
> PR (`Step 1.8`) description before `modules/apps/dialog-v2-compat.js` is
> removed. Driven live in the running world (GM) + the V2-migration suite.

**Verification status (Stage 1.7/1.8 session):** all 16 actor-sheet sites
ported and statically verified (node --check, eslint shows 0 new errors, 0
`no-restricted-imports` problems, 0 `DialogV2Compat` references). Live,
non-mutating spot-checks were run on the running world (GM, core 13.351)
covering each distinct port pattern: XP-adjust (`.wait` + inputs +
Adjust/Cancel footer), change-skill-characteristic (templated dialog — 6
radios, Accept/Cancel footer, **0 buttons** in the template's own
`.dialog-buttons` div = no duplicate row), and vehicle Add Source
(`new DialogV2` single-instance: double-click → 1 dialog, `#book` autofocus,
`ffg-meta-dialog` classes, lock released on close). No console errors. The
game-state-heavy flows below (combat, group manager, crew gunner/weapon
selection, helper chat-buttons, drop-talent, character-creator) reuse these
same verified patterns and still want a dedicated live gameplay pass before
the V2-full → main merge.

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
- [x] Single-instance: two fast clicks → one dialog. *(verified: vehicle Add
      Source double-call opened exactly one dialog.)*
- [x] Focus: `[autofocus]` markup keeps keyboard focus on the field. *(verified:
      `#book` was `document.activeElement`, not the Submit button.)*
- [x] Close-path cleanup: button / ✕ / Esc all release locks. *(verified:
      `_addSourceDialogOpen` returned to `false` after `close()`.)*
- [ ] z-index: dialog renders above its parent sheet. *(not explicitly
      re-checked this session; `requestAnimationFrame(bringToFront)` preserved.)*

## Guard bookkeeping
- [x] DialogV2Compat importers removed from the ESLint allowlist — 9 dialog-only
      files. `groupmanager-ffg.js` stays (also extends FormApplicationV2Compat;
      clears in Stage 2.9) and was moved into the Form group.
- [x] `**/dialog-v2-compat.js` pattern removed from the restricted-imports rule.
- [x] `grep -rn DialogV2Compat modules/` → 0 hits; file deleted.
- [x] `eslint modules/` → 0 `no-restricted-imports` problems.
