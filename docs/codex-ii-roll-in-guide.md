# Codex II Roll-In Guide

Audience: GMs, players, and world maintainers moving a Star Wars FFG Foundry VTT world onto the Codex II sheets.

This is a practical adoption guide. For the exhaustive feature inventory, see [`codex-ii-theme-features.md`](codex-ii-theme-features.md).

## 1. What Codex II Is

Codex II is an optional sheet family for the Star Wars FFG system. It changes the actor and item sheet experience while keeping the same underlying actors, items, dice pools, XP, modifiers, active effects, and game data.

Use it when you want:

- A more compact, purpose-built character sheet.
- Color schemes per actor or item.
- Better card-style inventory views.
- Dedicated minion and vehicle layouts.
- Codex progression trees for force powers, specializations, and signature abilities.

Codex II does not require rebuilding characters. Existing actors and items can be opened with Codex sheets if their type is supported.

## 2. Before You Roll It In

Recommended checks before switching a live group:

1. Confirm the world is running Foundry VTT v13 or newer.
2. Confirm the Star Wars FFG system build is running the modern ApplicationV2 / DocumentSheetV2 sheet path. Codex II does not run on legacy V1-only sheet builds.
3. Confirm the Star Wars FFG system build includes Codex II.
4. Back up the world before changing sheet defaults.
5. Pick one test actor with a full inventory, talents, criticals, and force powers if possible.
6. Open that actor with Codex II first and confirm the data looks correct.
7. Tell players that the data model is the same; only the sheet UI changes.

## 3. Enabling Codex II Globally

To make new or unconfigured supported documents open as Codex II:

1. Open Game Settings.
2. Open Configure Settings.
3. In the Star Wars FFG section, click **Configure Codex**. This opens a dedicated Codex Settings window — Default Sheet Theme is no longer listed directly in the plain settings list.
4. Find Default Sheet Theme.
5. Pick one of the Codex II options:
   - Codex II - Republic
   - Codex II - Empire
   - Codex II - Dark
   - Codex II - Light
   - Codex II - Mercenary
   - Codex II - Eldritch Horror - Scholar
   - Codex II - Eldritch Horror - Fate
6. Reload if Foundry prompts or if sheets do not immediately change.

Important: this setting is client-scoped. Each user can have their own Default Sheet Theme setting. The Configure Codex menu itself is open to every user (not GM-restricted), since the theme choice is personal — but the same window also has an **Advantages Heal Strain (House Rule)** toggle that only the GM can see and change, since it affects the whole table (see section 9, Recover Strain).

## 4. Enabling Codex II Per Actor or Item

For a specific actor or item:

1. Open the actor or item sheet.
2. Open Foundry's sheet configuration for that document.
3. Choose Codex II Sheet for supported actors, or Codex II Item Sheet for supported items.
4. Save the sheet configuration.

Per-document sheet choices override the Default Sheet Theme setting. This is useful when one player wants Codex II and another actor should remain on the stock sheet.

## 5. Supported Actor Types

Codex II supports these actor sheets:

- Character
- Rival
- Nemesis
- Minion
- Vehicle
- Character-type Adversary Sheet

Homestead actors are not part of the Codex II actor sheet set.

## 6. Supported Item Types

Codex II supports these item sheets:

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

These keep their stock item sheets:

- Career
- Species
- Item modifier

## 7. Choosing Color Schemes

The Default Sheet Theme chooses the default Codex color scheme for unconfigured documents.

You can override the scheme per actor or item:

1. Open a Codex actor or item sheet.
2. Use the palette control in the window header.
3. In the dialog, choose a scheme from the **Modern** panel (Republic/Empire/Dark/Light/Mercenary) or the **Eldritch Horror** panel (Scholar/Fate).
4. The choice is saved on that actor or item immediately.

Available schemes:

- Republic
- Empire
- Dark
- Light
- Mercenary
- Eldritch Horror – Scholar
- Eldritch Horror – Fate

The two Eldritch Horror variants each get a unique procedural sigil ornament in the header, generated per actor/item: Scholar shows a single medallion sigil on a paper-grain surface, Fate shows a denser sigil wall on a marble surface. Actors/items still carrying the old, pre-split `eldritch` scheme are opened as Scholar automatically.

Items inherit their owning actor's scheme unless the item has its own item scheme.

## 8. Player Quick Tour

When introducing players to Codex II, show these areas first:

- Header: portrait, name, species, career, specialization/force/signature pills, XP, and credits.
- Skills tab: characteristics, force chip if enabled, skill rows, dice pools, and rank controls.
- Combat tab: weapons and armour.
- Gear tab: inventory gear and quantity controls.
- Talents tab: talents, abilities, force powers, and signature abilities.
- Bio tab: biography, descriptive fields, obligation/morality/conflict.
- XP tab: XP totals and log, for character actors.
- AEs tab: active effects.

For minions, focus on Group Strength and Combined Wound Pool.

For vehicles, focus on speed, hull trauma, system strain, four-zone shields, crew, weapons, attachments, and cargo.

## 9. Common Player Actions

### Roll a Skill

Use the dice pool shown on the skill row. Weapon cards also show the relevant skill and pool; click the weapon image/icon to roll the weapon.

### Buy With XP

On character sheets:

1. Click the XP chip in the header.
2. Purchase icons appear where purchases are available.
3. Click the purchase icon for a skill, characteristic, specialization, talent, force power, or signature ability.
4. Click the XP chip again to hide purchase controls.

XP-buy mode is temporary and resets when the sheet closes. It is disabled while edit mode is active.

### Change Credits

Use the CR chip in the header.

- Click the credits field to type a full value directly.
- Click Change to open the add/subtract panel.
- Choose plus or minus, enter an amount, and confirm.

The display uses commas, but stored credits remain numeric.

### Adjust Wounds or Strain

Use the plus/minus buttons on the Wounds or Strain panels. You can also edit the current and threshold values directly when you have permission.

Wounds and strain can exceed the threshold. Codex only prevents them from going below zero.

### Recover Strain

Click the strain recovery button on the Strain panel.

Codex opens its own Cool-vs-Discipline dice-pool picker, pre-selecting whichever pool is statistically stronger. Roll it, and Codex removes strain equal to your successes. If the GM has the **Advantages Heal Strain** house rule on (the default), every 2 advantages also heal 1 additional strain. The result is posted to chat and the actor's strain updates automatically.

This no longer depends on the token-action-hud-ffgsw module — the recovery dialog is fully built into Codex. If the actor has no strain to recover, or is missing the Cool or Discipline skill/characteristic, you'll see a notification instead of the dialog.

### Equip or Carry Items

Weapon and armour cards have an equip toggle.

Weapon, armour, and gear cards also have a carried toggle. Turn carried off when the item is left on a ship, base, pack animal, or stash and should not count toward encumbrance.

### Reorder Inventory Cards

If you can edit the actor, drag the small card grip on weapon, armour, or gear cards. Cards can be reordered within their own category.

### Use Ammo

If a weapon has ammo enabled, its expanded weapon card can show an ammo chip. Use the plus/minus controls to update current ammo without collapsing the card.

### Open Trees

Click specialization, force power, or signature ability pills/cards to open their Codex item sheets. Multi-pill stacks expand first; then selecting a pill opens that item's tree.

## 10. GM Setup Checklist

For a smooth campaign roll-in:

1. Back up the world.
2. Set your own Default Sheet Theme to a Codex II scheme (Configure Settings → Star Wars FFG → Configure Codex).
3. Open a test character, minion, and vehicle.
4. Confirm item cards, rolls, XP purchases, and active effects behave as expected.
5. Decide whether the **Advantages Heal Strain** house rule (same Configure Codex window, on by default) matches your table.
6. Pick a house default scheme for the campaign.
7. Decide whether players may choose their own actor schemes.
8. For each player character, open the sheet and choose a per-actor scheme if desired.
9. Check force users have Force Pool enabled if they have force powers.
10. Check inventory encumbrance after using the carried toggle.
11. Teach players the XP chip, carried toggle, and pill stacks.

## 11. Recommended Roll-In Plan

### Phase 1: GM Trial

Use Codex II privately as GM for one session or prep cycle. Test NPCs, vehicles, and one copied player character.

### Phase 2: Player Preview

Ask players to open their characters with Codex II. Let them choose a scheme and click through tabs. Do not ask them to make permanent changes yet.

### Phase 3: Live Session

Use Codex II at the table for normal rolls, wounds, strain, gear, and XP. Keep stock sheets available as a fallback.

### Phase 4: Clean-Up

After the session, fix any actors with incorrect sheet choices, missing force pool settings, or items that should be marked not carried.

## 12. Progression Tree Guide

Codex II tree sheets exist for force powers, specializations, and signature abilities.

For players:

- Learned nodes are highlighted.
- Purchase icons appear only when a node can be bought.
- Lines glow when both connected nodes are learned.
- Descriptions can be opened or edited through popout editors when permitted.

For GMs or builders:

- Use the pen button to enter tree edit mode.
- Edit mode is temporary and per window session.
- Force power and signature ability nodes can be combined or split when allowed.
- Top and right connector toggles appear in edit mode.
- Signature abilities also have an uplink bar above the base ability.
- Specialization trees have a Skills tab for career skills and the Universal toggle.

## 13. Minion Guide

Use the minion sheet differently from a character sheet:

- Group Strength shows current living members and maximum group size.
- The minus button removes one member while preserving partial wounds on the current member.
- The plus button revives one member when possible.
- Wipe Out eliminates the entire group.
- Combined Wound Pool shows wound segments grouped by member.
- Wounds per member can be edited in edit mode.
- Group skills use group-skill toggles instead of career-skill toggles.

## 14. Vehicle Guide

The vehicle sheet is organized around vehicle play:

- Speed, silhouette, handling, and armour are shown as top chips.
- Hull Trauma and System Strain use the same stepper and track style as character wounds/strain.
- Four-zone defense shows fore, aft, port, and starboard shields around the vehicle image.
- Systems panel keeps hyperdrive, sensors, consumables, navicomputer, crew count, passenger capacity, hardpoints, and space-vehicle status together.
- Weapon Systems lists ship weapons.
- Attachments shows ship attachments and hardpoint usage.
- Crew lists crew roles and roll controls.
- Cargo holds non-ship inventory.

## 15. Troubleshooting

### A player does not see Codex II

Check whether their client Default Sheet Theme is still Default. The setting is per client. Also check whether the actor has an explicit non-Codex sheet class selected.

### I can't find Default Sheet Theme in Configure Settings

It moved into its own menu. Open Configure Settings → Star Wars FFG → **Configure Codex**, and Default Sheet Theme will be inside that window.

### An actor opens with the wrong Codex color

Open the palette control in the sheet header and choose a scheme. Actor scheme flags override the default setting.

### An item opens with a different scheme than the actor

The item may have its own scheme flag. Open the item palette control and select the desired scheme, or leave it aligned with the actor manually.

### Force powers appear but the force pool is missing

Enable the actor's force pool in sheet options/configuration. Codex shows a conflict prompt on the Talents tab when force powers exist but the force dice pool is disabled.

### Encumbrance looks too high

Check carried toggles on weapons, armour, and gear. Items marked not carried are excluded from encumbrance.

### Gear active effects seem disabled

Toggle the gear carried state off and back on. Gear carried state syncs the gear item's active effects.

### The strain recovery button shows an error instead of the picker

The actor is missing the Cool or Discipline skill/characteristic — Codex's built-in strain recovery needs both. Add the missing skill/characteristic to the actor.

### The Codex sheet does not appear in sheet configuration

Confirm the document type is supported. Career, species, item modifier, and homestead actor sheets are not Codex-registered.

### Tree edit controls are missing

Click the pen button on the tree sheet. Edit mode is temporary and is not the same as the stock persisted edit state.

### A purchase icon is missing

Check that XP-buy mode is active on actor sheets, or that the base tree item is owned and the node is purchasable on tree sheets. Also check edit mode; actor XP-buy mode is disabled while actor edit mode is active.

## 16. Suggested Player Handout

Short version to give players:

1. Use the tabs across the middle to move around the sheet.
2. Click the XP box to show or hide purchase buttons.
3. Click weapon images to roll attacks.
4. Use suitcase icons to mark gear as carried or left behind.
5. Use plus/minus buttons for wounds, strain, ammo, and similar counters.
6. Click stacked pills for specializations, force powers, and signature abilities.
7. Use the palette button in the sheet header to choose your color scheme.
8. Ask the GM before using tree edit mode.

## 17. What Not To Change During Roll-In

Do not rebuild actors just to use Codex II.

Do not delete and recreate items unless there is a real data problem.

Do not turn on every player's Default Sheet Theme without warning them first, because the setting is personal and changes how their sheets open.

Do not use tree edit mode during live play unless you are intentionally editing the tree layout.

## 18. Rollback

If someone wants to go back to the stock sheets:

1. Set Default Sheet Theme back to Default (system sheets) for that client.
2. For any document with an explicit Codex sheet, open sheet configuration and choose the stock sheet.
3. Leave actor and item data untouched.

Codex II stores display choices and uses the same underlying Star Wars FFG data, so rolling back the sheet UI should not remove character data, items, XP, or effects.
