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

**Root cause.** V1's `FormApplication._render` (`form-application-v1.mjs:394`)
walked the rendered HTML, found every `.editor-content[data-edit]` produced by
the `{{editor}}` helper (`fields.mjs:103` — `<div class="editor"><div class=
"editor-content" data-edit="<name>">…</div><div class="editor-menu"><a class=
"editor-edit">…</a></div></div>`), and registered an editor state record
keyed by the data-edit attribute. Save was wired via the ProseMirror plugin
chain that the V1 FormApplication installed (it pushes editor changes back
through the form's submit pipeline, not via `fieldName`).

The V2 compat shim never reimplemented any of this. The DOM still renders the
editor container and the edit button, but clicking the button does nothing,
no editor state is registered, and `FormDataExtended` has no editor value to
serialize at submit time.

**Initial-design correction (P1 review):** the earlier draft of this spec
named the wrong selector (`.editor[data-target]`) and the wrong save path
(`ProseMirrorEditor.create` with `fieldName` auto-save). Neither exists.
Use `.editor-content[data-edit]` for discovery and wire save explicitly.

**Fix.** Add an `_activateEditors()` method to `FFGDocumentSheetV2` and call
it from `_onRender` after `activateListeners(html)`:

```js
_activateEditors() {
  const root = this.element;
  for (const content of root.querySelectorAll(".editor-content[data-edit]")) {
    const name = content.dataset.edit;
    if (!name) continue;
    const editorContainer = content.closest(".editor");
    const button = editorContainer?.querySelector(".editor-edit");
    if (!button || button.dataset.editorBound) continue;
    button.dataset.editorBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      this._activateEditor(name, content, editorContainer, button);
    });
  }
}

async _activateEditor(name, contentEl, containerEl, buttonEl) {
  if (this.editors[name]) return;
  const initial = foundry.utils.getProperty(this.document, name) ?? "";
  // V13 ProseMirror is mounted via ProseMirrorEditor.create on a target
  // element; we mount into the existing .editor-content div so the
  // surrounding chrome stays in place.
  const editor = await ProseMirror.ProseMirrorEditor.create(contentEl, initial, {
    document: this.document,
    fieldName: name,
    plugins: {
      // Install the keymaps plugin so Ctrl+S etc work.
      keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
        onSave: () => this._saveEditor(name, { remove: true }),
      }),
    },
    relativeLinks: true,
  });
  this.editors[name] = { editor, name, contentEl, containerEl, buttonEl, active: true };

  // Hide the edit button while the editor is active and expose save/cancel.
  containerEl.classList.add("editor-active");
  this._renderEditorControls(this.editors[name]);
}

_renderEditorControls(state) {
  // Reuses the V13 .editor-menu chrome; on click of save or cancel, call
  // _saveEditor or _cancelEditor.
  // …details fleshed out at implementation time once we see the real DOM
  //   produced by the V13 helper on this server's Foundry build.
}

async _saveEditor(name, { remove = true } = {}) {
  const state = this.editors[name];
  if (!state) return;
  const value = ProseMirror.dom.serializeString(state.editor.view.state.doc.content);
  await this.document.update({ [name]: value });
  if (remove) this._closeEditor(name);
}

_closeEditor(name) {
  const state = this.editors[name];
  if (!state) return;
  state.editor.destroy();
  state.containerEl.classList.remove("editor-active");
  delete this.editors[name];
}
```

The `_renderEditorControls` body and the exact `ProseMirror.dom.*`
serializer call are placeholders that get pinned down on first
implementation pass, when we can inspect the real V13 DOM in DevTools on
the running server. The shape — discover via `.editor-content[data-edit]`,
mount via `ProseMirror.ProseMirrorEditor.create`, save via explicit
`document.update({ [name]: serialized })` — is the load-bearing design
decision and is reviewer-confirmed.

Inherits to `ActorSheetV2Compat` and `ItemSheetV2Compat` automatically.

**Verification.** Open character sheet → Biography tab → click pencil →
editor mounts inline → type text → click save → reload sheet, text
persists. Repeat on a talent item's Description tab, a weapon's special
description, and a specialization talent's per-cell `popout-editor` (which
is a separate mechanism — see note below; A1 covers the `{{editor}}`
helper specifically).

**Out-of-scope sub-issue.** The `<div class="popout-editor">` blocks used in
the specialization grid (`templates/items/ffg-specialization-sheet.html:74`)
go through a different path — they open a `PopoutEditor` window. The existing
`item-sheet-ffg.js:1025-1031` mouseover / click handlers already wire that;
verify during smoke-test that it still works post-A1. If broken, treat as a
separate sub-task under Cluster E.

### A2. Window-header double-click to collapse — internal #2, user #1

**Initial-design correction (P1 review):** the earlier draft assumed V13
dropped the dblclick handler entirely and proposed adding our own.
Reviewer flagged that ApplicationV2 already binds `dblclick` on the header
and toggles minimize/maximize (`application.mjs:1365`, `application.mjs:1600`).
Adding another listener would double-toggle on every dblclick.

**Revised root cause (hypothesis, requires diagnosis).** Something in our
compat shim is preventing V13's built-in handler from firing or from
completing successfully. Candidates:

1. `_projectLegacyHeaderControls` (`document-sheet-v2-compat.js:254`)
   reshuffles header children. If V13's handler is bound to a specific
   inner element rather than the header itself, our removal/insertion may
   have detached it.
2. The Sheet Options injector (`actor-ffg-options.js:38`,
   `item-ffg-options.js:20`) adds an `<a class="ffg-sheet-options">` link
   inside the header. If V13's dblclick handler requires `event.target`
   to be the header text and our link captures it, the handler short-
   circuits.
3. CSS: V13's handler may guard on `event.defaultPrevented`. If another
   listener (ours or a third-party module's) preventDefaults the first
   click of the pair, dblclick never fires.
4. The user-reported "black" suggests text-selection IS being made, which
   means at least one of the two clicks is hitting an unhandled text node
   — strong signal the inner-target hypothesis (#2) is the culprit.

**Plan.** Diagnose first, fix after:

1. Open a sheet on the running server, attach a console listener:
   `dom.querySelector(".window-header").addEventListener("dblclick",
   (e) => console.log("dblclick fired", e.target), { capture: true });`
2. Double-click the title bar. Confirm whether the V13 handler fires (it
   does its own work after our capture-phase log).
3. If V13's handler does not fire → step through `_projectLegacyHeaderControls`
   and the Sheet Options injector to find what removed it.
4. If V13's handler fires but doesn't minimize → check `this.minimized`
   state after the call; look for our `_closing` guard or any other
   render-blocking guard interfering.

**Fix shape (post-diagnosis).** Most likely a one-line correction —
restore the header element V13 binds to, OR make the Sheet Options link
non-target via `pointer-events: none` on its enclosing wrapper but `auto`
on the link itself, OR remove a stray `preventDefault` call. We do NOT
add a duplicate dblclick listener.

**Verification.** Double-click the title bar → minimizes (single toggle,
not two). Repeat → restores. Confirm via console log that only V13's
handler runs, not a duplicate of ours.

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

**Initial-design correction (P2 review):** earlier draft named
`ffg-mod.html`, which contains modifier type/value controls, not the
description field. The correct surface depends on which "modifier
description" the user means; the three candidates each live in a different
partial:

| Partial | Line | Field shape today |
|---|---|---|
| `templates/items/dialogs/ffg-modification.html` | 10 | `<input type="text" name="system.itemmodifier[N].system.description">` |
| `templates/items/dialogs/ffg-embedded-talent.html` | 16 | `<input type="text" name="description">` |
| `templates/items/dialogs/ffg-embedded-upgrade.html` | 16 | `<input type="text" name="description">` |

`ffg-embedded-itemmodifier.html` and `ffg-embedded-itemattachment.html`
already use `{{editor}}` (ProseMirror) for their description fields, so
they're covered by A1.

**Repro first.** Open a specialization, click a talent's modifier-edit
gear icon, confirm which of the three partials renders the cramped
input. Apply the fix to whichever surface the user reproduces against
first; the other two get the same fix in a follow-up commit if the user
reports them.

**Fix.** Replace the relevant `<input type="text">` with a `<textarea>`
flex-filling its container. Example for `ffg-modification.html`:

```hbs
<textarea
  class="modifier-description"
  name="system.itemmodifier[{{number}}].system.description"
  rows="4">{{ mod.system.description }}</textarea>
```

SCSS (scope to the dialog so it doesn't bleed into sheet bodies):

```scss
.flat_editor .modifier-description,
.starwarsffg.sheet .modifier-description {
  flex: 1 1 auto;
  min-height: 8em;
  width: 100%;
  resize: vertical;
}
```

**Side note on the V1 known-issue comment** at `modules/items/item-editor.js:9`
("Modification descriptions are rendered in an input field, not a rich
text editor"). This is the long-standing limitation the user is now
running into. We're upgrading `<input>` → `<textarea>`, NOT to a
ProseMirror editor, because the latter is a much larger change (state
sync across multiple instances inside a single dialog, plus interactions
with the embedded-item save semantics). Note that limitation for a
future enhancement.

**Verification.** Open the editor → description area fills available
vertical space → typing scrolls inside the textarea, not the dialog.

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

### D1. Render-suppression on the existing whole-form submit path — internal #6/#7/#8/#9, user #3/#5/#6/#9

**Initial-design correction (P1 + P2 review):** the earlier draft replaced
the whole-form submit with `document.update({ [field]: value }, { render:
false })`. Two reviewer-flagged problems make that wrong:

1. **Skips legacy update wrappers.** `ItemHelpers.itemUpdate`
   (`modules/helpers/item-helpers.js:4`) and `ActorHelpers.updateActor`
   (`modules/helpers/actor-helpers.js:58`) do `data` → `system` migration,
   AE syncing, free-form attribute reshaping (the `-=key` deletes), talent
   propagation to specs/owned items, and XP-earn logging. Going direct to
   `document.update` silently skips all of it. Templates also still emit
   `name="data.foo"` paths that need `migrateDataToSystem`.
2. **Broken editor guard.** The change listener is attached to the form
   (`document-sheet-v2-compat.js:220`). `event.currentTarget` is therefore
   the form, never an editor. The guard `target?.closest?.(".editor…")`
   walks UP from the form and never matches. The bug exists today; the
   draft preserved it.

**Revised fix.** Don't touch the submit pipeline shape. Keep the
whole-form submit. Suppress the re-render at three points along the
existing path:

```js
async _onChangeInput(event) {
  // FIX the guard: currentTarget is the form, target is the actual input.
  const input = event.target;
  if (input?.closest?.(".editor.prosemirror, .editor.tinymce")) return;

  // existing color/range mirroring unchanged…

  if (this.options.submitOnChange) return this._onSubmit(event);
}

async _onSubmit(event, { updateData = null, preventClose = false, preventRender = false, render = false } = {}) {
  // Default render to false here. The handful of call-sites that genuinely
  // need a re-render (e.g. cross-field reactivity) pass { render: true }
  // explicitly. Most don't — the auto-render hook will fire on
  // document.update either way and our render() will swallow it via the
  // existing _closing guard during close. We swallow it during change-
  // driven updates by passing { render: false } down to the document.
  event?.preventDefault?.();
  if (!this.form || !this.isEditable || this._submitting) return false;

  this._submitting = true;
  const formData = this._getSubmitData(updateData);
  try {
    await this._updateObject(event, formData, { render });
  } finally {
    this._submitting = false;
  }

  if (this.options.closeOnSubmit && !preventClose) await this.close({ submit: false, force: true });
  return formData;
}

async _updateObject(_event, formData, { render = false } = {}) {
  // Subclasses (ActorSheetFFG, ItemSheetFFG) override this to route through
  // ActorHelpers.updateActor / ItemHelpers.itemUpdate. We thread the render
  // option down to document.update so the auto-rerender hook stays silent.
  return this.document.update(formData, { render });
}
```

**Subclass changes.** `ActorHelpers.updateActor` and `ItemHelpers.itemUpdate`
need a `{ render }` parameter forwarded to their internal `this.object.update(…)`
call. Today both helpers call `await this.object.update(formData)` with no
options object. We change to `await this.object.update(formData, { render })`
where `render` defaults to `false`. The helpers' own explicit
`this.render(true)` / `item.sheet.render(true)` calls (item-helpers.js:44, 76, 80)
are AUDITED — most are present specifically to refresh after the auto-render
was suppressed, and need to stay. The ones that are redundant with the
auto-render get removed. This is line-by-line work done in the
implementation plan, not pre-decided here.

**Sub-issue mapping (unchanged from prior draft, fix mechanism updated):**

- **#2 weapon dropdown:** No re-render fires on `change` of a `<select>`,
  so the DOM swap mid-interaction goes away. The exact event that closes
  the dropdown is confirmed by repro: most likely a `getData()`-triggered
  position recalc that follows the suppressed render. If the dropdown
  still closes after D1 lands, the investigation under E1 covers it.
- **#4 multi-click checkbox:** Same — no re-render between clicks.
  Document.update queues serially via the `_submitting` guard.
- **#5 buy-talent button:** `_handleItemBuy` and `_buyHandleClick` call
  `document.update` directly (not through our `_onSubmit`). Add an
  explicit `{ render: false }` to those call-sites and let the buy
  handler decide when to call `this.render()` once the transaction
  completes. Audit `item-sheet-ffg.js:1432, 1469, 1578-1584` and the
  related shared purchase flow (`item-sheet-ffg.js:1584` onwards).
- **#8 spec tree won't close:** Confirm every `this.render(true)`
  call-site in `item-sheet-ffg.js` routes through
  `FFGDocumentSheetV2.render` (which honours `_closing`). The existing
  `5fbc5147` and `7362a6e5` fixes assumed this; verify no subclass
  bypasses via `super.render` or by calling on a different object.

**Risk assessment.** Lower than the prior draft because:

- Existing submit pipeline unchanged — `ItemHelpers.itemUpdate` and
  `ActorHelpers.updateActor` still run, AE sync still happens, talent
  propagation still happens, XP logging still happens.
- Only difference is the `{ render: false }` flag threaded to the final
  `document.update`. The legacy helpers' explicit `this.render(true)`
  calls remain a controllable choice — we leave them where the flow
  legitimately needs a redraw, remove them where they were compensating
  for the now-suppressed auto-render.
- Rollback path: drop the `{ render: false }` and revert the helpers'
  signature — one revert commit.

**Rollout.**

1. Land the `_onSubmit` / `_updateObject` change in
   `FFGDocumentSheetV2` only. Thread `render: false`.
2. Land the matching parameter in `ItemHelpers.itemUpdate` and
   `ActorHelpers.updateActor`. Forward to `document.update`.
3. Verify each sheet type still saves correctly (full list under prior
   handoff's smoke-pass).
4. Audit the `this.render(true)` call-sites and remove any redundant
   ones (those that fired only to compensate for the now-suppressed
   auto-render).
5. Reproduce #2, #4, #5, #8 before AND after. Document.

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

1. **A1 ProseMirror API surface.** Pin the exact V13 calls during the
   first implementation pass using DevTools on the running server:
   - The serializer step (`ProseMirror.dom.serializeString(...)` is
     placeholder — confirm the real symbol name).
   - The keymap save handler (`ProseMirrorKeyMaps.build` signature).
   - Whether to use `ProseMirror.ProseMirrorEditor.create` directly or
     mount via the `<prose-mirror>` custom element exposed by V13.
2. **A2 dblclick diagnosis.** Confirm via the capture-phase console
   listener whether V13's built-in dblclick handler fires, before
   choosing a fix. Update the spec with the actual cause once known.
3. **D1 redundant-render audit.** Build a list of every `this.render(true)`
   and `sheet.render(true)` call-site in `ItemHelpers`, `ActorHelpers`,
   `item-sheet-ffg.js`, and `actor-sheet-ffg.js`. For each, decide:
   "needed for cross-field reactivity" (keep) vs "was compensating for
   the auto-render hook" (remove now that `{ render: false }` flows
   through). The implementation plan enumerates this list explicitly.
4. **B1 min-dimension values.** The proposed minimums (300×200 generic,
   700×600 for tree-type items) are best-guess. Confirm during
   implementation that the layouts genuinely stay usable at those minima.
5. **C2 target partial.** Confirm via repro which of the three candidate
   partials (`ffg-modification.html`, `ffg-embedded-talent.html`,
   `ffg-embedded-upgrade.html`) the user is hitting. Fix that one first;
   apply the same pattern to the other two only if the user reports them.
