# PC Wizard rewrite — Implementation Plan v10

| | |
|---|---|
| **Status** | Draft v10 — supersedes v1–v9. Addresses the [round-8 review](pc_wizard_implementation_plan_review_v9.md) (1 Blocker: Path B ran Cypress three times before its mandatory `/setup` pre-flight), plus a full ordering sweep of every Cypress invocation in the document (§8). **Everything else in v9 is accepted and carried forward unchanged.** |
| **Date** | 2026-07-20 |
| **Authorities** | [Requirements brief v2](../pc_wizard_requirements_brief.md) (BINDING) · [Design doc v7](pc_wizard_design_doc_v7.md) (APPROVED) · [Design review v7](pc_wizard_design_doc_review_v7.md) (READY; R7-1, R7-2 folded in) |
| **Repo** | `D:\SW FFG\Portable FVTT\Data\systems\starwarsffg` — git, branch **`pc-wizard-rewrite`** (off `main` at `a1621c00`; planning docs committed as `ce76311e`). Remote `YeNov/StarWarsFFG`. `upstream` is read-only. **Never** target `StarWarsFoundryVTT/StarWarsFFG`. |
| **Reference** | Foundry v13 core, read-only: `D:\SW FFG\Portable FVTT\App\resources\app` |

---

## 0. How to use this plan

- All paths are **repo-relative** to `D:\SW FFG\Portable FVTT\Data\systems\starwarsffg` unless
  written absolute.
- Stages are ordered so **the system boots and the currently-live wizard keeps working at every
  stage boundary**. The single cutover is **Stage 18**.
- Every stage ends with: its named gates pass → **`git commit`**. **Never `git push`.**
- **Stages 1–22 are agent-executable**, with **one exception**: Stage 18 ends at
  **`GATE-CUTOVER-BOOT`**, a ~10-minute human checkpoint that **blocks Stage 19** (§0.4).
- **Stage 1H (human) is MANDATORY and must complete before Stage 2** — by either of its two paths
  (§0.10). Every other Foundry-dependent check is batched into **Stage 23**.
- **Stage 1 step 0 commits the DEV-9 Cypress safety guard before any Cypress command is ever run**
  (§0.11), and **every Cypress invocation obeys the ordering invariant in §0.12**.

### 0.1 The structural finding this architecture answers

v4 classified `GATE-MOCHA` as "Static" via a parenthetical ("no world needed, **or the in-browser
harness**") that collapsed the distinction. Verified: `tests/ffg-tests.js:1-2` imports mocha and chai
by **browser** ESM path; `:16` extends V1 `FormApplication`; mocha is constructed and run inside
`getData()` (`:32-33`), so it executes **only on render, in a live world, as GM, typed into an F12
console by a person**. The gate appeared **25 times**. Consequence: **no stage in v4 was verifiable
or committable by an implementing agent.**

**Owner decisions in force:** add a Node-runnable tier covering what is genuinely feasible (v5);
batch the rest into one human stage (v5); pull one small blocking boot check forward to Stage 18
(v6); keep default Node test isolation (v7).

### 0.2 ⚠ THE ACCEPTED TRADE — read this before starting

**Stages 2–17 are committed without any human loading the system in Foundry.** That exposure is real,
but it is **bounded at Stage 18** rather than running unchecked to Stage 23.

Stage 18 deletes the live wizard's 1846-line implementation, installs the compatibility shim, rewires
the socket bridge, and deregisters template preloads. It is the only stage that can leave the tree
unbootable, and the **last** stage whose failure is cheap to diagnose. Therefore:

- **Stage 18 ends at `GATE-CUTOVER-BOOT` (§0.4): a mandatory ~10-minute human check that the system
  loads, the entry button opens the new wizard, all nine tabs render, and the console is clean.
  Stage 19 may not begin until it passes.** Everything from Stage 19 onward assumes a working system;
  a boot break found later presents as a mysterious test failure with seventeen unverified commits
  behind it, instead of an obvious cutover mistake with a one-stage bisect surface.
- **What this bounds:** module resolution (the specific failure a broken shim produces), entry-point
  wiring, tab/PARTS composition, and Handlebars partial **registration** — the last of which
  `GATE-IMPORTS` **cannot** see, because a path can resolve on disk and still be unregistered.
- **What this does NOT bound — the warning stays honest.** `GATE-CUTOVER-BOOT` proves the system
  *runs*; it proves nothing about whether the build output is *correct*. Preview/final stat parity,
  effect transfer, tree materialization, draft persistence, the socket round-trip and the commit
  upsert are all unverified until **Stage 23**. A silent correctness defect from Stages 2–17 still
  surfaces late, with a wide bisect surface.
- **`GATE-LIVE-WIZARD` is retired, not deferred.** "The old wizard still works" can only be checked
  *while the old wizard exists*, i.e. before Stage 18 — and no human is present then. Its protection
  is carried by **ordering discipline** (DEV-4: Stages 5–17 are additive-only) and by
  `GATE-IMPORTS`. `GATE-CUTOVER-BOOT` partially restores what this gave up, but it **cannot
  retroactively prove the old wizard still worked at Stage 12**.
- **Injected production wiring is a known blind spot of the Node tier** (DEV-16, §0.6.5): tests pass
  fakes, so the *real* binding is exercised for the first time at Stage 18's render and asserted
  explicitly at Stage 23 §7.3. This is designed for, not accidental.

**`GATE-IMPORTS` is the only automated defence against the boot-breaking class**, so it is specified
as strongly as a static checker can be (§0.4). Keep it strong; do not weaken it to make a stage pass.

### 0.3 Deviations from design doc v7, recorded up front

| # | Design says | Plan does | Why |
|---|---|---|---|
| DEV-1 | New partials named `*.hbs` | New partials named `*.html` | The existing wizard template tree is **all `.html`**. AppV2 `PARTS` reference full paths. The only `.hbs` kept is core's `templates/generic/tab-navigation.hbs`. |
| DEV-2 | §5.5.8 `embedId16(seed)` = non-cryptographic fold over a seed containing the index | Injective index encoding (13-char prefix + 3-char base-62 index) | **R7-1**, binding — Stage 6. |
| DEV-3 | §5.9 `startNoticeAck {sessionNoticeId}`; triggers = render/30 s/pre-commit | ACK carries `requesterId`; `userConnected` hook added; pending map cleaned on ACK **and** close | **R7-2**, binding — Stage 14. |
| DEV-4 | §4 file map rewrites `templates/wizards/char_creator/` **in place** | New templates at **`templates/wizards/pc_wizard/`**; the legacy tree deleted **atomically at Stage 18** | The live `CharacterCreator.PARTS` names `char_creator/header.html` and `tabs/*.html` at `modules/helpers/character-creator.js:12-45`. **Doubly important**: with no per-stage human check, additive-only ordering is the *only* thing protecting the live wizard. |
| DEV-5 | Design and earlier plans write `randomID(16)` | **`foundry.utils.randomID(16)`** everywhere | Verified: **zero** bare `randomID(` call sites in `modules/`; **22** namespaced. A bare call is a `ReferenceError` — and **ESLint will not catch it**, because `eslint.config.mjs` declares `randomID: "readonly"`. The Stage 7 Node test is the guard. |
| DEV-6 | §11 says stages verify with lint and "the existing test suite" | Gates defined measurably in §0.4, over a **non-clean** lint baseline | "Lint clean" is unreachable (measured: **608 problems — 97 errors, 511 warnings**). |
| DEV-7 | — | Lint on **modified legacy files** is a **baseline-delta** gate | **Owner decision (round 2).** |
| DEV-8 | — | Cypress runs against a **throwaway self-provisioned local world**, never the campaign world, and is **non-waivable** | **Owner decision (rounds 2–3).** Executed at **Stage 23**. |
| DEV-9 | — | Fork-local fail-closed `baseUrl` guard in `cypress/support/e2e.js` | **Present in the working tree but UNCOMMITTED** (` M cypress/support/e2e.js`) — **Stage 1 step 0 commits it**, and **Stage 1H Path B copies it into the `a1621c00` worktree**, which does not contain it. §0.11. |
| DEV-10 | — | **A Node-runnable test tier** (`node --test`, `tests/node/**/*.test.mjs`) is the agent's per-stage gate | **Owner decision (v5).** Node **v24.15.0** verified. |
| DEV-11 | — | **`modules/package.json` = `{"type":"module","private":true}`** | §0.5. |
| DEV-12 | — | Several design modules are **split into a pure core + an I/O shell** | §0.6. |
| DEV-13 | — | **Stage 18 ends at a blocking ~10-minute human boot check** | **Owner amendment (v6).** §0.2, §0.4. |
| DEV-14 | — | **`modules/helpers/xp-entry-builders.js`** — a new, genuinely pure module holding the XP entry builders | **Round-5 Blocker 2, proven.** §0.6.1. |
| DEV-15 | — | **`toItemData` receives the tree materializer by injection**, and **`applyBuild` receives creation defaults, `applyCharacteristicDeltas` and `toItemData` by injection — unconditionally** | §0.6.1's import sweep. |
| DEV-16 | — | **One composition root (`pc-wizard.js`) plus a pure `build-deps.js` factory**; **`preview.js` consumes injected dependencies** | **Round-6 Finding 3.** §0.6.5. |

### 0.4 Verification gates

#### Shell spellings — normative, stated once

| Command | **Git Bash** (verified working) | **PowerShell** |
|---|---|---|
| eslint | `npx eslint modules` | `npx.cmd eslint modules` |
| npm scripts | `npm test` / `npm run check:imports` | `npm.cmd test` / `npm.cmd run check:imports` |
| Cypress | `npx cypress run --env …` | `npx.cmd cypress run --env …` |
| Playwright | `npx playwright test --list` | `npx.cmd playwright test --list` |

**Under PowerShell the bare `npm` / `npx` shims are blocked by execution policy.** Use `.cmd` there.

#### GATE-LINT — three parts (owner-decided, DEV-7)

Measured repo baseline: **608 problems — 97 errors, 511 warnings**; nonzero exit. ESLint covers
**`modules` only**.

- **L1 — new files: zero findings (hard gate).** Includes `modules/helpers/xp-entry-builders.js`
  (DEV-14) and `modules/char-creator/build-deps.js` (DEV-16).
- **L2 — modified legacy files: no NEW finding identities (hard gate).** Diff finding identities
  against the Stage 1 per-file baseline. **Introducing a new finding fails. Inheriting one does not.**
  > **Do not clean the legacy files as part of this work** — an explicit owner decision.
- **L3 — repo-wide ceiling.** Totals must not exceed **97 errors / 511 warnings**.

**Per-file baselines** — Stage 1 is **already done** for these:

| File | Modified at | **Measured baseline** |
|---|---|---|
| `modules/actors/actor-ffg.js` | Stage 2 | 0 errors, 8 warnings |
| `modules/helpers/item-helpers.js` | Stages 3, 9 | 2 errors, 4 warnings |
| `modules/helpers/actor-helpers.js` | Stage 4 | 1 error, 4 warnings |
| `modules/helpers/partial-templates.js` | Stages 16, 18 | **0 errors, 0 warnings** |
| `modules/swffg-main.js` | Stage 18 | 7 errors (+ warnings) |
| `modules/helpers/character-creator.js` | Stage 18 (→ shim) | **11 errors, 20 warnings** |

#### GATE-NODE — the automated test tier (DEV-10) — the agent's primary gate

```json
"test": "node --test \"tests/node/**/*.test.mjs\""
```

- **The quoted glob is required.** A bare directory positional (`node --test tests/node/`) is treated
  as a *module* and fails with `ERR_UNSUPPORTED_DIR_IMPORT`; Node expands the quoted glob itself, and
  `**` matches nested files.
- **Default (per-file child-process) isolation is retained — do NOT add `--test-isolation=none`.**
  Measured on this platform: `node --test "./*.test.mjs"` → `pass 1`,
  `node --test "./**/*.test.mjs"` → `pass 2`. A reported `spawn EPERM` was an artifact of a
  read-only review sandbox. Sharing one process and module cache would introduce **real cross-test
  leakage** to solve a problem that does not exist here.
- **Pass condition:** every test passes; **zero failures and zero unexpected skips**. No inherited
  baseline — this tier starts empty at Stage 1 and only grows, so its bar is absolute.
- A stage that adds a Node-testable module **must** add its tests in the same stage.
- **Stage 1 must prove this exact npm script runs green in the implementing agent's shell**, and
  **record which isolation mode it ran under**.

#### GATE-IMPORTS — static resolution, template references, and the Node-purity allowlist

```bash
npm run check:imports                 # Stages 1–17
npm run check:imports -- --cutover    # Stage 18 onward (activates rule 6)
```

A **non-executing** static checker (parse and resolve only — it must never `import()` system code).
It walks `modules/**/*.js`, `tests/**/*.js`, `tests/node/**/*.mjs` and `templates/**/*.html`, and
**fails on any of**:

1. **Relative import specifier that does not resolve to an existing file.** Covers static
   `import … from "…"`, `export … from "…"`, and `import("…")` with a literal argument. Resolution
   is **exact-path, extension required** — the browser serves these over HTTP and does **not** do
   Node-style extensionless resolution, so a missing `.js` is a real boot failure. *This catches the
   Stage 18 class: `swffg-main.js:58` → `./helpers/character-creator.js`.*
2. **Absolute Foundry-style specifier** (`/systems/starwarsffg/…` or `systems/starwarsffg/…`) in a
   JS string literal that does not resolve under the repo root — covers `PARTS[*].template`,
   `PARTS[*].templates[]`, and the `partial-templates.js` preload list.
3. **`{{> "…" }}` partial reference** in any `templates/**/*.html` that does not resolve.
4. **Bidirectional preload cross-check:** every `{{> … }}` target under `templates/wizards/pc_wizard/`
   appears in `modules/helpers/partial-templates.js`'s `templatePaths`, **and** every `pc_wizard`
   path in that list exists on disk.
5. **Bare (non-relative, non-Foundry) specifiers in `modules/**`** — there are none today.
6. **Shim assertion — INACTIVE by default, ACTIVE only under `--cutover`.**
   `modules/helpers/character-creator.js` exists, is a **single named re-export line**, and names
   `CharacterCreator`. **From Stage 18 onward every invocation uses `--cutover`.**
   *Rationale for a flag rather than a heuristic:* activating "when the file already looks like a
   shim" would let a **malformed** shim silently skip the assertion. **The activation condition has
   its own Node tests** (Stage 1).
7. **Node-purity allowlist (DEV-15/DEV-16).** Every module in the §0.6.2 **Covered** table may import
   **only** from the frozen closure in **§0.6.4**. Any other import — in particular anything reaching
   `modules/helpers/modifiers.js`, `modules/helpers/item-helpers.js`,
   `modules/helpers/actor-helpers.js`, `modules/actors/actor-ffg.js`,
   `modules/char-creator/enrich.js` or `modules/apps/*` — **fails the gate**, and **the check is
   transitive over the whole Covered closure**. **Rule 7 has its own negative tests**
   (`tests/node/check-imports-purity.test.mjs`, Stage 1).

**Pass condition (DEV-17 — baseline-delta, mirroring GATE-LINT):** **zero findings that are not
pinned in `baselines/imports-baseline.txt`.** Run at **every** stage.

Rationale for the amendment (2026-07-20, owner decision): the original condition was *"exit 0, zero
findings"*. That is the same unreachable-absolute-zero defect `GATE-LINT` already cost two Blocker
rounds to fix — and it went unnoticed here only because the checker did not exist until Stage 1, so
nobody could observe that the untouched tree is **not** clean. `GATE-IMPORTS` is repo-wide by design
(it is the Stage 18 boot defence), so it necessarily surfaces pre-existing defects in code this
feature never touches. Blocking the rewrite on those is not rigour.

**Pinning rules — narrow by construction, so nothing is blinded:**

- A pin is an **exact `rule:file:line` triple**, never a rule-wide or file-wide suppression. Rule 2
  keeps running everywhere and would still catch a *second* `template.json`-shaped defect tomorrow.
- **Every pin must carry a tracking issue reference.** A finding with no issue is not pinnable.
- The gate **fails** if a pinned finding changes, moves, multiplies, or **disappears** — a vanished
  pin means the tree changed under the baseline and the pin must be re-verified, not silently kept.
- **Only findings confirmed as real, pre-existing, and out of scope may be pinned.** A finding
  caused by a checker bug is **fixed, never pinned** — that rule caught 30 false positives on the
  first genuine run and is unchanged.

**Pinned at Stage 1 (one entry):**

| rule | location | issue | why out of scope |
|---|---|---|---|
| 2 | `modules/importer/import-helpers.js:2961` | [#29](https://github.com/YeNov/StarWarsFFG/issues/29) | `ImportHelpers.getTemplate()` fetches `template.json`, deleted by `c8d29d86`. Live defect in the **Adversaries importer** (`swa-importer.js:573`, armed adversaries only) — unrelated to this feature, needs a DataModel-derived replacement, unverifiable without a running world. |

> **Known blind spot, and why `GATE-CUTOVER-BOOT` exists:** rule 4 proves a partial is *listed*, not
> that Handlebars *registered* it at runtime. Only a real render catches that.

#### GATE-CUTOVER-BOOT — **HUMAN, BLOCKING, Stage 18 only** (DEV-13)

Roughly ten minutes at a running Foundry world.

1. **The system loads.** No `Failed to resolve module specifier` and **no module-resolution error
   anywhere in the console**.
2. **The `#ffgCharacterWizard` button appears** and **opens the new wizard**.
3. **It opens on the `background` tab, there is no `rules` tab, and all nine tabs render** without
   "partial not found". *This catches an unregistered Handlebars partial, which `GATE-IMPORTS`
   structurally cannot see.*
4. **The console is clean** against `baselines/console-baseline.txt` — produced by **Stage 1H, which
   is mandatory** precisely so this check has its input (§0.10).

**Normative properties:** blocking and non-deferrable; **not** batched into Stage 23; work **stops**
until a human runs it; **no agent substitute, no owner-approval bypass, no "proceed and check
later"**; **Stage 18 cannot be committed until it passes**; **Stage 19 may not begin until it
passes**; a failure is **fixed at Stage 18**. **This gate does not grow.**

#### GATE-BOOT · GATE-MOCHA · GATE-CYPRESS · GATE-PLAYWRIGHT · all other manual smoke — **Stage 23 only**

Defined in **§7**. **`GATE-LIVE-WIZARD` is retired and appears nowhere as a gate** (§0.2).

### 0.5 The ESM mechanism for Node (DEV-11)

Node decides a `.js` file's module type from the **nearest parent `package.json`**. The root
`package.json` has no `type`.

**What actually happens today, measured:** Node v24 does **not** hard-fail. It **detects** the ESM
syntax, **reparses** the file as an ES module, and emits `MODULE_TYPELESS_PACKAGE_JSON`; the import
**succeeds**.

**The nested `modules/package.json` = `{"type":"module","private":true}` is still correct:** it makes
the ESM boundary **explicit and deterministic**, removes heuristic reparsing from every test run, and
keeps warning noise out of `GATE-NODE` output.

**Do NOT add `"type": "module"` to the root `package.json`.** Verified: `gulpfile.js:1-4` and
`cypress.config.js:1,3` are CommonJS. Root-level `type: module` breaks **`cypress.config.js`** — the
file GATE-CYPRESS depends on for its `setupNodeEvents` override — and the gulp build.

Why `modules/package.json` rather than the narrower `modules/char-creator/package.json`: `modules/`
contains **zero** `require(` or `module.exports`; `to-item-data.js` needs `AE_MODES` from
`modules/config/`; and blast radius outside Node is nil. The narrower option remains the documented
fallback, flagged at Stage 22.

### 0.6 What the Node tier covers — and what it honestly does not

#### 0.6.1 The import-graph sweep

**Method.** The transitive import graph was traced **statically**, by reading the first import lines
of each candidate module and following every edge to a fixed point. *(Stage 1 converts this into an
executed check and records it.)*

**The poison root:** `modules/apps/ffg-form-application.js:1` —
`const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;` — evaluated at
**module load**. Anything reaching it is Node-unimportable.

| Module | Chain | Verdict |
|---|---|---|
| `modules/apps/ffg-form-application.js` | `:1` reads `foundry.applications.api` at load | **POISON ROOT** |
| `modules/popout-modifiers.js` | `:2` → `apps/ffg-form-application.js` | **POISONED** |
| `modules/helpers/modifiers.js` | `:2` → `popout-modifiers.js` | **POISONED** |
| `modules/helpers/actor-helpers.js` | `:1` → `modifiers.js` | **POISONED** |
| `modules/helpers/item-helpers.js` | `:2` → `modifiers.js` | **POISONED** |
| `modules/actors/actor-ffg.js` | `:2` → `modifiers.js` (also `:1` → `popout-editor.js`) | **POISONED** |
| `modules/config/ffg-active-effect-modes.js` | **no imports at all** | **CLEAN** |
| `modules/config/ffg-character-creator.js` | **no imports at all** | **CLEAN** |

**Consequences, all designed for:** the XP builders move to a pure module (**DEV-14**); the tree
materializer and the characteristic-delta/creation-defaults collaborators are **injected**
(**DEV-15**); and the production wiring that injection creates is given one composition root and a
pure, tested factory (**DEV-16**). **Rule 7 enforces the boundary automatically.**

#### 0.6.2 Covered

| Module | Node-tested content | Stage |
|---|---|---|
| `constants.js` | Flag keys, socket channel/event names, `DRAFT_SCHEMA_VERSION`, timeouts. Pure; **imports nothing**. Tested for stable values and non-collision with gm-bridge's event names. | 5 |
| `calculators.js` | `calcXp` / `calcCredits` / `calcObligation` — pure. | 5, 7 |
| `starting-bonus.js` | Every `rules × choice` cell; **BUG-2 regression fully automated**. | 7 |
| `wizard-state.js` | `createInitialData()` through the minimal stub: `commitId` shape (the DEV-5 guard), `selected.rules` default `"fad"`, `grants.gm.credits` and `initial.*` seeded from stubbed `game.settings.get`, `spendingCredits` rolled **once**, the `SelectionRef` shape; plus each mutator's pure state transition. **Not covered:** anything touching real world settings. | 7 |
| `build-item-schema.js` | `projectItemSource` **and the full R7-1 identity layer** — injectivity, forced collision, index range, integrity assertion, determinism. `crypto.subtle` is **native in Node 24**. | 6 |
| `source-descriptors.js` (split, DEV-12) | The descriptor table, `isSourceEnabled`, `sourceIdOf`, unknown-`poolKey` throw. **N-1 / N-4 / Force-power regressions automated.** | 8 |
| `helpers/xp-entry-builders.js` (DEV-14) | Builder output shape and the `action`/`description` field mapping. **Genuinely importable — imports nothing.** | 4 |
| `to-item-data.js` (materializer **injected**) | Category mapping, deterministic rank grants, duplicate purchases, non-mutation, **N-5**; the injected materializer is called with the expected arguments. | 9 |
| `build-deps.js` (DEV-16) | `makeBuildDependencies({…})` — the adapter threads the real materializer into every call; `creationDefaults` comes from `getActorCreationDefaults("character")`; a missing or non-callable collaborator **throws**. **Imports nothing.** | 10 |
| `apply-build.js` (all collaborators **injected**) | The whole build against fixtures. | 10 |
| `validate.js` | All step/warning logic. **Binding: returns i18n *keys*, never localized strings.** | 12 |
| `draft-schema.js` (split, DEV-12) | Serialization, schema-version handling, migrations, corrupt-draft refusal, the **byte-size measurement helper**. | 13 |
| `notify-policy.js` (split, DEV-12) | **R7-2 decision logic**. **R7-2 cases 1–5, 7, 8 automated.** | 14 |
| `commit-normalize.js` (split, DEV-12) | `normalizeCommitSource` determinism, the baked XP entries and their mapping, the fingerprint, the request sanitizer. | 15 |

#### 0.6.3 NOT covered — with the residual risk

| Not covered | Why | Residual risk |
|---|---|---|
| `getActorCreationDefaults` / `applyCharacteristicDeltas` (`actors/actor-ffg.js`) | **Proven poisoned** (§0.6.1). Behaviour exercised in Node only through injected fixtures. | Wrong prototype-token/default-image/base-stat math, caught only at Stage 23 parity. |
| `reconcileTreeEffects` / `materializeTreePurchases` (`helpers/item-helpers.js`) | **Proven poisoned.** `to-item-data.js` tests the *contract* through an injected fake. | Tree-effect reconciliation regressions surface only at Stage 23. |
| `actor-helpers.js` delegation to the new builders | **Proven poisoned.** | XP-log write-path regressions surface only at Stage 23. |
| **The production dependency binding itself** (DEV-16) | Node tests pass **fakes**; `pc-wizard.js` is the only place the real four collaborators meet, and it is not importable. | A wrong-but-callable collaborator would produce a silently wrong build. **Explicitly asserted at Stage 23 §7.3.** |
| `preview.js`, `pc-wizard.js`, `enrich.js`, all templates | `CONFIG.Actor.documentClass`, ApplicationV2, DOM, `DOMParser`, `TextEditor`. **Not simulable.** | The parity spike and **BUG-4** are Stage 23 concerns. Rendering is partially bounded by `GATE-CUTOVER-BOOT` check 3. |
| `draft-store.js` I/O shell, `commit-service.js` `commitBuild`, `socket-bridge.js`, `notify.js` shell, `load-source.js` | `game.user.setFlag`, `Actor.create`, `game.socket`, `ChatMessage`, `Hooks`, `game.packs`. | Persistence, the commit upsert, the socket round-trip and the `userConnected` wiring (R7-2 case 6) are unverified until Stage 23. |
| Boot and partial registration at render | Requires Foundry. **`GATE-CUTOVER-BOOT` is the real check.** | Bounded at Stage 18 (§0.2). |

**Summary of the residual:** the Node tier covers **pure computation** — where **R7-1, BUG-1 through
BUG-3, and N-1/N-4/N-5** live. It covers **none of the integration surface**: preparation, effect
transfer, **DOM and rich text (BUG-4)**, persistence, sockets, **and the production wiring of the
injected seams**.

#### 0.6.4 The frozen rule-7 closure — full import-intent audit

| Covered module | Intended direct imports | Allowed by rule 7? |
|---|---|---|
| `constants.js` | *(none)* | ✔ |
| `helpers/xp-entry-builders.js` | *(none)* | ✔ |
| `build-deps.js` | *(none — all four collaborators are parameters)* | ✔ |
| `starting-bonus.js` | *(none)* | ✔ |
| `build-item-schema.js` | *(none)* | ✔ |
| `calculators.js` | `starting-bonus.js` | ✔ Covered→Covered |
| `wizard-state.js` | `constants.js` | ✔ Covered→Covered |
| `source-descriptors.js` | `constants.js` | ✔ Covered→Covered |
| `to-item-data.js` | `build-item-schema.js`, `constants.js`, **`config/ffg-active-effect-modes.js`** | ✔ (named external exception; verified import-clean) |
| `apply-build.js` | `calculators.js` | ✔ *(defaults, deltas and `toItemData` arrive injected — DEV-15)* |
| `validate.js` | `calculators.js`, `constants.js` | ✔ Covered→Covered |
| `draft-schema.js` | `constants.js` | ✔ Covered→Covered |
| `notify-policy.js` | `constants.js` | ✔ Covered→Covered |
| `commit-normalize.js` | `build-item-schema.js`, `constants.js`, **`helpers/xp-entry-builders.js`** | ✔ (named external exception) |

**Explicitly NOT in the closure**: `enrich.js`, `load-source.js`, `draft-store.js`, `notify.js`,
`commit-service.js`, `socket-bridge.js`, `preview.js`, `pc-wizard.js`, and every poisoned module.

**The two named external exceptions must themselves stay import-clean.** Rule 7 asserts this: if
either ever gains **any** import, the gate fails.

#### 0.6.5 DEV-16 — one composition root, and where the real binding is verified

**One composition root: `modules/char-creator/pc-wizard.js`.** `preview.js` consumes injected
dependencies and imports nothing poisoned.

```js
// modules/char-creator/build-deps.js — Covered, imports nothing.
export function makeBuildDependencies({
  getActorCreationDefaults, applyCharacteristicDeltas, materializeTreePurchases, toItemData,
}) {
  for (const [name, fn] of Object.entries({
    getActorCreationDefaults, applyCharacteristicDeltas, materializeTreePurchases, toItemData,
  })) {
    if (typeof fn !== "function") throw new MissingCollaboratorError(name);
  }
  return {
    creationDefaults: getActorCreationDefaults("character"),
    applyCharacteristicDeltas,
    // materializeTree wins over any caller-supplied option — the binding is not overridable.
    toItemData: (ref, options = {}) =>
      toItemData(ref, { ...options, materializeTree: materializeTreePurchases }),
  };
}
```

```js
// modules/char-creator/pc-wizard.js — THE composition root, once per instance.
import { getActorCreationDefaults, applyCharacteristicDeltas } from "../actors/actor-ffg.js";
import ItemHelpers from "../helpers/item-helpers.js";
import { toItemData } from "./to-item-data.js";
import { makeBuildDependencies } from "./build-deps.js";

this.#buildDeps = makeBuildDependencies({
  getActorCreationDefaults,
  applyCharacteristicDeltas,
  materializeTreePurchases: ItemHelpers.materializeTreePurchases,
  toItemData,
});
```

**Verification, layered:**

1. **Node (Stage 10):** `build-deps.js` is Covered — the adapter threads the real materializer,
   a caller option cannot override it, `creationDefaults` comes from
   `getActorCreationDefaults("character")`, and a missing/non-callable collaborator **throws**.
2. **Residual:** the root could pass a *wrong but callable* function. **Asserted at Stage 23 §7.3**:
   in the **preview**, purchasing a talent node and a Force-power upgrade must change derived stats.
   Only the **real** `materializeTreePurchases` produces synced effects; a bad binding leaves the
   node **stat-inert** — exactly N-7's original symptom.

#### 0.6.6 The minimal Foundry stub — and its enforced boundary

`tests/node/_stub/foundry-stub.mjs`, imported first by every Node test. It stubs **only**:
`globalThis.foundry.utils` (`randomID`, `deepClone`, `mergeObject`, `duplicate`, `getProperty`,
`setProperty`, `isEmpty`); `globalThis.CONFIG.FFG.characterCreator` (the real table if Stage 1
confirms `modules/config/ffg-character-creator.js` imports cleanly, else a hand-checked fixture);
`globalThis.CONST.DOCUMENT_OWNERSHIP_LEVELS`; and a minimal `globalThis.game`
(`user`, `users.activeGM`, `settings.get`, `i18n.localize(k) => k`).

**It must NOT stub** `Actor`, `Item`, `ActiveEffect`, `ChatMessage`, `Hooks`, `game.socket`,
`game.packs`, `fromUuid`, `ui.notifications`, `TextEditor`, `foundry.applications.*`, or any DOM API.

**`tests/node/stub-boundary.test.mjs` — a mandatory meta-test (Stage 1):** declares the exact
allowlist; **fails** if any forbidden global is installed; **statically scans every file under
`tests/node/`, including `_stub/`**; and re-asserts the live global surface at runtime.

> **Why this exists even under default isolation:** per-file child processes already prevent
> cross-file leakage. The boundary check's real job is stopping someone from **quietly widening the
> stub to force a poisoned legacy module through and then claiming coverage**.

**The rule this encodes:** if a Node test would require stubbing one of the forbidden names, **stop
and route the check to Stage 23** — never grow a Foundry simulator.

### 0.7 Baseline durability

```
superpowers/docs/plans/PcWizard/baselines/
    lint-baseline.json            lint-baseline-<file>.json      (six per-file files)
    node-baseline.txt             imports-baseline.txt           node-coverage.md
    mocha-baseline.json           console-baseline.txt           cypress-baseline.txt
    playwright-inventory.txt      cutover-boot-result.md         stage23-results.md
```

**These files are committed** (not gitignored). They are the evidence trail for every gate
comparison.

### 0.8 The load-bearing ordering constraint (design §4, §11-1)

`modules/helpers/character-creator.js` **must not be deleted**. Exactly two files import that
specifier: `modules/swffg-main.js:58` (constructed at `:1438-1465`) and
`tests/v2-migration/minimized-close.test.js:12`. Deleting it breaks ES-module resolution and **the
entire system fails to boot** — the failure `GATE-CUTOVER-BOOT` check 1 exists to catch. It survives
Stage 18 as a one-line shim:

```js
export { CharacterCreator } from "../char-creator/pc-wizard.js";
```

Both importers stay **unchanged**. The minimized-close behaviour at
`modules/helpers/character-creator.js:199-202` must be **preserved verbatim** in the new
`pc-wizard.js`. NB: the assertions in `minimized-close.test.js:17-55` do **not** currently exercise
that behaviour — the suite is baselined RED on stale setup (§7.2, owner decision 2026-07-21). The
shim-resolution protection survives (see §7.2); the behaviour itself is only re-verified live at the
Stage 18 `GATE-CUTOVER-BOOT` render check.

> **Do not confuse these with unrelated files that legitimately survive:**
> `modules/config/ffg-character-creator.js` and `modules/helpers/gm-bridge.js` (which mentions
> `character-creator.js` **in a comment** at `:122`). Stage 18's gate searches the **exact import
> specifier**, not the substring.

### 0.9 Coexistence with the existing GM bridge

`modules/helpers/gm-bridge.js` **already owns a listener** on the same socket channel:
`FFG_SOCKET = "system.starwarsffg"` (`:21`), registered by `registerGMBridge()` (`:119-125`), called
from `modules/swffg-main.js:1577`. Its handler **returns immediately unless
`game.user.id === game.users.activeGM?.id`** (`:126`) and dispatches on `data?.event` with
`ffgApplyToTarget`, `ffgUpdateMessage`, `ffgCritRecovery`.

- The wizard registers its **own** `game.socket.on` listener; it does **not** extend
  `registerGMBridge`. Both see all channel traffic.
- The wizard listener **must filter on `data?.eventType === "pcWizard"` first**; its event names are
  verified non-colliding.
- `gm-bridge.js:120-124` is the **in-repo precedent** for the trusted-sender contract. Follow it.

### 0.10 Stage 1H is MANDATORY — two paths, one deadline

`GATE-CUTOVER-BOOT` check 4 requires a console comparison against `baselines/console-baseline.txt`.
Stage 1H is the only step that produces it before Stage 18, and a subjective "no obvious new errors"
fallback is **not** the owner-mandated comparison.

**Therefore: the owner's Stage 18 boot gate converts Stage 1H from optional into required.**

There are **two ways to complete Stage 1H**, and **both have the same deadline**:

- **Path A (ordinary):** run the four captures against the current tree.
- **Path B (isolated reconstruction):** capture them from `a1621c00` in a separate Foundry instance.

> **Path B is an alternative way to COMPLETE Stage 1H, never permission to postpone it.**
> **All four baseline files must be produced and committed before Stage 2 begins**, by whichever
> path. **If neither path completes, the plan stops before Stage 2.** There is no third option.

**Both paths run Cypress, so both depend on §0.11 (the guard must be committed first, and Path B must
copy it into the worktree) and on §0.12 (the ordering invariant).**

### 0.11 The DEV-9 Cypress safety guard — committed first, copied into Path B

`cypress/support/e2e.js` carries a fail-closed guard that aborts a Cypress run unless the resolved
`Cypress.config("baseUrl")` equals an explicitly-passed `--env expectBaseUrl=…`. It is the only thing
standing between the **entity-creating specs** (`01_create_entities.cy.js`, `02_test_items.cy.js`)
and a live world when an override is omitted or mistyped.

**Two verified facts change how it must be handled:**

1. **It is currently UNCOMMITTED.** `git status` shows ` M cypress/support/e2e.js` — the guard exists
   only as a working-tree modification. **Any `git checkout`, `git stash`, `git reset` or worktree
   operation destroys it.**
2. **It does not exist at `a1621c00`.** Verified with `git show a1621c00:cypress/support/e2e.js`:
   that revision contains only the boilerplate comments and `import "./commands";` — **no root
   `before()`, no `expectBaseUrl` read**. Meanwhile `a1621c00:cypress.env.json` is
   `{"baseUrl": "http://chimaera:10101"}` and `a1621c00:cypress.config.js` still overwrites
   `config.baseUrl` from `config.env.baseUrl`.

**Consequence:** in an unmodified `a1621c00` worktree, **`expectBaseUrl` is simply ignored** — there
is no guard to fail closed. If the port-30001 override were omitted or mistyped there, Cypress would
resolve to the tracked remote host with nothing to stop it.

**Therefore:**

- **Stage 1 step 0 commits the guard** as its own early commit, **before any Cypress command is run
  in either path**.
- **Path B copies the guard from the committed version on `pc-wizard-rewrite`** into the throwaway
  worktree, and **proves it fails closed** before capturing the baseline.

### 0.12 The Cypress ordering invariant — normative (**new in v10**)

> **Every single Cypress invocation in this plan — without exception, including the two negative
> guard proofs — must be immediately preceded by a `/setup` pre-flight against the EXACT URL that
> invocation will target.**

**Why this is stated as a standing invariant rather than left to each site:** the safety property
depends on ordering, and ordering is exactly what drifts when a step is inserted later. v9 introduced
a Path B step that ran Cypress three times before its pre-flight — precisely because the pre-flight
lived at the end of a list rather than being attached to each invocation.

**Concretely:**

- The pre-flight is: open the target base URL in a browser and confirm it lands on **`/setup`** with
  **no world active**. If a world is running, *Return to Setup* or shut it down first.
- **"The exact URL that invocation will target"** means the value you are about to pass as
  `--env baseUrl=…`: **`http://localhost:30000`** for §7.6 and Stage 1H Path A;
  **`http://localhost:30001`** for Stage 1H Path B. Never assume 30000.
- **A Cypress run leaves the throwaway world active**, so the pre-flight must be **re-confirmed
  between consecutive invocations** — it is not a once-per-session check.
- **The negative guard proofs are not exempt.** They exist to test *whether the guard was copied
  correctly*; if it was not, the first one reaches `cy.setup()`, and an already-active world would
  let the destructive specs operate on it. They are the invocations that need the pre-flight most.
- §8's ordering sweep records the state of every invocation site in this document.

---

## 1. Binding additions folded in from design review v7

**Both confirmed correctly discharged by every plan review — carried into v10 unchanged.**

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
every sibling id is valid (`/^[a-zA-Z0-9]{16}$/`) and unique before the Actor is constructed**.

### R7-2 — D9 start-ACK binding and GM-connect trigger (Stage 14)

Design §5.9's ACK carries only `{sessionNoticeId}`. The channel is a **broadcast** and the design
authenticates via the socket layer's trailing sender argument, so another player can replay an
observed session id and cause a real GM to broadcast a valid GM-signed ACK **for the attacker's
key**; the honest client, matching only `sessionNoticeId` + "sender is a GM", marks its start
delivered though no GM record exists for it. Separately, the specified triggers mean **nothing fires
when a GM merely connects**, making design §11-7's assertion untestable.

**Required:** (1) the active GM derives the requester from the socket sender and broadcasts
`startNoticeAck {requesterId, sessionNoticeId}`; (2) a client accepts it **only when**
`requesterId === game.user.id` **and** the session id is pending **and** the socket sender is a GM;
(3) register **one ready-time `userConnected` hook** (declared `client/hooks.mjs:1122`, fired from
`client/documents/collections/users.mjs:103-129`); (4) remove the pending-map entry on **ACK** and on
**wizard close**; (5) add the cross-GM **start** duplication case to the accepted residuals;
(6) tests for two concurrent players, no-GM open followed by GM connection **without an intervening
render**, close-while-pending cleanup, and lost-ACK GM failover.

---

## 2. Stage 1 — Baseline, tooling, and the Node tier scaffold

**Partly complete already — do not redo the finished items.**

**Already done on branch `pc-wizard-rewrite`:** branch created off `main` at `a1621c00` (planning
docs at `ce76311e`); `core.autocrlf` is `false`; **all six per-file lint baselines measured**,
including `partial-templates.js` **0/0** and `character-creator.js` **11/20**. The DEV-9 guard is
**written but not yet committed** — that is step 0 below.

> **Stage 1 itself invokes Cypress zero times** (§8 sweep). Step 0 only commits the guard; the first
> Cypress run in the whole plan is Stage 1H's.

### Step 0 — commit the DEV-9 guard FIRST (§0.11)

**Before anything else in this stage, and before any Cypress command is run in either Stage 1H
path**, commit the existing working-tree guard so it cannot be lost:

**Files modified:** `cypress/support/e2e.js` *(already contains the guard; `git status` shows ` M`)*.
Confirm it still reads the `expectBaseUrl` env key and aborts on absence or mismatch, then commit it
alone.

**Commit:** `test(cypress): commit DEV-9 fail-closed baseUrl guard`

> **Why this is step 0:** the guard currently exists only as an uncommitted modification. Any
> `git checkout`, `git stash`, `git reset` or worktree operation would destroy the one protection
> standing between the destructive specs and a live world — and Stage 1H, which runs Cypress, comes
> immediately after this stage. Committing it also gives **Path B a well-defined source to copy
> from** (§0.11).

### The rest of Stage 1

**Files created:**
- `modules/package.json` — `{"type":"module","private":true}` (DEV-11).
- `tools/check-imports.mjs` — the GATE-IMPORTS checker, **seven rules**, rule 6 behind `--cutover`,
  **rule 7 transitive over the §0.6.4 closure**. **Non-executing.**
- `tests/node/_stub/foundry-stub.mjs` (+ `ffg-config.fixture.mjs` only if needed, §0.6.6).
- `tests/node/stub-boundary.test.mjs` — the boundary meta-test (§0.6.6).
- `tests/node/check-imports-activation.test.mjs` — rule 6 activation tests: without `--cutover` the
  rule is skipped even on a valid shim; with `--cutover` it fails on a 1846-line file, on a shim
  naming the wrong export, and on a multi-line shim.
- `tests/node/check-imports-purity.test.mjs` — rule 7's negative tests, using **temporary fixture
  files**: Covered→Covered **passes**; Covered→`xp-entry-builders.js` **passes**;
  Covered→`config/ffg-active-effect-modes.js` **passes**; Covered→`actor-ffg.js` /
  `item-helpers.js` / `actor-helpers.js` / `modifiers.js` / `apps/*` **fails**; **a forbidden edge
  reached transitively through another Covered module is still detected**; and **an allowed exception
  that later gains a forbidden import is rejected**.
- `tests/node/smoke.test.mjs` — one trivial test so `npm test` has a non-empty suite.
- `superpowers/docs/plans/PcWizard/baselines/` — the durable baseline directory, with the six measured
  per-file lint baselines and the repo-wide `lint-baseline.json` **moved from the scratchpad and
  committed**.

**Files modified:** `package.json` (root) — add scripts **only**; **do not add `"type": "module"`**:

```json
"test": "node --test \"tests/node/**/*.test.mjs\"",
"check:imports": "node tools/check-imports.mjs"
```

**Work:**
1. Move the measured lint baselines into `baselines/` and commit.
2. Re-run `npx eslint modules -f json > .../baselines/lint-baseline.json`; confirm **97 errors / 511
   warnings**, or record the actual numbers.
3. Add `modules/package.json`. **Confirm by execution** that
   `modules/config/ffg-active-effect-modes.js` and `modules/config/ffg-character-creator.js` import
   cleanly, and that the poisoned set fails with `ReferenceError: foundry is not defined`. **Record
   all results in `baselines/node-coverage.md`.** If `ffg-character-creator.js` imports cleanly, use
   the **real** table in the stub instead of a fixture.
4. **Prove `npm test` runs green in this shell**, and **record which isolation mode it ran under** in
   `baselines/node-baseline.txt`. If spawning genuinely fails here, **stop and report to the owner**;
   do not silently switch to `--test-isolation=none`.
5. Write `tools/check-imports.mjs` to the **seven** rules, with **pin support (DEV-17)**: the checker
   reads `baselines/imports-baseline.txt`, treats each pinned `rule:file:line` as expected, and exits
   non-zero on any **unpinned** finding — or if a pinned one changed, moved, multiplied, or vanished.
   Run it on the untouched tree (without `--cutover`) and record the baseline. **A finding caused by
   a checker bug is fixed, never pinned**; only a confirmed real, pre-existing, out-of-scope defect
   with a tracking issue may be pinned. One pin is expected at Stage 1 — see the GATE-IMPORTS table.
6. Write the stub and the three meta-tests (boundary, rule 6 activation, rule 7 purity).
7. **Owner decision needed before Stage 13** — the **draft-size thresholds**. Proposed, in **binary
   KiB** measured in **UTF-8 bytes**: **≤ 64 KiB (65 536 bytes)** and median `setFlag` round-trip
   **≤ 150 ms over 10 samples**.

**Verification:** GATE-LINT (L1 vacuous — `modules/package.json` is not linted; L3 unchanged);
**GATE-NODE** green with the isolation mode recorded; **GATE-IMPORTS** passing under DEV-17 (no
unpinned findings) with `imports-baseline.txt` recorded and its single pin issue-linked; the
import-graph results recorded in `node-coverage.md`; **the DEV-9 guard is committed** (step 0).
**"All baseline files exist" here means the Stage-1-owned files only** — `lint-baseline*.json`,
`node-baseline.txt`, `imports-baseline.txt`, `node-coverage.md`. The four Foundry-side baselines are
Stage 1H's.
**Commit:** `chore(pc-wizard): node test tier, import checker, durable baselines`
*(the guard is its own earlier commit — step 0)*

---

### Stage 1H — Pre-change Foundry baselines (HUMAN, **MANDATORY, before Stage 2**)

**Required, not optional (§0.10).** ~30 minutes. **All four files below must be produced and
committed before Stage 2 begins**, by **Path A** or **Path B**. **If neither completes, the plan
stops before Stage 2.**

> **Prerequisites for both paths:** Stage 1 step 0 must be committed (§0.11), and **every Cypress
> invocation below obeys the §0.12 ordering invariant** — a `/setup` pre-flight against the exact
> target URL immediately precedes each one.

#### Path A — ordinary capture against the current (unmodified) tree

1. **GATE-MOCHA baseline** (invocation in §7.2): record the total pass count and **the identity of
   every failing test** → `baselines/mocha-baseline.json`. **MEASURED 2026-07-21: 77 pass / 19 fail**
   (an earlier "~47/~2" estimate was wrong — captured, not assumed). The 19 = 2 known-stale Modifier
   tests + 1 Replace-Die (a different in-flight feature) + **all 16 `minimized-close` cases**, which
   fail on stale test *setup* (`app.form = null` at `minimized-close.test.js:31`; `.form` is
   getter-only in this Foundry). **Owner decision 2026-07-21: baseline as-is, do NOT fix the test.**
2. **Console baseline**: load the world, record every existing console error/warning →
   `baselines/console-baseline.txt`. **This is the file Stage 18 compares against.**
3. **GATE-CYPRESS baseline**, against the owner's normal instance on **port 30000**:
   1. **Pre-flight (§0.12):** open **`http://localhost:30000/`** and confirm it lands on **`/setup`**
      with no world active. If a world is running, *Return to Setup* first. **Do not proceed
      otherwise.**
   2. Run the baseline command:
      ```bash
      npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
      ```
   3. Record the result → `baselines/cypress-baseline.txt`. **CAPTURED 2026-07-21: `3/3` failed
      (100%), all in setup / before-hooks** — `00_init` on `(intermediate value).difference is not a
      function` (ES2024 `Set.difference`; likely Cypress's older Chromium), `01`/`02` cascade
      (no `/join` screen → `select[name="userid"]` timeout). The guard held (targeted 30000, no
      `Refusing`). **Owner decision 2026-07-21: ADOPT the `3/3`-red baseline as the Stage 18/23
      reference; the spec repair is tracked as [#30](https://github.com/YeNov/StarWarsFFG/issues/30),
      separate world-dependent work.** ⚠ **Consequence, recorded not hidden:** with all specs dying in
      setup, GATE-CYPRESS is **mostly inert** — at Stage 18/23 it can only assert "still broken the
      same way," and cannot catch a regression in the entity/item behaviour the specs never reach.
      It becomes a real regression gate only once #30 lands and the baseline is re-captured
      deliberately.
   4. **The run leaves the throwaway world active** — return Foundry to `/setup` before any later
      Cypress run (§0.12).
4. **Playwright inventory**: `npx playwright test --list` → `baselines/playwright-inventory.txt`.

**Commit:** `chore(pc-wizard): pre-change Foundry baselines`

#### Path B — isolated reconstruction from `a1621c00` (an alternative way to COMPLETE Stage 1H)

Use if Path A is impractical. **Same deadline: all four files committed before Stage 2.**

The naive "`git worktree add ../swffg-baseline` and point a data path at it" is **unsound**: a
worktree has no `node_modules`, a sibling directory is **not served at `/systems/starwarsffg/…`**,
and nothing protects the live install. Use exactly this:

1. Create a **separate temporary Foundry Data root**, e.g. `D:\swffg-baseline-data`.
2. **Create the intermediate directory first**, then add the worktree **at the package path**:
   ```bash
   mkdir -p "D:/swffg-baseline-data/systems"
   git worktree add "D:/swffg-baseline-data/systems/starwarsffg" a1621c00
   ```
3. **Copy the DEV-9 guard into the worktree — MANDATORY, before any Cypress command (§0.11).**
   ```bash
   git show pc-wizard-rewrite:cypress/support/e2e.js \
     > "D:/swffg-baseline-data/systems/starwarsffg/cypress/support/e2e.js"
   ```
   > ⚠ **`a1621c00` does NOT contain the guard.** Verified with
   > `git show a1621c00:cypress/support/e2e.js`: only boilerplate and `import "./commands";` — **no
   > root `before()`, no `expectBaseUrl` read** — while `a1621c00:cypress.env.json` is
   > `{"baseUrl": "http://chimaera:10101"}` and `a1621c00:cypress.config.js` still overwrites
   > `config.baseUrl` from `config.env.baseUrl`. In an **unmodified** worktree `expectBaseUrl` is
   > **silently ignored**. The source is the **committed** guard on `pc-wizard-rewrite` (Stage 1
   > step 0). This is a **harness-only change, left uncommitted in the throwaway worktree**; record
   > that it was applied alongside the baseline.
4. Run **`npm ci` inside that worktree** so `tests/ffg-tests.js` can load `node_modules/mocha` and
   `node_modules/chai`, and Cypress is available.
5. Start a **separate Foundry process** against that Data root **on port 30001** — the pinned
   baseline port, distinct from the owner's live instance on 30000.
6. **Guard proofs and the Cypress baseline — interleaved, in EXACTLY this order (§0.12).** Every
   invocation is preceded by its own pre-flight; the negative proofs are **not** exempt, because they
   are precisely what detects a guard that was not copied correctly.

   1. **Pre-flight:** confirm **`http://localhost:30001/`** resolves to **`/setup`** with no world
      active.
   2. **Missing-`expectBaseUrl` proof:**
      ```bash
      npx cypress run --env baseUrl=http://localhost:30001
      ```
      It must **abort before any spec's `cy.setup()`**. **If it reaches `cy.setup()`, STOP
      immediately** — the guard was not copied correctly and the environment is unsafe.
   3. **Re-confirm** `http://localhost:30001/` resolves to `/setup`.
   4. **Mismatch proof:**
      ```bash
      npx cypress run --env baseUrl=http://localhost:30001,expectBaseUrl=http://localhost:30000
      ```
      It must **abort before `cy.setup()`**. **If it reaches `cy.setup()`, STOP immediately.**
   5. **Re-confirm** `http://localhost:30001/` resolves to `/setup`.
   6. **The real baseline run:**
      ```bash
      npx cypress run --env baseUrl=http://localhost:30001,expectBaseUrl=http://localhost:30001
      ```
      → `baselines/cypress-baseline.txt`.

   Record all three outcomes with the baseline. The red-baseline decision from Path A step 3.3
   applies here too.
7. **Capture the REMAINING baselines** — `mocha-baseline.json`, `console-baseline.txt`,
   `playwright-inventory.txt` — from the same isolated instance. **This step introduces no new
   preconditions**; the Cypress baseline is already taken.
   > These come *after* the Cypress run by necessity: Cypress requires `/setup` with **no** world
   > active, whereas the mocha and console captures require an **active** world — and step 6.6 leaves
   > the throwaway "Integration Test World" running, which is exactly the pre-change system to
   > capture them from.
8. Stop the baseline server **before** removing the worktree and Data root.
9. **Never swap, symlink or overwrite the owner's live `Data/systems/starwarsffg`.**

**Commit:** `chore(pc-wizard): pre-change Foundry baselines (isolated reconstruction)`

---

## 3. Stages 2–4 — Shared-core extractions from live system files

Each is a **behaviour-neutral** refactor of a live file.

### Stage 2 — Extract `getActorCreationDefaults(type)` and `applyCharacteristicDeltas`

**Files modified:** `modules/actors/actor-ffg.js` *(legacy — L2, baseline 0 errors / 8 warnings;
**do not clean**)*

**Work:**
1. Extract the per-type `prototypeToken` blocks inlined in `static create` (`:38`+, including the
   rival `RivalTokenPrepend` setting read) and the default-image map inlined in `_preCreate`
   (`:111`+) into one exported `getActorCreationDefaults(type)` returning **fresh clones** of
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
   **deliberately not reproduced** — say so in a comment. **`_preUpdate` is retained unchanged.**

> **No Node test is attempted here.** `actor-ffg.js` is **proven poisoned** (§0.6.1). `apply-build.js`
> covers the *behaviour* via an **injected** fixture (DEV-15); the real implementation is verified at
> Stage 23.

**Verification:** GATE-LINT (L2 on `actor-ffg.js`, L3); GATE-NODE; GATE-IMPORTS.
**Deferred to Stage 23:** create one actor of each type and confirm prototype token settings, default
images and the rival `RivalTokenPrepend` behaviour are identical to pre-change; Brawn/Willpower sheet
edits still adjust derived stats. **Plus `cypress/e2e/01_create_entities.cy.js`** — executed in the
single Stage 23 §7.6 run, not here.
**Commit:** `refactor(actor): extract getActorCreationDefaults + applyCharacteristicDeltas`

### Stage 3 — Extract the pure `reconcileTreeEffects` core

**Files modified:** `modules/helpers/item-helpers.js` *(legacy — L2, baseline 2 errors / 4 warnings)*

Extract the algorithm from `ItemHelpers.syncTreeActiveEffects` (`:284`+) into an exported **pure**
`reconcileTreeEffects(effectSources, tree, nodeLabel, fallbackImg)` operating on plain source arrays
and returning patches; `syncTreeActiveEffects` becomes a **thin document-applying wrapper**.
Algorithm preserved exactly: skip attributes whose `buildActiveEffectChanges` (`:361`) result is
empty; claim an unclaimed **exact flag tuple** first, else **one unclaimed same-name** effect; patch
**only** `changes` / `disabled` (= `!islearned`) / tree-`flags` **in place**; append an **id-less**
effect only when unmatched; **never delete** unclaimed effects. `syncAEStatus`'s dispatch
(`:240-247`) is untouched.

> **No Node test is attempted here.** `item-helpers.js` is **proven poisoned** (§0.6.1). Extracting
> the core still removes duplication, and `to-item-data.js` consumes it **by injection** (DEV-15) so
> the *contract* is Node-tested even though the algorithm is not.

**Verification:** GATE-LINT (L2, L3); GATE-NODE; GATE-IMPORTS.
**Deferred to Stage 23:** sheet talent/upgrade purchase produces identical AEs; legacy same-name
adoption; nothing deleted. **Plus `02_test_items.cy.js`** — executed in the single Stage 23 §7.6 run.
**Commit:** `refactor(items): extract pure reconcileTreeEffects core from syncTreeActiveEffects`

### Stage 4 — Extract the XP-log entry builders into a pure module (DEV-14)

**Files created:**
- **`modules/helpers/xp-entry-builders.js`** — genuinely pure. **It must import nothing** (rule 7
  asserts this directly).
- `tests/node/xp-entry-builders.test.mjs`

**Files modified:** `modules/helpers/actor-helpers.js` *(legacy — L2, baseline 1 error / 4 warnings)*
— import the new module and **delegate**; behaviour identical.

**Verified current behaviour** (`actor-helpers.js:211-231`, `:258-279`):

```js
// xpLogSpend(actor, action, cost, available, total, statusId) writes:
{ action: 'purchased',            // ← CONSTANT LITERAL, never the parameter
  id: statusId, xp: { cost, available, total }, date,
  description: action }            // ← the `action` PARAMETER lands HERE

// xpLogEarn(actor, grant, available, total, note, granter, statusId) writes:
{ action: granter === "GM" ? "granted" : "adjusted",
  id: statusId, xp: { cost: grant, ... },   // ← the GRANT is stored under xp.cost
  date, description: note }
```

**Required builder signatures (note the renamed spend input):**

```js
// in modules/helpers/xp-entry-builders.js — no imports, no globals.
export function buildXpSpendEntry({ description, cost, available, total, statusId, date })
  → { action: "purchased", id: statusId, xp: {cost, available, total}, date, description }

export function buildXpEarnEntry({ grant, available, total, note, statusId, date, granter = "GM" })
  → { action: granter === "GM" ? "granted" : "adjusted",
      id: statusId, xp: {cost: grant, available, total}, date, description: note }
```

`xpLogEarn`/`xpLogSpend` delegate to these; `date` defaults to today **inside the persisting
helpers** and is explicit on the builders. `xpLogSpend` keeps calling `notifyXpSpend`
unconditionally — the wizard avoids the whisper by **never calling the persisting helper** (Stage
15). **D10: the `xpLog` array shape is not changed and no migration is performed, anywhere.**

**Node tests (against the pure module):** spend entry `action === "purchased"` always, with the
supplied `description` in `description`; earn maps `grant` → `xp.cost`; `granter: "GM"` →
`"granted"`, non-GM → `"adjusted"`; the builders are referentially pure.

**Verification:** GATE-LINT (**L1 on `xp-entry-builders.js`**, L2 on `actor-helpers.js`, L3);
GATE-NODE; GATE-IMPORTS (rule 7 confirms the new file imports nothing).
**Deferred to Stage 23:** that `xpLogSpend`/`xpLogEarn` **still delegate correctly** and that the
XP-spend whisper still fires when `notifyOnXpSpend` is on.
**Commit:** `refactor(actor-helpers): extract pure xp-entry-builders module`

---

## 4. Stages 5–15 — The wizard package (additive; nothing imports it until Stage 18)

### Stage 5 — Scaffold: constants, enrich, calculators, i18n keys

**Files created:**
- `modules/char-creator/constants.js` — **Covered (§0.6.2)**: socket channel/event names (verified
  non-colliding with gm-bridge, §0.9), flag keys `pcWizardDraft` / `pcWizardSourceSelection` /
  `pcWizardCommit`, `DRAFT_SCHEMA_VERSION = 1`, commit timeout ~15 s, D9 spacing 30 s. **It imports
  nothing**, and it is the single source of truth that `draft-schema.js`, `notify-policy.js`,
  `wizard-state.js`, `source-descriptors.js`, `validate.js`, `to-item-data.js` and
  `commit-normalize.js` import (§0.6.4) — **duplicating these constants to satisfy rule 7 is
  forbidden; the closure allows the import**.
- `modules/char-creator/enrich.js` — `enrichDescription` via
  `foundry.applications.ux.TextEditor.implementation.enrichHTML`; `stripHtml` via `DOMParser`
  (**BUG-4**). **NOT Covered, and explicitly outside rule 7's closure.**
- `modules/char-creator/calculators.js` — pure `calcXp` `:1529-1552`, `calcCredits` `:1633-1645`,
  `calcObligation` `:1554-1600`, with a **marked seam** for the Stage 7 bonus table (KEEP-4).
- `tests/node/constants.test.mjs`, `tests/node/calculators.test.mjs`.

**Files modified:** `lang/en.json` — add **all** new flat keys in one pass beside the existing
`SWFFG.CharacterCreator.*` block (from `:962`; 142 existing keys): the D9 `…Notify.*` set
(`StartedGM`, `FinishedGM`, `FinishedPlayer`, `SubmitPending`, `SubmitUnconfirmed`, `SubmitRetry`,
`SubmitFailed`, `LogWarning`, `NoGm`, `StrayCommit`, `CollisionError`), draft-UX, gear-filter and
Sources-panel keys. **No existing key renamed or removed.**

**DEV-5:** every id uses `foundry.utils.randomID(16)`. **A bare global `randomID` does not exist
here, and ESLint will not catch it** — the Stage 7 Node test is the guard.

**Verification:** GATE-LINT (**L1** — the three new files zero-findings; L3); GATE-NODE; GATE-IMPORTS;
`lang/en.json` parses as valid JSON (asserted in the Node tier).
**Commit:** `feat(char-creator): scaffold package — constants, enrich, calculators, i18n keys`

### Stage 6 — `build-item-schema.js`: canonical projection + **R7-1** identity layer

**The R7-1 stage, fully automated in Node.**

**Files created:** `modules/char-creator/build-item-schema.js`,
`tests/node/build-item-schema.test.mjs`

**Part A — `projectItemSource(raw)`:** deterministic, idempotent, pure.
- **Item keys kept:** `name`; `type` (∈ `system.json` `documentTypes.Item`); `img`; `system` (deep
  clone); `effects`; `flags` → **only the `starwarsffg` scope** (load-bearing:
  `config.enableAmmo` gates rolls/display; `config.medicalType` selects healing).
- **Item keys stripped:** `_id`, `folder`, `sort`, `ownership`, `_stats`, unknown keys,
  non-`starwarsffg` flag scopes.
- **Effect keys kept:** `name`, `img`, `type`, `system`, `changes[]` as `{key, value, mode,
  priority}` (**`priority` preserved**), `disabled`, `duration`, `statuses`, `transfer`,
  `description`, `tint`, `sort`, `flags.starwarsffg`, and `flags.core` restricted to `{overlay}`.
- **Effect keys stripped:** `_id`, `origin`, `_stats`, other `flags.core` keys, unknown keys.
- **Third-party flag scopes are dropped — a recorded product limitation** (Stage 22 docs).

**Part B — the identity layer (R7-1):**

```js
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_INDEX = 62 ** 3;            // 238328

export function b62_3(n) {            // fixed-width, injective over [0, MAX_INDEX)
  if (!Number.isInteger(n) || n < 0 || n >= MAX_INDEX) throw new WizardIdRangeError(n);
  return B62[(n / 3844) | 0] + B62[((n / 62) | 0) % 62] + B62[n % 62];
}
export function prefix13(seed) { /* deterministic synchronous fold → 13 chars of B62 */ }
export function embedId16(seed, index) { return prefix13(seed) + b62_3(index); }
```

> **Test seam.** `prefix13`, `b62_3` and `embedId16` are **exported**. The forced-collision proof
> needs **no stubbing**: **one identical seed with many distinct indices** holds the prefix constant
> *by construction*.

`assignWizardIdentity(actorData, {userId, commitId})` — the **single shared caller**:

- `actorData._id = await deriveCommitActorId(userId, commitId)` — SHA-256 over
  `"swffg-pcwizard|commit|v1|" + userId + "|" + commitId`, base-62 onto 16 chars, **cached per
  `{userId, commitId}`**. Crypto is required because this id is a **world collection key**.
- `item._id = embedId16(\`item|${commitId}\`, i)` — all items share one prefix ⇒ distinct `i` ⇒
  distinct id, unconditionally.
- `fx._id = embedId16(\`fx|${commitId}|${i}\`, j)` — all effects of one item share one prefix ⇒
  distinct `j` ⇒ distinct id within that Item.
- **Assertion before return (mandatory):** every item id matches `/^[a-zA-Z0-9]{16}$/` and item ids
  are unique as a set; per item, effect ids valid and unique within that item. Violation throws
  `WizardIdIntegrityError`.
- Ordering is normative: **projection strips SOURCE identity → this layer adds WIZARD identity.**

**Node tests (all nine):** keep/strip coverage; idempotence; `priority` and `flags.core.overlay`
survive while `flags.core.sourceId`/`origin` do not; **forced collision**; `prefix13` determinism and
shape; `b62_3(238328)` throws / `(238327)` succeeds; duplicate-id injection throws; determinism
across runs and full re-keying on a changed `commitId`; every id matches the document-id regex.

**Verification:** GATE-LINT (L1, L3); GATE-NODE (all nine); GATE-IMPORTS.
**Commit:** `feat(char-creator): canonical item projection + injective wizard identity (R7-1)`

### Stage 7 — `wizard-state.js` + `starting-bonus.js` (BUG-2, KEEP-4)

**Files created:** `modules/char-creator/wizard-state.js` — **Covered** — `createInitialData()`
seeding `identity`, **`commitId: foundry.utils.randomID(16)`**, `grants.gm.credits` and `initial.*`
from the world settings, `selected.rules = "fad"`, `spendingCredits` (d100, rolled **once at draft
creation**), plus the plain mutators. **No live Documents anywhere, ever** — `SelectionRef` is
`{uuid, name, type, img, snapshot}`. And `modules/char-creator/starting-bonus.js` —
`STARTING_BONUS[rules][choice]`, transcribed **exactly** from `selectStartingBonus` (`:865-908`) and
the `calcObligation` branches. Plus `tests/node/starting-bonus.test.mjs`,
`tests/node/wizard-state.test.mjs`.

**Files modified:** `modules/char-creator/calculators.js` — `calcObligation` now reads the adjustment
**from the table** (closing the KEEP-4 coupling defect).

**Preserved quirk (Q-2):** `2k_credits` grants **2500** (`:884,:902`). **Port verbatim** — flagged at
Stage 22.

**Node tests:** every `rules × choice` cell matches the transcription; **BUG-2 regression** — AoR and
EotE bonuses land in `bonus.duty` / `bonus.obligation` and **never** in `bonus[undefined]`;
`calcObligation` and the `grants.bonus` display agree; **a generated `commitId` matches
`/^[a-zA-Z0-9]{16}$/`** (the DEV-5 guard); `selected.rules` defaults to `"fad"`; settings-seeded
fields; `spendingCredits` rolled once and never re-rolled; mutator purity.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS.
**Commit:** `feat(char-creator): single starting-bonus table + wizard state factory (BUG-2)`

### Stage 8 — `source-descriptors.js` + `load-source.js` (issue C, N-1, N-4, D7) — split, DEV-12

**Files created:**
- `modules/char-creator/source-descriptors.js` — **Covered**: the descriptor table,
  `isSourceEnabled`, `sourceIdOf`. **An unknown `poolKey` throws.**
- `modules/char-creator/load-source.js` — the **I/O shell**. **Not Covered.**
- `tests/node/source-descriptors.test.mjs`

**Why the descriptor table exists:** the literal `` `${type}Compendiums` `` is invalid for several
categories. Verified in `modules/swffg-main.js:567-652`: the setting for Force powers is
**`forcePowerCompendiums`** (`:583`) while the Item type is lowercase **`forcepower`**. Gear spans
**five** Item types under the **one** `itemCompendiums` setting (`:645`).

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

Not consumed (deliberate): `talentCompendiums` and `signatureAbilityCompendiums`.

> **Confirm and record, do not guess:** `getAvailableMoralities` (`:735-757`) loads the **same**
> `obligation` pack and world type as obligations, undifferentiated. Confirm against
> `CONFIG.FFG.characterCreator` and record it in the descriptor comment.

**Shell behaviour (Stage 23):** packs from the setting ∪ world items of the mapped types; falsy pack
ids skipped; **GM gates at load** (`system.rarity.value > maxRarity` excluded; restricted excluded
unless `allowRestricted`, per `:663-676`); results map to `SelectionRef`s with **`toObject()`
snapshots** — **cached per poolKey**, invalidated when the pool changes. Persistence is **per user**,
stored as **exclusions** so new GM packs default on. A selected ref whose source is later disabled
**stays in the draft** with an advisory note.

**Node tests:** `forcePower` → `forcePowerCompendiums` + `forcepower`; `gear` unions all five types;
unknown `poolKey` throws; `career` → `career` (**N-1**); `sourceIdOf` derives pack ids and `"world"`;
`isSourceEnabled` honours exclusions and defaults-on.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS.
**Deferred to Stage 23:** world careers actually appear (**N-1**), world gear appears (**N-4**), GM
gates hold, disabling a source preserves selections with a note.
**Commit:** `feat(char-creator): descriptor-driven loadSource + pool predicate (N-1, N-4, D7)`

### Stage 9 — `to-item-data.js` + `materializeTreePurchases` — materializer **INJECTED** (DEV-15)

**Files created:** `modules/char-creator/to-item-data.js`, `tests/node/to-item-data.test.mjs`
**Files modified:** `modules/helpers/item-helpers.js` *(legacy — L2; **purely additive**)* — add
`materializeTreePurchases(itemSource, learnedKeys)` on the Stage 3 pure core: deep-clone the source,
set `islearned` for purchased keys (specialization → `system.talents`; forcepower →
`system.upgrades`, per the `syncAEStatus` dispatch `:240-247`), reconcile the clone's `effects` with
**the same algorithm** the sheet uses. **N-7:** flipping `islearned` alone is insufficient — the
sheet's purchase path re-syncs (`item-sheet-ffg.js:1776-1777`); the current wizard never does,
leaving purchased nodes **stat-inert**.

> **DEV-15 — mandatory, not a fallback.** `to-item-data.js` **must not import `item-helpers.js`**: it
> is **proven poisoned**, and a static import would make both `to-item-data.js` and `apply-build.js`
> Node-unimportable. The signature is `toItemData(ref, { materializeTree, ... })`; production binds
> the real materializer through `build-deps.js` (DEV-16), and Node tests pass a fake. **Rule 7
> enforces this.** `AE_MODES` **is** imported directly — verified import-clean and a named exception.

**Deterministic rank grants (issue E):** `attr${Date.now()}` attributes plus one AE per rank become
deterministic `pcwRank<n>_<skillSlug>` attributes plus effects `{key: "system.skills.<skill>.rank",
mode: AE_MODES.ADD, value: 1}`, baked into the item source. Sound for the in-memory preview because
`CONFIG.ActiveEffect.legacyTransferral = false` (`swffg-main.js:218`).

**One mapping for every category:** background culture/hook/forceAttitude (forceAttitude **only when
`rules === "fad"`**), obligations (**edited snapshots**, closing `:1017-1021`), species, career,
selected specialization, motivations, **plus the intentional fixes**: purchased extra specializations
and Force powers (**N-5**) and credit-purchased gear (**N-6**, both paths). **BUG-1:** motivations
are plain `SelectionRef`s through the same `toItemData`. `projectItemSource` is the **final mapping
step**.

**Node tests:** duplicate gear purchase yields two items with distinct ids; rank grants deterministic
across runs with **no `Date.now()`**; unlearned nodes give `disabled: true`; the snapshot input is
**not mutated**; **N-5**; the injected materializer is called with the expected arguments and its
result is embedded unmodified.

**Verification:** GATE-LINT (L1 on the new file, L2 on `item-helpers.js`, L3); GATE-NODE;
GATE-IMPORTS (rule 7).
**Deferred to Stage 23:** flagged-tree materialization against real compendium items; legacy
same-name adoption; sheet talent purchase unchanged.
**Commit:** `feat(char-creator): toItemData + tree materialization with synced AEs (E, N-5..N-7)`

### Stage 10 — `build-deps.js` (DEV-16) + `apply-build.js` — collaborators injected

**Files created:** `modules/char-creator/build-deps.js`, `modules/char-creator/apply-build.js`,
`tests/node/build-deps.test.mjs`, `tests/node/apply-build.test.mjs`

**`build-deps.js` — the pure binding factory (DEV-16, §0.6.5).** It **imports nothing**; all four
collaborators arrive as parameters, so the adapter that binds the real materializer into `toItemData`
is itself **Node-tested** rather than hand-written at an untestable root.

**Node tests for `build-deps.js`:** the returned `toItemData` adapter **passes the supplied
materializer as `materializeTree` on every call**; a caller-supplied `materializeTree` option
**cannot override** the binding; caller options are otherwise preserved; `creationDefaults` is the
result of calling `getActorCreationDefaults("character")` (asserted on the argument too); **omitting
or passing a non-function for any of the four collaborators throws `MissingCollaboratorError`**.

**`applyBuild(data, { creationDefaults, applyCharacteristicDeltas, toItemData }) → {actorData,
warnings}`** — **pure and synchronous**.

1. **Base + identity** from `creationDefaults` — default `system`, default image, and the **partial**
   prototypeToken with **no** `name`/`texture.src`. Then `name = data.identity.name`,
   `img = data.identity.img ?? defaults.img`. Required because a complete source containing `system`
   **bypasses `ActorFFG.create`'s token block entirely**.
2. **Characteristic purchases** via the injected `applyCharacteristicDeltas`. Skill purchases write
   `system.skills.<key>.rank`. Costs ported verbatim: characteristic `newValue * 10` (`:1218`);
   career skill `newValue * 5`, non-career `newValue * 5 + 5` (`:1258-1262`).
3. **Other system fields:** `system.experience.{total, available}` from `calcXp`;
   `system.stats.credits.value = calcCredits().available + data.spendingCredits`;
   `system.<morality|obligation|duty>.value = calcObligation().available` (`:1784-1789`).
4. **Items** via the injected `toItemData` for every category.

`applyBuild` is the **only** builder: `showCharacterStatus` (`:1083-1205`) and `createActor`
(`:1697-1845`) have exactly one successor.

**Node tests for `apply-build.js`:** a full synthetic draft yields characteristics / wounds / soak /
encumbrance / strain / XP / credits / obligation matching hand-computed expectations **against the
fixture deltas function**; `spendingCredits` included; force-attitude **excluded** when
`rules !== "fad"`; input not mutated; the injected collaborators are called exactly as specified.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS (rule 7).
**Commit:** `feat(char-creator): build-deps factory + single applyBuild path`

### Stage 11 — `preview.js`: the in-memory preview engine (D2, issue A)

**Files created:** `modules/char-creator/preview.js`

**`preview.js` consumes injected dependencies (DEV-16). It is NOT a composition root and imports
nothing poisoned** — `pc-wizard.js` is the single root (§0.6.5).

```js
// buildPreviewActor(data, buildDeps) — deps come from pc-wizard.js via makeBuildDependencies().
const { actorData } = applyBuild(data, buildDeps);
await assignWizardIdentity(actorData, { userId: game.user.id, commitId: data.commitId });
const previewActor = new CONFIG.Actor.documentClass(actorData);   // UNSAVED. Never .create().
```

**Normative constraints:**
- Preview actors are constructed **only at/after `ready`**. **Construction IS the preparation.**
- **Never call `prepareData()` a second time** on a preview actor. If ever needed, `reset()` must
  precede it.
- Each render constructs a **fresh** actor and discards the old one — with **identical deterministic
  ids** each time.
- **Zero DB writes, zero socket traffic, zero orphan actors, zero flicker** while editing. The
  `temp actor - <user>` mechanism and its `deleteCharacter` cleanup have **no successor**.

> **Not Node-testable. Not Covered; outside rule 7's closure.**

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS.
**Commit:** `feat(char-creator): in-memory preview engine (D2 — no DB actor churn)`

### Stage 12 — `validate.js`: advisory validation (D4, issue G)

**Files created:** `modules/char-creator/validate.js`, `tests/node/validate.test.mjs`

Pure `validateDraft(data, ctx) → {steps, totals, warnings}`. **Binding constraint: it returns i18n
*keys*, never localized strings.**

Checks: per-step completeness mirroring the review copy (`lang/en.json:962-973`); expected free-rank
counts (**4 career / 2 specialization**, `:967,:969`) as **warnings**; affordability (XP ≥ 0,
credits ≥ 0) as warnings; unspent-XP notice; cross-cutting notes.

**D4 is binding: create is NEVER blocked.** Warnings produce **one confirm dialog** with **"Create
anyway" as the default**. Existing purchase-time affordability behaviour is preserved (`:1318-1324`).

**Node tests:** empty draft → all steps `incomplete`, **zero blocking**; overspent draft → `warning`
plus a warning key, never an error; statuses flip to `complete` as selections are made; **every
returned string is a key** (assert the `SWFFG.` prefix).

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS.
**Commit:** `feat(char-creator): advisory validation (D4)`

### Stage 13 — `draft-schema.js` + `draft-store.js` (D5) — split, DEV-12

**Files created:**
- `modules/char-creator/draft-schema.js` — **Covered**: `serializeDraft`, `deserializeDraft`,
  `MIGRATIONS` (empty at v1), version handling, `measureDraftBytes`. **It imports `constants.js` for
  `DRAFT_SCHEMA_VERSION`** — allowed by the closure; duplicating the constant is forbidden.
- `modules/char-creator/draft-store.js` — the **I/O shell**. Not Covered.
- `tests/node/draft-schema.test.mjs`

**Storage:** a flag on the player's **own** User document —
`game.user.setFlag("starwarsffg", "pcWizardDraft", draft)`. Verified: non-GM users may update their
own User document and `flags` is not restricted (`common/documents/user.mjs:204-220`).

**Schema v1** — `commit` sits **beside** `data`, not inside it:

```js
{ schemaVersion: 1, systemVersion, savedAt, characterName,
  commit: null | { commitId, firstAttemptAt, xp: {total, available}, fingerprint },
  data: { identity, commitId, grants, selected, purchases, initial, spendingCredits } }
```

**Normative API — the store owns the outer record:**

```js
draftStore.scheduleSave({ data, commit });      // debounced ~1 s
await draftStore.saveNow({ data, commit });     // cancels the pending timer; writes now
await draftStore.load();                        // → the full record, or null
draftStore.setCommit(commit);                   // freeze/clear; marks dirty
await draftStore.idle();  await draftStore.clear();
draftStore.lock(); draftStore.unlock();
```

- **There is no `draft.commitFrozen`.** "Frozen" is **derived**.
- Older schema → migrate; **newer** → refuse resume, offer discard; unreadable → offer discard;
  **never crash on a bad draft**.
- Rehydration on resume: `fromUuid` → refresh the snapshot **except user-edited obligation fields**;
  unresolvable → keep the stored snapshot + advisory warning.

**Draft-size measurement — in UTF-8 bytes:**

> **`JSON.stringify(record).length` is WRONG** — it counts **UTF-16 code units**.

```js
const serializedBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
const serializedKiB   = serializedBytes / 1024;          // BINARY KiB
```

- Threshold **≤ 64 KiB (65 536 bytes)** — **asserted in the Node tier** for a *normal* and a
  *maximum-content* draft.
- **The ≤ 150 ms median `setFlag` latency half is Stage 23.**
- **Fallback if the byte threshold trips:** uuid-only refs for compendium-resolvable items —
  implemented **in this stage**, with Stages 8, 9 and this stage's Node tests re-run.

**Node tests:** round-trip `{data, commit}`; **frozen-commit durability** (deep-equal including
`fingerprint`); newer `schemaVersion` refused; corrupt draft refused; obligation edits survive a
refresh; the two byte measurements.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS.
**Commit:** `feat(char-creator): draft schema + store with byte-accurate size budget (D5)`

### Stage 14 — `notify-policy.js` + `notify.js`: D9 with **R7-2** — split, DEV-12

**Files created:**
- `modules/char-creator/notify-policy.js` — **Covered**: `shouldAcceptAck(...)`, `startDedupKey`,
  `finishDedupKey`, pending-map transitions. Imports `constants.js` only.
- `modules/char-creator/notify.js` — the **I/O shell**. Not Covered.
- `tests/node/notify-policy.test.mjs`

**Session identity:** each wizard **open** mints a transient
`sessionNoticeId = foundry.utils.randomID(16)` — **not persisted, not derived from `commitId`**.

**Start notice (R7-2 items 1–4):**
- The client emits `startNotice {sessionNoticeId, commitId}` and holds `#startNoticeState =
  "pending"`. **Emission alone never marks delivery.**
- **The processing GM** derives the requester **from the socket sender** — **never** from the
  payload; de-duplicates by authenticated **`(sender, sessionNoticeId)`**; posts one ChatMessage
  whispered to all GMs plus a log line; then broadcasts
  **`startNoticeAck {requesterId: sender, sessionNoticeId}`**.
- **A client accepts an ACK only when all three hold:** `requesterId === game.user.id`, the
  `sessionNoticeId` is pending, and the socket sender is a GM.
- **Emission triggers while pending:** (a) first render; (b) a later render with an active GM and
  ≥30 s elapsed; (c) **a ready-time `Hooks.on("userConnected", …)` hook registered ONCE**;
  (d) **unconditionally, immediately before the first commit attempt**.
- **Pending-map lifecycle:** removed **on ACK** *and* **on wizard close**.

**Finish record:** the **processing client** posts one ChatMessage whispered to all GMs **and the
requesting player** with a clickable **`@UUID[Actor.{id}]{name}`** link, plus warnings.
De-duplicated by **`(sender, commitId)`**. **Cross-GM duplication remains possible** by design.

**Player toast:** the **green** toast appears **only** on the authenticated `commitResponse {ok:
true}`; otherwise an honest **"Submitting… — not confirmed"** state.

**Node tests — R7-2 cases 1–5, 7 and 8** (ACK rejected for wrong `requesterId` / non-GM sender /
unknown session; finish de-dup; two concurrent players; close-while-pending leaves the map empty;
lost-ACK failover).

> **R7-2 case 6 — "GM connects with no intervening render" — is NOT Node-testable.** **Routed to
> Stage 23 §7.4**, with the replay attack executed for real over the socket.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS.
**Commit:** `feat(char-creator): D9 observability with requester-bound ACKs and userConnected flush (R7-2)`

### Stage 15 — `commit-normalize.js` + `commit-service.js` + `socket-bridge.js` — split, DEV-12

**Files created:**
- `modules/char-creator/commit-normalize.js` — **Covered**: `normalizeCommitSource`, the fingerprint,
  and the GM-side request **sanitizer**. **It imports the XP builders from
  `modules/helpers/xp-entry-builders.js` (DEV-14), never from `actor-helpers.js`.**
- `modules/char-creator/commit-service.js` — the **I/O shell**. Not Covered.
- `modules/char-creator/socket-bridge.js` — transport. Not Covered.
- `tests/node/commit-normalize.test.mjs`

**Commit identity:** `data.commitId` minted at draft creation. **The first attempt freezes**
`draft.commit = {commitId, firstAttemptAt, xp, fingerprint}`. **Any successful `#mutate` while
`draft.commit` exists mints a fresh `commitId` and clears `commit`**; the wizard logs
`Notify.StrayCommit` naming the superseded id.

**`normalizeCommitSource(actorData, {userId, commitId, firstAttemptAt, xp})`:**
1. **Reapply `assignWizardIdentity`** — **no second formula**.
2. **Baked XP log:** `flags.starwarsffg.xpLog = [spendEntry, earnEntry]` (newest-first), built with
   the **DEV-14 pure builders**:
   - spend: `buildXpSpendEntry({description: "Character Creation Changes", …})` → the entry's
     **`action` is `"purchased"`** and the string lands in **`description`** — **not the reverse**.
   - earn: `buildXpEarnEntry({grant: xp.total, …, granter: "GM", …})` → `action: "granted"`,
     `xp.cost === xp.total`.
   Because the entries ride the source, **any same-key overwrite restores the intended log state**.
   Writing them as source also **suppresses the whisper**.
3. **Commit stamp:** `flags.starwarsffg.pcWizardCommit = {commitId, userId, xp, date}`.
4. **Fingerprint:** `digest16` over the normalized source JSON. **Exclusions:** `_stats` at every
   level, and — across GM failover only — the server-added processing-GM `ownership` entry.

**`commitBuild`:** same-client `inFlight` coalescing; a **best-effort stamp preflight** throwing
`CommitCollisionError`; `Actor.implementation.create(normalizedSource, {keepId: true})`; then
`verifyCommitLog` (**read-only, D10**).

> **State plainly in the code comments:** a top-level Actor create with `keepId: true` is an
> **UPSERT**. **No atomic, exactly-once, or never-overwrite claim is made anywhere.**

**The socket bridge** (replaces `swffg-main.js:2052-2126`, deleted at Stage 18): channel
`system.starwarsffg`, `eventType: "pcWizard"`, events `commitRequest`, `commitResponse`,
`startNotice`, `startNoticeAck`. **Coexistence (§0.9):** a separate registration that **filters
`eventType === "pcWizard"` first**. **Lifecycle (issue F, N-3):** registered **once in `ready` on
every client**; GM clients process requests **only where `game.user === game.users.activeGM`**.
**Sender authentication (N-2):** the requesting id comes **exclusively** from the socket layer's
trailing argument. **Sanitization:** the GM builds a fresh source; allowed quarry is `name`
(clamped), `img`, `system`, `items` (**rebuilt** through `projectItemSource`), plus validated commit
metadata; `ownership` is **replaced** with `{[sender]: OWNER}`.

**Node tests:** determinism; exactly the two `pcw:<commitId>:*` entries with the frozen date; **the
baked spend entry has `action === "purchased"` and `description === "Character Creation Changes"`**;
stable fingerprint excluding `_stats`; the sanitizer drops `_id`/`ownership`/`flags`/`prototypeToken`
and rejects non-finite `xp`.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; GATE-IMPORTS (rule 7).
**Deferred to Stage 23:** the upsert itself, `verifyCommitLog` against a real actor, the socket
round-trip.
**Commit:** `feat(char-creator): best-effort commit service + authenticated socket bridge (D3)`

---

## 5. Stages 16–18 — Templates, shell, cutover

### Stage 16 — New template tree at `templates/wizards/pc_wizard/` (purely additive)

**DEV-4: this stage touches no file the live wizard renders.**

**Files created — all under `templates/wizards/pc_wizard/`:** `header.html`;
`tabs/{background,startingBonus,obligation,species,career,xp_spend,gear,motivation,review}.html`
(**nine tabs; no `rules.html`**); `parts/pickable-table.html` (**replaces all seven per-render
DataTables instances**); `parts/{gear-filters,sources-panel,draft-banner}.html`; and
`actor_preview.html`, `preview/{skills,specialization,forcepower}.html`, `item_pill.html` **copied**
from `char_creator/` and adapted to the new context shape. Copies, not moves.

**Files modified:** `modules/helpers/partial-templates.js` *(legacy — L2, baseline 0/0)* — append
every new `{{> … }}` target to `templatePaths` in `TemplateHelpers.preload()`. **The existing list
already registers the four legacy `char_creator` preview partials at `:42-45`** — line `:41` is
`chat/parts/item/ffg-footer.html`, **do not touch it**.

> **Why registration is required:** core `HandlebarsApplicationMixin._preRender` loads only each
> `PARTS[*].template` and its declared `PARTS[*].templates`
> (`handlebars-application.mjs:97-105`). **GATE-IMPORTS rule 4** proves the listing;
> **`GATE-CUTOVER-BOOT` check 3** proves the actual registration.

**Gear filters (D6):** GM gates stay **at load**; **no reveal toggle**. Price min/max; rarity "up to
N" bounded by GM `maxRarity`; restricted tri-state shown **only when** `allowRestricted`; five
category chips as **declarative per-category column sets**; text search; clear-filters. Filtering is
**pure in `_prepareContext`**.

**Sources panel (D7):** a **header button, not a tab**. **Default all-on**; the specialization group
lists **configured packs ∪ packs referenced by the selected career ∪ "World items"**.

**Rich text (BUG-4):** enriched in `_prepareContext`, rendered with **triple-stache** into sanitized
containers; tooltips use `stripHtml()`. **Never raw HTML into text sinks.** *(Verified at Stage 23.)*

**Verification:** GATE-LINT (L2 on `partial-templates.js`; L3); GATE-NODE; **GATE-IMPORTS — rules 3
and 4 carry this stage.**
**Commit:** `feat(char-creator): new pc_wizard template tree + partial registration (additive)`

### Stage 17 — `pc-wizard.js`: the AppV2 shell and **the single composition root** (DEV-16)

**Files created:** `modules/char-creator/pc-wizard.js` (exports `CharacterCreator`).

**This file is THE composition root (§0.6.5), and the only one.** It imports the real
`getActorCreationDefaults`, `applyCharacteristicDeltas` and `materializeTreePurchases`, passes them
plus `toItemData` to `makeBuildDependencies()` **once**, and hands the resulting object to
`preview.js` and every client-side build call. **Not Node-importable and not Covered** — by design.

- `static PARTS` — **12 entries**: `header`, the core `tabs` navigation part, **nine** tab-content
  parts, and `preview` — all pointing at `templates/wizards/pc_wizard/…`. **No `footer`.** Each part
  declares its partial dependencies in `PARTS[partId].templates`.
- `static TABS` in the verified visual order **minus the dropped `rules` tab**. **Initial tab:
  `background`.**
- `DEFAULT_OPTIONS`: `tag: "form"` **without** a form handler — the phantom `myFormHandler` (`:102`)
  is **not ported**. Chrome as today: 950×800, classes `["starwarsffg","wizard","charCreator"]`.
- **`close()` preserves the minimized-animation guard verbatim** from
  `modules/helpers/character-creator.js:199-202`. **That test is browser-only and runs at Stage 23**
  — copy the guard exactly. `close()` also removes the D9 pending-notice entry and, in any
  non-committed phase, runs `unlock()` + a final `await saveNow({data, commit})`.

**Listener-ownership rule (normative — issue B):** **clicks route exclusively through
`DEFAULT_OPTIONS.actions`**, reading identity from `data-uuid` / `data-table` / `data-field`;
**change/input bindings** are attached in an override of `_attachPartListeners(partId, htmlElement,
options)` declared per part as `PART_BINDINGS[partId]`, querying **only within `htmlElement`**;
**`_onRender` binds nothing**; mutation → **targeted** re-render, **never** a full-window re-render
per keystroke; native `<select>` replaces SlimSelect.

**The `#mutate` funnel and the commit barrier:**

```js
#mutate(fn) {
  if (this.#commitPhase !== "editing") return false;
  if (this.#draft.commit) this.#remintCommitId();   // edit after an attempt ⇒ NEW identity
  fn(this.data);
  this.draftStore.scheduleSave({ data: this.data, commit: this.#draft.commit });
  return true;
}
```

Commit sequence: guard → `"committing"` + `lock()` + disabled UI → first attempt only:
`setCommit(frozen)` → **`await saveNow({data, commit})` before creation starts** → await the commit →
success: `"committed"` → `idle()` → `clear()` → `close()` → open the new sheet; failure/timeout: back
to `"editing"`, `unlock()`, draft intact, retry reuses the frozen identity.

**Deleted, not ported (issue H):** `myFormHandler`; `_preparePartContext`'s `another_tab`/TODO
branch; the `.replace(" ", " ")` normalizations.

**Verification:** GATE-LINT (L1, L3); GATE-NODE; **GATE-IMPORTS** (all `PARTS` paths resolve).
**Commit:** `feat(char-creator): AppV2 shell, single composition root, per-part listeners`

### Stage 18 — **CUTOVER** (ends at the blocking human boot gate)

**⚠ The highest-risk stage in the plan.**

**Files modified — three legacy module files:**
1. `modules/helpers/character-creator.js` *(L2, baseline 11/20)* — the 1846-line implementation is
   **deleted**, the file reduced to **one line**:
   ```js
   export { CharacterCreator } from "../char-creator/pc-wizard.js";
   ```
   **Do NOT delete this file** (§0.8).
2. `modules/swffg-main.js` *(L2; **do not clean**)* — **delete the old pcWizard bridge block at
   `:2052-2126`** and **replace it with the Stage 15 socket-bridge registration at `ready`**. **Do
   NOT touch** the import at `:58`, the entry button at `:1438-1465`, the `registerGMBridge()` call
   at `:1577`, or the compendium settings at `:567-652`.
3. `modules/helpers/partial-templates.js` *(L2, baseline 0/0)* — **remove the four legacy
   `char_creator` entries at `:42-45`**. **Delete by exact path, not by line number** — line `:41` is
   `chat/parts/item/ffg-footer.html` and **must survive**.

**Files deleted:** the **entire** `templates/wizards/char_creator/` tree.

> **Stage 18 invokes Cypress zero times** (§8 sweep) — GATE-CYPRESS is Stage 23's, and the cutover's
> human check is `GATE-CUTOVER-BOOT`, which is a browser check with no Cypress involvement.

**Verification — agent-executable part (run first):**
1. **GATE-IMPORTS with `--cutover`** — all seven rules, **rule 6 now active**. *Zero findings.*
   **Every later stage also uses `--cutover`.**
2. GATE-LINT — L2 against the Stage 1 per-file baselines for **all three** touched legacy files. Plus
   L3. **Deleting 1846 lines will reduce the totals** — record the new numbers as the reference.
3. GATE-NODE — unchanged suite green.
4. **Exact-specifier greps:**
   - `grep -rn "helpers/character-creator.js" modules/ tests/` → **exactly two** live importers.
   - `wc -l modules/helpers/character-creator.js` → **1** (modulo a trailing newline).
   - `grep -rn "createCharacterRequest\|createFinalActorRequest\|deleteCharacter\|temp actor" modules/`
     → **no matches**.
   - `grep -rn "char_creator" modules/ templates/` → **no matches**.
   - `grep -n "ffg-footer.html" modules/helpers/partial-templates.js` → **still present**.

**Verification — `GATE-CUTOVER-BOOT` (HUMAN, BLOCKING, ~10 minutes):**

**Stop here and hand off to the owner.** Do not commit Stage 18 and do not begin Stage 19 until the
four checks in §0.4 pass. Record the outcome in `baselines/cutover-boot-result.md`. **If any check
fails, the fix happens at Stage 18.**

**Deferred to Stage 23:** the §11-2 no-churn smoke; the full-character build; the exhaustive
all-parts render; the DEV-16 materializer-binding assertion; the Cypress run; §7.3–§7.6.

**Commit (only after `GATE-CUTOVER-BOOT` passes):**
`feat(char-creator)!: cut over to the rewritten PC wizard (shim keeps the old path)`

---

## 6. Stages 19–22 — Fixtures, docs, and hand-off

> **Stage 19 may not begin until `GATE-CUTOVER-BOOT` has passed and its result is recorded.**
> **All GATE-IMPORTS invocations from here on use `--cutover`.**

### Stage 19 — Node fixtures for identity, projection and mapping

**Files created:** `tests/node/parity.test.mjs`

- **R7-1 identity fixtures (a), (b), (e):** repeated `assignWizardIdentity` gives identical ids; the
  same gear bought twice gives **distinct** ids; re-minting the `commitId` changes **all** ids.
- **Preview↔commit id equality (c):** `applyBuild` + `assignWizardIdentity` and
  `normalizeCommitSource` produce **identical** `_id`s.
- **Same-payload determinism (d):** two `normalizeCommitSource` runs are byte-equal.
- **Canonical-projection fixture:** an ammo-enabled weapon, medical gear, **two same-key effects with
  different `priority`**, and a **tinted `flags.core.overlay` effect**.
- **BUG-3 regression:** un-learn refund matches by **uuid** (`:1443-1444`).

**Verification:** GATE-LINT (L3); GATE-NODE; GATE-IMPORTS `--cutover`.
**Commit:** `test(char-creator): node fixtures for identity, projection and mapping`

### Stages 20 and 21 — *(folded into Stage 23)*

v4's Stage 20 (two-client player smoke) → **§7.4**. v4's Stage 21 (draft lifecycle, XP-log on a real
actor, ruleset/pool/filter, console-clean) → **§7.5**. **Neither invokes Cypress** (§8 sweep).

### Stage 22 — Documentation and owner hand-off

**Files created:** `docs/pc-wizard-guide.md`:
- the new tab flow; Sources panel, gear filters, draft resume/discard;
- **the GM's D9 disambiguation procedure** (design §5.9): *started but never finished* → the
  submission didn't complete; *finished/created but the player can't see it* → **the actor exists**,
  have the player **reconnect/refresh**, **do not re-create**; duplicates are identifiable by their
  `pcWizardCommit` stamps;
- **the recorded limitation:** third-party module flag scopes are lost through the wizard;
- **the accepted residuals**: cross-GM duplication of **start** records alongside the documented
  **finish** duplication; and the best-effort commit model — **worst case is a duplicate character
  the GM deletes, never a lost or corrupted build.**

**Owner decision flag-back:**
1. **Q-2 — `2k_credits` grants 2500**, ported verbatim at Stage 7.
2. **Sources-panel placement** — design default (header-button overlay).
3. **GM-absent flow** — design default: the wizard **opens** without a GM; `Notify.NoGm` at review
   and commit.
4. **Fork release endpoints** — `system.json:5,92-94` still point **upstream**.
5. **Multiple named drafts** — one slot per user in v1. **6.** Warnings-dialog "don't ask again" —
   not in v1.
7. **Draft-size** — the Stage 13 byte measurements and whether the fallback fired.
8. **Legacy lint debt** — per-file numbers (DEV-7).
9. **Cypress and the DEV-9 guard** — now **committed** (Stage 1 step 0) and **copied into Path B
   worktrees**, with the **§0.12 ordering invariant** governing every invocation. Upstream the guard,
   keep it fork-local, or rework it?
10. **`modules/package.json` (DEV-11)** — keep, or switch to the narrower char-creator scope?
11. **The §0.2 trade** — which stages were verified only statically, the `GATE-CUTOVER-BOOT` result,
    and the Stage 23 outcome.
12. **The injected seams (DEV-15/DEV-16)** — if the poisoned chain is ever untangled, the injections
    could collapse back into plain imports.
13. **Future hardening, deliberately not built:** the server-arbitrated exactly-once commit via a
    GM-owned ledger, and the **keyed-object `xpLog` refactor** (**out of scope per D10**).

**Verification:** GATE-LINT (L1/L2/L3); GATE-NODE (full suite green); GATE-IMPORTS `--cutover`
passing under DEV-17 (no **unpinned** findings; the pin list must still be exactly the Stage 1 entry
unless the owner has approved another); `git status` clean; the branch diff touches only files
enumerated in this plan. **No Cypress run
here** — Stage 23 §7.6 owns the single post-change run (§8 sweep).
**Commit:** `docs(char-creator): user guide, GM disambiguation procedure, recorded limitations`

---

## 7. Stage 23 — HUMAN VERIFICATION

**Requires a person at a running Foundry world.** `GATE-CUTOVER-BOOT` has already confirmed the
system boots and the wizard opens; **the correctness of the build output is still unverified**.

### 7.0 Pass condition and remediation loop

**Stage 23 passes only when every mandatory check below is green.** A partially-failing run is **not**
sign-off.

On any failure:
1. **Record** the failure and the **owning implementation stage** in `baselines/stage23-results.md`.
2. **Return the branch to the implementing agent** for correction at that stage.
3. After the fix, **re-run GATE-LINT, GATE-NODE and GATE-IMPORTS `--cutover`**.
4. **Re-run `GATE-CUTOVER-BOOT`** if the fix touches boot, wiring, templates, or the live shell.
5. **Re-run the affected Stage 23 section and every dependent later section** — including, if §7.6
   is re-run, its **§0.12 pre-flight**.
6. Interim failure reports may be committed separately, but **`stage23-results.md` is final sign-off
   only once all mandatory checks pass.**

### 7.1 Boot and smoke

- **GATE-BOOT** — re-confirm at the final tree state: the world loads; every import specifier
  resolves; hooks register; console compared against `baselines/console-baseline.txt`.
- **All-parts render, exhaustive:** iterate **`Object.keys(PCWizard.PARTS)`** (currently **12**) and
  confirm each renders a root element with **no "partial not found"**.
- **No-churn smoke (design §11-2):** build a full character as GM while watching the Actors directory
  and the server log — **zero `temp actor - …` documents**, zero socket traffic, zero actor writes
  before Confirm; `game.actors.size` unchanged throughout editing.

### 7.2 GATE-MOCHA

World open, **as GM**, after a **hard reload**, in the F12 console:

```js
const mod = await import(`/systems/starwarsffg/tests/ffg-tests.js?v=${Date.now()}`);
const tester = new mod.default();
tester.render(true);
```

The `?v=` is the cache-buster. **Importing alone runs nothing** — mocha runs inside `getData()`
(`tests/ffg-tests.js:32-33`), i.e. on **render**. Read failures from the JSON reporter blob —
**`Error` properties are non-enumerable**.

- **`tests/v2-migration/minimized-close.test.js` is baselined RED** (16 failures, stale setup — see
  `mocha-baseline.json`; owner decision 2026-07-21, not fixed). It still guards the cutover: the file
  **imports `CharacterCreator` through the shim**, so a broken shim fails the import and collapses the
  **whole** harness to a different signature (all tests fail to load), which the identical-failure-set
  gate catches loudly. What is NOT covered is the minimized-close *behaviour* assertion — already dead
  because setup throws before it runs. If the stale test is ever repaired, its failure set changes and
  this gate fires — the intended prompt to re-baseline deliberately.
- Pass condition: failure set **identical to `baselines/mocha-baseline.json`** (the operative gate —
  supersedes any "must pass" phrasing elsewhere).

### 7.3 Parity and behaviour (design §11-3, §11-4, §11-6)

- **Preview/final numeric parity — the load-bearing correctness spike.** A representative build:
  **every derived stat of the preview actor equals the committed actor**, and both equal a
  **hand-built control character**. Includes Brawn/Willpower purchases;
  `stats.Brawn`/`stats.Willpower` mirror writes **confirmed inert**; free-rank AEs applying **in
  preview**. Confirm **N-5** and **N-6**.
- **DEV-16 — the real-materializer binding assertion (§0.6.5).** In the **preview**, before any
  commit, purchase a **talent node** in a specialization and an **upgrade** in a Force power, and
  confirm the preview actor's derived stats change accordingly. **Only the real
  `materializeTreePurchases` produces synced effects** — a wrong or missing production binding leaves
  the node **stat-inert**, exactly N-7's original symptom. *This is the one check that covers the
  production wiring no Node test can reach.*
- **Canonical-projection fixture on a real actor:** ammo and medical behaviours work; the token
  renders the **overlay/tint**; priority-ordered effects apply in order.
- **Tree materialization:** a compendium spec with flagged tree effects; a **legacy spec with an
  unflagged same-name effect adopted, not duplicated**; nothing deleted.
- **BUG-4:** descriptions render as **rich text, not raw HTML**; tooltips are plain-text stripped.
- **Poisoned-module deferrals (§0.6.3):** actors of each type get correct prototype tokens and
  default images (incl. rival `RivalTokenPrepend`); Brawn/Willpower sheet edits adjust derived stats;
  sheet talent/upgrade purchase produces identical AEs; **`xpLogSpend`/`xpLogEarn` still delegate
  correctly to `xp-entry-builders.js`** and the XP-spend whisper still fires.

### 7.4 Two-client player smoke (design §11-7)

Requires GM + non-GM player; two sub-cases need a **second GM**.

1. A player builds and commits through the bridge; the actor is **owned by the player**.
2. The **GM start whisper appears once per wizard session**; reopening the same draft produces a new
   one.
3. **No-GM open:** the start stays **pending**.
4. **R7-2 — GM connects with NO intervening render:** delivered by the `userConnected` hook.
5. **R7-2 — replay attack, for real:** a second player emits a `startNotice` carrying the **first**
   player's `sessionNoticeId`; the honest client **rejects** the resulting ACK and stays pending.
6. **Two concurrent players:** each accepts only its own ACK.
7. **Close while pending:** N no-GM open/close cycles leave the pending map **empty**.
8. **Lost-ACK GM failover:** the commit **converges on the same actor**.
9. The **finish whisper** (working clickable actor link) reaches GMs **and** the player exactly once.
10. The **ACK-gated green toast** appears **only** on the authenticated response.
11. **N-3 regression:** first-ready GM logs out, a second GM is active — the bridge **still works**.
12. **N-2 regression:** two players commit simultaneously — neither consumes the other's response.
13. **§0.9 coexistence:** apply damage from an attack card to an unowned target — **both bridges
    work**.

### 7.5 Lifecycle, log, pool and filters

- **Draft lifecycle:** close mid-build → reopen → **resume banner** → **identical state**; discard
  works; a successful commit **clears the draft with no resurrection**; **kill the browser
  mid-commit** → resume → retry **converges on one actor** with the **frozen commit record intact**.
- **XP log:** exactly the two `pcw:<commitId>:*` entries with the **frozen date**; **the spend
  entry's `action` is `"purchased"` and its `description` is `"Character Creation Changes"`**; the
  earn entry's action is `granted`; **externally delete one entry**, re-run a same-commit commit →
  the **warning surfaces** and the **log is not rewritten** (D10); **no XP-spend whisper**.
- **Ruleset / pool / filters:** **BUG-2**; ruleset switch clears the starting bonus and hides
  force-attitude; **N-1** world careers appear; **N-4** world gear appears; **Force powers load**;
  disabling a source preserves selections with a note; **gear filters never exceed the GM gates**.
- **Draft size, latency half:** median `setFlag` round-trip over 10 samples.

### 7.6 GATE-CYPRESS

> ## ⚠ BLOCKING SAFETY PRECONDITION — the §0.12 ordering invariant
>
> **Required order for EVERY Cypress invocation, without exception:**
>
> 1. **Pre-flight:** open **the exact base URL this invocation will pass** and confirm it lands on
>    **`/setup`** with **no world active**. For this section that URL is
>    **`http://localhost:30000`**; for Stage 1H Path B it is **`http://localhost:30001`**. If a world
>    is running, *Return to Setup* or shut it down first.
> 2. **Only then** run the command.
> 3. **A run leaves the throwaway world active** — re-confirm `/setup` before the next invocation.
>    The pre-flight is **per invocation**, not per session.
>
> **Why:** `setup()` (`cypress/support/commands.js:44-90`) begins with `cy.visit("/")` and **returns
> early unless the URL is `/setup`**. If a world is already active, setup is skipped and `join()`
> (`:137-146`) logs in as `Gamemaster` **on whatever world is currently active** —
> `01_create_entities.cy.js` and `02_test_items.cy.js` would create actors and items **inside that
> world**.
>
> **The DEV-9 guard must be present in the tree you are running from** (§0.11). It is committed on
> `pc-wizard-rewrite` as of Stage 1 step 0; **a Path B worktree at `a1621c00` does not contain it
> until you copy it in**.

The suite **self-provisions**: `acceptsLicense()` (`:5-14`), `authenticatesAsAdmin()` (`:19-27`,
admin key **`test-admin-key`** — any other key fails at `:25`), `setup()` installs `starwarsffg` if
absent and **creates and launches "Integration Test World"**, `join()` logs in as **`Gamemaster`**.

**Invocation — `--env`, and only `--env`, after the pre-flight above:**

```bash
npx cypress run --env baseUrl=http://localhost:30000,expectBaseUrl=http://localhost:30000
```

**`--config baseUrl=…` and `CYPRESS_BASE_URL` do not work here.** `cypress.config.js:9-13`'s
`setupNodeEvents` **unconditionally** overwrites `config.baseUrl` from `config.env.baseUrl` *after*
config resolution, and the tracked `cypress.env.json:2` supplies `http://chimaera:10101`. **Do not
edit `cypress.env.json`.**

- **Pass condition:** result set identical to `baselines/cypress-baseline.txt`. A spec already
  failing pre-change is baseline — **do not fix it** as part of this work.
- **Cypress is not waivable.** `BLOCKED-BY-ENVIRONMENT` is a diagnostic that **halts** until repaired.
- **GATE-PLAYWRIGHT:** `npx playwright test --list` recorded only — `e2e/activeEffects.spec.js` has
  **16 real `test()` blocks** but hard-codes `http://overlord.wrycu.com:12121/game/` and needs
  `state.json` + `globalSetup` — **configured, not locally runnable, out of scope.**

### 7.7 Sign-off

Per §7.0: `stage23-results.md` is committed as **final sign-off only once every mandatory check is
green**. Report to the owner: results, any remediation cycles and their owning stages, and the
thirteen §Stage-22 flag-back items.
**Commit:** `docs(pc-wizard): stage 23 human verification results`

---

## 8. Review response — round 8

### Finding 1 — Blocker — Path B ran Cypress three times before its `/setup` pre-flight

**CONFIRMED AND FIXED.** v9's Path B started the isolated server (step 5), invoked Cypress **three
times** (step 6), and only then instructed the `/setup` pre-flight (step 7) — placing the safety
check after everything it was meant to protect, and violating §7.6's own "before every run" rule. The
negative proofs are the invocations that need it **most**: they exist to detect a guard that was not
copied correctly, so if it wasn't, the first one reaches `cy.setup()` — and an already-active world
on 30001 would let the destructive specs operate on it.

Path B step 6 is now an **interleaved six-part sequence in exactly the reviewer's order**:
pre-flight → missing-`expectBaseUrl` proof (**STOP immediately if it reaches `cy.setup()`**) →
re-confirm `/setup` → mismatch proof (**STOP immediately**) → re-confirm `/setup` → the real
port-30001 baseline run. **Step 7 now captures only the remaining baselines** (mocha, console,
playwright) and **introduces no precondition** — with a note explaining why that ordering is forced:
Cypress needs `/setup` with no world active, whereas the mocha and console captures need an **active**
world, and step 6.6 leaves the throwaway world running as exactly the pre-change system to capture
from.

To stop this class recurring, the invariant is now stated **once, normatively, in new §0.12** —
*every* Cypress invocation, including the negative proofs, must be immediately preceded by a `/setup`
pre-flight against **the exact URL that invocation will target**, and the pre-flight is **per
invocation, not per session**, because a run leaves a world active. §7.6's precondition block is
restructured from prose into the numbered required order, and §0.10, Stage 1H's preamble and §7.0's
remediation loop all reference it.

### The ordering sweep — every Cypress invocation site in the document

Enumerated by grepping v9 for `cypress run`, `GATE-CYPRESS`, `/setup` and `localhost:300`, then
checking each hit. **Result: 5 real invocations across 3 sites; 1 was correct, 1 was latently weak,
3 were the Blocker.**

| Site | Invocations | Pre-flight state in v9 | Action in v10 |
|---|---|---|---|
| **§7.6 (Stage 23)** | 1 (port 30000) | ✔ **Correct** — the ⚠ block precedes the command | Kept; **restructured** from prose into a numbered required order, and generalised to "the exact URL this invocation will pass" |
| **Stage 1H Path A** | 1 (port 30000) | ⚠ **Latently weak** — delegated to §7.6 by reference ("safety procedure in §7.6") rather than an ordered inline step | **Fixed**: the pre-flight against `http://localhost:30000` is now an explicit numbered sub-step immediately before the command, plus a reminder that the run leaves a world active |
| **Stage 1H Path B** | 3 (port 30001 ×2 proofs + 1 baseline) | ✘ **The Blocker** — pre-flight at step 7, after all three | **Fixed** — interleaved as above |
| **Stage 1** | **0** | n/a — step 0 only *commits* the guard | Stated explicitly: "Stage 1 itself invokes Cypress zero times" |
| **Stage 18** | **0** | n/a | Stated explicitly; `GATE-CUTOVER-BOOT` is a browser check with **no Cypress involvement** |
| **Stages 20, 21** | **0** | n/a — folded into Stage 23 | Noted in their fold-in line |
| **Stage 22** | **0** | n/a | Stated in its verification line: "No Cypress run here — Stage 23 §7.6 owns the single post-change run" |

**One correction to the review's premise, reported rather than silently accommodated:** the sweep was
requested over "Stage 18's pre-cutover and post-cutover runs, Stage 21, Stage 22". **Those
invocations do not exist in this plan.** They were v4-era cadence entries; the **v5 restructure moved
all Cypress execution into Stage 23**, and v5–v9 never reinstated them. I verified this by grep —
there is no `cypress run` or GATE-CYPRESS execution anywhere between Stage 1H and §7.6. Stages 2 and
3 mention `01_create_entities.cy.js` / `02_test_items.cy.js`, but only as **deferrals to** the single
Stage 23 run, not as invocations; v10 makes that wording explicit at both sites so they cannot be
misread as stage-local runs.

**Net:** the plan contains **exactly two Cypress execution sites** — Stage 1H (one path or the other)
and Stage 23 §7.6 — and every invocation at both now carries its own immediately-preceding pre-flight
against its own target URL.
