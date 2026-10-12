# Test Suite Audit Remediation Plan

Date: 2026-10-11

Status: Plan only. Implementation has not started.

## Goal and scope

Give each test a clear purpose. Each test must check a wanted feature rule, a user action, or a required package or test-tool contract. Expected results must come from that rule. Tests must fail when the rule is broken.

Cover all project tests: Node, the Foundry functional suites, Playwright, and Cypress. Check scripts and historical evidence separately. A script that imports a module and prints output is not an automated feature test.

The user selected Node tests in CI plus a separate Foundry test world. Keep that split. Use Playwright as the browser runner for the Foundry world. Keep useful Mocha tests that run inside Foundry and expose their results to the runner.

This document authorizes no implementation, test-world changes, commits, or external actions. Saving this plan is the only change made for this request.

## Audit baseline

- The audit run passed 1,016 Node tests. The import check also passed. These results apply to that audit snapshot.
- The initial planning inventory found 108 Node test files, including a newer sheet-resolver suite. Other work can add tests during planning. Rebuild the inventory at implementation start; do not claim that the earlier run verified newer cases.
- The Foundry functional suites and browser suites were inspected. Their live flows were not run during the audit.
- The reported Node coverage percentage is not a project-wide coverage measure. It includes test support code and excludes product modules that were never loaded.
- A passing test count is not an acceptance target. Removing duplicate or empty tests can reduce the count while improving coverage.

## Rules for each test

- [ ] Make an inventory of every active test case and every generated input case. Record its feature rule, action, expected result, test layer, and disposition: keep, rewrite, combine, or remove.
- [ ] Name each case by the behavior it checks. Replace names such as "applies correctly", "stable values", and "memoized" with a result that the assertions prove.
- [ ] Give each rule one primary test owner. Keep tests at two layers only when they check different failure points. A calculation test and a real button-to-document test can both be needed.
- [ ] Use expected values fixed from the feature rule. Do not copy the product formula into a test or use the same function to make both actual and expected values.
- [ ] Separate setup, the action under test, and verification. An assertion helper must not change the value that it checks.
- [ ] Make each test independent. It must work alone and with the suite. Use small fixtures, explicit setup, and cleanup after failure.
- [ ] Use parameterized cases for distinct boundaries or supported variants. Do not multiply cases that have the same inputs and the same purpose.
- [ ] Keep static tests where the file itself is the contract, such as valid language data, a supported link, or an import boundary. Use execution tests for behavior claims.
- [ ] For each replacement, identify a plausible defect that must make it fail. For the high-risk replacements below, demonstrate that failure with a temporary controlled change or a deliberately wrong test input. Restore the change before the final checks.

Before implementation, record the source of each expected rule: a current feature specification, a maintained user guide, or an explicit product decision. Current code alone does not establish wanted behavior. Keep disputed rules open until a decision is recorded. Continue work on the other cases.

## Finding map

| ID | Finding | Planned work |
| --- | --- | --- |
| A01 | Browser assertion helpers can write expected values or return without an assertion. | Phase 1: read-only checks, explicit supported fields, errors for unknown fields, and wrong-value checks. |
| A02 | The old modifier suite calls a removed method and uses obsolete document data. | Phase 2: small current fixtures and independent expected modifier results. |
| A03 | Source-text checks claim UI or permission behavior. | Phase 3: real actions and persisted-state checks; retain only valid artifact contracts. |
| A04 | The force-power refund test runs its own filter rather than the refund action. | Phase 2: call the real action and check the remaining purchase and XP. |
| A05 | Exact and overlapping cases repeat the same contract. | Phase 5: assign a primary owner and remove redundant cases. |
| A06 | The minion test copies the old calculation. | Phase 2: independent boundary examples and rule-based properties. |
| A07 | Form, tab-cache, and skill-row tests make weak assertions. | Phase 2: controlled submit races and actual sheet behavior. |
| A08 | The Node boundary guard misses forbidden assignments. | Phase 1: cover the observed syntax and move Foundry-dependent tests to Foundry. |
| A09 | Browser cases contain disputed expectations and omit negative checks. | Phases 2 and 3: settle the rules, then assert both applied and excluded effects. |
| A10 | Smoke arithmetic, simulated bugs, and Cypress placeholders add no useful feature coverage. | Phase 5: remove them and transfer any unique browser coverage. |
| A11 | The newer sheet-resolver tests depend on registry state left by earlier cases. | Phase 2: independent setup and real sheet-selection checks. |

## Phase 1: Make the test tools trustworthy

### Browser assertions

Primary files: [Playwright fixtures](../../../playwright/fixtures.ts) and [active-effect browser tests](../../../e2e/activeEffects.spec.js).

- [ ] Replace the conditional `checkStat` branches with an explicit mapping of supported fields to readable controls or prepared document values.
- [ ] Choose one field spelling for test calls. Support `defense` and `defence` as aliases only where compatibility is required. Cover vehicle speed and every other field used by an existing case.
- [ ] Make unknown field names throw a clear error. No call may return without checking a value.
- [ ] Remove all writes from check methods. Keep field editing in separate action methods.
- [ ] Demonstrate that wrong species characteristics, defense values, and vehicle speed cause failures. Check that verification leaves the document and control values unchanged.

### Node boundary

Primary files: [boundary guard](../../../tests/node/stub-boundary.test.mjs), [Foundry stub](../../../tests/node/_stub/foundry-stub.mjs), and [sheet-option tests](../../../tests/node/sheet-options-path.test.mjs).

- [ ] Move tests that require `foundry.applications`, documents, sockets, or the DOM to the Foundry layer. Keep pure option-selection logic in Node where it can be tested through a small dependency interface.
- [ ] Remove the forbidden `foundry.applications ??=` installation from the Node suite.
- [ ] Make the guard detect direct assignment, nullish assignment, logical assignment, and the object-write forms used in this project. Use a syntax-aware check if regular expressions cannot distinguish code from comments and strings.
- [ ] Add small guard fixtures: each forbidden form is detected; comments, strings, and allowed utility assignments are accepted. Keep these tests as test-tool contracts.
- [ ] Keep the stub small. Do not create a second implementation of Foundry to keep a live feature test in Node.

### Separate Foundry test world

Primary files: [functional harness](../../../tests/ffg-tests.js) and [Playwright configuration](../../../playwright.config.js).

- [ ] Give the Foundry suites a repeatable runner with structured pass, fail, and skip results. A registration error, browser error, or failed Mocha case must fail the run.
- [ ] Create all fixtures in a dedicated test world. Give each run unique fixture names and track the document IDs that it creates. Delete only those documents, including after a failure.
- [ ] Use separate GM, owner, observer, and non-owner sessions where the feature needs them. Keep session files and credentials out of tracked files.
- [ ] Wait for document updates and UI state. Use controlled promises for races. Replace fixed delays where the test can observe completion directly.
- [ ] Record the system version, Foundry version, optional package state, and test selection with each result. Missing required setup must produce an explicit failure or reported skip, never a pass.

## Phase 2: Repair broken and weak behavior tests

### A02: Modifier calculations

Primary file: [old modifier suite](../../../tests/modifiers.test.js).

- [ ] Replace the two obsolete tests and their large fixtures with small documents that use the current `system` schema.
- [ ] Exercise the current modifier entry points. Cover base values, wanted totals, ranked numeric modifiers, non-numeric grants, and the agreed rules for equipped items and active attachment modifications.
- [ ] Use distinctive nonzero values so an omitted modifier or a double application is visible. Assert the exact result and that excluded items contribute nothing.
- [ ] Do not repair the suite by changing only the removed method name. Remove the old fixtures once the replacement cases cover their useful rules.

### A04: Force-power refund

Primary files: [parity tests](../../../tests/node/parity.test.mjs) and [wizard actions](../../../modules/char-creator/pc-wizard.js).

- [ ] In Foundry, invoke the real refund action with two purchased powers that have distinct UUIDs and costs.
- [ ] Assert that the selected power is removed, the other power remains, and available XP increases by the selected cost exactly once.
- [ ] Check the displayed XP and the draft state used for save and resume. Add the defined behavior for a stale target or repeated action.
- [ ] Remove the test-side purchase filter. Keep independent XP calculator tests with their own calculation purpose.

### A06: Minion rules

Primary file: [minion-group tests](../../../tests/node/minion-group.test.mjs).

- [ ] Remove `codexMinionStep` and the comparison against that copied formula.
- [ ] Keep the useful threshold examples. Add independent cases for just below, exactly at, and just above a loss threshold; partial damage; revival; an empty group; a full group; and the defined invalid-input normalization.
- [ ] Assert the wanted properties: one step changes one available unit, partial damage is preserved where required, and counts stay within the group bounds. Do not calculate expected damage with a copy of the implementation.
- [ ] If legacy compatibility remains a requirement, use a small table of independently reviewed expected values.

### A07: Submit, tabs, and skills

- [ ] Replace the weak race in [form-submit coalescing](../../../tests/v2-migration/form-submit-coalesce.test.js). Hold the first write open, submit at least two later values while it is blocked, then release it. Assert two writes for this setup: the first value and the latest queued value. Assert that all callers wait for the final write and receive the defined final result.
- [ ] Add separate cases for a write failure, recovery on a later submit, merged render/close options, and close waiting for persistence. Remove the assertion that can compare a result with itself.
- [ ] Replace the direct `Map.set`/`Map.get` check in [tab-cache tests](../../../tests/v2-migration/sheet-tab-cache.test.js). Select a tab through the sheet, render again, close, and reopen. Assert restoration and isolation from a second document.
- [ ] Strengthen [skill-row tests](../../../tests/v2-migration/sheet-skill-data.test.js). Use known skill definitions and ranks. Assert exact skill IDs, values, and one row per skill on each supported sheet. Check the defined missing-definition fallback and that rendering does not change stored data.

### A09: Disputed rules and missing exclusions

- [ ] Resolve the unequipped armor and weapon soak expectations and species Brawn-to-soak expectation in [active-effect browser tests](../../../e2e/activeEffects.spec.js). Record the rule source before changing expected values.
- [ ] For force powers, signature abilities, and specializations, assert that the learned node applies and the seeded unlearned node does not apply.
- [ ] Cover equip, unequip, edit, and removal as separate state transitions. Assert prepared values and effect records, including the absence of duplicate contributions.
- [ ] If the wanted rule fails, report a product defect and fix it in a separate reviewable change. Do not make the expected value match a known defect.

### A11: Sheet selection

Primary files: [sheet-resolver tests](../../../tests/node/sheet-resolvers.test.mjs) and [default-theme tests](../../../tests/node/gm-default-sheet-theme.test.mjs).

- [ ] Give each registry test fresh state without depending on test order. Use test isolation or a small registry interface; avoid an unrelated product refactor.
- [ ] Test empty registration, matching and nonmatching documents, replacement, and invalid registration independently.
- [ ] Put a failing resolver before a working resolver and prove that the working resolver still selects a sheet.
- [ ] In Foundry, check actual Actor and Item sheet selection: explicit document choice wins, a matching resolver supplies the default, and no match uses the Foundry default.
- [ ] Check the defined per-user and follow-GM theme behavior with the optional sheet package enabled and absent. Replace source-text claims about the selection path after these cases pass.

## Phase 3: Replace source-text behavior claims

Review every source-reading test, including mixed suites. Keep useful executable cases within a file. Remove a source-text behavior assertion only after its replacement passes.

| Current test family | Required behavior and observable result |
| --- | --- |
| `codex-ammo-ui` | Use the actual ammo control. Assert the agreed lower and upper bounds, stored value, rerendered value, and a rejected invalid action. Verification must not write the value. |
| `codex-expanded-cards-preserve`, `codex-portrait-preserve`, `codex-scroll-preservation` | Expand a card or choose a portrait, scroll, then trigger a real update. Assert preserved visible state and that it stays scoped to the correct sheet. |
| `codex-item-adjusted-refresh`, `codex-talent-card-latency` | Edit the underlying item or talent. Assert that the affected displayed value updates and unrelated user state remains. Keep pure dependency-planning tests with a distinct purpose. |
| `codex-item-size`, sheet initial size, minimized close | Open, resize, minimize, close, and reopen supported sheets. Assert the required visible size and close/persistence behavior. |
| `codex-sheet-local-actions`, `codex-specialization-dragdrop`, `editor-orphan-prune` | Perform the action or drop on one of two open sheets. Assert the intended document changes, unrelated documents do not change, and obsolete editor records are removed through their real lifecycle. |
| `observer-sheet-access`, `sheet-options-readonly`, `sheet-options-path` | Use GM, owner, observer, and non-owner sessions. Assert allowed reads and writes, denied writes, correct path-versus-flag storage, and persistence after reopen. |
| `xp-refund-item`, `xp-refund-binding`, `xp-purchase-no-ae-suspension` | Click the real purchase or refund control. Assert the exact item/rank and XP changes, one action per click, and the required effect state. |
| `quality-effect-wiring`, quality provenance and colors | Add or edit a quality through its actual control. Assert generated effects, final actor values, and the required rendered provenance or color. Keep independent data-format contracts. |
| `hyperdrive-resolution-ui`, `obligation-type-refresh` | Change the actual selection. Assert the selected source/type, dependent fields, saved result, and defined cancel behavior. |
| `init-order`, theme registration, CSS defense controls | Start the system and open the relevant sheet. Assert usable registrations and controls. Keep a source check only when it enforces a required import or package boundary. |

- [ ] Review `lang-expansion`, `new-version-notification`, import checks, and similar artifact tests individually. Keep valid data and link contracts. Add live tests only for behavior they also claim.
- [ ] Remove checks that require an internal method name, statement order, or code layout without a separate requirement.
- [ ] Check current feature ownership before edits. If files move during other work, preserve the test purpose at the correct package interface.

## Phase 4: Add missing feature coverage

Each row below defines a group of distinct cases. Add the smallest set of cases that proves its listed rules. Keep the existing useful calculation and validation tests.

| ID | Feature | Missing cases and wanted result | Layer |
| --- | --- | --- | --- |
| G01 | Character creation commit | Complete a build and create a real Actor with the expected items, effects, XP, and credits. Retry the same commit and reuse that Actor. Coalesce concurrent calls in one client. Reject an ID collision with a different stamp without overwriting it. After creation fails, a later retry can proceed. Do not claim atomic exactly-once creation across clients; the current service does not provide it. | Foundry |
| G02 | Draft save and resume | Save, close, reopen, and resume the selected build. Exercise a blocked save with a newer edit, explicit save, lock/unlock, clear, write failure, and retry. Assert the defined durable draft and commit ID. Test stale or missing references and the warning behavior. | Node for pure serialization; Foundry for storage and actions |
| G03 | Preview | Prepare a real unsaved preview. Assert known calculated characteristics, skills, and effects. Assert no new world documents or socket writes. Compare its build values and IDs with the committed Actor, excluding defined transient fields. | Foundry |
| G04 | Talent paths | Directly test `rootConnectedKeys` and `canLearn`: root purchase, valid connected purchase, blocked disconnected purchase, and already learned nodes. Through the real unlearn action, assert removal of disconnected purchases, correct refunds, and preservation of an unrelated branch. | Node plus Foundry |
| G05 | Hyperdrive import | Import representative complete characters with real preparation, matched and unmatched gear, qualities, and attachments. Assert final prepared values and one contribution per effect. Exercise Override, Copy, Cancel, partial resolution, and failure without a false success or damaged original Actor. | Foundry; retain pure parser/resolver cases |
| G06 | SWA and OggDude import | Import small representative fixtures through the real entry points. Assert created documents, mapped skills, equipment, and modifier effects. Cover malformed input and the defined partial-import behavior. A skill-dictionary test alone does not cover import. | Foundry plus pure translation cases |
| G07 | Modifier effect reconciliation | Call `reconcileModifierEffects` on real Items. Assert create, update, delete, duplicate repair, equip/unequip, and rank-change results. Preserve hand-made effects. A second reconciliation makes no further changes. Dry run makes no writes. Cover world, owned, and supported synthetic-token contexts. | Foundry; retain pure plan tests |
| G08 | Damage and critical actions | Start from the real dialog or chat button. Assert target pool changes after soak, Pierce/Breach, and the selected defense; exact resource cost; unaffordable rejection; and the defined critical item/counter result. Check permissions and stale requests at the write boundary. | Foundry; retain arithmetic/request-validation cases |
| G09 | GM bridge and Destiny | Use connected client sessions and actual socket delivery. Assert authorized changes, rejected unauthorized requests, duplicate suppression where specified, overlapping same-Actor updates, independent Actors, and recovery after a failed request. Check the stored Destiny pool and both clients' display. | Foundry with multiple sessions |
| G10 | Minions and vehicles | Use sheet and token controls to lose/revive units and change hull/defense state. Assert prepared group skill ranks, wounds/hull, defense zones, and hardpoint results. Build a crew roll and assert that it uses the selected crew and current values. | Foundry; retain pure boundary cases |
| G11 | Dice workflow | Build and execute a real roll, produce its chat card, replace a die, and reroll through the supported actions. Assert changed results/totals, unchanged unrelated dice, serialized round-trip, and the defined permission limits. Use fixed supplied die results to avoid random failures. | Foundry; retain pure adjacency and total cases |
| G12 | Data models | For every supported Actor and Item type, construct real documents. Assert defaults, type conversion, declared nested paths, and preservation of representative stored values through update and serialization. Historical import-only evidence remains evidence, not a passing feature test. | Foundry |
| G13 | Migrations | Cover a fresh world, current version, every supported migration gate, and unsupported older data. Assert intended conversions, preserved authored data, and idempotence. A player makes no world writes. Define and test version stamping and retry behavior after migration failure. | Foundry with isolated fixtures/settings |
| G14 | Source pools and startup | Assert enabled pack/world sources, exclusions, rarity/restricted filters, and refresh after relevant settings or source changes. Cover startup with optional packages absent and present, plus the user-visible version notice action where required. | Node for pure selection; Foundry for packs, settings, and startup |

## Phase 5: Remove or combine tests with no distinct purpose

| Test or group | Action and removal condition |
| --- | --- |
| `tests/node/smoke.test.mjs`: `1 + 1 === 2` | Remove. The real suite result proves the runner executed. |
| The smoke test for stub `randomID` | Retain only a distinct required utility/boundary contract. Otherwise combine it with the boundary suite or remove it. Do not keep a second general "stub loads" case. |
| `tests/node/gm-bridge-apply.test.mjs`: "without the serializer the same pair loses an update" | Remove the simulated defect test. Keep production serializer concurrency, failure, and independent-key tests. Add G09 for actual bridge integration. |
| `tests/node/quality-effect-plan.test.mjs`: equipped quality and directly attached quality without `active` | Combine the identical setup/assertion into one case. Keep a second direct-versus-attachment case only if its inputs and expected result distinguish the approved rule. |
| Repeated identity cases in `tests/node/parity.test.mjs` | Keep determinism, distinct duplicate-gear IDs, changed commit IDs, and normalization contracts in their primary suites. Remove redundant copies after checking that no unique assertion is lost. Keep preview-to-commit ID comparison and the meaningful projection edge case. |
| Test-side force-power refund and copied minion algorithm | Remove after the Phase 2 replacements pass. |
| Large obsolete modifier fixtures | Remove after the small current modifier cases cover their useful rules. |
| Source-text assertions for UI actions, permissions, or persistence | Remove after the matching Phase 3 behavior cases pass. Keep legitimate import, language, link, and artifact contracts. |
| Direct cache round-trip and weak nonempty skill assertions | Replace with the Phase 2 sheet cases. Keep no duplicate "Map works" or "some row exists" case. |
| Commented Cypress item cases and folder-only placeholders | Remove the dead cases. Transfer any unique startup, Actor creation, and Item creation coverage to Playwright, including persisted values after reopen. Use folders only as fixture setup. |
| Cypress runner, support files, and dependency | Remove only after all useful Cypress contracts have a passing replacement. Update the lockfile and CI comments that refer to it. Do not restore obsolete cases by uncommenting them. |

## Delivery order

Implement in small reviewable batches. No batch begins under this plan-only request.

1. Inventory all cases, assign primary owners, and record open rule decisions.
2. Repair browser assertions and the Node boundary. Establish repeatable Foundry results and fixture cleanup.
3. Replace broken modifier/refund cases, copied minion logic, weak Foundry checks, and order-dependent registry cases.
4. Replace UI source checks and settle the disputed active-effect expectations.
5. Add G01-G14. Start with creation/save, imports, reconciliation, damage/authority, and migrations because they write user data. Complete the remaining rows before closing the plan.
6. Remove redundant cases and the unused Cypress runner after their replacement conditions are met.
7. Run final validation and reconcile the inventory with every audit finding and coverage gap.

Keep a disposition and replacement reference for each case. Report product defects separately from test defects. Preserve concurrent work. Test and internal-plan changes do not need a user-facing changelog entry. If a product fix changes visible behavior, include the required changelog and tutorial updates in that fix.

## Completion checks

- [ ] Every existing case has a reviewed purpose and disposition. Every retained or added case has a specific action and observable expected result.
- [ ] Every finding A01-A11 and gap G01-G14 has passing evidence, or an explicit unresolved rule/defect. Unresolved entries mean the plan is incomplete.
- [ ] Assertions do not change the values they verify. Unknown browser fields fail. No test calculates its expected result with a copied product algorithm.
- [ ] Replacement tests fail for their identified representative defect. Exact duplicates, empty runner checks, and simulated-defect demonstrations are removed.
- [ ] Node tests pass in the supported CI environment. `npm run check:imports` passes. Run lint on changed product files if implementation changes them.
- [ ] Foundry functional and Playwright tests pass in the separate test world on the supported version matrix. Report each tested version and optional-package state. Record all skips and missing environments explicitly.
- [ ] Changed cases pass alone and with their suite. Controlled race cases prove ordering without relying on elapsed time. Repeat only where an unresolved timing concern requires it.
- [ ] The Foundry run leaves no test documents, changed world settings, or open test sheets behind. Cleanup restores only state owned by the run.
- [ ] Coverage reports separate product code from tests and tools, include never-loaded product modules, and show the untested paths. Use them to check the feature inventory; do not use a single percentage or test-count target as proof of completion.
- [ ] The final report lists tests added, rewritten, combined, and removed; the feature rules each group covers; executed checks; remaining gaps; and any product fixes.
