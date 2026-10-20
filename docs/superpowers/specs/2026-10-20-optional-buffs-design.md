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

1. An optional buff is created on a **weapon, armour or gear** item.
2. It has a **name**. That name is what the player sees in the roll dialog.
3. It holds modifier rows using the **existing modifier types**: Roll Modifiers, Dice Modifiers,
   Result Modifiers, the Skill Add … types, Skill Boost, Skill Rank, Skill Remove Setback and
   Skill Setback. When the player ticks the buff, those rows apply to that roll.

Confirmed when played back to the user:

- It is edited in a new **Optional buffs** block on the item sheet: each buff has a name field and
  rows with the same type / target / value pickers as the Modifiers list. Types that change no
  dice (Stat, Characteristic, Weapon / Armor / Vehicle Stat) are not offered.
- Which items offer their buffs: **armour only when equipped**; **weapons and gear whenever the
  actor has them**. (Decided after review. The first version said equipped weapons and armour,
  but new weapons start unequipped and most attacks are made with unequipped weapons.)
- A buff **counts the number of items**: its rows are multiplied by the item's quantity.
- **Force power rolls get no buffs.**
- When a buff shows up in the roll dialog depends on each row's type:
  - **Skill rows** (Skill Boost: Charm, and the rest): only on rolls of that skill. A buff with
    Charm, Negotiation and Deception rows shows on all three.
  - **Roll, Dice and Result Modifiers on a weapon**: only on attacks made with that weapon.
  - **Roll, Dice and Result Modifiers on armour or gear**: on every roll.
- Every buff starts **unticked** on every roll. Ticking it updates the dice preview at once.
  **Skill Rank** raises the skill's rank for that roll only, so the ability and proficiency dice
  are rebuilt.
- The chat card lists which buffs were used. Nothing is used up: the buff is there again on the
  next roll.

## Goals

- A GM or player can give an item any number of named optional buffs, each with any number of
  rows, from the classic item sheet.
- The roll dialog offers exactly the buffs that can affect the roll being made, unticked.
- A ticked buff changes the pool exactly as the same rows would as ordinary modifiers.
- The posted card says which buffs were used.

## Non-goals

- Optional buffs on talents, species, careers, specializations, attachments, item modifications,
  ship weapons or vehicles. (The talents work planned next, conditional talents as checkboxes in
  the roll dialog, is expected to reuse this mechanism, so it should not be closed off.)
- Working out by itself when a buff applies (factions, targets, scene). The player decides.
- Remembering what was ticked between rolls.
- Editing buffs on the Codex II item sheets, which are leaving the system for their own module.
  Buffs still appear in the roll dialog whichever sheet the actor uses.
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
  The new field must be declared on the weapon, armour and gear models, or Foundry strips it on
  save. Check `modules/data/conformance-report.js` still passes.
- Decisions go in modules free of Foundry globals, covered by Node tests (`tests/node/`, see
  `tests/README.md` and the stub boundary). Sheets, dialogs and chat stay in thin Foundry-side
  code, as `apply-damage-plan.js` / `apply-damage.js` and `roll-costs.js` / `roll-builder.js` do.
- Classic sheet CSS goes in `styles/mandar.css`. `styles/starwarsffg.css` is hand-maintained: do
  not commit `npm run compile` output for it.
- English strings in `lang/en.json`.
- A `CHANGELOG.md` entry under `Unreleased`, and the wiki tutorial updated (see Documentation).

## How it works

### Data

Weapon, armour and gear gain a list of optional buffs. Each buff has a stable id, a name, and
rows shaped like the item's ordinary modifier rows in `system.attributes` (`modtype`, `mod`,
`value`), so the existing type and target choices can be reused as they are.

### Which items count

The rolling actor's items:

- **armour** only while it is **equipped** (`system.equippable.equipped`);
- **weapons** and **gear** whenever the actor has them, equipped or not. Gear's Codex "carried"
  flag does not matter here: an item in the inventory counts.

### Which buffs a roll offers

For each buff, keep the rows that can affect this roll:

| Row type | Applies when |
| --- | --- |
| Skill Add …, Skill Boost, Skill Rank, Skill Remove Setback, Skill Setback | the row's target is the skill being rolled |
| Roll, Dice or Result Modifiers on a weapon | the roll is made with that weapon |
| Roll, Dice or Result Modifiers on armour or gear | always |

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

A buff **counts the number of items**: each row's value is multiplied by the item's quantity
(`system.quantity.value`), as ordinary gear modifiers are. A "Skill Boost: Stealth 1" buff on a
stack of three cloaks adds three boost.

One exception: a weapon's own Roll, Dice and Result rows on an attack **with that weapon** count
once, since one weapon makes the attack. Two blasters in one stack do not double a blaster's
attack buff. *(Builder's call.)*

### Roll dialog

An **Optional buffs** section lists the offered buffs as checkboxes labelled with the buff's
name; the item it comes from may show as a hint. All start unticked.

The dialog already keeps the player's pool (with their manual edits) apart from what it layers on
top for the targeted defence and the Adversary upgrades (`_effectivePool` in
`modules/dice/roll-builder.js`). Ticked buffs join that layer: the preview, the simulation and the
roll all use base pool + ticked buffs, so ticking and unticking never disturbs manual edits.

When the dialog sends the pool to another player instead of rolling, the sent pool already
includes the ticked buffs, and the recipient's dialog offers none. *(Builder's call.)*

### Chat card

The card shows a line naming the buffs used, in the same way as the vehicle defence-zone line
(`defenceZoneText` in `modules/dice/roll.js` and `templates/dice/roll-ffg.html`). With no buff
ticked there is no line.

### Item sheet

On the classic weapon, armour and gear sheets, below the Modifiers list on the Modifiers tab: an
**Optional buffs** block with a + to add a buff. Each buff shows its name field, a + to add a row,
a delete control, and its rows with the type / target / value pickers of the Modifiers list,
limited to the row types above. Editable only where the sheet is editable.

## Left to the builder

- The exact stored shape, ids and field names.
- Layout and styling of the sheet block and the dialog section.
- How the skill key, characteristic and rank reach the roll dialog from each place that opens it
  (`DiceHelpers.rollSkill`, `rollItem`, `rollSkillDirect`, crew rolls, macros). A place that
  cannot supply them offers only the buffs that do not need them.
- Wording of labels and hints.

## Testing

Node tests for the parts free of Foundry:

- which rows of which items a roll offers (skill match, the weapon being used, armour and gear
  Roll / Dice / Result rows always, unequipped armour left out, unequipped weapons and gear
  included, nothing on a Force power roll);
- each row type's change to the pool, including Skill Rank against characteristic both above and
  below the rank;
- quantity multiplying each row, except a weapon's own attack rows on its own attack;
- tick, untick and re-tick around manual edits leaving the base pool untouched.

In Foundry, by hand: build a buff on a weapon, an armour and a gear item; check the dialog offers
each where it should, the preview moves on tick and back on untick, the roll uses it, and the card
names it.

## Documentation

- `CHANGELOG.md`: one **Added** entry under `Unreleased`.
- Wiki: chapter 9 (*Changing a roll before and after*) gains a short section on ticking a buff in
  the roll dialog, and the chapter that covers an item's Modifiers tab gains the Optional buffs
  block, with screenshots of both.
