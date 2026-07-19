Verdict: READY

# Targeted v3 audit

## Resolved — v2 New Major — Stages 2/9 use one availability implementation

- `modules/helpers/crit-availability.js` is specified as import-free and exports both required shapes: low-level `availFor(stamp, currentDay)` and higher-level `computeCritAvailability(system, currentDay, vehicleLimit, canSelfHeal)`. `computeCritAvailability()` delegates every Resilience/Medicine/Mechanics calculation to `availFor()`, so null handling, the rewind clamp, and the `currentDay >= stamp + 7` boundary have one implementation.
- The Handlebars wrapper imports `computeCritAvailability` in `swffg-main.js`; Stage 7 imports `availFor` in `codex-sheets.js`; and Stage 9 now explicitly adds `import { availFor } from "./crit-availability.js";` to `gm-bridge.js` and uses exactly `if (!availFor(stamp, day).attemptable) return;`. The prior handwritten GM predicate is gone.
- This remains load-safe. The proposed availability module has no imports or Foundry-global access. The real `gm-bridge.js` currently imports only `minions.js`, and the real `minions.js` imports nothing; neither points back to `swffg-main.js` or `codex-sheets.js`. `swffg-main.js` can therefore import the pure module and register the wrapper in its existing `init` block without creating a new cycle. Settings are registered earlier in that hook at current line 354, while the wrapper reads them only when invoked at render time.
- The bridge dependency is reflected where needed: Stage 2 names the bridge as a consumer and its downstream-import verification checks `from "./crit-availability.js"`; Stage 9's file description, edit, and verification all require the import/use and prohibit a literal `+ 7` predicate in `gm-bridge.js`; and the dependency diagram lists all four consumers, including the bridge.

## Resolved — v2 New Minor — Stage 2-tests proves the suite is registered

- Stage 2-tests now gives the exact repository-style declaration `const _suite = suiteInstance.create(suite, "Crit-Trauma Counter");`, matching the actual `CodexSchemeTests` pattern in `tests/codex-schemes.test.js:8-9`.
- It provides six concrete `addTest(new Test(...))` cases and explicitly wires the named import and invocation into `tests/ffg-tests.js`, matching that harness's real import block at lines 4-13 and suite-call block at lines 41-50.
- The F12 verification command is correct for the real default-exported harness. It filters both `r.pass` and `r.fail` by the exact parent title and requires the exact result `mine.length === 6` and `myFails.length === 0` (reported as `6 0`), so an omitted registration or mismatched title cannot pass as an empty suite.

# Regression scan of the nine previously resolved findings

1. **Retained — fresh-crit rest gate:** Stages 6 and 11 still expect “Self-heal in 7 days” plus available Medicine, then advance seven days before Resilience.
2. **Retained — Resilience ordering:** Stage 7 still validates/builds/constructs `RollFFG` before stamping, catches `toMessage` after reservation, preserves the stamp, and performs no equality rollback.
3. **Retained — local Mechanics gate:** Stage 7 still checks the enabled setting, `criticaldamage` type, and live `availFor()` result before local write or forwarding.
4. **Retained — PowerShell verification:** Stage 1 still avoids unsupported `&&` and uses `$LASTEXITCODE`-safe commands.
5. **Retained — importable registered tests:** the pure module, dedicated suite, harness import/call, and exact console command remain present.
6. **Retained — localization validation:** JSON parsing is not claimed to detect duplicates; per-key count checks remain.
7. **Retained — supported copy test:** Stage 5 still uses `toObject()` plus `createEmbeddedDocuments()` rather than the unsupported crit-drag path.
8. **Retained — bridge security test:** Stage 9 retains the two-client OBSERVER, LIMITED, and cooling-stamp procedure; the implementation still requires OBSERVER and a GM-side live re-check.
9. **Retained — CSS verification:** Stage 10 still checks selector coverage, not byte identity, across default, mandar, and mandarBeskarAstromech.

# New findings

None. The v3 edits introduce no new Blocker or Major. The helper import graph, test-only import graph, numbered stage ordering, and normal system startup remain load-safe.
