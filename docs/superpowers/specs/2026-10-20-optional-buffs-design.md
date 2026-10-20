# Optional buffs — design

**Date:** 2026-10-20
**Branch:** `feat/optional-buffs` (on top of `fix/roll-crit-breach`)

## Why

Some bonuses only apply in a particular situation: "+1 Boost on Charm, Negotiation and Deception
when dealing with Hutt Cartel members", "+1 Skill Rank in Stealth while the cloak's hood is up".
Today every modifier row on an item applies to every roll it can reach. The only switch is the
row's **Enabled** box, which stays as it was set until someone changes it, so situational bonuses
end up added by hand in the dice dialog, or forgotten.

An **optional buff** is a named group of modifier rows on an item that does nothing until the
player ticks it, by name, in the roll dialog for the roll it applies to.

## What the user decided

1. An optional buff is created on a **weapon, armour, gear, talent or attachment** item.
2. It has a **name**. That name is what the player sees in the roll dialog.
3. It holds modifier rows using the **existing modifier types**: Roll Modifiers, Dice Modifiers,
   Result Modifiers, the Skill Add … types, Skill Boost, Skill Rank, Skill Remove Setback and
   Skill Setback. When the player ticks the buff, those rows apply to that roll.
4. Buffs are edited on the classic item sheets **and on the Codex II item sheets**, each with an
   editor of its own.
5. The classic actor sheet gains the **carried** toggle that today only the Codex inventory has.

Confirmed when played back to the user, or decided after review:

- Types that change no dice (Stat, Characteristic, Weapon / Armor / Vehicle Stat) are not offered.
- Which items offer their buffs:
  - **armour** only while **equipped**;
  - **weapons and gear** while the actor has them and they are **not marked "not carried"**;
  - **talents** whenever the character has the talent;
  - **attachments** whenever the weapon or armour they are installed on counts.

  (The first version said equipped weapons and armour. New weapons start unequipped and most
  attacks are made with unequipped weapons, so the user changed it.)
- A buff **counts the number of items**: its rows are multiplied by the item's quantity.
- **Force power rolls get no buffs.**
- When a buff shows up in the roll dialog depends on each row's type:
  - **Skill rows** (Skill Boost: Charm, and the rest): only on rolls of that skill. A buff with
    Charm, Negotiation and Deception rows shows on all three.
  - **Roll, Dice and Result Modifiers on a weapon** (or an attachment installed on it): only on
    attacks made with that weapon.
  - **Roll, Dice and Result Modifiers on anything else**: on every roll.
- Every buff starts **unticked** on every roll. Ticking it updates the dice preview at once.
  **Skill Rank** raises the skill's rank for that roll only, so the ability and proficiency dice
  are rebuilt.
- The chat card lists which buffs were used. Nothing is used up: the buff is there again on the
  next roll.

## Goals

- A GM or player can give a weapon, armour, gear, talent or attachment any number of named
  optional buffs, each with any number of rows, from either the classic or the Codex II sheet.
- The roll dialog offers exactly the buffs that can affect the roll being made, unticked.
- A ticked buff changes the pool as the same rows would as ordinary modifiers.
- The posted card says which buffs were used.
- The carried toggle works the same on both actor sheets.

## Non-goals

- Optional buffs on species, careers, specializations (as items: the talents learned in their
  trees do count), force powers, signature abilities, ship weapons, ship attachments, vehicles,
  or an attachment's own modifications.
- Working out by itself when a buff applies (factions, targets, scene). The player decides.
- Remembering what was ticked between rolls.
- Translations beyond English. Other languages fall back to the English strings.

## Anti-goals (a failure even if it otherwise works)

- **A buff that applies while unticked.** Optional rows must never become Active Effects, never
  count in a skill's stored dice (`system.skills.<skill>.boost` and the rest), and never show in
  the sheet's skill or weapon dice preview.
- **Ticking and unticking that leaves the pool changed.** Dice the player added or removed by hand
  in the dialog must survive any sequence of ticks.
- **Changing what existing items or modifiers do.** No migration of existing data; an item
  without buffs behaves exactly as before.

## Constraints

- Items use V14 TypeDataModels (`modules/data/item-templates.js`, `modules/data/models/item/`).
  The new field must be declared on the weapon, armour, gear, talent and attachment models, or
  Foundry strips it on save. The talent entries inside a specialization tree are untyped
  (`modules/data/models/item/_tree-fields.js`), so they need no schema change, but the code that
  copies a dropped talent into the tree copies named fields one by one and must copy the buffs
  too. Check `modules/data/conformance-report.js` still passes.
- Decisions go in modules free of Foundry globals, covered by Node tests (`tests/node/`, see
  `tests/README.md` and the stub boundary). Sheets, dialogs and chat stay in thin Foundry-side
  code, as `apply-damage-plan.js` / `apply-damage.js` and `roll-costs.js` / `roll-builder.js` do.
- Codex II is a self-contained package inside the system (`codex/`), on its way to its own module.
  Its editor reaches the system only through the public API (`modules/api/public-api.js`), and
  `tests/node/codex-boundary.test.mjs` and `tests/node/public-api-surface.test.mjs` must keep
  passing. Anything new the API exposes bumps `PUBLIC_API_VERSION`, as that file describes.
- Classic sheet CSS goes in `styles/mandar.css`. `styles/starwarsffg.css` is hand-maintained: do
  not commit `npm run compile` output for it. Codex styles stay in `codex/styles/`.
- English strings in `lang/en.json` (and the Codex package's own `codex/lang/` for Codex labels).
- A `CHANGELOG.md` entry under `Unreleased`, and the wiki tutorial updated (see Documentation).

## How it works

### Data

Weapon, armour, gear, talent and attachment items gain a list of optional buffs. Each buff has a
stable id, a name, and rows shaped like the item's ordinary modifier rows in `system.attributes`
(`modtype`, `mod`, `value`), so the existing type and target choices can be reused as they are.

Buffs travel with the copies the system already makes: a talent learned in a specialization tree
carries its buffs into the tree entry the way it carries `attributes` today, and an attachment
installed on a weapon or armour carries them in the installed copy (`system.itemattachment`).

### Which items count

The rolling actor's items:

- **armour** only while it is **equipped** (`system.equippable.equipped`);
- **weapons** and **gear** while the actor has them, unless marked **not carried**
  (`flags.starwarsffg.carried === false`), equipped or not;
- **talents** the character has: talent items (including those a species adds) and talents
  learned in a specialization tree, the same set the sheet's talent list shows;
- **attachments** installed on a weapon or armour that counts by the rules above.

### Which buffs a roll offers

For each buff, keep the rows that can affect this roll:

| Row type | Applies when |
| --- | --- |
| Skill Add …, Skill Boost, Skill Rank, Skill Remove Setback, Skill Setback | the row's target is the skill being rolled |
| Roll, Dice or Result Modifiers on a weapon, or on an attachment installed on it | the roll is made with that weapon |
| Roll, Dice or Result Modifiers on armour, gear, a talent, or an attachment on armour | always |

A buff is offered when at least one of its rows applies; ticking it applies only those rows. The
dialog therefore needs the **skill key** being rolled (today it is given the skill's display
label), the **characteristic value** and the **rank**, and the weapon when there is one. A roll
opened without an actor offers nothing.

A **Force power** roll (the Force-dice-only pool opened from a power on the sheet) offers no
buffs.

### What a ticked row does to the pool

The same as the row would as an ordinary modifier:

| Row | Pool change |
| --- | --- |
| Skill Boost N | +N boost |
| Skill Setback N | +N setback |
| Skill Remove Setback N | +N removed setback |
| Skill Add Success / Advantage / Triumph / Light / Failure / Threat / Despair / Dark N | +N of that result |
| Skill Add Upgrade N | upgrade the ability dice N times |
| Skill Rank N | rebuild the positive dice for rank + N: ability = max(characteristic, rank + N), upgraded min(characteristic, rank + N) times, applied as the difference from the dice the original rank gave |
| Roll Modifiers: Add Boost / Add Setback / Remove Setback | as for a weapon's ordinary modifiers |
| Result Modifiers: Add … | as for a weapon's ordinary modifiers |
| Dice Modifiers: Add / Upgrade / Downgrade Difficulty, Upgrade / Downgrade Ability | as for a weapon's ordinary modifiers |

The reference semantics are `ModifierHelpers.getDicePoolModifiers` (`modules/helpers/modifiers.js`)
for Roll / Dice / Result rows, and `DiceHelpers.rollSkill` (`modules/helpers/dice-helpers.js`) for
how a skill's rank, characteristic and stored skill dice become the pool.

**How many times a row counts:**

- Weapon, armour and gear: each row's value is multiplied by the item's **quantity**
  (`system.quantity.value`), as ordinary gear modifiers are. A "Skill Boost: Stealth 1" buff on a
  stack of three cloaks adds three boost. This is the user's rule and deliberately goes further
  than ordinary modifiers, which scale by quantity on gear only, not on weapons or armour.
- Exception: a weapon's own Roll, Dice and Result rows on an attack **with that weapon** count
  once, since one weapon makes the attack. *(Builder's call.)*
- Talents: each row's value is multiplied by the talent's **ranks**, as a ranked talent's ordinary
  modifiers are. An unranked talent counts once. *(Builder's call.)*
- Attachments: count as the item they are installed on counts (its quantity, and the same
  once-per-attack exception on a weapon). *(Builder's call.)*

### Roll dialog

An **Optional buffs** section lists the offered buffs as checkboxes labelled with the buff's
name; the item it comes from may show as a hint. All start unticked.

The dialog already keeps the player's pool (with their manual edits) apart from what it layers on
top for the targeted defence and the Adversary upgrades (`_effectivePool` in
`modules/dice/roll-builder.js`). Ticked buffs join that layer: the preview, the simulation and the
roll all use base pool + ticked buffs, so ticking and unticking never disturbs manual edits.

**A pool the GM sends to a player.** The roll dialog's share button (GM only) posts the pool to a
chosen player, who rolls it from the chat message in a dialog of their own. Buffs the GM ticked
are already in that pool: the player's dialog shows them ticked and locked, and still offers the
character's other buffs. *(Builder's call.)*

### Chat card

The card shows a line naming the buffs used, in the same way as the vehicle defence-zone line
(`defenceZoneText` in `modules/dice/roll.js` and `templates/dice/roll-ffg.html`). With no buff
ticked there is no line.

### Item sheets

**Classic** weapon, armour, gear, talent and attachment sheets: below the Modifiers list on the
Modifiers tab, an **Optional buffs** block with a + to add a buff. Each buff shows its name field,
a + to add a row, a delete control, and its rows with the type / target / value pickers of the
Modifiers list, limited to the row types above. Editable only where the sheet is editable.

**Codex II** weapon, armour, gear, talent and attachment sheets: an Optional buffs editor in
Codex style, with the same abilities, built inside the Codex package and reaching the data
through the public API.

### Carried toggle on the classic actor sheet

The classic actor sheet's inventory rows for weapons, armour and gear gain the carried toggle the
Codex inventory has. Both write the same flag (`flags.starwarsffg.carried`), so a choice made on
either sheet shows on the other. Its existing meanings stay: a not-carried item leaves the
actor's encumbrance (`ActorFFG#_calculateDerivedValues`), and gear's own effects follow it
(`modules/items/item-ffg.js`). Under this design it also stops a weapon or gear item offering its
buffs.

## Left to the builder

- The exact stored shape, ids and field names.
- Layout and styling of the sheet blocks, the Codex editor and the dialog section, and the look
  of the classic carried toggle.
- How the skill key, characteristic and rank reach the roll dialog from each place that opens it
  (`DiceHelpers.rollSkill`, `rollItem`, `rollSkillDirect`, crew rolls, macros). A place that
  cannot supply them offers only the buffs that do not need them.
- Wording of labels and hints.

## Testing

Node tests for the parts free of Foundry:

- which rows of which items a roll offers: skill match; the weapon being used and its
  attachments; armour, gear, talent and armour-attachment Roll / Dice / Result rows always;
  unequipped armour, not-carried weapons and gear, and their attachments left out; unequipped
  weapons and gear included; talents from items and from specialization trees; nothing on a Force
  power roll;
- each row type's change to the pool, including Skill Rank against characteristic both above and
  below the rank;
- how many times a row counts: quantity, the once-per-attack exception, talent ranks,
  attachments following their item;
- tick, untick and re-tick around manual edits leaving the base pool untouched;
- a sent pool's already-applied buffs staying locked while the others stay offered.

In Foundry, by hand: build buffs on a weapon, an armour, a gear item, a talent (as an item and in
a specialization tree) and an attachment, on both sheet styles; check the dialog offers each
where it should, the preview moves on tick and back on untick, the roll uses it, and the card
names it; toggle carried on the classic sheet and see both the encumbrance and the buff follow.

## Documentation

- `CHANGELOG.md`: **Added** entries under `Unreleased` for optional buffs and for the classic
  carried toggle.
- Wiki:
  - chapter 9 (*Changing a roll before and after*): ticking a buff in the roll dialog;
  - chapter 6 (*Edit Mode and Active Effects*), which covers item modifiers: the Optional buffs
    block on both sheet styles;
  - the carried toggle on the classic sheet, where the tutorial covers the inventory and
    encumbrance;
  - screenshots of each.
