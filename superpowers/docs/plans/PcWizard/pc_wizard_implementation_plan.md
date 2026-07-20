# PC Wizard rewrite — Implementation Plan v4

| | |
|---|---|
| **Status** | Draft v4 — supersedes plans v1–v3. Addresses the [round-3 review](pc_wizard_implementation_plan_review_v3.md) (2 Blockers, 1 Minor — all confined to the Cypress gate and one file-count correction). Everything else is carried from v3 **unchanged**. See §7 Review response. |
| **Date** | 2026-07-20 |
| **Authorities** | [Requirements brief v2](../pc_wizard_requirements_brief.md) (BINDING) · [Design doc v7](pc_wizard_design_doc_v7.md) (APPROVED) · [Design review v7](pc_wizard_design_doc_review_v7.md) (READY; 2 Majors folded in — R7-1, R7-2) |
| **Repo** | `D:\SW FFG\Portable FVTT\Data\systems\starwarsffg` — git, remote `YeNov/StarWarsFFG`. `upstream` is read-only. **Never** target `StarWarsFoundryVTT/StarWarsFFG`. |
| **Reference** | Foundry v13 core, read-only: `D:\SW FFG\Portable FVTT\App\resources\app` |
| **Superseded** | Design docs v1–v6 and their reviews (module + `game.system.api` + adapter + supersession) — **CANCELLED** by the 2026-07-20 pivot. Do not consult them. |

---

## 0. How to use this plan

- All paths are **repo-relative** to `D:\SW FFG\Portable FVTT\Data\systems\starwarsffg` unless
  written absolute.
- Stages are ordered so **the system boots and the currently-live wizard keeps working at every
  stage boundary**. The single cutover is **Stage 18**.
- Every stage ends with: its named gates pass → **`git commit`**. **Never `git push`.**
- Verification is split **Static** (no world needed, or the in-browser harness) and **Manual**
  (needs a running Foundry world). Gates are defined **once** in §0.3 and referenced by name.
- Design §11's twelve verification areas map to stages in §4; the issue register maps in §5.

### 0.1 Deviations from design doc v7, recorded up front

| # | Design says | Plan does | Why |
|---|---|---|---|
| DEV-1 | New partials named `*.hbs` (§4 file map) | New partials named `*.html` | The existing wizard template tree is **all `.html`**. AppV2 `PARTS` reference full paths, so the extension is free; matching convention avoids a mixed tree. The only `.hbs` kept is core's `templates/generic/tab-navigation.hbs`. |
| DEV-2 | §5.5.8 `embedId16(seed)` = non-cryptographic fold over a seed containing the index | Injective index encoding (13-char prefix + 3-char base-62 index) | **R7-1**, binding — Stage 6. |
| DEV-3 | §5.9 `startNoticeAck {sessionNoticeId}`; triggers = render/30 s/pre-commit | ACK carries `requesterId`; `userConnected` hook added; pending map cleaned on ACK **and** close | **R7-2**, binding — Stage 14. |
| DEV-4 | §4 file map rewrites `templates/wizards/char_creator/` **in place** | New templates are built at a **separate path, `templates/wizards/pc_wizard/`**; the legacy tree is deleted **atomically at Stage 18** | The live `CharacterCreator.PARTS` names `templates/wizards/char_creator/header.html` and `tabs/*.html` at `modules/helpers/character-creator.js:12-45`. Editing those in place breaks the live wizard for at least one committed stage. A separate path makes Stage 16 purely additive. |
| DEV-5 | Design and earlier plans write `randomID(16)` | **`foundry.utils.randomID(16)`** everywhere | Verified: **zero** bare `randomID(` call sites in `modules/` (grep `[^\w.]randomID\(` → no matches), **22** `foundry.utils.randomID` call sites across 10 files. A bare call is a `ReferenceError`. |
| DEV-6 | §11 says stages verify with lint and "the existing test suite" | Gates are **defined measurably** in §0.3, over a **non-clean** lint baseline and **two** real automated harnesses (in-Foundry mocha **and** Cypress) | "Lint clean" is unreachable (measured: **608 problems — 97 errors, 511 warnings**, nonzero exit), and the wired Cypress suite is real. |
| DEV-7 | — (not a design matter) | Lint on **modified legacy files** is a **baseline-delta** gate, not a zero-findings gate | **Owner decision (round 2).** The legacy files these stages must touch already carry findings — `actor-ffg.js` 8 warnings, `actor-helpers.js` 1 error + 4 warnings, `item-helpers.js` 2 errors + 4 warnings, `swffg-main.js` 7 errors + warnings. Requiring zero would force unrelated cleanup into stages this plan declares behaviour-neutral. The owner **explicitly rejected** folding that cleanup in. §0.3 GATE-LINT. |
| DEV-8 | — (not a design matter) | Cypress runs against a **throwaway self-provisioned local world**, never the owner's campaign world, and is a **non-waivable** gate | **Owner decision (round 2, reaffirmed round 3).** The suite self-provisions (`cypress/support/commands.js:44-90`). §0.3 GATE-CYPRESS carries a **blocking safety precondition**, an **`--env` override** (the only one that works here), and a **fail-closed in-suite assertion**. |
| **DEV-9** | — (not a design matter) | Stage 1 adds a small **fork-local safety guard** to the tracked file `cypress/support/e2e.js` | **Round-3 Blocker 1.** The safety pre-flight checks *localhost*, but nothing stopped the suite from *targeting somewhere else*. A guard that fails closed before any destructive spec runs is the only thing that makes the pre-flight protect the host actually visited. This is a deliberate, reviewable one-hunk edit to a tracked file — **unlike `cypress.env.json`, which must not be touched** (see §0.3). |

### 0.2 The load-bearing ordering constraint (design §4, §11-1)

`modules/helpers/character-creator.js` **must not be deleted**. Exactly two files import that
specifier (grep-verified):

- `modules/swffg-main.js:58` — `import {CharacterCreator} from "./helpers/character-creator.js";`
  (constructed in the `renderActorDirectory` hook at `modules/swffg-main.js:1438-1465`)
- `tests/v2-migration/minimized-close.test.js:12` — same specifier.

Deleting the file breaks ES-module resolution and **the entire system fails to boot**. It survives
Stage 18 as a one-line shim:

```js
export { CharacterCreator } from "../char-creator/pc-wizard.js";
```

Both importers stay **unchanged**. The minimized-close behaviour asserted by
`tests/v2-migration/minimized-close.test.js:17-55` (implemented today at
`modules/helpers/character-creator.js:199-202`) must be **preserved verbatim** in the new
`pc-wizard.js`, or that test fails through the shim.

> **Do not confuse these with unrelated files that legitimately survive:**
> `modules/config/ffg-character-creator.js` (the `CONFIG.FFG.characterCreator` tables, imported by
> `modules/swffg-config.js`) and `modules/helpers/gm-bridge.js` (which mentions
> `character-creator.js` **in a comment** at `:122`). Both are permanent. This is why the Stage 18
> gate searches for the **exact import specifier**, not the substring `character-creator`.

### 0.3 Verification gates (defined once; referenced by name from every stage)

Stage 1 establishes every baseline these gates compare against. **No stage may be committed with a
gate in an unknown state.**

#### Shell spellings — normative, stated once and assumed everywhere

Two shells are available and they are **not** interchangeable for npm-family commands.

| Command | **Git Bash** (verified working — the 97/511 baseline was produced here) | **PowerShell** |
|---|---|---|
| eslint | `npx eslint modules` | `npx.cmd eslint modules` |
| npm script | `npm run lint` | `npm.cmd run lint` |
| Cypress | `npx cypress run --env …` | `npx.cmd cypress run --env …` |
| Playwright | `npx playwright test --list` | `npx.cmd playwright test --list` |

**Under PowerShell, the bare `npm` / `npx` shims (`npm.ps1`, `npx.ps1`) are blocked by execution
policy and fail before the tool starts.** Always use the `.cmd` spelling there. Every command in
this plan is written in the **Git Bash** form; substitute the `.cmd` spelling if running under
PowerShell, and **record which shell was used** with each recorded baseline.

#### GATE-LINT — three parts (owner-decided, DEV-7)

The repository is **not lint-clean** and this plan does not attempt to make it so. Measured
baseline: **608 problems — 97 errors, 511 warnings**; nonzero exit. `eslint` covers **`modules`
only** — `tests/`, `lang/`, `templates/` and `cypress/` are not linted.

- **L1 — new files: zero findings (hard gate).**
  `npx eslint <every file this stage CREATED under modules/>` → **zero errors, zero warnings**.
- **L2 — modified legacy files: no NEW finding identities (hard gate).** For every **pre-existing**
  file a stage modifies, compare against the **per-file baseline** Stage 1 recorded:
  `npx eslint <file> -f json > after.json`, then diff finding identities (rule id + message +
  location, normalised for line shifts) against the baseline. **Introducing a new finding fails the
  gate. Inheriting an existing one does not.** Fixing an inherited one is allowed but never
  required, and lowers that file's baseline going forward.
  > **Do not clean the legacy files as part of this work.** Stages 2, 3, 4 and 18 are declared
  > behaviour-neutral or narrowly scoped; folding unrelated lint cleanup into them would defeat
  > their before/after verification and expand review scope. This was an explicit owner decision.
- **L3 — repo-wide ceiling (secondary guard).** `npx eslint modules -f json > lint-after.json`
  compared against Stage 1's `lint-baseline.json`: totals must not exceed **97 errors / 511
  warnings**.
- A stage that legitimately *reduces* the totals (Stage 18 deletes 1846 lines) records the new
  lower numbers as the reference for later stages.

**Per-file baselines Stage 1 must capture** (the files later stages modify), with the round-2
review's measurements as the expected values:

| File | Modified at | Expected baseline |
|---|---|---|
| `modules/actors/actor-ffg.js` | Stage 2 | 8 warnings, 0 errors |
| `modules/helpers/item-helpers.js` | Stages 3, 9 | 2 errors, 4 warnings |
| `modules/helpers/actor-helpers.js` | Stage 4 | 1 error, 4 warnings |
| `modules/helpers/partial-templates.js` | Stages 16, 18 | capture (not measured yet) |
| `modules/swffg-main.js` | Stage 18 | 7 errors + numerous warnings |
| `modules/helpers/character-creator.js` | Stage 18 (reduced to a shim) | capture; expect it to **drop** |

If the measured numbers differ from the table, **record the actual ones** — they become the
reference.

#### GATE-MOCHA — the in-Foundry unit harness

`tests/ffg-tests.js` is a **browser-only** harness: it imports `../node_modules/mocha/mocha.js` and
`../node_modules/chai/chai.js` and extends V1 `FormApplication`. There is **no `test` script** in
`package.json` and **no Node runner**.

**Critical:** importing the module **does not run anything**. Mocha is constructed and run inside
`FFGFunctionalTests.getData()` (`tests/ffg-tests.js:31-102`), which executes only on **render** —
as the existing macro does at `modules/swffg-main.js:1839-1842`.

**Invocation** — world open, **as GM**, after a **hard reload** (modules are cached; a soft reload
silently tests the *old* code), in the F12 console:

```js
const mod = await import(`/systems/starwarsffg/tests/ffg-tests.js?v=${Date.now()}`);
const tester = new mod.default();
tester.render(true);
```

The `?v=` query string is the cache-buster; **without it you can test a stale module even after a
reload**. Results arrive as the **mocha JSON reporter blob** rendered by the app. Read failures from
that JSON — **`Error` properties are non-enumerable**, so inspecting failure objects directly shows
nothing useful.

- **Pass condition:** pass count ≥ the Stage 1 baseline pass count **plus** the tests this stage
  added, **and** the failure set is **identical to the recorded baseline failure set** — no new
  failure identities. Pre-existing failures are the baseline, not regressions.

#### GATE-CYPRESS — the wired end-to-end regression suite (DEV-8) — **MANDATORY, NON-WAIVABLE**

`cypress.config.js` exists and `cypress/e2e/` contains **three wired specs**: `00_init.cy.js`,
`01_create_entities.cy.js`, `02_test_items.cy.js`. This is the plan's principal live-system
regression check for collateral breakage outside the wizard.

**This gate cannot be waived, substituted, or marked not-applicable anywhere in this plan.** The
owner decided it is mandatory and explicitly rejected waiving it. There is **no** owner-approval
bypass embedded here: if a future situation genuinely warrants dropping it, that requires a **fresh
owner decision taken at that moment**, not a path pre-authorised in this document.

> ## ⚠ BLOCKING SAFETY PRECONDITION — read before every Cypress run
>
> **The local Foundry must be sitting at the setup screen with NO world active.**
>
> `setup()` (`cypress/support/commands.js:44-90`) begins with `cy.visit("/")` and **returns early
> unless the URL is `/setup`**. If a world is already active, setup is skipped and `join()`
> (`:137-146`) proceeds to `/join` and logs in as `Gamemaster` **on whatever world is currently
> active**. `01_create_entities.cy.js` and `02_test_items.cy.js` would then create actors and items
> **inside the owner's live campaign world**.
>
> **Pre-flight, every run:** open the Foundry base URL in a browser and confirm it lands on
> `/setup` (no world active). If a world is running, use *Return to Setup* / shut it down first.
> **A Cypress run is not permitted until this check passes.** Record the check in the stage notes.
>
> **After a run the throwaway world is left active** — return Foundry to setup before the next run.

**The suite self-provisions — do not plan a fixture world.** Verified in
`cypress/support/commands.js`: `acceptsLicense()` (`:5-14`) accepts the EULA;
`authenticatesAsAdmin()` (`:19-27`) types the admin key **`test-admin-key`**; `setup()` (`:44-90`)
installs the `starwarsffg` system if absent, **creates a world titled "Integration Test World"
(package id `integration-test-world`) if absent, and launches it**; `join()` (`:137-146`) logs in as
user **`Gamemaster`** with no password.

- **Foundry admin access key must be `test-admin-key`, or unset.** Any other key makes
  `authenticatesAsAdmin()` fail at `:25`.

##### The invocation — `--env`, and **only** `--env`

**`--config baseUrl=…` does not work in this repository, and neither does `CYPRESS_BASE_URL`.**
`cypress.config.js:9-13` is:

```js
setupNodeEvents(on, config) {
    if (config.hasOwnProperty("env") && config.env.hasOwnProperty("baseUrl")) {
        config.baseUrl = config.env.baseUrl;
    }
    return config;
}
```

Cypress resolves configuration **first** (including any `--config baseUrl=…` or
`CYPRESS_BASE_URL`), **then** calls `setupNodeEvents`, which **unconditionally** overwrites
`config.baseUrl` from `config.env.baseUrl`. The tracked `cypress.env.json:2` supplies
`"baseUrl": "http://chimaera:10101"` — upstream maintainer infrastructure. Both config-level
overrides are therefore **silently defeated** and the suite targets chimaera.

**Override the env key the hook actually reads:**

```bash
npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
```
```powershell
npx.cmd cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
```

The CLI `--env` value overrides the same `config.env.baseUrl` key loaded from `cypress.env.json`;
the hook then copies the local URL into `config.baseUrl`. **The owner's Foundry listens on
`localhost:30000`.**

- **Do NOT edit `cypress.env.json`.** It is a **tracked** file (`git ls-files` confirms). Editing it
  dirties the tracked tree, invites an upstream conflict, and would silently redirect *anyone's*
  run. Override at invocation instead.

##### The fail-closed guard (DEV-9) — added at Stage 1, before any Cypress run

The safety pre-flight above checks that *localhost* is at `/setup`; it cannot check *what host the
suite visits*. A guard closes that gap. Stage 1 adds this to `cypress/support/e2e.js` (the support
file Cypress loads before every spec, so a root-level `before()` runs ahead of each spec's own
`before`/`beforeEach` — i.e. **before `cy.setup()`, `cy.join()`, or either entity-creation spec**):

```js
// FORK-LOCAL SAFETY GUARD — PC Wizard implementation plan v4, Stage 1.
// Fails closed if the resolved baseUrl is not the expected local throwaway host,
// so a mis-set override can never point the destructive specs at a live world.
before(() => {
  const expected = Cypress.env("expectBaseUrl");
  const actual = Cypress.config("baseUrl");
  if (!expected) {
    throw new Error("Refusing to run: --env expectBaseUrl=<url> is required (see plan §0.3).");
  }
  if (actual !== expected) {
    throw new Error(`Refusing to run: resolved baseUrl is ${actual}, expected ${expected}.`);
  }
});
```

**It fails closed in both directions:** omitting `expectBaseUrl` aborts, and a mismatch aborts. The
run stops rather than proceeding. This is a deliberate fork-local edit to a tracked file — recorded
as DEV-9 and flagged to the owner at Stage 22.

##### Pass condition and status vocabulary

- **Pass condition:** an **actually executed** Cypress run whose result set is **identical to the
  Stage 1 pre-change baseline**. A spec that was already failing on the untouched tree is baseline,
  **not** a regression — record it and **do not attempt to fix it** as part of this work.
- **`BLOCKED-BY-ENVIRONMENT` is a diagnostic status that HALTS PROGRESS. It is never a pass.** If
  the suite cannot run (Foundry down, wrong admin key, missing browser dependency, a world active
  that cannot be closed), work **stops at that stage** until the environment is repaired. It is not
  a recorded outcome that later stages may inherit and continue past.
- There is **no `NOT-APPLICABLE` status**, **no owner-approval bypass**, and **no manual-check
  substitution** for this gate anywhere in this plan.
- Every cadence entry below requires a **real executed result** — most especially the two runs
  bracketing Stage 18.

**Cadence — when the gate runs:**

| Stage | Why |
|---|---|
| **1** | Pre-change baseline on the untouched tree — the reference for every later run. **Stage 2 may not begin without it.** |
| **2** | `01_create_entities.cy.js` exercises actor creation, exactly what this stage refactors. |
| **3** | `02_test_items.cy.js` exercises items/effects, the surface `reconcileTreeEffects` moves. |
| **18 — before edits** | Re-confirm the tree is still at baseline immediately before the cutover, so any post-cutover failure is attributable to the cutover alone. |
| **18 — after edits** | The cutover deletes a socket block, a template tree and 1846 lines; this is where collateral breakage outside the wizard would surface. |
| **21** | After the fixes arising from the smoke stages. |
| **22** | Final. |

Stages 5–17 and 19–20 **do not** run it: they add unimported files or touch only wizard-internal
code already covered by GATE-MOCHA and the manual gates. Any stage may run it voluntarily.

#### GATE-PLAYWRIGHT — configured, out of scope, not a gate

`playwright.config.js` exists with `testDir: './e2e'`, and `e2e/activeEffects.spec.js` contains
**real `test()` blocks (16 of them)**. It is nonetheless **not runnable here and is out of scope**,
for a concrete reason: it hard-codes the remote host `http://overlord.wrycu.com:12121/game/` in its
`beforeEach`, and depends on `storageState: 'state.json'` plus `globalSetup: ./playwright/setup.ts`.
Repointing it would require world fixtures that do not exist in this repo. Stage 1 records the
actual `npx playwright test --list` output and marks it **configured-but-not-runnable, out of
scope**, with that reasoning.

#### GATE-BOOT — the system loads

World loads; **every import specifier resolves**; hooks register; console shows **no new errors or
warnings** versus the Stage 1 recorded console baseline.

#### GATE-LIVE-WIZARD — the old wizard still works (Stages 2–17 only)

Until the Stage 18 cutover, the existing `#ffgCharacterWizard` button must still open the **old**
creator and it must still function. Any stage that cannot satisfy this has mis-ordered work.

### 0.4 Coexistence with the existing GM bridge

`modules/helpers/gm-bridge.js` **already owns a listener** on the same socket channel the wizard
uses: `const FFG_SOCKET = "system.starwarsffg"` (`:21`), registered by `registerGMBridge()`
(`:119-125`), called from `modules/swffg-main.js:1577`. Its handler **returns immediately unless
`game.user.id === game.users.activeGM?.id`** (`:126`) and dispatches on `data?.event` with the names
`ffgApplyToTarget`, `ffgUpdateMessage`, `ffgCritRecovery`.

Consequences the implementer must honour (Stage 15):

- The wizard registers its **own** `game.socket.on` listener; it does **not** extend
  `registerGMBridge`. Both listeners see all channel traffic.
- The wizard listener **must filter on `data?.eventType === "pcWizard"` first** so gm-bridge traffic
  is ignored, and its event names (`commitRequest`, `commitResponse`, `startNotice`,
  `startNoticeAck`) **must not collide** with gm-bridge's three. Verified: they do not.
- `gm-bridge.js` is also the **in-repo precedent** for the trusted-sender contract this plan relies
  on — its comment at `:120-124` records that Foundry appends the authenticated sender id as the
  socket callback's second argument. Follow that pattern; do not invent a second one.

---

## 1. Binding additions folded in from design review v7

Design doc v7's text does **not** reflect these; this plan is their normative home. **Both were
confirmed correctly discharged by the plan reviews — carried into v4 unchanged.**

### R7-1 — Embedded id injectivity (Stage 6)

Design §5.5.8 folds an index-bearing seed through a non-cryptographic hash and then asserts distinct
indices yield distinct ids. That implication is **false** for a non-injective hash, and the failure
mode is real: `common/abstract/embedded-collection.mjs:146-158` looks a supplied `_id` up first and
**reuses the already-indexed document**, so a collision silently collapses a duplicate purchase in
preview and can be rejected server-side at commit — while brief §6 explicitly requires duplicate
purchases to receive distinct ids.

**Required:** make the index portion **injective**. Item ids = a deterministic 13-character prefix
derived from `{commitId}` plus a fixed-width **3-character base-62 index suffix**; effect ids = a
13-character prefix derived from `{commitId, i}` plus a 3-character base-62 `j` suffix. Reject
indices outside `62³ = 238328` with a named error. Item ids unique **within the Actor**; effect ids
unique **within each Item**. `assignWizardIdentity` stays the single shared caller and **asserts
every sibling id is valid (`/^[a-zA-Z0-9]{16}$/`) and unique before the Actor is constructed**. A
**forced-collision test** is mandatory, with a real test seam (Stage 6).

### R7-2 — D9 start-ACK binding and GM-connect trigger (Stage 14)

Design §5.9's ACK carries only `{sessionNoticeId}`. The channel is a **broadcast** and the design
authenticates via the socket layer's trailing sender argument, so another player can replay an
observed session id and cause a real GM to broadcast a valid GM-signed ACK **for the attacker's
key**; the honest client, matching only `sessionNoticeId` + "sender is a GM", marks its start
delivered though no GM record exists for it. Separately, the specified triggers (first render, later
render after 30 s, pre-commit) mean **nothing fires when a GM merely connects**, making design
§11-7's assertion untestable.

**Required:** (1) the active GM derives the requester from the socket sender and broadcasts
`startNoticeAck {requesterId, sessionNoticeId}`; (2) a client accepts it **only when**
`requesterId === game.user.id` **and** the session id is pending **and** the socket sender is a GM;
(3) register **one ready-time `userConnected` hook** (declared `client/hooks.mjs:1122`, fired from
`client/documents/collections/users.mjs:103-129`) to flush pending notices when an active GM
appears, **retaining the unconditional pre-commit emission**; (4) remove the pending-map entry on
**ACK** and on **wizard close**; (5) add the cross-GM **start** duplication case to the accepted
residuals; (6) tests for two concurrent players, no-GM open followed by GM connection **without an
intervening render**, close-while-pending cleanup, and lost-ACK GM failover.

---

## 2. Stages

### Stage 1 — Baseline: branch, safety guard, and pin **every** harness before anything else

**Design §11-1 · brief §8.**

**Files modified:**
- `cypress/support/e2e.js` — add the **fail-closed safety guard** (DEV-9, §0.3). This is the only
  repo change in this stage and it must land **before the first Cypress run**.

**Baselines** are written to the scratchpad
(`C:\Users\novak\AppData\Local\Temp\claude\...\scratchpad\`), **not** into the repo:
`lint-baseline.json`, `lint-baseline-<file>.json` (per-file), `mocha-baseline.json`,
`cypress-baseline.txt`, `console-baseline.txt`.

**Work:**
1. `git config --local core.autocrlf false` if not already set (known CRLF vs `.gitattributes`
   conflict here), then `git checkout -b feature/pc-wizard-rewrite`.
2. **Lint baselines.** Record the shell used (§0.3). Repo-wide:
   `npx eslint modules -f json > <scratch>/lint-baseline.json`. **Expected: 608 problems — 97
   errors, 511 warnings, nonzero exit.** Then capture a **per-file baseline for each file later
   stages modify**, per the GATE-LINT table. If measured numbers differ, record the actual ones.
3. **Mocha baseline.** Run GATE-MOCHA exactly (hard reload, cache-busted import, **construct and
   render**). Record the total pass count **and the identity of every failing test**. Expect roughly
   ~47 pass / ~2 fail (long-standing stale Modifier tests). **Every pre-existing failure is
   baseline, not a regression.**
4. **Add the Cypress fail-closed guard** to `cypress/support/e2e.js` (§0.3, DEV-9) — **before**
   running Cypress for the first time.
5. **Cypress pre-change baseline — MANDATORY; Stage 2 may not begin without it.**
   Satisfy the §0.3 **blocking safety precondition** first (confirm the local Foundry is at `/setup`
   with **no world active**), confirm the Foundry admin key is `test-admin-key` or unset, then:
   ```bash
   npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
   ```
   Record which of the three specs pass **on the untouched tree**, and confirm from the run output
   that the guard accepted the resolved `baseUrl` (a mis-set override aborts the run by design).
   **Do not edit `cypress.env.json`.**
   - **If the suite cannot run:** the status is `BLOCKED-BY-ENVIRONMENT`, which **halts the plan
     here**. Repair the environment and re-run. It is **not** a recordable outcome that later stages
     may proceed past, and there is no substitute.
   - **A red baseline is a legitimate outcome that needs an owner decision, not a plan failure.**
     These three specs were written by the upstream project and have **never been run against this
     fork**; some or all may fail on the untouched tree for reasons entirely unrelated to this work.
     If that happens: **record the exact failures, stop, and put the choice to the owner before
     Stage 2** — proceed with the red baseline as the comparison reference (regressions are then
     "new failures relative to that set"), or repair the specs first as separately scoped work. Do
     **not** silently adopt a red baseline, and do **not** discover this at the Stage 18 cutover.
6. **Playwright inventory.** `npx playwright test --list`. Record the output and mark
   **configured-but-not-runnable, out of scope**, with the hard-coded-remote-host reasoning (§0.3).
7. **Console baseline.** Load the world; record every existing console error/warning. Stages 18 and
   21 compare against this list.
8. **Owner decisions required before Stage 13** — the **draft-size thresholds**. Proposed defaults,
   to be confirmed or amended, stated in **binary KiB** and measured in **UTF-8 bytes** (Stage 13):
   **serialized draft ≤ 64 KiB (65 536 bytes)** **and** median `setFlag` round-trip **≤ 150 ms over
   10 samples**. Exceeding **either** triggers the uuid-only fallback. Record the agreed numbers.
9. If the mocha harness cannot be made to run, **stop and report to the owner** before Stage 2.

**Verification (Static):** lint, mocha, console and Playwright baselines captured; the mocha
invocation demonstrably produced a JSON result (not merely a resolved import). **GATE-CYPRESS: a
real result set is captured — otherwise stop.** No later stage may begin against an absent Cypress
baseline.
**Verification (Manual):** GATE-BOOT recorded; GATE-LIVE-WIZARD confirmed (the old wizard opens and
works — the "before" reference for every later stage).
**Commit:** `test(cypress): fail-closed baseUrl guard before destructive specs` (the guard only —
the baselines live in the scratchpad, not the repo).

---

### Stage 2 — Extract `getActorCreationDefaults(type)` and `applyCharacteristicDeltas` (design §5.10.2/§5.10.3)

Behaviour-neutral refactor of live system code. Nothing consumes the new exports yet.

**Files modified:** `modules/actors/actor-ffg.js` *(legacy — GATE-LINT L2 applies, baseline 8
warnings; **do not clean them**)*

**Work:**
1. Extract the per-type `prototypeToken` blocks inlined in `static create`
   (`modules/actors/actor-ffg.js:38`+, including the rival `RivalTokenPrepend` setting read) and the
   default-image map inlined in `_preCreate` (`:111`+) into one exported
   `getActorCreationDefaults(type)` returning **fresh clones** of
   `{img, prototypeToken /* partial — NO name, NO texture.src */, system /* type defaults */}`.
   - The `system` member may come from a throwaway `new Actor.implementation({type, name})` whose
     `prototypeToken`/`name`/`img` are **discarded** — a bare constructor runs neither `create` nor
     `_preCreate`, so token and image **must** come from the factory tables.
   - `prototypeToken` deliberately omits `name`/`texture.src`: core `_initializeSource`
     (`common/documents/actor.mjs:93-97`) fills both from the actor's own final name/img.
2. Rewrite `create` and `_preCreate` to **consume** the factory, preserving `create`'s
   **only-when-`data.system`-is-absent** condition and `_preCreate`'s conditional image exactly.
3. Add exported pure `applyCharacteristicDeltas(systemSource, deltas)` **next to `_preUpdate`**,
   cross-commented both ways: each `+N` adds N to the characteristic; **Brawn** additionally adds N
   to `stats.wounds.max`, `stats.soak.value`, `stats.encumbrance.max`; **Willpower** adds N to
   `stats.strain.max`. The `_preUpdate` mirror-writes into `stats.Brawn`/`stats.Willpower` are
   **deliberately not reproduced** (keys outside the character template; inertness re-confirmed at
   Stage 19) — say so in a comment. **`_preUpdate` itself is retained unchanged.**

**Verification (Static):** GATE-LINT (L2 on `actor-ffg.js` — no new findings; L3); GATE-MOCHA;
**GATE-CYPRESS** — mandatory here (`cypress/e2e/01_create_entities.cy.js` exercises exactly the
actor-creation path this stage refactors), compared against the Stage 1 baseline:
```bash
npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
```
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD. Create one actor of **each** type
(character, minion, rival, nemesis, vehicle) — prototype token settings (`actorLink`, disposition,
bar1/bar2) and default images **identical to pre-change**; the rival `RivalTokenPrepend` setting
still affects the rival token name. Edit an existing character's Brawn and Willpower —
wounds/soak/encumbrance/strain adjust exactly as before.
**Commit:** `refactor(actor): extract getActorCreationDefaults + applyCharacteristicDeltas`

---

### Stage 3 — Extract the pure `reconcileTreeEffects` core (design §5.10.1)

**Files modified:** `modules/helpers/item-helpers.js` *(legacy — L2, baseline 2 errors + 4
warnings; do not clean)*

**Work:** extract the algorithm from `ItemHelpers.syncTreeActiveEffects`
(`modules/helpers/item-helpers.js:284`+) into an exported **pure**
`reconcileTreeEffects(effectSources, tree, nodeLabel, fallbackImg)` operating on plain source arrays
and returning patches; `syncTreeActiveEffects` becomes a **thin document-applying wrapper**.
Algorithm preserved exactly:

- skip attributes whose `buildActiveEffectChanges` (`:361`) result is empty;
- claim an unclaimed **exact flag tuple** first, else **one unclaimed same-name** effect
  (legacy/imported effects are adopted, not duplicated);
- patch **only** `changes` / `disabled` (= `!islearned`) / tree-`flags` **in place**, preserving
  every other field;
- append an **id-less** effect only when unmatched;
- **never delete** unclaimed effects.

`ItemHelpers.syncAEStatus`'s dispatch (`:240-247`) is untouched.

**Verification (Static):** GATE-LINT (L2, L3); GATE-MOCHA (`tests/talent-tree.test.js` in
particular); **GATE-CYPRESS** — `02_test_items.cy.js` covers the item/effect surface this stage
moves; same `--env` invocation as Stage 2.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD. On a character sheet, purchase a talent in a
specialization tree and an upgrade in a Force power — the resulting ActiveEffects are **identical**
(name, changes, priority, disabled, flags) to pre-change; purchasing a node on a **legacy/imported**
spec with an unflagged same-name effect **adopts, not duplicates**; nothing is deleted.
**Commit:** `refactor(items): extract pure reconcileTreeEffects core from syncTreeActiveEffects`

---

### Stage 4 — Extract the pure XP-log entry builders, with the field mapping stated (design §5.10.4)

**The field mapping is normative, because the real helper's `action` parameter does NOT become the
entry's `action`.**

**Files modified:** `modules/helpers/actor-helpers.js` *(legacy — L2, baseline 1 error + 4
warnings; do not clean)*

**Verified current behaviour** (`modules/helpers/actor-helpers.js:211-231`, `:258-279`):

```js
// xpLogSpend(actor, action, cost, available, total, statusId) writes:
{ action: 'purchased',            // ← CONSTANT LITERAL, never the parameter
  id: statusId,
  xp: { cost, available, total },
  date,                            // new Date().toISOString().slice(0,10)
  description: action }            // ← the `action` PARAMETER lands HERE

// xpLogEarn(actor, grant, available, total, note, granter, statusId) writes:
{ action: granter === "GM" ? "granted" : "adjusted",
  id: statusId,
  xp: { cost: grant, ... },        // ← NOTE: the GRANT is stored under xp.cost
  date,
  description: note }
```

**Required builder signatures (note the renamed spend input):**

```js
// `description`, NOT `action` — the entry's action is a constant.
buildXpSpendEntry({ description, cost, available, total, statusId, date })
  → { action: "purchased", id: statusId, xp: {cost, available, total}, date, description }

buildXpEarnEntry({ grant, available, total, note, statusId, date, granter = "GM" })
  → { action: granter === "GM" ? "granted" : "adjusted",
      id: statusId, xp: {cost: grant, available, total}, date, description: note }
```

- `xpLogEarn`/`xpLogSpend` **delegate** to these; `date` defaults to today **inside the persisting
  helpers** and is an **explicit parameter** on the builders (the wizard supplies a frozen date).
- `xpLogSpend` keeps calling `notifyXpSpend` (`:226`, `:235`) unconditionally — the wizard avoids the
  whisper by **never calling the persisting helper at all** (Stage 15), not by changing this.
- **D10:** the `flags.starwarsffg.xpLog` **array shape is not changed** and no migration is
  performed, in this or any later stage.

**Tests** (new `tests/char-creator/xp-entries.test.js`, registered in `tests/ffg-tests.js`):
1. `buildXpSpendEntry` output has `action === "purchased"` **always**, with the supplied
   `description` in `description`.
2. **Delegated live helper:** `xpLogSpend(actor, "some purchase", …)` produces `action ===
   "purchased"` and `description === "some purchase"` — shape-identical to pre-change.
3. `buildXpEarnEntry` maps `grant` → `xp.cost`; `granter: "GM"` → `"granted"`, non-GM →
   `"adjusted"`.
4. (Re-checked at Stage 15 on the **baked** wizard entry, and at Stage 21 on the real actor.)

**Verification (Static):** GATE-LINT (L2, L3); GATE-MOCHA including the four assertions.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD. Grant and spend XP on a character sheet —
`flags.starwarsffg.xpLog` entries are shape-identical to pre-change (console-inspected); the
XP-spend whisper still fires when `notifyOnXpSpend` is on.
**Commit:** `refactor(actor-helpers): extract pure XP entry builders with explicit field mapping`

---

### Stage 5 — New wizard package scaffold: constants, enrich, calculators, i18n keys

First stage creating `modules/char-creator/`. **Nothing in the system imports it** — it is reachable
only from the test harness, so boot and the live wizard are unaffected.

**Files created:**
- `modules/char-creator/constants.js` — socket channel/event names (`system.starwarsffg`,
  `eventType: "pcWizard"`, events `commitRequest`, `commitResponse`, `startNotice`,
  `startNoticeAck` — **verified non-colliding with gm-bridge's `ffgApplyToTarget` /
  `ffgUpdateMessage` / `ffgCritRecovery`**, §0.4), flag keys `pcWizardDraft`,
  `pcWizardSourceSelection`, `pcWizardCommit`, `DRAFT_SCHEMA_VERSION = 1`, commit timeout (~15 s),
  D9 re-emission spacing (30 s).
- `modules/char-creator/enrich.js` — `enrichDescription(html)` via
  `foundry.applications.ux.TextEditor.implementation.enrichHTML` (the namespaced call the current
  creator already uses at `character-creator.js:677`) and `stripHtml(html)` via `DOMParser` →
  `textContent` (**BUG-4**).
- `modules/char-creator/calculators.js` — pure `calcXp`, `calcCredits`, `calcObligation`, ported from
  `modules/helpers/character-creator.js` (`calcXp :1529-1552`, `calcCredits :1633-1645`,
  `calcObligation :1554-1600`). **`calcObligation` must read its adjustment from the Stage 7
  starting-bonus table, not re-derive it** — leave a marked seam, wired at Stage 7 (KEEP-4).
- `tests/char-creator/calculators.test.js`

**Files modified:**
- `tests/ffg-tests.js` — register the new suite (and each later new suite). *(Not linted.)*
- `lang/en.json` — add **all** new flat keys in one pass alongside the existing
  `SWFFG.CharacterCreator.*` block (starts at `lang/en.json:962`; 142 existing keys): the D9
  `SWFFG.CharacterCreator.Notify.*` set from design §5.9 (`StartedGM`, `FinishedGM`,
  `FinishedPlayer`, `SubmitPending`, `SubmitUnconfirmed`, `SubmitRetry`, `SubmitFailed`,
  `LogWarning`, `NoGm`, `StrayCommit`, `CollisionError`), draft-UX keys, gear-filter keys, and
  Sources-panel keys. **No existing key is renamed or removed.** *(Not linted.)*

**`foundry.utils.randomID` note (DEV-5):** every id minted anywhere in this package uses
`foundry.utils.randomID(16)`. A module may destructure **once** at top:
`const { randomID } = foundry.utils;`. **A bare global `randomID` does not exist here.**

**Verification (Static):** GATE-LINT (**L1** — the three new files must be zero-findings; L3);
GATE-MOCHA (new suite green; failure set unchanged); `lang/en.json` parses as valid JSON.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): scaffold package — constants, enrich, calculators, i18n keys`

---

### Stage 6 — `build-item-schema.js`: canonical projection + **R7-1** wizard-identity layer

**The R7-1 stage. Highest-risk correctness surface.**

**Files created:** `modules/char-creator/build-item-schema.js`,
`tests/char-creator/build-item-schema.test.js`
**Files modified:** `tests/ffg-tests.js`

**Part A — `projectItemSource(raw)` (design §5.5.7):** deterministic, idempotent, pure.
- **Item keys kept:** `name`; `type` (∈ `system.json` `documentTypes.Item`); `img`; `system` (deep
  clone); `effects` (each via the effect projection); `flags` → **only the `starwarsffg` scope**,
  deep-cloned (load-bearing: `flags.starwarsffg.config.enableAmmo` gates rolls/display;
  `…config.medicalType` selects healing behaviour).
- **Item keys stripped:** `_id`, `folder`, `sort`, `ownership`, `_stats`, unknown keys,
  non-`starwarsffg` flag scopes.
- **Effect keys kept:** `name`, `img`, `type`, `system`, `changes[]` as `{key, value, mode,
  priority}` (**`priority` preserved** — preparation sorts by `priority ?? mode*10`), `disabled`,
  `duration`, `statuses`, `transfer`, `description`, `tint`, `sort`, `flags.starwarsffg`, and
  `flags.core` restricted to the allowlist `{overlay}`.
- **Effect keys stripped:** `_id`, `origin`, `_stats`, all other `flags.core` keys, unknown keys.
- **Third-party flag scopes are dropped — a recorded product limitation** (Stage 22 docs).
- A `null` projection is a legal return that callers handle with a warning.

**Part B — the identity layer (design §5.5.8 as amended by R7-1):**

```js
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_INDEX = 62 ** 3;            // 238328 — the documented supported range

export function b62_3(n) {            // fixed-width, injective over [0, MAX_INDEX)
  if (!Number.isInteger(n) || n < 0 || n >= MAX_INDEX) throw new WizardIdRangeError(n);
  return B62[(n / 3844) | 0] + B62[((n / 62) | 0) % 62] + B62[n % 62];
}

export function prefix13(seed) { /* deterministic synchronous fold → 13 chars of B62 */ }
export function embedId16(seed, index) { return prefix13(seed) + b62_3(index); }
```

> **Test seam.** `prefix13`, `b62_3` and `embedId16` are **exported** — native ES-module bindings
> cannot be monkey-patched from the browser harness, so a module-private `prefix13` would make the
> mandated forced-collision test unwritable. The forced-collision proof is additionally formulated
> to need **no stubbing at all**: **one identical seed with many distinct indices**, which holds the
> prefix constant *by construction* — exactly the adversarial case, and the real code path.

`assignWizardIdentity(actorData, {userId, commitId})` — the **single shared caller**, used by
**both** `applyBuild` (before every preview construction) and `normalizeCommitSource` (which
reapplies it and defines **no second formula**):

- `actorData._id = await deriveCommitActorId(userId, commitId)` — SHA-256 over
  `"swffg-pcwizard|commit|v1|" + userId + "|" + commitId`, mapped base-62 onto 16 characters,
  **cached per `{userId, commitId}`**. The cryptographic digest is required because this id is a
  **world collection key**.
- `item._id = embedId16(\`item|${commitId}\`, i)` — **all items share one prefix**, so distinct `i` ⇒
  distinct id, unconditionally.
- `fx._id = embedId16(\`fx|${commitId}|${i}\`, j)` — **all effects of one item share one prefix**, so
  distinct `j` ⇒ distinct id within that Item (the actual uniqueness domain).
- **Assertion before return (mandatory):** every item id matches `/^[a-zA-Z0-9]{16}$/` and item ids
  are unique as a set; per item, every effect id matches the shape and is unique within that item.
  Violation throws `WizardIdIntegrityError` — the Actor is **never constructed** with invalid or
  duplicate sibling ids.
- Ordering is normative: **projection strips SOURCE identity → this layer adds WIZARD identity.**

**Tests — all mandatory:**
1. Projection keeps/strips every enumerated key (fixture with `enableAmmo`, `medicalType`, a
   third-party flag scope, `_stats`, `ownership`).
2. Projection is **idempotent**: `project(project(x))` deep-equals `project(x)`.
3. `changes[].priority` survives; `flags.core.overlay` survives; `flags.core.sourceId` and `origin`
   do not.
4. **Forced-collision test (R7-1, no stubbing):** one identical seed, N distinct indices → **N
   distinct ids**.
5. **Prefix determinism:** `prefix13(s)` is stable across calls and is 13 chars of `B62`.
6. Index range: `b62_3(238328)` throws `WizardIdRangeError`; `b62_3(238327)` succeeds.
7. Integrity assertion: inject a duplicate id before the assertion → `WizardIdIntegrityError`.
8. Determinism: two `assignWizardIdentity` runs over the same `{userId, commitId}` + same projected
   arrays give **identical** ids; changing `commitId` changes **all** of them together.
9. Every produced id matches `/^[a-zA-Z0-9]{16}$/`.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA (all nine).
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): canonical item projection + injective wizard identity (R7-1)`

---

### Stage 7 — `wizard-state.js` + `starting-bonus.js` (BUG-2, KEEP-4)

**Files created:**
- `modules/char-creator/wizard-state.js` — `createInitialData()` seeding `identity`
  (`name: \`${game.user.name}'s new PC!\``, `img: null`), **`commitId: foundry.utils.randomID(16)`**
  (DEV-5), `grants.gm.credits` and `initial.*` from the `defaultCredits` / `defaultDuty` /
  `defaultObligation` / `defaultMorality` world settings, `selected.rules = "fad"`, and
  `spendingCredits` (d100, rolled **once at draft creation**), plus the plain mutators. **No live
  Documents anywhere, ever** — the `SelectionRef` shape `{uuid, name, type, img, snapshot}` is
  defined here.
- `modules/char-creator/starting-bonus.js` — `STARTING_BONUS[rules][choice] = {xp, credits, morality,
  dutyDelta, obligationDelta}`, transcribed **exactly** from `selectStartingBonus`
  (`modules/helpers/character-creator.js:865-908`) and the `calcObligation` branches.
- `tests/char-creator/starting-bonus.test.js`

**Files modified:** `modules/char-creator/calculators.js` (`calcObligation` now reads the adjustment
**from the table**, closing the KEEP-4 coupling defect); `tests/ffg-tests.js`.

**Preserved quirk (design §10-3, Q-2):** `2k_credits` grants **2500**
(`character-creator.js:884,:902`). **Port verbatim** — an open owner decision, flagged at Stage 22.

**Tests:** every `rules × choice` cell matches the transcribed values; **BUG-2 regression** — AoR and
EotE bonuses land in `bonus.duty` / `bonus.obligation` and **never** in `bonus[undefined]` (the
original read the nonexistent `this.data.grants.rules` at `:894,:897,:900,:903`); `calcObligation`
and the `grants.bonus` display agree for every cell; a generated `commitId` satisfies
`/^[a-zA-Z0-9]{16}$/` (**DEV-5 smoke** — fails loudly if a bare `randomID` is ever introduced).

**Verification (Static):** GATE-LINT (L1 on the two new files, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): single starting-bonus table + wizard state factory (BUG-2)`

---

### Stage 8 — `load-source.js`: the explicit source-descriptor table (issue C, N-1, N-4, D7)

**`loadSource` consumes a descriptor table. It NEVER interpolates a setting name.**

**Files created:** `modules/char-creator/load-source.js`, `tests/char-creator/load-source.test.js`
**Files modified:** `tests/ffg-tests.js`

**Why interpolation is wrong:** the literal `` `${type}Compendiums` `` is not valid for every
consumed category. Verified in `modules/swffg-main.js:567-652`: `specializationCompendiums` (`:567`),
`signatureAbilityCompendiums` (`:575`), **`forcePowerCompendiums`** (`:583`), `talentCompendiums`
(`:591`), `backgroundCompendiums` (`:600`), `obligationCompendiums` (`:609`), `speciesCompendiums`
(`:618`), `careerCompendiums` (`:627`), `motivationCompendiums` (`:636`), **`itemCompendiums`**
(`:645`). The Item type for Force powers is lowercase **`forcepower`**, so interpolation would
request the **nonexistent** `forcepowerCompendiums`. Gear spans **five** Item types under the **one**
`itemCompendiums` setting.

**Normative descriptor table** — pool key, setting key and world item types are **three separate
things**:

| `poolKey` | `settingKey` | `worldItemTypes` | Bucketing |
|---|---|---|---|
| `species` | `speciesCompendiums` | `["species"]` | — |
| `career` | `careerCompendiums` | `["career"]` | — (**N-1**: the world type is `career`, *not* `careers`) |
| `specialization` | `specializationCompendiums` | `["specialization"]` | In-Career / Out-of-Career / Universal |
| `forcePower` | `forcePowerCompendiums` | `["forcepower"]` | by `system.required_force_rating` |
| `background` | `backgroundCompendiums` | `["background"]` | `system.type` → culture / hook / attitude |
| `obligation` | `obligationCompendiums` | `["obligation"]` | obligation / duty / morality per ruleset |
| `motivation` | `motivationCompendiums` | `["motivation"]` | `system.type` |
| `gear` | `itemCompendiums` | `["weapon","armour","gear","itemattachment","itemmodifier"]` | the five category chips |

Not consumed by the wizard (listed so the omission is deliberate): `talentCompendiums` (talents
arrive through specialization trees) and `signatureAbilityCompendiums`.

> **Confirm and record, do not guess:** the current `getAvailableMoralities`
> (`character-creator.js:735-757`) loads the **same** `obligation` pack and world type as
> obligations and returns them undifferentiated; the obligation/duty/morality split is made
> downstream by ruleset. Confirm the exact bucketing against `CONFIG.FFG.characterCreator` and record
> it in the descriptor comment before implementing.

**Work:**
- `loadSource(poolKey, pool, bucketer)` looks the descriptor up; **an unknown `poolKey` throws** —
  no interpolation fallback exists.
- **Composition:** packs from `game.settings.get("starwarsffg", descriptor.settingKey).split(",")` ∪
  world items whose `type` is in `descriptor.worldItemTypes`. Falsy pack ids skipped.
- **N-1 fix:** world careers now resolve. **N-4 fix:** gear gains the world ∪ packs union (today
  `getItems :660-683` scans packs only).
- **GM gates at load**, before any interactive filter: `system.rarity.value > maxRarity` excluded;
  restricted excluded unless `allowRestricted` (semantics from `:663-676`).
- Results map to `SelectionRef`s (**snapshots via `toObject()`** — the cached compendium Document is
  never referenced again, killing issue D at the root) and are **cached per poolKey** for the app's
  lifetime; the cache **invalidates when the pool selection changes**.
- **`isSourceEnabled(poolKey, sourceId)`** is the ONE decision point; `sourceIdOf(uuid)` derives a
  pack id or the `"world"` pseudo-source. The `available.specializations` rebuild filters
  career-referenced specs through the **same** predicate. Persistence is **per user**, stored as
  **exclusions** so newly-added GM packs default on:
  `game.user.setFlag("starwarsffg", "pcWizardSourceSelection", {schemaVersion: 1, byType: {<poolKey>: {excluded: [sourceId, …]}}})`.
- A selected ref whose source is later disabled **stays in the draft** with an advisory note.

**Tests:** **`forcePower` resolves `forcePowerCompendiums` and world type `forcepower`**; **`gear`
unions all five Item types**; an unknown `poolKey` **throws**; `career` resolves world type `career`
(N-1); gear includes world items (N-4); `maxRarity`/`allowRestricted` exclusion at load; `sourceIdOf`
derives pack ids and `"world"`; the exclusion flag round-trips.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): descriptor-driven loadSource + pool predicate (N-1, N-4, D7)`

---

### Stage 9 — `to-item-data.js` + `materializeTreePurchases` (issue E, N-5, N-6, N-7, BUG-1)

**Files created:** `modules/char-creator/to-item-data.js`, `tests/char-creator/to-item-data.test.js`
**Files modified:**
- `modules/helpers/item-helpers.js` *(legacy — L2; **purely additive**, no existing call site
  changes)* — add internal `materializeTreePurchases(itemSource, learnedKeys)` built on the Stage 3
  pure core. Deep-clones the source, sets `islearned` for purchased keys (specialization →
  `system.talents`; forcepower → `system.upgrades`, matching the `syncAEStatus` dispatch at
  `:240-247`), reconciles the clone's `effects` with **the same algorithm** the sheet uses. **N-7:**
  flipping `islearned` alone is insufficient — the sheet's purchase path explicitly re-syncs
  (`modules/items/item-sheet-ffg.js:1776-1777`) while the current wizard never does, leaving
  purchased nodes **stat-inert**.
- `tests/ffg-tests.js`

**Deterministic rank grants (issue E):** the `attr${Date.now()}` attributes plus one ActiveEffect per
rank (`character-creator.js:1151-1200`, `:1791-1839` — same-millisecond collisions are real) become
deterministic `pcwRank<n>_<skillSlug>` attributes plus effects `{key: "system.skills.<skill>.rank",
mode: AE_MODES.ADD, value: 1}` (`AE_MODES` from `modules/config/ffg-active-effect-modes.js`),
**baked into the career/spec item source**. Sound for the in-memory preview because
`CONFIG.ActiveEffect.legacyTransferral = false` (`modules/swffg-main.js:218`).

**One mapping for every category:** background culture/hook/forceAttitude (forceAttitude **only when
`rules === "fad"`**), obligations (**edited snapshots** — the inline magnitude edit writes into the
ref's own `snapshot.system`, closing `:1017-1021`), species, career, selected specialization,
motivations, **plus the intentional fixes**: purchased extra specializations and Force powers
(**N-5** — today *neither* path embeds them, so XP is charged for content that never reaches the
actor) and credit-purchased gear (**N-6**, both paths). **BUG-1:** motivations are plain
`SelectionRef`s through the same `toItemData` — the `{item: Doc}` wrapper (`:1654-1656`) and its two
inconsistent consumers (`:1142-1146`, `:1757-1761`) are unrepresentable. `projectItemSource` is the
**final mapping step**.

**Tests:** duplicate gear purchase yields two items; rank grants are deterministic across runs and
contain **no `Date.now()`**; a compendium spec with flagged tree effects materializes correctly; a
**legacy spec with an unflagged same-name effect is adopted, not duplicated**; unlearned nodes give
`disabled: true`; the snapshot input is **not mutated**.

**Verification (Static):** GATE-LINT (L1 on the new file, L2 on `item-helpers.js`, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD (confirm sheet talent purchase is unchanged).
**Commit:** `feat(char-creator): toItemData + tree materialization with synced AEs (E, N-5..N-7)`

---

### Stage 10 — `apply-build.js`: the single shared build path (issue C, design §5.5)

**Files created:** `modules/char-creator/apply-build.js`, `tests/char-creator/apply-build.test.js`
**Files modified:** `tests/ffg-tests.js`

`applyBuild(data) → {actorData, warnings}`, **pure and synchronous** (snapshots are present: no
`fromUuid`, no awaits).
1. **Base + identity** from `getActorCreationDefaults("character")` (Stage 2) — default `system`,
   default image, and the **partial** prototypeToken with **no** `name`/`texture.src`. Then
   `name = data.identity.name`, `img = data.identity.img ?? defaults.img`. Required because a
   complete source containing `system` **bypasses `ActorFFG.create`'s token block entirely**, and
   constructor-built actors never run `create`/`_preCreate`.
2. **Characteristic purchases** via `applyCharacteristicDeltas(system, counts)` — "default + count"
   reproduces the current sequential `Actor.update` calls exactly. Skill purchases write
   `system.skills.<key>.rank`. Costs ported verbatim: characteristic `newValue * 10` (`:1218`);
   career skill `newValue * 5`, non-career `newValue * 5 + 5` (`:1258-1262`).
3. **Other system fields:** `system.experience.{total, available}` from `calcXp`;
   `system.stats.credits.value = calcCredits().available + data.spendingCredits`;
   `system.<morality|obligation|duty>.value = calcObligation().available` (`:1784-1789`).
4. **Items** via `toItemData()` for every category (Stage 9).

`applyBuild` is the **only** builder: `showCharacterStatus` (`:1083-1205`) and `createActor`
(`:1697-1845`) — ~130 near-duplicated lines — have exactly one successor.

**Tests:** a full synthetic draft yields characteristics/wounds/soak/encumbrance/strain/XP/credits/
obligation matching hand-computed expectations; Brawn +2 moves wounds/soak/encumbrance by +2 and
Willpower +1 moves strain by +1; `spendingCredits` is included; force-attitude is **excluded** when
`rules !== "fad"`; the input is not mutated.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): single applyBuild path replacing preview/commit duplication`

---

### Stage 11 — `preview.js`: the in-memory preview engine (D2, issue A)

**Files created:** `modules/char-creator/preview.js`, `tests/char-creator/preview.test.js`
**Files modified:** `tests/ffg-tests.js`

```js
const { actorData } = applyBuild(this.data);
await assignWizardIdentity(actorData, { userId: game.user.id, commitId: this.data.commitId });
const previewActor = new CONFIG.Actor.documentClass(actorData);   // UNSAVED. Never .create().
```

**Normative constraints:**
- Preview actors are constructed **only at/after `ready`**. `ClientDocumentMixin._initialize` runs
  `_safePrepareData()` during construction once `game._documentsReady` — **construction IS the
  preparation.**
- **Never call `prepareData()` a second time** on a preview actor: un-reset re-preparation
  re-applies ADD-mode effects onto already-modified values. If it were ever needed, `reset()` must
  precede it.
- Each render constructs a **fresh** actor and discards the old one — with **identical deterministic
  ids** each time, so nothing churns.
- **Zero DB writes, zero socket traffic, zero orphan actors, zero flicker** while editing. The
  `temp actor - <user>` mechanism and its `deleteCharacter` cleanup have **no successor**.

**Tests:** two constructions from one draft give **identical** `_id`, item ids and effect ids; the
same gear bought twice gives two embedded items with **distinct** ids; derived stats match
`applyBuild`'s intent; **`game.actors.size` is unchanged after N preview constructions** (the
automated form of "no trillion temp actors").

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): in-memory preview engine (D2 — no DB actor churn)`

---

### Stage 12 — `validate.js`: advisory validation (D4, issue G)

**Files created:** `modules/char-creator/validate.js`, `tests/char-creator/validate.test.js`
**Files modified:** `tests/ffg-tests.js`

Pure `validateDraft(data, ctx) → {steps, totals, warnings}` (design §5.11): per-step completeness
mirroring the wizard's own review copy (`lang/en.json:962-973`); expected free-rank counts (**4
career / 2 specialization** — the numbers the wizard's own labels state, `en.json:967,:969`) as
**warnings** when short or over; affordability (XP ≥ 0, credits ≥ 0) as warnings; unspent-XP notice;
cross-cutting notes (force-attitude while `rules !== "fad"`; selection from a disabled source;
unresolvable draft uuid).

**D4 is binding: create is NEVER blocked.** Warnings produce **one confirm dialog** with **"Create
anyway" as the default** and "Go back" as the alternative. Existing purchase-time affordability
behaviour is preserved as-is (`:1318-1324`).

**Tests:** an empty draft yields all steps `incomplete` and **zero blocking**; an overspent draft
yields `warning` plus a warning string but never an error; statuses flip to `complete` as selections
are made.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): advisory validation (D4)`

---

### Stage 13 — `draft-store.js`: draft persistence, record-ownership API, and the size budget (D5)

**Files created:** `modules/char-creator/draft-store.js`, `tests/char-creator/draft-store.test.js`
**Files modified:** `tests/ffg-tests.js`

**Storage:** a flag on the player's **own** User document —
`game.user.setFlag("starwarsffg", "pcWizardDraft", draft)`. Verified basis: non-GM users may update
their own User document and `flags` is not restricted (`common/documents/user.mjs:204-220`).
Rejected alternatives: world settings (GM-writable only), client settings/localStorage (not
per-world), a placeholder actor (the orphan pattern D2 forbids).

**Schema v1** (design §5.7) — note `commit` sits **beside** `data`, not inside it:

```js
{ schemaVersion: 1, systemVersion, savedAt, characterName,
  commit: null | { commitId, firstAttemptAt, xp: {total, available}, fingerprint },
  data: { identity, commitId, grants, selected, purchases, initial, spendingCredits } }
// `available` and all this.ui state are EXCLUDED (derivable / transient).
```

**Normative API — the store owns the outer record** (a `saveNow(data)` signature could not persist
`commit`, which lives outside `data`; browser-loss recovery depends on it):

```js
draftStore.scheduleSave({ data, commit });      // debounced ~1 s
await draftStore.saveNow({ data, commit });     // cancels the pending timer; writes now
await draftStore.load();                        // → the full record above, or null
draftStore.setCommit(commit);                   // freeze/clear the commit record; marks dirty
await draftStore.idle();  await draftStore.clear();
draftStore.lock(); draftStore.unlock();         // while locked, scheduleSave is a NO-OP
```

- **There is no `draft.commitFrozen`.** "Frozen" is **derived**: `isCommitFrozen === (record.commit
  !== null)`. Stage 17's `#mutate` tests `this.#draft.commit` and, when set, re-mints the `commitId`
  and clears the record via `setCommit(null)`.
- `MIGRATIONS[n]` map (**empty at v1**). Older schema → migrate; **newer** → refuse resume, offer
  discard; unreadable → offer discard; **never crash on a bad draft**.
- Rehydration on resume: per `SelectionRef`, `fromUuid` → refresh the snapshot **except user-edited
  obligation fields, which are preserved over the refresh**; unresolvable → keep the stored snapshot
  + advisory warning; then rebuild derived state.

**Tests:**
1. Round-trip `{data, commit}` through save/load.
2. **Frozen-commit durability:** `setCommit(frozen)` → `saveNow(...)` → reload → the recovered
   `commit` record is **deep-equal to the frozen one**, `fingerprint` included. This is the
   browser-loss recovery guarantee.
3. `schemaVersion` above current is refused (not crashed); a corrupt draft is refused with a discard
   offer.
4. `lock()` makes `scheduleSave` a no-op while `saveNow` still writes; `saveNow` cancels a pending
   debounce (no double write).
5. Obligation edits survive a snapshot refresh.

**Draft-size measurement — objective, in UTF-8 bytes:**

> **`JSON.stringify(record).length` is WRONG here** — it counts **UTF-16 code units**, not bytes.
> Draft records carry imported names and HTML descriptions with non-ASCII characters, whose UTF-8
> byte size can materially exceed that count. Measure bytes:

```js
const json = JSON.stringify(record);
const serializedBytes = new TextEncoder().encode(json).byteLength;
const serializedKiB   = serializedBytes / 1024;          // BINARY KiB
```

- **Thresholds are stated in binary KiB and measured in UTF-8 bytes.** Agreed at Stage 1; proposed
  defaults: **≤ 64 KiB (65 536 bytes)** **and** median `setFlag` round-trip **≤ 150 ms over 10
  samples**. Exceeding **either** triggers the fallback.
- **Measure two drafts:** a *normal* draft (one of each category, a few gear purchases) and a
  *maximum-content* draft (all categories, ≥20 gear purchases, ≥3 extra specializations and ≥3 Force
  powers, each with full snapshots). Record both.
- **Also measure the actual persisted payload** if Foundry adds an envelope or re-encoding at the
  storage boundary: compare `serializedBytes` against the size of the update payload Foundry
  actually sends/stores, and record any material difference. The threshold applies to the
  **persisted** payload where the two diverge.
- **Fallback if triggered:** uuid-only refs for compendium-resolvable items, snapshots only for
  world items and edited obligations. It is implemented **in this stage**, and these tests are
  re-run before proceeding: Stage 8 `load-source`, Stage 9 `to-item-data`, this stage's five tests,
  and — once they exist — Stage 19's identity and parity fixtures.
- **Record the measurement and the decision either way**, including when no fallback is needed.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA; the size/latency measurement recorded as
a **pass/fail against the agreed numbers**, in bytes and KiB, not a judgement call.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD.
**Commit:** `feat(char-creator): draft store with record-ownership API and byte-accurate size budget (D5)`

---

### Stage 14 — `notify.js`: D9 observability with **R7-2** ACK binding and GM-connect trigger

**The R7-2 stage.**

**Files created:** `modules/char-creator/notify.js`, `tests/char-creator/notify.test.js`
**Files modified:** `tests/ffg-tests.js`

**Session identity:** each wizard **open** mints a transient `sessionNoticeId =
foundry.utils.randomID(16)` on the app instance — **not persisted, not derived from `commitId`**.
Reopening a persisted draft keeps its `commitId` but gets a **new** `sessionNoticeId`.

**Start notice (R7-2 items 1–4):**
- The client emits `startNotice {sessionNoticeId, commitId}` and holds `#startNoticeState =
  "pending"`. **Emission alone never marks delivery.**
- **The processing GM** (`game.user === game.users.activeGM`) derives the requester **from the socket
  sender** — the trusted-sender contract `modules/helpers/gm-bridge.js:120-131` documents and uses —
  **never** from the payload; de-duplicates by authenticated **`(sender, sessionNoticeId)`** (*not*
  by `commitId`, so reopening a draft notices again); posts one ChatMessage whispered to all GMs
  (`Notify.StartedGM`) plus a `CONFIG.logger.info` line; then broadcasts **`startNoticeAck
  {requesterId: sender, sessionNoticeId}`**.
- **A client accepts an ACK only when all three hold:** `requesterId === game.user.id`, **and** the
  `sessionNoticeId` is in its pending map, **and** the socket sender is a GM. Without the
  `requesterId` binding, another player can replay an observed session id and cause a real GM to
  emit a GM-signed ACK the honest client would wrongly accept.
- **Emission triggers while pending:** (a) first render; (b) a later render where an active GM exists
  and ≥30 s have elapsed; (c) **a ready-time `Hooks.on("userConnected", (user, connected) => …)`
  hook registered ONCE in `notify.js`**, flushing pending notices when `connected && user.isGM`
  (`userConnected` declared at `client/hooks.mjs:1122`, fired from
  `client/documents/collections/users.mjs:103-129`); (d) **unconditionally, immediately before the
  first commit attempt** (retained).
- **Pending-map lifecycle:** the entry is removed **on ACK** *and* **on wizard close**. Without the
  close-side removal, repeated no-GM opens replace the old listener leak with session-map leakage.

**Finish record:** after a successful commit the **processing client** posts one ChatMessage
whispered to all GMs **and the requesting player** (`Notify.FinishedGM` / `Notify.FinishedPlayer`)
containing a clickable **`@UUID[Actor.{id}]{name}`** link, plus a log line and any `verifyCommitLog`
warnings. De-duplicated by a session-lifetime set of authenticated **`(sender, commitId)`** keys.
**Cross-GM duplication remains possible** by design (no durable ledger).

**Player toast:** the **green** toast appears **only** on the authenticated `commitResponse {ok:
true}`. Until then: an honest **"Submitting… — not confirmed"** state (spinner, amber status line);
on timeout **"Not confirmed — will retry / Retry"** with the draft intact. **The player is never
shown green without the ACK.** GM-local commits toast on local success.

**Tests — all mandatory (5–8 are R7-2's required cases):**
1. An ACK whose `requesterId` is another user is **rejected** (state stays pending).
2. An ACK from a non-GM sender is **rejected**.
3. An ACK for an unknown `sessionNoticeId` is **rejected**.
4. Finish de-dup: two commits with the same `(sender, commitId)` on one client post **one** record.
5. **Two concurrent players:** each accepts only its own ACK.
6. **No-GM open then GM connection with NO intervening render:** the `userConnected` hook flushes and
   the notice is delivered.
7. **Close-while-pending:** the entry is removed on close; N no-GM open/close cycles leave the map
   **empty**.
8. **Lost-ACK GM failover:** a different GM processes the retry; client state converges to delivered
   (a second start record is the documented residual).

**Residual documentation:** append the cross-GM **start** duplication case to the accepted residuals
(design §9-a documents only the finish case); carried into the Stage 22 docs.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA (all eight).
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD. Two-client behaviour is Stage 20.
**Commit:** `feat(char-creator): D9 observability with requester-bound ACKs and userConnected flush (R7-2)`

---

### Stage 15 — `commit-service.js` + `socket-bridge.js` (D3, D10, issue F, N-2, N-3)

**Files created:** `modules/char-creator/commit-service.js`, `modules/char-creator/socket-bridge.js`,
`tests/char-creator/commit-service.test.js`
**Files modified:** `tests/ffg-tests.js`

**Commit identity and normalization (design §5.8.2):**
- `data.commitId` is minted at draft creation (`foundry.utils.randomID(16)`).
- **The first attempt freezes** `draft.commit = {commitId, firstAttemptAt, xp: {total, available},
  fingerprint}` — persisted through `draftStore.setCommit(...)` + `saveNow({data, commit})`.
- **Any successful `#mutate` while `draft.commit` exists mints a fresh `commitId` and clears
  `commit`** — it is impossible by construction to submit two different payloads under one
  `{userId, commitId}`. The wizard **logs a warning naming the superseded commitId**
  (`Notify.StrayCommit`).
- `normalizeCommitSource(actorData, {userId, commitId, firstAttemptAt, xp})`:
  1. **Reapply `assignWizardIdentity`** (Stage 6) — the same helper and formulas as preview; commit
     defines **no second formula**.
  2. **Baked XP log:** `flags.starwarsffg.xpLog = [spendEntry, earnEntry]` (newest-first, matching
     the helpers' prepend order), built with the **Stage 4 builders** and **its field mapping**:
     - spend: `buildXpSpendEntry({description: "Character Creation Changes", cost: xp.total -
       xp.available, available: xp.available, total: xp.total, statusId: "pcw:"+commitId+":spend",
       date: firstAttemptAt.slice(0,10)})` → the entry's **`action` is `"purchased"`** and
       `"Character Creation Changes"` lands in **`description`** — **not the reverse**.
     - earn: `buildXpEarnEntry({grant: xp.total, available: xp.total, total: xp.total, note: "Initial
       State", granter: "GM", statusId: "pcw:"+commitId+":earn", date: same})` → `action:
       "granted"`, `xp.cost === xp.total`.
     Because the entries ride the source, **any same-key overwrite restores the intended log state
     instead of erasing it**. Writing them as source also **suppresses the whisper** (`xpLogSpend`
     notifies unconditionally and offers no bypass); the D9 notifications replace it.
  3. **Commit stamp:** `flags.starwarsffg.pcWizardCommit = {commitId, userId, xp, date}`.
  4. **Fingerprint:** `digest16` over the normalized source JSON. **Semantic-equality exclusions,
     normative:** `_stats` at every level, and — across GM failover only — the server-added
     processing-GM `ownership` entry. A retry whose recomputed fingerprint mismatches indicates
     non-determinism (a bug): mint a fresh commitId and warn.

**`commitBuild` (design §5.8.3):** same-client `inFlight` coalescing keyed `${userId}:${commitId}`; a
**best-effort stamp preflight** on the local snapshot throwing `CommitCollisionError` loudly on
mismatch (recovery: mint a fresh commitId — a mismatched occupant proves this commit never landed
there); `Actor.implementation.create(normalizedSource, {keepId: true})`; then `verifyCommitLog`
(**read-only, D10** — checks entry presence by deterministic id, returns warnings, **never writes the
flag**).

> **State it plainly in the code comments:** a top-level Actor create with `keepId: true` is an
> **UPSERT**. The create-only duplicate check runs solely for embedded parent collections. **No
> atomic, exactly-once, or never-overwrite claim is made anywhere.**

**The socket bridge** (replaces `modules/swffg-main.js:2052-2126`, deleted at Stage 18):
- Channel `system.starwarsffg`, `eventType: "pcWizard"`, events `commitRequest`, `commitResponse`,
  `startNotice`, `startNoticeAck`. Legacy `createCharacterRequest` / `createFinalActorRequest` /
  `deleteCharacter` are **deleted with the temp-actor mechanism** — no successor.
- **Coexistence (§0.4):** a **separate** `game.socket.on` registration, not an extension of
  `registerGMBridge()`. It **must filter `data?.eventType === "pcWizard"` first**; its event names
  are verified non-colliding.
- **Listener lifecycle (issue F, N-3):** registered **once in `ready` on every client**. GM clients
  process `commitRequest`/`startNotice` **only where `game.user === game.users.activeGM`** — the same
  activeGM-dispatch pattern `gm-bridge.js:126` uses, which **survives the first-ready-GM logout that
  silently kills today's bridge** (`swffg-main.js:2052`). All clients process
  `commitResponse`/`startNoticeAck` against session-lifetime maps. **The wizard instance registers
  nothing and `close()` has no socket duty** — the per-open constructor listener leak
  (`character-creator.js:189-195`) has **no successor**.
- **Sender authentication (N-2):** the requesting user id comes **exclusively** from the socket
  layer's trailing sender argument. Responses are accepted only when the `requestId` matches a
  pending request **and** the response's sender is a GM.
- **GM-side sanitization — the GM builds a fresh source; the payload is quarry.** Allowed: `name`
  (clamped string), `img` (string path), `system` (object), `items` (array — **rebuilt** through
  `projectItemSource`, `null` projections dropped with warnings), plus validated commit metadata (id
  shapes, **finite** `xp`). Everything else — payload `_id`, `folder`, `ownership`, `flags`,
  `prototypeToken`, actor-level `effects`, unknown keys — is **ignored**. The fresh source gets
  `type: "character"`, `prototypeToken` from `getActorCreationDefaults("character")`, `ownership`
  **replaced** with `{[sender]: OWNER}`, then `normalizeCommitSource(…)` and `commitBuild`.
- **GM-local path:** a GM's wizard calls `commitBuild` **directly**. Same stamping, dedup, preflight
  and verification. **No separate racy path exists.**
- Timeout ~15 s → the honest unconfirmed state; retries reuse the frozen identity with a **fresh
  `requestId`** (`foundry.utils.randomID(16)`).

**Tests:** `normalizeCommitSource` is deterministic across two runs (it reads no clock); the baked
xpLog has exactly the two `pcw:<commitId>:*` entries with the frozen date; **the baked spend entry
has `action === "purchased"` and `description === "Character Creation Changes"`**;
`verifyCommitLog` warns on a missing entry **and performs no write**; `inFlight` returns one promise
for two concurrent identical calls; the sanitizer drops payload `_id`/`ownership`/`flags`/
`prototypeToken` and rebuilds `items` through the projection; a response from a non-GM sender is
rejected; an unknown `requestId` is rejected; a payload with `eventType !== "pcWizard"` is ignored.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA.
**Verification (Manual):** GATE-BOOT; GATE-LIVE-WIZARD. Two-client behaviour is Stage 20.
**Commit:** `feat(char-creator): best-effort commit service + authenticated socket bridge (D3)`

---

### Stage 16 — New template tree at `templates/wizards/pc_wizard/` (purely additive)

**DEV-4: this stage does not touch a single file the live wizard renders.** Every file below is
**new**. The legacy `templates/wizards/char_creator/` tree is untouched here and deleted atomically
at Stage 18.

**Files created — all under `templates/wizards/pc_wizard/`:**
- `header.html` — window header, character-name input, Sources button, Discard-draft control.
- `tabs/background.html`, `tabs/startingBonus.html` (**with the ruleset selector at the top** — the
  D7 fold-in), `tabs/obligation.html` (active ruleset **read-only**), `tabs/species.html`,
  `tabs/career.html`, `tabs/xp_spend.html`, `tabs/gear.html`, `tabs/motivation.html`,
  `tabs/review.html` — **nine tabs; there is no `rules.html`.**
- `parts/pickable-table.html` — the reusable partial taking `{tableId, columns[], rows[],
  selectedUuid, searchable, sortState, editable?}`, rendering a sortable, searchable, single- or
  multi-select table (the `editable` variant carries the obligation magnitude edit). **It replaces
  all seven per-render DataTables instances** (`#obligations`, `#species`, `#careers`,
  `#specializations`, `#buy_gear`, `#selected_motivations`, `#motivations`).
- `parts/gear-filters.html`, `parts/sources-panel.html`, `parts/draft-banner.html`.
- `actor_preview.html`, `preview/skills.html`, `preview/specialization.html`,
  `preview/forcepower.html`, `item_pill.html` — **copied** from `char_creator/` and adapted to the
  new context shape (`.pill` becomes a **context-computed value**, never a monkey-patch on a cached
  Document). Copies, not moves: the originals must keep serving the live wizard until Stage 18.

**Files modified:**
- `modules/helpers/partial-templates.js` *(legacy — L2)* — append every new path that is invoked as
  `{{> "…" }}` to the `templatePaths` array in `TemplateHelpers.preload()` (called from
  `modules/swffg-main.js:1359`), which delegates to
  `foundry.applications.handlebars.loadTemplates`. **The existing list already registers the four
  legacy `char_creator` preview partials at `:42-45`** (line `:41` is
  `chat/parts/item/ffg-footer.html` — **do not touch it**). The new entries go alongside them
  (**additive**; the legacy four are removed at Stage 18). At minimum:
  `systems/starwarsffg/templates/wizards/pc_wizard/parts/pickable-table.html`,
  `…/parts/gear-filters.html`, `…/parts/sources-panel.html`, `…/parts/draft-banner.html`,
  `…/actor_preview.html`, `…/preview/skills.html`, `…/preview/specialization.html`,
  `…/preview/forcepower.html`, `…/item_pill.html`.
  > **Why required:** core `HandlebarsApplicationMixin._preRender` loads only each
  > `PARTS[*].template` and its declared `PARTS[*].templates`
  > (`handlebars-application.mjs:97-105`). A file existing on disk is **not** a registered
  > Handlebars partial — an unregistered `{{> … }}` throws "partial not found" at render time.
  > **Belt and braces:** Stage 17 *additionally* declares each part's dependencies in
  > `PARTS[partId].templates`. This plan requires **both**; the Stage 17 render test is what proves
  > it.
- Partial invocation uses the repo convention — the **full quoted path**, e.g.
  `{{> "systems/starwarsffg/templates/wizards/pc_wizard/parts/pickable-table.html" (…) }}` (see
  `templates/wizards/char_creator/actor_preview.html:53` for the established form).

**Gear filters (D6, §5.12):** GM gates stay **at load** inside `loadSource`; nothing rendered can
exceed them; **no reveal toggle**. The bar (state in `this.ui.gear`, transient, never drafted):
**price** min/max against `system.price.value`; **rarity** "up to N" whose options run `0…GM
maxRarity`; **restricted** tri-state against `system.rarity.isrestricted`, rendered **only when**
`allowRestricted` is true; five category chips as **declarative per-category column sets**
(replacing the numeric index 0–14 visibility toggles at `:363-481`); text search; clear-filters.
Filtering is **pure in `_prepareContext`**.

**Sources panel (D7):** opened from a **header button, not a tab** (design §10-1 default — flagged,
not re-decided). Groups by consumed category; one checkbox per resolvable source; **default
all-on**. The specialization group lists **configured packs ∪ packs referenced by the selected career
∪ "World items"**, each independently toggleable.

**Rich text (BUG-4):** every description rendered as content — culture/hook/force-attitude (today
`.text(selectedItem.system.description)` into `#cultured_esc` / `#hook_desc` / `#force_attitude_desc`
at `:922,:938,:954`), review/preview areas — is **enriched in `_prepareContext`** and rendered with
**triple-stache** into sanitized containers; tooltips use `stripHtml()`. **Never raw HTML into text
sinks; never enriched HTML into attributes.**

**Collapsibles:** career sections (today jQuery `.toggle('slow')` keyed off `_openCareerSection`,
`:10,:299-308`) become `<details>/<summary>` or a `data-action` class toggle, state in `this.ui`.

**Verification (Static):** GATE-LINT (L2 on `partial-templates.js` — the only file touched under
`modules/`; L3); GATE-MOCHA. Every `{{> "…" }}` path in the new tree resolves to a file that exists
**and** appears in the `partial-templates.js` list — check **both directions** (a path in one list
and not the other is a defect).
**Verification (Manual):** **GATE-LIVE-WIZARD is the point of this stage** — the old wizard opens and
works **completely unchanged**, because not one file it renders was modified. GATE-BOOT.
*(The new tree cannot be render-tested yet — nothing renders it. That is Stage 17.)*
**Commit:** `feat(char-creator): new pc_wizard template tree + partial registration (additive)`

---

### Stage 17 — `pc-wizard.js`: the AppV2 shell, with an all-parts render test (issue B, H)

**Files created:** `modules/char-creator/pc-wizard.js` (exports `CharacterCreator`),
`tests/char-creator/render.test.js`
**Files modified:** `tests/ffg-tests.js`

**No file outside `modules/char-creator/` and `tests/` is modified. The shim is Stage 18** — until
then the old implementation is still the live one.

**Work:**
- `static PARTS` — **12 entries**: `header`, the core `tabs` navigation part
  (`templates/generic/tab-navigation.hbs`), **nine** tab-content parts, and `preview` — **all
  pointing at `templates/wizards/pc_wizard/…`** (DEV-4). **No `footer`.** Each part additionally
  declares its partial dependencies in `PARTS[partId].templates`.
- `static TABS` in the verified visual order **minus the dropped `rules` tab**:
  `background, startingBonus, obligation, species, career, xp_spend, gear, motivation, review`
  (current `TABS` at `character-creator.js:49-97`; **PARTS order differs — TABS is authoritative**).
  **Initial tab: `background`** (the current initial is `rules`).
- `DEFAULT_OPTIONS`: `tag: "form"` **without** a form handler — the phantom
  `form.handler: CharacterCreator.myFormHandler` (`:102`, undefined) is **not ported**; Enter-key
  submit is prevented. Chrome as today: 950×800, classes `["starwarsffg", "wizard", "charCreator"]`.
- **`close()` preserves the minimized-animation guard verbatim** from
  `modules/helpers/character-creator.js:199-202` — `tests/v2-migration/minimized-close.test.js`
  asserts `options.animate === false` when minimized and **no** `animate` property when not. **Hard
  requirement: getting this wrong fails a test through the shim at Stage 18.** `close()` also removes
  the D9 pending-notice entry (Stage 14) and, in any non-committed phase, runs `unlock()` + a final
  `await saveNow({data, commit})`; in the **committed** phase it performs **no** draft I/O.

**Listener-ownership rule (normative — issue B):** partial renders replace only requested parts, but
`_onRender` fires **for the whole app after every render**, so a whole-window rescan stacks listeners
on untouched parts. Therefore:
- **Clicks route exclusively through `DEFAULT_OPTIONS.actions`** (`data-action` + static handlers) —
  AppV2's delegated click handling is attached once at the frame and is partial-render-proof.
  Actions: `pick`/`unpick`, `adjustCharacteristic`, `adjustSkill`, `learnTalent`, `learnUpgrade`,
  `purchaseSpecialization`, `purchaseForcePower`, `removeSpecialization`, `removeForcePower`,
  `buyItem`, `refundItem`, `editObligation`, `saveObligation`, `removeObligation`, `addMotivation`,
  `removeMotivation`, `sortTable`, `setGearCategory`, `clearGearFilters`, `openSources`,
  `toggleSource`, `resumeDraft`, `discardDraft`, `createActor`, `prevTab`/`nextTab`. Handlers read
  identity from `data-uuid` / `data-table` / `data-field`.
- **Change/input bindings** are attached in an override of `_attachPartListeners(partId, htmlElement,
  options)` — invoked once per (re)rendered part with that part's fresh root — declared per part as
  `PART_BINDINGS[partId] = [{selector, event, handler}]`, querying **only within `htmlElement`**.
  **`_onRender` binds nothing.**
- Mutation → **targeted** re-render: `this.render({parts: [<currentTab>, "preview"]})` (plus `review`
  when open). **Never a full-window re-render per keystroke.** The current
  force-refresh-on-entering-review behaviour (`_onClickTab :959-965`) is preserved via the tab-change
  hook.
- Native `<select>` elements replace SlimSelect (`:213-256`).

**The `#mutate` funnel and the commit barrier** (naming aligned with Stage 13 — **no `commitFrozen`
field exists**):

```js
#mutate(fn) {
  if (this.#commitPhase !== "editing") return false;
  if (this.#draft.commit) this.#remintCommitId();   // edit after an attempt ⇒ NEW identity;
                                                    // re-mints commitId and setCommit(null)
  fn(this.data);
  this.draftStore.scheduleSave({ data: this.data, commit: this.#draft.commit });
  return true;                                      // caller performs the targeted re-render
}
```

Commit sequence (`#commitPhase ∈ {"editing","committing","committed"}`): guard → `"committing"` +
`draftStore.lock()` + disabled/spinner UI (**from this instant `#mutate` rejects**) → first attempt
only: `setCommit(frozen)` → **`await draftStore.saveNow({data, commit})` before creation starts** →
await the commit → success: `"committed"` → `await idle()` → `await clear()` → `await close()` → open
the new actor's sheet; failure/timeout: back to `"editing"`, `unlock()`, UI re-enabled, one honest
notification, draft intact, retry reuses the frozen identity.

**Preview consumption (unchanged verified patterns):** the preview part renders skill rows with
`data-ability` and a `.roll-button` child; per-part listeners call
`DiceHelpers.addSkillDicePool({data: foundry.utils.deepClone(previewActor.system)}, elem)`;
`_prepareContext` builds the skills panel with
`previewActor.sheet._createSkillColumns({data: deepClone(previewActor.system)})` (the verified
`this`-free instance method). Direct calls suffice — this is system code.

**Deleted, not ported (issue H):** `myFormHandler` (`:102`); `_preparePartContext`'s
`another_tab`/TODO branch (`:625-637`); the `.replace(" ", " ")` normalizations (`:582,:1232`).

**The all-parts render test — `tests/char-creator/render.test.js`:** instantiate the new class
**directly** (not via the entry button, which still opens the old one) and render it, then assert:

```js
// Enumerate from the class — never a hand-counted list, so the count cannot drift.
for (const partId of Object.keys(PCWizard.PARTS)) {
  // assert: rendered without exception, no "partial not found",
  //         and a root element for `partId` exists in the DOM
}
```

**Assert over every key in `PCWizard.PARTS`** — currently **12** (`header`, `tabs`, nine tabs,
`preview`); the enumeration means adding or removing a part never silently narrows the test. **This
is a render assertion, not a filesystem check** — a path that exists but is unregistered fails here.

**Verification (Static):** GATE-LINT (L1, L3); GATE-MOCHA **including the render test over all
`PARTS` keys**.
**Verification (Manual):** GATE-BOOT; **GATE-LIVE-WIZARD** (the entry button still opens the OLD
wizard, unchanged). Additionally, open the new class manually from the console and click through all
nine tabs.
**Commit:** `feat(char-creator): AppV2 shell with declarative actions and per-part listeners`

---

### Stage 18 — **CUTOVER**: shim, delete the old implementation, bridge and template tree

**The one stage that can leave the system unbootable, and the only stage where GATE-LIVE-WIZARD is
retired (the new wizard becomes the live one). Do it in this order and verify boot before
committing.**

**Pre-flight — mandatory, no bypass:** run **GATE-CYPRESS before making any edit in this stage** and
confirm the tree is still at the Stage 1 baseline:

```bash
npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
```

If the suite cannot run, the status is `BLOCKED-BY-ENVIRONMENT` and **work stops here until the
environment is repaired**. There is no owner-approval bypass and no manual substitute for this run
(§0.3).

**Files modified — three legacy module files:**
1. `modules/helpers/character-creator.js` *(legacy — L2)* — the 1846-line implementation is
   **deleted**, the file reduced to **one line**:
   ```js
   export { CharacterCreator } from "../char-creator/pc-wizard.js";
   ```
   **Do NOT delete this file** (§0.2). Verify the relative specifier resolves from `modules/helpers/`
   → `modules/char-creator/pc-wizard.js`.
2. `modules/swffg-main.js` *(legacy — L2, baseline 7 errors + warnings; **do not clean**)* — **delete
   the old pcWizard bridge block at `:2052-2126`** (the `createCharacterRequest` / `deleteCharacter`
   / `createFinalActorRequest` handlers and the `temp actor - <user>` machinery) and **replace it
   with the Stage 15 socket-bridge registration at `ready`**. **Do NOT touch** the import at `:58`,
   the entry button at `:1438-1465`, the `registerGMBridge()` call at `:1577`, or the compendium
   settings at `:567-652`.
3. `modules/helpers/partial-templates.js` *(legacy — L2)* — **remove the four legacy `char_creator`
   entries at `:42-45`** (`actor_preview.html`, `preview/skills.html`,
   `preview/specialization.html`, `preview/forcepower.html`). **Delete by exact path, not by line
   number** — line `:41` is `chat/parts/item/ffg-footer.html` and **must survive**. The `pc_wizard`
   entries added at Stage 16 stay.

> **These three are the complete L2 set for this stage.** The deleted template tree is **outside
> ESLint's `modules` scope**, and `modules/char-creator/socket-bridge.js` was **created at Stage 15**
> — it is a new file governed by **L1**, not a legacy file under L2.

**Files deleted:**
- The **entire** `templates/wizards/char_creator/` tree — `header.html`, `footer.html`,
  `item_pill.html`, `actor_preview.html`, `tabs/*.html` (including `rules.html`), `preview/*.html`.
  Safe **only now**, because this is the first moment nothing renders them.

**Verification (Static) — the gate for everything after:**
1. GATE-LINT — **L2 against the Stage 1 per-file baselines for all three touched legacy files**:
   `modules/helpers/character-creator.js`, `modules/swffg-main.js`,
   `modules/helpers/partial-templates.js`. Plus L3. **Note:** deleting 1846 lines will *reduce* the
   totals; record the new numbers as the reference for Stages 19–22.
2. **GATE-BOOT / static import smoke:** the system boots — every import specifier resolves, in
   particular `swffg-main.js:58` **through the shim**; hooks register; **no** `Failed to resolve
   module specifier` anywhere.
3. GATE-MOCHA — **`tests/v2-migration/minimized-close.test.js` must pass** (it imports the shim path
   and asserts the preserved minimized-close behaviour), plus the Stage 17 render test now exercising
   the live class.
4. **GATE-CYPRESS after the edits** — the collateral-damage check, an actually executed run compared
   against the pre-flight result. Same `--env` invocation.
5. **Exact-specifier greps** (a substring grep for `character-creator` could never pass, because
   `modules/config/ffg-character-creator.js`, its import in `modules/swffg-config.js`, and a comment
   in `modules/helpers/gm-bridge.js:122` all legitimately survive):
   - `grep -rn "helpers/character-creator.js" modules/ tests/` → **exactly two** live importers:
     `modules/swffg-main.js:58` and `tests/v2-migration/minimized-close.test.js:12`.
   - The shim file itself: **one export line** (`wc -l modules/helpers/character-creator.js` → 1,
     modulo a trailing newline) whose content is exactly the re-export above.
   - `grep -rn "createCharacterRequest\|createFinalActorRequest\|deleteCharacter\|temp actor" modules/`
     → **no matches**.
   - `grep -rn "char_creator" modules/ templates/` → **no matches**.
   - `grep -n "ffg-footer.html" modules/helpers/partial-templates.js` → **still present** (the
     chat-footer preload was not collaterally removed).

**Verification (Manual):**
6. The `#ffgCharacterWizard` button appears in the Actors directory and **opens the new wizard**; it
   opens on **`background`**; there is **no `rules` tab**; all nine tabs render without "partial not
   found".
7. **§11-2 no-churn smoke:** build a full character as GM while watching the Actors directory and the
   server log — **zero `temp actor - …` documents**, zero socket traffic, zero actor writes before
   Confirm; `game.actors.size` unchanged throughout editing.
8. Console clean versus the Stage 1 recorded console baseline.

**Commit:** `feat(char-creator)!: cut over to the rewritten PC wizard (shim keeps the old path)`

---

### Stage 19 — Parity and identity fixtures (design §11-3, §11-4, §11-5, §11-6)

**Files created:** `tests/char-creator/parity.test.js`
**Files modified:** `tests/ffg-tests.js`

**§11-5 identity fixtures (R7-1's runtime proof):** (a) render the preview repeatedly for one draft —
embedded Item/effect `_id`s **and** the preview actor `_id` are **identical across renders**; (b) the
same gear bought twice → two embedded items with **distinct** ids in preview **and** in the committed
actor; (c) commit, then compare — **committed embedded ids equal the preview's**; (d) repeat the
commit (same GM, no edits) → persisted source byte-equal **apart from `_stats`**; (e) re-mint (edit
after a failed attempt) → **all** wizard ids change together with the `commitId`.

**§11-4 canonical-projection parity fixture:** an ammo-enabled weapon
(`flags.starwarsffg.config.enableAmmo`), medical gear (`…config.medicalType`), **two same-key
ActiveEffects with different `priority`**, and a **tinted `flags.core.overlay` effect** — projected
item sources **equivalent between preview and commit**, derived stats match, ammo/medical behave on
the created actor, and the token renders the overlay/tint.

**§11-6 tree-materialization fixtures:** a compendium spec with flagged tree effects; a legacy-style
spec with an **unflagged same-name** effect (**adopted, not duplicated**); un-learn refund by uuid
(**BUG-3 regression** — the original compared `specName` (string) `===` a Document at `:1443-1444`,
so force-power un-learns never refunded).

**Verification (Manual) — §11-3 preview/final parity, the load-bearing correctness spike:** a
representative build (species + career + spec + purchased talents + extra spec + force power +
upgrades + characteristic/skill purchases + gear + obligations + motivations) — **every derived stat
of the preview actor equals the committed actor**, and both equal a **hand-built control character**
created through the sheet flows. Includes Brawn/Willpower purchases; `stats.Brawn`/`stats.Willpower`
mirror writes **confirmed inert**; free-rank AEs applying **in preview**. Also confirm **N-5** and
**N-6**.

**Verification (Static):** GATE-LINT (L3); GATE-MOCHA.
**Commit:** `test(char-creator): identity, projection-parity and tree-materialization fixtures`

---

### Stage 20 — Non-GM player smoke: D3 bridge + D9/R7-2 end-to-end (design §11-7)

**Requires two clients** (GM + non-GM player); two sub-cases need a **second GM**.

**Files modified:** only fixes arising from what this stage finds.

**Manual checklist:**
1. A player builds and commits through the bridge; the actor is **owned by the player** and its stats
   match their preview.
2. The **GM start whisper appears once per wizard session** — re-render does **not** repeat it;
   **closing and reopening the same draft does** produce a new one.
3. **No-GM open:** the start stays **pending** (no green, no false delivery).
4. **R7-2 — GM connects with NO intervening render:** the pending notice is delivered by the
   `userConnected` hook.
5. **R7-2 — replay attack:** from a second player's console, emit a `startNotice` carrying the
   **first** player's observed `sessionNoticeId`. The GM ACKs with `requesterId` = the **attacker**;
   the honest client **rejects** it and stays pending.
6. **R7-2 — two concurrent players:** each accepts only its own ACK.
7. **R7-2 — close while pending:** open/close the wizard N times with no GM; the pending map is
   **empty** — no session-map leakage.
8. **R7-2 — lost-ACK GM failover:** the original GM disconnects after processing; a second GM handles
   the retry; the commit **converges on the same actor**; a duplicate **start** record is the
   documented residual.
9. The **finish whisper** (with a working clickable actor link) reaches GMs **and** the player exactly
   once per commit on the processing client; a same-commit retry does not repeat it there.
10. The **ACK-gated green toast** appears **only** on the authenticated response; with the GM
    disconnected the player sees the honest unconfirmed state, then retry converges on reconnect.
11. **N-3 regression:** the first-ready GM logs out, a second GM is active — the bridge **still
    works**.
12. **N-2 regression:** two players commit simultaneously — neither consumes the other's response.
13. **§0.4 coexistence:** with the wizard open, exercise a gm-bridge feature (apply damage from an
    attack card to an unowned target) — **both bridges work**; neither swallows the other's traffic.

**Verification (Static):** GATE-LINT (L3); GATE-MOCHA.
**Commit:** `fix(char-creator): player-bridge and D9 notification fixes from two-client smoke`

---

### Stage 21 — Draft lifecycle, XP-log verification, ruleset/pool/filter checks, console-clean

Covers design §11-8, §11-9, §11-10, §11-11, and confirms §11-12 (measured at Stage 13).

**Files modified:** only fixes arising from what this stage finds.

**§11-8 draft lifecycle (Manual):** close mid-build → reopen → **resume banner** → **identical state**
including `spendingCredits` and edited obligations; discard works; a successful commit **clears the
draft with no resurrection** (watch the User doc); **kill the browser mid-commit** → resume → retry
**converges on one actor**, and the recovered **frozen commit record is intact**.

**§11-9 XP-log verification (Manual):** the created actor has **exactly** the two `pcw:<commitId>:*`
entries with the **frozen date** and correct totals; **the spend entry's `action` is `"purchased"`
and its `description` is `"Character Creation Changes"`** (verify on the real actor, not only in unit
tests); the earn entry's action is `granted` and `xp.cost` equals the grant; **externally delete one
entry**, re-run a same-commit commit → the **warning surfaces** and the **log is not rewritten**
(D10); **no XP-spend chat whisper** fires from the wizard's creation entries.

**§11-10 ruleset / pool / filter (Manual):** **BUG-2 regression** — AoR and EotE bonuses land in duty
/ obligation; switching ruleset **clears the starting bonus** and **hides force-attitude** (state
retained, restored on switching back); **N-1** — world careers appear; **N-4** — world gear appears;
**Force powers load** (`forcePowerCompendiums` + `forcepower`) and group by required Force rating;
disabling a source **removes offerings but preserves selections with an advisory note**; **gear
filters never exceed the GM gates**.

**§11-11 console-clean (Static + Manual):** load the fork — console clean versus the Stage 1 recorded
list; **no references to deleted socket events**; the old implementation file **contains only the
shim**.

**§11-12 draft size (confirm):** re-measure a real maxed draft **in UTF-8 bytes** against the Stage 1
agreed KiB thresholds and confirm the Stage 13 decision still holds. Record the numbers.

**Verification (Static):** GATE-LINT (L2 on any touched legacy file, L3); GATE-MOCHA;
**GATE-CYPRESS** (same `--env` invocation).
**Commit:** `fix(char-creator): draft lifecycle, log verification and pool/filter fixes from smoke`

---

### Stage 22 — Documentation, owner decision flag-back, final sweep

**Files created:**
- `docs/pc-wizard-guide.md` — user-facing docs (this repo keeps user docs in `docs/`). Contents:
  - the new tab flow (no rules tab; ruleset on the starting-bonus tab);
  - Sources panel, gear filters, draft resume/discard;
  - **the GM's D9 disambiguation procedure** (design §5.9): *started but never finished* → the
    submission didn't complete; auto-retry usually fixes it, else have the player press Retry;
    *finished/created but the player can't see it* → **the actor exists** (the finish record links
    it), have the player **reconnect/refresh** — owned actors re-sync on reconnect, **do not
    re-create**; duplicates are identifiable by their `pcWizardCommit` stamps (same `userId`,
    different `commitId`) — delete the superseded one;
  - **the recorded limitation:** items/effects relying on **third-party module flag scopes** lose
    those flags through the wizard and must be re-added manually;
  - **the accepted residuals**, honestly stated, **including the R7-2 addition**: cross-GM
    duplication of **start** records alongside the documented cross-GM **finish** duplication; and
    the best-effort commit model — **worst case is a duplicate character the GM deletes, never a lost
    or corrupted build. No atomic or exactly-once guarantee is claimed.**

**Files modified:**
- `superpowers/docs/plans/PcWizard/iterations/pc_wizard_design_doc_v7.md` — **optional, owner's
  call:** append a short "amended by implementation plan v4 (R7-1, R7-2, DEV-4, DEV-5)" note. Do
  **not** rewrite its body.

**Owner decision flag-back — surface, do NOT silently decide** (design §10):
1. **Q-2 — `2k_credits` grants 2500** (`character-creator.js:884,:902`), **ported verbatim** at
   Stage 7. A one-line fix either way, but visibly behaviour-changing.
2. **Sources-panel placement** — implemented as the design default (header-button overlay).
3. **GM-absent flow** — implemented as the design default: the wizard **opens** without a GM and
   *"a GM must be connected to finalize"* (`Notify.NoGm`) surfaces at review and commit. The **old**
   behaviour was a hard error at construct (`character-creator.js:184-187`).
4. **Fork release endpoints** — `system.json`'s `url`/`manifest`/`download` still point **upstream**
   (`system.json:5,92-94`); updaters would receive a **wizard-less system**. Outside this feature.
5. **Multiple named drafts** — one slot per user in v1.
6. **Warnings-dialog "don't ask again"** — not in v1.
7. **Draft-size representation** — report the Stage 13/21 byte measurements and whether the uuid-only
   fallback triggered.
8. **Legacy lint debt** — this work deliberately left the touched legacy files' pre-existing findings
   in place (DEV-7). Report the per-file numbers so the owner can schedule cleanup separately.
9. **Cypress status and the fork-local guard** — report the Stage 1 baseline (including whether it
   was red and what was decided), every cadence run's result, and the fact that
   `cypress/support/e2e.js` now carries the fork-local fail-closed `baseUrl` guard (DEV-9), which
   requires `--env expectBaseUrl=…` on every run and will abort an upstream-style invocation. The
   owner may want that guard upstreamed, kept fork-local, or reworked.
10. **Future hardening, deliberately not built:** the server-arbitrated exactly-once commit via a
    GM-owned ledger with deterministic **embedded** commit records, and the **keyed-object `xpLog`
    refactor** (would fix the system-wide whole-array write race, but is a breaking data-shape change
    requiring migration of every character in every world — **out of scope per D10**).

**Verification (Static):** GATE-LINT — **L1** on everything created, **L2** on every touched legacy
file, **L3** against the post-Stage-18 totals; commands in the shell spelling of §0.3 (Git Bash
`npx eslint …` / PowerShell `npx.cmd eslint …`). **GATE-MOCHA** (full suite: baseline failure set
unchanged, all new suites green). **GATE-CYPRESS** (final executed run, same `--env` invocation).
`git status` clean of stray files; the branch diff touches only files enumerated in this plan.
**Verification (Manual):** GATE-BOOT; one final end-to-end run as GM **and** as a player.
**Commit:** `docs(char-creator): user guide, GM disambiguation procedure, recorded limitations`

**Then stop.** Do not push. Report to the owner: branch name, per-stage commit list, the pinned
harness invocations and their baselines, the draft-size measurement and decision, and the ten
flag-back items.

---

## 3. Gate-to-stage matrix

| Stage | L1 (new files) | L2 (legacy files) | L3 | MOCHA | CYPRESS | BOOT | LIVE-WIZARD |
|---|---|---|---|---|---|---|---|
| 1 | — | baseline | baseline | baseline | **baseline (required to proceed)** | baseline | baseline |
| 2 | — | actor-ffg | ✓ | ✓ | **✓** | ✓ | ✓ |
| 3 | — | item-helpers | ✓ | ✓ | **✓** | ✓ | ✓ |
| 4 | — | actor-helpers | ✓ | ✓ | — | ✓ | ✓ |
| 5–8, 10–15 | ✓ | — | ✓ | ✓ | — | ✓ | ✓ |
| 9 | ✓ | item-helpers | ✓ | ✓ | — | ✓ | ✓ |
| 16 | — | partial-templates | ✓ | ✓ | — | ✓ | **✓ (the point)** |
| 17 | ✓ | — | ✓ | **✓ all-PARTS render** | — | ✓ | ✓ |
| 18 | — | **3 legacy files**: character-creator, swffg-main, partial-templates | ✓ (re-baseline) | ✓ | **✓ before + after** | **✓ (the gate)** | retired |
| 19–20 | ✓ | — | ✓ | ✓ | — | ✓ | n/a |
| 21 | — | as touched | ✓ | ✓ | **✓** | ✓ | n/a |
| 22 | ✓ | as touched | ✓ | ✓ | **✓** | ✓ | n/a |

## 4. Design §11 verification coverage map

| §11 area | Stage(s) |
|---|---|
| 1 — Wiring / static import smoke / harness | 1 (pin **all** harnesses + baselines), **18** (the real gate) |
| 2 — No-churn smoke (zero `temp actor`) | 11 (automated `game.actors.size`), **18** (manual) |
| 3 — Preview/final numeric parity | **19** |
| 4 — Canonical-projection parity fixture | 6 (unit), **19** (end-to-end) |
| 5 — Identity fixtures (R7-1) | 6 (unit + forced collision), **19** (preview↔commit) |
| 6 — Tree materialization fixtures | 3, 9 (unit), **19** |
| 7 — Non-GM player smoke (D3 + D9 / R7-2) | 14 (unit), **20** (two clients) |
| 8 — Draft lifecycle | 13 (unit + durability), **21** (end-to-end) |
| 9 — XP-log verification (read-only) | 4, 15 (unit), **21** (on the real actor) |
| 10 — Ruleset / pool / filter checks | 7, 8 (unit), **21** |
| 11 — Console-clean load | 18, **21** |
| 12 — Draft-size measurement (UTF-8 bytes) | **13** (measured + decided), 21 (confirmed) |
| — Partial registration / all-PARTS render | 16 (registration), **17** (render test), 18 (live) |

## 5. Issue-register coverage map

| ID | Stage |
|---|---|
| A (DB actor per keystroke) | 11, 18 |
| B (imperative jQuery/DataTables `_onRender`) | 16, 17 |
| C (duplicated preview/commit; 6 loaders) | 8, 10 |
| D (mutating cached Documents) | 7 (SelectionRef snapshots), 9, 16 (`.pill` in context) |
| E (`attr${Date.now()}` rank grants) | 9 |
| F (constructor socket-listener leak) | 15, 17 |
| G (no draft; cosmetic review) | 12, 13, 17 |
| H (dead ends: `myFormHandler`, TODO branch, `footer.html`, `.replace(" "," ")`) | 16, 17, 18 |
| BUG-1 (motivations `{item: Doc}`) | 9 |
| BUG-2 (`bonus[undefined]`) | 7, 21 |
| BUG-3 (`specName === Document`) | 7 (uuid matching), 19 |
| BUG-4 (raw HTML via `.text()`) | 5, 16 |
| N-1 (world careers, type `"careers"`) | 8, 21 |
| N-2 (unfiltered socket broadcasts) | 15, 20 |
| N-3 (bridge dies on first-GM logout) | 15, 20 |
| N-4 (gear has no world fallback) | 8, 21 |
| N-5 (extra specs/Force powers never materialize) | 9, 19 |
| N-6 (gear absent from preview) | 9, 19 |
| N-7 (tree AEs never synced) | 3, 9, 19 |
| Q-1 (`spendingCredits` never previewed) | 7, 10 |
| Q-2 (`2k_credits` → 2500) | 7 (verbatim), 22 (flag back) |
| **R7-1** (embedded id injectivity) | **6**, 19 |
| **R7-2** (ACK binding + GM-connect trigger) | **14**, 20 |

## 6. Standing constraints for every stage

1. **Never delete `modules/helpers/character-creator.js`.** It ends as a one-line shim.
2. **Never `git push`.** Commit per stage on the feature branch only.
3. **Never target `StarWarsFoundryVTT/StarWarsFFG`**; `upstream` is read-only. GitHub writes, if ever
   needed, go to `YeNov/StarWarsFFG` as the `YeNov` account.
4. **Never run `gulp css` / `npm run compile`.** The CSS here is hand-maintained and the SCSS has
   drifted; regenerating clobbers hand edits.
5. **Never edit a template, module or setting the still-live old code path consumes** before Stage 18
   (DEV-4). GATE-LIVE-WIZARD is the check.
6. **Never run Cypress against a live world.** Confirm Foundry is at `/setup` with no world active
   first (§0.3); invoke **only** with
   `--env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000` (**`--config
   baseUrl=…` and `CYPRESS_BASE_URL` do not work here** — `setupNodeEvents` overwrites them); and
   **never edit the tracked `cypress.env.json`**.
7. **Cypress is never waived.** A blocked environment halts work at that stage until repaired; there
   is no `NOT-APPLICABLE`, no owner-approval bypass, and no manual substitute in this plan. Any
   future waiver requires a fresh owner decision at that time.
8. **Do not clean pre-existing lint findings in legacy files** (DEV-7). New files are held to zero;
   legacy files are held to no-new-findings.
9. **`foundry.utils.randomID(16)`, never a bare `randomID`** (DEV-5).
10. **No per-keystroke persistence of any kind** — no actor writes, no socket traffic, no un-debounced
    flag writes.
11. **Never call `prepareData()` twice** on a preview actor without `reset()` first.
12. **Do not change the `xpLog` data shape and do not migrate existing logs** (D10). Entries are baked
    into the creation source and verified **read-only**.
13. **Make no atomic / exactly-once / never-overwrite claims** in code, comments, UI copy or docs. A
    top-level Actor create with `keepId: true` is an **upsert**.
14. **A registered Handlebars partial is not the same as a file on disk** — register it and prove it
    by rendering.
15. **Measure bytes with `TextEncoder`, not `String.length`** (Stage 13).
16. **Where the design leaves a question open, follow its stated default and flag it** (Stage 22).
17. Each stage's gates must actually be **run**, not assumed. A red gate is fixed inside that stage
    before committing — never carried forward.

---

## 7. Review response — plan v3 review (round 3)

All round-3 "prior-finding resolution" items are confirmed resolved and **carried into v4
unchanged**: GATE-LINT per the owner decision, the Stage 13 `TextEncoder` byte measurement, the
12-part `Object.keys(PARTS)` render enumeration, the `partial-templates.js:42-45` correction with the
`ffg-footer.html` protection, the boot-safe stage ordering (Stages 2–4 behaviour-neutral, Stage 9
additive, Stage 16 additive-only, Stage 17 unwired, Stage 18 atomic), and the gm-bridge
non-collision. **Only the three findings below were changed.**

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | **Blocker** | The Cypress URL override does not work: `cypress.config.js:9-13`'s `setupNodeEvents` unconditionally overwrites `config.baseUrl` from `config.env.baseUrl` **after** config resolution, so `--config baseUrl=…` (and `CYPRESS_BASE_URL`) are silently defeated by the tracked `cypress.env.json` → `http://chimaera:10101`. The safety pre-flight therefore checked localhost while the destructive specs could visit another host. | **FIXED.** Verified the hook and the tracked env file directly. Every invocation in the plan is now `npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000` (PowerShell: `npx.cmd …`), with the mechanism explained in §0.3 so nobody reintroduces the config-level form. **`CYPRESS_BASE_URL` is removed entirely.** Occurrences updated: §0.3 (invocation + shell table), Stages 1, 2, 3, 18 (pre-flight and post-edit), 21, 22, and standing constraint §6-6. **Added the fail-closed guard (DEV-9):** Stage 1 now installs a root-level `before()` in `cypress/support/e2e.js` — the support file Cypress loads ahead of every spec, so it runs **before `cy.setup()`, `cy.join()`, or either entity-creation spec** — asserting `Cypress.config("baseUrl") === Cypress.env("expectBaseUrl")` and **throwing if `expectBaseUrl` is absent**. It fails closed in both directions and aborts the run rather than proceeding. This is a deliberate one-hunk edit to a tracked file, distinguished in DEV-9 from `cypress.env.json` (which stays untouched because changing it would silently redirect anyone's run), committed at Stage 1 and flagged to the owner at Stage 22-9. |
| 2 | **Blocker** | The plan says Cypress "is not waivable" but embeds escape hatches: `BLOCKED-BY-ENVIRONMENT` convertible at Stage 18 by owner approval plus manual substitutes; `NOT-APPLICABLE` with owner approval; Stage 1 permitting a blocked result and continuing; a Stage 1 pass condition of "result set **or** recorded block"; a Stage 18 bypass. Stages 2 and 3 declare Cypress mandatory but would have no baseline to compare against. | **FIXED — every waiver path removed.** §0.3 now states the gate "cannot be waived, substituted, or marked not-applicable anywhere in this plan," and that any future waiver needs a **fresh owner decision taken at that moment, not a path pre-authorised in this document**. Concretely: **`NOT-APPLICABLE` is deleted** as a status; **`BLOCKED-BY-ENVIRONMENT` is now purely diagnostic and HALTS PROGRESS** — "never a pass", not inheritable by later stages; the **Stage 18 owner-approval bypass and manual substitution are deleted** (the pre-flight now reads "mandatory, no bypass… work stops here until the environment is repaired"); **Stage 1's pass condition is changed to "a real result set is captured — otherwise stop,"** with "no later stage may begin against an absent Cypress baseline," which also repairs the Stage 2/3 comparison hole; the cadence table is annotated to require an **actually executed** result at every entry, and Stage 1's row reads "required to proceed". **Also added as instructed:** Stage 1 step 5 now states explicitly that these three upstream specs **have never been run against this fork** and may be red on the untouched tree; if so, **record the exact failures, stop, and put the choice to the owner before Stage 2** — adopt the red baseline as the comparison reference, or repair the specs as separately scoped work — with "do not silently adopt a red baseline, and do not discover this at the Stage 18 cutover." |
| 3 | **Minor** | Stage 18 says "all four touched legacy files" and the §3 matrix says "4 legacy files"; it modifies **three**. The deleted template tree is outside ESLint's `modules` scope, and `socket-bridge.js` was created at Stage 15 (an L1 new file, not an L2 legacy file). | **FIXED.** Stage 18's file list is renumbered 1–3 and **names the three paths explicitly** — `modules/helpers/character-creator.js`, `modules/swffg-main.js`, `modules/helpers/partial-templates.js` — followed by a call-out stating these are "the complete L2 set for this stage" and giving both exclusion reasons (template tree outside `modules`; `socket-bridge.js` created at Stage 15, governed by L1). Stage 18's verification item 1 now names the same three paths for the L2 comparison, and the §3 matrix cell reads "**3 legacy files**: character-creator, swffg-main, partial-templates" instead of "4 legacy files". |
