# V2-port Known Issues Fix-up — Design

Date: 2026-05-31
Branch: `V2-port`
Source list: `C:\Users\novak\Desktop\v1-v2-known-issues.txt`

## Context

The system was ported from Foundry's ApplicationV1 to ApplicationV2 across the
V2-port branch via a compatibility-shim strategy (see prior handoff docs and
`modules/sheets/document-sheet-v2-compat.js`,
`modules/apps/form-application-v2-compat.js`). Most V1 patterns work through the
shim. The user listed ten residual issues from real play-testing — all are
either gaps the shim never bridged or V2-specific behaviours the V1 sheet code
never had to handle.

The fix strategy is to **extend the compat shim** for each gap, not to rewrite
sheets in V2 idioms. This preserves the rest of the working V2-port and keeps
each fix independently revertable.

## Issue list (user-supplied, verbatim)

```
2)  biography/description tabs are not editable: all sheets
3)  drop-down selectors open and close too fast: weapon sheet
4)  talent sheet is totally broken
5)  specialization tree - multiple clicks on talent checkbox breaks state
6)  specialization tree - same issue with buy talent button
7)  specialization modifiers list is broken - overflow
8)  specialization description modifier text area is too small — should take
    maximum space possible
9)  specialization tree does not close sometimes
10) specialization tree can be minimized in both dimensions to broken values
less important:
1)  double-click on sheet header makes it black but does not collapse
```

For internal use we renumber **#1..#10** matching the priority cluster order in
this design, NOT the user's source numbering.

## Root-cause clustering

| Internal | User # | Issue | Cluster |
|---|---|---|---|
| 1 | 2 | Biography/description editors not editable on all sheets | A — Missing V2 wiring |
| 2 | 1 | Double-click header doesn't collapse | A — Missing V2 wiring |
| 3 | 10 | Spec tree resizes to broken values | B — Min-size enforcement |
| 4 | 7 | Spec modifiers list overflow | C — CSS |
| 5 | 8 | Spec modifier description textarea too small | C — CSS |
| 6 | 3 | Weapon dropdown opens/closes too fast | D — Render-race (change) |
| 7 | 5 | Spec talent checkbox multi-click breaks state | D — Render-race (change) |
| 8 | 6 | Spec buy-talent button same | D — Render-race (click) |
| 9 | 9 | Spec tree won't close sometimes | D — Render-race (close-via-subclass) |
| 10 | 4 | Talent sheet totally broken | E — Investigation first |

## Execution order

The order above is also the execution order, chosen so each step lands on the
lowest-risk surface that unblocks the next:

1. Cluster A (additive) before everything else — zero risk to existing fixes
   and #1 may by itself remove half of the "broken talent sheet" symptoms.
2. Cluster B (one localised override) before resize-sensitive testing.
3. Cluster C (pure CSS, scoped) before the render-race work in D, so visual
   layout is stable while we debug behavioural timing in D.
4. Cluster D (single shared infrastructure change) — one fix removes four user
   symptoms. Highest blast radius, so it lands after the easy wins.
5. Cluster E last — repro must happen on a system where A, B, C, D have
   already shipped, so the remaining "broken" surface is small and specific.

## Detailed design — Cluster A: Missing V2 wiring

### A1. ProseMirror editor activation — internal #1, user #2

**Root cause.** V1's `FormApplication._render` walked the rendered HTML, found
every `<div class="editor">` produced by the `{{editor}}` Handlebars helper,
and called `this.activateEditor(name)` for each. That bound the "Edit" pencil
button so clicking it mounted an actual ProseMirror instance and synced its
value back to the form on save.

The V2 compat shim never reimplemented this. The DOM still renders the editor
container and the edit button, but clicking the button does nothing. The
`{{editor}}` helper output is `<div class="editor prosemirror" data-engine=
"prosemirror" data-target="<fieldName>">…<a class="editor-edit">…</a>…</div>`,
and the `editors` map on the sheet stays empty, so `FormDataExtended` has no
editor value to serialize at submit time either.

**Fix.** Add an `_activateEditors(html)` method to `FFGDocumentSheetV2` and
call it from `_onRender` after `activateListeners(html)`:

```js
_activateEditors(html) {
  const root = this.element;
  for (const div of root.querySelectorAll(".editor[data-engine='prosemirror']")) {
    const name = div.dataset.target;
    if (!name) continue;
    const button = div.querySelector(".editor-edit");
    if (!button || button.dataset.editorBound) continue;
    button.dataset.editorBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      this._activateEditor(name, div);
    });
  }
}

async _activateEditor(name, container) {
  if (this.editors[name]) return; // already active
  const initial = foundry.utils.getProperty(this.document, name) ?? "";
  const editor = await foundry.applications.ux.ProseMirrorEditor.create(
    container,
    initial,
    {
      document: this.document,
      fieldName: name,
      collaborate: false,
      relativeLinks: true,
    },
  );
  this.editors[name] = editor;
  // ProseMirrorEditor.create renders its own save/cancel chrome. On save it
  // calls document.update({ [fieldName]: value }) directly via fieldName.
  // We only need to drop the reference on close so a re-render rebinds.
  editor.options?.element?.addEventListener?.("editor:save", () => {
    delete this.editors[name];
  });
  editor.options?.element?.addEventListener?.("editor:cancel", () => {
    delete this.editors[name];
  });
}
```

Inherits to `ActorSheetV2Compat` and `ItemSheetV2Compat` automatically.

**Verification.** Open character sheet → Biography tab → click pencil → editor
mounts inline → type text → click save → reload sheet, text persists. Repeat
on a talent item's Description tab, a weapon's special description, and a
specialization talent's per-cell `popout-editor` (which is a separate
mechanism — see note below; A1 covers the `{{editor}}` helper specifically).

**Out-of-scope sub-issue.** The `<div class="popout-editor">` blocks used in
the specialization grid (`templates/items/ffg-specialization-sheet.html:74`)
go through a different path — they open a `PopoutEditor` window. The existing
`item-sheet-ffg.js:1025-1031` mouseover / click handlers already wire that;
verify during smoke-test that it still works post-A1. If broken, treat as a
separate sub-task under Cluster E.

### A2. Window-header double-click to collapse — internal #2, user #1

**Root cause.** V1's `Application._onToggleMinimize` bound a `dblclick`
listener on `.window-header`. V13's ApplicationV2 dropped that affordance —
collapse is only available via the `⋮` controls menu now. The "black" the
user sees is the browser's default text-selection that triple-click leaves on
the unhandled title text.

**Fix.** In `FFGDocumentSheetV2._onRender`, after the existing header
manipulation block (`_projectLegacyHeaderControls`):

```js
const header = this.element.querySelector(":scope > .window-header");
if (header && !header.dataset.dblclickBound) {
  header.dataset.dblclickBound = "1";
  header.addEventListener("dblclick", async (event) => {
    if (event.target.closest("button, a, input, select, menu, .controls-dropdown")) return;
    event.preventDefault();
    if (this.minimized) await this.maximize();
    else await this.minimize();
  });
}
```

Mirror in `FormApplicationV2Compat._onRender` so RollBuilder, DestinyTracker,
GroupManager etc. also get it.

**Verification.** Double-click the title bar of a character sheet → minimises
to the dock. Double-click again → restores. Double-click the `⋮` button → no
spurious minimise (the early-return on `closest("button, …")` blocks it).
Double-click an inline `Sheet Options` link in the header → also no minimise.

## Detailed design — Cluster B: Min-size enforcement

### B1. Clamp setPosition to minimum dimensions — internal #3, user #10

**Root cause.** V2's `ApplicationV2#setPosition` writes width/height
unconditionally. The user can drag the resize handle to a 20×20 window.

**Fix.** Override `setPosition` (NOT `_onPosition` — the hook fires after the
position is already applied) in `FFGDocumentSheetV2`:

```js
static MIN_DIMENSIONS = { width: 300, height: 200 };

setPosition(position = {}) {
  const min = this.constructor.MIN_DIMENSIONS;
  if (typeof position.width === "number"  && position.width  < min.width)  position.width  = min.width;
  if (typeof position.height === "number" && position.height < min.height) position.height = min.height;
  return super.setPosition(position);
}
```

Subclasses with type-specific minimums (specialization needs ~700×600 to be
usable) override `_minDimensions()` in `ItemSheetFFG` and have the base
`setPosition` consult it:

```js
// In FFGDocumentSheetV2:
setPosition(position = {}) {
  const min = this._minDimensions();
  if (typeof position.width === "number"  && position.width  < min.width)  position.width  = min.width;
  if (typeof position.height === "number" && position.height < min.height) position.height = min.height;
  return super.setPosition(position);
}

_minDimensions() {
  return this.constructor.MIN_DIMENSIONS;
}

// In ItemSheetFFG (override):
_minDimensions() {
  switch (this.object?.type) {
    case "specialization":
    case "forcepower":
    case "signatureability":
      return { width: 700, height: 600 };
    default:
      return super._minDimensions();
  }
}
```

Mirror on `FormApplicationV2Compat` for general apps. Skip if it conflicts
with any tiny utility window in the codebase — to be checked during
implementation.

**Verification.** Open a specialization → drag resize handle inward as far as
possible → minimum stops at 700×600 (or whatever values testing dictates).
Confirm the talent grid layout remains usable at the minimum.

## Detailed design — Cluster C: CSS

Both issues live in the same surface: the **specialization sheet's per-cell
description popout** OR the **specialization modifiers panel**, depending on
exact reading. The user wrote "specialization modifiers list" (the panel
listing learned talents' modifier rows) and "specialization description
modifier text area" (the per-talent description textarea inside the modifier
editor `itemEditor` dialog).

Per-task investigation will pin which DOM nodes are involved on first
inspection; the fix shape is the same:

### C1. Modifier list overflow — internal #4, user #7

**Likely cause.** The flex parent has no `min-height: 0`, so an inner
overflow-y on the list doesn't engage and the list pushes the dialog body
beyond `.window-content`. Same pattern as the character-sheet gray-strip fix
(`2c9f9a2b`).

**Fix.** In the relevant SCSS file (`scss/components/_specializations.scss`
and/or `scss/components/_talents.scss`):

```scss
.modification_container, .specialization-modifiers-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
```

The exact selector is confirmed live before committing. No `!important`
unless the V13 `applications` cascade layer specifically loses (per the
pattern documented in the prior handoff's third-pass Sheet Options work).

**Verification.** Open a specialization with ≥6 learned talents that each
have ≥3 modifiers → modifier list scrolls inside the dialog, no overflow
outside `.window-content`.

### C2. Modifier description textarea sizing — internal #5, user #8

**Likely cause.** Either (a) the description input is a single-line `<input>`
where it should be a flex-filling `<textarea>` (per the long-standing TODO
comment at `modules/items/item-editor.js:9`), or (b) it IS a textarea but
sized with a fixed height instead of `flex: 1 1 auto`.

**Fix.** In `templates/items/dialogs/ffg-mod.html` (or wherever the per-mod
description renders), ensure the field is a `<textarea>` with class
`modifier-description` and SCSS:

```scss
.modifier-description {
  flex: 1 1 auto;
  min-height: 8em;
  width: 100%;
  resize: vertical;
}
```

If the field is currently a popout-editor invocation (no inline editing),
keep it that way and just make the rendered preview area flex-fill.

**Verification.** Open a specialization modifier editor → description area
fills available vertical space → typing scrolls inside the textarea, not the
dialog.

## Detailed design — Cluster D: Render-race

### Shared root cause

The current change-input pipeline is:

```
<input>/<select> change
  → FFGDocumentSheetV2._onChangeInput
  → _onSubmit (this._submitting guard)
  → _updateObject
  → document.update(formData, { render: true })  ← default
  → Foundry's updateItem / updateActor hook fires
  → app.render(true) for every sheet bound to the doc
  → DOM swap mid-user-interaction
```

For an interaction longer than one event-loop tick (open select, double-click
checkbox, click buy-button while a render is queued), the DOM swap lands in
the middle and the second half of the interaction hits stale or unmounted
nodes. The four user issues #2, #4, #5, #8 are all manifestations of this.

### D1. Field-scoped change handler — internal #6/#7/#8/#9, user #3/#5/#6/#9

**Fix.** Replace the "submit whole form on every change" model with a
field-scoped update that does NOT re-render:

```js
async _onChangeInput(event) {
  const target = event.currentTarget;
  if (target?.closest?.(".editor.prosemirror, .editor.tinymce")) return;

  const input = event.target;
  // existing color/range mirroring unchanged…

  if (!this.options.submitOnChange) return;

  const field = input.name;
  if (!field || !this.document) return;
  const value = this._readFieldValue(input);
  await this.document.update({ [field]: value }, { render: false });
  // No re-render. Handlers that depend on cross-field reactivity (e.g.
  // "ranks.ranked toggles a sibling visibility") call this.render(true)
  // explicitly from their own listener.
}

_readFieldValue(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number" || input.dataset.dtype === "Number") return Number(input.value);
  if (input.dataset.dtype === "Boolean") return input.value === "true";
  return input.value;
}
```

**Sub-issue addressed per user item:**

- **#2 weapon dropdown:** The change event on `<select>` no longer triggers a
  re-render between mouseDown and mouseUp. Dropdown stays open through
  selection. (Note: native `<select>` doesn't fire `change` until selection,
  so the actual mechanism may be a *different* event causing the close — see
  Investigation, below. The field-scoped fix removes the most likely cause;
  if it doesn't fix #2, the investigation step finds the real culprit.)

- **#4 multi-click checkbox:** Each click sends one targeted `document.update`
  serially; no DOM swap between clicks. The `_submitting` guard on the old
  path was rejecting concurrent submits, which is why prior clicks sometimes
  "didn't take" — they were swallowed. The new path queues per-field.

- **#5 buy-talent button:** Click handler in `item-sheet-ffg.js` calls
  `_handleItemBuy` which itself runs `document.update`. Wrap it so it
  honours the same "no auto-render" rule by passing `{ render: false }` on
  its internal updates. Where the buy flow legitimately needs a re-render
  (new talent purchased → new "Buy" buttons unlock), the handler explicitly
  calls `this.render(false)` (re-render but don't force a fresh fetch) at
  the end. Audit `_handleItemBuy`, `_buyHandleClick`, and the
  specialization-upgrade branch (`item-sheet-ffg.js:1578-1584`).

- **#8 spec tree won't close:** Subclass `_updateObject` overrides at
  `item-sheet-ffg.js` and inside `item-editor.js` call `this.render(true)`
  after `document.update`. The existing `_closing` guard on
  `FFGDocumentSheetV2.render()` already swallows these, BUT only if the call
  goes through the overridden `render`. Audit all explicit `this.render(true)`
  call-sites in `item-sheet-ffg.js`; confirm they all route through
  `FFGDocumentSheetV2.render`. If any bypass (e.g. `super.render` from a
  subclass), add the `_closing` check inline or remove the explicit render.

**Risk assessment.** This is the highest-blast-radius change. Rollout:

1. Land the new `_onChangeInput` in `FFGDocumentSheetV2` only. Existing
   subclasses inherit automatically.
2. Verify each sheet type still saves changes correctly: character, minion,
   rival, nemesis, vehicle, weapon, armour, gear, talent, forcepower,
   ability, itemmodifier, itemattachment, criticalinjury, specialization.
3. Verify cross-field reactivity flows still work — toggling `ranks.ranked`
   on a talent should still show the rank-input field. If broken, the
   handler for that field needs an explicit `this.render(false)` added.
4. If any sheet behaves badly, revert the change-handler swap for that
   sheet by setting `submitOnChange: false` on it and falling back to the
   old submit-whole-form behaviour wired to an explicit Save button.

**Verification.** Reproduce each of #2, #4, #5, #8 on the running world at
`http://192.168.1.7:30000/` before AND after the change. Document the
before-screenshot and the after-screenshot per issue in the commit body.

## Detailed design — Cluster E: Talent sheet investigation

### E1. Diagnose "talent sheet totally broken" — internal #10, user #4

**Approach.** Live repro on the running world is required before designing a
fix. Steps:

1. Open Chrome to `http://192.168.1.7:30000/` and log in as Gamemaster.
2. Open a talent item from the world or a compendium.
3. Capture: full sheet screenshot, browser console (errors + warnings), and
   the DevTools "Elements" view of the sheet root.
4. Walk the four tabs (description, attributes, sources, tags) and capture
   any failure on each.

**Expected outcomes and pre-mapped fixes:**

- **"Description empty / button does nothing"** → already fixed by A1.
- **"Sheet renders but tab switching dead"** → `Tabs` instance not bound;
  check `_activateCoreListeners` ran. Likely a regression from D1.
- **"Window resizes to nothing / layout collapsed"** → the small fixed
  dimensions (`405×535`, `item-sheet-ffg.js:191-193`) interact badly with
  the `flex: 1 1 auto; min-height: 0` rule applied to `.window-content` in
  the gray-strip fix (`2c9f9a2b`). Fix: bump talent default size or scope
  the flex rule away from item sheets.
- **"Modifiers tab broken — controls unresponsive"** → the
  `popoutModiferWindow` call in `activateListeners` at
  `item-sheet-ffg.js:922` opens an old-style helper that may not be V2-aware.
  Wrap it in a V2-compatible launcher.
- **"Source / Tags tabs unresponsive"** → likely the controls in those
  shared partials (`templates/parts/shared/ffg-sources.html`,
  `ffg-tags.html`) are not bound via the new change pipeline. Audit.

This task delivers a sub-design document inline in the implementation plan
(not a separate spec) once the symptom is known.

## Implementation strategy

- **Branch:** continue on `V2-port`. Do not open a PR until the user asks.
- **Commits:** one commit per fix (or per tight 2-3 file cluster), so each is
  independently revertable. Match the existing branch's commit-message style:
  imperative subject ≤72 chars, body explains the **why**.
- **Verification:** every behavioural change is reproduced live in Chrome at
  `http://192.168.1.7:30000/` before committing. Per-fix DOM-probe console
  output (matching the prior handoff's integration smoke pass) is captured
  in the commit body where the change affects layout or render flow.
- **Test files:** `tests/talent-tree.test.js` covers the pure helper logic
  in `modules/helpers/talent-tree.js`. None of the proposed fixes touch
  that helper. Re-run after each commit; expect green.
- **Spec / plan docs:** this design lives at the path above; the
  implementation plan goes to
  `docs/superpowers/plans/2026-05-31-v2-port-known-issues.md` and is
  committed in the same commit as the first implementation step.

## Out of scope

- **Carry-over items from prior handoff** — `absolute` vs `fixed` positioning
  on V2 sheet root, `FORM` vs `SECTION` `.window-content` audit. Neither is
  user-reported nor a regression.
- **Full idiomatic V2 port** — V2 actions API (`data-action` declarative
  bindings), V2 form pipeline (declarative handler with auto-rerender
  control), V2 ApplicationParts with `<prose-mirror>` custom element. Each
  is a much larger change with broad blast radius; would warrant its own
  multi-week plan.
- **Module compatibility audit** — third-party modules that hook
  `renderActorSheet` etc. The legacy render/close hook bridges added in
  prior sessions should keep most things working; targeted fixes if a
  specific module breaks.

## Open questions to confirm before implementation

1. **A1 ProseMirror API surface.** Verify the exact V13 API for mounting a
   ProseMirror editor inline into a `<div class="editor">` produced by the
   `{{editor}}` Handlebars helper. The pseudo-code above uses
   `foundry.applications.ux.ProseMirrorEditor.create(container, initial, opts)`;
   the real API may differ slightly. If the editor element exposes a
   `<prose-mirror>` custom element instead, switch to that path.
2. **D1 cross-field reactivity.** Confirm by audit that no current sheet
   handler depends on `_onChangeInput` triggering a full re-render. If any
   do, list them explicitly in the implementation plan so each gets an
   explicit `this.render(false)` added in its own listener.
3. **B1 min-dimension values.** The proposed minimums (300×200 generic,
   700×600 for tree-type items) are best-guess. Confirm during
   implementation that the layouts genuinely stay usable at those minima.
