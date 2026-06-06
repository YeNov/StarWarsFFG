# Codex II Sheet → Foundry VTT Implementation Plan

**Target:** [`YeNov/StarWarsFFG`](https://github.com/YeNov/StarWarsFFG/tree/V2-full) · branch `V2-full`
**Foundry:** v13 only · ApplicationV2 framework
**Source design:** Codex II character sheet prototype (this project)
**Date:** 2026-06-05
**Revision:** v6 — precise ENC reconciliation (weapons & armour also ×qty; equipped armour adjusted−3), `_applyLegacyRootClasses` ordering note, and the `config:true` vs system-UI-menu setting decision. Builds on v5.

---

## TL;DR

This is a **reskin, not a rebuild**. Your fork already implements almost every interaction in the prototype (equip toggle, rest / healing track, quantity steppers, credits formatting, XP log). The work is overwhelmingly **CSS + small Handlebars template edits** on **copied** templates, plus a **per-client theme setting**. No data-model (`template.json`) changes are required.

---

## Resolved design decisions

- **Codex II is a separate, selectable sheet**, registered alongside the originals (native `flags.core.sheetClass`). The original sheets are **never modified** — users opt in *per-actor* via the ⚙ Sheet config. This reuses the system's existing multi-sheet registration pattern (`ActorSheetFFG`, `ActorSheetFFGV2`, `AdversarySheetFFG`).
- **The 5 schemes (Republic / Empire / Dark / Light / Mercenary) are a per-CLIENT setting** — *not* separate sheets, *not* a per-actor flag. Each player picks their palette once in settings; it applies to **their** view of every Codex sheet. Client-scoped → no socket, no shared state; the same actor may legitimately look different to different players.
- **Net split:** *whether* an actor uses the Codex sheet = **per-actor** (shared). *What color* the Codex sheet is = **per-viewer** (mine alone).

---

## What the fork already gives us (do NOT rebuild)

### Sheet class & rendering
- `ActorSheetFFG extends FFGActorSheet` (native ApplicationV2 via the `FFGDocumentSheet` base) handles **every** actor type.
- `get template()` resolves `systems/starwarsffg/templates/actors/ffg-${actor.type}-sheet.html`.
- `DEFAULT_OPTIONS.classes` includes `"v2"` — **the served CSS keys layout off `.starwarsffg.sheet.actor.v2`**. This is our primary styling entry point. The class is load-bearing; keep it.
- **Hybrid architecture in our favor:** ApplicationV2 lifecycle, but still single Handlebars templates + jQuery `activateListeners(html)`. Porting = edit `.html` partials + restyle CSS. No PARTS / actions-map rewrite needed.

### Interactions already wired (`modules/actors/actor-sheet-ffg.js`)
| Prototype feature | Already implemented as |
|---|---|
| Equip toggle | `.toggle-equipped` → updates `system.equippable.equipped` (fist icon = weapons, shield = armour) |
| Rest action (varies) | `.resetMedical` → behavior depends on the `HealingItemAction` world setting: **prompt** (rest vs. reset), **rest** (`stats.medical.uses`=0, `stats.strain.value`=0, `stats.wounds.value`−1), or **reset** (`stats.medical.uses`=0 only). Do **not** assume it always does a full long rest. |
| Healing track increment | `.medical` → increments `stats.medical.uses` |
| Gear quantity +/− | `.item-quantity .quantity.increase/.decrease` |
| Credits comma formatting | done in `getData()` when value > 999 |
| XP log | `.xp-adjustment` / `.xp-export` / `.xp-import` |

> Our "Healing 0/5" row + bed/rest button maps onto the existing `.medical` / `.resetMedical` controls — we restyle them. Label the button "Rest" (not strictly "Long Rest"), since the actual effect is governed by the `HealingItemAction` setting.

### The visual atom — `templates/parts/shared/ffg-block.html`
Renders every Wounds / Strain / Soak / Defence / Encumbrance / Credits / XP box:
```
.resource.{blocktype}.{name}
  .attribute.flex-group-center
    .block-background
      .block-title
      .block-attribute  → .block-value (split/single/double variants)
    .block-background-shadow  → dual label (.shadow-left / .shadow-right)
```
**Restyling this one partial reskins most of the sheet at once.**

---

## Exact data paths (bindings)

| Prototype field | Foundry path |
|---|---|
| Characteristics | `system.characteristics.<Name>.value` (iterated, carries `.label`) |
| Wounds | `system.stats.wounds.value` / `.max` |
| Strain | `system.stats.strain.value` / `.max` |
| Soak | `system.stats.soak.value` |
| Defence | `system.stats.defence.melee` / `.ranged` |
| Encumbrance | `system.stats.encumbrance.value` / `.max` |
| Credits | `system.stats.credits.value` |
| Force pool | `system.stats.forcePool.value` / `.max` |
| Healing uses | `system.stats.medical.uses` |
| XP | `system.experience.available` / `.total` |
| Species / Career / Specializations / Force powers | **embedded items** via `{{#each_when actor.items "type" "specialization"}}` |
| Weapon | `system.damage.value`, `system.crit.value`, `system.range.label`, `system.encumbrance.value`, `system.equippable.equipped` |
| Armour | `system.soak.value`, `system.defence.value`, `system.hardpoints.value`, `system.encumbrance.value` |

> **Important:** specialization & force-power pills are **items**, not strings. The real sheet lists whatever is dragged onto the actor — our static pill data was a prototype stand-in.

> ⚠️ **Two naming conventions.** The *data model* paths are `system.*` (above), but the **template input `name=` attributes use the legacy `data.*` prefix** (e.g. `name="data.stats.wounds.value"`, `name="data.experience.available"`). When searching/editing templates to find or relocate a bound input, grep for `data.stats...` / `data.experience...`, **not** `system.stats...`. Keep this distinction straight or edits will silently miss the real inputs.

---

## Staged plan

> **All template work happens on COPIES.** Stage 0 creates `codex-*-sheet.html` from the originals; every Stage 2–3 edit targets those copies. The stock sheets are left pristine so the Codex sheet is purely additive and trivially removable.

### Stage 0 — Register the separate sheet
- New class `CodexSheetFFG extends ActorSheetFFG`; override `get template()` to resolve **copied** `systems/starwarsffg/templates/actors/codex-${actor.type}-sheet.html`.
- **`DEFAULT_OPTIONS.classes` must keep the full load-bearing set and just append `codex`:**
  ```js
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "sheet", "actor", "v2", "codex"], // NOT just ["codex"]
  };
  ```
  Dropping `v2`/`actor`/etc. breaks layout — the served CSS keys off them.
- **Register only the types whose copied templates actually exist.** Mismatched types resolve a missing template and error. For **v1, register `types: ["character"]` only**; widen to the rest as their templates are created in Stage 5:
  ```js
  Actors.registerSheet("ffg", CodexSheetFFG, { types: ["character"], label: "Codex II Sheet" });
  ```
- Users switch via ⚙ **Sheet** config per actor; the choice lives in `flags.core.sheetClass` (shared per-actor).

> ⚠️ **Partial strategy — copied sheets still `{{>}}` the *original* partials.** A copied `codex-character-sheet.html` includes partials by absolute path (e.g. `…/parts/actor/ffg-weapon-armor-gear.html`). So for any partial that needs **markup changes** (the gear tables in Stage 3, and the header block which is inline in the sheet template), you must: **(1)** copy it to a `codex-*` partial, **(2)** repoint the `{{> …}}` include in the copied sheet template, and **(3)** add the new partial path to **`TemplateHelpers.preload()`** in `modules/helpers/partial-templates.js` (the system preloads partials there; an unregistered partial renders empty). Partials that need only **restyling** (`ffg-block.html`, `ffg-skills.html`, `ffg-tabs.html`, `ffg-talents.html`, …) are **reused unchanged** — CSS does the work, no copy needed.

> ⚠️ **Where classes land (matters for CSS selectors).** `DEFAULT_OPTIONS.classes` (`…codex`) are applied to the **outer ApplicationV2 window** element. The actor-type class (`character`/`minion`/…) and our `scheme-*` class come from `_getLegacyRootClasses()` and land on the **inner content `<form>`** — a *different* element. Therefore **same-element selectors like `.actor.codex.scheme-empire` will NOT match.** Use a **descendant** selector and declare the palette vars on the form (everything inside inherits):
> ```css
> .starwarsffg.sheet.actor.codex form.scheme-empire { --brass: …; --ink: …; }
> ```
> (Alternatively, also stamp the scheme class onto the outer element in `_onRender` to enable same-element selectors — but the descendant form approach is less code.)

### Stage 1 — CSS reskin (≈80% of the visual result, zero logic risk)

> ⚠️ **CSS LOAD ORDER IS THE #1 RISK.** At `init` (`modules/swffg-main.js` ~L258) the system reads the `ui-uitheme` setting, whose **default is `mandarBeskarAstromech`**. For both Mandar themes it does:
> ```js
> $('link[href*="styles/starwarsffg.css"]').prop("disabled", true);
> $("head").append('<link href=".../styles/mandarBeskarAstromech.css" ...>');
> ```
> So **anything registered via `system.json` `styles` (e.g. `starwarsffg.css`) is *disabled* in the default setup** and never applies. Do **not** simply extend `scss/`/`starwarsffg.css` and expect it to load.

**Delivery options (pick one):**
1. **Append-after-theme (recommended, theme-agnostic):** add one line in the `init` theme switch — after the active theme `<link>` is appended (and in the `default` branch too) — appending our `codex-sheet.css` **last in `<head>`**, so it wins cascade ties regardless of which UI theme is active.
2. **Integrate into the Mandar path:** fold the Codex rules into `styles/mandarBeskarAstromech.css` (and `mandar.css`). Simpler load story, but couples us to those theme files and we must re-merge on upstream theme updates.

Either way, scope everything under `.starwarsffg.sheet.actor.codex` (the new Stage 0 class) — **not** `.v2` — so the reskin only touches the Codex sheet, and keep specificity high enough to override the active UI theme.

- Port from prototype: `clip-path` notch bevel, Orbitron type, brass block treatment, centered DAM/CRIT/RANGE/ENC stat columns, tab-strip styling.
- Restyle `ffg-block.html` classes (`.block-background`, `.block-title`, `.block-value`, `.block-background-shadow`) → instantly reskins wounds/strain/soak/defence/encumbrance/credits/XP everywhere.
- Bundle prototype fonts into existing `fonts/` dir and `@font-face` them.

### Stage 2 — Header layout (`templates/actors/ffg-character-sheet.html`)
- Rearrange header: name + item-pills inline with tagline.
- **XP and Credits as the two compact squares** on the right (Credits already comma-formats in `getData`).
- Move **Soak** into the characteristics row (already an `ffg-block` `single` box — relocate + add accent class).
- **Force is not a simple single stat.** What lives on the talents tab is the **Force Pool** as a `split` block (committed / available = `data.stats.forcePool.value` / `.max`) and it is **conditionally hidden** by `actor.flags.starwarsffg.config.enableForcePool`. Decide explicitly:
  - (a) put a **Force *rating*** chip in the characteristics row showing the single `forcePool.max` (display-only), leaving the editable split pool where it is; or
  - (b) relocate the whole committed/available split block.
  Either way, **preserve the `enableForcePool` guard** so Force disappears for non-Force characters, and don't render it as one plain number if you move the real inputs.

> ⚠️ **Avoid duplicate bound inputs.** Credits, Force pool, Encumbrance, and XP already render as `ffg-block` inputs in other tabs (gear / talents / xp). Hidden tabs still exist in the DOM and **still submit their `name=` fields**. If the new header squares are *copies* with the same `name=`, two inputs bind the same path and submit conflicting values (last-writer-wins / race).
> **Rule:** either (a) **move** the single source-of-truth input into the header and delete the original, or (b) make the header square **display-only** (no `name=` attribute — plain text bound to the value) and leave the editable input in its tab. Never have two editable inputs with the same `name`.
> **Real field names to watch** (legacy `data.*` prefix): `data.stats.credits.value`, `data.experience.available` / `data.experience.total`, `data.stats.forcePool.value` / `data.stats.forcePool.max`, `data.stats.encumbrance.value` / `data.stats.encumbrance.max`.

### Stage 3 — Gear tables (new `codex-weapon-armor-gear.html`)

> Per Stage 0's partial strategy: **copy** `ffg-weapon-armor-gear.html` → `codex-weapon-armor-gear.html`, **repoint** the include in `codex-character-sheet.html`, and **add it to `TemplateHelpers.preload()`**. Do not edit the shared original.

> ⚠️ **The ENC columns are not symmetric.** Armour and gear rows have a **commented-out value node** (`<!-- <div>{{item.system.encumbrance.value}}</div> -->`) you can uncomment. **Weapons only have the commented *header*, no value cell** — you must **add** the value `<div>` to each weapon row (and uncomment its header), not just uncomment.

- Bind to `item.system.encumbrance.value`, **but decide base vs. adjusted for weapons and armour, not just gear.** Confirmed in `_calculateDerivedValues` (`modules/actors/actor-ffg.js` ~L653) the Encumbrance block is computed as:
  - **equipped armour:** `encumbrance.adjusted − 3` (min 0; **not** multiplied by quantity — worn once),
  - **weapons & non-equipped armour:** `(adjusted ?? value) × quantity`,
  - **gear/other:** `value × quantity`.
- **Consequence:** a per-row column — base or `base (adjusted)` — is a **per-unit** figure and will **not sum to the Encumbrance block** whenever any item has quantity > 1, or when armour is equipped (the −3). That mismatch is **correct**, not a bug. Decide and document one of:
  - **(Recommended) Per-unit rows** — show `value` with `(adjusted)` in parens when they differ (mirrors the DAM/CRIT pattern already in the template). Treat the **Encumbrance block as the single source of the carried total**; don't expect rows to add up to it.
  - **(Alternative) Carried-total column** — compute and show per-row `enc × qty` (with the equipped-armour −3) so rows *do* reconcile with the block. More template logic; only do this if players expect the rows to sum.
- Apply weapon-card / centered-stat styling to weapons **and** armour so they share one layout.

### Stage 4 — Color schemes as a per-client setting
- 5 schemes (Republic / Empire / Dark / Light / Mercenary) → CSS-variable palettes, each expressed as a root class (e.g. `scheme-empire`).
- **Source of truth = a client-scoped game setting**, registered once:
  ```js
  game.settings.register("starwarsffg", "codexScheme", {
    scope: "client", config: false, type: String, default: "republic",
    choices: { republic: "Republic", empire: "Empire", dark: "Dark", light: "Light", mercenary: "Mercenary" },
    onChange: () => { /* re-render this client's open Codex sheets */ }
  });
  ```
  > **Note on `config`:** the system's existing UI-theme settings use **`config: false`** and are surfaced through its **custom UI Settings menu** (`settings-helpers.js` ~L32), *not* Foundry's core Configure-Settings list. For consistency, prefer `config: false` and add `codexScheme` to that custom menu. Use `config: true` only if you deliberately want it in the core settings list instead — a conscious style choice, not the default-by-omission.
- **Apply the palette class on every render** via the same imperative hook as before — override `_getLegacyRootClasses(context)` in `CodexSheetFFG`. **Call `super` first and append**, never replace: the base (`FFGActorSheet`) returns the **actor-type class** (`character`/`minion`/`vehicle`/…) that existing layout rules depend on. Then strip stale `scheme-*` in `_applyLegacyRootClasses()` before adding (it only adds, never removes):
  ```js
  _getLegacyRootClasses(context) {
    const classes = super._getLegacyRootClasses(context); // keeps the actor-type class!
    classes.push(`scheme-${game.settings.get("starwarsffg", "codexScheme")}`);
    return classes;
  }
  ```
  This is required because the ApplicationV2 shim reuses the content `<form>` and only swaps `innerHTML`, so a template-root class won't update. (Remember: this class lands on the **form** → use the descendant CSS selector from Stage 0.)
  > **Ordering matters in `_applyLegacyRootClasses()`:** remove the stale `scheme-*` classes from the form **first, then call `super`** (which re-adds the current one via `_getLegacyRootClasses`). If you strip after `super`, you'd remove the class you just added:
  > ```js
  > _applyLegacyRootClasses(form, context) {
  >   form.classList.remove("scheme-republic","scheme-empire","scheme-dark","scheme-light","scheme-mercenary");
  >   super._applyLegacyRootClasses(form, context); // re-adds editable/locked, actor-type, and current scheme
  > }
  > ```
- **`onChange`** re-renders the current client's open Codex sheets so the swap is immediate. Client-scoped → **no socket, no other users affected**.
- *Optional later:* a one-tap header control that writes the client setting (gives the in-sheet button feel without changing the model).
- Coexists with the system's existing `CONFIG.FFG.theme` (starwars / genesys).

### Stage 5 — Apply to other actor types
- For each additional type: **copy** `ffg-${type}-sheet.html` → `codex-${type}-sheet.html`, repoint its gear/header partials, **add every new partial to `TemplateHelpers.preload()`**, then **widen the `types` array** in the Stage 0 registration to include it. (Registering a type before its template exists errors — templates first, registration second.)
- Adversary / minion / vehicle prototypes already anticipate this.
- Minions skip strain/healing — the system already branches for that.

**Full actor-type inventory (decide in or out of scope explicitly):**
| Type / template | Status |
|---|---|
| `character` | In scope (primary) |
| `nemesis`, `rival` | In scope |
| `minion` | In scope (no strain/healing) |
| `vehicle` | In scope |
| `homestead` (`ffg-homestead-sheet.html`) | **Decide** — exists in repo; not in original prototype. Recommend out of scope for v1. |
| **Adversary sheet** (`AdversarySheetFFG`, registered for `character` type via `ffg-adversary-sheet.html`) | **Decide** — it's a *separate registered sheet* for character actors, not an actor type. If a GM has it selected, our character reskin won't apply unless we also style this template. Recommend out of scope for v1, but note it so it isn't a surprise. |

---

## Caveats & guardrails
- **Codex is a separate registered sheet** (Stage 0) — originals are copied, never edited. Removal = unregister + delete copies.
- **Register only types whose `codex-*` templates exist** — v1 = `character` only; widen the `types` array as Stage 5 adds templates.
- **Copied sheets still include the original partials** — create `codex-*` partials for any markup change, repoint the includes, and **add them to `TemplateHelpers.preload()`** or they render empty.
- **`DEFAULT_OPTIONS.classes` must be the full set + `codex`** (`["starwarsffg","sheet","actor","v2","codex"]`), not just `["codex"]`.
- **`codex` lands on the window, `scheme-*`/actor-type on the form** → use descendant selectors (`.…codex form.scheme-empire`), not same-element.
- **`_getLegacyRootClasses()` override must call `super` and append** the scheme, or it drops the actor-type class layout depends on.
- **CSS scopes under `.starwarsffg.sheet.actor.codex`** and must load **after** the active UI theme — `system.json` `styles` is insufficient under the default `mandarBeskarAstromech` theme (see Stage 1).
- **Scheme = client setting** (`config:false`, surfaced via the system's custom UI Settings menu for consistency — `config:true` only if you want it in core settings), applied via the legacy-root-class hook every render. In `_applyLegacyRootClasses()`, **remove stale `scheme-*` first, then call `super`** (see Stage 4). Not a template-root bind, not an actor flag.
- **Per-row ENC is per-unit and won't sum to the Encumbrance block** (weapons/armour ×qty, equipped armour adjusted−3) — that's correct; pick per-unit rows or a carried-total column deliberately (see Stage 3).
- **No duplicate editable inputs** when relocating header fields; remember inputs use the legacy `data.*` prefix (see Stage 2).
- **Weapons need a new ENC value cell**; weapon/armour ENC should show base **and** adjusted, and the row sum may legitimately differ from the Encumbrance total due to the equipped-armour −3 rule (see Stage 3).
- **Force is a conditionally-hidden split pool**, not a plain stat — respect `enableForcePool` (see Stage 2).
- The rest button's effect depends on the `HealingItemAction` setting — label it "Rest", don't hard-promise "−1 wound".
- Keep edits to **templates + CSS + small listener/getData additions**. Do **not** touch `template.json` (data model) — every needed path exists.
- The `"v2"` class in `DEFAULT_OPTIONS.classes` is load-bearing for layout — keep it.
- Work on a branch off `V2-full`.
- Test in a v13 dev world with a **fully-populated** character (items dragged on), since pills and gear are item-driven — **and verify under the default `mandarBeskarAstromech` theme**, not just the retired `default` theme.

---

## Suggested first deliverable
Stage 0 + Stage 1 + Stage 3 together give something testable in Foundry immediately (**`character` type only**):
1. `CodexSheetFFG` registered as a selectable "Codex II Sheet" with `types: ["character"]`, `classes: ["starwarsffg","sheet","actor","v2","codex"]`, and a copied `codex-character-sheet.html`.
2. A copied `codex-weapon-armor-gear.html` (repointed include **+ added to `TemplateHelpers.preload()`**) — armour/gear ENC nodes uncommented, **weapon ENC value cells added**, bound to `item.system.encumbrance.value`.
3. A drop-in CSS file scoped to `.starwarsffg.sheet.actor.codex` with `form.scheme-*` palettes, **appended after the active UI theme in the `init` theme switch**.
4. The client `codexScheme` setting + the `_getLegacyRootClasses()` override (calling `super`).

**Remaining open questions:**
1. Match the **StarWars** theme baseline, or the generic Codex II look?
2. CSS delivery: **append-after-theme** (option 1) or **integrate into Mandar** (option 2)?
3. Weapon/armour/gear ENC: show **base only**, or **base + (adjusted)**?
4. Force in the header: **rating chip** (single, display-only) or **relocated committed/available pool**?
5. Actor types beyond `character` for v1 — and confirm `homestead` / Adversary sheet stay out of scope.
