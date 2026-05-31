# V2-port Known Issues Fix-up — Session Handoff (2026-05-31)

Branch: `V2-port`

Plan executed: [`2026-05-31-v2-port-known-issues.md`](2026-05-31-v2-port-known-issues.md)
Design spec: [`../specs/2026-05-31-v2-port-known-issues-design.md`](../specs/2026-05-31-v2-port-known-issues-design.md)

All ten user-reported issues addressed and live-verified on the running world
(`http://192.168.1.7:30000/`, Foundry 13.351 / system 2.0.3, Gamemaster).

## What landed (commits, oldest → newest)

```
3c3917b9  Activate ProseMirror editors on V2 document sheets        (A1, user #2)
026480ee  Clamp setPosition to per-type minimum dimensions          (B1, user #10)
c89bf84d  Bound embedded editor height and enlarge modifier desc.    (C1+C2, user #7,#8)
4edbbd5c  Fix render-race on sheet change pipeline                   (D1.a/b/bb/c, user #3,#5,#9)
244ec304  Fix broken submit() calls in buy-talent and attr controls (user #6)
c9b216c0  Add session handoff (this doc, later amended)
6d554da9  Restore hand-maintained CSS clobbered by SCSS recompile    (side-tab regression fix)
```

(A2 and E1 required no code change — see below.)

> **CSS landmine (learned the hard way this session).** `styles/starwarsffg.css`
> is **hand-maintained**: it carries a large V2-compat block (right-side tab
> strip, actor body-fill / gray-strip fix, title-input sizing, checkbox
> appearance, FA font-weights) that was **never** back-ported into the SCSS
> sources under `scss/`. Running `npm run compile` / `gulp css` regenerates the
> file from SCSS and **destroys** those edits. The C2 fix did exactly this and
> dropped the side tabs; `6d554da9` restored the hand-maintained file and
> re-applied the one C2 rule by hand. **Do not run `gulp css` until the
> V2-compat CSS is reconciled into SCSS.** Edit `styles/starwarsffg.css`
> directly for now.

## Per-issue outcome

| User # | Issue | Resolution |
|---|---|---|
| #2 | biography/description not editable (all sheets) | **A1** — added editor activation to `FFGDocumentSheetV2` (`_activateEditors`/`_activateEditor`/`_saveEditor`/`_destroyEditor`). The `{{editor}}` helper's edit button now mounts a ProseMirror editor; save routes through `_onSubmit` so the legacy update helpers run. Verified on character + talent sheets. |
| #3 | weapon dropdowns open/close too fast | **D1** — opening a `<select>` now triggers 0 re-renders (was re-rendering mid-interaction). Verified: focus/click on a select → 0 renders. |
| #4 | talent sheet totally broken | **A1 + D1** (no talent-specific change). Was the pre-fix combination of non-editable description + render-race wiping interaction state. Now: all 4 tabs render and switch, editor saves, ranked toggle and activation persist, modifiers render. |
| #5 | spec talent checkbox multi-click breaks state | **D1.a** — coalesce loop replaces the drop-on-busy `_submitting` guard. Verified: 3 rapid clicks land with correct parity, no revert. |
| #6 | buy-talent button broken | **submit() fix** — `sheet.submit()` throws in this compat layer (form handler is nulled); replaced with the manual `_onSubmit(...)` pipeline. Verified end-to-end: bought "Grit" on Jovel Nial's Slicer, talent learned + XP 100→95 (reverted after). |
| #7 | spec modifiers list overflow | **C1** — the three embedded editors had `//height: 720` commented out, so the window grew unbounded with many rows. Set `height: 600`; the existing `.tab.active` overflow CSS now scrolls internally. Verified at 18 rows: window bounded, list scrolls. |
| #8 | spec modifier description textarea too small | **C2** — swapped the single-line `<input>` to a `<textarea class="modifier-description" rows="4">` in `ffg-embedded-talent.html` + `ffg-embedded-upgrade.html`, with a `.modifier-description` rule (flex-fill, min 8em, resize) hand-added to `styles/starwarsffg.css`. 32px → 112px min, resizable. |
| #9 | spec tree won't close | **D1** — covered by the render-race fix + the existing `_closing` guard; field edits no longer race the close. Verified during the D cluster. |
| #10 | spec tree resizes to broken values | **B1** — `setPosition` clamp. Tree-type items (specialization/forcepower/signatureability) floor at 700×600; base 300×200 elsewhere, composing under ApplicationV2's own CSS content minimum. |
| #1 (minor) | dblclick header → black, no collapse | **A2 — no change needed.** Could not reproduce: V13's built-in dblclick handler collapses on every header target tested (title, header, injected Sheet Options link), and the header already has `user-select: none`. Resolved by prior V2-port header work; the user's list predates it. |

## Key technical notes for the next session

- **Render-race fix shape (`4edbbd5c`).** The change pipeline now submits with
  `render: false` by default and suppresses the auto-render. `{ render }` is
  threaded base `_updateObject` → subclass `_updateObject` overrides →
  `ActorHelpers.updateActor` / `ItemHelpers.itemUpdate` → `document.update`.
  `ItemHelpers.itemUpdate`'s explicit `this.render(true)` (line 44) is now
  **gated** on the flag; the cross-doc propagation renders (lines 76/80, which
  target OTHER documents) are intentionally left ungated.
- **Listener-accumulation bug (fixed in `4edbbd5c`).** `_onRender` re-added the
  form's submit/change listeners every render, and ApplicationV2 reuses the
  content `<form>` across renders, so they stacked (one name change → 4
  `_onChangeInput` → 2 `document.update`). Now guarded by a
  `form.dataset.ffgListenersBound` flag. If you add new form-level listeners in
  `_onRender`, put them inside that guard.
- **`submit()` is unusable in this compat layer.** `_initializeApplicationOptions`
  nulls the form handler, so ApplicationV2's `submit()` throws "does not support
  a single top-level form element." Always use
  `this._onSubmit(new Event("submit", { cancelable: true }), { render: <bool> })`.
- **Cross-field reactivity.** Because change-submits no longer auto-render,
  fields whose value toggles sibling visibility need an explicit re-render. So
  far only `data.ranks.ranked` (talent rank field) needed this — a targeted
  listener in `ItemSheetFFG.activateListeners`. Do NOT add a general
  render-on-change (it would re-break the dropdown #3). Add per-field listeners
  if more conditional fields surface.
- **Editor entry shape.** Active ProseMirror editors are registered on
  `this.editors[name]` as `{ instance, options: { engine: "prosemirror" }, ... }`
  — `FormDataExtended` reads `instance.view` for entries whose
  `options.engine === "prosemirror"`. The `.editor` container also gets a
  `prosemirror` class so the change-handler editor guard ignores in-editor
  keystrokes.

## Verification method

Per-fix live verification via Chrome against the running world (DOM probes +
the real purchase dialog for #6 + screenshots for the modifier editor). No
screenshot gallery baseline was captured (Task 0) — substituted targeted
API/DOM/behavior probes, which de-risked the ProseMirror and FormDataExtended
surfaces before coding. The in-Foundry unit tests (`tests/talent-tree.test.js`)
run via a custom Quench-style harness, not `npm test`; their subject
(`modules/helpers/talent-tree.js`) was not touched this session.

## Known follow-ups / not done

- **Talent sheet size (405×535)** is functional but cramped (large profile
  image eats vertical space). Not changed — no user complaint about size
  specifically, and it works. Candidate for a future polish pass if desired.
- **A2** left as no-op pending the user's own manual re-test on real hardware
  (synthetic dblclicks all collapsed correctly; if a real double-click still
  misbehaves, re-open with the diagnostic listener in the plan's A2 Step 1).
- **C2 third partial** (`ffg-modification.html`, the standalone itemmodifier
  description) still uses an `<input>`; only the talent/upgrade embedded editors
  were swapped (those are what the spec-tree flow opens). Swap it too if the
  user reports the standalone modifier editor.
- Carry-over from prior handoffs (absolute vs fixed root positioning, FORM vs
  SECTION `.window-content` audit) — still untouched, still no reported impact.
- Branch not pushed, no PR opened (per standing instruction to leave that to the
  user).
