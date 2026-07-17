# Sheet Performance Optimization Plan

**Date:** 2026-07-17
**Status:** Proposed
**Branch:** `optimization-pass`

## Goal

Remove the major CPU, memory, and update amplification in the legacy actor
sheets and the Codex sheet family without changing sheet behavior, dice-pool
semantics, data persistence, visual output, or module integration hooks.

One deliberate behavior correction is included: item validation must be
registered during system initialization and work before any sheet opens,
regardless of hooks registered by other modules. The current first-sheet-owned
registration is lifecycle-dependent and can silently skip validation.

The first objective is structural: one prepared actor context per render, one
listener registration per persistent element, one document update per user
change, and no document writes during sheet construction. Later template and
visual optimizations are gated by measurements after those fixes land.

## Scope

In scope:

- `ActorSheetFFG`, `AdversarySheetFFG`, and their deprecated aliases.
- `CodexActorSheet` and `CodexAdversarySheet` for character, rival, nemesis,
  minion, and vehicle actors.
- `CodexItemSheet`, especially force power, specialization, and signature
  ability trees.
- Shared `FFGDocumentSheet` render and submit plumbing where needed to make the
  fixes lifecycle-safe.
- Actor and Codex templates that repeatedly scan the same item collection.
- Codex notch, marble, sigil, and inventory-drag work after the main render path
  is fixed and re-profiled.

Out of scope unless profiling identifies a direct dependency:

- Actor preparation and Active Effect calculation outside sheet rendering.
- Dice rules or modifier semantics.
- A visual redesign of either sheet family.
- Homestead Codex support.
- Broad ApplicationV2 or CSS refactors unrelated to measured sheet costs.

## Guardrails

- Preserve every source line in skill and weapon dice-pool tooltips.
- Preserve weapon status, attachment, item-modifier, and quality contributions.
- Preserve edit mode, XP purchase, Active Effect suspension, drag/drop,
  inventory reorder, submit-on-close, tab restoration, and scroll restoration.
- Do not memoize a complete `getData()` result across document updates. Reuse
  only the context prepared for the current render.
- Do not introduce lazy panes until absent form fields, editor teardown,
  module render hooks, and stale hidden-pane state are explicitly handled.
- Keep each phase independently reviewable and revertible.

## Success Criteria

Deterministic criteria:

- One actor `getData()` call per completed actor render.
- One actor serialization per actor `getData()` call.
- Zero actor flag/document writes from a sheet constructor.
- Context-menu and persistent-root listener counts remain constant after 25
  rerenders.
- One `_updateObject` call for one ordinary field change.
- Skill and weapon pool work is part of the awaited render lifecycle; no stale
  pool or tooltip writes land after a newer render.
- Tree item descriptions are enriched concurrently and at most once per node
  per render.
- Existing functional tests and the full sheet interaction matrix pass.

Measured criteria, finalized from the Phase 0 baseline:

- At least 70% lower median scripting time for a representative character
  rerender.
- No listener or retained-context growth across 25 rerenders and forced GC.
- No regression greater than 10% for minion, vehicle, or simple Codex item
  first render.
- No new long task above 100 ms in the standard character rerender scenario.

Timing thresholds are relative because Foundry host hardware and enabled
modules vary. Deterministic call counts are the primary merge gate.

## Phase 0 - Baseline And Regression Harness

### 0.1 Add representative fixtures

Use disposable world documents or a dedicated performance fixture builder:

- Character: default 41 skills, long biography/notes/features, 12 weapons with
  attachments/modifiers, 10 armour/gear entries, 25 talents, and several AEs.
- Minion: default skills, 8-member group, weapons, gear, and injuries.
- Vehicle: six crew roles, ship weapons, attachments, damage, and cargo.
- Codex item trees: full 16-node force power, 20-node specialization, and
  8-node signature ability, all with non-empty descriptions.

Fixtures must be clearly named and deleted after manual runs. Automated tests
should construct and tear down their own temporary documents.

### 0.2 Add deterministic counters

Add an in-Foundry functional test under `tests/v2-migration/` that can count:

- Actor `getData()` calls per render.
- `Actor#toObject(false)` calls per render.
- `TextEditor.enrichHTML` calls per render.
- `ContextMenu` constructions and callback invocations across rerenders.
- `_updateObject` calls from one dispatched `change` event.
- Actor updates issued while constructing a sheet.

Register the test in `tests/ffg-tests.js`. Keep instrumentation local to the
test; production logging must not be added to hot paths.

Open and close the render counter around the render lifecycle itself. Do not
count click-time calls from `DiceHelpers.rollSkill` or `DiceHelpers.rollItem`,
which independently request sheet data when a roll is initiated and are outside
this optimization. Tests that exercise a roll must report those calls
separately from render-time `getData()` calls.

### 0.3 Capture runtime profiles

For legacy and Codex character sheets, record:

- First open.
- Rerender with no document change.
- Skill-rank change.
- Characteristic change with weapon cards present.
- Ten rapid wound/strain or quantity changes.
- Twenty-five rerenders followed by a heap snapshot.

Capture the same first-open/rerender pair for minion, vehicle, and each Codex
tree item. Record scripting time, long tasks, DOM node count, and retained sheet
objects. Store only a concise results table in the plan or a verification file;
large browser profiles should remain local artifacts.

**Gate:** Do not begin optional lazy-pane or visual work without this baseline.

## Phase 1 - Reuse The Prepared Render Context

This is the highest-value fix and should land before unrelated cleanup.

### 1.1 Pass context into legacy listeners

Update `FFGDocumentSheet._onRender(context, options)` to call and await:

```js
await this.activateListeners(html, context, options);
```

Existing synchronous listeners remain valid; JavaScript ignores unused
arguments and `await` accepts non-Promise return values.

### 1.2 Render all skill pools from that context

Change `ActorSheetFFG.activateListeners` to accept the render context and pass
it to every `DiceHelpers.addSkillDicePool` call. Replace the asynchronous
jQuery `.each()` callback with an explicitly awaited helper such as
`_renderSkillPools(root, context)`.

The helper should:

- Snapshot the current skill nodes once.
- Render bare skill pools using the supplied context.
- Apply the existing `this._filters.skills` visibility rule to each skill row.
- Await all work before `_onRender` completes.
- Contain failures per skill node so one malformed pool does not reject the
  whole awaited render; continue processing the other skills and report the
  failing skill with enough context to diagnose it.
- Bail out if the render root is no longer current or connected.

Do not call `getData()` from a listener.

### 1.3 Reuse context for Codex weapon pools

Make Codex listener activation await `super.activateListeners`, then await
`_cdxActivate`. Pass the same context into `_cdxWeaponPools(root, context)` and
remove its internal `getData()` call.

Keep weapon processing deterministic. Parallel processing is acceptable if
each weapon writes only into its own card and tooltip host; otherwise retain the
current sequence and measure it separately.

### 1.4 Guard stale asynchronous work

Use the current render root or a monotonically increasing render token before
appending weapon tooltips. A superseded render must stop without modifying the
reused form.

**Acceptance:** one actor `getData()` per render; every displayed pool and
tooltip still matches the actor, skill, weapon status, qualities, attachments,
and modifiers.

## Phase 2 - Remove Duplicate Actor Serialization

`FFGDocumentSheet.getData()` already creates a plain actor object. Reuse that
object in `ActorSheetFFG.getData()` instead of immediately calling
`this.actor.toObject(false)` again.

**Status note:** this must remain gated by template-data equivalence tests. A
naive reuse of the base document context collapsed the legacy and Codex skill
sections to headers only, because the actor sheet path depends on prepared actor
skill data at this point.

### Tasks

1. Treat the full document object returned as `context.data` by the shared base
   as `actorData` before replacing `context.data` with `actorData.system`.
2. Preserve the existing overlay of undeclared derived `actor.system` fields.
3. Preserve the rule that live ActiveEffect Documents are not deep-cloned into
   the plain actor object.
4. Remove or relocate the preliminary item sort in `FFGActorSheet.getData()` if
   the resulting array is still discarded or re-sorted by name.
5. Verify actor item ordering independently for every legacy and Codex sheet.

**Acceptance:** one `toObject(false)` per `getData()` and byte-equivalent
template-facing data for all declared and derived fields, including a rendered
skill-row fixture for legacy and Codex actor sheets.

## Phase 3 - Fix Listener Ownership

### 3.1 Bind actor context menus once

Move the five actor `ContextMenu` constructions into a guarded helper that runs
once for the persistent form element. ContextMenu uses delegated selectors, so
it does not need reconstruction when the form's inner HTML is replaced.

Store the instances on the sheet for inspection. Do not depend only on a global
boolean: a sheet may receive a replacement form after close/reopen or a future
framework change. Track the actual bound form.

### 3.2 Bind the Codex talent-card capture handler once

Replace the anonymous root capture listener with a named instance method. Bind
it once to the current persistent form and remove it if the form changes or the
sheet closes.

Keep `CdxPillStack`'s existing explicit destroy/recreate lifecycle; that widget
is already correctly owned.

### 3.3 Remove sheet-capturing global item hooks

Audit the `preCreateItem`, `preDeleteItem`, and `preUpdateItem` hooks currently
registered from actor `activateListeners`.

The existing `Hooks.events.preCreateItem === undefined`-style guards are not
valid ownership checks: another module can make the event key exist before this
system registers, no validation exists before the first editable sheet render,
and the first rendered sheet is captured indefinitely. Treat correcting all
three cases as an intentional lifecycle bug fix.

- Move document-wide validation to system initialization, registered once.
- Do not capture a particular sheet instance in a global hook.
- Register this system's validation even when another module already has a hook
  for the same event.
- Remove the sheet-size assignments if they no longer serve persistence after
  the first-render sizing fix.
- If any hook must remain sheet-specific, store its hook ID and unregister it
  on close.

### Tests

- Rerender an editable legacy and Codex actor 25 times.
- Dispatch one matching contextmenu event and verify one menu/action.
- Click one force-power/signature card and verify one details action.
- Close the sheet and confirm no retained sheet instance through these handlers.
- Create, update, and delete constrained actor items before any sheet has opened
  and verify system validation still runs exactly once.
- Pre-register a third-party hook for each event and verify it neither suppresses
  nor duplicates this system's validation.

## Phase 4 - Remove Constructor Writes And Duplicate Submits

### 4.1 Make construction read-only

Remove both `setFlag` calls from `ActorSheetFFG`'s constructor.

They are currently two separate fire-and-forget actor updates. Each can trigger
a render while the sheet is still being constructed, race the other update, and
produce a permission error whenever a non-owner viewer opens the sheet. This is
update amplification as well as a construction-side-effect problem.

First document the intended edit-lock behavior:

- Missing edit-mode flags already mean disabled/off.
- A stale lock should be released by the edit-mode owner lifecycle, not by
  every viewer constructing a sheet.
- If close must release a lock, issue one conditional `actor.update` containing
  both flag changes, with deliberate render behavior.

Opening a sheet must never update the actor merely to establish defaults.

### 4.2 Centralize render-on-change policy

Avoid target listeners that call `_onSubmit` and then bubble into the form's
generic change handler. Add a shared policy hook, for example:

```js
_shouldRenderOnChange(input) { return false; }
```

Have `_onChangeInput` perform the single submit with the correct `render`
option. Actor and item sheets can override the policy for:

- Career/group skill toggles and skill ranks.
- Characteristics and minion derived inputs.
- Talent `ranked` and tree `islearned` controls.
- Codex weapon skill/characteristic selectors.

Keep purely visual synchronization listeners, such as the Codex weapon header
subtitle, but they must not submit independently.

### Tests

- One change event produces one `_updateObject` call.
- Opening as owner or non-owner produces no actor update or permission error.
- Controls that drive derived UI still rerender.
- Ordinary text/select changes retain `render:false` behavior.
- Rapid tree-checkbox changes still flush the final state.
- Submit-on-close and the existing coalescing tests remain green.

## Phase 5 - Optimize Codex Tree Item Preparation

### 5.1 Parallelize independent enrichment

Build a list of existing tree nodes and enrich their descriptions with
`Promise.all`. Do not await 8, 16, or 20 independent descriptions serially.

Retain the existing pre-pass that computes size and `canPurchase` before any
enrichment can fail. Keep graph/connection calculation deterministic.

### 5.2 Consider a bounded per-sheet enrichment cache

Add this only if Phase 5.1 still leaves material scripting cost. Key entries by
the source description and enrichment options, and cap the cache. Invalidate an
entry when its source changes. Do not use a global cache that can retain every
tree opened during a session.

### 5.3 Avoid redundant tree passes where safe

After enrichment is fixed, profile the size, purchase, and connection loops.
They operate on at most 20 nodes and should only be combined if measurement
shows value; clarity wins otherwise.

**Acceptance:** identical tree markup, purchase availability, connector state,
and edit behavior, with at most one enrichment per node per render.

## Phase 6 - Bucket Items Once Per Render

Create template-facing arrays in one pass instead of repeatedly scanning all
actor items from Handlebars.

### Data shape

Provide explicit collections such as:

- `weapons`, `armour`, `gear`.
- `criticalInjuries`, `criticalDamage`.
- `abilities`, `forcePowers`, `signatureAbilities`, `specializations`.
- `shipWeapons`, `shipAttachments`, and `cargo`.
- obligation/duty/morality rows.

For Codex inventory, sort once with `cdxInventoryOrder`, then bucket in that
order so drag order remains unchanged. Keep live Item Documents where template
behavior relies on methods, flags, or embedded data.

Update Codex templates first, verify them, then update legacy partials in a
separate commit. Avoid a broad template rewrite.

**Acceptance:** item order and category membership are unchanged; template
iteration becomes proportional to the items displayed rather than categories
multiplied by total items.

## Phase 7 - Re-profile Before Lazy Panes

Repeat the Phase 0 profiles after Phases 1-6. Lazy rendering proceeds only if
inactive-pane DOM creation remains a material part of render time.

If required, design it as an ApplicationV2 parts change, not ad hoc string
injection. The design must answer:

- How an unvisited pane becomes current after document updates.
- How visited but inactive panes avoid stale values.
- How editors are saved/destroyed when their part rerenders.
- How form submission behaves when most fields are absent.
- How module render hooks discover pane content.
- How tab state, scroll state, drag/drop, and pool rendering are restored.

Start with the heaviest Codex inventory or talent pane. Do not convert all
sheets at once.

## Phase 8 - Optional Codex Visual Hot Paths

These are lower priority and must be justified by post-fix profiles.

### 8.1 Notch outlines

- Keep one observer per sheet.
- Build/observe persistent header surfaces and the active pane first.
- Add outlines for a pane when it is activated.
- Ensure newly expanded talent/details blocks are observed.

### 8.2 Eldritch marble

- Observe and measure only visible marble surfaces where practical.
- Recompute once per animation frame.
- Preserve batched reads followed by batched writes.

### 8.3 Inventory drag geometry

Cache card rectangles for a drag frame or until scroll/layout invalidates them.
Avoid a forced layout read followed by class writes on every raw `dragover`.

### 8.4 Fated sigil generation and cache

- Bound the per-actor cache with an LRU limit.
- Prefer Blob/object URLs and revoke them on eviction.
- Move 1024-square pixel work to `OffscreenCanvas`/a worker if supported,
  retaining the current idle fallback.
- Verify Scholar and Fate output visually before and after.

## Phase 9 - Vehicle-Specific Follow-Up

Vehicle crew pool previews are rebuilt for every vehicle render. Profile them
after the common fixes. If material, cache the rendered preview by the inputs
that actually affect it: crew actor revision, role, vehicle handling, skill
theme, and crew-role settings. Invalidate conservatively.

Do not add this cache speculatively; vehicle rendering does not suffer the
per-skill actor `getData()` fan-out.

## Verification Matrix

Actor sheets:

- Legacy: character, rival, nemesis, minion, vehicle, homestead, adversary.
- Codex: character, rival, nemesis, minion, vehicle, adversary.
- Codex inventory in both split and combined modes.
- GM, owner player, limited/non-editable viewer.

Codex item sheets:

- Weapon, armour, gear, talent, critical, ship weapon.
- Item attachment and ship attachment.
- Force power, specialization, signature ability.
- One generic Codex item type.

Interactions:

- Skill pools and all tooltip source lines.
- Weapon pools with status, quality, attachment, and modifier effects.
- Skill rank, characteristic, minion group skill, wounds, and quantity edits.
- Equip, carried, quantity, ammo, and medical controls.
- Inventory reorder and cross-actor transfer.
- XP purchases, tree learning/unlearning, and edit mode.
- Item details, force powers, signature abilities, and context menus.
- Biography/editor save, tabs, scroll restoration, minimize, close, and reopen.
- Scheme switching, especially both Eldritch variants.

Automated checks:

- Existing `tests/v2-migration/` tests.
- Existing talent-tree, modifier, and Codex-scheme tests.
- New deterministic performance/lifecycle tests from Phase 0.
- ESLint on every touched module.

## Recommended Commit Sequence

1. Baseline counters and regression tests.
2. Render-context reuse and awaited pool lifecycle.
3. Single actor serialization.
4. Context-menu, Codex root-listener, and global-hook ownership.
5. Constructor-write removal and single-submit change policy.
6. Parallel Codex tree enrichment.
7. Codex item bucketing, then legacy item bucketing.
8. Optional lazy panes, visual hot paths, and vehicle caching only after
   re-profiling.

Each commit should include its deterministic test and the relevant manual
verification subset. Do not combine Phases 1-5 into one large commit; they touch
rendering, listener lifetime, and persistence independently and should remain
easy to bisect.

## Expected Outcome

Phases 1-5 should remove the overwhelming majority of observed latency without
changing templates or visual effects: the roughly 42-43 actor data preparations
per character render become one, duplicate context-menu listeners stop growing,
sheet opening becomes read-only, and tree changes stop issuing redundant updates
and serial enrichment chains.

Phases 6-9 are follow-up optimization, not prerequisites. Their value should be
decided from the post-fix profile rather than assumed from static code shape.
