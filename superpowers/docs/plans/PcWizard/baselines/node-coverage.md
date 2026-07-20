# Node-tier coverage baseline — Stage 1

Plan: `pc_wizard_implementation_plan.md` v10, §2 Stage 1 work items 3–5, §0.6.1.

**Date:** 2026-07-20
**Branch:** `pc-wizard-rewrite`
**Node:** v24.15.0 (`node --version`, executed)
**Shell:** Git Bash

---

## ⚠ Status of this file: MEASURED, but Stage 1 is NOT complete

The previous revision of this file recorded two gates as **BLOCKED** because Node and npm could
not be executed. **That block is cleared** — the owner granted `Bash(npm test)`,
`Bash(npm run check:imports)`, `Bash(node --test *)` and `Bash(node tools/check-imports.mjs *)`.
Every value below is now from a run observed in this session. Nothing is carried forward.

**GATE-NODE passes. GATE-IMPORTS does not**, on one finding that is a **real defect in the tree**,
not a checker bug — see §4. Stage 1 stays open until that is resolved.

---

## 1. GATE-LINT — MEASURED (unchanged from the previous revision)

Command: `npx eslint modules -f json -o .../lint-baseline.json` and
`npx eslint modules -f stylish -o .../lint-totals.txt`.

**Repo-wide (L3 ceiling): 608 problems — 97 errors, 511 warnings.** Matches the plan's recorded
baseline exactly. Measured *after* `modules/package.json` was added, confirming that file is not
linted and L3 is unchanged.

Per-file baselines (L2 reference), all matching the plan's §0.4 table:

| File | Measured | Plan §0.4 says | Match |
|---|---|---|---|
| `modules/actors/actor-ffg.js` | 0 errors, 8 warnings | 0 / 8 | ✔ |
| `modules/helpers/item-helpers.js` | 2 errors, 4 warnings | 2 / 4 | ✔ |
| `modules/helpers/actor-helpers.js` | 1 error, 4 warnings | 1 / 4 | ✔ |
| `modules/helpers/partial-templates.js` | 0 errors, 0 warnings | 0 / 0 | ✔ |
| `modules/swffg-main.js` | 7 errors, 26 warnings | 7 errors (+warnings) | ✔ |
| `modules/helpers/character-creator.js` | 11 errors, 20 warnings | 11 / 20 | ✔ |

Raw JSON per file: `lint-baseline-<file>.json` (six files, committed alongside this one).

**L1 is vacuous at Stage 1.** ESLint is configured over `modules` only; Stage 1's new files are
`modules/package.json` (not JS), `tools/check-imports.mjs` and six files under `tests/node/`,
none of which ESLint sees.

## 2. The import-graph sweep (§0.6.1) — EXECUTED THIS SESSION

Plan work item 3 requires confirming **by execution** which modules import cleanly in Node once
`modules/package.json` exists. Every row below was observed by importing the module in its own
child process. All eight §0.6.1 verdicts are confirmed; none was contradicted.

| Module | Observed | §0.6.1 predicts |
|---|---|---|
| `modules/apps/ffg-form-application.js` | `ReferenceError: foundry is not defined` | POISON ROOT ✔ |
| `modules/popout-modifiers.js` | `ReferenceError: foundry is not defined` | POISONED ✔ |
| `modules/helpers/modifiers.js` | `ReferenceError: foundry is not defined` | POISONED ✔ |
| `modules/helpers/actor-helpers.js` | `ReferenceError: foundry is not defined` | POISONED ✔ |
| `modules/helpers/item-helpers.js` | `ReferenceError: foundry is not defined` | POISONED ✔ |
| `modules/actors/actor-ffg.js` | `ReferenceError: foundry is not defined` | POISONED ✔ |
| `modules/config/ffg-active-effect-modes.js` | imports cleanly | CLEAN ✔ |
| `modules/config/ffg-character-creator.js` | imports cleanly | CLEAN ✔ |

The two poison-chain intermediates (`ffg-form-application.js`, `popout-modifiers.js`) were probed
here for the first time; the owner's own reference measurement covered the other six and agrees
with all six.

**This sweep is no longer a one-off measurement.** It now lives as
`tests/node/import-graph.test.mjs` and runs on every `npm test`. The reason it became a standing
test rather than a recorded number: both halves of the table are load-bearing and can rot
silently in opposite directions.

- If a **poisoned** module ever becomes importable, §0.6.3's residual-risk table is claiming an
  exemption it no longer needs, and coverage decisions were made on a false premise.
- If a **clean** module ever stops importing, the stub loses the source of its real
  `CONFIG.FFG.characterCreator` table and rule 7's named exception stops being sound.

The test also asserts the failure is specifically `ReferenceError: foundry is not defined` — a
poisoned module that starts failing for some *other* reason (a syntax error, a missing file) would
otherwise satisfy a naive "it throws" check while meaning something entirely different.

**Consequence applied:** because `modules/config/ffg-character-creator.js` imports cleanly, the
stub uses the **real** `characterCreator` table rather than a hand-checked fixture, exactly as
§0.6.6 directs. `tests/node/_stub/foundry-stub.mjs` imports it directly, and
`stub-boundary.test.mjs` asserts the real table's shape.

**DEV-11 confirmed:** no `MODULE_TYPELESS_PACKAGE_JSON` warning appears on any import, so
`modules/package.json` is doing its job — the ESM boundary is explicit, not heuristic. This is
asserted by the same test file, so a regression surfaces immediately rather than as warning noise.

## 3. GATE-NODE — PASSES

`npm test` → 58 tests, 58 pass, 0 fail, 0 skipped, 0 todo. Exit 0.
**Isolation mode: DEFAULT (per-file child process).** No `--test-isolation=none`.

Full record, including why the isolation mode matters here: `node-baseline.txt`.

## 4. GATE-IMPORTS — FAILS on one REAL finding

`npm run check:imports` reported **30 findings on its first real run**. **29 were checker bugs**
and are fixed; the rules were re-proved from both directions afterwards
(`tests/node/check-imports-rules.test.mjs`). **1 is a genuine defect in the tree.**

### 4a. The remaining finding — do not baseline this away

```
[rule 2] modules/importer/import-helpers.js:2961
         Foundry-style path "systems/starwarsffg/template.json" does not resolve under the repo root
```

`ImportHelpers.getTemplate(type)` does `await fetch("systems/starwarsffg/template.json")`.
**`template.json` does not exist.** It was deleted deliberately by commit `c8d29d86`, *"DataModel
migration Stage 9: retire template.json (documentTypes cutover)"*.

That commit's message states: *"No runtime code read template.json or game.system.model, so
nothing else changes."* **That claim was incorrect.** This call site reads it, and it is reachable:
`modules/importer/swa-importer.js:573` calls `ImportHelpers.getTemplate("weapon")` when importing
an entity with a `weapons` block. At runtime the fetch 404s and `response.json()` throws, so the
SWA import of any weapon-bearing entity fails.

This is a **pre-existing latent defect**, unrelated to and predating the PC Wizard work. It is
also the gate's first genuine catch, on its first real run.

**It is NOT fixed here, and NOT baselined.** Fixing it means replacing a `template.json` lookup
with a DataModel-derived equivalent inside the legacy importer — outside Stage 1's declared file
set, and unverifiable without a live world (the SWA importer is a user-facing path). Weakening
rule 2 to hide it would blind the rule to exactly the class of dangling-path defect it exists to
catch, in the same document that says *"Keep it strong; do not weaken it to make a stage pass."*
**Owner decision required.** See the Stage 1 report for the options.

`imports-baseline.txt` is therefore **deliberately absent**. The plan requires it to record a
clean run; recording a dirty one would normalise the finding.

### 4b. The 29 false positives — three checker bugs, all fixed

**Bug 1 — the specifier extractor read inside string literals.** (rules 1 and 5; 21 findings.)
`scanSource()` copied string literals into its output verbatim so that "the specifier regexes see
the real text". That let the extractor match `import`-shaped text that was merely string
*content*. Two distinct symptoms:

- **rule 5, 1 finding.** `data-importer.js:75` holds
  `{ type: "submit", icon: "fas fa-file-import", label: "SWFFG.ImportFile" }`. The pattern
  `\bimport\s*(["'])([^"'\n]*)\1` matched the tail of `fa-file-import` plus the following quoted
  region, yielding a "bare specifier" of `", label: "`.
- **rule 1, 20 findings.** Every fixture source held in a string constant in
  `check-imports-purity.test.mjs` / `check-imports-activation.test.mjs` was scanned as if it were
  that test file's own import list. Those fixtures are already written to throwaway temp roots at
  runtime; it was the *inline source text* that leaked.

**Fix:** literals are now emitted with their delimiters intact and their interior replaced by a
filler character (newlines preserved, so offsets and line numbers stay exact), and each literal is
recorded with its start offset. The patterns use the `d` flag; a match is accepted only when its
quoted region is a literal `scanSource` actually recorded, and the specifier reported is that
literal's real value.

This is a fix, not a scope reduction: a specifier inside a string literal genuinely is not an
import. The alternative the owner floated — excluding `tests/node/` from the scan — was **not**
taken, for the reason the owner gave: those files are real source and must stay checked.
`check-imports-rules.test.mjs` pins both halves, including *"a file holding a fixture in a string
STILL has its own real imports checked"* — the case that would catch this fix degrading into
ignoring the file.

**Bug 2 — rule 2 resolved directory prefixes as files.** (8 findings, 7 of them false.)
The repo's sheets build template paths in two halves, e.g. `actor-sheet-ffg.js:59-61`:

```js
const path = "systems/starwarsffg/templates/actors";
return `${path}/ffg-${this.actor.type}-sheet.html`;
```

`templates/actors` exists as a **directory**. **Fix:** in string-literal position, a Foundry-style
path that resolves to an existing directory is accepted. A path resolving to **neither** a file nor
a directory is still a finding — which is why 4a survived the fix, and why a mistyped prefix is
still caught. Import position stays strict: a module specifier must resolve to a file.

**Bug 3 — `stub-boundary.test.mjs` matched its own comment.** (1 test failure, not a checker
finding.) The scan reads every file under `tests/node/`, including itself — deliberately. It
therefore also read its own line 99, a comment reading
`// e.g. Object.assign(globalThis, { Actor: … })`, and reported the file as installing `Actor`.
**Fix:** comments are blanked before scanning. String literals are deliberately **kept**, because
`globalThis["Actor"] = …` is a genuine installation whose forbidden name lives inside a literal.

A comment cannot install a global, so this costs the scan nothing — but "it stopped reporting" and
"it was fixed" look identical from the exit code, so the file now also drives the patterns with
sources that *do* install forbidden globals and asserts each is detected. Those demonstration
sources are **built by interpolation**, never written as literals: a scanned file containing
`globalThis.Actor = …` as test data is itself a violation the scan will and should report. (The
first draft of that very test failed for exactly that reason.) The two negative cases need no
fixtures — this file still contains the offending comment and several
`globalThis.game?.socket === undefined` comparisons, so the scan passing *is* the proof that
neither is mistaken for an installation.

### 4c. Rules re-proved after the fixes

Repairing a rule can silently turn it into "reports nothing", which is indistinguishable from a
pass at the exit code. `tests/node/check-imports-rules.test.mjs` (16 tests) pins each repaired rule
from both sides — the mis-reported case now passes, **and** the defect the rule exists to catch
still fails:

| Rule | Still catches | Now correctly ignores |
|---|---|---|
| 1 | unresolvable relative import; extensionless import; unresolvable import **inside `tests/node/`**; a real broken import in a file that also holds fixtures | specifiers appearing inside string literals |
| 2 | a Foundry path resolving to nothing; a prefix naming a **non-existent** directory; an unresolvable Foundry-style *import* specifier even when a directory exists | a prefix naming an existing directory |
| 5 | a genuine bare specifier in `modules/**` | `import` occurring inside unrelated string content; bare specifiers outside `modules/**` |

Rules 6 and 7 were untouched by these fixes; their existing 23 tests still pass.
