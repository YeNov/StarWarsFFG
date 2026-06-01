# Stage 5 Verification — Final sweep

> Filled in by Stage 5's PR. All boxes ticked before `V2-full` merges to
> `main`.

## Deletion proof
- [ ] `ls modules/apps/*-compat.js modules/sheets/*-compat.js` → no matches.
- [ ] `grep -rn '\(FFGDocumentSheetV2\|ActorSheetV2Compat\|ItemSheetV2Compat\|FormApplicationV2Compat\|DialogV2Compat\)' modules/` → 0 hits.
- [ ] ESLint compat-guard rule + allowlist override block both removed from
      `eslint.config.mjs`; `npm run lint` no worse than the recorded baseline.

## SCSS
- [ ] `scss/global/_v2_compat.scss` renamed (e.g. `_v2_layout.scss`) or its
      no-longer-needed rules pruned; import in `scss/starwarsffg.scss` updated;
      recompile reproduces `styles/starwarsffg.css`.

## Docs / memory
- [ ] `memory/css-is-hand-maintained.md` updated to the final state.
- [ ] Session-handoff docs mentioning compat updated.

## Full regression
- [ ] All three V2-migration suites green.
- [ ] Every stage 1–4 live flow re-run in one sitting, **default + Mandar
      themes**, no console errors, no regressions vs the V2-port baseline.

## Land
- [ ] `V2-full` merged to `main`; merge commit tagged `v2-full`.
- [ ] Deprecated sheet aliases scheduled for removal in the next release.
