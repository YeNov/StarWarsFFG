# V2-port layout follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the ten follow-up issues identified after the initial V1→V2 ApplicationV2 port. The headline `app`/`window-app` + overflow fixes already landed in `ceddd13`; this plan tackles the remaining functional bugs (empty Sheet Options dialog, missing legacy header buttons), the small layout/CSS robustness gaps (form-class scoping, resize-handle class, tab icon weight, title-clip root cause), and a few correctness/consistency cleanups in the compat shims (DialogV2Compat jQuery default, submitOnChange double-fire risk, tab persistence, getData documentation).

**Architecture:** Each issue is fixed in the smallest possible surgical edit to the V2 compat shims (`modules/sheets/document-sheet-v2-compat.js`, `modules/sheets/actor-sheet-v2-compat.js`, `modules/sheets/item-sheet-v2-compat.js`, `modules/apps/dialog-v2-compat.js`, `modules/apps/form-application-v2-compat.js`) or scoped CSS additions to `styles/starwarsffg.css`. No template changes unless explicitly noted. No new abstractions. Tasks are ordered by user-visible severity first, then by file-touch overlap so consecutive tasks share context.

**Tech Stack:** Foundry VTT v13 (ApplicationV2 + HandlebarsApplicationMixin + DocumentSheetV2 + DialogV2), vanilla JS modules, Handlebars templates, jQuery (provided by Foundry), starwarsffg system v2.0.3.

**Spec source:** This plan replaces a list maintained in the live chat session — there is no separate design doc. Each task captures the spec inline.

**Verification model:** No automated UI tests for this codebase. Every task ends with a *manual smoke test* against a running Foundry instance (the developer's local server). The smoke procedure is described once in Task 0 and referenced thereafter.

---

## File map

- **Modify:** [`modules/sheets/document-sheet-v2-compat.js`](../../../modules/sheets/document-sheet-v2-compat.js) — V2 base for actor & item sheets. Touched by Tasks 2, 4, 5, 6, 8.
- **Modify:** [`modules/sheets/actor-sheet-v2-compat.js`](../../../modules/sheets/actor-sheet-v2-compat.js) — touched by Task 1 only if registration timing needs an actor-side hook.
- **Modify:** [`modules/sheets/item-sheet-v2-compat.js`](../../../modules/sheets/item-sheet-v2-compat.js) — no edits expected; used in smoke tests.
- **Modify:** [`modules/apps/dialog-v2-compat.js`](../../../modules/apps/dialog-v2-compat.js) — touched by Tasks 1 (template context) and 7 (jQuery default).
- **Modify:** [`modules/apps/form-application-v2-compat.js`](../../../modules/apps/form-application-v2-compat.js) — touched by Task 8 only.
- **Modify:** [`styles/starwarsffg.css`](../../../styles/starwarsffg.css) — touched by Tasks 3 (title-clip robustness), 4 (form-class scoping note), 5 (resize-handle compat), 9 (tab icon weight).
- **No template changes.**

---

## Task 0: Establish manual smoke-test procedure (one-time setup)

This task does not change code. It captures the verification recipe every later task references.

**Smoke procedure (re-used in every task):**

1. Make the code change and save.
2. In the running Foundry tab (browser), run in DevTools console:
   ```js
   for (const a of foundry.applications.instances.values()) { try { await a.close({submit:false,force:true}); } catch(e){} }
   location.reload();
   ```
3. After the world reloads, in console open the target sheet by id, e.g.:
   ```js
   game.actors.get('GBeW2aKcuQCkk5uE').sheet.render(true);   // character
   game.items.get('pkteoDxUDjZGOU81').sheet.render(true);    // weapon (KD-30F)
   game.actors.get('smJCyyEM0dJAQPyw').sheet.render(true);   // vehicle
   game.actors.get('qzmwhL5lyjOI3Peu').sheet.render(true);   // minion (Akk Dog)
   ```
4. Visually verify the expected behavior, then compare against the V1 baseline by checking out `main`, hard-reloading, and reopening the same sheet. (Stash and restore work-in-progress as needed: `git stash push -u -m wip && git checkout main` then `git checkout V2-port && git stash pop`.)
5. If the test passes, commit (see each task's commit step). If it fails, *do not* commit — diagnose and revise inside the same task.

- [ ] **Step 1: Confirm the smoke procedure works against the existing state.**

Open the character sheet (id `GBeW2aKcuQCkk5uE`) using the procedure above. You should see: title visible, right-side tab strip with FontAwesome icons, characteristics circles, skills grid scrollable. If any of that is broken on the current `V2-port` HEAD, stop and investigate before starting other tasks — something has regressed since `ceddd13`.

- [ ] **Step 2: Bookmark the actor/item IDs above** in your editor or this plan; every task uses them.

No commit for Task 0.

---

## Task 1: Fix empty body in Sheet Options dialog

**Spec:** When the user clicks "Sheet Options" on an actor sheet, the resulting dialog opens with only "Accept" / "Cancel" buttons — no form fields. Registered options (e.g. `enableAutoSoakCalculation`, `enableForcePool`, `medicalItemName`) are missing. Root cause: [`modules/apps/dialog-v2-compat.js:75-83`](../../../modules/apps/dialog-v2-compat.js:75) passes only `this.data.content` (which is `{ options: {...} }`) as the Handlebars context, but the legacy template at [`templates/dialogs/ffg-sheet-options.html`](../../../templates/dialogs/ffg-sheet-options.html) expects the *full* Dialog data object (it iterates `content.options` and `buttons`, mirroring V1's `Dialog` template context).

**Files:**
- Modify: `modules/apps/dialog-v2-compat.js`
- Read-only reference: `templates/dialogs/ffg-sheet-options.html`, `modules/actors/actor-ffg-options.js`

- [ ] **Step 1: Open `modules/apps/dialog-v2-compat.js` and locate `_prepareContent`** (around line 75–83). The current implementation is:

```js
  async _prepareContent() {
    if (this.options.template) {
      return foundry.applications.handlebars.renderTemplate(this.options.template, this.data.content ?? {});
    }

    const content = this.data.content;
    if (content && (typeof content === "object") && !(content instanceof HTMLElement)) return String(content);
    return content ?? "";
  }
```

- [ ] **Step 2: Replace `_prepareContent` so templates receive the full Dialog data (matching V1 `Dialog` behavior), while non-template content is unchanged.**

```js
  async _prepareContent() {
    if (this.options.template) {
      const context = {
        ...this.data,
        content: this.data.content ?? {},
        buttons: this.data.buttons ?? {},
      };
      return foundry.applications.handlebars.renderTemplate(this.options.template, context);
    }

    const content = this.data.content;
    if (content && (typeof content === "object") && !(content instanceof HTMLElement)) return String(content);
    return content ?? "";
  }
```

The spread of `this.data` exposes `title`, `default`, etc.; the explicit defaults for `content` and `buttons` guarantee the template's `{{#each content.options}}` and `{{#each buttons}}` iteration both work.

- [ ] **Step 3: Smoke-test the actor Sheet Options dialog.**

Run the Task 0 procedure with the Akk Dog minion (`qzmwhL5lyjOI3Peu`). Click the `⋮` controls dropdown → "Sheet Options". Expected: dialog opens with three labeled rows ("Enable Soak Calc", "Enable Critical Injuries", "Sort Talents by Activation"), each with a Boolean checkbox or Array select, hint text below, and Accept/Cancel buttons.

Repeat for the character (`GBeW2aKcuQCkk5uE`) — expect five rows including "Medical Item Name" (String input).

- [ ] **Step 4: Smoke-test "Accept" actually persists changes.**

In the dialog, toggle "Enable Soak Calc" off and click Accept. Reopen the dialog: the checkbox should reflect the new state. (This exercises the `controls.find("input, select")` path in `actor-ffg-options.js:35-50`.)

- [ ] **Step 5: Commit.**

```bash
git add modules/apps/dialog-v2-compat.js
git commit -m "$(cat <<'EOF'
Fix empty Sheet Options dialog body on V2 sheets

DialogV2Compat._prepareContent passed only this.data.content as the
Handlebars context, but the legacy ffg-sheet-options template (and any
other V1-era Dialog template) was written against V1's Dialog context,
which exposed content, buttons, title, and default at the top level.
Spread this.data into the context so {{#each content.options}} and
{{#each buttons}} both resolve, restoring V1 behavior.
EOF
)"
```

---

## Task 2: Restore V1-style header text-buttons (Sheet Options, Sheet, Prototype Token, Close)

**Spec:** V1 actor sheets show inline labeled links across the header bar — `🔧 Sheet Options`, `⚙ Sheet`, `👤 Prototype Token`, `× Close`. V13 ApplicationV2 collapses all `header-control` entries into the `⋮` dropdown, hiding labels. We want each control action visible as a labeled `<a>` *next to* (i.e. left of) the V13 control-icon row, without losing the V13 controls themselves (so users can still right-click, etc.). Strategy: in `_onRender`, iterate every `[data-action]` button inside the V13 `controls-dropdown` MENU and append a matching labeled `<a>` to the `.window-header` ahead of the `⋮` toggle. We rebuild the row on every render (cheap, idempotent) so dynamic control changes propagate.

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js`
- Modify: `styles/starwarsffg.css`
- Read-only reference: rendered V13 header DOM (see Step 1)

- [ ] **Step 1: Inspect the V13 header DOM to identify selectors.** In the browser console, with an actor sheet open, run:

```js
const root = game.actors.get('GBeW2aKcuQCkk5uE').sheet.element;
const header = root.querySelector('.window-header');
const dropdown = root.querySelector('menu.controls-dropdown');
console.log('header children:', [...header.children].map(c => c.tagName + '.' + c.className));
console.log('dropdown items:', [...dropdown.querySelectorAll('[data-action]')].map(b => ({ action: b.dataset.action, label: b.textContent.trim(), html: b.innerHTML.slice(0,80) })));
```

Confirm that `menu.controls-dropdown` contains `<li><button data-action="..." ...><i class="..."></i> <Label></button></li>` rows for each action.

- [ ] **Step 2: Open `modules/sheets/document-sheet-v2-compat.js`. Find `_onRender`** (currently around line 177). It ends by invoking `this._activateCoreListeners(html)` and `this.activateListeners(html)`. Add the legacy-header projection step BEFORE `_activateCoreListeners`.

Locate this block:

```js
  async _onRender(context, options) {
    await super._onRender(context, options);

    const form = this.form;
    if (form) {
      this._applyLegacyRootClasses(form, context);
      form.dataset.appid = this.appId;
      form.addEventListener("submit", this._onSubmit.bind(this));
      form.addEventListener("change", this._onChangeInput.bind(this));
    }
    this.element.dataset.appid = this.appId;

    const html = $(form ?? this.element);
    this._activateCoreListeners(html);
    this.activateListeners(html);
  }
```

- [ ] **Step 3: Insert the legacy-header projection just before `this._activateCoreListeners(html);`.**

```js
    this._projectLegacyHeaderControls();

    const html = $(form ?? this.element);
    this._activateCoreListeners(html);
    this.activateListeners(html);
  }
```

- [ ] **Step 4: Add the `_projectLegacyHeaderControls` method** after `_applyLegacyRootClasses` (around line 202). Paste:

```js
  _projectLegacyHeaderControls() {
    const header = this.element.querySelector(":scope > .window-header");
    const dropdown = this.element.querySelector(":scope > menu.controls-dropdown");
    if (!header) return;

    // Remove any previously projected row so consecutive renders stay idempotent.
    header.querySelectorAll(":scope > .legacy-header-action").forEach((el) => el.remove());

    if (!dropdown) return;
    const sources = dropdown.querySelectorAll("button[data-action]");
    if (!sources.length) return;

    const anchor = header.querySelector(":scope > [data-action='toggleControls']") ?? header.lastElementChild;
    for (const button of sources) {
      const action = button.dataset.action;
      const label = button.textContent.trim();
      if (!action || !label) continue;
      const link = document.createElement("a");
      link.className = "legacy-header-action";
      link.dataset.action = action;
      link.innerHTML = `${button.querySelector("i")?.outerHTML ?? ""} <span>${label}</span>`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        button.click();
      });
      header.insertBefore(link, anchor);
    }
  }
```

The `:scope >` qualifiers prevent matching nested forms/menus. Clicking the projected link forwards to the original V13 button, so the action handler/permission checks (which V13 wires onto `controls-dropdown`) still execute.

- [ ] **Step 5: Open `styles/starwarsffg.css`. Add header styling** just after the `.starwarsffg.application.sheet` overflow override block (the block ends with `overflow: visible !important; }` — insert immediately after the closing `}`):

```css
/* V1-style inline labeled header actions, projected from V13's
   controls-dropdown by FFGDocumentSheetV2._projectLegacyHeaderControls. */
.starwarsffg.application.sheet > .window-header > .legacy-header-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 6px;
  padding: 0 2px;
  color: inherit;
  cursor: pointer;
  font-size: 0.85em;
  white-space: nowrap;
}
.starwarsffg.application.sheet > .window-header > .legacy-header-action:hover {
  text-shadow: 0 0 6px var(--color-shadow-highlight, #ffae00);
}
.starwarsffg.application.sheet > .window-header > .legacy-header-action > i {
  font-size: 0.9em;
}
```

- [ ] **Step 6: Smoke-test the header.**

Run the Task 0 procedure with the character sheet. Expected: between the title "Jovel Nial" and the `⋮ 🛂 ×` icon group, you see labeled links (e.g. "🔧 Sheet Options", "🪪 Copy Document ID", "⚙ Configure Sheet"). Clicking each must fire the same behavior as the dropdown entry (e.g. "Configure Sheet" opens the sheet-config dialog).

Also verify the `⋮` dropdown still works (it should — we did not remove or hide it).

- [ ] **Step 7: Smoke-test on a non-actor sheet** to ensure Task 2's shim doesn't break item sheets. Open the weapon sheet (`pkteoDxUDjZGOU81`). Expected: projected links visible for whatever item-level actions V13 surfaces (typically just "Copy Document ID" and "Configure Sheet"); item sheet otherwise unchanged.

- [ ] **Step 8: Commit.**

```bash
git add modules/sheets/document-sheet-v2-compat.js styles/starwarsffg.css
git commit -m "$(cat <<'EOF'
Project V13 controls-dropdown actions into the V2 sheet header

ApplicationV2 collapses every header-control into a ⋮ menu; the V1
sheet style showed each as an inline labeled link. Mirror every button
in controls-dropdown as a sibling .legacy-header-action <a> on the
.window-header. The projection runs in _onRender, removes any prior
row first so it is idempotent across re-renders, and clicks forward to
the original V13 button so permission and action wiring stay intact.
EOF
)"
```

---

## Task 3: Lock in the title-clipping fix with explicit V2 selectors

**Spec:** Adding `app`/`window-app` to the V2 sheet `classes` was sufficient to stop the actor-sheet title from being visually clipped, but we never identified *which* CSS rule (Foundry's own or one of ours) was load-bearing. If a future Foundry version drops `.app` or `.window-app` from its default styling layer, the clipping will regress silently. This task identifies the responsible rule (likely from `foundry2.css` in the `applications` layer), then mirrors it under V2-only selectors in our `system` layer so we no longer depend on the legacy classes being respected.

**Files:**
- Read-only investigation: `foundry2.css` (live, via DevTools)
- Modify: `styles/starwarsffg.css`

- [ ] **Step 1: Identify the load-bearing rule.** Toggle `app` and `window-app` off the live root and observe what breaks:

```js
const root = game.actors.get('GBeW2aKcuQCkk5uE').sheet.element;
const headerName = root.querySelector('.header-name');
console.log('before:', headerName.getBoundingClientRect().toJSON(), getComputedStyle(headerName).getPropertyValue('overflow'));
root.classList.remove('app');
console.log('after remove app:', headerName.getBoundingClientRect().toJSON());
root.classList.remove('window-app');
console.log('after remove window-app:', headerName.getBoundingClientRect().toJSON());
root.classList.add('app','window-app');
```

Note which removal causes the bounding box to shift / be clipped. Then in DevTools' Elements panel, select the affected element (e.g. `.header-name` or `.sheet-header`) and look at the "Computed" tab, expanding the property that changed, to identify the source stylesheet and selector. Record the selector and value here:

> **Finding (fill in during execution):** ___________________________

- [ ] **Step 2: Add an explicit V2-scoped rule** that reproduces the V1 effect under V2 selectors. Open `styles/starwarsffg.css`, locate the `.starwarsffg.application.sheet, .starwarsffg.application.sheet > .window-content { overflow: visible !important; }` block, and append:

```css
/* V13 ApplicationV2 robustness: replicate the V1 .app/.window-app sizing
   rule under V2 selectors so removing the legacy classes from future
   Foundry releases does not regress title clipping. The exact property
   set here is filled in from the Task 3 Step 1 investigation. */
.starwarsffg.application.sheet > .window-content,
.starwarsffg.application.sheet .window-content > form {
  /* PROPERTY: VALUE from Step 1 finding goes here. */
}
```

If the finding from Step 1 is a single property (e.g. `min-height: 0;` or `box-sizing: border-box;`), insert it inside the block and remove the placeholder comment. If the finding is multiple properties, list each.

- [ ] **Step 3: Verify the new rule alone is sufficient.** Re-run Step 1's toggle test. With the explicit rule in place, removing `app` and `window-app` from the root should *not* shift the title — the new selector picks up the slack.

- [ ] **Step 4: Smoke-test all sheet types** (character, vehicle, minion, weapon, talent) using the Task 0 procedure. No visible regressions.

- [ ] **Step 5: Commit.**

```bash
git add styles/starwarsffg.css
git commit -m "$(cat <<'EOF'
Pin V2 sheet title sizing to V2-scoped selectors

The earlier app/window-app class restoration depended on a Foundry V13
rule we hadn't traced. Replicate the relevant property under
.starwarsffg.application.sheet so future Foundry releases that drop
.app/.window-app cannot regress the title clip we fixed in ceddd13.
EOF
)"
```

---

## Task 4: Scope CSS rules that target `.window-content` so they don't bleed onto the form

**Spec:** V2 keeps `contentTag: "form"`, so the form element itself carries the `window-content` class (`FORM.window-content.editable.character`). Any system or module CSS that uses `.window-content` to mean "the outer content wrapper" now matches our form too, with surprising results (already we had to override `.starwarsffg.sheet .window-content { overflow-y: hidden }` with `!important`). Audit our CSS for `.window-content` selectors and re-scope each to `section.window-content` (V1 shape) or to `form.window-content` (V2 shape) where the intent diverges. Foundry's own CSS is out of scope.

**Files:**
- Modify: `styles/starwarsffg.css`

- [ ] **Step 1: List every `.window-content` selector in our CSS.** Use Grep/your editor's project search on `styles/starwarsffg.css` for `\.window-content`. Record each line number and the intent:

> **Findings (fill in during execution):**
> - Line ___: selector `...` — intent: outer wrapper / form root / both?

(At the time this plan was written there are at least: line 43 `.window-app .window-content { background, font-size }`, the V2 override block we just added, and the rule near line 479 `.starwarsffg.sheet .window-content { overflow-y: hidden }`.)

- [ ] **Step 2: For each selector that means "outer SECTION wrapper only,"** add `section` to the selector. Example, change:

```css
.starwarsffg.sheet .window-content {
  overflow-y: hidden;
}
```

to:

```css
.starwarsffg.sheet section.window-content {
  overflow-y: hidden;
}
```

The form keeps its `overflow: visible !important` from the earlier V2 override; the section-scoped rule no longer collides.

- [ ] **Step 3: For `.window-app .window-content { background; font-size }`** (line ~43) — this rule sets the sheet background and base font size and is legitimately desired on the form too. Leave it untouched but add a comment noting it intentionally applies to both V1 sections and V2 forms.

```css
/* Applies to both V1 SECTION.window-content and V2 FORM.window-content;
   the background and base font-size are wanted on both shapes. */
.window-app .window-content {
  background: #cccccc;
  font-size: 9pt;
}
```

- [ ] **Step 4: Remove the `!important` from the V2 override** added in `ceddd13` *if and only if* Step 2 removed every system rule that was forcing `overflow: hidden` onto the form. (Foundry V13's own `.application { overflow: hidden }` from the `applications` layer still requires the `!important` on the root, so keep `!important` on `.starwarsffg.application.sheet`; the inner form rule can drop it if no system rule fights it anymore.)

Open the override block:

```css
.starwarsffg.application.sheet,
.starwarsffg.application.sheet > .window-content {
  overflow: visible !important;
}
```

and split it:

```css
.starwarsffg.application.sheet {
  overflow: visible !important;     /* fights Foundry's applications layer */
}
.starwarsffg.application.sheet > .window-content {
  overflow: visible;                /* no longer needs !important after Task 4 Step 2 */
}
```

- [ ] **Step 5: Smoke-test all sheet types.** The right-side tab strip must still be visible (the root `!important` is doing the work there). The skill grid inside `.sheet-body` must still scroll independently. Title must not clip.

- [ ] **Step 6: Commit.**

```bash
git add styles/starwarsffg.css
git commit -m "$(cat <<'EOF'
Scope .window-content rules so V2's form doesn't inherit V1 wrapper styles

Rules written for V1's SECTION.window-content were silently applying to
V2's FORM.window-content. Re-scope ours to section.window-content where
the intent was "outer wrapper only," drop the now-redundant !important
on the inner form override, and add a comment on the one rule that
should still match both shapes.
EOF
)"
```

---

## Task 5: Restore V1 resize-handle class for CSS/module compat

**Spec:** V1 renders the bottom-right drag corner as `<div class="window-resizable-handle">`; V13's ApplicationV2 uses `<div class="window-resize-handle">` (different word). No CSS in `starwarsffg.css` targets either today, but third-party modules and skins routinely style `.window-resizable-handle`. Make both class names co-present on V2 sheets so legacy CSS keeps working.

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js`

- [ ] **Step 1: In `_onRender` of `FFGDocumentSheetV2`,** add a one-liner to alias the class after the existing legacy-header projection.

Locate the end of `_onRender` (the line `this._projectLegacyHeaderControls();` added in Task 2 — or, if Task 2 is skipped, the line `this.element.dataset.appid = this.appId;`). Add immediately after it:

```js
    this.element.querySelector(":scope > .window-resize-handle")?.classList.add("window-resizable-handle");
```

- [ ] **Step 2: Smoke-test.** In console after opening any sheet:

```js
const root = game.actors.get('GBeW2aKcuQCkk5uE').sheet.element;
console.log(root.querySelector('.window-resize-handle')?.className);
// expect: "window-resize-handle window-resizable-handle"
```

Also drag-resize the sheet to confirm V13's resize behavior still works (we only added a class, did not replace anything).

- [ ] **Step 3: Commit.**

```bash
git add modules/sheets/document-sheet-v2-compat.js
git commit -m "$(cat <<'EOF'
Alias V13 .window-resize-handle to legacy .window-resizable-handle

V1 used .window-resizable-handle; V13 dropped the "-able-" infix.
Tag both classes on the V2 sheet's resize corner so third-party CSS
written against the V1 name keeps working.
EOF
)"
```

---

## Task 6: Verify tab selection persists across full re-renders; harden if it doesn't

**Spec:** [`document-sheet-v2-compat.js:222-232`](../../../modules/sheets/document-sheet-v2-compat.js:222) stores the active tab via the `Tabs` callback into `this._sheetTab`, and `_activateCoreListeners` reads `this._sheetTab ?? tabConfig.initial` on each render. Across `render(true)` re-renders the instance is reused, so this *should* work; across close-then-reopen it definitely won't (new instance). Verify behavior; if a `render(true)` resets the tab, store the active tab as a document flag instead.

**Files:**
- Possibly modify: `modules/sheets/document-sheet-v2-compat.js`

- [ ] **Step 1: Test soft re-render preservation.**

```js
const a = game.actors.get('GBeW2aKcuQCkk5uE');
a.sheet.render(true);
await new Promise(r=>setTimeout(r,1000));
a.sheet.element.querySelector('.sheet-tabs .item[data-tab="biography"]').click();
await new Promise(r=>setTimeout(r,300));
a.sheet.render(true);
await new Promise(r=>setTimeout(r,1000));
console.log('active tab after re-render:', a.sheet.element.querySelector('.sheet-tabs .item.active')?.dataset.tab);
// Expected: "biography". If "characteristics", proceed to Step 2.
```

- [ ] **Step 2: If Step 1 shows the tab reset to the default, the in-memory `_sheetTab` is being lost** (likely because `_activateCoreListeners` is called from `_onRender` with a freshly re-built DOM and the callback closure was bound to the *previous* `Tabs` instance). Replace storage with a document flag.

In `modules/sheets/document-sheet-v2-compat.js`, find `_activateCoreListeners`. Update the `Tabs` construction block to read/write a flag instead of `this._sheetTab`:

```js
    this._tabs = (this.options.tabs ?? []).map((tabConfig) => {
      const flagPath = `sheetTab.${this.appId}`;
      const stored = this.document?.getFlag?.("starwarsffg", flagPath);
      const tabs = new foundry.applications.ux.Tabs({
        ...tabConfig,
        initial: stored ?? tabConfig.initial,
        callback: (_event, _tabs, active) => {
          this.document?.setFlag?.("starwarsffg", flagPath, active);
        },
      });
      tabs.bind(root);
      return tabs;
    });
```

Note: `setFlag` triggers a re-render — guard against the loop by only writing when the value actually changed:

```js
        callback: (_event, _tabs, active) => {
          if (this.document?.getFlag?.("starwarsffg", flagPath) === active) return;
          this.document?.setFlag?.("starwarsffg", flagPath, active);
        },
```

- [ ] **Step 3: Smoke-test soft AND hard re-render.** Repeat Step 1's procedure, but also close the sheet entirely between clicks (`a.sheet.close()` then `a.sheet.render(true)`). The selected tab must survive both.

Also test on an item sheet to confirm the `setFlag` path works on Items as well as Actors. Repeat with `game.items.get('pkteoDxUDjZGOU81')`.

- [ ] **Step 4: Commit.**

```bash
git add modules/sheets/document-sheet-v2-compat.js
git commit -m "$(cat <<'EOF'
Persist active sheet tab across re-renders via a document flag

In-memory _sheetTab survived render(true) but not close-and-reopen, and
in practice ApplicationV2's part rebuild also dropped it on soft
re-renders. Store the active tab name as flags.starwarsffg.sheetTab.<id>
so the choice survives both lifecycles. The callback no-ops when the
value is unchanged to avoid re-render loops.
EOF
)"
```

If Step 1 showed the in-memory storage *does* work for both lifecycles, skip Step 2's edit, instead commit only this plan's investigation note (or no commit) and move on.

---

## Task 7: Make `DialogV2Compat` honor an explicit `jQuery: false` option

**Spec:** [`dialog-v2-compat.js:14-25`](../../../modules/apps/dialog-v2-compat.js:14) defaults `jQuery` to true and the `get element()` accessor inspects `this.options.jQuery`, so a caller passing `{ jQuery: false }` should get a raw element. That works today *only because* the constructor spread is `{ jQuery: true, ...options }` (later options win) — a caller passing `{ jQuery: false }` does get the raw element. However, if a future edit reorders the spread (a real risk; the order is non-obvious), `false` will be silently overwritten by the default. Tighten the constructor and add a regression check.

**Files:**
- Modify: `modules/apps/dialog-v2-compat.js`

- [ ] **Step 1: Replace the constructor's defaulting logic with an explicit fallback** that's order-independent. Find:

```js
  constructor(data = {}, options = {}) {
    this.data = data;
    this.options = { jQuery: true, ...options };
    this.app = null;
    this._buttonActions = [];
  }
```

Replace with:

```js
  constructor(data = {}, options = {}) {
    this.data = data;
    this.options = { ...options, jQuery: options.jQuery ?? true };
    this.app = null;
    this._buttonActions = [];
  }
```

`?? true` makes the default-vs-explicit decision once and locally, no longer depending on spread order.

- [ ] **Step 2: Smoke-test that legacy callers still get jQuery.** In console:

```js
const { DialogV2Compat } = await import('/systems/starwarsffg/modules/apps/dialog-v2-compat.js');
const d1 = new DialogV2Compat({title: 'T', content: '<p>x</p>', buttons: { ok: { label: 'OK' } }});
console.log('default jQuery:', d1.options.jQuery);                          // expect: true
const d2 = new DialogV2Compat({title: 'T', content: '<p>x</p>'}, { jQuery: false });
console.log('explicit false:', d2.options.jQuery);                          // expect: false
```

- [ ] **Step 3: Commit.**

```bash
git add modules/apps/dialog-v2-compat.js
git commit -m "$(cat <<'EOF'
Make DialogV2Compat honor explicit jQuery:false regardless of spread order

The previous `{ jQuery: true, ...options }` worked for explicit false
only because spread order put options last. Reorder so the default is
applied with ?? after the spread; behavior unchanged for normal usage,
robust to future edits.
EOF
)"
```

---

## Task 8: Eliminate `submitOnChange` double-fire risk in the V2 base

**Spec:** [`document-sheet-v2-compat.js`](../../../modules/sheets/document-sheet-v2-compat.js) keeps both legacy-style submission (manual `form.addEventListener("change", this._onChangeInput.bind(this))` in `_onRender`) and V2's framework-level `form` option (`form: { submitOnChange: false, closeOnSubmit: false }` in `DEFAULT_OPTIONS`). If anyone later sets `form.handler` or flips `form.submitOnChange` to true on a subclass, the same change event will fire both pathways and double-submit. Pick one path and make the other unreachable.

This task chooses the manual path (matches V1 semantics, already in place). We harden by (a) keeping `form.submitOnChange: false` in `DEFAULT_OPTIONS` and (b) refusing to wire a V2 `form.handler` even if a subclass overrides it.

**Files:**
- Modify: `modules/sheets/document-sheet-v2-compat.js`
- Modify: `modules/apps/form-application-v2-compat.js` (parallel hardening)

- [ ] **Step 1: In `document-sheet-v2-compat.js`,** find `_initializeApplicationOptions` (around line 93). At the end of the method, just before `return initialized;`, force the V2 form pipeline off so a subclass can't accidentally enable it:

```js
    // V2's form pipeline is intentionally disabled; submission is handled
    // manually by _onChangeInput / _onSubmit to match V1 semantics. Any
    // subclass that flips these flags would cause double-fired submits.
    initialized.form = {
      ...initialized.form,
      submitOnChange: false,
      closeOnSubmit: false,
      handler: null,
    };
    return initialized;
  }
```

- [ ] **Step 2: Mirror the change in `form-application-v2-compat.js`.** Open that file, find its `_initializeApplicationOptions`. The shape is similar — append the same guard right before `return initialized;`:

```js
    initialized.form = {
      ...initialized.form,
      submitOnChange: false,
      closeOnSubmit: initialized.form?.closeOnSubmit ?? true,
      handler: null,
    };
    return initialized;
  }
```

(Form apps default `closeOnSubmit: true` per their legacy contract, hence the difference from the sheet base.)

- [ ] **Step 3: Smoke-test that input changes still persist** on an actor sheet. Open the character sheet, change the name field, click outside (blur). The actor name updates. Reopen the sheet: new name is shown.

Also test a `FormApplicationV2Compat` subclass — open Sheet Options (after Task 1), change a Boolean, click Accept. The flag persists.

- [ ] **Step 4: Smoke-test that *no* duplicate update fires.** Watch the network/socket tab while changing one field, or in console run before changing:

```js
const orig = game.actors.get('GBeW2aKcuQCkk5uE').update;
game.actors.get('GBeW2aKcuQCkk5uE').update = function(...args) { console.count('update'); return orig.apply(this, args); };
```

Then edit a field and blur. The console should log `update: 1` (one update per change), not 2.

- [ ] **Step 5: Commit.**

```bash
git add modules/sheets/document-sheet-v2-compat.js modules/apps/form-application-v2-compat.js
git commit -m "$(cat <<'EOF'
Forcibly disable V2 form pipeline on V1-compat sheets and form apps

The V2 form pipeline (submitOnChange / closeOnSubmit / form.handler)
and our manual change-listener both fire on the same event; together
they would double-submit. Lock the V2 pipeline off in
_initializeApplicationOptions so no subclass can accidentally enable
it. Manual _onChangeInput/_onSubmit remains the single submission path.
EOF
)"
```

---

## Task 9: Force FontAwesome solid weight on tab icons

**Spec:** Computed `font-weight` on `<i.fas>` inside `.sheet-tabs` resolves to `400` even though Solid icons load at weight 900. Icons currently render anyway because the glyph code is set via the `content` rule, but if a future Foundry build is stricter about font-weight ↔ font-face matching, the icons could go blank again. Add a defensive rule.

**Files:**
- Modify: `styles/starwarsffg.css`

- [ ] **Step 1: Append a rule** to the V2 compat block. After the title-clip robustness block from Task 3, add:

```css
/* Defensive: force FA Solid font-weight in case an ancestor selector
   resets it to 400. The glyph already renders via content, but weight
   mismatches can disable rendering on stricter browsers / FA builds. */
.starwarsffg .sheet-tabs i.fas,
.starwarsffg .sheet-tabs i.fa-solid {
  font-weight: 900;
}
.starwarsffg .sheet-tabs i.far,
.starwarsffg .sheet-tabs i.fa-regular {
  font-weight: 400;
}
```

- [ ] **Step 2: Smoke-test that all nine tab icons on the character sheet remain visually identical** (no thicker or thinner strokes than before). Use the zoom screenshot or DevTools "Computed" tab to confirm `font-weight: 900` on each solid icon, `font-weight: 400` on any regular/brand icon.

- [ ] **Step 3: Commit.**

```bash
git add styles/starwarsffg.css
git commit -m "$(cat <<'EOF'
Pin FontAwesome weights on sheet tab icons

Glyphs currently render via content rules alone, but inheriting
font-weight 400 onto an .fa-solid icon is a latent failure: a stricter
browser/FA build will refuse to render. Force 900 on .fas/.fa-solid
and 400 on .far/.fa-regular inside .sheet-tabs.
EOF
)"
```

---

## Task 10: Document the `getData()` / `toObject(false)` choice

**Spec:** [`actor-sheet-v2-compat.js:38-45`](../../../modules/sheets/actor-sheet-v2-compat.js:38) and the sibling `item-sheet-v2-compat.js` use `this.document.toObject(false)` in `getData()`. That matches V1 (`false` returns the raw source rather than the *transformed* values that ActiveEffects produce), but ApplicationV2's idiom is to expose `this.document` directly and let templates pick. Document the intentional divergence so a future contributor doesn't "modernize" it without understanding the consequences (sheets that read base values would suddenly see AE-modified values, breaking edit mode for example).

**Files:**
- Modify: `modules/sheets/actor-sheet-v2-compat.js`
- Modify: `modules/sheets/item-sheet-v2-compat.js`

- [ ] **Step 1: In `document-sheet-v2-compat.js`,** find `getData` (around line 148). Replace the existing comment-less block:

```js
  getData(_options = {}) {
    const data = this.document.toObject(false);
    const isEditable = this.isEditable;
    return {
      cssClass: isEditable ? "editable" : "locked",
      editable: isEditable,
      document: this.document,
      data,
      limited: this.document.limited,
      options: this.options,
      owner: this.document.isOwner,
      title: this.title,
    };
  }
```

with the same code prefixed by an explanatory comment:

```js
  // NOTE: `toObject(false)` returns the *raw source* document data, not
  // the transformed view that ActiveEffects produce. This matches V1
  // ActorSheet semantics and is required by edit-mode workflows that
  // need to inspect un-modified values (see ActorHelpers.beginEditMode).
  // Do not "modernize" to `this.document.system` without auditing every
  // template that reads `data.*` — sheets will start showing AE-modified
  // values where they currently show source values.
  getData(_options = {}) {
    const data = this.document.toObject(false);
    const isEditable = this.isEditable;
    return {
      cssClass: isEditable ? "editable" : "locked",
      editable: isEditable,
      document: this.document,
      data,
      limited: this.document.limited,
      options: this.options,
      owner: this.document.isOwner,
      title: this.title,
    };
  }
```

- [ ] **Step 2: No similar comment is needed in the actor/item subclass `getData` overrides** — they just spread the parent's result. Leave them alone.

- [ ] **Step 3: Commit.**

```bash
git add modules/sheets/document-sheet-v2-compat.js
git commit -m "$(cat <<'EOF'
Document why FFGDocumentSheetV2.getData uses toObject(false)

Matches V1 ActorSheet behavior and is required by edit-mode helpers
that need raw source values. Future contributors are likely to
"modernize" this to document.system; the comment explains the
consequences if they do.
EOF
)"
```

---

## Final task: Integration smoke pass

This task does not change code. It is the final sign-off check.

- [ ] **Step 1: Run the full Task 0 procedure** on each of the five archetype sheets (character, vehicle, minion, weapon, talent) plus one dialog (Sheet Options). Confirm every fix from Tasks 1–10 is still working *together*:

  - **Task 1:** Sheet Options dialog body renders form fields.
  - **Task 2:** Header shows labeled `Sheet Options / Configure Sheet / Copy ID` links AND the `⋮` dropdown still works.
  - **Task 3:** Title not clipped even if you temporarily remove `app`/`window-app` from the root.
  - **Task 4:** No `!important` regressions; skill grid still scrolls.
  - **Task 5:** Resize handle has both class names; resize still drags.
  - **Task 6:** Switch to "Biography" tab, close + reopen sheet; "Biography" still active.
  - **Task 7:** A test `DialogV2Compat` constructed with `{jQuery:false}` reports `jQuery:false`.
  - **Task 8:** Editing a field fires exactly one update (the counter trick).
  - **Task 9:** Tab icons visually identical, computed font-weight 900 for solids.
  - **Task 10:** Sheet still renders normally; no functional change.

- [ ] **Step 2: Run an end-to-end "play loop"** to flush out anything we missed. Roll a skill check from the character sheet, apply a crit from the resulting chat card, open and edit the resulting crit on the actor. All should work as on `main`.

- [ ] **Step 3: Cross-branch visual diff.** Stash any WIP, `git checkout main`, hard-reload, screenshot the same three sheets. Switch back to `V2-port`, screenshot again. Diff (visually). Note any remaining differences in a follow-up issue — do not leave them in this plan.

- [ ] **Step 4: Push the branch and open a PR** (or finalize via [`superpowers:finishing-a-development-branch`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/finishing-a-development-branch/SKILL.md)). The first task commit (Task 1) is the head; the PR description should link back to this plan file.

No commit for the final task.

---

## Self-review notes (left by plan author)

- **Spec coverage:** All ten issues from the chat-session list have a task; each task names the file paths involved and a concrete smoke test.
- **Placeholder scan:** Two intentional placeholders exist — the Step 1 findings in Task 3 and Task 4. These are *investigation outputs* the executor must fill in; the task explains exactly what to look for and what to do with the result.
- **Type consistency:** No new types introduced. Method names referenced (`_projectLegacyHeaderControls`, `_onRender`, `_initializeApplicationOptions`, `_onChangeInput`, `_activateCoreListeners`) match the existing file at HEAD.
- **Ordering:** Task 2 ("project header controls") and Task 5 ("alias resize handle") both append into `_onRender`. Task 2 lands first; Task 5's one-liner is appended after the call introduced in Task 2 so the order in the file matches the order of tasks. If Task 2 is skipped, Task 5's anchor changes to `this.element.dataset.appid = this.appId;` (already mentioned in Task 5 Step 1).
- **Reversibility:** Every task is one focused commit on top of `V2-port`. Each can be reverted independently with `git revert <sha>` if it causes regressions.
