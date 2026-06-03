# Full UI Sweep — GM + Player (Andre) — 2026-06-03

Broad post-migration QA sweep on the live world (Foundry core 13.351, branch
`V2-compat-elimination`, live Mandar theme `mandarBeskarAstromech.css`). Goal:
every page/sheet renders properly, all buttons work, no bugs — verified on both
the **Gamemaster** (GM) and **Andre** (player) accounts.

Status legend: ✅ ok · ⚠️ minor/cosmetic · ❌ broken · ⏳ pending

---

## 0. Headline issue — Destiny tracker fully broken (❌ → ✅ FIXED)

**Reported (this session):** the destiny tracker does not work at all —
(1) the GM's **Group Manager** and **Request Destiny Roll** buttons do nothing,
and (2) the destiny points (tokens) are unresponsive for **both** GM and player;
"no errors in the console when I click the tokens."

**ROOT CAUSE (confirmed live).** `modules/ffg-destiny-tracker.js`
`_setupDragging()` called `handle.setPointerCapture(event.pointerId)` on **every**
`pointerdown` on the `.swffg-destiny` container (the drag handle). Pointer
capture retargets the matching `pointerup` to the handle and **suppresses the
synthesized `click` on the actual child that was pressed**. The flip handler
(`.destiny-points`) and both menu links (`.dropdown-content a` = Group Manager /
Request Destiny Roll) are all children of `.swffg-destiny`, so **none** of their
`click` handlers ever fired. One bug → all three symptoms; it is purely
client-side, which is why there were no console errors and why it hit GM and
player identically.

This is also the true cause of the original "players can't flip" report. The
prior-session conclusion (a *cross-client socket* failure) was **WRONG** — the
player's flip click was eaten locally, so the `{pool}` emit was never even sent.
(The earlier "player works in isolation / 4-of-4" results came from
*programmatically invoked* handlers and dispatched events, which bypass the
pointer-capture path that a real mouse click takes — so they masked the bug.)

**Proof (live, GM, real mouse clicks):**
- *Before fix:* capture-phase probe on `#destinyDark` recorded `pointerdown:1`
  but `pointerup:0`, `click:0` — the click never reached the element.
- *After fix:* `pointerdown / pointerup / click` all fire (`click:1`); a real
  click ran the handler and flipped the pool 5/2 → 6/1, display updated to
  6L/1D (then reverted to 5/2). Both menu links fire on real clicks
  (recorder = `[0,1]`); a real click on the Group Manager icon opened the
  Group Manager window end-to-end.

**FIX** (`modules/ffg-destiny-tracker.js`): do **not** `setPointerCapture` on
pointerdown. Acquire capture **lazily** in `onMove`, only once a real drag
crosses the 4px threshold — a plain click never reaches that code, so its
`click` is left intact; dragging still works (capture engages the instant a drag
is detected, while the pointer is still over the handle).

**Separate cosmetic bug (also fixed):** template
`data-value="${destinyPool.light}"` used JS template-literal syntax instead of
Handlebars `{{destinyPool.light}}`. Does not affect the flip (handler reads
`data-group`). File: `templates/ffg-destiny-tracker.html`.

---

## 1. Gamemaster (GM) account

### 1a. Destiny tracker (GM)
✅ FIXED — see §0. Real-mouse-click verified: pool flip (5/2→6/1, then reverted),
Group Manager link opens the Group Manager window, Request Destiny Roll link
fires its callback. Pointer-capture root cause removed (lazy capture).

### 1b. Item sheets
✅ All types render with no console errors (GM): weapon, armour, gear, talent,
ability, forcepower, itemmodifier, itemattachment, criticalinjury,
criticaldamage (world) + specialization, signatureability, species, career,
shipweapon, shipattachment (compendium). Sheet Options present on
gear/weapon/armour (by design). Embedded editor buttons present.

### 1c. Actor sheets
✅ character, minion, vehicle, homestead, rival, nemesis all render with the
correct type class + `.v2`, tabs, Sheet Options (homestead has none — pre-existing).

❌ **FINDING A — Adversary sheet `getData()` mishandles its async super (BUG).**
`modules/actors/adversary-sheet-ffg.js` `getData()` is **not `async`** and does
`const data = super.getData()` **without `await`**. But `ActorSheetFFG.getData`
is `async` (returns a Promise), so `data` is a *Promise*, not the resolved
context. Consequences:
  - `super._updateSpecialization(data)` throws
    `TypeError: Cannot read properties of undefined (reading 'slice')` at
    `actor-sheet-ffg.js:2181` (`data.talentList` is undefined on a Promise) when
    a **never-loaded** character is opened directly on the Adversary sheet
    (repro: create a character, set `flags.core.sheetClass='ffg.AdversarySheetFFG'`,
    open). First open errors; subsequent opens skip it (the `loaded` in-memory
    flag was set before the throw).
  - The adversary tweaks (`this.position` 595×783, `data.items = actor.items…`)
    are written onto the Promise wrapper and **silently lost** on every render.
  - **Pre-existing** (the adversary `getData` is unchanged by the V2 migration;
    `ActorSheetFFG.getData` has always been async). Severity: medium — broken
    first-open of fresh adversary-styled characters + lost layout tweaks.
  - **Fix:** make it `async getData()` and `const data = await super.getData();`.

### 1d. Apps / dialogs
✅ **Settings panels** — all FFG settings menus render with inputs + footer
buttons, no errors: rulesetSettings, uiSettings, combatSettings, actorSettings,
xpSpendingSettings, localizationSettings, groupManagerSettings (+ others).
✅ **Group Manager** — opens via the destiny menu, renders (21 inputs, 18
buttons, PC list).

❌ → ✅ **FINDING B — Group Manager content clipped, no vertical scrollbar (FIXED).**
The window content overflowed with no way to scroll: live, `form.window-content`
measured `scrollHeight 991 > clientHeight 863` while computed `overflow-y: hidden`,
so the bottom of the PC list (and any Obligation/Duty tables) was unreachable.
**Root cause:** the template's outer `<form class="group-manager">` is the root
PART, so V13 drops that wrapper and mounts the children *directly* in
`form.window-content` (core: `overflow: hidden`); the `classes` land on the root
`.application#group-manager` div. The system's `.starwarsffg .group-manager {
overflow-y: auto }` rule (both `starwarsffg.css` and `mandar.css`) therefore
matches **nothing** — there is no `.group-manager` descendant of a `.starwarsffg`
(the only `.group-manager` is the root, which has the class on itself). A V2
migration orphan. **Fix:** scroll the real content element —
`.starwarsffg.application.group-manager > form.window-content { overflow-y: auto }`
in `starwarsffg.css` + `mandar.css` (+ `scss/global/_v2_compat.scss`). Live-verified
from the files (no injected style): `overflow-y` → `auto`, scrollbar engages when
overflowing and **auto-hides when the window is tall enough to fit** (height 1090 →
`clientHeight 1053 == scrollHeight 1053`, no scrollbar); `overflow-x` stays hidden.
ℹ️ roll-builder, popout-editor, popout-modifiers, item-editor (talent/force
editors), skills-list/swa importers, character-creator: verified during the
Stage 2 migration (render + key behaviors); not re-opened standalone in this
sweep (they require specific in-sheet flows to instantiate).

### 1e. Sidebar tabs + core UI
⏳ (spot-check pending)

---

## Fixes applied this session
- ✅ **Destiny tracker dead (headline)** — FIXED in
  `modules/ffg-destiny-tracker.js`: removed `setPointerCapture` from
  `pointerdown`; capture now acquired lazily in `onMove` once a drag crosses the
  4px threshold. Restores all `click` handlers inside `.swffg-destiny` (pool
  flip for GM + player, Group Manager, Request Destiny Roll). See §0 for the full
  root-cause analysis + live verification.
- ✅ **Finding A** (adversary `getData` async) — FIXED in
  `modules/actors/adversary-sheet-ffg.js`: `async getData()` + `await
  super.getData()` + `await super._updateSpecialization(data)`. Verified: a
  fresh character on the adversary sheet now renders with no console error and
  the 595×783 position tweak applied. The recurring background exception is gone.
- ✅ **Destiny `data-value`** — FIXED in `templates/ffg-destiny-tracker.html`:
  `${destinyPool.light/dark}` → `{{destinyPool.light/dark}}`.
- ✅ **Finding B** (Group Manager not scrollable) — FIXED in `styles/starwarsffg.css`,
  `styles/mandar.css`, and `scss/global/_v2_compat.scss`: added
  `.starwarsffg.application.group-manager > form.window-content { overflow-y: auto }`.
  The legacy `.starwarsffg .group-manager` overflow rule was a dead selector after
  the V2 root-PART migration (wrapper `<form>` dropped). Live-verified the scrollbar
  appears only when content overflows and auto-hides when it fits. See §1d Finding B.

---

## 2. Andre (player) account

### 2a. Destiny tracker
⏳

### 2b. Item sheets (player-owned / readable)
⏳

### 2c. Actor sheets (player-owned)
⏳

### 2d. Apps / dialogs visible to players
⏳

### 2e. Sidebar tabs + core UI
⏳

---

## 3. Summary of findings
⏳
