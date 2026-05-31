# V2-port Known Issues Fix-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve ten user-reported issues from real-play testing of the
V2-port branch (`V2-port`), grouped into five clusters per the design at
[`../specs/2026-05-31-v2-port-known-issues-design.md`](../specs/2026-05-31-v2-port-known-issues-design.md).

**Architecture:** Extend the existing V2 compatibility shim. No rewrites; each
fix is localized and independently revertable. Verification is **live** at
`http://192.168.1.7:30000/` (Gamemaster login, no password) since the only
existing test surface (`tests/talent-tree.test.js`) covers pure helper logic
and not sheet behaviour.

**Tech Stack:** Foundry VTT v13 (ApplicationV2 / HandlebarsApplicationMixin),
ProseMirror (`foundry.applications.ux.ProseMirrorEditor`, `ProseMirror.*` for
plugins), Handlebars templates, SCSS, jQuery (legacy compat).

---

## Pre-flight

Before any code change, run a sanity baseline so we can A/B every fix.

### Task 0: Capture pre-change baseline

**Files:** none (read-only / external state).

- [ ] **Step 1: Verify branch and clean tree**

Run:
```bash
git status
git log --oneline -3
```

Expected: branch `V2-port`, working tree clean, top commit is the design-doc
commit `df43c163` (second-pass revision) or later.

- [ ] **Step 2: Open the running server**

In Chrome, navigate to `http://192.168.1.7:30000/`, log in as Gamemaster (no
password). Open the World Items directory.

- [ ] **Step 3: Screenshot pre-state of each broken surface**

For each of the user-reported issues, open the relevant sheet and capture a
PNG screenshot (DevTools → Capture screenshot of node, or full window):

1. Character sheet → Biography tab → state of `{{editor}}` block.
2. Any item sheet → double-click window header → record visual result.
3. Weapon sheet → any dropdown → click open → record dropdown behaviour.
4. Talent item → open → record full state of all four tabs.
5. Specialization sheet → click a talent checkbox 3 times rapidly → record.
6. Specialization sheet → click a "Buy" button → record.
7. Specialization talent's modifier panel (gear icon → editor) → record modifier-list overflow.
8. Same modifier panel → record description input size.
9. Specialization sheet → drag resize handle to smallest possible → record dimensions.

Store the screenshots in `docs/superpowers/plans/2026-05-31-baseline/`
(create the directory if missing).

- [ ] **Step 4: Commit baseline**

```bash
mkdir -p docs/superpowers/plans/2026-05-31-baseline
# copy screenshots into that dir
git add docs/superpowers/plans/2026-05-31-baseline/
git commit -m "Capture pre-fix baseline screenshots for V2-port issues"
```

---

## Cluster A — Missing V2 wiring

### Task A1: Activate ProseMirror editors on V2 document sheets

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js` (add methods, call from `_onRender`)

**What this fixes:** User issue #2 — Biography/description tabs not editable
on all sheets.

- [ ] **Step 1: Open `modules/sheets/document-sheet-v2-compat.js`**

Read the full file once. Note the existing `_onRender` at line 212 and the
`this.editors = {}` initialization at line 101.

- [ ] **Step 2: Add the editor activation methods**

Append three new methods to the `FFGDocumentSheetV2` class, immediately after
`_activateCoreListeners` (the existing method that ends at the line containing
the closing brace of the file's `if (this.isEditable) { html.find("img[data-edit]")...` block, approximately line 391).

Find the insertion point (the closing `}` of `_activateCoreListeners`) and add:

```js
  /**
   * Wire the V1 `{{editor}}` helper's Edit button to mount a ProseMirror
   * editor inline. V13's HandlebarsApplicationMixin does not auto-bind this;
   * the V1 FormApplication did (`form-application-v1.mjs:394`). The helper
   * emits `.editor-content[data-edit="<name>"]`; we discover via that selector.
   */
  _activateEditors() {
    const root = this.element;
    if (!root) return;
    for (const content of root.querySelectorAll(".editor-content[data-edit]")) {
      const name = content.dataset.edit;
      if (!name) continue;
      const containerEl = content.closest(".editor");
      const button = containerEl?.querySelector(".editor-edit");
      if (!button || button.dataset.editorBound) continue;
      button.dataset.editorBound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this._activateEditor(name, content, containerEl, button);
      });
    }
  }

  async _activateEditor(name, contentEl, containerEl, buttonEl) {
    if (this.editors[name]?.active) return;
    const initial = foundry.utils.getProperty(this.document, name) ?? "";
    const { ProseMirrorEditor } = foundry.applications.ux;

    // Register a FormDataExtended-compatible entry BEFORE create() resolves.
    // FormDataExtended (`form-data-extended.mjs:155`) reads each entry by
    // `options.engine === "prosemirror"` and pulls value from `instance`.
    // If we omit this shape, both the editor instance AND the [data-edit]
    // DOM node are skipped, silently losing unsaved content on submit-on-close.
    this.editors[name] = {
      instance: null,
      options: { engine: "prosemirror", target: name, button: true, owner: this.isEditable },
      active: true,
      button: buttonEl,
      container: containerEl,
    };

    const editor = await ProseMirrorEditor.create(contentEl, initial, {
      document: this.document,
      fieldName: name,
      relativeLinks: true,
      plugins: {
        menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
          destroyOnSave: true,
          onSave: () => this._saveEditor(name, { remove: true }),
        }),
        keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
          onSave: () => this._saveEditor(name, { remove: true }),
        }),
      },
    });

    this.editors[name].instance = editor;
    // The "prosemirror" class on the container is what the change-handler
    // editor guard (D1.a) looks for. Without it, every keystroke inside
    // the editor bubbles a `change` to the form and triggers a full submit
    // -- exactly what the V1 guard was preventing. V1 added the engine
    // class to .editor on mount; mirror that here.
    containerEl.classList.add("editor-active", "prosemirror");
  }

  async _saveEditor(name, { remove = true } = {}) {
    const state = this.editors[name];
    if (!state?.instance) return;
    // Route through the normal submit pipeline so ItemHelpers.itemUpdate /
    // ActorHelpers.updateActor run AE sync, talent propagation, attribute
    // reshaping, XP logging. FormDataExtended pulls the editor value out of
    // state.instance via the engine="prosemirror" entry on this.editors.
    //
    // Pass render: true so the sheet re-renders after save: the {{editor}}
    // block needs to redraw with the now-saved enriched content, and
    // _destroyEditor below removes the editor instance without restoring
    // the rendered preview. Without render: true the user sees ProseMirror
    // teardown leftovers in the description area.
    const event = new Event("submit", { cancelable: true });
    await this._onSubmit(event, { preventClose: true, render: true });
    if (remove) this._destroyEditor(name);
  }

  _destroyEditor(name) {
    const state = this.editors[name];
    if (!state) return;
    try { state.instance?.destroy(); } catch (_e) {}
    state.container?.classList.remove("editor-active", "prosemirror");
    delete this.editors[name];
  }
```

- [ ] **Step 3: Call `_activateEditors` from `_onRender`**

In the existing `_onRender` (line 212), after `this._callLegacyRenderHook(html, context);` (last line of the method body), add:

```js
    this._activateEditors();
```

The full updated `_onRender` ends with:

```js
    this._activateCoreListeners(html);
    this.activateListeners(html);
    this._callLegacyRenderHook(html, context);
    this._activateEditors();
  }
```

- [ ] **Step 4: Live-verify on character sheet biography**

Open `http://192.168.1.7:30000/` → open a character → Biography tab → click
the pencil/edit button on the biography editor. Expected:

- ProseMirror editor mounts inline.
- Container picks up the `prosemirror` and `editor-active` classes
  (verify in DevTools: `document.querySelector(".editor.editor-active.prosemirror")`
  resolves to a node).
- Type "test content" → click the save (floppy) icon in the editor menu.
- Editor closes; biography area shows "test content" rendered with
  enriched HTML (i.e. dice glyphs etc. would render if present). This
  works because `_saveEditor` passes `render: true` to `_onSubmit`, so
  the sheet re-renders and the `{{editor}}` helper redraws with the
  freshly enriched content. If you see ProseMirror teardown leftovers
  (e.g. an empty `.editor-content` or doubled markup), the re-render
  didn't fire — check that D1 didn't accidentally force the default
  back to `false` and that the `render: true` argument actually
  threaded through.
- Reload the sheet (close + reopen) → content persists.
- During typing, the form's change-handler should NOT fire on every
  keystroke (verify by `_submitting` not being set — check with
  `ui.activeWindow._submitting` in console between keystrokes). This
  is guarded by the `prosemirror` class on the container that D1.a's
  editor guard reads.

If the editor does NOT mount, open DevTools console and check for errors.
Common failure modes:
- `ProseMirror.ProseMirrorMenu is undefined` → the namespace symbol differs
  on the installed Foundry build. Check `window.ProseMirror` shape and adjust.
- `foundry.applications.ux.ProseMirrorEditor is undefined` → check the
  actual export path on this Foundry version.

- [ ] **Step 5: Live-verify cross-doc propagation**

Open a talent item that appears in a specialization tree. Edit its description
via the new editor → save. Open the specialization sheet → confirm the talent
tile's description tooltip reflects the change. This validates that
`_onSubmit` ran the legacy `ItemHelpers.itemUpdate` and its
`clickfromparent` propagation block (`item-helpers.js:47-83`).

- [ ] **Step 6: Live-verify submit-on-close**

Open a weapon sheet's special description editor (if present) → type a
character → DO NOT click save → click the × to close the sheet. Reopen the
sheet → confirm the typed character is present. This validates that the
`{ engine: "prosemirror" }` entry on `this.editors` lets FormDataExtended
extract the value during submit-on-close.

- [ ] **Step 7: Commit**

```bash
git add modules/sheets/document-sheet-v2-compat.js
git commit -m "$(cat <<'EOF'
Activate ProseMirror editors on V2 document sheets

The {{editor}} Handlebars helper emits .editor-content[data-edit] +
.editor-edit button, but V13's HandlebarsApplicationMixin does not
auto-bind the button to mount a ProseMirror editor the way V1's
FormApplication.activateEditor did. Result: biography / description
tabs on every sheet were read-only.

Add _activateEditors / _activateEditor / _saveEditor / _destroyEditor.

Three load-bearing details:
- Register each active editor as { instance, options: { engine:
  "prosemirror" } } so FormDataExtended pulls the value at submit-on-
  close (form-data-extended.mjs:155 reads via this exact shape; omit
  it and the editor's content is silently lost).
- Add the `prosemirror` class to the container alongside `editor-
  active`. D1.a's change-handler editor guard looks for
  `.editor.prosemirror, .editor.tinymce` -- without the class, every
  keystroke inside the editor bubbles a `change` to the form and
  triggers a full submit, which is exactly what V1 prevented.
- Route _saveEditor through this._onSubmit({ preventClose: true,
  render: true }) so ItemHelpers.itemUpdate / ActorHelpers.updateActor
  still run their AE sync / talent propagation / attribute reshaping /
  XP logging, AND the sheet re-renders so the {{editor}} block redraws
  with the saved enriched content (without render: true,
  _destroyEditor would tear down the editor and leave the user looking
  at ProseMirror teardown leftovers).

Verified live: biography saves and reload-persists on character
sheet, talent description edit propagates into specialization tree
tooltips, close-without-save preserves typed content via the submit-
on-close pipeline, and the change-handler editor guard correctly
ignores in-editor keystrokes (no spurious submits during typing).
EOF
)"
```

---

### Task A2: Diagnose and restore window-header dblclick collapse

**Files:**
- Diagnose: `modules/sheets/document-sheet-v2-compat.js`, `modules/actors/actor-ffg-options.js`, `modules/items/item-ffg-options.js`
- Fix location depends on diagnosis.

**What this fixes:** User issue #1 (less important) — double-click on sheet
header makes it black but does not collapse.

- [ ] **Step 1: Attach diagnostic console listener on the running server**

In Chrome at `http://192.168.1.7:30000/`, open any sheet. Open DevTools
console and run:

```js
const header = document.querySelector(".window-app .window-header");
header.addEventListener("dblclick", (e) => {
  console.log("[diag] dblclick fired", { target: e.target.tagName,
    defaultPrevented: e.defaultPrevented, path: e.composedPath().map(n => n.tagName ?? n.nodeName) });
}, { capture: true });
```

Double-click the title bar. Capture the console output.

- [ ] **Step 2: Classify the result**

Three possible outcomes, each with a different fix:

**Outcome A — log fires AND sheet minimizes:** V13's built-in handler works.
The user's "black, no collapse" is either (a) a third-party module
interference, or (b) something we did changed during A1/D1. Re-run after
those land. If still broken, drop to Outcome B/C diagnostics.

**Outcome B — log fires but sheet doesn't minimize:** V13's handler is
detached or guarded against our DOM. Inspect:

1. `application.mjs` source on the server (the line cited by the reviewer
   is `application.mjs:1365`). Find the actual handler. Check whether it
   guards on `event.defaultPrevented`, a specific `event.target` shape, or
   a particular header child element.
2. Search our `_projectLegacyHeaderControls` (`document-sheet-v2-compat.js:254`)
   for any element removal that affects what the handler binds to.
3. Search the Sheet Options injector (`actor-ffg-options.js:46-54`,
   `item-ffg-options.js`) for any preventDefault that could be firing
   before the dblclick.

**Outcome C — log doesn't fire at all:** The header itself is being replaced
or moved between renders. Check whether `_projectLegacyHeaderControls`
detaches the header, or whether re-renders during the gap between the two
clicks tear down the listener. Repro by re-rendering between clicks:

```js
const app = ui.activeWindow;
app.element.querySelector(".window-header").click();
await app.render();
app.element.querySelector(".window-header").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
```

- [ ] **Step 3: Apply the matching fix**

Based on classification:

**For Outcome A:** No code change yet. Mark this task complete pending
post-D1 re-verification. Add a TODO note in the commit log of D1 to revisit
A2 after D1 lands.

**For Outcome B with `defaultPrevented` guard:** Find the listener that
preventDefaults and remove it OR remove the offending element from the
event path. Most likely candidate: the `<a href="#" class="ffg-sheet-options">`
injected by the Sheet Options handler. Its click handler already does
`event.preventDefault()` (per the existing comment in `actor-ffg-options.js:82-83`),
but the FIRST click of a dblclick pair shouldn't trigger that path unless
the user dblclicks ON the Sheet Options button itself. If the test repro
dblclicks the bare title text and Outcome B still occurs, the guard is
elsewhere — diff against a vanilla V13 sheet without our shim.

**For Outcome C with header replacement:** Move the `_projectLegacyHeaderControls`
DOM mutations into a less destructive form. Instead of `el.remove()` +
re-insertion, use `el.classList.add("hidden")` / `el.classList.remove("hidden")`
so the V13 handler's binding survives. Concretely, edit
`document-sheet-v2-compat.js:259`:

```js
// BEFORE (line 259):
header.querySelectorAll(":scope > .legacy-header-action").forEach((el) => el.remove());
// AFTER:
header.querySelectorAll(":scope > .legacy-header-action").forEach((el) => el.classList.add("legacy-header-action-stale"));
```

Plus matching SCSS in `scss/components/_sheet.scss` (or wherever legacy-header-action is styled):

```scss
.legacy-header-action-stale { display: none; }
```

(Re-insertion of new legacy-header-action elements proceeds as today.)

- [ ] **Step 4: Live-verify the chosen fix**

Double-click the title bar of a character sheet → minimizes (single toggle,
not two). Repeat → restores. Confirm via the diagnostic listener from Step 1
that the V13 handler runs exactly once per dblclick.

- [ ] **Step 5: Commit**

```bash
git add <files-touched>
git commit -m "$(cat <<'EOF'
Restore V13 window-header dblclick collapse

[Replace this body with the actual cause found in Step 2.]

Diagnosis: <outcome A / B / C summary>
Fix: <what was changed and why>
Verified: dblclick on title bar minimizes once, dblclick on minimized
window restores once, no double-toggle.
EOF
)"
```

If Outcome A and no fix needed yet, skip the commit and continue.

---

## Cluster B — Min-size enforcement

### Task B1: Clamp setPosition to per-type minimums

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js` (base `setPosition`, `_minDimensions`)
- Modify: `modules/items/item-sheet-ffg.js` (override `_minDimensions` for tree-type items)
- Modify: `modules/apps/form-application-v2-compat.js` (mirror)

**What this fixes:** User issue #10 — specialization tree can be resized to
unusable dimensions.

- [ ] **Step 1: Add the clamp to `FFGDocumentSheetV2`**

In `modules/sheets/document-sheet-v2-compat.js`, add a static field after the
existing `static LEGACY_HEADER_ACTIONS = new Set();` declaration (line 252):

```js
  static MIN_DIMENSIONS = { width: 300, height: 200 };
```

Then add two new methods immediately after `_getLegacyRootClasses` (around
line 303):

```js
  _minDimensions() {
    return this.constructor.MIN_DIMENSIONS;
  }

  setPosition(position = {}) {
    const min = this._minDimensions();
    const clamped = { ...position };
    if (typeof clamped.width  === "number" && clamped.width  < min.width)  clamped.width  = min.width;
    if (typeof clamped.height === "number" && clamped.height < min.height) clamped.height = min.height;
    return super.setPosition(clamped);
  }
```

- [ ] **Step 2: Override `_minDimensions` for tree-type items**

In `modules/items/item-sheet-ffg.js`, add the override inside the
`ItemSheetFFG` class. Find a good insertion point — after the existing
`static SIZE_TO_INT = { … }` declaration (around line 46) is fine. Add:

```js
  /** @override */
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

- [ ] **Step 3: Mirror on `FormApplicationV2Compat`**

In `modules/apps/form-application-v2-compat.js`, add to the
`FormApplicationV2Compat` class after `_initializeApplicationOptions` (around
line 121):

```js
  static MIN_DIMENSIONS = { width: 300, height: 200 };

  _minDimensions() {
    return this.constructor.MIN_DIMENSIONS;
  }

  setPosition(position = {}) {
    const min = this._minDimensions();
    const clamped = { ...position };
    if (typeof clamped.width  === "number" && clamped.width  < min.width)  clamped.width  = min.width;
    if (typeof clamped.height === "number" && clamped.height < min.height) clamped.height = min.height;
    return super.setPosition(clamped);
  }
```

- [ ] **Step 4: Live-verify spec sheet clamp**

Open `http://192.168.1.7:30000/` → open a specialization item. Drag the
bottom-right resize handle as far inward as possible. Expected: window stops
shrinking at 700×600. Check `ui.activeWindow.position` in DevTools console:
`width: 700, height: 600`.

- [ ] **Step 5: Live-verify character sheet clamp**

Open a character. Drag resize handle as far in as possible. Expected:
stops at 300×200 (or whatever the inherited default produces). Layout
should remain legible — if it doesn't, bump the default `MIN_DIMENSIONS`
in `FFGDocumentSheetV2`. Record the value used.

- [ ] **Step 6: Live-verify a small popup**

Open a RollBuilder (any skill roll) or Destiny Tracker. Drag inward.
Expected: stops at 300×200. If the popup is intentionally smaller in its
opened state, the clamp won't shrink it below its current size — but it
should still prevent shrinking past the minimum.

- [ ] **Step 7: Commit**

```bash
git add modules/sheets/document-sheet-v2-compat.js modules/items/item-sheet-ffg.js modules/apps/form-application-v2-compat.js
git commit -m "$(cat <<'EOF'
Clamp setPosition to per-type minimum dimensions

ApplicationV2's setPosition writes width/height unconditionally; user
could drag the specialization tree resize handle down to ~20x20 and
the sheet became unusable.

Add _minDimensions() and a setPosition override on both
FFGDocumentSheetV2 and FormApplicationV2Compat. Base default
300x200; ItemSheetFFG overrides to 700x600 for specialization,
forcepower, and signatureability (the three tree-grid item types
that need the floor area to stay readable).

Verified live: specialization, forcepower, and sigability all stop
at 700x600; character sheet stops at 300x200; RollBuilder honoured.
EOF
)"
```

---

## Cluster C — CSS

### Task C1: Fix specialization modifier list overflow

**Files:**
- Diagnose: `templates/items/dialogs/ffg-modification.html`, related SCSS.
- Modify: `scss/components/_specializations.scss` or `_talents.scss` (the file containing the modifier-list rules).

**What this fixes:** User issue #7 — specialization modifiers list overflow.

- [ ] **Step 1: Repro and identify the overflowing element**

Open a specialization with several learned talents that each have multiple
modifiers (a Force-tradition specialization works well). Click a talent's
gear icon to open the modifier dialog. Identify the element that overflows
its parent — use DevTools "Inspect" on a row that's outside the dialog's
`.window-content` bounds. Record:

- The overflowing element's selector chain.
- Its computed `flex`, `min-height`, `overflow` values.
- The first parent in the chain that does NOT have `min-height: 0`.

- [ ] **Step 2: Add the missing min-height + overflow**

In the SCSS file containing rules for the identified parent (`grep -rn` on
the selector — most likely `scss/components/_specializations.scss` or
`scss/components/_talents.scss`), add:

```scss
.<parent-selector> {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.<scroll-child-selector> {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
```

Replace `<parent-selector>` and `<scroll-child-selector>` with the actual
class names from Step 1. Do NOT use `!important` unless V13's `applications`
cascade layer specifically wins (per the prior handoff's third-pass Sheet
Options work pattern); test without first.

- [ ] **Step 3: Rebuild SCSS if necessary**

If the project compiles SCSS on the fly (Foundry's default), no rebuild
needed. If a pre-build is required, check `package.json` and run the build
command. Reload the Foundry world (F5 in the browser).

- [ ] **Step 4: Live-verify**

Open the same specialization → open the modifier dialog. Expected: list
scrolls inside its container; no overflow into `.window-content` or beyond.

- [ ] **Step 5: Commit**

```bash
git add scss/components/<file>.scss
git commit -m "$(cat <<'EOF'
Fix specialization modifier list overflow

The modifier list's flex parent had no min-height:0, so its
overflow-y:auto never engaged and rows pushed beyond .window-content.
Same pattern as the character-sheet gray-strip fix (2c9f9a2b).

Verified live on a Force-tradition specialization with 6+ learned
talents.
EOF
)"
```

---

### Task C2: Enlarge modifier description input

**Files:**
- Modify: one of:
  - `templates/items/dialogs/ffg-modification.html:10`
  - `templates/items/dialogs/ffg-embedded-talent.html:16`
  - `templates/items/dialogs/ffg-embedded-upgrade.html:16`
- Modify: SCSS file scoped to the chosen partial.

**What this fixes:** User issue #8 — specialization description modifier
text area is too small.

- [ ] **Step 1: Repro and identify the partial**

Open the same specialization. Click into the modifier panel the user is
complaining about (likely the per-mod description). Use DevTools "Inspect"
on the cramped input → check its `name` attribute. Cross-reference with the
three candidate partials:

| Partial | name attribute |
|---|---|
| `ffg-modification.html` | `system.itemmodifier[N].system.description` |
| `ffg-embedded-talent.html` | `description` |
| `ffg-embedded-upgrade.html` | `description` |

Pick the matching one.

- [ ] **Step 2: Swap input → textarea**

In the chosen partial, replace the `<input type="text" name="…">` line. For
`ffg-modification.html` (line 10) the replacement is:

```hbs
<textarea
  class="modifier-description"
  name="system.itemmodifier[{{number}}].system.description"
  rows="4">{{ mod.system.description }}</textarea>
```

For `ffg-embedded-talent.html` (line 16):

```hbs
<textarea
  class="modifier-description"
  name="description"
  rows="4">{{ data.clickedObject.description }}</textarea>
```

For `ffg-embedded-upgrade.html` (line 16): same shape as the talent one,
with `data.clickedObject.description`.

- [ ] **Step 3: Add the scoped SCSS**

In `scss/components/_specializations.scss` (or whichever SCSS file styles
the chosen dialog — `grep -rn 'flat_editor' scss/` should reveal it), add:

```scss
.flat_editor .modifier-description,
.starwarsffg.sheet .modifier-description {
  flex: 1 1 auto;
  min-height: 8em;
  width: 100%;
  resize: vertical;
}
```

- [ ] **Step 4: Live-verify**

Reload (F5). Reopen the same modifier panel. Expected: description area
fills the available vertical space; typing scrolls inside the textarea, not
the dialog.

- [ ] **Step 5: Commit**

```bash
git add templates/items/dialogs/<file>.html scss/components/<file>.scss
git commit -m "$(cat <<'EOF'
Enlarge modifier description input to flex-filling textarea

Replaces the cramped single-line <input> at <partial>:<line> with a
<textarea class="modifier-description"> that flex-fills the dialog.
The long-standing TODO in modules/items/item-editor.js:9 explicitly
flagged this as a V1-era limitation; this is the smaller fix
(textarea, not full ProseMirror) that resolves the user-visible
space issue without taking on cross-instance state management.

Other candidate partials (ffg-embedded-talent.html /
ffg-embedded-upgrade.html / ffg-modification.html) carry the same
pattern; they get the same swap in a follow-up commit if the user
reports them.
EOF
)"
```

---

## Cluster D — Render-race

### Task D1.a: Replace `_submitting` early-return with submit-coalesce loop

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js:455-473` (`_onSubmit`)
- Modify: `modules/sheets/document-sheet-v2-compat.js:437-453` (`_onChangeInput` — fix editor guard)
- Modify: `modules/apps/form-application-v2-compat.js:262-296` (mirror coalesce on `FormApplicationV2Compat`)

**What this fixes:** User issues #3, #5, #6, #9 root cause — concurrent
submits dropping mid-interaction clicks.

- [ ] **Step 1: Fix the editor guard in `_onChangeInput`**

In `modules/sheets/document-sheet-v2-compat.js`, line 437-453, replace the
current method body. Find:

```js
  _onChangeInput(event) {
    const target = event.currentTarget;
    if (target?.closest?.(".editor.prosemirror, .editor.tinymce")) return;
```

Replace with:

```js
  _onChangeInput(event) {
    // FIX: the listener is attached to the form (line 220), so currentTarget
    // is the form itself, never an editor. The guard must look at the actual
    // event.target (the changed input) to detect ProseMirror/TinyMCE changes.
    const input = event.target;
    if (input?.closest?.(".editor.prosemirror, .editor.tinymce")) return;
```

The rest of the method (the color/range handling and the final
`if (this.options.submitOnChange) return this._onSubmit(event);`) is
unchanged. Verify by re-reading lines 437-453 after the edit.

- [ ] **Step 2: Replace `_onSubmit` with the coalesce loop**

In `modules/sheets/document-sheet-v2-compat.js`, line 455-473, replace the
full method. Find:

```js
  async _onSubmit(event, { updateData = null, preventClose = false, preventRender = false, render = true } = {}) {
    event?.preventDefault?.();
    if (!this.form || !this.isEditable || this._submitting) return false;

    this._submitting = true;
    const formData = this._getSubmitData(updateData);
    const priorState = this._state;
    if (preventRender) this._state = 1;

    try {
      await this._updateObject(event, formData, { render });
    } finally {
      this._submitting = false;
      if (preventRender) this._state = priorState;
    }

    if (this.options.closeOnSubmit && !preventClose) await this.close({ submit: false, force: true });
    return formData;
  }
```

Replace with:

```js
  async _onSubmit(event, options = {}) {
    let { updateData = null, preventClose = false, preventRender = false, render = false } = options;
    event?.preventDefault?.();
    if (!this.form || !this.isEditable) return false;

    // Coalesce concurrent submits. The previous _submitting early-return
    // dropped a click that arrived while a previous update was awaiting --
    // exactly the spec-tree multi-click checkbox bug. Instead, set a
    // pending request and return the in-flight promise so the caller waits
    // for the flushed pending submit to complete.
    //
    // Critical: returning early without `_submitInFlight` would let
    // callers like close() / _saveEditor proceed to DOM teardown while
    // the original submit is still extracting form data, racing the
    // teardown against the extraction. Return the in-flight promise to
    // preserve the caller's "submit completed before I keep going"
    // invariant.
    if (this._submitting) {
      this._submitPending = { updateData, preventClose, render };
      return this._submitInFlight;
    }

    this._submitting = true;
    let formData;
    let currentRender = render;
    let currentPreventClose = preventClose;
    const priorState = this._state;
    if (preventRender) this._state = 1;

    let resolveFlush;
    let rejectFlush;
    this._submitInFlight = new Promise((res, rej) => { resolveFlush = res; rejectFlush = rej; });

    let iter = 0;
    try {
      do {
        if (iter++ > 8) {
          console.warn("starwarsffg | _onSubmit coalesce loop exceeded 8 iterations; bailing");
          break;
        }
        this._submitPending = null;
        formData = this._getSubmitData(updateData);
        await this._updateObject(event, formData, { render: currentRender });
        // If a pending submit was registered while we awaited, carry its
        // intent forward to the next iteration. render: true wins over
        // false; preventClose: false wins over true.
        if (this._submitPending) {
          if (this._submitPending.render) currentRender = true;
          if (!this._submitPending.preventClose) currentPreventClose = false;
          updateData = this._submitPending.updateData ?? updateData;
        }
      } while (this._submitPending);

      if (this.options.closeOnSubmit && !currentPreventClose) {
        await this.close({ submit: false, force: true });
      }
      resolveFlush(formData);
      return formData;
    } catch (err) {
      rejectFlush(err);
      throw err;
    } finally {
      this._submitting = false;
      this._submitInFlight = null;
      if (preventRender) this._state = priorState;
    }
  }
```

- [ ] **Step 3: Mirror on `FormApplicationV2Compat`**

In `modules/apps/form-application-v2-compat.js`:

First, fix the editor guard in `_onChangeInput` (line 262-276): change
`const target = event.currentTarget;` followed by
`if (target?.closest?.(".editor…"))` to use `event.target`:

```js
  _onChangeInput(event) {
    const input = event.target;
    if (input?.closest?.(".editor.prosemirror, .editor.tinymce")) return;
    // … existing range mirroring …
    if (this.options.submitOnChange) return this._onSubmit(event);
  }
```

Then replace `_onSubmit` (line 278-296) with the same coalesce-loop shape
including the in-flight promise. `FormApplicationV2Compat._updateObject`
takes 2 args (line 306), so we don't thread `render` to it — but we still
need the in-flight promise for callers like the inner item-editor save
flows that await `_onSubmit` and then immediately tear down DOM.

```js
  async _onSubmit(event, options = {}) {
    let { updateData = null, preventClose = false, preventRender = false } = options;
    event?.preventDefault?.();
    if (!this.form || !this.isEditable) return false;

    if (this._submitting) {
      this._submitPending = { updateData, preventClose };
      return this._submitInFlight;
    }

    this._submitting = true;
    let formData;
    let currentPreventClose = preventClose;
    const priorState = this._state;
    if (preventRender) this._state = 1;

    let resolveFlush;
    let rejectFlush;
    this._submitInFlight = new Promise((res, rej) => { resolveFlush = res; rejectFlush = rej; });

    let iter = 0;
    try {
      do {
        if (iter++ > 8) {
          console.warn("starwarsffg | _onSubmit coalesce loop exceeded 8 iterations; bailing");
          break;
        }
        this._submitPending = null;
        formData = this._getSubmitData(updateData);
        await this._updateObject(event, formData);
        if (this._submitPending) {
          if (!this._submitPending.preventClose) currentPreventClose = false;
          updateData = this._submitPending.updateData ?? updateData;
        }
      } while (this._submitPending);

      if (this.options.closeOnSubmit && !currentPreventClose) {
        await this.close({ submit: false, force: true });
      }
      resolveFlush(formData);
      return formData;
    } catch (err) {
      rejectFlush(err);
      throw err;
    } finally {
      this._submitting = false;
      this._submitInFlight = null;
      if (preventRender) this._state = priorState;
    }
  }
```

- [ ] **Step 4: Live-verify coalescing on a benign sheet**

Open a weapon sheet. In the Name field, rapidly type a new name (5+
characters quickly). Open DevTools console; the weapon update should fire
either once (if all keystrokes coalesce into a single `change` event from
the form's perspective) or twice at most (initial + one catch-up). It must
NOT fire 5+ times.

In Chrome console:
```js
const item = game.items.find(i => i.type === "weapon");
const before = item.name;
Hooks.on("updateItem", (doc) => { if (doc === item) console.log("[diag] updateItem fired:", doc.name); });
// Now type rapidly in the weapon sheet name field.
```

Expected: 1-2 console lines, final value reflects the last typed character.

- [ ] **Step 5: Live-verify the multi-click checkbox fix**

Open a specialization. Find a talent with `canPurchase` false (so the
checkbox toggle is a pure islearned write, not a purchase flow — for a
purchase flow see D1.b). As a GM, rapidly click an `islearned` checkbox 3
times. Expected: final state matches the parity of click count (3 clicks
on a false → true checkbox lands as true), and no click is silently
dropped. Confirm via console:

```js
const spec = game.items.find(i => i.type === "specialization");
// Read spec.system.talents.talent0.islearned before and after the clicks.
```

- [ ] **Step 6: Commit**

```bash
git add modules/sheets/document-sheet-v2-compat.js modules/apps/form-application-v2-compat.js
git commit -m "$(cat <<'EOF'
Coalesce concurrent submits instead of dropping them

The _submitting early-return swallowed any change that arrived while
a previous update was awaiting. Spec-tree multi-click checkbox bug
reproduced exactly this: click 1 starts a submit, click 2 sets the
DOM and fires change, _onSubmit early-returns, then click 1's auto-
render redraws the DOM back to click 1's state -- click 2 silently
disappears.

Replace with a coalesce loop: while a submit is running, set
_submitPending; the in-flight submit re-reads getSubmitData() and
re-runs until no pending requests remain. Captures the post-second-
click form state instead of dropping it. Guarded with an 8-iteration
ceiling to surface bugs if the loop ever fails to converge.

Critical lifecycle detail: store the in-flight promise as
_submitInFlight and return it from the early-return path. Callers
like close() / _saveEditor await _onSubmit and then immediately tear
down DOM or editor state. Returning early without the in-flight
promise would let them proceed while the original submit is still
extracting form data -- racing teardown against extraction. Returning
the in-flight promise preserves the "submit completed before caller
keeps going" invariant; coalesced pending submits flush as part of
the same promise chain so the caller waits for the full flush.

Also fix the editor guard in _onChangeInput on both
FFGDocumentSheetV2 and FormApplicationV2Compat: the listener is
attached to the form, so event.currentTarget is the form itself,
never an editor. Use event.target instead.

Verified live: rapid 5-char name change on weapon sheet fires 1-2
updates not 5+, multi-click checkbox parity preserved, close after
a rapid typing burst completes only after the final pending submit
has flushed (no orphaned DOM-teardown errors).
EOF
)"
```

---

### Task D1.b: Thread `{ render }` through update overrides and helpers

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js:493-495` (base `_updateObject` already has `{ render }` — verify)
- Modify: `modules/actors/actor-sheet-ffg.js:1968-1975` (`ActorSheetFFG._updateObject`)
- Modify: `modules/items/item-sheet-ffg.js:1717` (`ItemSheetFFG._updateObject`)
- Modify: `modules/helpers/actor-helpers.js:21-68` (`ActorHelpers.updateActor`)
- Modify: `modules/helpers/item-helpers.js:4-83` (`ItemHelpers.itemUpdate`)

**What this fixes:** User issues #3, #5, #6, #9 — without this, D1.a's
`render: false` flag is dropped at the subclass-override boundary and the
auto-rerender hook still fires.

- [ ] **Step 1: Verify the base `_updateObject` already accepts `{ render }`**

Read `modules/sheets/document-sheet-v2-compat.js:493-495`. Confirm the
signature is:

```js
  async _updateObject(_event, formData, { render = true } = {}) {
    return this.document.update(formData, { render });
  }
```

If `render` defaults to `true`, change it to `false` to match D1.a's new
default. Test by checking that explicit save flows (e.g. a button that
calls `this.submit()`) still produce visible re-renders — they should
because the legacy helpers' explicit `this.render(true)` calls fire after
the document.update completes.

- [ ] **Step 2: Update `ActorSheetFFG._updateObject` signature**

In `modules/actors/actor-sheet-ffg.js:1968`, find:

```js
  async _updateObject(event, formData) {
    const actorUpdate = ActorHelpers.updateActor.bind(this);
    this.sheetWidth = this.position.width;
    this.sheetHeight = this.position.height;

    await actorUpdate(event, formData);
  }
```

Replace with:

```js
  async _updateObject(event, formData, { render = false } = {}) {
    const actorUpdate = ActorHelpers.updateActor.bind(this);
    this.sheetWidth = this.position.width;
    this.sheetHeight = this.position.height;

    await actorUpdate(event, formData, { render });
  }
```

- [ ] **Step 3: Update `ItemSheetFFG._updateObject` signature**

In `modules/items/item-sheet-ffg.js:1717`, find:

```js
  _updateObject(event, formData) {
    if(this.actor && !this.actor?.verifyEditModeIsNotEnabled()) return;
```

Change the signature:

```js
  async _updateObject(event, formData, { render = false } = {}) {
    if(this.actor && !this.actor?.verifyEditModeIsNotEnabled()) return;
```

(Add `async` keyword if missing — the helper call below awaits it.)

Then find the final line of that method's body that calls into the helper.
Search for `ItemHelpers.itemUpdate.call(this, event, formData)` or similar.
If the call passes only two args, change to:

```js
return ItemHelpers.itemUpdate.call(this, event, formData, { render });
```

If the method instead does `await this.object.update(formData)` somewhere
(not via the helper), thread `{ render }` to that call:

```js
await this.object.update(formData, { render });
```

Read the full method (likely lines 1717 to ~1745) carefully and adjust
each `update` / `helper` call. Document the exact lines changed.

- [ ] **Step 4: Update `ActorHelpers.updateActor` — signature AND explicit-render gating**

In `modules/helpers/actor-helpers.js`, find the method (starts around line 21,
ends at line 68). Change the signature:

```js
  static async updateActor(event, formData, { render = false } = {}) {
```

Change the final `document.update` call (line 67):

```js
    return await this.object.update(formData, { render });
```

Then audit the rest of the method body for any explicit `this.render(true)`
/ `this.sheet.render(true)` calls and gate them on `render`. If the audit
script in D1.c Step 1 returns no hits in `actor-helpers.js`, this gating
step is a no-op here — but DO check, because any unconditional render
defeats D1's purpose.

- [ ] **Step 5: Update `ItemHelpers.itemUpdate` — signature AND explicit-render gating**

In `modules/helpers/item-helpers.js`, find the method at line 4. Change the
signature:

```js
  static async itemUpdate(event, formData, { render = false } = {}) {
```

Thread `{ render }` to the primary `document.update` call at line 41:

```js
    await this.object.update(formData, { render });
```

**This is not enough on its own.** Line 44 currently has an unconditional
`await this.render(true);` that fires AFTER `document.update`. With the
auto-render hook now suppressed, this explicit call becomes the SOLE
source of the DOM swap, and the mid-interaction race the user is
reporting in spec-tree multi-click and weapon dropdowns is unchanged.
The render flag must gate this call:

```js
    await this.object.update(formData, { render });
    await ItemHelpers.syncAEStatus(this.object, this.object.getEmbeddedCollection("ActiveEffect"));
    if (render) await this.render(true);
```

The downstream cross-doc propagation block (lines 46-84) calls
`item.sheet.render(true)` at line 76 and `spec.sheet.render(true)` at
line 80. These write to OTHER documents (the propagated talent's
container item or its parent specialization). Their sheets DO need to
refresh when the propagated data changes, AND they aren't the sheet
the user is currently interacting with — so they can't race the user's
in-flight click. Leave those two `sheet.render(true)` calls in place.

The career-skills branch starting at line 85 may also have render calls
— audit and gate any that target `this` (current sheet), leave any that
target OTHER docs unchanged.

- [ ] **Step 5a: Spot-check the audit covered every `this.render` in the helper**

```bash
grep -nE "this\.render|\.sheet\.render" modules/helpers/item-helpers.js modules/helpers/actor-helpers.js
```

For each hit, classify in a comment in the commit body:

- `this.render(...)` on the current sheet → gated on `render` flag.
- `<otherDoc>.sheet.render(...)` → unchanged (different sheet, no race).
- `<otherDoc>.render(...)` (rendering a document) → these don't exist on
  Foundry docs; should be `.sheet.render`. Flag any irregularity.

- [ ] **Step 6: Live-verify both layers of render suppression**

In Chrome console on the running server:

```js
const item = game.items.find(i => i.type === "weapon");
let renderCount = 0;
const originalRender = item.sheet.render.bind(item.sheet);
item.sheet.render = function(...args) { renderCount++; console.log("[diag] sheet.render call", renderCount, args); return originalRender(...args); };
// Open the weapon sheet, change the name field, blur.
```

Expected: `[diag] sheet.render call 1` from the explicit render on sheet
open, then ZERO additional `sheet.render` calls from the name change.
Two things have to be true for zero:

1. `{ render: false }` reaches `document.update` (the auto-render hook
   stays silent). Verified by the override-signature changes in Steps 2/3.
2. `ItemHelpers.itemUpdate`'s explicit `this.render(true)` at line 44 is
   gated and does NOT fire when `render: false`. Verified by Step 5.

If you see one extra render call, either the gating was missed in the
helper OR a subclass override dropped the flag. Trace by adding a
console.log inside `ItemHelpers.itemUpdate` right before the gated
`if (render)` block.

- [ ] **Step 7: Live-verify the weapon dropdown stays open**

Open a weapon sheet. Click any `<select>` (e.g. Skill, Range, Damage Type).
Expected: dropdown opens and stays open until the user clicks a choice or
clicks away. No mid-interaction close.

- [ ] **Step 8: Live-verify the buy-talent button race**

Open a specialization on a character that has enough XP to buy a talent.
Click the "Buy" (purchase) icon on a `canPurchase: true` talent. Step
through the DialogV2 prompt. Expected: dialog closes once; the talent's
checkbox is now checked; no console error about a stale handler or a
missing element. Repeat 3 times on different talents in rapid succession
(buy talent 1, dismiss XP popup, immediately buy talent 2, etc.). All
purchases should land cleanly.

- [ ] **Step 9: Live-verify the spec tree closes reliably**

With a spec sheet open, edit a field (e.g. the spec name), then click ×.
Expected: sheet closes cleanly. Repeat with the modifier panel open and
unsaved. Confirm no "ghost" sheet remains and no console error.

- [ ] **Step 10: Commit**

```bash
git add modules/sheets/document-sheet-v2-compat.js modules/actors/actor-sheet-ffg.js modules/items/item-sheet-ffg.js modules/helpers/actor-helpers.js modules/helpers/item-helpers.js
git commit -m "$(cat <<'EOF'
Thread { render } through update overrides and gate helper renders

D1.a's render-suppression at FFGDocumentSheetV2._onSubmit was being
dropped at TWO points:

1. Subclass-override boundary: ActorSheetFFG._updateObject and
   ItemSheetFFG._updateObject only declared 2 params, so the base's
   { render } third arg never reached the helpers.
2. Helper-level explicit render: ItemHelpers.itemUpdate calls
   this.render(true) unconditionally at line 44, AFTER the document
   update. Threading { render } only to document.update would
   suppress the auto-render hook but the explicit render would still
   fire -- DOM swap mid-interaction unchanged. The user's spec-tree
   multi-click and weapon-dropdown symptoms would persist.

Add { render = false } third parameter to both overrides and to the
two helpers. Forward to this.object.update(formData, { render }) AND
gate every helper-issued this.render(...) on the same flag. Cross-doc
propagation writes (item.update / spec.update at item-helpers.js:75/79)
target DIFFERENT documents and can't race the user's in-flight click,
so their sheet.render(true) calls stay unchanged.

Verified live: weapon name-field change produces zero auto-renders
(was producing one per change with the prior draft), weapon dropdowns
stay open through selection, buy-talent flow runs cleanly under rapid
repeated use, spec tree closes reliably even with unsaved modifier-
panel content.
EOF
)"
```

---

### Task D1.c: Audit sheet-level `this.render(true)` calls and patch cross-field reactivity

**Files:**
- Modify (potentially): `modules/items/item-sheet-ffg.js`, `modules/actors/actor-sheet-ffg.js`.
- Helpers (`item-helpers.js`, `actor-helpers.js`) are already covered by D1.b's gating step; this task focuses on the sheets themselves and on listeners that previously depended on the auto-render hook to redraw conditional UI.

**What this fixes:** Listeners that mutated form state and relied on the
now-suppressed auto-render to re-show / re-hide conditional fields
(e.g. the `ranks.ranked` checkbox on a talent unhides the rank-input
field). With D1.b, those flows render zero times by default; explicit
`this.render(false)` calls have to be added back where cross-field
reactivity was previously implicit.

- [ ] **Step 1: Build the audit list**

Run:

```bash
grep -nE "this\.render\b|sheet\.render\b" modules/items/item-sheet-ffg.js modules/actors/actor-sheet-ffg.js
```

Record every match. Expected: handful of sites in each file. For each,
read the surrounding 10 lines.

- [ ] **Step 2: Classify each sheet-level call-site**

For each match, decide:

- **KEEP** — fires after a structural change the auto-render wouldn't
  cover correctly. E.g. cross-doc refresh, or a side-effecting branch
  that already passes `render: true` to its update.
- **REMOVE** — was compensating for the auto-render and is now redundant
  with the explicit save-button flow. Such a call AFTER a
  `document.update(formData, { render: true })` is a double-render.

The likely outcome: most current sheet-level calls are KEEP, because the
sheets historically passed updates straight to `document.update` (no
{ render: false }) and relied on the auto-render. The handful of sites
that explicitly called `this.render(true)` AFTER an auto-rendering
update were the double-render bugs hidden by the timing race; remove
those.

- [ ] **Step 3: Find cross-field reactivity listeners that need explicit re-render**

Several listeners change a field's value AND expect a sibling field to
appear/disappear/relabel on the next render. With auto-render now
suppressed for the change pipeline, these stop working unless they
explicitly request a re-render after the update.

Known candidates (verify each by repro):

- `ranks.ranked` checkbox on a talent (`templates/items/ffg-talent-sheet.html:15-17`)
  unhides `ranks.current`. After toggle: the rank-input field should
  appear. Test on a talent item; if it doesn't, add an explicit
  `await this.render(false)` to the change handler.
- `data.activation.value` dropdown on a talent — may relabel the
  activation badge text. Test on the spec tree (the talent's tile
  reads `talent.activationLabel`).
- Any `sheet.actor.system.skills` mutation on the character sheet that
  shows/hides skill rows.

For each broken case, find the corresponding listener in
`activateListeners` of the relevant sheet file. Add right after the
field update:

```js
$(html).find(`[name="data.ranks.ranked"]`).on("change", async () => {
  await this.submit();
  await this.render(false);  // explicitly redraw to reflect sibling visibility
});
```

If the field is currently bound only via `submitOnChange:true` (i.e. no
explicit listener), add one in `activateListeners` for the specific
selector that needs reactivity.

- [ ] **Step 4: Apply REMOVE classifications**

For each call-site marked REMOVE in Step 2, delete the line. Clean up
any surrounding dead code.

- [ ] **Step 5: Live-verify no regression**

Reload the running world. Spot-check the same surfaces as D1.b's
Steps 6-9. Plus:

- Edit a field on the character sheet → tab away. Sheet should reflect
  the change after a single render frame, not zero frames (no stuck
  UI) and not two frames (no double-render stutter).
- Toggle `ranks.ranked` on a talent → rank-input field appears.
- Toggle off → rank-input disappears.

- [ ] **Step 6: Commit**

```bash
git add modules/items/item-sheet-ffg.js modules/actors/actor-sheet-ffg.js
git commit -m "$(cat <<'EOF'
Audit sheet-level renders and add explicit cross-field reactivity

After D1.b gated helper-issued this.render(true) on the { render }
flag, listeners that depended on the auto-render hook to redraw
conditional UI need their own explicit this.render(false) calls.

Found cross-field reactivity gaps:
- <list>: needed explicit render after change.

Found redundant double-renders to prune:
- <list, or "none">.

Live-verified no stutter on field edits and that conditional fields
(ranks.current under ranks.ranked, etc.) reappear after toggle.

Live-verified no regression on field-edit, ranks.ranked toggle,
spec-tree state changes, and cross-sheet propagation flows.
EOF
)"
```

If no calls were removed, commit anyway with a body noting "audit only,
no changes" so the audit decision is logged for future maintainers.

---

## Cluster E — Talent sheet investigation

### Task E1: Diagnose and fix the talent sheet

**Files:** depends on diagnosis; candidates listed in Step 4 below.

**What this fixes:** User issue #4 — talent sheet totally broken.

- [ ] **Step 1: Re-confirm the symptom post-Cluster-A/B/C/D**

Open `http://192.168.1.7:30000/` → open a talent item from the world or a
compendium. With A1 (editors), A2 (dblclick), B1 (min-size), C1/C2 (CSS),
and D1 (render-race) all landed, the talent sheet's pre-existing breakage
may already be fully or partially resolved. Capture a fresh full-window
screenshot.

- [ ] **Step 2: Compare to baseline**

Diff against the Task 0 baseline screenshot. List remaining symptoms.

- [ ] **Step 3: Capture console state**

With the talent sheet open, in Chrome console:

```js
const app = ui.activeWindow;
console.log({
  type: app.constructor.name,
  position: { ...app.position },
  isEditable: app.isEditable,
  editors: Object.keys(app.editors),
  tabs: app._tabs?.map(t => ({ active: t.active })),
});
console.log("rendered HTML root:", app.element);
```

Capture the full output. Walk the four tabs (description, attributes,
sources, tags) and report any tab that fails to switch, render content, or
respond to controls.

- [ ] **Step 4: Match symptom to pre-mapped fix**

Each likely outcome maps to a specific fix:

| Symptom | Fix |
|---|---|
| Description empty, button does nothing | Already resolved by A1; re-run A1 Step 4. |
| Sheet renders but tab switching dead | `Tabs` instance not bound. Check `_activateCoreListeners` ran. Likely regression from D1; trace `this._tabs` after `_onRender`. |
| Window resizes to nothing / layout collapsed | Small fixed dimensions (405×535, `item-sheet-ffg.js:191-193`) interact with `flex: 1 1 auto; min-height: 0` from the gray-strip fix. Either bump talent default size, or scope the flex rule away from item sheets. |
| Modifiers tab broken | `popoutModiferWindow` call in `activateListeners` at `item-sheet-ffg.js:922` opens an old helper not V2-aware. Wrap in a V2-compat launcher. |
| Source / Tags tabs unresponsive | Controls in shared partials (`templates/parts/shared/ffg-sources.html`, `ffg-tags.html`) not bound. Audit which event handlers they expect and add bindings. |

- [ ] **Step 5: Apply the matching fix**

For each remaining symptom, locate the file from the table above, make the
targeted change, and live-verify before moving to the next symptom.

If the symptom is "layout collapsed":

```js
// In modules/items/item-sheet-ffg.js:191-193, change:
case "talent":
  if (setInitialSize) {
    this.position.width = 405;
    this.position.height = 535;
  }
// To:
case "talent":
  if (setInitialSize) {
    this.position.width = 450;
    this.position.height = 600;
  }
```

If the symptom is "modifiers tab broken", grep for `popoutModiferWindow` to
find its definition and adjust it to use `DialogV2Compat` if it isn't
already. The exact change is implementation-dependent; document it in the
commit body.

- [ ] **Step 6: Live-verify each tab**

Open the talent sheet. For each tab:

- Description: editor mounts and saves (validates A1 still works on this
  sheet).
- Attributes (Modifiers): list renders; add / remove modifier buttons
  respond; modifier-edit gear icon opens the modifier dialog with the
  textarea fix from C2.
- Sources: shows the source field and book/page inputs; values save.
- Tags: shows tag chips; add/remove responds.

- [ ] **Step 7: Commit**

```bash
git add <files-actually-touched>
git commit -m "$(cat <<'EOF'
Fix talent sheet <symptom list>

Post-Cluster-A/B/C/D, the remaining talent-sheet symptoms were:
<symptom 1>, <symptom 2>, ...

Cause: <root cause(s)>
Fix: <files and changes>
Verified: each of the four tabs (description, attributes, sources,
tags) now renders, saves, and responds.
EOF
)"
```

---

## Post-flight

### Task Z: Full integration smoke pass

**Files:** none (verification only).

- [ ] **Step 1: Cross-sheet sweep**

Open one of each sheet type and walk through the basic interactions:
character, minion, rival, nemesis, vehicle, weapon, armour, gear, talent,
forcepower, specialization, signatureability, ability, itemmodifier,
itemattachment, criticalinjury.

For each:
- Open via the items / actors directory.
- Walk the tabs.
- Edit one field, blur, reopen → field persisted.
- Edit one description editor → save → reopen → persisted.
- Resize the window → respects the type's min dimensions.
- Close via × → closes cleanly, no console error.

- [ ] **Step 2: Play-loop sanity**

- Skill roll from a character sheet → RollBuilderFFG opens, rolls produce
  a chat card.
- Specialization purchase flow → end-to-end.
- DestinyTracker, GroupManager: open / close cleanly.

- [ ] **Step 3: Test suite**

Run:

```bash
npm test
```

Expected: `tests/talent-tree.test.js` passes. No other tests exist; this is
the canary that pure helper logic wasn't broken by any of the changes.

- [ ] **Step 4: Final commit and handoff doc**

If any small follow-ups surfaced during the smoke pass, address them in
one final commit. Then write a new session handoff doc at
`docs/superpowers/plans/2026-06-01-v2-port-session-handoff.md` (or
appropriate date) summarizing what landed in this plan. Commit and the
branch is ready for user review.

```bash
git add docs/superpowers/plans/<handoff-doc>.md
git commit -m "Add V2-port known-issues session handoff"
```

---

## Out of scope (per spec)

- V2 actions API migration.
- Module compatibility audit.
- `absolute` vs `fixed` positioning carry-over.
- `FORM` vs `SECTION` `.window-content` structural difference audit.
