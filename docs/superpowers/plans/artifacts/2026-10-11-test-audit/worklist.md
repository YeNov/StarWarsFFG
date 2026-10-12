# Per-task worklist (T3-T30 and PF1-PF3)

For each task of the [remediation delivery list](../../2026-10-11-test-suite-audit-remediation.md) and for the product-fix tasks PF1-PF3 added after the controller's rulings (see [open-decisions.md](open-decisions.md)), the case ids (with file) whose disposition is not plain `keep` and that the task owns, so each later implementer can be pointed at its rows. Built from the six slice files of the [test-case inventory](README.md): each case takes its file's default disposition unless the slice's exception table lists it. Ids are positional case ids from [cases.md](cases.md) (commit `813ed82c`).

## How ownership was assigned

- A case appears under exactly one task. The owner is the task whose scope matches the case's feature rule: the plan finding (A01-A11) or gap (G01-G14) the slice names, the Phase 3 family for source-text replacements, and T29 for duplicates and removals the plan sends to Phase 5 (`combine` rows that only fold a case into another, simulated-defect cases, smoke cases and Cypress).
- A removal that the slice ties to a replacement stays with the task that writes the replacement (for example N0678 with T8, N0612 with T5, the `quality-effect-wiring` removals with T13).
- Disposition tokens: `keep+rename` (behavior stays, name changes), `rewrite` (case changes, stays in its layer), `combine` (folds into another case), `remove`, `move-to-foundry` (see README), and `keep (open R05)` (kept, but blocked by a decision that is still open; R05 is the only one). Product-fix tasks PF1-PF3 own the cases whose rule a product change decides (PF1 R16, PF2 R17, PF3 R14).
- `rule decision Rnn` points to [open-decisions.md](open-decisions.md). Notes repeat the slice's finding/gap ids and, where it names one, the slice's replacement owner. `NFnn` ids are in [findings.md](findings.md).
- `T2*` is Task 2, the Phase 1 Foundry runner, which is already in progress and is outside the T3-T30 list.
- Cases that were already done when this file was last revised are marked in the notes (Task 5, commit `cc61d38f`). Rows without a case id (new cases, files, scripts) are listed after the task's case table and are not counted in the totals.
- Loop-generated Foundry cases are listed once under the id of the listed row and note how many cases they expand to.

## Totals

Non-`keep` case ids across all six slices: **358** (of 1193 classified cases). Assigned to T3-T30 and PF1-PF3: **352**. Unassigned: **6**.

| task | scope | case ids |
| --- | --- | ---: |
| T3 | A01 browser assertions | 2 |
| T4 | A08 Node boundary | 8 |
| T5 | A06 minion | 3 |
| T6 | A11 sheet selection | 9 |
| T7 | A02 modifiers | 2 |
| T8 | A04 force-power refund | 1 |
| T9 | A07 submit/tab/skills | 4 |
| T10 | A09 active effects | 14 |
| T11 | Phase 3: ammo, expanded cards, portrait, scroll, item-adjusted refresh, talent latency, item size, initial size, minimized close | 36 |
| T12 | Phase 3: sheet-local actions, specialization drag-drop, editor orphan prune, observer, sheet-options readonly and path permissions | 24 |
| T13 | Phase 3: XP refund and purchase, quality-effect wiring, quality provenance and colors, hyperdrive resolution UI, obligation-type refresh | 42 |
| T14 | Phase 3: init order, theme registration, CSS defense controls, artifact reviews | 29 |
| T15 | G01 character creation commit | 33 |
| T16 | G02 draft save and resume | 2 |
| T17 | G03 preview | 0 |
| T18 | G04 talent paths | 4 |
| T19 | G05 Hyperdrive import | 21 |
| T20 | G06 SWA and OggDude import | 1 |
| T21 | G07 modifier effect reconciliation | 13 |
| T22 | G08 damage and critical actions | 11 |
| T23 | G09 GM bridge and Destiny | 6 |
| T24 | G10 minions and vehicles | 8 |
| T25 | G11 dice workflow | 4 |
| T26 | G12 data models | 3 |
| T27 | G13 migrations | 1 |
| T28 | G14 source pools and startup | 4 |
| T29 | Phase 5 removals and Cypress | 61 |
| T30 | final validation | 0 |
| PF1 | Product fix R16: every minion kill removes exactly one minion; stepper revive edge fixes | 2 |
| PF2 | Product fix R17: record 2,500 starting credits as decided | 2 |
| PF3 | Product fix R14: the enabled toggle suspends direct qualities too | 2 |
| unassigned | no task covers the feature area (reasons below) | 6 |
| total | | 358 |

| disposition | case ids |
| --- | ---: |
| keep+rename | 79 |
| rewrite | 103 |
| combine | 42 |
| remove | 36 |
| move-to-foundry | 96 |
| keep (open R05) | 2 |
| total | 358 |

| slice | case ids |
| --- | ---: |
| node-a-c | 49 |
| node-d-i | 59 |
| node-l-r | 68 |
| node-s-x | 73 |
| codex-node | 52 |
| foundry-browser | 57 |
| total | 358 |

Files and scripts without case ids that carry a non-`keep` disposition are listed after the task sections and are not counted above (6 files, 7 scripts).

## T3 A01 browser assertions

2 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| P0010 | `e2e/activeEffects.spec.js` | talent applies correctly | rewrite | foundry-browser | A01; slice owner: Phase 1 fixtures; rule decision R30 (ruled) |
| P0017 | `e2e/activeEffects.spec.js` | embedded ship weapon applies correctly | rewrite | foundry-browser | A01; slice owner: Phase 1 fixtures; rule decision R30 (ruled) |

Also owns, without case ids: `playwright/fixtures.ts` (rewrite), the live-world guard for `playwright/setup.ts` and removing its commented-out login block (see Files and scripts below). The other A01 fixture call sites sit under T10 and need the same field map, so T3's wrong-value demonstrations (species characteristics, defense values, vehicle speed) use them: P0001 (the item-sheet `defense` check asserts nothing), P0009 (eight item-sheet checks write the value instead of asserting) and P0012 and P0013 (`defence.ranged`, spelled with a c, four calls). T10 rewrites those cases after T3.

## T4 A08 Node boundary

8 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0541 | `tests/node/import-graph.test.mjs` | the modules/ ESM boundary is explicit — no MODULE_TYPELESS_PACKAGE_JSON warning (DEV-11) | keep+rename | node-d-i | A08 |
| N0757 | `tests/node/sheet-options-path.test.mjs` | a path option reads its value from the document, not from a config flag | rewrite | node-s-x | A08, A03; G10; Phase 1 "Node boundary"; file default |
| N0758 | `tests/node/sheet-options-path.test.mjs` | a path option with nothing stored falls back to its default | rewrite | node-s-x | A08, A03; G10; Phase 1 "Node boundary"; file default |
| N0759 | `tests/node/sheet-options-path.test.mjs` | a flag option still reads its config flag | rewrite | node-s-x | A08, A03; G10; Phase 1 "Node boundary"; file default |
| N0859 | `tests/node/stub-boundary.test.mjs` | the scan still DETECTS a forbidden installation (it did not become a no-op) | rewrite | node-s-x | A08; slice owner: Phase 1 "Node boundary" |
| N0860 | `tests/node/stub-boundary.test.mjs` | no file under tests/node/ or codex/tests/node/ installs a forbidden global | rewrite | node-s-x | A08; slice owner: Phase 1 "Node boundary" |
| N0861 | `tests/node/stub-boundary.test.mjs` | the stub installs exactly the allowed globals | keep+rename | node-s-x |  |
| N0865 | `tests/node/stub-boundary.test.mjs` | the stub uses the real CONFIG.FFG.characterCreator table | keep+rename | node-s-x |  |

## T5 A06 minion

3 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0608 | `tests/node/minion-group.test.mjs` | a per-unit threshold of zero never divides by zero | keep+rename | node-l-r | done: renamed by Task 5 (commit cc61d38f) |
| N0611 | `tests/node/minion-group.test.mjs` | reviving a unit is the reverse, and a clean group stays clean | keep+rename | node-l-r | done: renamed by Task 5 (commit cc61d38f) |
| N0612 | `tests/node/minion-group.test.mjs` | stepping reproduces the Codex minion stepper exactly | remove | node-l-r | A06; done: removed by Task 5 (commit cc61d38f) |

## T6 A11 sheet selection

9 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0077 | `codex/tests/node/sheet-theme.test.mjs` | every reader of the theme goes through the resolver | move-to-foundry | codex-node | A11; A03; slice owner: Phase 2 A11 Foundry sheet-selection cases |
| N0078 | `codex/tests/node/sheet-theme.test.mjs` | each browser starts on Use the GM's default, and the GM's setting is world-wide | move-to-foundry | codex-node | A03; G14; slice owner: Phase 2 A11 per-user and follow-GM cases |
| N0079 | `codex/tests/node/sheet-theme.test.mjs` | a GM change reloads only the browsers that follow it | move-to-foundry | codex-node | A03; slice owner: Phase 2 A11 per-user and follow-GM cases |
| N0081 | `codex/tests/node/sheet-theme.test.mjs` | a legacy theme value is reset to follow the GM, not to an explicit pick | move-to-foundry | codex-node | A03; slice owner: Phase 2 A11 per-user and follow-GM cases; rule decision R25 (ruled) |
| N0765 | `tests/node/sheet-resolvers.test.mjs` | with no resolver registered, no document gets a package sheet | rewrite | node-s-x | A11, A03; Phase 2 A11; file default |
| N0766 | `tests/node/sheet-resolvers.test.mjs` | a package's resolver picks the sheet for the documents it claims | rewrite | node-s-x | A11, A03; Phase 2 A11; file default |
| N0767 | `tests/node/sheet-resolvers.test.mjs` | a resolver that throws is skipped instead of breaking every sheet | rewrite | node-s-x | A11, A03; Phase 2 A11; file default |
| N0768 | `tests/node/sheet-resolvers.test.mjs` | registering a package again replaces its resolver | rewrite | node-s-x | A11, A03; Phase 2 A11; file default |
| N0770 | `tests/node/sheet-resolvers.test.mjs` | actors and items ask the resolvers only when no sheet was picked for the document | move-to-foundry | node-s-x | A03, A11; slice owner: Phase 2 A11 Foundry bullet |

## T7 A02 modifiers

2 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| F0014 | `tests/modifiers.test.js` | Should calculate value from attributes and items | rewrite | foundry-browser | A02; slice owner: Phase 2 A02 |
| F0015 | `tests/modifiers.test.js` | Should calculate the base values based only on species | rewrite | foundry-browser | A02; slice owner: Phase 2 A02 |

## T8 A04 force-power refund

1 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0678 | `tests/node/parity.test.mjs` | BUG-3: refunding a purchased force power matches by uuid and refunds the XP | remove | node-l-r | A04; slice owner: Phase 2 A04 (Foundry, real refund action); calculators.test.mjs keeps XP accounting |

## T9 A07 submit/tab/skills

4 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| F0006 | `codex/tests/browser/sheet-skill-data.test.js` | Codex actor sheet keeps prepared skill rows | rewrite | foundry-browser | A07; slice owner: Phase 2 A07 |
| F0067 | `tests/v2-migration/form-submit-coalesce.test.js` | concurrent submits coalesce; last write wins; callers share the flush | rewrite | foundry-browser | A07; slice owner: Phase 2 A07 |
| F0073 | `tests/v2-migration/sheet-skill-data.test.js` | legacy actor sheet keeps prepared skill rows | rewrite | foundry-browser | A07; slice owner: Phase 2 A07; finding NF49 |
| F0074 | `tests/v2-migration/sheet-tab-cache.test.js` | active-tab cache key is document-scoped and round-trips | rewrite | foundry-browser | A07; slice owner: Phase 2 A07; finding NF49 |

## T10 A09 active effects

14 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| P0001 | `e2e/activeEffects.spec.js` | armor applies correctly | rewrite | foundry-browser | A01, A09, G07; slice owner: Phase 1 fixtures, then Phase 2 A09 |
| P0002 | `e2e/activeEffects.spec.js` | career applies correctly | combine | foundry-browser | A09, G07; slice owner: Phase 2 A09 |
| P0003 | `e2e/activeEffects.spec.js` | critical injury applies correctly | combine | foundry-browser | A09; slice owner: Phase 2 A09 |
| P0004 | `e2e/activeEffects.spec.js` | force power applies correctly | rewrite | foundry-browser | A09; slice owner: Phase 2 A09 |
| P0005 | `e2e/activeEffects.spec.js` | gear applies correctly | combine | foundry-browser | A09; slice owner: Phase 2 A09 |
| P0006 | `e2e/activeEffects.spec.js` | signature ability applies correctly | rewrite | foundry-browser | A09; slice owner: Phase 2 A09 |
| P0007 | `e2e/activeEffects.spec.js` | specialization applies correctly | rewrite | foundry-browser | A09; slice owner: Phase 2 A09 |
| P0009 | `e2e/activeEffects.spec.js` | species applies correctly | rewrite | foundry-browser | A01, A09; slice owner: Phase 1 fixtures, then Phase 2 A09; rule decision R29 (ruled) |
| P0011 | `e2e/activeEffects.spec.js` | weapon applies correctly | keep+rename | foundry-browser |  |
| P0012 | `e2e/activeEffects.spec.js` | embedded armor applies correctly | combine | foundry-browser | A01, A09, A05; slice owner: Phase 2 A09 / G07; rule decision R28 (ruled); finding NF45 |
| P0013 | `e2e/activeEffects.spec.js` | embedded weapons applies correctly | combine | foundry-browser | A01, A09, A05; slice owner: Phase 2 A09 / G07; rule decision R28 (ruled); finding NF45 |
| P0014 | `e2e/activeEffects.spec.js` | critical damage applies correctly | keep+rename | foundry-browser |  |
| P0015 | `e2e/activeEffects.spec.js` | ship attachment applies correctly | keep+rename | foundry-browser |  |
| P0016 | `e2e/activeEffects.spec.js` | ship weapon applies correctly | keep+rename | foundry-browser |  |

## T11 Phase 3: ammo, expanded cards, portrait, scroll, item-adjusted refresh, talent latency, item size, initial size, minimized close

36 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| F0004 | `codex/tests/browser/sheet-initial-size.test.js` | Codex sheet keeps its size across re-renders — ${type} | rewrite | foundry-browser | Phase 3; slice owner: Phase 3 row "codex-item-size, sheet initial size, minimized close"; expands to 5 generated cases |
| F0005 | `codex/tests/browser/sheet-initial-size.test.js` | Codex adversary sheet keeps its size across re-renders | rewrite | foundry-browser | Phase 3, A05 pair F0071 |
| F0068 | `tests/v2-migration/minimized-close.test.js` | ${label} close instantly when already minimized | keep+rename | foundry-browser | Phase 3; slice owner: Phase 3 row "codex-item-size, sheet initial size, minimized close" adds the real minimize-then-close owner; finding NF49; expands to 8 generated cases |
| F0069 | `tests/v2-migration/minimized-close.test.js` | ${label} keep normal close animation when not minimized | keep+rename | foundry-browser | Phase 3; finding NF49; expands to 8 generated cases |
| F0070 | `tests/v2-migration/sheet-initial-size.test.js` | legacy sheet keeps its size across re-renders — ${type} | rewrite | foundry-browser | Phase 3, A05 pair F0004; finding NF49; expands to 6 generated cases |
| F0071 | `tests/v2-migration/sheet-initial-size.test.js` | adversary sheets keep their size across re-renders — legacy | rewrite | foundry-browser | Phase 3, A05 pair F0005; finding NF49 |
| F0072 | `tests/v2-migration/sheet-initial-size.test.js` | first getData still applies the per-type default size | rewrite | foundry-browser | A04 pattern (new), Phase 3; finding NF09, NF49 |
| N0016 | `codex/tests/node/codex-ammo-ui.test.mjs` | Codex prepares and renders ammo counters for vehicle weapons | move-to-foundry | codex-node | A03; G09 (N0021); file default |
| N0017 | `codex/tests/node/codex-ammo-ui.test.mjs` | Codex item ammo steppers clamp and persist the current magazine | combine | codex-node | A05; A03; slice owner: Phase 3 codex-ammo-ui row; rule decision R23 (ruled) |
| N0018 | `codex/tests/node/codex-ammo-ui.test.mjs` | Codex weapon configuration uses one stepped Ammo ratio chip | move-to-foundry | codex-node | A03; G09 (N0021); file default |
| N0019 | `codex/tests/node/codex-ammo-ui.test.mjs` | Codex vehicle weapon configuration uses one stepped Ammo ratio chip | move-to-foundry | codex-node | A03; G09 (N0021); file default |
| N0020 | `codex/tests/node/codex-ammo-ui.test.mjs` | Codex actor ammo steppers queue each click from the last queued count | move-to-foundry | codex-node | A03; G09 (N0021); rule decision R23 (ruled); file default |
| N0021 | `codex/tests/node/codex-ammo-ui.test.mjs` | Codex sheets can show another client's ammo step without re-rendering | remove | codex-node | A03; G09; slice owner: Phase 3 codex-ammo-ui row plus a two-session case (G09) |
| N0026 | `codex/tests/node/codex-expanded-cards-preserve.test.mjs` | Codex actor renders remember which cards were expanded | move-to-foundry | codex-node | A03; file default |
| N0027 | `codex/tests/node/codex-expanded-cards-preserve.test.mjs` | expanded cards reopen before listeners and the scroll restore run | move-to-foundry | codex-node | A03; file default |
| N0028 | `codex/tests/node/codex-expanded-cards-preserve.test.mjs` | a reopened item card rebuilds its details from the current item | move-to-foundry | codex-node | A03; file default |
| N0029 | `codex/tests/node/codex-item-adjusted-refresh.test.mjs` | Codex base-stat edits redraw their prepared adjusted values | move-to-foundry | codex-node | A03; file default |
| N0033 | `codex/tests/node/codex-item-size.test.mjs` | dense Codex equipment sheets use wider defaults and resize floors | move-to-foundry | codex-node | A03; rule decision R22 (ruled); file default |
| N0037 | `codex/tests/node/codex-portrait-preserve.test.mjs` | Codex actor renders preserve unchanged decoded portrait nodes | move-to-foundry | codex-node | A03; file default |
| N0040 | `codex/tests/node/codex-quantity.test.mjs` | counts of up to four digits show in full | rewrite | codex-node |  |
| N0041 | `codex/tests/node/codex-quantity.test.mjs` | longer counts show their first three digits and .. | rewrite | codex-node | rule decision R24 (ruled) |
| N0042 | `codex/tests/node/codex-quantity.test.mjs` | Codex gear and cargo cards use the shortened count with the full one as a tooltip | move-to-foundry | codex-node | A03; slice owner: Phase 3 (no named row): inventory-card case |
| N0043 | `codex/tests/node/codex-scroll-preservation.test.mjs` | Codex containers opt out of scroll anchoring | move-to-foundry | codex-node | A03; file default |
| N0083 | `codex/tests/node/stat-step-coordinator.test.mjs` | predicted current inputs cannot leak into whole-form submissions | move-to-foundry | codex-node | A03; finding NF26; file default |
| N0138 | `tests/node/ammo-quality-mode.test.mjs` | quality-driven ammo mode shows the manual Enable Ammo option disabled, with a note | move-to-foundry | node-a-c | A03; finding NF27; file default |
| N0552 | `tests/node/item-adjustments.test.mjs` | a weapon's qualities add to damage, crit and range, multiplied by their rank | keep+rename | node-d-i |  |
| N0554 | `tests/node/item-adjustments.test.mjs` | a ship weapon takes its range label and bands from the vehicle scale | rewrite | node-d-i | slice owner: Phase 5 (keep owner in this file); finding NF18 |
| N0555 | `tests/node/item-adjustments.test.mjs` | an attachment folds its own stats and its active qualities into the weapon | rewrite | node-d-i | finding NF18 |
| N0564 | `tests/node/item-adjustments.test.mjs` | a talent gets a localization key for its activation, and gear its parsed encumbrance | rewrite | node-d-i |  |
| N0577 | `tests/node/item-details-rebuild.test.mjs` | the actor sheet rebuilds an item card's details from the current item | move-to-foundry | node-d-i | A03; rule decision R10 (ruled); finding NF27; file default |
| N0753 | `tests/node/remote-sheet-refresh.test.mjs` | another client's ammo step is painted in place, keeping scroll and open cards | keep+rename | node-l-r |  |
| N0771 | `tests/node/sheet-scroll-preservation.test.mjs` | sheet renders preserve outer and Codex container scroll positions | move-to-foundry | node-s-x | A03; file default |
| N0772 | `tests/node/sheet-scroll-preservation.test.mjs` | restoration changes a position only when the new content requires clamping | move-to-foundry | node-s-x | A03; file default |
| N0773 | `tests/node/sheet-scroll-preservation.test.mjs` | the final restore runs after ApplicationV2's post-render positioning | move-to-foundry | node-s-x | A03; file default |
| N0892 | `tests/node/talent-card-latency.test.mjs` | actor-sheet talent clicks take the local path before any compendium request | move-to-foundry | node-s-x | A03; slice owner: Phase 3 row codex-item-adjusted-refresh, codex-talent-card-latency |
| N0893 | `tests/node/talent-card-latency.test.mjs` | Codex talent edit and send-to-chat paths resolve local data before compendiums | move-to-foundry | node-s-x | A03 |

## T12 Phase 3: sheet-local actions, specialization drag-drop, editor orphan prune, observer, sheet-options readonly and path permissions

24 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0044 | `codex/tests/node/codex-sheet-local-actions.test.mjs` | Codex-specific actor and item sheets do not fetch compendiums for UI interactions | move-to-foundry | codex-node | A03; finding NF24; file default |
| N0045 | `codex/tests/node/codex-specialization-dragdrop.test.mjs` | Codex specialization slots preserve the vanilla drop contract | move-to-foundry | codex-node | A03; file default |
| N0066 | `codex/tests/node/observer-sheet-access.test.mjs` | Codex actor sheets let viewers use tabs and the header toggle | move-to-foundry | codex-node | A03; file default |
| N0067 | `codex/tests/node/observer-sheet-access.test.mjs` | the crit-failure markers stay usable only where the click can be forwarded to the GM | move-to-foundry | codex-node | A03; file default |
| N0068 | `codex/tests/node/observer-sheet-access.test.mjs` | Codex item sheets let viewers switch tabs | move-to-foundry | codex-node | A03; file default |
| N0069 | `codex/tests/node/observer-sheet-access.test.mjs` | a viewer's header collapse is kept on the sheet, not saved to the actor | move-to-foundry | codex-node | A03; file default |
| N0070 | `codex/tests/node/sheet-options-path.test.mjs` | the Codex vehicle sheet carries no zone picker | move-to-foundry | codex-node | A03; rule decision R21 (ruled); finding NF26; file default |
| N0071 | `codex/tests/node/sheet-options-readonly.test.mjs` | a read-only Codex sheet offers no Scheme picker, which saves to the document | move-to-foundry | codex-node | A03; finding NF28; file default |
| N0417 | `tests/node/edit-mode-ae-suspension.test.mjs` | Sheet Options uses the persisted owner instead of client-local effect mutations | move-to-foundry | node-d-i | A03; slice owner: Phase 3 rows sheet-options-readonly, sheet-options-path; finding NF27 |
| N0418 | `tests/node/editor-orphan-prune.test.mjs` | editor liveness is judged by whether the mounted view is still in the document | move-to-foundry | node-d-i | A03; file default |
| N0419 | `tests/node/editor-orphan-prune.test.mjs` | the open-guard rejects an orphaned editor so the Edit pencil still mounts | move-to-foundry | node-d-i | A03; file default |
| N0420 | `tests/node/editor-orphan-prune.test.mjs` | every render prunes editors orphaned by the previous one | move-to-foundry | node-d-i | A03; file default |
| N0421 | `tests/node/editor-orphan-prune.test.mjs` | an editor still mounting (instance not yet assigned) is not pruned | combine | node-d-i | A05; slice owner: Phase 3 row editor-orphan-prune; keep as its own real-lifecycle case in the Foundry replacement |
| N0578 | `tests/node/item-sheet-local-editors.test.mjs` | shared item-sheet Codex editors use their live Item instead of resolving their own UUID | move-to-foundry | node-d-i | A03; rule decision R10 (ruled); finding NF27; file default |
| N0669 | `tests/node/observer-sheet-access.test.mjs` | a read-only sheet leaves its viewer controls enabled | move-to-foundry | node-l-r | A03; finding NF28; file default |
| N0670 | `tests/node/observer-sheet-access.test.mjs` | actor sheets let viewers expand item cards and force power / signature ability details | move-to-foundry | node-l-r | A03; finding NF28; file default |
| N0671 | `tests/node/observer-sheet-access.test.mjs` | item sheets let viewers open a career's pills and an attachment's innate talent | move-to-foundry | node-l-r | A03; finding NF28; file default |
| N0752 | `tests/node/remote-sheet-refresh.test.mjs` | the refresh is wired to the updateItem hook | move-to-foundry | node-l-r | A03; slice owner: Phase 3 observer/sessions family (T12): two live sessions, update an Item, assert the second client's sheets refresh; finding NF27 |
| N0760 | `tests/node/sheet-options-path.test.mjs` | Accept writes a path option to its path and every other option to its flag | move-to-foundry | node-s-x | A03; slice owner: Phase 3 row observer-sheet-access, sheet-options-readonly, sheet-options-path |
| N0761 | `tests/node/sheet-options-path.test.mjs` | the stock vehicle sheet carries no zone picker; Sheet Options sets the override | move-to-foundry | node-s-x | A03, G10; slice owner: Phase 3 same row; Phase 4 G10; rule decision R21 (ruled) |
| N0762 | `tests/node/sheet-options-readonly.test.mjs` | modules/items/item-ffg-options.js: registering an option reads it without writing | move-to-foundry | node-s-x | A03; finding NF28; file default |
| N0763 | `tests/node/sheet-options-readonly.test.mjs` | modules/actors/actor-ffg-options.js: registering an option reads it without writing | move-to-foundry | node-s-x | A03; finding NF28; file default |
| N0764 | `tests/node/sheet-options-readonly.test.mjs` | a read-only item sheet gets no Sheet Options button | move-to-foundry | node-s-x | A03; finding NF28; file default |
| N0820 | `tests/node/specialization-dragdrop.test.mjs` | specialization talent drops bind to the currently rendered sheet | move-to-foundry | node-s-x | A03; file default |

## T13 Phase 3: XP refund and purchase, quality-effect wiring, quality provenance and colors, hyperdrive resolution UI, obligation-type refresh

42 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0038 | `codex/tests/node/codex-quality-provenance.test.mjs` | Codex styles all provenance as the same dim secondary line | move-to-foundry | codex-node | A03; rule decision R26 (ruled); file default |
| N0039 | `codex/tests/node/codex-quality-sigil-colors.test.mjs` | quality details preserve dice sigil colours in every Codex scheme | move-to-foundry (rename) | codex-node | A03; slice owner: Phase 3 row quality-effect-wiring, quality provenance and colors; rule decision R26 (ruled); finding NF26 |
| N0065 | `codex/tests/node/obligation-type-refresh.test.mjs` | the Codex Obligation card swaps Magnitude for Subtype on the type | move-to-foundry | codex-node | A03; file default |
| N0086 | `codex/tests/node/xp-refund-binding.test.mjs` | the Codex XP log renders a refund anchor the handler can match | move-to-foundry | codex-node | A03; file default |
| N0087 | `codex/tests/node/xp-refund-binding.test.mjs` | the Codex XP log marks adjustment entries | move-to-foundry | codex-node | A03; file default |
| N0088 | `codex/tests/node/xp-refund-item.test.mjs` | the Codex XP log hides the refund button for entries with no purchase id | move-to-foundry | codex-node | A03; file default |
| N0493 | `tests/node/hyperdrive-resolution-ui.test.mjs` | Hyperdrive finding slots accept Foundry Item drops | move-to-foundry | node-d-i | A03; file default |
| N0494 | `tests/node/hyperdrive-resolution-ui.test.mjs` | Hyperdrive finding resolution is optional and removable | move-to-foundry | node-d-i | A03; file default |
| N0495 | `tests/node/hyperdrive-resolution-ui.test.mjs` | suggested resolutions show their exact source | move-to-foundry | node-d-i | A03; file default |
| N0668 | `tests/node/obligation-type-refresh.test.mjs` | changing an Obligation entry's type redraws the sheet | move-to-foundry | node-l-r | A03; file default |
| N0728 | `tests/node/quality-effect-wiring.test.mjs` | dropping a quality reconciles the parent instead of copying the dropped item's effects | move-to-foundry | node-l-r | A03; G07; file default |
| N0729 | `tests/node/quality-effect-wiring.test.mjs` | the drop handler no longer branches into a rank-only path that cannot create an effect | remove | node-l-r | A03; slice owner: Phase 3 row quality-effect-wiring (drop a quality in Foundry), G07 |
| N0730 | `tests/node/quality-effect-wiring.test.mjs` | deleting a quality awaits the update, then reconciles what is left | move-to-foundry | node-l-r | A03; G07; file default |
| N0731 | `tests/node/quality-effect-wiring.test.mjs` | the quality editor reconciles rather than patching the one effect it matched by name | move-to-foundry | node-l-r | A03; G07; file default |
| N0732 | `tests/node/quality-effect-wiring.test.mjs` | the attachment editor branch reconciles too | move-to-foundry | node-l-r | A03; G07; file default |
| N0733 | `tests/node/quality-effect-wiring.test.mjs` | equipping reconciles without triggering a re-entrant item write | move-to-foundry | node-l-r | A03; G07; file default |
| N0734 | `tests/node/quality-effect-wiring.test.mjs` | quality summaries do not leak aggregate rank_current into their source modifiers | remove | node-l-r | A03; A05; slice owner: tests/node/item-adjustments.test.mjs |
| N0735 | `tests/node/quality-effect-wiring.test.mjs` | no effect-building site pushes a key it has not checked | rewrite | node-l-r | A03; slice owner: Phase 3 row quality-effect-wiring; G07 |
| N0736 | `tests/node/quality-effect-wiring.test.mjs` | every remaining getModKeyPath result is guarded before use | rewrite | node-l-r | A03; slice owner: Phase 3 row quality-effect-wiring; G07 |
| N0737 | `tests/node/quality-effect-wiring.test.mjs` | an effect is only deleted when its attribute is gone, not when it yields no key | move-to-foundry | node-l-r | A03; G07; file default |
| N0738 | `tests/node/quality-effect-wiring.test.mjs` | the repair pass is exposed to a GM on the system namespace | move-to-foundry | node-l-r | A03; G07; finding NF27; file default |
| N0739 | `tests/node/quality-effect-wiring.test.mjs` | swffg-main imports the helper it now calls | remove | node-l-r | A03; slice owner: npm run lint; G07 (repair pass called in Foundry); finding NF27 |
| N0740 | `tests/node/quality-provenance.test.mjs` | quality summaries retain separate own-item and attachment rank sources | move-to-foundry | node-l-r | A03; file default |
| N0741 | `tests/node/quality-provenance.test.mjs` | quality rows visibly render both own and attachment provenance | move-to-foundry | node-l-r | A03; file default |
| N0742 | `tests/node/quality-provenance.test.mjs` | attachment-only rows do not repeat the legacy provenance label in the controls column | move-to-foundry | node-l-r | A03; file default |
| N1039 | `tests/node/xp-entry-builders.test.mjs` | the builders are referentially pure — same input yields equal output, no shared state | keep+rename | node-s-x |  |
| N1057 | `tests/node/xp-purchase-no-ae-suspension.test.mjs` | buying an item does not suspend the actor's Active Effects | move-to-foundry | node-s-x | A03; file default |
| N1058 | `tests/node/xp-purchase-no-ae-suspension.test.mjs` | buying an item deducts XP from the source, not the AE-modified prepared value | move-to-foundry | node-s-x | A03; file default |
| N1059 | `tests/node/xp-purchase-no-ae-suspension.test.mjs` | the XP deduction is still applied exactly once | move-to-foundry | node-s-x | A03; file default |
| N1060 | `tests/node/xp-purchase-no-ae-suspension.test.mjs` | no talent-tree purchase path suspends Active Effects | move-to-foundry | node-s-x | A03; file default |
| N1061 | `tests/node/xp-purchase-no-ae-suspension.test.mjs` | _buyHandleClick returns the source available XP | move-to-foundry | node-s-x | A03; file default |
| N1062 | `tests/node/xp-purchase-no-ae-suspension.test.mjs` | the tree-node purchase still gates learning on a successful XP deduction | move-to-foundry | node-s-x | A03; file default |
| N1063 | `tests/node/xp-refund-binding.test.mjs` | the refund handler is bound to the refund anchor itself | move-to-foundry | node-s-x | A03; file default |
| N1064 | `tests/node/xp-refund-binding.test.mjs` | the shared XP log renders a refund anchor the handler can match | move-to-foundry | node-s-x | A03; file default |
| N1065 | `tests/node/xp-refund-binding.test.mjs` | the shared XP log marks adjustment entries with the 'adjusted' class | move-to-foundry | node-s-x | A03; file default |
| N1074 | `tests/node/xp-refund-item.test.mjs` | the item purchase records the granted item, not the source item | move-to-foundry | node-s-x | A03; slice owner: Phase 3 row xp-refund-item, xp-refund-binding, xp-purchase-no-ae-suspension |
| N1075 | `tests/node/xp-refund-item.test.mjs` | both tree-node purchase paths record the islearned path they set | move-to-foundry | node-s-x | A03 |
| N1076 | `tests/node/xp-refund-item.test.mjs` | the XP adjustment records its signed amount | move-to-foundry | node-s-x | A03 |
| N1077 | `tests/node/xp-refund-item.test.mjs` | _refundPurchase reverses every kind and never rematches on a raw id | move-to-foundry | node-s-x | A03 |
| N1078 | `tests/node/xp-refund-item.test.mjs` | a refunded entry is stripped of both its id and its undo descriptor | move-to-foundry | node-s-x | A03 |
| N1079 | `tests/node/xp-refund-item.test.mjs` | an unresolvable entry tells the player instead of only the console | move-to-foundry | node-s-x | A03 |
| N1084 | `tests/node/xp-refund-item.test.mjs` | an item purchase distinguishes an explicit merge from refusal or cancellation | move-to-foundry | node-s-x | A03 |

## T14 Phase 3: init order, theme registration, CSS defense controls, artifact reviews

29 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0009 | `codex/tests/node/asset-paths.test.mjs` | every template include resolves | rewrite | codex-node | finding NF13 |
| N0010 | `codex/tests/node/asset-paths.test.mjs` | every stylesheet url resolves | rewrite | codex-node | finding NF13 |
| N0011 | `codex/tests/node/asset-paths.test.mjs` | every image a script loads resolves | rewrite | codex-node | finding NF13 |
| N0022 | `codex/tests/node/codex-button-defence.test.mjs` | the button-defence block still exists and is ID-weighted | move-to-foundry | codex-node | A03; slice owner: Phase 3 row init-order, theme registration, CSS defense controls |
| N0025 | `codex/tests/node/codex-button-defence.test.mjs` | no defended class sets background or border outside the defence block | rewrite | codex-node | finding NF21 |
| N0061 | `codex/tests/node/dice-window-styles.test.mjs` | the Codex stylesheet no longer carries the dice-window rules | remove | codex-node | A03; G11; file default |
| N0062 | `codex/tests/node/integrations.test.mjs` | Codex hooks the setting changes, the item editor and the roll dialog | move-to-foundry | codex-node | A03; finding NF25; file default |
| N0064 | `codex/tests/node/lang-expansion.test.mjs` | Codex lang/en.json expands without a key collision | rewrite | codex-node | finding NF20 |
| N0080 | `codex/tests/node/sheet-theme.test.mjs` | Configure Codex lists the GM's setting first | move-to-foundry | codex-node | A03; slice owner: Phase 3 (no named row): theme registration |
| N0082 | `codex/tests/node/sheet-theme.test.mjs` | the Codex settings module still parses | keep+rename | codex-node |  |
| N0214 | `tests/node/campaign-day-strings.test.mjs` | the Destiny Tracker and the campaignDay setting use them | rewrite | node-a-c | A03; slice owner: Audit plan Phase 3 (unmapped family) and the lang-expansion review bullet; G14 for the no-Codex startup; finding NF27 |
| N0244 | `tests/node/check-imports-activation.test.mjs` | with --cutover a missing shim file fails (plan §0.8: it must not be deleted) | keep+rename | node-a-c | finding NF32 |
| N0259 | `tests/node/check-imports-pins.test.mjs` | a message containing a \| survives the split | keep+rename | node-a-c |  |
| N0278 | `tests/node/check-imports-purity.test.mjs` | an allowed exception that gains ANY import is rejected, even a harmless one | rewrite | node-a-c | Audit plan Phase 1 tool trust (assertion strength) |
| N0280 | `tests/node/check-imports-rules.test.mjs` | shared character assembler remains in the import-clean closure | rewrite | node-a-c | A05 (with N0262); slice owner: N0262 and the purity suite; finding NF13 |
| N0294 | `tests/node/codex-boundary.test.mjs` | no system script imports a Codex script | rewrite | node-a-c | finding NF13 |
| N0297 | `tests/node/codex-boundary.test.mjs` | no system script, template or stylesheet names a Codex file | rewrite | node-a-c | finding NF13 |
| N0298 | `tests/node/codex-theme-owner.test.mjs` | no system script registers, reads or writes the Codex theme settings | rewrite | node-a-c | finding NF13 |
| N0299 | `tests/node/codex-theme-owner.test.mjs` | no system script registers the Configure Codex menu or the Codex house rules | rewrite | node-a-c | finding NF13 |
| N0326 | `tests/node/defence-cap.test.mjs` | defence cap setting is default-on, world-scoped, and listed under Combat | move-to-foundry | node-d-i | A03; slice owner: New Phase 3 row (settings registration plus actor honours the cap on and off); remove after it passes; finding NF27 |
| N0424 | `tests/node/esmodule-load-order.test.mjs` | the walk follows imports, so a pass is not vacuous | keep+rename | node-d-i |  |
| N0580 | `tests/node/lang-expansion.test.mjs` | lang/ca.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0581 | `tests/node/lang-expansion.test.mjs` | lang/de.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0582 | `tests/node/lang-expansion.test.mjs` | lang/en.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0583 | `tests/node/lang-expansion.test.mjs` | lang/es.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0584 | `tests/node/lang-expansion.test.mjs` | lang/fr.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0585 | `tests/node/lang-expansion.test.mjs` | lang/pt-BR.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0586 | `tests/node/lang-expansion.test.mjs` | lang/ua.json expands without a key collision | rewrite | node-l-r | slice owner: Phase 3 artifact review (lang-expansion), same file; finding NF20 |
| N0683 | `tests/node/public-api-surface.test.mjs` | modules/settings/ui-settings.js keeps the members public API v1 covers | rewrite | node-l-r | Phase 3 (code-layout rule); slice owner: Phase 3 (Foundry settings menu case); keep member-name needles meanwhile; finding NF27 |

Rows without a case id (not counted):

| row | what it covers |
| --- | --- |
| registrations are usable at init (new case) | R13: a Foundry startup case that, at the first `init` hook, the settings, the theme stylesheet and the sheets other packages rely on are registered and usable. It complements the source-order checks N0542-N0546 and N0693, which stay as a package-boundary contract. |

## T15 G01 character creation commit

33 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0139 | `tests/node/apply-build.test.mjs` | characteristic + derived stats: 2 Brawn purchases raise Brawn, wounds, soak, encumbrance | combine | node-a-c | (A04/A06 pattern); G01, G03; slice owner: N0150 (Node); G01/G03 (Foundry values); finding NF01 |
| N0140 | `tests/node/apply-build.test.mjs` | skill purchases add ranks | keep+rename | node-a-c |  |
| N0142 | `tests/node/apply-build.test.mjs` | XP, credits (incl. spendingCredits) and the selected ruleset track match the calculators | keep+rename | node-a-c | G01 |
| N0183 | `tests/node/attachment-purchases.test.mjs` | attachment compatibility follows target type or all | keep+rename | node-a-c |  |
| N0184 | `tests/node/attachment-purchases.test.mjs` | hardpoint accounting filters attachments that no longer fit | keep+rename | node-a-c |  |
| N0193 | `tests/node/build-item-schema.test.mjs` | projectEffectSource strips _id/origin/_stats; keeps normalized changes and sort | keep+rename | node-a-c | A05 |
| N0197 | `tests/node/build-item-schema.test.mjs` | forced collision: one seed with many distinct indices yields distinct ids sharing a prefix | keep+rename | node-a-c | finding NF02 |
| N0200 | `tests/node/build-item-schema.test.mjs` | assertWizardIdIntegrity throws on a duplicate item id and on a bad id shape | keep+rename | node-a-c |  |
| N0203 | `tests/node/build-item-schema.test.mjs` | deriveCommitActorId is deterministic, 16 chars, and memoized per {userId, commitId} | keep+rename | node-a-c |  |
| N0211 | `tests/node/calculators.test.mjs` | calcObligation returns the selected ruleset track | keep+rename | node-a-c |  |
| N0212 | `tests/node/calculators.test.mjs` | calcObligation applies field-specific bonus conventions | keep+rename | node-a-c | G01 |
| N0303 | `tests/node/commit-normalize.test.mjs` | normalization is deterministic for the same input (fingerprint stable) | keep+rename | node-a-c | A05 (cross-slice) |
| N0308 | `tests/node/commit-normalize.test.mjs` | sanitizer rejects a non-finite xp | keep+rename | node-a-c |  |
| N0310 | `tests/node/commit-service.test.mjs` | different commit stamp is not treated as a retry | rewrite | node-a-c | G01; finding NF36 |
| N0311 | `tests/node/constants.test.mjs` | stable values | rewrite | node-a-c | G01, G02; slice owner: G02 (size budget), G01 (timeout) |
| N0432 | `tests/node/free-rank-caps.test.mjs` | invalid and negative data is bounded | keep+rename | node-d-i | rule decision R07 (ruled) |
| N0624 | `tests/node/notify-policy.test.mjs` | R7-2 case 4: ACK accepted only when requester + GM sender + pending all hold | keep+rename | node-l-r |  |
| N0625 | `tests/node/notify-policy.test.mjs` | R7-2 case 1: ACK rejected for the WRONG requesterId | keep+rename | node-l-r |  |
| N0626 | `tests/node/notify-policy.test.mjs` | R7-2 case 2: ACK rejected when the sender is NOT a GM | keep+rename | node-l-r |  |
| N0627 | `tests/node/notify-policy.test.mjs` | R7-2 case 3: ACK rejected for an unknown / non-pending session | keep+rename | node-l-r |  |
| N0633 | `tests/node/notify-policy.test.mjs` | shouldEmitStart: render triggers | keep+rename | node-l-r |  |
| N0634 | `tests/node/notify-policy.test.mjs` | shouldEmitStart: gmConnect + preCommit + non-pending | keep+rename | node-l-r |  |
| N0677 | `tests/node/parity.test.mjs` | canonical projection: ammo weapon, medical gear, two same-key effects with different ... | keep+rename | node-l-r | A05 |
| N0925 | `tests/node/to-item-data.test.mjs` | projection preserves an effect's disabled:true (unlearned node stays disabled) | keep+rename | node-s-x | A09 (learned versus unlearned nodes); slice owner: Phase 2 A09 / G03 for the real materializer |
| N0926 | `tests/node/to-item-data.test.mjs` | issue E: rank grants are deterministic (pcwRank<n>_slug), identical across runs, no ... | keep+rename | node-s-x |  |
| N0928 | `tests/node/to-item-data.test.mjs` | N-5 / duplicate purchase: two identical gear refs → two independent items with distinct ... | keep+rename | node-s-x | A05 |
| N0959 | `tests/node/validate.test.mjs` | BINDING: every returned label and warning is an i18n KEY (SWFFG. prefix), never localized ... | keep+rename | node-s-x | finding NF16 |
| N0960 | `tests/node/validate.test.mjs` | totals expose the running XP and credit calculations | rewrite | node-s-x | finding NF16 |
| N1017 | `tests/node/wizard-state.test.mjs` | createInitialData: commitId matches the document-id regex (DEV-5 guard) | keep+rename | node-s-x |  |
| N1023 | `tests/node/wizard-state.test.mjs` | wizard-state mutators are pure state transitions (setIdentity/setSelection/addSelection) | keep+rename | node-s-x |  |
| N1024 | `tests/node/wizard-state.test.mjs` | applyStartingBonus BUG-2: aor duty grant lands in bonus.duty, not bonus[undefined] | keep+rename | node-s-x | rule decision R17 (ruled), R18 (ruled) |
| N1026 | `tests/node/wizard-state.test.mjs` | applyStartingBonus is a deterministic pure state transition | keep+rename | node-s-x | rule decision R17 (ruled), R18 (ruled) |
| N1028 | `tests/node/wizard-state.test.mjs` | calcObligation agrees with the grants.bonus display via the shared table | keep+rename | node-s-x | rule decision R17 (ruled), R18 (ruled) |

## T16 G02 draft save and resume

2 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0408 | `tests/node/draft-schema.test.mjs` | byte measurement is UTF-8 bytes; a normal draft is within the 64 KiB budget | rewrite | node-d-i | slice owner: Phase 2 (G02 Node); finding NF05 |
| N0411 | `tests/node/draft-schema.test.mjs` | rehydrateRef: a non-obligation ref takes the fresh system; an unresolvable ref warns | rewrite | node-d-i | slice owner: Phase 2 (G02 Node) |

## T17 G03 preview

No case ids. Its work is the new preview coverage (G03); see NF11 for the test-side copy in N0675, which stays as the Node owner of id equality.

## T18 G04 talent paths

4 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| F0049 | `tests/talent-tree.test.js` | Rightmost column does not read off-grid for right edge | rewrite | foundry-browser | slice owner: Phase 4 G04; finding NF12, NF42 |
| F0050 | `tests/talent-tree.test.js` | Force power row 0 needs an up-link to count as rooted | combine | foundry-browser | A05; slice owner: Phase 4 G04; rule decision R32 (ruled); finding NF42 |
| F0054 | `tests/talent-tree.test.js` | Force power up-edge slot 2 looks at correct parent column | keep+rename | foundry-browser | finding NF42 |
| F0066 | `tests/talent-tree.test.js` | Specialization row 0 stays unconditional (no implicit parent) | combine | foundry-browser | A05; slice owner: Phase 4 G04; finding NF42 |

## T19 G05 Hyperdrive import

21 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0181 | `tests/node/assemble-character-source.test.mjs` | offers conservative CORS repair candidates for remote token images | keep+rename | node-a-c |  |
| N0182 | `tests/node/assemble-character-source.test.mjs` | assembles identity, base advances, accounting, track, and best armour | rewrite | node-a-c | A05 (with N0154); slice owner: G05 (shared assembler), G01; finding NF01 |
| N0457 | `tests/node/hyperdrive-effects.test.mjs` | buildItemEffects emits exact inherent species, armour, gear, and career changes | rewrite | node-d-i | G05; slice owner: Phase 2/G05 pure builder cases; finding NF17 |
| N0458 | `tests/node/hyperdrive-effects.test.mjs` | normalizes characteristic, counted, keyed-skill, SkillChar, and SkillType modifiers | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0459 | `tests/node/hyperdrive-effects.test.mjs` | shared namer remains unique across calls and owner mods exclude FromAttachment entries | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0461 | `tests/node/hyperdrive-effects.test.mjs` | attachment installation handles keyless, failed, counted, and export-authoritative cases | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0470 | `tests/node/hyperdrive-inplace.test.mjs` | species and career in-place builders synthesize real item-owned effects | rewrite | node-d-i | G05; slice owner: G05 pure builder cases; finding NF17 |
| N0474 | `tests/node/hyperdrive-inplace.test.mjs` | cybernetic gear applies Brawn and quality snapshots preserve ranks/freeform data | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0477 | `tests/node/hyperdrive-inplace.test.mjs` | configured compendium attachments preserve documents and Hyperdrive mod states | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0478 | `tests/node/hyperdrive-inplace.test.mjs` | matched equipment overlays configured qualities and attachment documents | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0479 | `tests/node/hyperdrive-inplace.test.mjs` | overlay seeds effect names and identity stamping reaches nested attachments | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0480 | `tests/node/hyperdrive-inplace.test.mjs` | dispatch builds equipment/content and stubs unmatched trees with an explicit warning | rewrite | node-d-i | slice owner: G05 pure builder cases; finding NF17 |
| N0482 | `tests/node/hyperdrive-parse.test.mjs` | parses tree grids, force powers, skills, career ranks, and signatures from canonical ... | rewrite | node-d-i | slice owner: G05 pure parser cases; finding NF17 |
| N0484 | `tests/node/hyperdrive-parse.test.mjs` | is null-safe and infers non-Force rulesets | keep+rename | node-d-i |  |
| N0489 | `tests/node/hyperdrive-persist.test.mjs` | override creates a fresh actor and deletes the previous document | rewrite | node-d-i | G05; slice owner: T19 (G05); rule decision R04 (ruled) |
| N0490 | `tests/node/hyperdrive-persist.test.mjs` | override keeps the previous actor's ownership and folder | rewrite | node-d-i | G05; slice owner: T19 (G05); rule decision R04 (ruled) |
| N0491 | `tests/node/hyperdrive-persist.test.mjs` | override does not create anything when deleting the existing actor fails | rewrite | node-d-i | G05; slice owner: T19 (G05); rule decision R04 (ruled) |
| N0492 | `tests/node/hyperdrive-persist.test.mjs` | override restores the previous actor if replacement creation fails | rewrite | node-d-i | G05; slice owner: T19 (G05); rule decision R04 (ruled) |
| N0511 | `tests/node/hyperdrive-to-actor.test.mjs` | golden export stores characteristic residuals and purchased skill ranks | rewrite | node-d-i | G05; slice owner: G05 (Foundry real preparation); finding NF01, NF17 |
| N0522 | `tests/node/hyperdrive-xp.test.mjs` | derives spend from the purchases and preserves an overspent export | keep (open R05) | node-d-i | slice owner: T19 (G05); rule decision R05 (open); T19 establishes which exported field is remaining vs spent XP from a real export before pinning values |
| N0523 | `tests/node/hyperdrive-xp.test.mjs` | reports a spend that does not reconcile with the exported remaining XP | keep (open R05) | node-d-i | slice owner: T19 (G05); rule decision R05 (open); T19 establishes which exported field is remaining vs spent XP from a real export before pinning values |

## T20 G06 SWA and OggDude import

1 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0868 | `tests/node/swa-skill-dictionary.test.mjs` | keeps the OggDude skill keys the importer has always written | rewrite | node-s-x | G06; slice owner: G06 pure translation cases; finding NF07 |

## T21 G07 modifier effect reconciliation

13 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0220 | `tests/node/career-skill-effects.test.mjs` | a specialization dropped on an actor is still planned an inherent effect | move-to-foundry | node-a-c | A03, G07; slice owner: Audit plan Phase 3 and G07; finding NF27 |
| N0415 | `tests/node/edit-mode-ae-suspension.test.mjs` | ActorFFG withholds stat effects in Edit Mode but keeps conditions applying | move-to-foundry | node-d-i | A03; slice owner: New Phase 3 row (Edit Mode suspension on a real Actor: stat effects held, condition statuses kept); G07; finding NF27 |
| N0570 | `tests/node/item-create-effects.test.mjs` | gives career and specialization their placeholder career-skill slots | rewrite | node-d-i | slice owner: Phase 5 (keep owner in this file); finding NF18 |
| N0574 | `tests/node/item-create-effects.test.mjs` | plans both kinds at once and skips only the kind already present | rewrite | node-d-i | A05; slice owner: Phase 5; G07 plan tests retained; finding NF18 |
| N0575 | `tests/node/item-create-effects.test.mjs` | every planned effect carries the item's image | keep+rename | node-d-i |  |
| N0576 | `tests/node/item-create-effects.test.mjs` | the generated effects are folded into the item, not written after it is created | move-to-foundry | node-d-i | A03, G07; slice owner: New Phase 3 row (create an item, count its effects once, no second embedded create); remove after it passes; finding NF27 |
| N0700 | `tests/node/quality-effect-plan.test.mjs` | no planned change is ever non-finite | rewrite | node-l-r | rule decision R15 (ruled); finding NF14 |
| N0715 | `tests/node/quality-effect-plan.test.mjs` | describeEffect renders a change so a before/after can be read at a glance | keep+rename | node-l-r |  |
| N0718 | `tests/node/quality-effect-plan.test.mjs` | effectMatchesPlan compares values across the string/number boundary | keep+rename | node-l-r |  |
| N0725 | `tests/node/quality-effect-plan.test.mjs` | a non-equippable item plans nothing as disabled | keep+rename | node-l-r |  |
| N0727 | `tests/node/quality-effect-plan.test.mjs` | missing system collections are tolerated | keep+rename | node-l-r |  |
| N0887 | `tests/node/talent-attribute-effects.test.mjs` | the repair sweep includes talent items owned only by an unlinked token actor | move-to-foundry | node-s-x | G07; slice owner: Phase 4 G07; finding NF39 |
| N0888 | `tests/node/talent-attribute-effects.test.mjs` | the repair sweep re-reads synthetic token items after repairing their base actor | move-to-foundry | node-s-x | G07; slice owner: Phase 4 G07; finding NF39 |

## T22 G08 damage and critical actions

11 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| F0013 | `tests/crit-trauma-counter.test.js` | mechanics present only when vehicleLimit on | keep+rename | foundry-browser | G08 (retain); finding NF42 |
| N0110 | `tests/node/actor-apply-coordinator.test.mjs` | forwarded owners retain direct-write capabilities; nonowners retain existing validation | keep+rename | node-a-c | G08; slice owner: gm-bridge apply suite (primary owner of prepareForwardedApply) |
| N0165 | `tests/node/apply-damage.test.mjs` | protection applies to strain and to all personal actor types, with damage floored at zero | keep+rename | node-a-c |  |
| N0170 | `tests/node/apply-damage.test.mjs` | a minion has no strain track to write to | keep+rename | node-a-c |  |
| N0173 | `tests/node/apply-damage.test.mjs` | the seed reads Pierce and Breach off the rendered qualities, suffixed or not | keep+rename | node-a-c | A05 |
| N0176 | `tests/node/apply-damage.test.mjs` | a reduction larger than the damage leaves only the cost to pay | keep+rename | node-a-c |  |
| N0177 | `tests/node/apply-damage.test.mjs` | Pierce works on the reduced damage | keep+rename | node-a-c |  |
| N0179 | `tests/node/apply-damage.test.mjs` | a rival pays in wounds, merged with the hit | rewrite | node-a-c | finding NF38 |
| N0180 | `tests/node/apply-damage.test.mjs` | without a defensive talent the result is exactly what it always was | keep+rename | node-a-c |  |
| N0344 | `tests/node/defensive-talents.test.mjs` | the attacking skill decides melee or ranged, and nothing else qualifies | rewrite | node-d-i | slice owner: Phase 2 (same pattern as A04/A06); G08; finding NF04 |
| N0367 | `tests/node/defensive-talents.test.mjs` | unit words follow the pool and the count | keep+rename | node-d-i |  |

## T23 G09 GM bridge and Destiny

6 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0102 | `tests/node/actor-apply-coordinator.test.mjs` | a request is settled, not polled forever, once its writer disconnects | rewrite | node-a-c | slice owner: Audit plan completion check "controlled race cases ... without relying on elapsed time"; finding NF34 |
| N0312 | `tests/node/constants.test.mjs` | wizard socket event names do NOT collide with the GM bridge's (plan §0.9) | rewrite | node-a-c | finding NF35 |
| N0391 | `tests/node/destiny-queue.test.mjs` | a destiny-adjust 1 drain delivers every flip result even when its return value is ignored | rewrite | node-d-i | slice owner: Phase 2/5; G09 retains the queue case; finding NF06 |
| N0392 | `tests/node/destiny-queue.test.mjs` | a destiny-adjust -1 drain delivers every flip result even when its return value is ignored | rewrite | node-d-i | slice owner: Phase 2/5; G09 retains the queue case; finding NF06 |
| N0393 | `tests/node/destiny-queue.test.mjs` | a destiny-roll drain delivers every flip result even when its return value is ignored | rewrite | node-d-i | slice owner: Phase 2/5; G09 retains the queue case; finding NF06 |
| N0445 | `tests/node/gm-bridge-apply.test.mjs` | any connected user may forward, with or without a chat card behind it | keep+rename | node-d-i |  |

## T24 G10 minions and vehicles

8 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0084 | `codex/tests/node/vehicle-hardpoints.test.mjs` | the Codex vehicle fallback reads the stored hull rating | move-to-foundry | codex-node | A03; G10; file default |
| N0085 | `codex/tests/node/vehicle-hardpoints.test.mjs` | the Codex vehicle sheet shows used-of-rating and edits the rating | move-to-foundry | codex-node | A03; G10; file default |
| N0128 | `tests/node/adversary-badge-scale.test.mjs` | a 1x1 token on a 100px grid keeps the badge size and placement it has always had | keep+rename | node-a-c | G10; finding NF33 |
| N0235 | `tests/node/character-defence-dice.test.mjs` | a Set of targets works, since game.user.targets is one | keep+rename | node-a-c |  |
| N0593 | `tests/node/minion-count-scale.test.mjs` | a 1x1 token on a 100px grid keeps the tally it has always had | keep+rename | node-l-r | finding NF19, NF33 |
| N0598 | `tests/node/minion-count-scale.test.mjs` | alive minions are drawn in the living colour and the fallen in the dead one | rewrite | node-l-r | finding NF19, NF33 |
| N0619 | `tests/node/minion-kill-helpers.test.mjs` | wiping out a minion vehicle group takes it one past the group threshold | keep+rename | node-l-r |  |
| N0975 | `tests/node/vehicle-defence.test.mjs` | every mode the vehicle schema offers is one the resolver understands | keep+rename | node-s-x | finding NF40 |

## T25 G11 dice workflow

4 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| F0024 | `tests/replace-die.test.js` | faceTally recovers from CONFIG.FFG.PROFICIENCY_RESULTS when r.ffg is missing | rewrite | foundry-browser | A04 pattern (new instance); slice owner: Phase 4 G11; finding NF09 |
| F0028 | `tests/replace-die.test.js` | recomputeTermFFG matches the die's own evaluate() aggregation | rewrite | foundry-browser | G11; slice owner: Phase 4 G11; finding NF10 |
| F0035 | `tests/replace-die.test.js` | audit capture: deepClone(faceTally(...) ?? zeroTally()) recovers the table tally and ... | rewrite | foundry-browser | A04 pattern (new), A05 pair F0024; slice owner: Phase 4 G11; finding NF09 |
| F0036 | `tests/replace-die.test.js` | audit capture: a malformed face captures zeroTally(), never undefined | rewrite | foundry-browser | A04 pattern (new), A05 pair F0026; slice owner: Phase 4 G11; finding NF09 |

## T26 G12 data models

3 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0774 | `tests/node/skill-defaults.test.mjs` | the defaults carry the definitions the presentation table cannot | rewrite | node-s-x | finding NF15 |
| N0777 | `tests/node/skill-defaults.test.mjs` | a configured alternate theme supplies the definitions | rewrite | node-s-x | finding NF15 |
| N0780 | `tests/node/skill-defaults.test.mjs` | the defaults are a copy of the shared tables, never the tables themselves | keep+rename | node-s-x |  |

Also owns, without case ids: converting `import-test.mjs`, `prove-fix.mjs`, `rival-bar2.mjs` and `talent-roundtrip.mjs`, and adding the missing evidence README rows (see Files and scripts below).

## T27 G13 migrations

1 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0416 | `tests/node/edit-mode-ae-suspension.test.mjs` | the stale-flag migration is gated on a real version comparison | move-to-foundry | node-d-i | A03; slice owner: G13 (Foundry, isolated settings); finding NF27 |

Also owns, without case ids: converting `rv2.mjs` (see Files and scripts below).

## T28 G14 source pools and startup

4 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0007 | `codex/tests/node/api-check.test.mjs` | the check runs before any other Codex script, and a failure stops them all | rewrite | codex-node | G14; slice owner: G14 (Foundry startup); api-check stays the pure owner |
| N0805 | `tests/node/source-descriptors.test.mjs` | N-1: career maps to the world type 'career', not 'careers' | keep+rename | node-s-x |  |
| N0806 | `tests/node/source-descriptors.test.mjs` | species / obligation / motivation / background / specialization settings are correct | keep+rename | node-s-x |  |
| N0810 | `tests/node/source-descriptors.test.mjs` | isSourceEnabled defaults compendiums on and honours per-pool exclusions (D7) | keep+rename | node-s-x |  |

## T29 Phase 5 removals and Cypress

61 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| C0001 | `cypress/e2e/00_init.cy.js` | initializes the world | remove | foundry-browser | A10, G14; slice owner: Phase 5 row "Commented Cypress item cases and folder-only placeholders" |
| C0002 | `cypress/e2e/01_create_entities.cy.js` | creates actors | remove | foundry-browser | A10, G12; slice owner: Phase 5 (Playwright actor creation) |
| C0003 | `cypress/e2e/01_create_entities.cy.js` | creates items | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0004 | `cypress/e2e/02_test_items.cy.js` | sets up the folder | remove | foundry-browser | A10; slice owner: Phase 5; finding NF46 |
| C0005 | `cypress/e2e/02_test_items.cy.js` | creates an ability | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0006 | `cypress/e2e/02_test_items.cy.js` | creates armor | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0007 | `cypress/e2e/02_test_items.cy.js` | creates a career | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0008 | `cypress/e2e/02_test_items.cy.js` | creates critical damage | remove | foundry-browser | A10, G12; slice owner: Phase 5 (Playwright item creation) |
| C0009 | `cypress/e2e/02_test_items.cy.js` | creates critical injury | remove | foundry-browser | A10, G12; slice owner: Phase 5 |
| C0010 | `cypress/e2e/02_test_items.cy.js` | creates force power | remove | foundry-browser | A10, G12; slice owner: Phase 5 |
| C0011 | `cypress/e2e/02_test_items.cy.js` | creates gear | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0012 | `cypress/e2e/02_test_items.cy.js` | creates item attachment | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0013 | `cypress/e2e/02_test_items.cy.js` | creates item modification | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0014 | `cypress/e2e/02_test_items.cy.js` | creates talent | remove | foundry-browser | A10, G12; slice owner: Phase 5 |
| C0015 | `cypress/e2e/02_test_items.cy.js` | creates ship attachment | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0016 | `cypress/e2e/02_test_items.cy.js` | creates ship weapon | remove | foundry-browser | A10, G12; slice owner: Phase 5 |
| C0017 | `cypress/e2e/02_test_items.cy.js` | creates homestead upgrade | remove | foundry-browser | A10; slice owner: Phase 5 |
| C0018 | `cypress/e2e/02_test_items.cy.js` | creates signature ability | remove | foundry-browser | A10, G12; slice owner: Phase 5 |
| F0007 | `tests/common.test.js` | Object Diff Function should return correct diff | remove | foundry-browser | rule decision R27 (ruled); finding NF42 |
| N0073 | `codex/tests/node/sheet-registration.test.mjs` | the Codex sheet classes keep the names worlds have stored | combine | codex-node | A05; A11; slice owner: N0072; A11 Foundry case |
| N0147 | `tests/node/apply-build.test.mjs` | items are built via the injected toItemData (species + forceAttitude present) | combine | node-a-c | A05; slice owner: N0145 |
| N0161 | `tests/node/apply-damage.test.mjs` | the seed offers Pierce plus ten per Breach | combine | node-a-c | A05; slice owner: N0173, N0171 |
| N0168 | `tests/node/apply-damage.test.mjs` | no protection is reported for absent, unworn, inactive, or broken qualities | combine | node-a-c | A05; slice owner: N0163, N0164 |
| N0195 | `tests/node/build-item-schema.test.mjs` | effect priority + flags.core.overlay survive; flags.core.sourceId and origin are dropped | combine | node-a-c | A05; slice owner: N0193 |
| N0215 | `tests/node/campaign-day-strings.test.mjs` | no system file still uses the Codex keys for the campaign day | combine | node-a-c | A05; slice owner: N0297 |
| N0232 | `tests/node/character-defence-dice.test.mjs` | a vehicle target does not throw despite having no defence stat | combine | node-a-c | A05; slice owner: N0231 |
| N0313 | `tests/node/constants.test.mjs` | wizard socket event names are internally unique | combine | node-a-c | A05; slice owner: N0312 |
| N0314 | `tests/node/constants.test.mjs` | SOCKET_EVENTS is frozen (constants are not mutable at runtime) | remove | node-a-c | slice owner: none (remove); rule decision R01 (ruled) |
| N0315 | `tests/node/constants.test.mjs` | lang/en.json parses as valid JSON and keeps the CharacterCreator block | remove | node-a-c | A05 (cross-slice); slice owner: lang-expansion review bullet |
| N0322 | `tests/node/defence-cap.test.mjs` | the Star Wars FFG character defence maximum is 4 | combine | node-d-i | A05; slice owner: Phase 5; primary owner N0323 |
| N0332 | `tests/node/defensive-damage-apply.test.mjs` | a rival's merged hit is checked on its cost alone | combine | node-d-i | A05; slice owner: Phase 5; primary owner N0454; finding NF34 |
| N0350 | `tests/node/defensive-talents.test.mjs` | a reSpecialized v.56 character: Block and Deflect take 4 off, Unarmed Block cuts melee ... | rewrite | node-d-i | A05; slice owner: Phase 5; primary owner N0349 for the flat reduction; rule decision R06 (ruled) |
| N0351 | `tests/node/defensive-talents.test.mjs` | in a reSpecialized world Parry and Reflect, and their modifiers, stand in for Block and ... | rewrite | node-d-i | A05; slice owner: Phase 5; primary owner N0349 for the flat reduction; rule decision R06 (ruled) |
| N0403 | `tests/node/draft-schema.test.mjs` | frozen-commit durability: the commit (incl fingerprint) survives round-trip deep-equal | combine | node-d-i | A05; slice owner: Phase 5; primary owner N0402 (G02 pure serialization) |
| N0413 | `tests/node/edit-mode-ae-suspension.test.mjs` | an unlinked token does not inherit its base actor's Edit Mode | combine | node-d-i | A05; slice owner: Phase 5; primary owner N0414 |
| N0434 | `tests/node/gm-bridge-apply.test.mjs` | without the serializer the same pair loses an update (the bug this fixes) | remove | node-d-i | A10; slice owner: Phase 5 row gm-bridge-apply; G09 for the real bridge |
| N0572 | `tests/node/item-create-effects.test.mjs` | plans nothing when the item already carries the effect | combine | node-d-i | A05; slice owner: Phase 5; primary owner N0574 |
| N0630 | `tests/node/notify-policy.test.mjs` | two concurrent players: accepting player A's ACK does not affect player B | combine | node-l-r | finding NF30 |
| N0631 | `tests/node/notify-policy.test.mjs` | close-while-pending: clearing the entry leaves the map empty (no leak) | combine | node-l-r | finding NF30 |
| N0632 | `tests/node/notify-policy.test.mjs` | R7-2 case 8 — lost-ACK failover: a second GM can re-process and its ACK is accepted | combine | node-l-r | G09 (closest row); slice owner: N0628 in this file; Foundry multi-session case if a row is added; finding NF30 |
| N0635 | `tests/node/notify-policy.test.mjs` | setPending adds an entry | combine | node-l-r | slice owner: N0630; finding NF30 |
| N0660 | `tests/node/obligation-tracks.test.mjs` | building the table again gives the same table, not a longer one | combine | node-l-r | slice owner: N0660 plus N0661 as one case, buildTrackTable returns only the characters it is given, however often it ran before; finding NF29 |
| N0661 | `tests/node/obligation-tracks.test.mjs` | a character who has left the group leaves nothing behind in the next table | combine | node-l-r | slice owner: N0660; finding NF29 |
| N0672 | `tests/node/parity.test.mjs` | (a) repeated assignWizardIdentity gives identical ids | remove | node-l-r | A05; slice owner: tests/node/build-item-schema.test.mjs |
| N0673 | `tests/node/parity.test.mjs` | (b) the same gear bought twice gets DISTINCT item ids | remove | node-l-r | A05; slice owner: tests/node/to-item-data.test.mjs |
| N0674 | `tests/node/parity.test.mjs` | (e) re-minting the commitId changes ALL ids | remove | node-l-r | A05; slice owner: tests/node/build-item-schema.test.mjs |
| N0676 | `tests/node/parity.test.mjs` | (d) two normalizeCommitSource runs on the same payload are byte-equal | remove | node-l-r | A05; slice owner: tests/node/commit-normalize.test.mjs |
| N0701 | `tests/node/quality-effect-plan.test.mjs` | an unrecognised mod produces no change rather than a change with no key | combine | node-l-r | slice owner: N0701 as a table of inputs |
| N0702 | `tests/node/quality-effect-plan.test.mjs` | an attribute missing modtype/mod entirely is skipped, not exploded | combine | node-l-r | slice owner: N0701 |
| N0750 | `tests/node/remote-sheet-refresh.test.mjs` | handles a world item, which has no owning actor | combine | node-l-r | slice owner: N0745 (rename to cover the world-item case) |
| N0792 | `tests/node/skill-theme-application.test.mjs` | the SWA dictionary really does differ from the model default | combine | node-s-x | slice owner: N0791 |
| N0801 | `tests/node/smoke.test.mjs` | the Node test tier runs | remove | node-s-x | A10; Phase 5 rows 1 and 2; file default |
| N0802 | `tests/node/smoke.test.mjs` | the foundry stub is loadable and provides foundry.utils.randomID | combine | node-s-x | A10; slice owner: N0864 (stub-boundary) / Phase 5 row 2 |
| N0819 | `tests/node/source-descriptors.test.mjs` | the descriptor table is frozen | remove | node-s-x | slice owner: none (remove); rule decision R01 (ruled) |
| N0826 | `tests/node/starting-bonus.test.mjs` | BUG-2: aor/eote grants target bonus.duty / bonus.obligation, never bonus[undefined] | combine | node-s-x | A05; slice owner: N0825, N1024; rule decision R18 (ruled) |
| N0831 | `tests/node/starting-bonus.test.mjs` | the table is frozen | remove | node-s-x | slice owner: none (remove); rule decision R01 (ruled) |
| N0863 | `tests/node/stub-boundary.test.mjs` | the stub installs no forbidden nested path | combine | node-s-x | A05; slice owner: N0864, N0862 |
| N0941 | `tests/node/turn-adjacent-face.test.mjs` | every face of a d6 touches all faces but its opposite | combine | node-s-x | A05; slice owner: N0929, N0931, N0942, N0943 |
| N1030 | `tests/node/xp-entry-builders.test.mjs` | buildXpSpendEntry: action is always the literal 'purchased' | combine | node-s-x | A05; slice owner: N1032 |
| N1031 | `tests/node/xp-entry-builders.test.mjs` | buildXpSpendEntry: the description lands in .description (not in .action) | combine | node-s-x | A05; slice owner: N1032 |
| N1073 | `tests/node/xp-refund-item.test.mjs` | the builders carry the undo descriptor through untouched | combine | node-s-x | A05; slice owner: N1032 |

Also owns, without case ids: the Cypress support files and `cypress.config.js`, and removing `bars.js` and `rival-strain.js` (see Files and scripts below).

## T30 final validation

No case ids. Final validation re-runs the generator and reconciles the inventory; see the files and scripts section for the wording and sanitizing items assigned to T30.

## PF1 Product fix R16: every minion kill removes exactly one minion; stepper revive edge fixes

2 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0617 | `tests/node/minion-kill-helpers.test.mjs` | destroying a vehicle in a minion vehicle group keeps the partial hull damage | keep+rename | node-l-r | slice owner: PF1 (R16 product fix); rule decision R16 (ruled) |
| N0620 | `tests/node/minion-kill-helpers.test.mjs` | a plain vehicle is not a group, and minions keep their existing arithmetic | rewrite | node-l-r | slice owner: PF1 (R16 product fix); rule decision R16 (ruled) |

Rows without a case id (not counted):

| row | what it covers |
| --- | --- |
| minion-group property case "a step that cannot move a unit leaves the damage as it is" | Added by Task 5 (`cc61d38f`); no stable id at the cases.md commit. It skips damage 1 with a comment, because `stepUnits(1, 6, 4, +1)` returns 0. Remove the skip once the stepper returns the input unchanged. |
| new cases: every kill removes one minion | Second kill from wounds 4 (unit 3, group of 4) gives 7, a kill with partial damage (wounds 2) gives 5, nothing left to destroy writes nothing, and a unit_wounds of 0 writes nothing. These split N0620. |
| new cases: stepper revive edges | A revive on a group that lost no unit returns its damage unchanged, and a revive from damage far past the wipe-out leaves exactly one unit standing. Both change `stepUnits`, which the Codex minion stepper and the minion-vehicle hull stepper share. |

## PF2 Product fix R17: record 2,500 starting credits as decided

2 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0825 | `tests/node/starting-bonus.test.mjs` | every self-identifying starting bonus cell matches the transcription | keep+rename | node-s-x | A04/A06 pattern (snapshot of product table); rule decision R17 (ruled), R18 (ruled); finding NF08 |
| N0827 | `tests/node/starting-bonus.test.mjs` | Q-2: 2k_credits grants 2500 in every book-family option | combine | node-s-x | A05; slice owner: N0825; rule decision R17 (ruled) |

Rows without a case id (not counted):

| row | what it covers |
| --- | --- |
| `modules/char-creator/starting-bonus.js` comment | Record Q-2 (`2k_credits` grants 2,500) as decided instead of a preserved quirk. |
| PcWizard design doc | `superpowers/docs/plans/PcWizard/pc_wizard_design_doc.md` (section 5.4, section 10 item 3 and the Q-2 row): mark the 2,500 value as decided. |
| labels | No relabel is needed: the option labels in `lang/en.json` already read "+2,500 starting credits"; only the internal keys say 2k, and renaming them would break saved drafts. |

## PF3 Product fix R14: the enabled toggle suspends direct qualities too

2 case ids.

| id | file | case name | disposition | slice | notes |
| --- | --- | --- | --- | --- | --- |
| N0721 | `tests/node/quality-effect-plan.test.mjs` | an equipped weapon plans its quality effects as active | combine | node-l-r | A05; slice owner: N0723 (PF3); rule decision R14 (ruled) |
| N0723 | `tests/node/quality-effect-plan.test.mjs` | a directly-attached quality is not judged by the attachment 'active' flag | rewrite | node-l-r | A05; slice owner: PF3 (R14 product fix); rule decision R14 (ruled) |

Rows without a case id (not counted):

| row | what it covers |
| --- | --- |
| `planModifierEffects` and `shouldUpdateAEStatus` in `modules/helpers/item-helpers.js` | R14: an explicit `active === false` on a direct quality suspends it, as it already does inside an attachment; a missing `active` stays enabled. N0723 is replaced by three cases (false disabled, missing enabled, true enabled); N0721 folds into the `active: true` case. |

## Unassigned

6 case ids. Each is an in-place rewrite or rename in a feature area that no plan finding, gap row or Phase 3 family covers.

| id | file | case name | disposition | slice | reason |
| --- | --- | --- | --- | --- | --- |
| N0036 | `codex/tests/node/codex-popup-position.test.mjs` | Codex popup clamps against every viewport edge | rewrite | codex-node | No plan finding or gap row covers the Codex popup placement helper. In-place rewrite (add right and bottom edge cases). |
| N0052 | `codex/tests/node/codex-talent-tiers.test.mjs` | duplicate talent items are decided by the one edited most recently | rewrite | codex-node | No plan finding or gap row covers Codex talent-tier placement (G04 covers purchase connectivity, not display tiers). In-place rewrite (weak oracle). |
| N0053 | `codex/tests/node/codex-talent-tiers.test.mjs` | duplicates with no usable timestamp fall back to the highest tier | rewrite | codex-node | No plan finding or gap row covers Codex talent-tier placement (G04 covers purchase connectivity, not display tiers). In-place rewrite (weak oracle). |
| N0641 | `tests/node/obligation-tracks.test.mjs` | an entry with a blank magnitude leaves the total a number | keep+rename | node-l-r | No plan finding or gap row covers Obligation/Duty/Morality tracks or the Group Manager window (the inventory notes the plan has no row for it). Rename-only; propose a new gap row or fold into T30. |
| N0651 | `tests/node/obligation-tracks.test.mjs` | the boxes a sheet draws follow Edit Mode too | keep+rename | node-l-r | No plan finding or gap row covers Obligation/Duty/Morality tracks or the Group Manager window (the inventory notes the plan has no row for it). Rename-only; propose a new gap row or fold into T30. |
| N0653 | `tests/node/obligation-tracks.test.mjs` | a folded entry also keeps its own magnitude | keep+rename | node-l-r | No plan finding or gap row covers Obligation/Duty/Morality tracks or the Group Manager window (the inventory notes the plan has no row for it). Rename-only; propose a new gap row or fold into T30. |

## Files and scripts without case ids

Not counted in the totals above. Dispositions are from the `foundry-browser` slice.

| path | disposition | owner | note |
| --- | --- | --- | --- |
| `tests/ffg-tests.js` | rewrite | T2* | Foundry harness: a package suite that fails to load is only logged, no structured result, fixtures are created in whatever world opens it, and the launcher macro uses the pre-V10 API (NF43). Phase 1 runner work already in progress. |
| `playwright/fixtures.ts` | rewrite | T3 | A01: explicit field map, unknown names throw, no writes in check methods. Also `remove()` deletes by name, two 505 ms sleeps, and `switchTab`/`setStat` ignore unknown names. |
| `cypress/support/commands.js` | remove | T29 | After the Playwright startup readiness case exists (T28, G14). Holds a credential-shaped literal (NF47). |
| `cypress/support/common.js` | remove | T29 | Neither export is imported anywhere. |
| `cypress/support/e2e.js` | remove | T29 | After T3 carries the fail-closed base-URL guard to Playwright (NF44). |
| `cypress.config.js` | remove | T29 | Remove with the runner, the `package.json` dependency, the lockfile entry and the two CI comments that mention Cypress. |

Kept but with a to-do: `playwright/setup.ts` (delete the commented-out login block that holds placeholder credentials; add the live-world guard, T3).

Scripts that print output (paths under `docs/superpowers/plans/artifacts/2026-07-14-datamodel-evidence/`):

| script | disposition | owner | note |
| --- | --- | --- | --- |
| `import-test.mjs` | convert | T26 | Prints `typeof` lines only; the import boundary is covered by `npm run check:imports`; the execution claim moves to G12 or is dropped. |
| `prove-fix.mjs` | convert | T26 | Prepared view shows stored values; assert it on fixture documents (G12). |
| `rival-bar2.mjs` | convert | T26 | Assert prototype-token bars on real rival documents (G12; G10 touches the same rival data). |
| `rv2.mjs` | convert | T27 | `real_value` is not invented, does not persist, and the migration guard stays false (G13). |
| `talent-roundtrip.mjs` | convert | T26 | Stored talent trees round-trip through the talent model (G12). |
| `bars.js` | remove | T29 | One-off query, not in the evidence README. |
| `rival-strain.js` | remove | T29 | One-off query, not in the evidence README. |

`coercion-detail.mjs` and `corrupt-armour.js` stay as evidence but have no row in the evidence README table (T26 adds them; for `corrupt-armour.js` see NF47 first). The three `tools/` scripts are a CI gate, a release tool and the audit generator, kept as such (NF48).
