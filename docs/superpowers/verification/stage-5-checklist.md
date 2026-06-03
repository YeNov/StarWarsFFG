# Stage 5 Verification — Final sweep

> Filled in by Stage 5's PR. All boxes ticked before `V2-full` merges to
> `main`.

> **5.5 sign-off basis (2026-06-03 — owner decision):** per the project owner,
> Stage 5.5 is treated as **covered** by cumulative branch verification (the
> per-stage live spot-checks, the Stage 1–4 "COMPLETE" acceptance, the
> live-verified bug-fix commit stream, and the 2026-06-03 GM UI sweep). It was
> **not** independently re-run in a single sitting; the automated
> `tests/v2-migration` suites and the player (Andre) account were **not**
> separately executed — accepted as known gaps. The code-fact (deletion-proof)
> boxes below are verified fresh.

## Deletion proof
- [x] `ls modules/apps/*-compat.js modules/sheets/*-compat.js` → no matches. *(verified 2026-06-03)*
- [x] `grep … modules/` → **0 live refs**; only a few historical mentions remain
      in code comments (`ffg-document-sheet.js`, `item-sheet-ffg.js`). *(verified)*
- [x] ESLint compat-guard rule + allowlist override removed from
      `eslint.config.mjs` (whole rule gone in Stage 4.9); `eslint modules/` → 0
      `no-restricted-imports` problems. *(verified)*

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
- [~] All three V2-migration suites green — **not run** (harness never executed;
      the dialog-submit / tab-cache / form-coalesce paths were exercised live in
      Stages 1–4). Accepted gap per the owner decision above.
- [~] Every stage 1–4 live flow re-run in one sitting, default + Mandar — **not**
      done as a single-sitting sweep. Accepted as covered by cumulative branch
      verification (see banner); player (Andre) account not separately swept.

## Land
- [ ] `V2-compat-elimination` merged to `main`; merge commit tagged. *(Stage 5.6
      — pending explicit go-ahead. Branch is `V2-compat-elimination`, not the
      plan's original `V2-full`.)*
- [x] Deprecated sheet aliases (`ItemSheetFFGV2`, `ActorSheetFFGV2`,
      `AdversarySheetFFGV2`) scheduled for removal in the release after this one
      — documented in the plan (Steps 3.7 / 4.8).
