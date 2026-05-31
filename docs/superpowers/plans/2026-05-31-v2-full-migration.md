# V2-Full Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each stage is independently revertable; finish a stage and merge to `V2-full` before starting the next.

**Goal:** Retire every V1-compat bridge introduced by V2-port so the
`starwarsffg` system runs on Foundry V13 ApplicationV2 with no compatibility
shim layer. End state: the `modules/apps/dialog-v2-compat.js`,
`modules/apps/form-application-v2-compat.js`, `modules/sheets/document-sheet-v2-compat.js`,
`modules/sheets/actor-sheet-v2-compat.js`, and `modules/sheets/item-sheet-v2-compat.js`
files are deleted and no code references them.

**Branch:** `V2-full` (already contains `V2-port` via the explicit merge at
`d7a0acdc`). Every stage lands as one or more commits on `V2-full`. `V2-full`
is the only path back to `main`; do not partially merge intermediate stages
to `main`.

**Architecture:** Staged, additive-then-subtractive. Native V2 implementations
land alongside the compat code first (so each stage ships behavior-equivalent),
then the compat code is deleted at the end of its stage. Each stage is
reviewable on its own.

**Revert model.** Stages are *sequentially* revertable, not independently
revertable. Each stage's deletion of a compat module is the final step within
that stage, and every later stage assumes prior stages' deletions have
happened. Reverting Stage N requires reverting Stages N+1..final first; you
cannot revert Stage 1 with Stage 3 still in place. Within a stage, the steps
before the deletion step are safe to revert in isolation (call-site ports
land alongside the compat layer until the deletion step removes it). Plan
PRs accordingly: each stage is one or more PRs, with the deletion as the
last PR of the stage.

**Inventory (as of `d7a0acdc`):**

| Compat surface | Call sites | Files |
|---|---|---|
| `DialogV2Compat` instantiations | 35 across 12 files | `actors/actor-ffg-options.js`, `actors/actor-sheet-ffg.js` (16), `combat-ffg.js` (4), `groupmanager-ffg.js` (2), `helpers/apply-crit.js`, `helpers/apply-damage.js`, `helpers/character-creator.js`, `helpers/crew.js`, `items/item-ffg-options.js`, `items/item-sheet-ffg.js` (5), `swffg-main.js`, `swffg-migration.js` |
| `FormApplicationV2Compat` extenders | 10 classes | `dice/roll-builder.js`, `ffg-destiny-tracker.js`, `groupmanager-ffg.js`, `importer/skills-list-importer.js`, `importer/swa-importer.js`, `items/item-editor.js`, `popout-editor.js`, `popout-modifiers.js`, `settings/crew-settings.js`, `settings/ui-settings.js` |
| `FFGDocumentSheetV2` extenders | 2 (via subclasses) | `sheets/actor-sheet-v2-compat.js`, `sheets/item-sheet-v2-compat.js` |
| `ActorSheetV2Compat` / `ItemSheetV2Compat` extenders | 2 | `actors/actor-sheet-ffg.js`, `items/item-sheet-ffg.js` |

**Compat behaviors that must survive the migration (re-derive in native V2 form):**

- Submit coalescing loop (`_onSubmit` in document/form compat) — fixes the
  spec-tree multi-click race and inner-editor save flows. Replace with native
  V2 form-handler that owns the same invariant.
- Render-race / focus-preservation suppression — currently expressed as
  `render: false` defaults in `ItemHelpers.itemUpdate` / `ActorHelpers.updateActor`
  with explicit `actor.sheet.render(false)` after embedded item updates. Keep
  the behavior; the implementation should not require a wrapper.
- Active-effect render suppression — `ModifierHelpers.applyActiveEffectOnUpdate`
  passes `{render: false}` to AE updates so the inner `this.object` rebind
  doesn't clobber the typed value. Keep.
- Header dblclick veto of V13's built-in handler on Sheet Options / legacy
  header actions / `[data-action]` controls. Native form does not need this.
- `_minimizing` flag / detach guard around `setPosition`. Native form likely
  does not need either — but verify before deletion.
- Active-tab cache (`_activeTabCache` keyed by `${className}:${uuid}`) — keep
  the cache, attach it to whatever V2 tab init the native sheet uses.
- `_projectLegacyHeaderControls` — re-implement as a V2 header-control
  registration if we still want inline labeled controls, or delete if the
  V13 dropdown is acceptable.
- `single-instance dialog guards` (purchase, XP adjust, Sheet Options, Add
  Source/Tag) — these were added because legacy dialog handlers re-entered.
  Native `DialogV2` calls return promises; keep the guards but they shrink.

**Tech Stack:** Foundry VTT v13 (ApplicationV2, HandlebarsApplicationMixin,
DocumentSheetV2, DialogV2), Handlebars, SCSS, jQuery still allowed inside
handlers (we are not removing jQuery in this plan).

**Verification:**

Two complementary layers:

1. **Per-stage scripted checklist artifact.** Each stage commits a
   `docs/superpowers/verification/<stage>-checklist.md` file capturing the
   exact manual flows that must pass before that stage's deletion step lands.
   The checklist is part of the stage's first PR and gets checkbox-ticked
   on the PR description before the deletion PR can land. Format mirrors
   the live-verification preamble of
   `docs/superpowers/plans/2026-05-31-v2-port-known-issues.md` (numbered
   reproduction steps, expected outcome, screenshot if visual).
2. **Focused regression harness for high-risk behaviors.** A single
   `tests/v2-migration/` directory adds three lightweight scenario tests
   targeting the behaviors most likely to regress silently. These are not
   full sheet-behavior tests; they are smoke tests that exercise the public
   API of the affected helpers and assert observable state. Detailed shape
   in the "Focused regression harness" section below.

The harness runs in CI on every stage's PR; the manual checklist runs once
per stage at verification time (the live world at the same server the
V2-port work used).

---

## Stage 0 — Freeze the compat surface

**Files:**
`modules/apps/dialog-v2-compat.js`,
`modules/apps/form-application-v2-compat.js`,
`modules/sheets/document-sheet-v2-compat.js`,
`modules/sheets/actor-sheet-v2-compat.js`,
`modules/sheets/item-sheet-v2-compat.js`,
this plan.

**Intent:** Stop new compat dependencies from appearing while migration is in
flight.

- [ ] **Step 0.1: Add freeze headers**

Prepend a JSDoc `@deprecated` block to each compat module's top-level export
naming the replacement and a reference to this plan path. Example:

```js
/**
 * @deprecated Removed in the V2-full migration. New code must extend
 * ApplicationV2 / DocumentSheetV2 / DialogV2 directly. See
 * docs/superpowers/plans/2026-05-31-v2-full-migration.md.
 */
```

- [ ] **Step 0.2: Add lint guard for new imports**

The repo uses ESLint flat config (`eslint.config.mjs`). A plain global
`no-restricted-imports` rule would immediately flag the existing 24
importers on the inventory list. Instead use a two-config override pattern:

1. Add a default config block that turns `no-restricted-imports` to `error`
   for paths matching `**/dialog-v2-compat`, `**/form-application-v2-compat`,
   and `**/sheets/*-v2-compat`.
2. Add a second config block with `files: [...]` matching the existing
   importers (the 22 files listed in the inventory plus the 5 compat modules
   themselves) and override the rule back to `off` for those files only.

After each stage's call-site port, remove the now-clean files from the
allowlist (Step `N.last` in each stage explicitly drops them). The allowlist
shrinks over the migration; when the compat modules are deleted, both config
blocks come out together in Stage 5.

```js
// eslint.config.mjs sketch
{
  rules: {
    "no-restricted-imports": ["error", { patterns: [
      "**/dialog-v2-compat",
      "**/form-application-v2-compat",
      "**/sheets/*-v2-compat",
    ]}],
  },
},
{
  files: [
    "modules/actors/actor-ffg-options.js",
    "modules/actors/actor-sheet-ffg.js",
    // ... full list from inventory
  ],
  rules: { "no-restricted-imports": "off" },
},
```

**Acceptance:** `npm run lint` passes with no warnings (existing importers
allowlisted, no new importers can land); greps for compat imports return
only files on the allowlist.

- [ ] **Step 0.3: Land the focused regression harness**

Add `tests/v2-migration/{dialog-submit,sheet-tab-cache,form-submit-coalesce}.test.js`
per the "Focused regression harness" section below. Wire a `scripts.test`
entry in `package.json` if one isn't already present. CI must run the
harness on every PR for stages 1–5.

**Acceptance:** the three tests pass against the V2-port baseline
(`d7a0acdc`) so they can be used as tripwires for later stages.

- [ ] **Step 0.4: Land per-stage verification checklist scaffolding**

Create `docs/superpowers/verification/` and pre-populate it with empty
`stage-1-checklist.md` through `stage-5-checklist.md` files. Each stage's
first PR fills in the corresponding file; the deletion PR for that stage
cannot land until the file's checkboxes are all ticked on the PR
description.

---

## Stage 1 — `DialogV2Compat` → `DialogV2`

**Files (12):** `actors/actor-ffg-options.js`, `actors/actor-sheet-ffg.js`,
`combat-ffg.js`, `groupmanager-ffg.js`, `helpers/apply-crit.js`,
`helpers/apply-damage.js`, `helpers/character-creator.js`, `helpers/crew.js`,
`items/item-ffg-options.js`, `items/item-sheet-ffg.js`, `swffg-main.js`,
`swffg-migration.js`.

**Intent:** Replace the 35 `new DialogV2Compat({...}).render(...)` call sites
with direct `DialogV2.prompt` / `DialogV2.confirm` / `DialogV2.wait` calls or
plain `new DialogV2({...}).render(...)`.

**Migration pattern:**

V1 shape (current via compat):
```js
new DialogV2Compat({
  title,
  content,
  buttons: {
    submit: { icon, label, callback: async (htmlOrEl, event) => {...} },
    cancel: { icon, label },
  },
  default: "submit",
  close: () => {...},
}, { classes: [...] }).render(true, { focus: true, classes: [...] });
```

V2 native shape:
```js
const result = await foundry.applications.api.DialogV2.wait({
  window: { title },
  classes: ["starwarsffg-dialog", ...],
  content,
  buttons: [
    { action: "submit", icon, label, default: true, callback: (event, button, dialog) => {...} },
    { action: "cancel", icon, label },
  ],
  close: () => {...},
  rejectClose: false,
});
```

Notable shape differences to honour at each call site:

- `buttons` is an array, not an object. `action` replaces the object key.
- The callback signature is `(event, button, dialog)`; `button.form` (HTMLFormElement)
  replaces the jQuery `obj` that the legacy callbacks received. Replace `$(obj).find("#x").val()`
  with `new FormDataExtended(button.form).object.x` or direct DOM queries against
  `dialog.element`.
- `default: "submit"` becomes a `default: true` property on the chosen button.
- The legacy `classes` rendered via `render(true, {classes})` move into the
  constructor's `classes` array.
- `[autofocus]` markup still wins — `DialogV2` honours it for keyboard focus.
- Single-instance / re-entry guards stay but compare against a stored promise
  reference instead of a `.app.rendered` boolean.

- [ ] **Step 1.1: Port the simple helpers**

`helpers/apply-crit.js`, `helpers/apply-damage.js`, `helpers/crew.js`,
`helpers/character-creator.js`. Each has one call site, no complex form data
processing. Convert to `DialogV2.wait` or `DialogV2.prompt`. Verify the chat
buttons still work after each.

- [ ] **Step 1.2: Port migration / startup dialogs**

`swffg-main.js`, `swffg-migration.js`. These run on system init or one-shot
flows; less interactive. Convert and smoke-test by reloading the world.

- [ ] **Step 1.3: Port combat dialogs**

`combat-ffg.js` (4 sites). These include initiative roll / setup dialogs;
verify each by starting a combat round.

- [ ] **Step 1.4: Port group manager**

`groupmanager-ffg.js` (2 sites). Verify by opening the group manager and
exercising both dialogs.

- [ ] **Step 1.5: Port Sheet Options dialogs**

`actors/actor-ffg-options.js`, `items/item-ffg-options.js`. The single-instance
guards (`_openDialogs` Map) become `_activeDialogPromise` keyed by uuid. Verify
clicking Sheet Options on actor + item, including rapid double-clicks.

- [ ] **Step 1.6: Port item sheet dialogs**

`items/item-sheet-ffg.js` (5 sites): Add Source, Add Tag, plus three internal
purchase / config dialogs. Preserve the sync `_addSourceDialogOpen` /
`_addTagDialogOpen` flag pattern but compare against a promise resolution
instead of `.app.rendered`.

- [ ] **Step 1.7: Port actor sheet dialogs**

`actors/actor-sheet-ffg.js` (16 sites). Largest single file. Catalogue each
dialog first (XP adjust, purchase, drop-talent, character creator entry, etc.);
port in clusters: read-only confirms, then write actions, then the purchase /
edit-mode dialogs. Verify each cluster live before moving on.

- [ ] **Step 1.8: Delete `DialogV2Compat`**

When grep for `DialogV2Compat` returns zero hits in `modules/`, delete
`modules/apps/dialog-v2-compat.js` and remove its entries from the lint guard
in Stage 0.2.

**Acceptance:**
- `grep -rn DialogV2Compat modules/` returns zero hits.
- File `modules/apps/dialog-v2-compat.js` does not exist.
- Every dialog flow listed under each step verifies live without console errors.
- The single-instance / focus / z-index review fixes still hold (rapid clicks
  bring-to-front, autofocus markup keeps keyboard focus, X / Esc release locks).

---

## Stage 2 — `FormApplicationV2Compat` → `ApplicationV2`

**Files (10):** `dice/roll-builder.js`, `ffg-destiny-tracker.js`,
`groupmanager-ffg.js`, `importer/skills-list-importer.js`,
`importer/swa-importer.js`, `items/item-editor.js`, `popout-editor.js`,
`popout-modifiers.js`, `settings/crew-settings.js`, `settings/ui-settings.js`.

**Intent:** Each subclass currently extends `FormApplicationV2Compat`. Convert
to `HandlebarsApplicationMixin(ApplicationV2)` with native form pipeline.

**Migration pattern:**

V1-on-compat shape:
```js
export class RollBuilder extends FormApplicationV2Compat {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { ... });
  }
  getData() { ... }
  async _updateObject(event, formData) { ... }
  activateListeners(html) { ... }
}
```

V2 native shape:
```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class RollBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["starwarsffg", "roll-builder"],
    window: { title: "...", contentTag: "form", resizable: false },
    form: { handler: this._onFormHandler, submitOnChange: false, closeOnSubmit: true },
    position: { width: 400, height: 600 },
  };
  static PARTS = { form: { template: "systems/starwarsffg/.../roll-builder.html", root: true } };
  async _prepareContext(options) { return { ... }; }
  static async _onFormHandler(event, form, formData) { ... }
  _onRender(context, options) { ... }
}
```

Per-class steps; each is a separate landing commit.

- [ ] **Step 2.1: `popout-editor.js`** — Single-purpose ProseMirror editor
  popout. Smallest surface. Use it as the migration template.
- [ ] **Step 2.2: `popout-modifiers.js`** — Modifier-table popout. Verify
  inline flex layout and scroll region still work after porting.
- [ ] **Step 2.3: `ffg-destiny-tracker.js`** — Standalone chrome widget.
  Re-verify the destiny-blur halo and 10px gap after migration.
- [ ] **Step 2.4: `dice/roll-builder.js`** — Dice pool builder. Largest of
  this batch. Verify every roll path (skill, weapon, force, vehicle).
- [ ] **Step 2.5: `groupmanager-ffg.js`** — Group manager root window.
  Verify member add/remove and destiny pool flows.
- [ ] **Step 2.6: `settings/crew-settings.js`, `settings/ui-settings.js`** —
  Game settings panels. Verify save/load round-trip.
- [ ] **Step 2.7: `importer/skills-list-importer.js`, `importer/swa-importer.js`** —
  Long-form import dialogs. Verify a full import for each.
- [ ] **Step 2.8: `items/item-editor.js`** — Embedded talent/upgrade/force-power
  editor. Verify save lifecycle (the editor was the source of the biography
  editor bug; do not regress).

- [ ] **Step 2.9: Delete `FormApplicationV2Compat`**

When grep for the symbol returns zero hits, delete
`modules/apps/form-application-v2-compat.js`.

**Acceptance:**
- `grep -rn FormApplicationV2Compat modules/` returns zero hits.
- File deleted.
- Every form-app flow verifies live (popout editor save, destiny pool,
  modifiers list, dice pool roll, importers complete a run, settings save).
- The render-race protection / submit-coalescing previously guaranteed by the
  compat layer is either preserved by the native form handler or proven
  unnecessary (verify by repeating the original repro for each guard).

---

## Stage 3 — Item sheets to native `DocumentSheetV2`

**Files:** `sheets/item-sheet-v2-compat.js`, `items/item-sheet-ffg.js`,
`items/item-sheet-ffg-v2.js`, `swffg-main.js` (sheet registration), all
item-type templates.

**Intent:** Remove the `ItemSheetFFG extends ItemSheetV2Compat extends
FFGDocumentSheetV2` chain. End state: `ItemSheetFFG extends
HandlebarsApplicationMixin(DocumentSheetV2)` directly.

**The V2 wrapper situation.** `item-sheet-ffg-v2.js` is currently a thin
subclass that extends `ItemSheetFFG` and only differs in
`defaultOptions` (adds the `v2` class, swaps `scrollY`, swaps initial tab).
`swffg-main.js:854` registers `ItemSheetFFGV2` as `makeDefault: true` with
label `"Item Sheet v2"` while `ItemSheetFFG` stays registered as
`"Item Sheet v1"`. After native migration the V1/V2 distinction is moot:
they share the same base. The wrapper must be collapsed.

Decision to make at the start of the stage:
- **Collapse** — fold the `v2` class and `scrollY` differences into
  `ItemSheetFFG`, delete `item-sheet-ffg-v2.js`, and unregister the V2 entry.
  Existing worlds that selected the V2 sheet will keep working if we keep
  `ItemSheetFFGV2` as a deprecated alias for one release.
- **Replace** — keep `ItemSheetFFGV2` as the public class name, delete
  `ItemSheetFFG` and rename the file. The V1 registration goes away.

The plan assumes **collapse** unless the project decides otherwise during
this stage. Either way, the sheet-registration call at `swffg-main.js:848-854`
must end up with exactly one item-sheet registration (no v1/v2 fork).

**Migration pattern:**

- Move `static get defaultOptions()` content into `static DEFAULT_OPTIONS` +
  `static PARTS`.
- Rename `getData()` → `_prepareContext()` (and adjust callers — the
  superclass change cascades through every helper that calls `await this.getData({})`).
- Rename `_updateObject(event, formData)` to native form handler.
- Convert `activateListeners(html)` to `_onRender(context, options)` and stop
  receiving jQuery. Inside the body, you can still `$(this.element)` if a
  particular handler needs jQuery during the migration; remove later.
- Re-implement: submit coalescing (native form handler is synchronous around
  a single submit; we need to keep change-stream batching), the editor
  lifecycle (the four-bug-fix block: `destroyOnSave: false`, `instance.view`
  guard, stale-entry cleanup, button hide/restore, finally-render), and the
  active-tab cache.

Per-task steps:

- [ ] **Step 3.1: Native `defaultOptions` + `PARTS` migration**
- [ ] **Step 3.2: `_prepareContext` rename and call-site fan-out**
- [ ] **Step 3.3: Form handler migration (preserve submit coalesce)**
- [ ] **Step 3.4: `_onRender` migration (drag/drop, drop-talent, purchase,
  cross-field reactivity, modifier list, embedded editors)**
- [ ] **Step 3.5: Active-tab cache reattachment**
- [ ] **Step 3.6: Header projection / Sheet Options injection — port or
  delete based on whether the V13 dropdown is acceptable**
- [ ] **Step 3.7: Collapse `item-sheet-ffg-v2.js`** — fold its option
  differences into `ItemSheetFFG`, delete the file, and update
  `swffg-main.js:852-854` so only one item-sheet entry registers (no
  `makeDefault: true` fork). Drop the imports of `ItemSheetFFGV2` from
  `swffg-main.js` and any other consumers. Update sheet labels
  (`"Item Sheet v1"` / `"Item Sheet v2"`) to a single `"Item Sheet"` entry.
- [ ] **Step 3.8: Delete `item-sheet-v2-compat.js`**

**Acceptance:**
- `ItemSheetFFG` extends `HandlebarsApplicationMixin(DocumentSheetV2)`.
- `modules/sheets/item-sheet-v2-compat.js` does not exist.
- Every item type (weapon, armour, gear, talent, specialization, force power,
  signature ability, career, species, ability, background, motivation,
  obligation, homestead upgrade, critical injury / damage, item attachment,
  item modifier, ship weapon, ship attachment) opens, edits, drops in, saves,
  and closes without console errors.
- The render-race guards for biography editor / embedded editors hold.
- Sheet Options + Add Source / Add Tag still single-instance with proper
  focus and close-path cleanup (from the V2-port review).

---

## Stage 4 — Actor sheets to native `DocumentSheetV2`

**Files:** `sheets/actor-sheet-v2-compat.js`, `sheets/document-sheet-v2-compat.js`
(if no longer needed after this stage), `actors/actor-sheet-ffg.js`,
`actors/actor-sheet-ffg-v2.js`, `actors/adversary-sheet-ffg-v2.js`,
`swffg-main.js` (sheet registration), all actor templates.

**Intent:** Highest blast radius. Same shape change as Stage 3 but the actor
sheet carries more state: tabs, item lists, modifiers, dice pool, drag/drop
for items / effects / actors / folders, edit mode, character creator entry,
xp log, and the minion-specific derived-data render listeners.

**The V2 wrapper situation (mirror of Stage 3).** `actor-sheet-ffg-v2.js` is
a thin subclass that extends `ActorSheetFFG` and only differs in
`defaultOptions` (template path, classes including `v2`, tab nav selector,
scrollY). `adversary-sheet-ffg-v2.js` follows the same pattern for the
adversary variant. `swffg-main.js:847-851` registers both V1 and V2
flavours, with V2 as `makeDefault: true`. After native migration the V2
suffix is redundant.

Same decision as Stage 3 — **collapse** by default. Fold the option
differences into `ActorSheetFFG` / `AdversarySheetFFG`, delete the
`-ffg-v2.js` files, and end up with one actor-sheet registration per
sheet kind (`Actor Sheet`, `Adversary Sheet`).

Per-task steps:

- [ ] **Step 4.1: Native `defaultOptions` + `PARTS` migration**
- [ ] **Step 4.2: `_prepareContext` rename and call-site fan-out (large —
  `getData()` is called from many helpers via `this.getData({})`)**
- [ ] **Step 4.3: Form handler migration (preserve submit coalesce and the
  position-write skip while minimized/minimizing)**
- [ ] **Step 4.4: `_onRender` migration — tabs, dice pool wiring, skill
  rendering, item context menus, drag-drop config**
- [ ] **Step 4.5: Minion derived-input listeners (`careerskill-toggle`,
  `unit_wounds.value`, `quantity.max`, `stats.wounds.value`) and the
  per-actor position-skip-while-minimized**
- [ ] **Step 4.6: Embedded item update fan-out (`item.update` →
  `actor.sheet.render(false)`) — preserve the explicit render path**
- [ ] **Step 4.7: Active-effect render suppression in
  `ModifierHelpers.applyActiveEffectOnUpdate` — confirm the `{render: false}`
  on inner AE updates is still needed under native form handler; keep if so**
- [ ] **Step 4.8: Collapse `actor-sheet-ffg-v2.js` and
  `adversary-sheet-ffg-v2.js`** — fold option differences into the V1
  classes, delete the V2 wrapper files, and update `swffg-main.js:847-851`
  so each actor sheet kind registers exactly once with the labels `"Actor
  Sheet"` and `"Adversary Sheet"`. Drop the V2 imports from `swffg-main.js`.
- [ ] **Step 4.9: Delete `actor-sheet-v2-compat.js` and
  `document-sheet-v2-compat.js`**

**Acceptance:**
- `ActorSheetFFG` extends `HandlebarsApplicationMixin(DocumentSheetV2)`.
- No `*-v2-compat.js` files remain under `modules/sheets/`.
- Every actor type (character, nemesis, rival, minion, vehicle, homestead)
  opens, edits, drag-drops items / effects / folders / actors, equips,
  rolls, applies damage, saves, and closes without console errors.
- Edit mode begin / end (AE suspend / restore) works.
- Minimize / restore via header dblclick works; resize handle hidden when
  minimized; width fits title.
- Sheet Options injection (or V13 dropdown equivalent) still single-instance.

---

## Stage 5 — Final sweep and verification

- [ ] **Step 5.1: Compat directory deletion**

```bash
ls modules/apps/*-compat.js modules/sheets/*-compat.js 2>&1
```

Expected: no matches.

- [ ] **Step 5.2: Remove the lint guard added in Stage 0.2**

No targets to guard. Drop the rule.

- [ ] **Step 5.3: Remove the V2-compat SCSS partial**

`scss/global/_v2_compat.scss` documents itself as the "compat block". If every
rule in it is now still needed under native V2, rename the partial (e.g.
`_v2_layout.scss`) and adjust the import in `scss/starwarsffg.scss`. If some
rules are no longer needed (e.g. the resize-handle pseudo-element if V13
provides a glyph natively, or the header-control transparency override if
the V13 default is acceptable), delete them.

- [ ] **Step 5.4: Memory + handoff doc update**

Update `memory/css-is-hand-maintained.md` to reflect the final state (the V2
rules now live in a permanently-named partial). Update any session-handoff
docs that mention compat.

- [ ] **Step 5.5: Full regression sweep**

Repeat every verification listed in stages 1–4 in a single sitting. No
console errors, no visible regressions vs the `V2-port` baseline at the head
of the merged branch.

- [ ] **Step 5.6: Merge `V2-full` to `main`**

When 5.5 passes, this is the only merge to `main`. Tag the merge commit
`v2-full` for symmetry with `pre-v2`.

**Acceptance:**
- No `*-compat.js` files anywhere in `modules/`.
- `grep -rn '\(FFGDocumentSheetV2\|ActorSheetV2Compat\|ItemSheetV2Compat\|FormApplicationV2Compat\|DialogV2Compat\)' modules/` returns zero hits.
- Full regression sweep clean.
- `V2-full` merged to `main`.

---

## Focused regression harness

A new `tests/v2-migration/` directory adds three Mocha scenario files.
Each is a small, self-contained smoke test that exercises one of the
high-risk behaviors named in the risk register. The tests are not
exhaustive sheet-behavior coverage; they are tripwires for silent
regressions during the migration.

- [ ] **`tests/v2-migration/dialog-submit.test.js`** — Build a minimal
  fixture dialog (the same shape as Add Source / XP Adjust), drive it
  through every close path (default button callback, cancel button, ✕
  click, Esc key), and assert exactly one callback fires per close path.
  Catches the close-handler bypass regression we already hit once during
  V2-port. Add a fast-double-click case that asserts the single-instance
  guard holds: two synchronous `open()` calls must result in one dialog
  instance.
- [ ] **`tests/v2-migration/sheet-tab-cache.test.js`** — Open a fixture
  document sheet, activate tab "tab2", close, reopen. Assert the cache
  key (currently `${className}:${uuid}`) is set and that the reopened
  sheet activates "tab2". Then re-render in place and assert the active
  tab does not snap back to the default. This catches the duplicate-Tabs-
  binding regression the second-pass review fixed.
- [ ] **`tests/v2-migration/form-submit-coalesce.test.js`** — Simulate
  multiple synchronous change events on a fixture form (the spec-tree
  multi-click repro). Assert the submit pipeline coalesces them into a
  single `_updateObject` call and that the final `formData` reflects the
  *last* change, not the first. Catches loss of the submit-coalesce
  invariant.

Run with the existing test runner (`npm test` if defined; otherwise add a
`scripts.test` that runs `mocha tests/v2-migration/**/*.test.js`).

Each stage that touches the corresponding behavior must keep these tests
passing. The harness lands once in Stage 0 (alongside the lint guard) so
later stages can rely on it.

## Risk register

- **Submit coalescing semantics change.** Native form handler runs once per
  change event; we currently coalesce concurrent submits. If a flow depends on
  the coalesce (e.g. close + change race), it'll break on Stage 2 / 3 unless
  re-implemented. Mitigation: keep the original spec-tree multi-click repro
  in a verification script and run it after each form-app and item-sheet port.
- **Active-tab cache reattachment.** The cache currently lives on the compat
  base. After Stage 3 / 4, the cache must hang off the native subclass or a
  module-scoped Map. Mitigation: move the cache *before* deleting the compat
  base, so the cache is the same Map the whole time.
- **V13 framework changes between now and migration completion.** Foundry
  V14 may ship before V2-full lands. If `DocumentSheetV2` / `ApplicationV2`
  shape changes, the migration target moves. Mitigation: stage early ports
  to surface API changes; budget rebases.
- **Mandar / Beskar theme drift.** `mandar.css` is hand-maintained. Stages
  that touch sheet chrome must mirror to `mandar.css`. Mitigation: each stage's
  acceptance includes "verified under Mandar theme too."

## Out of scope

- jQuery removal. The plan keeps `html.find(...)` style handlers inside
  `_onRender` / form handlers; pure-DOM rewrite is a follow-up.
- Native V2 character creator. The current `helpers/character-creator.js`
  is large; port at most as a `DialogV2.wait` flow, leave deeper
  refactor for later.
- Test infrastructure. Existing `tests/talent-tree.test.js` covers pure
  helpers and is unaffected. Adding sheet-behavior tests is out of scope.
