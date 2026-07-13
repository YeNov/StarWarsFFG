# Codex II Theme Feature Documentation

Reference documentation for the Codex II sheet theme in the Star Wars FFG Foundry VTT
system. Companion to [`CODEX.md`](../CODEX.md) (short overview + licensing) and
[`codex-ii-roll-in-guide.md`](codex-ii-roll-in-guide.md) (adoption walkthrough); this
file is the exhaustive feature inventory.

## Overview

Codex II is an opt-in Foundry VTT v13 sheet theme for the Star Wars FFG system. It is not only a color skin: it registers separate ApplicationV2/DocumentSheetV2 actor and item sheets, uses bespoke `.cdx-*` markup, and keeps the existing Star Wars FFG game logic, item hooks, dice pools, drag/drop behavior, XP purchases, modifiers, and active effects intact.

The stock sheets remain the default. Codex II activates either when a document is explicitly assigned a Codex sheet through Foundry's Sheet configuration, or when the client-scoped Default Sheet Theme setting is set to a Codex II option and the document has no explicit sheet class.

## Requirements and Loading

- Requires Foundry VTT v13+ and the system's modern V2 sheet path.
- Codex actor templates are preloaded for character, minion, and vehicle sheets.
- Codex item templates are preloaded for generic items, gear, weapon, armour, talent, criticals, ship weapons, item attachments, ship attachments, force powers, specializations, and signature abilities.
- `styles/cdx.css` is appended after the active UI theme so Codex can override Mandar/default theme conflicts reliably.
- Every scheme also has its own stylesheet — `styles/cdx-republic.css`, `-empire.css`, `-dark.css`, `-light.css`, `-mercenary.css`, `-eldritch.css` — appended after `cdx.css`, in that order, **every time, for every scheme**, not just the active one. This is because different actors/items open by the same client can each be set to a different scheme. Republic loads first and doubles as the bare `.cdx form` fallback palette; every later `scheme-*` rule outranks it by specificity.
- All Codex CSS links use a timestamp cache buster during development.

## Selecting Codex II

The `Default Sheet Theme` setting is client-scoped and offers:

- `Default (system sheets)`
- `Codex II - Republic`
- `Codex II - Empire`
- `Codex II - Dark`
- `Codex II - Light`
- `Codex II - Mercenary`
- `Codex II - Eldritch Horror - Scholar`
- `Codex II - Eldritch Horror - Fate`

The Codex setting value is `codex-<scheme>`, so it selects both the Codex sheet family and the default color scheme for documents that do not have their own scheme flag.

This setting is registered with `config: false`, so it does **not** appear in Foundry's plain settings list. It lives in its own menu instead: **Game Settings → Configure Settings → Star Wars FFG → Configure Codex**. That menu is open to every client, not just the GM, since the theme choice is personal. The same window also holds **Advantages Heal Strain (House Rule)** — a world-scoped toggle, visible to the GM only, that changes the math for the native Post-Encounter strain recovery (see the strain-recovery bullet under Character/Rival/Nemesis/Adversary Features).

Documents with an explicit `flags.core.sheetClass` keep their chosen sheet. Actors and items can also store their own Codex color scheme in `flags.starwarsffg.scheme`.

## Registered Sheet Coverage

Actor sheets:

- Character
- Rival
- Nemesis
- Minion
- Vehicle
- Character-type Adversary Sheet, registered separately as `Codex II Adversary Sheet`

Item sheets:

- Weapon
- Armour
- Gear
- Talent
- Force power
- Specialization
- Signature ability
- Ship weapon
- Item attachment
- Ship attachment
- Ability
- Critical injury
- Critical damage
- Obligation
- Motivation
- Background
- Homestead upgrade

Career, species, and item modifier sheets are not registered as Codex item sheets.

## Color Schemes

Codex II supports six scheme families, one of which — Eldritch Horror — has two selectable variants, for seven scheme choices in total:

- Republic
- Empire
- Dark
- Light
- Mercenary
- Eldritch Horror – Scholar
- Eldritch Horror – Fate

Actor schemes are chosen from a palette control in the sheet window header. Item schemes are also chosen from the item window header, using the same shared picker. Both open a dialog grouped into a **Modern** panel (Republic/Empire/Dark/Light/Mercenary) and an **Eldritch Horror** panel (Scholar/Fate); clicking a choice applies it immediately. Item sheets inherit their owning actor's scheme if the item has no scheme flag. Both fall back to the selected Codex default scheme, then Republic.

The two Eldritch Horror variants share `styles/cdx-eldritch.css`, the same base paper-textured styling, and a typography alias, all scoped to `.cdx .scheme-eldritch`. They differ in surface texture and header ornament:

- **Scholar** — parchment/paper-grain surface texture, with a single procedural "medallion" sigil in the header.
- **Fate** — Calacatta marble surface texture, with a denser procedural "deco" sigil wall and a right-edge fade.

Both sigils are generated procedurally per actor/item (seeded from its UUID, with cloud/wear variation layered in), cached after first render, and deferred off the initial paint so the sheet still opens instantly. Documents still carrying the old, pre-split `eldritch` scheme flag are normalized to Scholar automatically.

## Shared Actor Sheet Features

Codex actor sheets keep stock sheet behavior but replace the layout:

- Bespoke notched panel visual language under `.cdx`.
- Active UI theme insulation by dropping legacy actor-type form classes from the Codex form root.
- Bespoke tab strip using `.cdx-tab` and `.cdx-pane`, independent of Foundry's standard sheet tab markup.
- Active tab is remembered across re-renders.
- Form overflow is forced inline so the Codex form becomes the scroll container even under Mandar CSS.
- Edit mode is reflected with `cdx-editmode` for Codex-specific chrome.
- GM status is reflected with `cdx-gm` so GM-only controls can hide for players.
- Per-document scheme class is kept clean by removing stale `scheme-*` classes before applying the current one.
- Stock listener hooks are preserved by keeping expected `name=`, `.item`, `.item-control`, `.rollable`, `.ffg-purchase`, and data attributes.

## Character, Rival, Nemesis, and Adversary Features

The character-family Codex sheet includes:

- Collapsible header with persistent per-actor collapsed state.
- Actor portrait, inline editable name, species pill, career pill, specialization stack, force-power stack, and signature-ability stack.
- Species and career pills open their item sheets directly.
- Stacked specialization, force power, and signature ability pills expand/collapse using the reusable `CdxPillStack` widget.
- Empty specialization, force power, and signature slots show buy prompts where applicable.
- XP chip for characters only, showing available and total XP.
- XP-buy mode toggled by clicking the XP chip; purchase affordances are transient and reset when the sheet closes.
- XP-buy mode is disabled while edit mode is active.
- Credits chip with comma formatting, raw digit editing on focus, and a transient add/subtract panel. Its label can be renamed system-wide from the general Localization settings (Credits/Obligation/Morality/Duty/Conflict label overrides); Codex reflects the override.
- Wounds and strain panels with plus/minus steppers, direct numeric editing, and live track updates.
- Wound and strain tracks render as pips for small thresholds and bars for large thresholds.
- Track color escalates green to amber to red as damage approaches threshold.
- Wounds are not capped at threshold, only floored at zero.
- Medical item uses display and existing medical item controls.
- Strain rest button runs Codex's own built-in post-encounter strain recovery: it opens a Cool-vs-Discipline dice-pool picker (pre-selecting whichever pool is statistically stronger), rolls it, and removes strain equal to successes — plus half of advantage, rounded down, when the "Advantages Heal Strain" house rule is on (the default). The result posts to chat and the actor updates automatically. This no longer depends on the token-action-hud-ffgsw module. If the actor has no strain to recover, or is missing the Cool/Discipline skill or characteristic, Codex shows a notification instead of opening the dialog.
- Defence panel with soak and separate melee/ranged defense displays.
- In locked view, defense 0 displays a dash, 1-4 displays black setback dice, and 5+ displays a digit.
- Defense dice are grouped into pairs to keep wrapping clean.
- Encumbrance warning appears on inventory headers when current encumbrance exceeds max.
- Force chip appears when the force pool is enabled.
- Force chip uses alignment coloring from Codex alignment state.
- Alignment selector in Bio supports Neutral, Good, and Evil.
- Morality hysteresis updates effective alignment: Neutral becomes Good at 71+ or Evil at 29-, Good stays Good until 29-, Evil stays Evil until 71+.
- Characteristics render as chips with full labels and two-letter abbreviations for narrow layouts.
- Skill groups are kept whole when split into two columns.
- Skill rows keep career skill/group skill toggles, rank inputs, and dice pool render nodes.
- Skill-rank purchase is fixed for Codex markup by resolving the clicked row through `data-ability`.

Character-family tabs:

- Skills
- Combat and Gear, or a single Inventory tab when Inventory Style is Combined
- Crits, with badge count
- Talents
- Bio
- XP, for characters only
- AEs

## Inventory Features

Codex inventory covers weapons, armour, and gear:

- Sheet Option `Inventory Style` supports Split and Combined modes for character, rival, nemesis, and minion sheets.
- Split mode uses Combat for weapons/armour and Gear for gear.
- Combined mode uses one Inventory tab with weapons, armour, and gear.
- Weapons and armour render as compact cards with image, title, key stats, and controls.
- Gear renders as matching cards with quantity, encumbrance, and controls.
- Item cards support stock edit/delete hooks.
- Weapon icons remain roll triggers.
- Weapon cards show the relevant combat skill and the actor's actual dice pool for that skill.
- Weapon cards show damage, crit, range, and encumbrance.
- Armour cards show soak, defense, hardpoints, and encumbrance.
- Gear cards show quantity steppers and encumbrance.
- Equipped toggle remains available for weapons and armour.
- Carried toggle exists for weapons, armour, and gear. Turning it off excludes the item from actor encumbrance.
- Gear carried toggles also sync gear active-effect enabled/disabled state.
- Inventory cards can be manually reordered within their own category by dragging the left-edge grip.
- Manual order is stored through Foundry item `sort` values.
- Fresh unsorted items fall to the bottom in name order.
- Card reorder updates optimistically without re-rendering, preserving scroll position.
- Cross-actor item drag/drop remains supported through the base sheet behavior.
- Expanded weapon cards can show an ammo chip when the item has ammo enabled.
- Ammo steppers update weapon ammo without collapsing the expanded card.
- Restricted items receive a Codex restricted style.

## Talent, Power, and Ability Features on Actor Sheets

The Talents tab includes:

- Force pool committed/available display when the force pool is enabled.
- Talent cards from the actor's prepared talent list.
- Talent activation labels, including compact `Active (OOT)` for out-of-turn activations.
- Directly added talents show an edit control.
- Talents that can be deleted show a delete control; talents granted by specializations/species show info instead.
- Ability cards.
- Force power cards with roll, edit, and delete controls.
- Signature ability cards with edit and delete controls.
- If an actor has force powers but the force dice pool is disabled, the sheet shows a conflict prompt with controls to enable the pool or remove force powers.
- Force power and signature ability cards expand inline details instead of immediately opening the item tree.

Right-click Send to Chat support is preserved through base sheet handling for item cards and Codex pills.

## Bio, XP, and Active Effects

Bio tab features:

- ProseMirror biography editor.
- Character descriptive fields: gender, age, height, build, hair, eyes.
- Alignment selector when force pool is enabled.
- Character obligation, morality, and conflict panels. Their labels (and Duty, where used) can be renamed system-wide from the general Localization settings.
- Obligation/morality item table with edit and remove controls.

XP tab features:

- Available and total XP fields.
- XP adjustment, export, and import controls.
- XP log entries.
- Refund control for purchased and adjusted entries.

AEs tab embeds the shared active-effects partial inside the Codex tab system.

## Minion Sheet Features

The Codex minion sheet has its own layout:

- Collapsible header with portrait, name, and minion type pill.
- No strain, force, XP, or credits header elements.
- Group Strength panel showing alive/max members.
- Group Strength plus/minus steppers kill or revive one member while preserving partial wounds on the current member.
- Wipe Out button eliminates the group through the system minion helper.
- Combined Wound Pool panel groups wound segments by member.
- Wounds-per-member value is editable in edit mode.
- Group size and wounds-per-member changes explicitly re-render so derived alive count and wound pool stay current.
- Defence panel mirrors the character-family defense display.
- Skills tab uses group skill toggles instead of career skill toggles.
- Inventory can be Split or Combined just like character-family sheets.
- Tabs: Skills, Combat/Gear or Inventory, Crits, Talents, Bio, AEs.

## Vehicle Sheet Features

The Codex vehicle sheet includes:

- Bespoke vehicle header with portrait, multiline name, vehicle type pill, and starship pill when applicable.
- Silhouette, speed, handling, and armour chips.
- Speed uses a ratio chip with a white-to-red-orange background based on speed/max.
- Hull Trauma and System Strain panels with steppers and live pips/bar tracks.
- Systems panel with hyperdrive, backup hyperdrive, sensor range, consumables, navicomputer, crew count, passenger capacity, customization hardpoints, and space-vehicle flag.
- Four-zone defense panel with a top-view silhouette image and fore/aft/port/starboard shield ratio chips.
- Shield chips use the reusable ratio-chip component without a max.
- Weapon Systems tab for ship weapons.
- Attachments tab for ship attachments with hardpoint usage summary.
- Critical Hits tab with badge count.
- Crew tab showing crew cards with role, roll, edit role, and remove controls.
- Cargo tab for non-ship inventory items with gear-card styling and encumbrance summary.
- Bio tab with rarity, compact cost display, and vehicle description editor.
- AEs tab for active effects.

Vehicle derived data includes hull/system-strain tracks, hardpoints used by attachments, crew count, critical damage count, compact cost formatting, and speed percentage for the speed chip.

## Item Sheet Features

All Codex item sheets share:

- Opt-in `Codex II Item Sheet` registration.
- `.cdx` style scope and scheme class handling.
- Per-item scheme picker in the window header.
- Item scheme fallback to owning actor scheme, then default Codex scheme.
- Bespoke tab switching with active-tab memory.
- Form overflow fix for theme compatibility.
- Localized type pill in the header.
- Comma-formatted price fields that store numbers safely.
- Digits-only numeric fields for Codex numeric inputs.
- `(R)` restricted toggle for rarity where present.
- Sources and Tags tabs on supported item sheets.
- Shared modifier partials are reused so Active Effects and modifiers continue to work.

## Weapon Item Sheet

Weapon items include:

- Type pill, condition/status selector, name, skill/characteristic subtitle, image, and stat grid.
- Editable damage, crit, range, encumbrance, hardpoints, price, and rarity.
- Adjusted-value badges for modified damage, crit, encumbrance, and hardpoints.
- Green/red better/worse classes for adjusted values.
- Quality pills with tooltips.
- Description editor.
- Tabs for Qualities, Attachments, Configuration, Modifiers, Sources, and Tags.
- Configuration tab includes skill, characteristic, ammo current/max when ammo is enabled, and Special editor.
- Skill/characteristic changes live-update the header subtitle and force a re-render so adjusted values stay current.

## Armour Item Sheet

Armour items include:

- Type pill, condition/status selector, name, image, and stat grid.
- Editable soak, defense, encumbrance, hardpoints, price, and rarity.
- Adjusted-value badges for encumbrance and hardpoints.
- Quality pills with tooltips.
- Description editor.
- Tabs for Qualities, Attachments, Modifiers, Sources, and Tags.

## Gear Item Sheet

Gear items include:

- Type pill, name, image, quantity, encumbrance, optional price, and optional rarity.
- Restricted toggle when rarity is enabled.
- Quality pills with tooltips.
- Description editor.
- Tabs for Modifiers, Sources, and Tags.

## Talent Item Sheet

Talent items include:

- Type pill and name.
- Tier field.
- Activation dropdown.
- Rank field when the talent is ranked.
- Ranked, Force Talent, and Conflict checkbox cards.
- Description editor.
- Tabs for Modifiers, Sources, and Tags.

## Critical Injury and Critical Damage Item Sheet

Critical items share one Codex template:

- Type pill and name.
- Image.
- d100 low/high range fields.
- Severity dropdown.
- Description editor.
- Tabs for Modifiers, Sources, and Tags.

## Ship Weapon Item Sheet

Ship weapons mirror personal weapons with vehicle-specific differences:

- Type pill, status selector, name, skill subtitle, image, and stat grid.
- Editable damage, crit, vehicle range, encumbrance, hardpoints, price, and rarity.
- Firing arc panel for fore, aft, port, starboard, dorsal, and ventral arcs.
- Quality pills with tooltips.
- Description editor.
- Tabs for Qualities, Attachments, Special, Modifiers, Sources, and Tags.
- Special tab includes weapon skill and special text.

## Attachment Item Sheets

Item attachments include:

- Type pill, name, image, hardpoints required, encumbrance, price, rarity, and attachment type.
- Description editor.
- Modifications tab using stock modification markup so standalone attachment handlers continue to bind.
- Base Mods tab with item qualities/base modifiers.
- Sources and Tags tabs.

Ship attachments include:

- Type pill, name, image, hardpoints required, encumbrance, price, and rarity.
- Description editor.
- Tabs for Modifiers, Sources, and Tags.

## Generic Item Frame

The fallback Codex item frame is used for simple registered item types that do not have a more specific template. It provides:

- Type pill and name.
- Image.
- Quality pills when item modifiers exist.
- Description editor.
- Modifiers, Sources, and Tags tabs.

## Progression Tree Item Sheets

Codex II implements bespoke `.cdx-ft-*` tree layouts for force powers, specializations, and signature abilities. These do not reuse stock `.talent-*` tree markup, but they preserve the system's data bindings and behavior hooks.

Shared tree features:

- Compact Codex tab strip.
- Full-width notched banner for the base power/specialization/ability.
- Transient per-session edit mode toggled by the pen button.
- Read-only mode hides connector toggles, resize controls, and edit-only cogs.
- Node cards show learned state, name, description, cost, and modifier cog.
- GM-only learned checkboxes.
- Buy glyphs render only when the base item is owned and the node can be purchased.
- Up and right connector lines show prerequisites.
- Connector lines glow when both endpoints are purchased.
- Popout editors are preserved for base and node descriptions.
- Hidden inputs preserve required system data on submit.
- Sources and Tags tabs are included.

Force power tree:

- Uses `system.upgrades`.
- Four-column size-aware grid.
- Nodes can span 1-4 columns.
- Edit mode supports top links, right links, combine, and split.
- Banner shows required Force Rating, base power name, basic power label, description, base cost, modifier cog, edit toggle, and image control.
- Upgrade buy action uses `forcepower-upgrade`.

Specialization tree:

- Uses `system.talents`.
- Four-column, five-tier tree.
- Talent nodes are single-cell only.
- Supports one top link and one right link per node.
- Talent drag/drop targets are preserved through `.specialization-talent` and `data-itemid`.
- Per-tier XP cost is shown in the card foot.
- Cards mark passive/active activation styling.
- Force, conflict, and ranked markers display on nodes.
- Skills tab includes career-skill selectors and the Universal specialization toggle.
- Upgrade buy action uses `specialization-upgrade`.

Signature ability tree:

- Uses `system.upgrades`.
- Size-aware grid like force powers.
- Banner has base ability name, base ability label, description, base cost, modifier cog, edit toggle, and image control.
- Uplink bar above the banner has four edit-mode connection points linking the base ability upward to owning specializations.
- Per-node XP cost is formula-derived and persisted through hidden inputs.
- Upgrade buy action uses `signatureability-upgrade`.

## Dice and Dialog Styling

Codex also affects related UI:

- Dice roll dialogs receive a `cdx-dice` marker only when the rolling actor uses a Codex sheet.
- Codex dice styling removes the white pool background and applies dark-scheme glyph/icon treatment where appropriate.
- Embedded item editor dialogs receive `cdx` and `cdx-embed` only when the host item resolves to the Codex item sheet.
- Popout editors and modifier dialogs are restyled where they are hosted from Codex sheets.

## Compatibility and Preservation of Stock Behavior

Codex II is designed as a view replacement, not a data-model rewrite:

- The actor and item data models remain the Star Wars FFG models.
- Stock sheet listeners still handle most game actions.
- Existing item edit/delete/add, quantity, equip, medical, roll, XP purchase, modifier, attachment, active-effect, and drag/drop hooks are preserved.
- Cross-actor item transfer is preserved for Codex card markup.
- The Codex carried flag is respected by derived encumbrance calculation.
- The system normalizes stale legacy `defaultSheetTheme` values that no longer exist.

## Main Implementation Files

- `CODEX.md`
- `modules/actors/codex-sheets.js`
- `modules/actors/codex-fated-sigil.js`
- `modules/actors/cdx-pill-stack.js`
- `modules/items/codex-item-sheet.js`
- `modules/swffg-main.js`
- `modules/settings/settings-helpers.js`
- `modules/settings/ui-settings.js`
- `modules/actors/actor-ffg.js`
- `modules/items/item-ffg.js`
- `modules/items/item-sheet-ffg.js`
- `modules/items/item-editor.js`
- `modules/dice/roll-builder.js`
- `templates/actors/codex/`
- `templates/parts/codex/`
- `templates/items/codex/`
- `styles/cdx.css` and one `styles/cdx-<scheme>.css` per scheme family (republic, empire, dark, light, mercenary, eldritch)
- `images/codex/eldritch/`
- `docs/codex-force-tree-design.md`
- `tests/codex-schemes.test.js`

## Notes and Current State

The root `CODEX.md` still frames progression trees as v2/roadmap work and only calls out the force-power tree as landed. The live implementation already ships force-power, specialization, and signature-ability tree templates as registered Codex item sheets (see Progression Tree Item Sheets above) — treat this document as authoritative over `CODEX.md`'s roadmap section for tree status.
