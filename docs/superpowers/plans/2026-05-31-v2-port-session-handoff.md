# V2 Port Session Handoff — 2026-05-31

Branch: `V2-port`

Latest commit: `27ef34f6 Apply 2-col grid to all Sheet Options rows, not only checkboxes`

Prior handoff (still relevant for everything pre-`7ffcdf43`): [`2026-05-30-v2-port-session-handoff.md`](2026-05-30-v2-port-session-handoff.md)

Reference plan: [`2026-05-30-v2-port-layout-followups.md`](2026-05-30-v2-port-layout-followups.md) — fully executed including the integration smoke pass.

## Done This Session

### Plan follow-up cleanups (review-triggered)

- **Task 6 (regression fix)**: re-applied flag-based active-tab persistence after `b15741c2` had silently reverted `cb381fcc`. Chose a static `Map` cache keyed by `${ctorName}:${doc.uuid}` over `setFlag` to avoid the re-render race that likely caused the original revert. Survives close/reopen within a page session; lost on full reload (acceptable for ephemeral UI state).
- **Task 3 (refactor)**: replaced `fbfba941`'s broad mirror of V13's `applications`-layer rules with a single targeted rule on `:is(.header-name, .minion-name) input`. Identified the load-bearing V13 selector (`body.game .app input[type="text"] { height; line-height: normal }`) so the title-clip fix no longer depends on the legacy `app`/`window-app` classes. Dropped the `body.game` specificity hack.
- **Task 8 (cleanup)**: deleted dead `legacyOptions.X ?? initialized.form.X` lines in both compat shims; literalized `closeOnSubmit: false` in `form-application-v2-compat.js` so its lock-down block is byte-identical to the document-sheet one.

### Plan follow-up todos (handoff doc carry-over)

- **Close hook re-emission**: added `_callLegacyCloseHook` in `FFGDocumentSheetV2.close()` mirroring the `43cf09a2` render-side emission, so modules listening for `closeActorSheet` / `closeItemSheet` (e.g. ffg-star-wars-enhancements) get the signal on V2 sheets.
- **Diagnostic for missing Sheet Options button**: added `console.warn` in `_findSheetRoot` null paths in both `actor-ffg-options.js` and `item-ffg-options.js` so the silent failure now leaves a breadcrumb.
- **`.gitattributes`**: added `* text=auto eol=lf` plus a binary list to stop CRLF/LF stat churn on Windows hosts; followed by a `git add --renormalize .` commit that flushed CRLF out of 51 tracked files.
- **Plan markdown committed**: the prior session's two untracked plan/handoff docs are now in repo history.

### Integration smoke pass (final task in the plan)

- All ten plan-task fixes verified live on the character sheet via DOM probe (Task 2 labeled header links, Task 3 stable title height under class removal, Task 4 grid still scrolls, Task 5 dual-class resize handle, Task 6 tab preserved across close/reopen, Task 7 `jQuery:false` honoured, Task 8 single update per change, Task 9 FA weight 900, Task 10 form rendered normally; Task 1 Sheet Options dialog body populated with 6 form groups).
- Cross-sheet sweep: character, minion, rival, nemesis, vehicle, weapon, armour, gear, talent, forcepower, ability, itemmodifier, itemattachment, criticalinjury — all render with correct root classes, header links, FA weight, and dual-class resize handle.
- Play-loop sanity: skill-roll on character sheet opens RollBuilderFFG cleanly, no console errors.
- Cross-branch metric parity: `character contentH=753/bodyH=493`, `minion 614/354`, `vehicle 794/341` — bit-for-bit match against the prior handoff's verified `main` baseline.

### User-reported issue list #1 (character sheet, real-use screenshots)

Seven distinct issues, all fixed and live-verified on the running world:

1. **Edit mode toggle didn't re-apply AEs (BIG ISSUE)** — `ActorOptions` was reinstantiated on every sheet render and the handler itself calls `sheet.render(true)`, wiping `this.suspended` mid-flow. Moved the suspended state to a `static _suspendedAECache` keyed by actor UUID. Live test: soak 2 → 0 → 2 across an enable+accept / close-and-reopen / disable+accept cycle; all 7 AEs disabled → re-enabled.
2. **Sheet Options link navigated to `#`** — `<a href="#">` click handler didn't `preventDefault`. Added `event.preventDefault()` + `event.stopPropagation()` in both `actor-ffg-options.js` and `item-ffg-options.js` `handler`s.
3. **Duplicate Accept / Cancel button rows** — `cedccae6`'s spread of `this.data` into the dialog template context made the template's own `{{#each buttons}}` loop render buttons that duplicated DialogV2's footer. Destructure `buttons` out of the template context.
4. **Form-group rendered as three horizontal columns** — added scoped CSS to restore the stacked / row-flex layout inside `.sheet-options-dialog`.
5. **Sheet / Prototype Token labels duplicated in header** — projected them as inline links but they're also in the `⋮` dropdown. Reduced `LEGACY_HEADER_ACTIONS` allowlist to `["close"]`.
6. **Gray strip at the bottom of the character sheet** — replaced fixed `flex: 0 0 calc(100% - 15.75rem)` with `flex: 1 1 auto; min-height: 0` on `.window-content.character` / `.minion` so the body fills the column. Inner panels with `calc(100% - Xrem)` still resolve correctly under the now-pixel-derived body height.
7. **Resize corner was a blank square** — `::before` with FA glyph `` (`fa-up-right-and-down-left-from-center`), `pointer-events: none` so the drag handler still receives events. Visually verified diagonal double-arrow at bottom-right.

### Follow-up requests after #1

- **Remove labeled "Close" link from header** — the `×` icon already covers it. Emptied `LEGACY_HEADER_ACTIONS` to `new Set()`; the Sheet Options link is still injected by `ActorOptions`/`ItemOptions` independently.
- **Weapon sheet × button did nothing** — `submitOnClose:true` ran `document.update`, which fires *two* re-renders (the `updateItem` auto-render hook AND an explicit `this.render(true)` inside `ItemHelpers.itemUpdate` line 44 / `ActorHelpers.updateActor`), both racing `super.close`. Threaded `render: false` through `_onSubmit` → `_updateObject` → `document.update` but subclass overrides ignored it. Final fix: set `this._closing = true` in `close()` and override `render()` to bail when set. Catches all paths.
- **Audit other windows for the same race** — verified close-cleanly: every item sheet type, `DialogV2`, `RollBuilderFFG`, `PopoutModifiers`. Identified `itemEditor` / `talentEditor` / `forcePowerEditor` (in `modules/items/item-editor.js`) as same-pattern risks via static audit — they extend `FormApplicationV2Compat`, use `submitOnClose:true`, and call `this.render(true)` from `_updateObject` overrides at lines 132/275/536. Applied the same `_closing` guard to `FormApplicationV2Compat` preemptively. Foundry server went down before live-verification; the user will spot-check manually.

### Sheet Options dialog visual polish (iterative)

User feedback drove four passes:

- First pass — basic dense layout, light-orange tint on unchecked checkboxes (`5a714eda`).
- Second pass — V13's `applications` layer was winning the cascade; added `!important` throughout and equalized checked/unchecked checkbox sizing with `appearance: none` + FA check glyph (`2382b923`).
- Third pass — wrong visual association of title / checkbox / description. Booleans switched to a 2-column CSS grid (`:has` on checkbox child) with `grid-template-areas "label field" / "notes field"`; text/select stayed stacked (`34ad9009`).
- Fourth pass — user wanted text and select to follow the same V1 pattern. Applied the 2-column grid to every form-group; text/select get a fixed 180px width on the right column (`27ef34f6`).

End state: title + description tightly stacked on the LEFT (1px between them), control aligned center-right at 180px / 20px, options separated by 16px vertically. Both checkbox states are 20×20 with orange tint; checked uses an FA `` glyph.

## Relevant Commits (this session, oldest → newest)

```
217a9f8d Persist active sheet tab via static cache
5e27660f Replace fbfba941 broad mirror with targeted title-input rule
cd691879 Drop dead form.* legacy plumbing in V2 compat shims
bd993a0f Re-emit close<X>Sheet legacy hooks alongside render hooks
57678883 Warn when sheet-options injection cannot resolve the sheet root
cdd53fc6 Add .gitattributes to normalize line endings on commit
cb92ac95 Renormalize tracked text files to LF line endings
7ffcdf43 Commit V2-port follow-up plan and session handoff docs
234fe982 Persist suspended-AE state on ActorOptions static cache
b624d8c5 Prevent default navigation on Sheet Options header link click
a5ff136a Drop duplicate buttons from DialogV2Compat template context
fd1eaffe Restore vertical form-group layout inside Sheet Options dialog
47718ee0 Project only close action from V13 controls into legacy header
2c9f9a2b Fix character sheet body overflow leaving gray strip
881387d8 Render diagonal arrow on V2 sheet resize corner
fb8091bd Remove labeled Close link from V2 sheet header
7362a6e5 Block re-render during sheet close to stop weapon/item × button race
5fbc5147 Block re-render during FormApplicationV2Compat close
5a714eda Densify Sheet Options dialog and tint empty checkboxes
2382b923 Tighten Sheet Options layout, equalize checkbox box-model
34ad9009 Lay out Sheet Options as V1: title+notes left, control right
27ef34f6 Apply 2-col grid to all Sheet Options rows, not only checkboxes
```

## Current Worktree Notes

- Working tree clean (`git status` empty after `27ef34f6`).
- No untracked files. The prior handoff doc and the plan doc are both tracked now.
- A `.gitattributes` is in place. Phantom-modification stat churn on `modules/sheets/document-sheet-v2-compat.js` should not recur.
- Branch is NOT pushed and no PR is open. Push/PR is a user decision; the user explicitly asked to skip during this session.

## Known Issues Left

Carried over from prior handoff (not addressed this session):

- V2 root positioning still uses `absolute` where `main` used `fixed`. Practical impact still unknown — no reported user-visible regression.
- `FORM.window-content` vs `SECTION.window-content` structural difference. The CSS bridges work on every sheet tested in this session, but a deeper audit across third-party module styling has not happened.

New from this session, not yet verified:

- **`itemEditor` / `talentEditor` / `forcePowerEditor` close race**: preemptive `_closing` guard in `FormApplicationV2Compat` (`5fbc5147`) was committed but never live-tested before the Foundry server went down. User to spot-check by opening a talent/upgrade editor (click an upgrade pip on a forcepower or specialization) and clicking ×.
- **Field-edit double-fire test**: only 1 update fired during the set+restore name test, instead of the expected 2. Likely because the second change hit while `this._submitting` was still `true` and the early-return in `_onSubmit` caught it. Worth re-testing more carefully if rapid edits show stale-data symptoms.
- **Sheet Options dialog visual state**: last committed (`27ef34f6`) without live-verification per user direction. Visual tuning may still need iteration if the 180px control width or 16px block separation feels off.

## Suggested Next Steps

1. Spot-check `itemEditor` / `talentEditor` / `forcePowerEditor` close behaviour. If broken, the `_closing` guard already covers it; if good, no action.
2. Visually verify the latest Sheet Options dialog layout (`27ef34f6`) — confirm title/description proximity, control width, and block separation match the V1 reference.
3. Continue addressing user issue lists as they come in.
4. When the branch is ready, push and open a PR linking the plan + both handoff docs in the description.
