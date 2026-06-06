# Handoff: Special‑ammo UI for the Codex II weapon card

**Audience:** an agent working in the **`ffg-star-wars-enhancements`** module (the
module that owns the "special ammo" feature). 
**Goal:** when a Codex II character sheet shows an **expanded** weapon card, render
the special‑ammo **selector** (and, when a special ammo is loaded, its magazine)
inside the card's ammo chip — the same way the module already injects its special‑
ammo UI into the item sheet via `renderItemSheet`.

The Codex sheet (in the **`starwarsffg` system**) used to do this itself. That
coupling has been **removed** — the system now renders only the *core* ammo chip
(`system.ammo`, gated by the per‑item `config.enableAmmo` flag). Everything about
*special* ammo now belongs to this module.

---

## 1. The special‑ammo data model (recap — you own this)

Defined in `scripts/specialAmmo/special_ammo.js`. `MODULE_ID = "ffg-star-wars-enhancements"`.

- **World setting** `special-ammo-enable` (Boolean) gates the whole feature.
- **Weapon** flag `flags["ffg-star-wars-enhancements"]["special-ammo"]`:
  `{ hasSpecialAmmo: bool, ammoFilter: "comma,separated,names", selectedAmmo: <gearItemId> }`
- **Ammo gear item** flag `flags["ffg-star-wars-enhancements"]["ammo-data"]`:
  `{ canBeUsedAsAmmo: bool, ammoMax: number, ammoCurrent: number }`
- **Valid ammo items** for a weapon = the owning actor's `gear` items whose
  lower‑cased `name` is in the weapon's `ammoFilter`, with `ammoData.canBeUsedAsAmmo`.
  (Reuse the existing `_getValidAmmoItems(weapon)` helper — consider exporting it.)

The selected ammo's magazine = `ammoData.ammoCurrent / ammoData.ammoMax`. The
selected ammo's *name* is what your prototype called "BUCKSHOT".

---

## 2. What the system now provides (the DOM contract)

### 2.1 Where the weapon cards live
- Sheet classes: **`CodexActorSheet`** and **`CodexAdversarySheet`** (in
  `systems/starwarsffg/modules/actors/codex-sheets.js`). Both are **ApplicationV2**
  (they extend the native `ActorSheetFFG` → `FFGDocumentSheet` → `DocumentSheetV2`).
- The root element carries class **`.cdx`** (plus a `scheme-*` class). Use this to
  detect a Codex sheet from a generic render hook.
- Weapon cards (Combat tab): `templates/parts/codex/cdx-combat.html`
  ```html
  <div class="item cdx-card weapon" data-item-id="{WEAPON_ID}" data-ability="...">
    <div class="cdx-card-main"> …icon, equip toggle, title… </div>
    <div class="cdx-statcols"> DAM / CRIT / RANGE / ENC </div>
    <div class="cdx-card-ctl item-controls"> …edit, delete… </div>

    <!-- present ONLY when the weapon has core ammo (config.enableAmmo): -->
    <div class="cdx-ammo" data-weapon-id="{WEAPON_ID}">
      <span class="cdx-ammo-k">Ammo</span>
      <div class="cdx-ammo-stepper">
        <button class="cdx-ammo-step" data-dir="-1"><i class="fas fa-minus"></i></button>
        <span class="cdx-ammo-count">{value}/{max}</span>
        <button class="cdx-ammo-step" data-dir="1"><i class="fas fa-plus"></i></button>
      </div>
    </div>
  </div>
  ```

### 2.2 Expansion mechanism
Clicking a card runs the stock `_itemDisplayDetails` (in `actor-sheet-ffg.js`),
which **appends** `<div class="item-details">…description + .item-properties…</div>`
to the card and toggles the **`.expanded`** class on the card.

### 2.3 Layout (CSS in `styles/cdx.css`)
`.cdx-card` is `display:grid; grid-template-columns:1fr auto auto`. While collapsed
the chip is hidden; when expanded:
```css
.cdx .cdx-card .cdx-ammo            { display:none; }
.cdx .cdx-card.expanded .cdx-ammo   { display:flex; flex-direction:column; align-items:center;
                                      gap:6px; grid-row:2; grid-column:2 / -1; align-self:start; }
.cdx .cdx-card.expanded .item-details            { grid-row:2; grid-column:1 / -1; }
.cdx .cdx-card.expanded:has(.cdx-ammo) .item-details { grid-column:1 / 2; }   /* description left, chip right */
```
**Important consequence:** if you create a `.cdx-ammo` element as a child of a
`.cdx-card` (for a weapon that has special ammo but *no* core ammo), the system's
CSS automatically places & shows it on expand, and pushes the description to the
left — you get the layout for free. Reuse the classes `cdx-ammo`, `cdx-ammo-k`,
`cdx-ammo-stepper`, `cdx-ammo-step`, `cdx-ammo-count` to match styling.

---

## 3. What to implement (in this module)

### 3.1 Hook the Codex sheet render
Mirror your existing `renderItemSheet` hook, but for the actor sheet. Because it's
ApplicationV2, the render callback gives a **native `HTMLElement`** (not jQuery):

```js
for (const cls of ["renderCodexActorSheet", "renderCodexAdversarySheet"]) {
  Hooks.on(cls, async (app, element, context, options) => {
    if (!game.settings.get(MODULE_ID, SETTING_ENABLE)) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    if (!root) return;
    await injectCodexSpecialAmmo(app.document /* actor */, root);
  });
}
```
If those exact hook names don't fire in your build, fall back to a broad hook and
detect Codex: `Hooks.on("renderActorSheetV2"|"renderDocumentSheetV2"|…, …)` then
`if (!root.classList.contains("cdx")) return;`. Verify live which one fires.

### 3.2 For each special‑ammo weapon card, inject the UI
```js
async function injectCodexSpecialAmmo(actor, root) {
  for (const card of root.querySelectorAll(".cdx-card.weapon[data-item-id]")) {
    const weapon = actor.items.get(card.dataset.itemId);
    if (!weapon) continue;
    const sa = weapon.getFlag(MODULE_ID, FLAG_SPECIAL_AMMO);
    if (!sa?.hasSpecialAmmo) continue;

    // Idempotency — the sheet re-renders often; never double‑inject.
    if (card.querySelector(".cdx-ammo-special")) continue;

    // Reuse the existing chip if the weapon also has core ammo; else create one.
    let chip = card.querySelector(".cdx-ammo");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "cdx-ammo";                 // system CSS styles + places it
      chip.dataset.weaponId = weapon.id;
      chip.innerHTML = `<span class="cdx-ammo-k">${game.i18n.localize("SWFFG.Ammo")}</span>`;
      chip.addEventListener("click", (ev) => ev.stopPropagation()); // don't toggle expand
      card.appendChild(chip);
    }

    // Build + append the special‑ammo block (selector + magazine).
    const validItems = _getValidAmmoItems(weapon);   // your existing helper
    // …render a <select class="cdx-ammo-select"> of validItems (+ a "none" option),
    //   selected = sa.selectedAmmo. Append inside `chip` (it stacks vertically).
  }
}
```

### 3.3 Behaviour (agreed UX: "special if loaded, else core")
- **Selector** (dropdown of valid ammo names). On `change`, write
  `weapon.setFlag(MODULE_ID, FLAG_SPECIAL_AMMO, { ...sa, selectedAmmo: value })`.
  `stopPropagation` on the select's clicks so they don't collapse the card.
- **When a special ammo is loaded** (`selectedAmmo` valid): the chip's count should
  show that ammo item's `ammoCurrent/ammoMax`, and the −/+ should adjust the **ammo
  item's** `ammo-data.ammoCurrent` (not the weapon's `system.ammo`). Two clean ways:
  - *Replace:* hide the system's `.cdx-ammo-stepper` (core) and render your own
    magazine + steppers, or
  - *Rewrite:* set `.cdx-ammo-count` text to the magazine and bind your own click
    handlers; leave the system's core handler alone (it targets `system.ammo`, which
    is fine when nothing is loaded).
- **When nothing is loaded:** show the core stepper (if the weapon has core ammo) so
  the user still sees `system.ammo`; the selector lets them load a special ammo.

### 3.4 Writes without collapsing the card
The card's expanded state is ephemeral (a DOM class + an appended `.item-details`),
so a full sheet re‑render collapses it. Use `document.update(data, { render:false })`
for your flag/magazine writes and update the DOM text yourself (the system's core
stepper already does this). If `{render:false}` doesn't suppress the actor‑sheet
re‑render for embedded‑item updates in your build, the card will collapse on each
edit — acceptable fallback, and your render hook re‑injects on the next render.

### 3.5 Idempotency / lifecycle
- Your hook fires on **every** render; always guard against double‑injection
  (`if (card.querySelector(".cdx-ammo-special")) continue;`).
- No teardown needed — re‑render rebuilds the cards and your hook re‑injects.

---

## 4. CSS to add (in the module)
The system intentionally does **not** style a special‑ammo `<select>` anymore. Add
something like:
```css
.cdx .cdx-ammo-select {
  background: var(--cdx-paper); border: 1px solid var(--cdx-line); border-radius: 3px;
  padding: 2px 6px; color: var(--cdx-ink); font-family: "Orbitron"; font-size: 10px;
  max-width: 150px; cursor: pointer;
}
```
The `--cdx-*` custom properties are defined by the system on the `.cdx` root, so
they're available to your injected markup.

---

## 5. Acceptance criteria
1. World setting `special-ammo-enable` ON, a weapon with `hasSpecialAmmo` and a
   matching ammo gear item in inventory → expanding that weapon's Codex card shows
   the ammo chip on the right with a working ammo **dropdown**.
2. Selecting an ammo loads it (persists `selectedAmmo`); the chip count switches to
   that ammo's `ammoCurrent/ammoMax`; −/+ adjusts the ammo item's magazine.
3. Selecting "none" reverts the count to the weapon's core `system.ammo` (if the
   weapon has core ammo) or hides the count.
4. Clicking inside the chip never expands/collapses the card.
5. Module OFF, or weapon without special ammo → Codex card is unchanged (core ammo
   chip only, owned by the system).

---

## 6. Reference files
- System (read‑only contract): 
  - `systems/starwarsffg/modules/actors/codex-sheets.js` — `getData` builds
    `ctx.cdxAmmo` (core only); `_cdxWireAmmo` wires the core steppers.
  - `systems/starwarsffg/templates/parts/codex/cdx-combat.html` — the `.cdx-ammo` chip.
  - `systems/starwarsffg/styles/cdx.css` — `.cdx-ammo*` styles + expanded grid placement.
  - `systems/starwarsffg/modules/actors/actor-sheet-ffg.js` — `_itemDisplayDetails`
    (expansion: appends `.item-details`, toggles `.expanded`).
- Module (where you work): 
  - `modules/ffg-star-wars-enhancements/scripts/specialAmmo/special_ammo.js`
    (`_getValidAmmoItems`, `_injectWeaponAmmoUI`, the flag constants, the existing
    `renderItemSheet` hook to mirror).
