# Stage 5 Verification — Final sweep

> Filled in by Stage 5's PR. All boxes ticked before `V2-full` merges to
> `main`.

## Deletion proof
- [ ] `ls modules/apps/*-compat.js modules/sheets/*-compat.js` → no matches.
- [ ] `grep -rn '\(FFGDocumentSheetV2\|ActorSheetV2Compat\|ItemSheetV2Compat\|FormApplicationV2Compat\|DialogV2Compat\)' modules/` → 0 hits.
- [ ] ESLint compat-guard rule + allowlist override block both removed from
      `eslint.config.mjs`; `npm run lint` no worse than the recorded baseline.

## SCSS
- [x] `scss/global/_v2_compat.scss` renamed → `_v2_layout.scss` (git mv + header
      comment); import in `scss/starwarsffg.scss` updated. No rules pruned — all
      are still needed as native-V2 layout. Recompile **intentionally skipped**:
      the compiled CSS is hand-maintained and SCSS has drifted (see
      `memory/css-is-hand-maintained.md`); the rules already exist in the
      committed `styles/starwarsffg.css`.

## Docs / memory
- [x] `memory/css-is-hand-maintained.md` rewritten to the final state (resolved
      the stale "recompile reproduces the CSS" claim) + MEMORY.md index updated.
- [~] Session-handoff docs mentioning compat: left as-is on purpose — they are
      point-in-time records of when compat existed, not forward guidance. No
      live/forward doc still implies the compat layer exists.

## Full regression
- [ ] All three V2-migration suites green.
- [ ] Every stage 1–4 live flow re-run in one sitting, **default + Mandar
      themes**, no console errors, no regressions vs the V2-port baseline.

## Land
- [ ] `V2-full` merged to `main`; merge commit tagged `v2-full`.
- [ ] Deprecated sheet aliases scheduled for removal in the next release.
