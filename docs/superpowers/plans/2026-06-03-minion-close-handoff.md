# Minion sheet "close" (X) doesn't work — handoff (2026-06-03)

**Status: RESOLVED** (commit `8021872d`, user-confirmed). Kept as a debugging record.

## Resolution
Confirmed hypothesis #1 below: `FFGDocumentSheet.close` ran submit-on-close
(`_onSubmit`) with an **unguarded `await`** — when it threw, `super.close()`
never ran and the × did nothing. The path was never exercised for actors (Stage 4
always closed with `{submit:false}`).

Fix (`8021872d`):
- `FFGDocumentSheet.close`: wrap submit-on-close in try/catch so a failed submit
  logs and the sheet still tears down (matches Foundry's own close); also
  log+rethrow if `super.close` itself throws.
- `FFGActorSheet._getSubmitData`: guard `this.actor.overrides ?? {}` —
  `flattenObject(undefined)` throws on `Object.keys(undefined)`, the concrete
  throw candidate (runs for every actor on submit-on-close).
- Debounce reopen latch `6bc6c7f2` kept as a complementary guard.

**Caveat:** if the console still logs `submit-on-close failed; closing anyway`,
the × works but an underlying submit throw remains (edits-on-close won't save) —
capture that error to fix the root. If no such line appears, the `overrides`
guard was the complete fix.

---

_Original handoff notes (kept for context):_

## Symptom
On the **minion** actor sheet, clicking the window header **X** does not close the
sheet. Reported live by the user; still broken after the first fix attempt.

## What was tried (and did NOT fix it)
Commit `6bc6c7f2` (**LOCAL ONLY — not pushed; PR #5 unaffected**) added a
`_sheetClosed` latch in `ActorSheetFFG` to stop a *debounced* render from
re-attaching the sheet after `close()`.
- Hypothesis: `ActorSheetFFG.render` is debounced 100ms ([actor-sheet-ffg.js:2843](modules/actors/actor-sheet-ffg.js:2843));
  a `render:true` queued by a minion field edit fired after `close()` and reopened it.
- **Result: still doesn't close.** So this is almost certainly NOT the cause (or
  not the whole cause). Decide tomorrow whether to **keep or revert `6bc6c7f2`**
  (it's a defensible latent-race guard, but unverified and not the reported bug).

## Revised read
Because a reopen-latch didn't help, the sheet probably **never closes** — i.e.
`close()` aborts before `super.close()`, or the X click never invokes `close()`.
Not a close-then-reopen.

## Prioritized hypotheses + diagnostics for tomorrow
1. **`close()` throws before `super.close()` (TOP SUSPECT).**
   [ffg-document-sheet.js:393-414](modules/apps/ffg-document-sheet.js:393) runs
   submit-on-close `_onSubmit({render:false})` with **no try/catch**. If
   `_onSubmit` / `_getSubmitData` / `document.update` throws for a minion,
   `super.close()` is skipped and the X looks dead.
   - **Stage 4 only ever closed actor sheets with `{submit:false}` (skips this
     path), so submit-on-close was NEVER tested for actors.** High suspicion.
   - **Diagnostic:** open a minion as GM, open the dev console (F12), click X,
     look for an exception. Or temporarily wrap the submit-on-close call in
     `try { ... } catch (e) { console.error("close submit threw", e); }`.
2. **Always vs. only-after-edit?** Open a fresh minion and click X **without
   editing anything**. If it fails even with no edits → points to (1)
   (close-time submit throwing), not anything edit/render related.
3. **Other actor types:** does X close a **character** / **vehicle** sheet?
   - If those close fine and only minion fails → minion-specific submit/data
     (e.g. `_prepareMinionData` / a derived field write rejected by schema).
   - If ALL actor sheets fail to close → it's the generic submit-on-close path
     (1), or a header pointer-capture swallowing the click (cf. the destiny-
     tracker / Sheet-Options pointer-capture bugs fixed earlier this branch).
4. **Is `close()` even entered?** Add a `console.log` at the top of
   `ActorSheetFFG.close` / `FFGDocumentSheet.close`. If it never logs, the X
   action isn't wired to `close()` for this sheet (template/header issue).

## Key files
- `modules/apps/ffg-document-sheet.js:393` — `close()` (submit-on-close, no catch).
- `modules/actors/actor-sheet-ffg.js:2843` — debounced `render` + `_sheetClosed`
  latch (the `6bc6c7f2` attempt) + `close()` override + `_onSubmit` (2860,
  calls `reportValidity()`).
- `modules/actors/actor-sheet-ffg.js:413-423` — minion `render:true`-on-change.
- `modules/actors/actor-ffg.js:314` — `_prepareMinionData` (derived fields).
- `templates/actors/ffg-minion-sheet.html` — disabled (computed) inputs:
  `data.quantity.value`, `data.stats.wounds.max` (disabled ⇒ excluded from submit).

## Repo state
- Branch `V2-compat-elimination`; PR [#5](https://github.com/YeNov/StarWarsFFG/pull/5) → `V2-full`, pushed at `a8d14de2`.
- `6bc6c7f2` (minion-close attempt) is **local, unpushed**.
- First action tomorrow: **console on X-click of a minion** (hypothesis 1/2).
