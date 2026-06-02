# V2-Full Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Stages are **sequentially revertable, not independently revertable** — see the "Revert model" paragraph in the Architecture section. Finish a stage and merge to `V2-full` before starting the next.

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
  header actions / `[data-action]` controls. This is a V13 behavior, not a
  V1/V2 framework difference — V13's `#onWindowDoubleClick` minimizes on any
  header dblclick whose target lacks `data-action`. Port or prove unnecessary
  per control (e.g. drop the veto if Sheet Options gets ported to a real
  V13 `data-action` header control; keep it if any of our injected header
  affordances stay non-action `<a>` elements).
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

By default both layers are manual: the per-stage checklist is signed off
on the PR description, and the focused harness is opened in a live
Foundry world (`tests/ffg-tests.js` panel) and the V2-migration suite
run by hand. If the stretch Playwright workflow described in the
"Focused regression harness" section ships, the harness layer upgrades
to a PR-gated CI check; the checklist layer stays manual either way.

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
`no-restricted-imports` rule would immediately flag the existing importers
on the inventory list (23 unique files, 26 import statements counting
internal compat-to-compat imports). Instead use a two-config override
pattern:

1. Add a default config block that turns `no-restricted-imports` to `error`
   for paths matching `**/dialog-v2-compat.js`,
   `**/form-application-v2-compat.js`, and `**/sheets/*-v2-compat.js`.
   The `.js` suffix is required because the existing import statements
   include it (`from "./apps/dialog-v2-compat.js"`); patterns without `.js`
   would not match.
2. Add a second config block with `files: [...]` matching the existing
   importers (the 21 external importers plus the 2 compat-to-compat
   internal importers — `modules/sheets/actor-sheet-v2-compat.js` and
   `modules/sheets/item-sheet-v2-compat.js` both import from
   `document-sheet-v2-compat.js`) and override the rule back to `off`
   for those files only.

After each stage's call-site port, remove the now-clean files from the
allowlist (Step `N.last` in each stage explicitly drops them). The allowlist
shrinks over the migration; when the compat modules are deleted, both config
blocks come out together in Stage 5.

```js
// eslint.config.mjs sketch
{
  rules: {
    "no-restricted-imports": ["error", { patterns: [
      "**/dialog-v2-compat.js",
      "**/form-application-v2-compat.js",
      "**/sheets/*-v2-compat.js",
    ]}],
  },
},
{
  files: [
    "modules/actors/actor-ffg-options.js",
    "modules/actors/actor-sheet-ffg.js",
    // ... full list from inventory (23 files total)
  ],
  rules: { "no-restricted-imports": "off" },
},
```

**Acceptance (scoped to the compat-import guard only):** `npm run lint`
produces zero `no-restricted-imports` errors and zero
`no-restricted-imports` warnings — both for files on the allowlist
(rule overridden off) and for any file not on it (would error if it
tried to import compat). The repo already has substantial pre-existing
lint debt (610 problems / 115 errors / 495 warnings as of `d7a0acdc`
on this branch) that is **out of scope** for the migration; the
acceptance is intentionally limited to the new rule. Use a scoped check
like:

```
npm run lint 2>&1 | grep "no-restricted-imports" | wc -l   # expect 0
```

Greps for compat imports return only files on the allowlist.

Baseline lint cleanup is a separate concern; if it lands first as an
independent PR series, this scoping can be tightened to "the full lint
run is clean" in a follow-up plan revision.

- [ ] **Step 0.3: Land the focused regression harness**

Add `tests/v2-migration/{dialog-submit,sheet-tab-cache,form-submit-coalesce}.test.js`
per the "Focused regression harness" section below. Register the three
suites in `tests/ffg-tests.js` alongside the existing
`HelpersTests` / `ModifiersTests` / `TalentTreeTests` registrations so
they appear when GM opens the Functional Tests panel.

**Acceptance:** opening Functional Tests in a localhost world with the
test data flag set shows the three new suites and they pass against the
V2-port baseline (`d7a0acdc`). Future stage PRs include a checkbox
"V2-migration suite green" in the PR description.

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

- [x] **Step 1.1: Port the simple helpers**

`helpers/apply-crit.js`, `helpers/apply-damage.js`, `helpers/crew.js`,
`helpers/character-creator.js`. Each has one call site, no complex form data
processing. Convert to `DialogV2.wait` or `DialogV2.prompt`. Verify the chat
buttons still work after each.

- [x] **Step 1.2: Port migration / startup dialogs**

`swffg-main.js`, `swffg-migration.js`. These run on system init or one-shot
flows; less interactive. Convert and smoke-test by reloading the world.

- [x] **Step 1.3: Port combat dialogs**

`combat-ffg.js` (4 sites). These include initiative roll / setup dialogs;
verify each by starting a combat round.

- [x] **Step 1.4: Port group manager**

`groupmanager-ffg.js` (2 sites). Verify by opening the group manager and
exercising both dialogs.

- [x] **Step 1.5: Port Sheet Options dialogs**

`actors/actor-ffg-options.js`, `items/item-ffg-options.js`. The single-instance
guards (`_openDialogs` Map) become `_activeDialogPromise` keyed by uuid. Verify
clicking Sheet Options on actor + item, including rapid double-clicks.

- [x] **Step 1.6: Port item sheet dialogs**

`items/item-sheet-ffg.js` (5 sites): Add Source, Add Tag, plus three internal
purchase / config dialogs. Preserve the sync `_addSourceDialogOpen` /
`_addTagDialogOpen` flag pattern but compare against a promise resolution
instead of `.app.rendered`.

- [x] **Step 1.7: Port actor sheet dialogs**

`actors/actor-sheet-ffg.js` (16 sites). Largest single file. Catalogue each
dialog first (XP adjust, purchase, drop-talent, character creator entry, etc.);
port in clusters: read-only confirms, then write actions, then the purchase /
edit-mode dialogs. Verify each cluster live before moving on.

- [x] **Step 1.8: Delete `DialogV2Compat` and shrink the allowlist**

When grep for `DialogV2Compat` returns zero hits in `modules/`:
1. Delete `modules/apps/dialog-v2-compat.js`.
2. In `eslint.config.mjs`, remove these 12 files from the
   `no-restricted-imports`-off allowlist (they no longer import compat):
   `modules/actors/actor-ffg-options.js`,
   `modules/actors/actor-sheet-ffg.js`,
   `modules/combat-ffg.js`,
   `modules/groupmanager-ffg.js`,
   `modules/helpers/apply-crit.js`,
   `modules/helpers/apply-damage.js`,
   `modules/helpers/character-creator.js`,
   `modules/helpers/crew.js`,
   `modules/items/item-ffg-options.js`,
   `modules/items/item-sheet-ffg.js`,
   `modules/swffg-main.js`,
   `modules/swffg-migration.js`.
   (Note: `actor-sheet-ffg.js` and `item-sheet-ffg.js` *also* import sheet
   compat — they stay on the allowlist with the remaining patterns until
   Stages 3.8 / 4.9 remove them.)
3. Remove the `**/dialog-v2-compat.js` pattern from the restricted-imports
   patterns list in the rule config.

Verify `npm run lint 2>&1 | grep "no-restricted-imports" | wc -l` returns 0.

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

- [x] **Step 2.1: `popout-editor.js`** — Single-purpose ProseMirror editor
  popout. Smallest surface. Use it as the migration template.
- [x] **Step 2.2: `popout-modifiers.js`** — Modifier-table popout. Verify
  inline flex layout and scroll region still work after porting.
- [x] **Step 2.3: `ffg-destiny-tracker.js`** — Standalone chrome widget.
  Re-verify the destiny-blur halo and 10px gap after migration.
- [x] **Step 2.4: `dice/roll-builder.js`** — Dice pool builder. Largest of
  this batch. Verify every roll path (skill, weapon, force, vehicle).
- [x] **Step 2.5: `groupmanager-ffg.js`** — Group manager root window.
  Verify member add/remove and destiny pool flows.
- [x] **Step 2.6: `settings/crew-settings.js`, `settings/ui-settings.js`** —
  Game settings panels. Verify save/load round-trip.
- [x] **Step 2.7: `importer/skills-list-importer.js`, `importer/swa-importer.js`** —
  Long-form import dialogs. Verify a full import for each.
- [x] **Step 2.8: `items/item-editor.js`** — Embedded talent/upgrade/force-power
  editor. Verify save lifecycle (the editor was the source of the biography
  editor bug; do not regress).

> **Shared base note (decision during Stage 2.2):** the 6 form-pipeline
> classes (popout-modifiers, groupmanager, the 2 settings groups, item-editor;
> + future) extend a new purpose-built native base
> `modules/apps/ffg-form-application.js` rather than each inlining the
> `_onSubmit`/`_updateObject`/submitOnChange/submitOnClose/`_closing`/min-clamp
> machinery. It is NOT a compat shim (no V1 bridging) and does not block the
> `FormApplicationV2Compat` deletion. The non-form windows (popout-editor,
> destiny-tracker, roll-builder, importers) extend `ApplicationV2` directly.

- [x] **Step 2.9: Delete `FormApplicationV2Compat` and shrink the allowlist**

When grep for the symbol returns zero hits:
1. Delete `modules/apps/form-application-v2-compat.js`.
2. In `eslint.config.mjs`, remove these 10 files from the allowlist:
   `modules/dice/roll-builder.js`,
   `modules/ffg-destiny-tracker.js`,
   `modules/groupmanager-ffg.js` (if its DialogV2Compat usage was already
   cleared in Stage 1; otherwise it stays),
   `modules/importer/skills-list-importer.js`,
   `modules/importer/swa-importer.js`,
   `modules/items/item-editor.js`,
   `modules/popout-editor.js`,
   `modules/popout-modifiers.js`,
   `modules/settings/crew-settings.js`,
   `modules/settings/ui-settings.js`.
3. Remove the `**/form-application-v2-compat.js` pattern from the
   restricted-imports patterns list.

Verify `npm run lint 2>&1 | grep "no-restricted-imports" | wc -l` returns 0.

**Acceptance:**
- `grep -rn FormApplicationV2Compat modules/` returns zero hits.
- File deleted.
- Every form-app flow verifies live (popout editor save, destiny pool,
  modifiers list, dice pool roll, importers complete a run, settings save).
- The render-race protection / submit-coalescing previously guaranteed by the
  compat layer is either preserved by the native form handler or proven
  unnecessary (verify by repeating the original repro for each guard).
- **Mandar theme verification**: switch the world to the Mandar theme and
  re-run the destiny pool, popout editor, popout modifiers, and dice pool
  flows. Confirm no visible regressions (the destiny halo, modifier list
  scroll, popout editor fill, and editor save button all behave the same
  under Mandar as under the default theme).

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
- **Collapse with deprecated alias** *(default)* — fold the `v2` class and
  `scrollY` differences into `ItemSheetFFG`, delete the `ItemSheetFFGV2`
  class body, but keep `export class ItemSheetFFGV2 extends ItemSheetFFG {}`
  as a one-release deprecated alias and keep its registration entry. Worlds
  that have `item.flags.core.sheetClass === "ffg.ItemSheetFFGV2"` keep
  working without intervention. The alias and its registration are removed
  in the release *after* V2-full lands.
- **Collapse with migration** — same as above but actively rewrite stored
  sheet-class selections on world load. Add a one-shot migration in
  `swffg-migration.js` that finds every document with
  `flags.core.sheetClass` referencing `ItemSheetFFGV2` or `ActorSheetFFGV2`
  and rewrites it to the kept class name. Once the migration version flag
  ticks past V2-full's version, the migration is a no-op and can be deleted.
- **Replace** — keep `ItemSheetFFGV2` as the public class name, delete
  `ItemSheetFFG` and rename the file. The V1 registration goes away. No
  migration needed for V2 users, but V1 users (anyone who selected the V1
  sheet manually) need a flag rewrite the other direction.

The plan defaults to **collapse with deprecated alias** because it's the
lowest-friction path for existing worlds. Stage 3.7 below assumes that
choice; switch the step's wording if the project picks a different
decision. Either way, the sheet-registration call at `swffg-main.js:848-854`
must end up with one *real* item-sheet registration plus at most one
deprecated alias entry.

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
- [ ] **Step 3.7: Collapse `item-sheet-ffg-v2.js`** (default = collapse
  with deprecated alias) — fold its option differences (`v2` class,
  `scrollY: [".sheet-body", ".tab"]`, initial tab `"attributes"`) into
  `ItemSheetFFG`, replace the file body with the alias
  `export class ItemSheetFFGV2 extends ItemSheetFFG {}` plus a JSDoc
  `@deprecated` block referencing this plan. Update `swffg-main.js:852-854`:
  - Drop `makeDefault: true` from the V2 entry (V1 entry takes it).
  - Update label `"Item Sheet v2"` → `"Item Sheet v2 (deprecated, use Item Sheet)"`.
  - Keep the registration so `item.flags.core.sheetClass === "ffg.ItemSheetFFGV2"`
    in existing worlds keeps resolving.

  Schedule removal of the alias for the release after V2-full lands.
- [ ] **Step 3.8: Delete `item-sheet-v2-compat.js` and shrink the allowlist**

  1. Delete `modules/sheets/item-sheet-v2-compat.js`.
  2. In `eslint.config.mjs`, remove `modules/items/item-sheet-ffg.js`
     from the allowlist if Stage 1 also cleared its DialogV2Compat
     imports; otherwise it stays until Stage 1.8 also completes.
  3. Remove `modules/items/item-sheet-ffg-v2.js` from the allowlist (the
     collapsed alias does not import compat).
  4. The `**/sheets/*-v2-compat.js` pattern stays in the restricted-imports
     rule until Stage 4.9 also runs (`actor-sheet-v2-compat.js` /
     `document-sheet-v2-compat.js` still exist).

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
- **Mandar theme verification**: switch the world to the Mandar theme and
  re-run a representative subset (weapon, talent, career, species, item
  attachment + Add Source/Tag + Sheet Options). Confirm body overflow
  flex rules, `.metadata-add-control` positioning, sheet-body scroll
  region, and Sheet Options dialog grid layout match the default theme.
- **Saved sheet-class settings**: confirm a world with documents whose
  `flags.core.sheetClass === "ffg.ItemSheetFFGV2"` opens those documents
  without falling back, then explicitly verifies the deprecated alias
  registration appears in the sheet config picker with the new label.

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

Same decision tree as Stage 3 — **collapse with deprecated alias** by
default. Fold the option differences into `ActorSheetFFG` /
`AdversarySheetFFG`, replace each V2 file body with a one-line alias
class plus `@deprecated` JSDoc, drop `makeDefault: true` from the V2
registration entries, and relabel them
`"Actor Sheet v2 (deprecated, use Actor Sheet)"` /
`"Adversary Sheet v2 (deprecated, use Adversary Sheet)"`. Existing worlds
with `actor.flags.core.sheetClass === "ffg.ActorSheetFFGV2"` keep
working. The aliases and their registrations get removed in the release
*after* V2-full lands.

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
  `adversary-sheet-ffg-v2.js`** (default = collapse with deprecated alias) —
  fold option differences (template path, V2 class, scrollY, tab nav
  selector) into the V1 classes, replace each V2 file body with the
  one-line alias class plus `@deprecated` JSDoc, and update
  `swffg-main.js:847-851`:
  - Drop `makeDefault: true` from each V2 registration entry (V1 entries
    take it).
  - Update labels `"Actor Sheet v2"` / `"Adversary Sheet v2"` to
    `"Actor Sheet v2 (deprecated, use Actor Sheet)"` /
    `"Adversary Sheet v2 (deprecated, use Adversary Sheet)"`.
  - Keep the V2 registrations so worlds with
    `actor.flags.core.sheetClass === "ffg.ActorSheetFFGV2"` keep
    resolving.

  Schedule removal of the aliases for the release after V2-full lands.
- [ ] **Step 4.9: Delete `actor-sheet-v2-compat.js` /
  `document-sheet-v2-compat.js` and shrink the allowlist**

  1. Delete `modules/sheets/actor-sheet-v2-compat.js` and
     `modules/sheets/document-sheet-v2-compat.js`.
  2. In `eslint.config.mjs`, remove
     `modules/actors/actor-sheet-ffg.js`,
     `modules/actors/actor-sheet-ffg-v2.js`,
     `modules/actors/adversary-sheet-ffg-v2.js`,
     `modules/sheets/actor-sheet-v2-compat.js`,
     `modules/sheets/item-sheet-v2-compat.js`,
     and `modules/sheets/document-sheet-v2-compat.js` from the allowlist.
  3. Remove the `**/sheets/*-v2-compat.js` pattern from the
     restricted-imports patterns list.

  Verify `npm run lint 2>&1 | grep "no-restricted-imports" | wc -l` returns 0.

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
- **Mandar theme verification**: switch to Mandar and re-run
  character + minion + vehicle. Confirm character body fill (no gray
  strip), minion derived-data fields update on input change, vehicle
  body flex, header glyph colors, and the chat-action button layout from
  `mandar.css` survive.
- **Saved sheet-class settings**: confirm worlds with
  `actor.flags.core.sheetClass === "ffg.ActorSheetFFGV2"` or
  `"ffg.AdversarySheetFFGV2"` open without fallback, with the deprecated
  alias entries visible in the sheet config picker.

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
- Full regression sweep clean **under both default and Mandar themes**.
- `V2-full` merged to `main`.

---

## Focused regression harness

**Execution model.** The repo's existing tests do not have a CLI runner.
`tests/ffg-tests.js` extends `FormApplication` and registers Mocha at
runtime *inside Foundry*, triggered from `swffg-main.js:1380` when
`localhost` + a system data flag are set. `.github/workflows/main.yml`
fires only on `release: published`, not on PRs. So
"`mocha tests/v2-migration/**/*.test.js`" is not actually a runnable
command for this codebase.

Two viable paths for this harness, ordered from minimum-bootstrap to
most-coverage:

1. **Extend the in-Foundry runner (default for this plan).** Add the new
   tests as Mocha suite functions in `tests/v2-migration/*.test.js`, then
   register them in `tests/ffg-tests.js` alongside the existing
   `HelpersTests` / `ModifiersTests` / `TalentTreeTests` suites. Stage
   acceptance includes the manual step "open Functional Tests in the live
   Foundry world, run the suite, confirm the V2-migration suite passes."
   No CI bootstrap is required. Trade-off: tests are not gated by CI; an
   honour-system step on every stage PR description.
2. **Bootstrap Playwright (stretch).** Add a `tests/playwright/` runner
   that starts a Foundry V13 server, navigates to the join page as GM,
   loads the test world, triggers `new FFGFunctionalTests().render(true)`,
   waits for the Mocha JSON reporter output, and asserts pass count.
   Add a `pr-checks.yml` GitHub Actions workflow triggered on
   `pull_request: [opened, synchronize]` that runs the Playwright suite.
   Trade-off: ~1-2 days of bootstrap work for a true PR gate. Mark this as
   a separate sub-task; the migration does not block on it.

The plan's default is path (1). Stages 1-5 acceptance lists assume the
in-Foundry run. Path (2) lands as an independent improvement and can
upgrade any later stage's acceptance criterion from manual to CI-gated.

**Tests:**

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
  tab does not snap back to the default. Catches the duplicate-Tabs-
  binding regression the second-pass review fixed.
- [ ] **`tests/v2-migration/form-submit-coalesce.test.js`** — Simulate
  multiple synchronous change events on a fixture form (the spec-tree
  multi-click repro). Assert the submit pipeline coalesces them into a
  single `_updateObject` call and that the final `formData` reflects the
  *last* change, not the first. Catches loss of the submit-coalesce
  invariant.

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
- Broader sheet-behavior test coverage. The plan adds exactly three
  focused regression suites under `tests/v2-migration/` for dialog
  close paths, sheet tab cache, and form submit coalesce — these are
  *in scope* as tripwires for the high-risk behaviors named in the
  risk register. Anything beyond that (full sheet-rendering tests,
  fixture-driven actor/item suites, snapshot tests) is out of scope
  for this plan.
- New CI infrastructure. The default execution model for both the
  per-stage checklist and the focused harness is manual / in-Foundry.
  A Playwright-based PR-gating workflow is described as a stretch and
  marked out of scope for the migration's critical path; if it lands
  separately the harness acceptance can upgrade in a follow-up.
