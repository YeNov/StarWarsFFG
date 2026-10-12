# Inventory: slice `foundry-browser`

Task 1b classification of the in-Foundry Mocha suites (F), Playwright (P), Cypress (C) and the "scripts that print output" for the [test suite audit remediation plan](../../2026-10-11-test-suite-audit-remediation.md).

| | |
| --- | --- |
| Slice | `tests/*.test.js`, `tests/v2-migration/*.test.js`, `codex/tests/browser/*.test.js` (ids F0001-F0074, 74 listed rows = 97 cases once loop-generated cases are expanded); `e2e/*.spec.js` + `playwright/*` (P0001-P0017, 17 cases, one of which generates 3 inputs); `cypress/e2e/*.cy.js` + `cypress/support/*` (C0001-C0018: 2 active, 16 commented-out); the 20 "scripts that print output" |
| Based on | [`cases.md`](cases.md), generator header commit `813ed82c` (listing committed in `104e277b`). Ids are positional: cite them only with that commit. |
| Verified | The F, P and C ids and names match `cases.md`. The pure suites were run unmodified in Node from a scratch runner outside the repo (F0014 and F0015 fail, the other 35 pure cases pass). F0049's weakness was shown on a scratch copy of `modules/helpers/talent-tree.js`. The Playwright and Cypress claims are read from source: neither runner was started. No repo file was changed. |

Dispositions: `keep`; `keep+rename`; `rewrite`; `combine`; `remove`; `move-to-foundry` (not needed in this slice: every F/P case already runs in Foundry). Where a disposition is conditional the condition is in the notes (for example Phase 5 removals wait for their replacement).

Rule-source shorthand: `CL <ver>` = `CHANGELOG.md` block, with a short quote; `SPEC-CRIT` = `docs/crit_trauma_helpers_spec.md`; `SPEC-TREE` = `docs/superpowers/specs/2026-05-23-talent-tree-purchase-order-design.md`; `SPEC-DICE` = `docs/superpowers/specs/2026-07-18-dice-replacement-design.md`; `SPEC-SUBMIT` = `docs/superpowers/specs/2026-05-31-v2-port-known-issues-design.md` (D1.a); `PLAN-V2` = `docs/superpowers/plans/2026-05-31-v2-full-migration.md`; `FFG CRB` = the Star Wars FFG core rulebook; `code-only` = no checkable source beyond the current code or a test-file comment.

Ids written `F0004[character]` are the loop-expanded cases of one listed row (see "Generated cases"). Layer `Foundry Mocha` = a suite run by the in-Foundry harness `tests/ffg-tests.js`.

## Counts

| Group | Files | Listed rows | Cases after expansion | Exception rows |
| --- | ---: | ---: | ---: | ---: |
| F: test files + harness files | 13 + 2 | 74 | 97 | 28 |
| P: spec + helper/config files | 1 + 3 | 17 | 19 (P0008 generates 3 inputs) | 20 (17 cases + 3 generated inputs of P0008) |
| C: specs + support/config files | 3 + 4 | 18 | 18 | 18 |
| Scripts that print output | 20 | n/a | n/a | n/a (table below) |
| Total | 46 file rows | | | 66 |

Open rule decisions: 6 (D-01 to D-06). New findings not in the plan: 13 (NF-01 to NF-13).

Plan finding coverage in this slice: A01 `playwright/fixtures.ts` with P0001, P0009, P0010, P0012, P0013, P0017; A02 F0014-F0015; A05 the pairs in NF-05; A07 F0006, F0067, F0073, F0074; A09 P0001, P0004, P0006, P0007, P0009, P0012, P0013; A10 all of C0001-C0018; A03, A06, A08, A11 have no case in this slice (nothing here reads source text to claim behavior); A04 has no direct case, only the new instances in NF-01 and NF-02. Gaps touched: G04 (talent tree), G07 and G12 (effects, defaults), G08 (crit arithmetic), G11 (dice), G14 (startup).

## F: Foundry Mocha files

Column order: `file (ids) | layer | kind | feature rule(s) | action under test | expected result | rule source | default | finding/gap | notes`.

| file (ids) | layer | kind | feature rule(s) | action under test | expected result | rule source | default | finding/gap | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/ffg-tests.js` (no cases) | Foundry Mocha harness | tool-contract | Every registered suite runs and its failures are visible; a package suite that fails to load must fail the run | Build a Mocha run from the imported suites plus suites that packages add through the `starwarsffg.functionalTests` hook; render pass/fail counts | Window shows PASSES / FAILURES and the stack of each failed case | Plan Phase 1 "Separate Foundry test world" | rewrite | Phase 1 | Registers 10 system suites; Codex adds 3 through `codex/tests/browser/index.js`. A package registration error is caught and only logged (Phase 1 requires it to fail the run). No structured result is exposed to a runner. Creates fixtures in whatever world opens it. The launcher macro is created only when `game.data.system.data.test` is set, which is the pre-V10 shape: see NF-07. |
| `codex/tests/browser/index.js` (no cases) | Foundry Mocha harness | tool-contract | Codex's three browser suites are collected by the system harness | Call the three `Codex*Tests` registration functions | n/a (glue) | `docs/superpowers/plans/2026-10-11-codex-module-split.md` (Task 8 hook contract) | keep | none | Re-check when Codex becomes a separate module: the hook contract is the interface. |
| `tests/common.test.js` (F0007) | Foundry Mocha | exec (pure, imports unstubbed in Node) | `Helpers.diff(a, b)` returns, for each key of `a` whose value differs in `b`, the value from `b` | `Helpers.diff({a:1},{b:1})` | `{a: undefined}` | code-only (JSDoc "Returns the difference between object 1 and 2") | keep | none | `Helpers.diff` has no caller in the product (only its own recursion): see D-01. One input only: no nested, equal or array case. |
| `tests/crit-trauma-counter.test.js` (F0008-F0013) | Foundry Mocha | exec (pure, imports unstubbed in Node) | A critical injury's healing attempts use a 7-day cooldown per path; a missing stamp means attemptable now; a rewound clock clamps days left at 7; Resilience starts after a rest week from `receivedDay`; Medicine is independent; the Mechanics path exists only when the vehicle weekly limit is on | `availFor(stamp, day)` and `computeCritAvailability(system, day, vehicleLimit, canSelfHeal)` | Exact `{attemptable, daysLeft}` shapes and the three path results | SPEC-CRIT (Q11 null = attemptable now; rewind clamp; `vehicleCritWeeklyLimit`); `CL 2.1.0` "Crit-Trauma weekly recovery counter" | keep | G08 (arithmetic cases to retain) | Suite title is pinned by a comment ("exact parent title used by the verification filter"), so renaming the suite needs that filter checked. No just-below-boundary case (6 days elapsed). `canSelfHeal` and `pips` are never asserted. Verified passing in Node. |
| `tests/modifiers.test.js` (F0014-F0015) | Foundry Mocha | exec (pure) but broken | A characteristic's total adds learned-talent modifiers to the species base; the base value comes only from the species | `getCalculateValueForAttribute` and `getBaseValue` on ~800-line fixtures | Brawn total 4; species base 2 | code-only | rewrite | A02 | Both cases fail today (checked in Node): F0014 calls a removed method; F0015 reads `item.system` but the fixture only has `item.data`. ~1,600 of the file's 1,649 lines are fixture. Replacement: Phase 2 A02. |
| `tests/replace-die.test.js` (F0016-F0038) | Foundry Mocha | mixed: F0016-F0023, F0025, F0027, F0029-F0032 have pure bodies; F0024, F0026, F0028, F0033-F0038 need Foundry `CONFIG`, dice classes or `foundry.utils` | The dice-replacement data layer: FFG totals with cancellation, per-face tally, splice of a replacement die, audit capture, `RollFFG.modifications` round trip | See "Case groups: replace-die" | See groups | SPEC-DICE (§5.1, §5.2); FFG CRB (successes cancel failures, advantage cancels threat, light/dark never cancel, Triumph counts as a success, Despair as a failure); `CL 2.1.0` "adjust a posted roll from chat" | keep | G11 (retain pure adjacency and total cases) | Static in `cases.md` (module needs `foundry` at import). No loop inside: the 23 listed rows are the 23 cases. Suite is the largest correct pure-logic set in the slice. Exceptions below. |
| `tests/talent-tree.test.js` (F0039-F0066) | Foundry Mocha | exec (pure, imports unstubbed in Node) | A node is purchasable iff unlearned and (a root, or an adjacent learned node is joined by an active link); Force/Signature trees have an implicit parent above row 0; multi-column upgrades use `sizeInt` or the raw `.size` string | `canPurchaseNode(tree, key, opts)` on hand-built trees | `true`/`false` | SPEC-TREE ("Rule"); `CL 2.1.0` "talent trees enforce connectivity"; commit `0092a34f` for Force row 0 (the spec was not updated: D-06) | keep | G04 (direct tests of the pure rule) | Groups: F0039-F0049 specialization/basic edges, F0050-F0054 Force `sizeInt` walks, F0055-F0061 raw `.size` click-guard path, F0062-F0066 row 0. All 28 pass in Node. Signature-ability trees (also `rootHasImplicitParent`) have no case. Exceptions below. |
| `tests/v2-migration/form-submit-coalesce.test.js` (F0067) | Foundry Mocha | exec (real gear sheet, stubbed `_getSubmitData`/`_updateObject`/`form`) | Concurrent submits coalesce: an initial write plus one catch-up with the latest data; every caller awaits the same flush | Two `_onSubmit` calls in the same tick on a real `Item` sheet | `calls <= 2`, last data `v:2`, `r2` equals `r1 ?? r2` | SPEC-SUBMIT D1.a ("initial + one coalesced catch-up") | rewrite | A07 | `calls` may be 1; `r1 ?? r2` compares a value with itself when `r1` is nullish. Creates a world Item with a fixed name. Replacement: Phase 2 A07 (blocked first write). |
| `tests/v2-migration/sheet-tab-cache.test.js` (F0074) | Foundry Mocha | exec (reads and writes the class `Map`) | The last selected tab is remembered per document and restored on reopen, without leaking to another document | Read the cache key; `Map.set` then `Map.get`; compare a second item's key | Key contains the item uuid; `get` returns what was `set`; second item has another key and no entry | PLAN-V2 (active-tab cache keyed by class and uuid); `CL 2.1.6` "stuck on the first tab" is a separate Codex fix | rewrite | A07 | The round trip tests `Map`, not the sheet. Replacement: select a tab through the sheet, re-render, close, reopen (Phase 2 A07). |
| `tests/v2-migration/sheet-initial-size.test.js` (F0070-F0072) | Foundry Mocha | exec (unrendered stock sheets) | A stock actor sheet takes its per-type default size on the first `getData` and keeps a size set after that across later `getData` calls | Construct `ActorSheetFFG`/`AdversarySheetFFG`; `getData`; write `position.width/height`; `getData` again | Size equals the post-resize value; first call equals `CONFIG.FFG.sheets.defaultWidth/Height[type]` | code-only (test header: issue #14; no CHANGELOG entry) | rewrite | Phase 3 | Helper `assertSizeSurvives` writes the value it then checks and nothing renders or resizes. F0070 expands to 6 types; F0072 loops 3 types inside one case. Row owner: Phase 3 row "codex-item-size, sheet initial size, minimized close". |
| `tests/v2-migration/sheet-skill-data.test.js` (F0073) | Foundry Mocha | exec (unrendered stock sheet) | The actor sheet shows one skill row per defined skill even when stored `system.skills` is empty | `new ActorSheetFFG(...).getData()` on a character with `skills: {}` | `skills.length > 0` and `rows.length > 0` | code-only (test header); `modules/actors/actor-sheet-ffg.js` drops skills that are neither custom nor in `CONFIG.FFG.skills` | rewrite | A07 | Weak: any single row passes. Needs exact ids, one row per skill, the drop rule for undefined skills, and unchanged stored data. |
| `tests/v2-migration/minimized-close.test.js` (F0068-F0069) | Foundry Mocha | exec (real `close()` overrides, parent `close` stubbed) | A window that is already minimized closes without the close animation; otherwise the normal animation is kept | Call each class's `close({})` with `minimized` true or false and read the options passed to the parent | `options.animate === false` when minimized; no `animate` key otherwise | code-only (test header: ApplicationV2 close waits up to 1000 ms) | keep | Phase 3 | F0068 and F0069 each expand to 8 classes (16 cases). Proves the option is passed, not that the window closes at once; Phase 3 adds one real minimize-then-close owner and this unit layer then checks a different failure point (override present). Patches the shared parent prototype and restores it in `finally`. |
| `codex/tests/browser/codex-schemes.test.js` (F0001-F0003) | Foundry Mocha (Codex) | F0001 exec on the real settings registry; F0002-F0003 exec on prototype methods with a fake `this` | The two Eldritch Horror schemes are registered with fixed labels and as theme choices; the legacy `eldritch` flag resolves to Scholar; both variants also carry the base `scheme-eldritch` class | Read `CDX_SCHEMES`, `CDX_SCHEME_LABELS`, the `defaultSheetTheme` choices; call `_cdxScheme` and `_getLegacyRootClasses` | Literal label strings and class lists | `CL 2.1.0` "two Eldritch Horror variants (Scholar and Fate)"; code comments in `codex/scripts/codex-sheets.js` ("legacy → the paper variant") | keep | none | F0002-F0003 call private methods with a fake `this`; acceptable as unit checks, and a rendered-sheet check belongs to the Phase 3 "theme registration" row. |
| `codex/tests/browser/sheet-initial-size.test.js` (F0004-F0005) | Foundry Mocha (Codex) | exec (unrendered Codex sheets) | Same rule as F0070-F0072 for `CodexActorSheet` and `CodexAdversarySheet` | Same as F0070-F0072 | Same | code-only (test header: issue #14) | rewrite | Phase 3 | Body copied from the stock suite (A05 pairing F0004 with F0070, F0005 with F0071). F0004 expands to 5 types (no `homestead`: it keeps the stock sheet per `CL 2.1.0`). Codex is its own package, so the shared helper cannot be imported across the split. |
| `codex/tests/browser/sheet-skill-data.test.js` (F0006) | Foundry Mocha (Codex) | exec (unrendered Codex sheet) | Same rule as F0073 for `CodexActorSheet` | Same as F0073 | Same weak counts | code-only | rewrite | A07 | Copy of F0073, same fixture actor name. |

### Case groups: replace-die (`tests/replace-die.test.js`)

| ids | rule | action | expected | rule source |
| --- | --- | --- | --- | --- |
| F0016-F0022 | `computeFFGTotals`: success/failure and advantage/threat cancel; light/dark never cancel; added Triumph adds a success, added Despair a failure; a negative added result is subtracted; empty input is all zeros | Call with hand-built tallies and `addedResults` | Exact counts per symbol | FFG CRB; SPEC-DICE §5.2 (F0021 expectation: D-05) |
| F0023-F0026 | `faceTally`: returns the stored tally; recovers from `CONFIG.FFG.PROFICIENCY_RESULTS` when absent; null for inactive or malformed faces and never throws | Call with stand-in faces | Stored object; table entry plus `triumph === 1`; `null` | SPEC-DICE §5.2 |
| F0027-F0028 | `recomputeTermFFG` aggregates `results[].ffg` and agrees with the die's own `evaluate()` total | Hand-built term; random `evaluate()` of 3 Boost dice | Summed tally; equal to the die's tally | SPEC-DICE §5.2 |
| F0029-F0032 | `spliceReplacement` (model adapters): a cross-denomination replace splits the term and keeps flanking operators; a same-denomination replace swaps in place | Splice a fresh term into hand-built terms | Order of denominations, same operator objects, remaining results | SPEC-DICE §5.2 |
| F0033-F0034 | `spliceReplacement` (live): real `RollTerm`s, serializable, correct order; same-denomination takes the swap branch | Evaluate real dice, splice | Term count, constructor denominations, same references | SPEC-DICE §5.2 |
| F0035-F0036 | Audit capture records a removed face's tally, zeros for a malformed face | Run `deepClone(faceTally(...) ?? zeroTally())` written in the test | Table entry; `zeroTally()` | SPEC-DICE §5.2 (the expression is the product's `ReplaceDie._original`, which the tests do not call) |
| F0037-F0038 | `RollFFG.modifications` survives `toJSON`/`fromData` and defaults to `[]` | Round trip a roll | Deep-equal list; `[]` | SPEC-DICE §5.1; `CL 2.1.0` "adjust a posted roll from chat" ("Changes persist for every client") |

## Generated cases (loop expansion of `${...}` rows)

The listed row stands for the cases below; each keeps the disposition of its parent row (see exceptions).

| parent | expanded id | file | generated name | input |
| --- | --- | --- | --- | --- |
| F0004 | F0004[character] | `codex/tests/browser/sheet-initial-size.test.js` | Codex sheet keeps its size across re-renders — character | `CODEX_ACTOR_TYPES[0]` |
| F0004 | F0004[rival] | same | ... — rival | `CODEX_ACTOR_TYPES[1]` |
| F0004 | F0004[nemesis] | same | ... — nemesis | `CODEX_ACTOR_TYPES[2]` |
| F0004 | F0004[minion] | same | ... — minion | `CODEX_ACTOR_TYPES[3]` |
| F0004 | F0004[vehicle] | same | ... — vehicle | `CODEX_ACTOR_TYPES[4]` |
| F0070 | F0070[character] | `tests/v2-migration/sheet-initial-size.test.js` | legacy sheet keeps its size across re-renders — character | `ALL_ACTOR_TYPES[0]` |
| F0070 | F0070[minion] | same | ... — minion | `ALL_ACTOR_TYPES[1]` |
| F0070 | F0070[vehicle] | same | ... — vehicle | `ALL_ACTOR_TYPES[2]` |
| F0070 | F0070[homestead] | same | ... — homestead | `ALL_ACTOR_TYPES[3]` |
| F0070 | F0070[rival] | same | ... — rival | `ALL_ACTOR_TYPES[4]` |
| F0070 | F0070[nemesis] | same | ... — nemesis | `ALL_ACTOR_TYPES[5]` |
| F0072 | F0072[character] | `tests/v2-migration/sheet-initial-size.test.js` | first getData still applies the per-type default size (inner loop, one case) | `character` |
| F0072 | F0072[vehicle] | same | same inner loop | `vehicle` |
| F0072 | F0072[minion] | same | same inner loop | `minion` |
| F0068 | F0068[document sheets] | `tests/v2-migration/minimized-close.test.js` | document sheets close instantly when already minimized | `FFGDocumentSheet`, minimized |
| F0068 | F0068[form applications] | same | form applications close instantly when already minimized | `FFGFormApplication` |
| F0068 | F0068[data importer] | same | data importer close instantly when already minimized | `DataImporter` |
| F0068 | F0068[SWA importer] | same | SWA importer close instantly when already minimized | `SWAImporter` |
| F0068 | F0068[skill-list importer] | same | skill-list importer close instantly when already minimized | `SkillListImporter` |
| F0068 | F0068[character creator] | same | character creator close instantly when already minimized | `CharacterCreator` |
| F0068 | F0068[pop-out editor] | same | pop-out editor close instantly when already minimized | `PopoutEditor` |
| F0068 | F0068[roll builder] | same | roll builder close instantly when already minimized | `RollBuilderFFG` |
| F0069 | F0069[document sheets] ... F0069[roll builder] (8) | same | `${label}` keep normal close animation when not minimized | the same 8 classes, not minimized |

`F0072` is one case today with three inputs: the first failing type hides the others. Total after expansion: 74 listed rows - 4 loop rows + (5 + 8 + 8 + 6) = 97 cases. F0072's 3 inner inputs are not counted in 97 (it stays one case until it is split).

## P: Playwright files

| file (ids) | layer | kind | feature rule(s) | action under test | expected result | rule source | default | finding/gap | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `e2e/activeEffects.spec.js` (P0001-P0017) | Playwright against a live Foundry world (GM session) | exec (real UI actions; P0008 also reads prepared values) | Items and their modifiers reach the owning actor's stats, skill pools, encumbrance and vehicle values | Create an actor and item in the UI, set stats or modifiers, drag the item onto the actor, equip | Stat inputs or skill-pool hover text show the expected numbers | per case, below | rewrite | A01, A05, A09, G07 | All 17 names say "applies correctly". Cleanup runs at the end of 16 of 17 cases, not in `finally` (only P0008 cleans up after failure). Six fixed `setTimeout` waits of 200 ms in P0012-P0013. `test.beforeEach` expects the "Loading" text to appear and then vanish, which is a timing assumption. |
| `playwright/fixtures.ts` (helper) | Playwright | tool-contract | Check helpers read the state they name and never change it; unknown names fail | `Actors`/`Items` page objects: create, edit, `checkStat`, `setStat`, cleanup | Locator reads, `toHaveValue` | Plan Phase 1 "Browser assertions" | rewrite | A01 | See "Fixture defects" below. `remove()` deletes every document with the given name, not the ones the run created. Two 505 ms sleeps (`Items.closeSheet`, `addTalentModifier`). `switchTab` and `setStat` ignore unknown names silently. |
| `playwright/setup.ts` (helper) | Playwright global setup | tool-contract | Join the world as Gamemaster and save the session | Open `/join`, pick Gamemaster, wait for the chat box, write `storageState` | A session file (git-ignored `state.json`) | Plan Phase 1 ("Keep session files and credentials out of tracked files") | keep | Phase 1 | Contains a commented-out older login block with placeholder credentials: delete it. No guard against pointing `PLAYWRIGHT_BASE_URL` at a live world (Cypress has one): NF-08. One GM session for every test. |
| `playwright.config.js` (config) | Playwright | tool-contract | Serial run, one Chromium project, base URL from `PLAYWRIGHT_BASE_URL`, session from `state.json` | n/a | n/a | n/a | keep | Phase 1 | `fullyParallel: false` because tests share one world and fixed names. Not in `package.json` scripts and not in CI. |

### P case detail

| id | feature rule | action | expected (as asserted) | rule source |
| --- | --- | --- | --- | --- |
| P0001 | Worn armour adds its soak and defence and counts 3 less toward encumbrance; armour that is only carried adds neither | Armour item: encumbrance 5, defence 1, soak 2; drag to character; equip | Carried: encumbrance 5, soak 0, ranged defence 0. Worn: encumbrance 2, ranged 1, melee 1, soak 2. Item-sheet `defense` check asserts nothing | FFG CRB (Armor: worn armour is 3 less encumbrance; soak and defence); `modules/actors/actor-ffg.js` ("adjusted - 3"); `CL 2.1.0` "gear resyncs its effects on the carried toggle" |
| P0002 | A career's `Skill Add Advantage` modifier reaches the actor's skill pool | Career with Gunnery +1, drag to actor | Gunnery pool text contains "1 Advantage" | code-only (item-modifier feature, `ModifierHelpers.getModKeyPath`) |
| P0003 | A critical injury's `Skill Add Success` modifier reaches the actor | Crit injury Melee +2, drag | Melee pool text contains "2 Success" | code-only; FFG CRB (critical injuries impose lasting effects) |
| P0004 | Only learned force-power upgrades apply their modifiers | Upgrade 0 (unlearned): Cool despair 3. Upgrade 1 (learned): Computers success 2. Drag to actor | Computers contains "2 Success". Nothing checks that Cool gained no despair | code-only; A09 |
| P0005 | Carried gear applies its modifier without being equipped | Gear with Charm advantage 2, drag | Charm contains "2 Advantage" | `CL 2.1.0` "gear resyncs its effects on the carried toggle"; code-only |
| P0006 | Only a learned signature-ability upgrade applies | Upgrade 0 unlearned Cool despair 3; upgrade 1 learned Medicine success 1 | Medicine contains "1 Success"; Cool exclusion unchecked | code-only; A09 |
| P0007 | Only a learned specialization talent applies | Talent 0 unlearned Cool despair 3; talent 1 learned Perception boost 3 | Perception contains "3 boost" (lower-case word, unlike the others); Cool exclusion unchecked | code-only; A09 |
| P0008 | Base modifiers entered in the pop-out editor of an embedded specialization, force power or signature ability reach the actor's prepared skills | Embed a world item, edit it, add `Skill Add Success` +1 on Perception, Computers or Medicine | Prepared `system.skills[skill].success === 1` for each | `CL 2.1.0` "Pop-out modifier edits are no longer overwritten by an asynchronous re-render" |
| P0009 | A species grants its characteristics, and wound and strain thresholds are species base plus Brawn and Willpower | Species Wounds 10, Strain 20, Brawn 1, Agility 2, Intellect 3, Cunning 3, Willpower 2, Presence 1; drag to actor | Wounds max 11, strain max 22, six characteristics. Soak 1 (Brawn) is commented out. The eight item-sheet checks write the value instead of checking it | FFG CRB (thresholds, Soak = Brawn + armour); `modules/actors/actor-ffg.js` ("Wound Threshold - Species WT + Brawn"); D-03 |
| P0010 | A talent's `Stat`/`Strain` +3 modifier raises the strain threshold | Talent with Strain +3, drag | `checkStat('Strain','3')` is not a supported field: nothing is asserted | FFG CRB (talents such as Grit raise the strain threshold); `getModKeyPath` maps `Stat`/`Strain` to `stats.strain.max`; D-04 |
| P0011 | A carried weapon adds its encumbrance | Weapon encumbrance 5, drag | Current encumbrance 5 | FFG CRB (Encumbrance) |
| P0012 | An attachment's modifier and an item modification's modifier on armour reach the owner; enabling a modification inside an attachment adds again once equipped | Attachment Soak +1 on armour; drag armour; add modification Defence-Melee +1; enable it inside the attachment; equip | Soak 1 while unequipped (a TODO says 0); melee 1, then 2 after equip; `defence.ranged` 0 never asserted (4 calls across P0012 and P0013) | code-only; disputed: D-02 |
| P0013 | Same contract as P0012 for a weapon | Same flow with a weapon | Same as P0012 | code-only; D-02 |
| P0014 | A vehicle critical-damage modifier `Vehicle Stat`/`Armor` +1 raises vehicle armour | Drag to the vehicle's components tab | Armour value 1 | code-only |
| P0015 | A ship attachment adds its encumbrance and uses its hard points | Attachment encumbrance 5, hard points 3 | Current encumbrance 5; customization hard points -3 | FFG CRB (starship hard points); code-only for the sign |
| P0016 | A ship weapon's `Vehicle Stat`/`Armour` +3 raises vehicle armour | Drag to the vehicle | Armour value 3 | code-only |
| P0017 | A ship-weapon attachment's `Vehicle Stat`/`Speed` +1 reaches the vehicle only once the weapon is on it | Attach to the weapon; check speed 0; drag the weapon; check speed 1 | Both `checkStat('speed', ...)` calls assert nothing | code-only; `getModKeyPath` maps Speed to a threshold path; D-04 |

### Fixture defects (`playwright/fixtures.ts`; all map to A01)

| defect | call sites |
| --- | --- |
| `Actors.checkStat` has no branch for the name and returns without asserting | `speed` (P0017 x2), `Strain` (P0010 x1), `defence.ranged` (spelled with a c: P0012 x2, P0013 x2; only `defense.ranged` is handled) |
| `Items.checkStat` rewrites `defense` to `defence`, then looks the name up in a list that holds `defense`: no assertion | `defense` (P0001 x1) |
| `Items.checkStat` calls `fill()` for characteristics, Wounds and Strain: it writes the value it should check and asserts nothing | P0009 x8 (Wounds, Strain, Brawn, Agility, Intellect, Cunning, Willpower, Presence) |
| `Actors.switchTab`, `Items.switchTab` and `Items.setStat` ignore unknown names silently | any mistyped name |

## C: Cypress files

| file (ids) | layer | kind | feature rule(s) | action under test | expected result | rule source | default | finding/gap | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cypress/e2e/00_init.cy.js` (C0001) | Cypress against a live world | exec, but the body only logs | The world boots with the game and canvas ready and the Destiny menu present | `cy.setup`, `cy.join`, `cy.initializeWorld` in hooks; the case logs | Assertions live in `waitUntilReady` (game ready, canvas ready, `#destinyMenu`) | code-only (comment: "Having this test run first more accurately estimates test durations") | remove | A10 | Gate: transfer the three readiness checks to a Playwright startup case first (G14 startup, Phase 5). |
| `cypress/e2e/01_create_entities.cy.js` (C0002, C0003) | Cypress | exec (C0002); commented-out placeholder (C0003) | A GM can create a character in a folder and its sheet opens with basic data | Delete any "actors" folder, create the folder, create a character, check the sheet | `.profile-img`, drag note and two tabs visible | code-only | remove | A10, G12 | Selectors are the pre-V13 DOM (`#sidebar-tabs`, `.dialog-button`, `.window-content > .dialog-buttons`). Last substantive edit was the V11 compatibility commit `4d7cdfab`. `CL 2.1.0` says "dialogs, form applications and sheets are native V2". Never run here: presumed stale. Destructive "Delete All" on a folder. |
| `cypress/e2e/02_test_items.cy.js` (C0004-C0018) | Cypress | exec (C0004); commented-out (C0005-C0018) | Each item type can be created in a folder and its sheet opens with default fields | C0004 deletes then creates the folder "test items"; the rest create one item per type | C0004: nothing beyond the dialog closing. C0005-C0018: name field and a few labels or defaults | code-only | remove | A10, G12 | File comment: "this should be 01, not 02". C0004 deletes a folder that must already exist, so it fails on a fresh world. Default values worth transferring: see C0008-C0018 rows. |
| `cypress/support/commands.js` | Cypress support | tool-contract | `setup`, `join`, `waitUntilReady`, `initializeWorld` | Drive the license, admin auth, install, world launch, join | Pages reached | n/a | remove | A10 | Gate: Phase 5 "Cypress runner, support files and dependency". Holds a literal admin-key string in `authenticatesAsAdmin` (NF-11). Readiness logic is the only reusable part (see C0001). |
| `cypress/support/common.js` | Cypress support | tool-contract | `cleanup_actors`, `clear_chat` | n/a | n/a | n/a | remove | A10 | Neither export is imported anywhere: dead now, not after the runner goes. |
| `cypress/support/e2e.js` | Cypress support | tool-contract | Refuse to run unless `--env expectBaseUrl` equals the resolved base URL | `before()` guard | Throw on mismatch | commit `37994243` ("fail-closed baseUrl guard") | remove | Phase 1 | Gate: carry the guard idea to Playwright first (NF-08). |
| `cypress.config.js` (config) | Cypress | tool-contract | Base URL, viewport, 60 s command timeout | n/a | n/a | n/a | remove | A10 | Remove with the runner, `package.json` dependency, lockfile entry and the two CI comments that mention Cypress. |

## Scripts that print output (never automated tests)

Disposition values: `keep as evidence`, `convert` (the claim becomes an asserted case in the named plan row, the script stays as evidence), `remove`. The 17 evidence scripts need a Foundry install (`FVTT_APP`, `FVTT_SYS`) or a copy of a world database; none runs in CI. Paths are under `docs/superpowers/plans/artifacts/2026-07-14-datamodel-evidence/` unless they start with `tools/`.

| path | what it claims to check | disposition | notes |
| --- | --- | --- | --- |
| `audit.js` | Per-path present/absent counts in raw stored documents for a hand-listed set of undeclared paths | keep as evidence | README: a hand-built list assumed 10 dropped paths where `generic-audit.mjs` found 2088. Superseded, kept for the record. |
| `bars.js` | Which token bar attributes are stored per actor type | remove | Not in the README; one-off query. `rival-bar2.mjs` covers the related follow-up. |
| `changed-audit.mjs` | Which leaf values the model changes (type coercion) | keep as evidence | Documented. Pair with `generic-audit.mjs`; it drops nothing it does not name. |
| `coercion-detail.mjs` | Every distinct before-after pair per coerced path, flagging lossy ones | keep as evidence | Not in the README table: add a row. |
| `compare.js` | Backup vs live: any stored leaf path lost (the data-loss test) | keep as evidence | Needs two database directories. Exits 1 only on its own errors, not on loss. |
| `corrupt-armour.js` | Lists armour records whose stored defence or soak is non-numeric | keep as evidence | Not in the README. The default pack id is a personal data-module id: see NF-11. |
| `decisive.js` | Documents saved after the cutover still carry undeclared fields | keep as evidence | Hard-coded cutover timestamp. |
| `generic-audit.mjs` | Every stored document, built against its real model, drops which leaf paths | keep as evidence | G12 supplies the asserted counterpart (construct real documents, assert declared paths survive). |
| `import-test.mjs` | `index.js` → conformance report → models registry resolves with no cycle | convert | Prints `typeof` lines only. The import boundary is covered by `npm run check:imports` and the import-graph Node tests; the execution claim moves to G12 or is dropped. |
| `model-probe.mjs` | What the real model class does to one synthetic stored payload | keep as evidence | Exploratory probe. |
| `newdocs.js` | Documents created after the cutover still carry undeclared fields | keep as evidence | Hard-coded cutover timestamp. |
| `probe.js` | Key layout of a world database | keep as evidence | Documented as a smoke probe. It is neither a test nor a feature check. |
| `prove-fix.mjs` | With fields declared, the prepared view shows values that were stored | convert | The claim is assertable on fixture documents (G12: preservation of stored values). |
| `rival-bar2.mjs` | A rival's secondary token bar resolves to the manifest's secondary attribute after the fix | convert | G12/G10: assert the prototype-token bars on real rival documents. |
| `rival-strain.js` | Distinct stored strain shapes on rivals | remove | Not in the README; one-off query. |
| `rv2.mjs` | `real_value` is not invented, does not persist, and the migration guard stays false | convert | The printout says "(must be false)" but asserts nothing. G13 (migrations, `real_value` upgrade path). |
| `talent-roundtrip.mjs` | Stored talent trees round-trip through the talent model | convert | Counts `checked`/`bad` and prints; G12 round-trip assertion on a small fixture. |
| `tools/check-imports.mjs` | Static import resolution, template references and the Node-purity allowlist | keep (CI gate, not an evidence script) | Exits non-zero on an unpinned finding (`npm run check:imports`, CI). Its rules are exercised by `tests/node/check-imports-*.test.mjs`. Not an "assert nothing" script: see NF-12. |
| `tools/set-release-manifest.mjs` | Nothing: it stamps version and URLs into `system.json` for the release workflow | keep (release tool, not a test) | Exits 1 on missing environment values. No test; a tool-contract case for `--dry-run` is optional. See NF-12. |
| `tools/test-inventory.mjs` | Nothing: it lists test cases for this audit | keep (audit tool, not a test) | Plan step 7 re-runs it. Exits non-zero if a layer cannot be enumerated. See NF-12. |

## Exception table

Format: `case id | case name | disposition | reason | finding/gap id | replacement owner`. Every case in a file whose default is `rewrite`, every Playwright case and every Cypress case has its own row. Cases of a `keep` file that are not listed take the file's default and keep their name (all behavior-stating): F0001-F0003, F0008-F0012, F0016-F0020, F0022-F0023, F0025-F0027, F0029-F0034, F0037-F0038, F0040-F0048, F0051-F0061.

| case id | case name | disposition | reason | finding/gap id | replacement owner |
| --- | --- | --- | --- | --- | --- |
| F0004[x5] | Codex sheet keeps its size across re-renders — ${type} | rewrite | Writes `position` itself and re-calls `getData`; nothing renders; helper both acts and asserts. Rename: "Codex <type> sheet keeps a user-set size when re-rendered". | Phase 3 | Phase 3 row "codex-item-size, sheet initial size, minimized close" |
| F0005 | Codex adversary sheet keeps its size across re-renders | rewrite | Same as F0004; copy of F0071. Rename: "Codex adversary sheet keeps a user-set size when re-rendered". | Phase 3, A05 pair F0071 | same |
| F0006 | Codex actor sheet keeps prepared skill rows | rewrite | `rows.length > 0` passes with one row; no ids, no per-skill count, no stored-data check. Rename: "Codex actor sheet lists one row per defined skill". | A07 | Phase 2 A07 |
| F0007 | Object Diff Function should return correct diff | keep+rename | Name says nothing. Rename: "diff gives the second object's value for each differing key of the first, undefined when missing". Keep only if D-01 says the helper is supported. | none | none (D-01) |
| F0013 | mechanics present only when vehicleLimit on | keep+rename | Asserts only the "on" half; the "off gives null" half is in F0012. Rename: "Mechanics cooldown is reported when the vehicle weekly limit is on". | G08 (retain) | none |
| F0014 | Should calculate value from attributes and items | rewrite | Calls a removed method; uses `data` not `system`. Rename: "learned talent modifiers add to a characteristic total and unlearned ones add nothing". | A02 | Phase 2 A02 |
| F0015 | Should calculate the base values based only on species | rewrite | Throws on the obsolete fixture. Rename: "species grant alone is a characteristic's base value". | A02 | Phase 2 A02 |
| F0021 | computeFFGTotals handles negative addedResults (mirrors evaluate()'s symmetric cancellation) | keep (open) | Expectation that removing 2 Advantage nets to 2 Threat has no recorded source: D-05. | G11 | Phase 4 G11 |
| F0024 | faceTally recovers from CONFIG.FFG.PROFICIENCY_RESULTS when r.ffg is missing | rewrite | Expected value is the table the product reads; only `triumph` is independent. Use a literal tally for face 12 (success plus triumph). | A04 pattern (new instance) | Phase 4 G11 |
| F0028 | recomputeTermFFG matches the die's own evaluate() aggregation | rewrite | Random roll of one die type; no fixed supplied results; can pass with a zero tally. Use fixed faces for each die type. | G11 | Phase 4 G11 |
| F0035 | audit capture: deepClone(faceTally(...) ?? zeroTally()) recovers the table tally and never throws | rewrite | Runs a copy of the product expression, not `ReplaceDie._original`; repeats F0024. Call the real capture path. | A04 pattern (new), A05 pair F0024 | Phase 4 G11 |
| F0036 | audit capture: a malformed face captures zeroTally(), never undefined | rewrite | Same as F0035; repeats F0026. | A04 pattern (new), A05 pair F0026 | Phase 4 G11 |
| F0039 | Root row unlearned is purchasable | keep | Primary owner for "specialization row 0 is unconditional"; F0066 folds into it as a parameterized case over talent0-talent3. | A05 | Phase 4 G04 |
| F0049 | Rightmost column does not read off-grid for right edge | rewrite | Cannot fail on its defect: with the guard removed it still returns false because `talent8` is never learned (checked on a scratch copy). Learn `talent8` and expect false. | none (new, NF-04) | Phase 4 G04 |
| F0050 | Force power row 0 needs an up-link to count as rooted | combine | Same rule and branch as F0063 (row 0, no top link, no neighbour) on another index. Fold into one parameterized case over upgrade0-upgrade3 less the linked one. | A05, D-06 | Phase 4 G04 |
| F0063 | Force power row 0 without any top-link and no side connection is NOT purchasable | keep | Primary owner of the pair above. | A05, D-06 | Phase 4 G04 |
| F0062 | Force power row 0 with links-top-1 is purchasable | keep (open) | Depends on the row 0 rule in D-06. | D-06 | Phase 4 G04 |
| F0064 | Force power row 0 without top-link connects via learned left neighbour's links-right | keep (open) | D-06. | D-06 | Phase 4 G04 |
| F0065 | Force power row 0 multi-col with only links-top-2 set is purchasable | keep (open) | D-06. | D-06 | Phase 4 G04 |
| F0066 | Specialization row 0 stays unconditional (no implicit parent) | combine | Same rule as F0039 (row 0, no links, no neighbours) on talent2. | A05 | Phase 4 G04 |
| F0067 | concurrent submits coalesce; last write wins; callers share the flush | rewrite | `calls <= 2` passes with one write; `r2` vs `r1 ?? r2` can compare a value with itself. Hold the first write, queue two, assert exactly two writes (first and latest value) and that all callers get the final result. | A07 | Phase 2 A07 |
| F0068[x8] | ${label} close instantly when already minimized | keep+rename | Proves the option is passed, not that the window closes at once. Rename: "<label> close() asks Foundry to skip the close animation when minimized". Applies to all 8 classes. | Phase 3 | Phase 3 row "codex-item-size, sheet initial size, minimized close" adds the real minimize-then-close owner |
| F0069[x8] | ${label} keep normal close animation when not minimized | keep+rename | Rename: "<label> close() keeps the normal close animation when not minimized". Applies to all 8 classes. | Phase 3 | same |
| F0070[x6] | legacy sheet keeps its size across re-renders — ${type} | rewrite | As F0004. Rename: "stock <type> actor sheet keeps a user-set size when re-rendered" ("legacy" is a migration-era word). | Phase 3, A05 pair F0004 | same as F0004 |
| F0071 | adversary sheets keep their size across re-renders — legacy | rewrite | As F0005. Rename: "stock adversary actor sheet keeps a user-set size when re-rendered". | Phase 3, A05 pair F0005 | same |
| F0072 | first getData still applies the per-type default size | rewrite | One case loops 3 types and stops at the first failure; expected values come from `CONFIG.FFG.sheets.defaultWidth/Height`, the table the sheet reads; `rival`, `nemesis`, `homestead` untested. One case per type with literal sizes. | A04 pattern (new), Phase 3 | same |
| F0073 | legacy actor sheet keeps prepared skill rows | rewrite | Weak counts; see file row. Rename: "stock actor sheet lists one row per defined skill". | A07 | Phase 2 A07 |
| F0074 | active-tab cache key is document-scoped and round-trips | rewrite | Tests `Map.set`/`Map.get`. Rename: "tab chosen on one item sheet returns after re-render and reopen and does not show on another item". | A07 | Phase 2 A07 |
| P0001 | armor applies correctly | rewrite | Item-sheet `defense` check asserts nothing; only equip is covered (no unequip, edit, removal); fixed fixtures names. Rename: "worn armour adds soak and defence and counts 3 less toward encumbrance; carried armour adds none". | A01, A09, G07 | Phase 1 fixtures, then Phase 2 A09 |
| P0002 | career applies correctly | combine | Same flow as P0003 and P0005 (simple item, direct modifier, drag, read pool text). One parameterized case over career, critical injury and gear; each input stays a case. Rename per input: "career modifier Skill Add Advantage +1 on Gunnery shows on the actor's Gunnery pool". | A09, G07 | Phase 2 A09 |
| P0003 | critical injury applies correctly | combine | As P0002. Rename: "critical injury modifier Skill Add Success +2 on Melee shows on the actor's Melee pool". | A09 | Phase 2 A09 |
| P0004 | force power applies correctly | rewrite | Seeds an unlearned upgrade with a distinctive modifier but never checks it did not apply. Rename: "a learned force-power upgrade applies its modifier and an unlearned one does not". Parameterize with P0006, P0007. | A09 | Phase 2 A09 |
| P0005 | gear applies correctly | combine | As P0002. Rename: "carried gear modifier Skill Add Advantage +2 on Charm shows on the actor's Charm pool". | A09 | Phase 2 A09 |
| P0006 | signature ability applies correctly | rewrite | As P0004. Rename: "a learned signature-ability upgrade applies its modifier and an unlearned one does not". | A09 | Phase 2 A09 |
| P0007 | specialization applies correctly | rewrite | As P0004; also reads the lower-case word "boost" from the pool text. Rename: "a learned specialization talent applies its modifier and an unlearned one does not". | A09 | Phase 2 A09 |
| P0008 | embedded tree-item base modifiers apply from the pop-out editor | keep | Good model: reads prepared values, cleans up in `finally`, three generated inputs. Add the removal transition. | A09 (partial) | Phase 2 A09 |
| P0009 | species applies correctly | rewrite | Eight item-sheet checks write instead of assert; soak expectation disputed. Rename: "a species grants its characteristics; wounds threshold adds Brawn and strain threshold adds Willpower". | A01, A09, D-03 | Phase 1 fixtures, then Phase 2 A09 |
| P0010 | talent applies correctly | rewrite | Its only check, `checkStat('Strain','3')`, asserts nothing, so the case can pass with the modifier broken. Rename: "talent modifier Stat Strain +3 raises the strain threshold by 3". | A01, D-04 | Phase 1 fixtures |
| P0011 | weapon applies correctly | keep+rename | Single assertion is valid. Rename: "a carried weapon adds its encumbrance to the character". | none | none |
| P0012 | embedded armor applies correctly | combine | Same flow as P0013 (armour vs weapon). Two `defence.ranged` checks assert nothing; unequipped soak 1 disputed; 3 x 200 ms sleeps; shares fixture names with P0013 (NF-09). Rename: "attachment and modification effects on carried and equipped armour reach the owner". | A01, A09, A05, D-02 | Phase 2 A09 / G07 |
| P0013 | embedded weapons applies correctly | combine | As P0012 (name is also plural by mistake). Rename: "attachment and modification effects on carried and equipped weapons reach the owner". | A01, A09, A05, D-02 | Phase 2 A09 / G07 |
| P0014 | critical damage applies correctly | keep+rename | Valid single assertion. Rename: "vehicle critical-damage modifier Vehicle Stat Armor +1 raises vehicle armour by 1". | none | none |
| P0015 | ship attachment applies correctly | keep+rename | Valid two assertions. Rename: "a ship attachment adds its encumbrance and uses its hard points". | none | none |
| P0016 | ship weapon applies correctly | keep+rename | Valid assertion. Rename: "ship weapon modifier Vehicle Stat Armour +3 raises vehicle armour by 3". | none | none |
| P0017 | embedded ship weapon applies correctly | rewrite | Both speed checks assert nothing: the case cannot fail on the value. Rename: "a ship-weapon attachment's Speed +1 reaches the vehicle only when the weapon is on it". | A01, D-04 | Phase 1 fixtures |
| P0008[specialization] | (generated input of P0008) | keep | Specialization with Skill Add Success +1 on Perception. | none | none |
| P0008[forcepower] | (generated input of P0008) | keep | Force power with Skill Add Success +1 on Computers. | none | none |
| P0008[signatureability] | (generated input of P0008) | keep | Signature ability with Skill Add Success +1 on Medicine. | none | none |
| C0001 | initializes the world | remove | Body is `cy.log`; readiness assertions sit in hooks. Transfer game, canvas and Destiny-menu readiness to a Playwright startup case, then remove. | A10, G14 | Phase 5 row "Commented Cypress item cases and folder-only placeholders" |
| C0002 | creates actors | remove | Vague name; selectors predate V13; deletes a folder named "actors". Transfer: character creation opens the sheet, and values persist after reopen. | A10, G12 | Phase 5 (Playwright actor creation) |
| C0003 | creates items [commented-out] | remove | Dead; the body only opens the Items tab. | A10 | Phase 5 |
| C0004 | sets up the folder | remove | Folder-only placeholder with no assertion; fails on a fresh world because it deletes a folder that must already exist. Folders are fixture setup only. | A10 | Phase 5 |
| C0005 | creates an ability [commented-out] | remove | Dead. Nothing unique beyond the name field. | A10 | Phase 5 |
| C0006 | creates armor [commented-out] | remove | Dead. Only layout visibility (pill list, ranked toggle). | A10 | Phase 5 |
| C0007 | creates a career [commented-out] | remove | Dead. Name only. | A10 | Phase 5 |
| C0008 | creates critical damage [commented-out] | remove | Dead. Unique: severity input starts at 0 and difficulty select at 1. Transfer to a defaults case. | A10, G12 | Phase 5 (Playwright item creation) |
| C0009 | creates critical injury [commented-out] | remove | Dead. Unique: same severity defaults as C0008. | A10, G12 | Phase 5 |
| C0010 | creates force power [commented-out] | remove | Dead. Unique: header text "Basic Power". | A10, G12 | Phase 5 |
| C0011 | creates gear [commented-out] | remove | Dead. Label visibility only. | A10 | Phase 5 |
| C0012 | creates item attachment [commented-out] | remove | Dead. Label visibility only. | A10 | Phase 5 |
| C0013 | creates item modification [commented-out] | remove | Dead. Name only. | A10 | Phase 5 |
| C0014 | creates talent [commented-out] | remove | Dead. Unique: activation defaults to "Passive". | A10, G12 | Phase 5 |
| C0015 | creates ship attachment [commented-out] | remove | Dead. Label and ranked toggle only. | A10 | Phase 5 |
| C0016 | creates ship weapon [commented-out] | remove | Dead. Unique: firing-arc list shows "Dorsal". | A10, G12 | Phase 5 |
| C0017 | creates homestead upgrade [commented-out] | remove | Dead. Ranked toggle only. | A10 | Phase 5 |
| C0018 | creates signature ability [commented-out] | remove | Dead. Unique: header "Base Ability" and upgrade 1 cost 10. | A10, G12 | Phase 5 |

## Open rule decisions

| id | case ids | disputed expectation | candidate rules | source missing |
| --- | --- | --- | --- | --- |
| D-01 | F0007 | Is `Helpers.diff` a supported helper, and what should it return for a key present only in the second object and for arrays? | (a) Dead code: remove the helper and the case. (b) Supported: define the result (today keys only in the second object are ignored and a missing key maps to `undefined`). | A caller, public-API entry or spec that names `diff`. Only its own recursion calls it. |
| D-02 | P0012, P0013 (and the P0001 contrast) | With an attachment (Soak +1) on armour or a weapon that is only carried, should soak be 1 or 0? Likewise an item modification (Defence-Melee +1) added to unequipped armour is asserted as 1 while P0001 shows plain armour defence is 0 until worn. | (a) 0 until equipped, as the test's own TODO says and as `CL 2.1.0` "gear resyncs its effects on the carried toggle" implies for gear. (b) 1, the current behavior. | An explicit product decision on whether attachment and modification effects follow the equip state. The plan (A09) already names this as open. |
| D-03 | P0009 | Should a species' Brawn raise soak on a new character (commented-out `soak` 1)? | (a) Yes: Soak = Brawn plus armour and talents (FFG CRB; `modules/actors/actor-ffg.js` comment "Soak - Brawn"; `CL 1.909` "Buying a rank in Brawn now properly increases Soak"). Then the failure is a product defect. (b) Soak only follows later Brawn changes, as today. | A decision whether a species-granted Brawn counts at creation. If (a), report the defect separately (plan A09). |
| D-04 | P0010, P0017 | Which field and value does the check mean? P0010 `Strain` and P0017 `speed` are not fields the helper supports. | P0010: strain max 3 (the modifier maps to `stats.strain.max`). P0017: speed max 1 or the vehicle sheet's speed input; also whether 0 before the weapon is added. | Which sheet control each case reads. Both rules are code-derived (`getModKeyPath`), not documented. |
| D-05 | F0021 | Subtracting 2 Advantage from a roll with none yields 2 Threat. | (a) Net result: negative advantage becomes threat (current, "symmetric cancellation"). (b) Clamp at zero: a removal never creates the opposite symbol. | SPEC-DICE lists "negative `addedResults`" as a case but gives no expected value. |
| D-06 | F0050, F0062-F0065 | Is Force-power row 0 unconditionally purchasable or does it need an up-link? | (a) Needs `links-top-N` or a side/down connection (code, comment and commit `0092a34f`, and these tests). (b) Row 0 is the root (SPEC-TREE edge case "we treat any index `< width` as root"). Signature abilities have the same `rootHasImplicitParent` rule and no case. | An updated SPEC-TREE or a decision record that replaces the stale edge-case text. |

## New findings not in the plan

| id | cases/files | pattern | evidence | suggested owner |
| --- | --- | --- | --- | --- |
| NF-01 | F0035, F0036 | Test runs a copy of a product expression, not the product code (A04 pattern); also repeats F0024 and F0026 (A05) | The expression `deepClone(faceTally(...) ?? zeroTally())` is written in the test; the product path is `ReplaceDie._original` in `modules/helpers/replace-die.js` | Phase 4 G11 |
| NF-02 | F0022, F0024, F0035, F0072 | Expected values taken from the product's own tables or helpers (`zeroTally()`, `CONFIG.FFG.PROFICIENCY_RESULTS`, `CONFIG.FFG.sheets.defaultWidth/Height`) | Test source | Phase 3 (F0072), Phase 4 G11 |
| NF-03 | F0028 | Parity against another product implementation using a random roll rather than fixed faces; one die type of seven | `BoostDie.evaluate()` aggregates separately; test rolls 3 dice | Phase 4 G11 ("use fixed supplied die results") |
| NF-04 | F0049 | Case that cannot fail on the defect it names | Scratch copy of `modules/helpers/talent-tree.js` with the right-edge guard removed still returns false for the test input; it returns true once `talent8` is learned | Phase 4 G04 |
| NF-05 | F0039/F0066, F0050/F0063, F0004/F0070, F0005/F0071, F0006/F0073, P0012/P0013 | Duplicates inside the slice (A05) | Same rule and branch on another index (tree), or a copied suite for stock and Codex sheets, or armour versus weapon flow. Codex copies must stay in the Codex package after the split. | Phase 5 |
| NF-06 | F0007-F0013, F0039-F0066 (verified in Node); F0016-F0023, F0025, F0027, F0029-F0032 (pure bodies, module not importable in Node) | Pure-logic suites live in the in-Foundry harness only, so no CI job runs them; they import unstubbed in Node | Scratch Node run: 35 pure cases pass, F0014/F0015 fail. CI runs only `npm test` (Node globs) and `check:imports`. | Phase 1 and Phase 4 G04/G11 (Node plus Foundry split) |
| NF-07 | `tests/ffg-tests.js`, `modules/swffg-main.js` | The only code that creates the "Functional Testing" launcher macro is gated on `game.data.system.data.test` (pre-V10 shape; `system.json` has no `test` key) and then calls `game.macros.entities`, which no longer exists. Inferred from code, not run. | `modules/swffg-main.js` near the comment "enable functional testing" | Phase 1 "repeatable runner" |
| NF-08 | `playwright/setup.ts`, `playwright.config.js`, `playwright/fixtures.ts` | Destructive tests (delete by name, prefix deletes in P0008) can run against any `PLAYWRIGHT_BASE_URL`; the fork-local fail-closed guard exists only for Cypress (commit `37994243`) | `cypress/support/e2e.js` has the guard; the Playwright setup has none | Phase 1 (test world) |
| NF-09 | P0012, P0013 | Order dependence: both create items named "qa embeddedAttachment" and "qa embeddedMod"; a failure in one leaves them for the other, and the sheet locators match by name (A11 pattern) | Test source | Phase 1 / Phase 2 A09 |
| NF-10 | `cypress/e2e/02_test_items.cy.js` C0004 | Depends on world state: fails on a fresh world (deletes a folder that must exist) | Test source | Phase 5 (removal) |
| NF-11 | `cypress/support/commands.js`, `docs/superpowers/plans/artifacts/2026-07-14-datamodel-evidence/corrupt-armour.js` | Possible private-information issues under CLAUDE.md: a literal admin key string typed by `authenticatesAsAdmin` (test placeholder, but a credential-shaped literal in a tracked file); a default pack id naming a personal data module. The evidence folder's captured output also carries that module-id prefix. | Source read; not repeated here on purpose | Controller to review against the private-information rules before push |
| NF-12 | `cases.md` "Not automated tests" list; `tools/check-imports.mjs`, `tools/set-release-manifest.mjs`, `tools/test-inventory.mjs` | The generator's intro says these scripts "print output and assert nothing", but all three exit non-zero on failure and are gates or release tools. `check-imports` is covered by four Node suites. | Each ends in `process.exit` / `exitCode` | Task 1a / generator wording |
| NF-13 | `tests/v2-migration/*`, F0068-F0074 | Migration-era framing remains ("V2 Migration", "tripwire", "legacy") though the port is finished (`CL 2.1.0` "dialogs, form applications and sheets are native V2"); names should state behavior, and suite titles should drop the migration word | Suite titles and file headers | Phase 2 A07, Phase 3 |

### Confirmations of plan items (not counted as new)

- F0014 and F0015 fail today (checked in Node) and no automation runs them (A02).
- 16 of 17 Playwright cases clean up outside `finally`, and `remove()` deletes by name (Phase 1 fixture rules).
- Fixed sleeps: 6 x 200 ms in the spec and 2 x 505 ms in the fixtures (Phase 1 "replace fixed delays").
- The harness only logs a package suite that fails to load, so the run still reports success (Phase 1 "a registration error ... must fail the run").
