# Roll options: talents, qualities and two weapons in the roll dialog — design

**Date:** 2026-10-20
**Branch:** `claude/talents-roll-dialog-plan-b258f8` (plan only); build on a feature branch from `main`

## Why

At the table, the moments that slow a roll down are the ones where the dice change before the roll
and something is paid for it. The GM's own example: a player targets an enemy and declares two
blasters, the GM adds a difficulty die, the player declares Guns Blazing, suffers 2 strain, and the
GM takes the difficulty die off again. Only then does anyone roll. Saber Swarm (1 strain for Linked
equal to the Force rating) and a long tail of similar talents go the same way, all by hand.

The system has nothing for this today: no autofire switch, no two-weapon check, and no talent that
charges strain from the roll dialog. Optional buffs (merged in PR #109) let an item carry named,
situational dice changes, but they carry no cost, no condition and no amount to choose.

A **roll option** is something the player switches on in the roll dialog that changes that one
roll, and may cost something. Options are **written as JSON in a macro** that the GM owns, and
**items link to that macro**, so the long tail of talents can be covered without new code for each
one, and editing one macro changes every item that uses it.

## What the user decided

1. **Option code lives in Foundry macros, as JSON.** A macro (the hotbar kind) whose text is JSON
   describes one or more options. The system reads that text and never runs it. **Any macro an
   item links to counts**, whoever wrote it: control lies in who may set the link.
2. **Items link to the macro by uuid; they do not copy it.** The GM drops a macro onto a talent,
   quality, weapon, armour, gear or attachment. Editing the macro changes the behaviour of every
   item linked to it. Copies the system makes of an item (a talent dropped into a specialization
   tree, a quality dropped onto a weapon) copy the link.
3. **The Auto-fire quality carries the autofire option**; talents like Guns Blazing and Saber Swarm
   carry their own.
4. **Two-weapon attacks are built in**, not macro code: on personal weapon attacks the player picks
   **no / same skill / different skills**.
5. **The system ships a library** of ready-made code for the common talents and qualities, and a
   **GM macro run** creates the library's macros and links them into matching items: on actors
   generally, in the world's items and in compendiums.
6. **Players cannot edit the code.** Only the GM can change an item's links, on any item type and
   in any copy. The library's macros are the GM's, so only the GM edits their text.
7. **Link lists are on the item sheets and in the popups** that edit copies inside other items: the
   qualities and attachments inside a weapon or armour, and specialization tree nodes.
8. **The link list is on the classic and the Codex II item sheets.**
9. **First iteration** covers exactly: two-weapon attacks (built in), Auto-fire, Intense Focus,
   Frenzied Attack, Guns Blazing, Saber Swarm, True Aim, Sniper Shot and Point Blank. A broader pass
   over more talents comes later.
10. **The system's job ends at the roll.** Extra hits (second weapon, Auto-fire, Linked) and
    spending advantage stay with the table.
11. **Nothing is enforced per round.** "Once per round" is not tracked or blocked.
12. **Options do not change the weapon.** Linked, damage and range are not written onto the weapon
    copy the chat card carries; the chat card **names each option used, with its rank** (or chosen
    amount) where it has one.
13. **An option cannot be ticked if its cost would incapacitate the actor.** Rivals pay **wounds**
    instead of strain, and **minions** cannot use options with a strain cost (the Parry / Reflect
    rule).
14. **When the person rolling cannot update the actor who pays**, the charge goes **through the GM
    bridge**, as Parry's does, and the GM's client re-checks the threshold. *(After review: every
    charge takes that path, owners included, so two charges for one actor share one queue and
    never overwrite each other.)*
15. **The options sit on a foldable side card on the right of the roll dialog**, and the **optional
    buffs move onto that card** too.
16. **A pool the GM sends to a player** keeps its options **ticked but not locked**: the player can
    untick them.
17. **An option can be offered by skill type** (Combat, General, Knowledge, Social, Magic) as well as
    by named skill.

Played back and accepted (the user answered "all good", "sounds right", or did not object):

- Strain is charged only once the roll has reached chat; nothing is charged on ticking or closing.
- Every option starts unticked on every roll.
- Maneuvers an option needs are shown (on the card and in chat) but not counted or limited.
- Guns Blazing greys out until Two weapons is set.
- The card opens unfolded each time; folded, its tab shows how many options are ticked.
- Ticking updates the dice preview at once, and the player's manual edits survive any ticking.
- Validation on save names the problem; the GM's text is not lost; an invalid macro is skipped at
  roll time.
- The library run creates its macros once, never overwrites one already there, links only items
  with no live link, and ends with a report.
- Talent options appear on crew rolls (a crew member's ship-weapon or piloting check) when their
  conditions match, and the crew member pays. Only Two weapons is limited to personal weapons.
- A sent pool travels before the Adversary upgrade, with the ranks and the defence alongside, so
  the recipient's dialog applies everything in the same order as the sender's.
- Species need no change: a species stores only links to its talents, and a granted talent is
  created from the source talent, links included. The library run skips species entries.
- Codex II has no quality sheet, so its link list covers five item types.
- Rules as read back to the user for the first iteration (see **The library**).

## Goals

- A GM can write options as JSON in a macro and link it to any talent, quality, weapon, armour,
  gear or attachment, including the copies inside other items, from the classic or Codex II sheets.
- The roll dialog's side card offers exactly the options that fit the roll, with their cost, and
  greys out (with the reason) those the actor cannot pay for or whose condition is not met.
- A ticked option changes the dice as its code says; the roll charges its strain (or wounds) after
  it posts, through the GM bridge's queue; the chat card names it.
- Two-weapon attacks add their difficulty from the card, on any personal weapon attack.
- One library run gives every matching item the GM can edit a working link.

## Non-goals

- Anything after the roll: extra hits, spending advantage, activating Auto-fire or Linked, Apply
  Damage or Apply Crit changes.
- Changing the weapon for the roll (qualities, damage, range) or the weapon copy on the chat card.
- Tracking or enforcing once-per-round use, counting maneuvers, or measuring range to the target.
- Running any code from a macro or item. The macro's text is data.
- Library entries beyond the first iteration's eight, and library names in languages other than
  English. The GM can still link any macro to any item by hand, whatever the item's name.
- Options on Force power rolls (they get none, as with optional buffs); Two weapons on vehicle and
  ship weapon attacks; options carried by ship weapons, ship attachments, vehicles, species,
  careers or specializations as items (talents learned in their trees do count).
- Translations beyond English. Other languages fall back to the English strings.

## Anti-goals (a failure even if it otherwise works)

- **Strain charged for a roll that never reached chat**, or charged on ticking, or charged twice.
- **Strain silently left unpaid** after a roll that used a costed option. A charge that fails after
  the roll posted (the writer refused it, or no writer could be reached) says so on screen.
- **Calling a charge unpaid when it may have gone through.** A bridged charge whose reply was lost
  may already be applied; telling the user it was not invites a second charge.
- **Two charges for the same actor reading the same strain** and one overwriting the other.
- **An option taking an actor past their strain (or wound) threshold.**
- **A player changing option code or links from any sheet**, or a macro's text being run.
- **Ticking and unticking that leaves the pool changed.** Manual edits survive any sequence of
  ticks, as they do for optional buffs today.
- **The library run overwriting a macro the GM changed, or relinking an item the GM linked.**
- **Changing what existing items do.** An item without links behaves exactly as before; the only
  visible changes for existing data are that optional buffs move onto the side card and that buffs
  in a sent pool arrive unlocked (decision 16).

## Constraints

- Items use V14 TypeDataModels (`modules/data/item-templates.js`, `modules/data/models/item/`). The
  link list must be declared on the talent, weapon, armour, gear, itemattachment and itemmodifier
  models or Foundry strips it on save. Check `modules/data/conformance-report.js` still passes.
- Copies the system makes must carry the links: a talent dropped into a specialization tree
  (`_onDropTalentToSpecialization` in `modules/items/item-sheet-ffg.js` copies fields one by one,
  as it does for `optionalBuffs`); a quality dropped onto a weapon, armour or attachment
  (`_onDropItem` duplicates the whole item, so the field travels if it is on the quality's
  `system`); an attachment installed on a weapon or armour (`system.itemattachment`), with its own
  qualities. Species store only `{name, source, id}` references and need nothing.
- Decisions go in modules free of Foundry globals, covered by Node tests (`tests/node/`, see
  `tests/README.md` and the stub boundary). The dialog, sheets, popups, library runner, bridge
  wiring and chat stay thin Foundry-side code, as `roll-costs.js` / `roll-builder.js` and
  `optional-buff-pool.js` do.
- Costs are paid through `postThenPay` (`modules/dice/roll-costs.js`), after the message posts.
  The payer pool, its threshold and the "over, not at" rule are those of
  `modules/helpers/defensive-talents.js` (`defenceCostPool`, `readCostPool`, `wouldIncapacitate`);
  reuse them rather than restating them.
- **Every** option charge goes through `applyToTargetActor` in `modules/helpers/gm-bridge.js`,
  whether or not the roller owns the payer. Its coordinator (`actor-apply-coordinator.js`) gives
  each actor one writer and one queue, shared with damage and Parry, so two charges never read the
  same strain; the writer re-checks the cost against the live actor inside that queue, as Parry's
  `defenceCost` does. Strain and wounds are already among the paths it accepts for unowned
  targets. A writer on an older version must refuse rather than misapply: the request names a
  capability, as Parry's does with `DEFENSIVE_DAMAGE_CAPABILITY`.
- Qualities and attachment modifications that are switched off or broken count for nothing, as
  elsewhere in the system: `isModifierSuspended` (`modules/helpers/modifier-switch.js`) and
  `system.broken === true` (see `modules/helpers/innate-talents.js`).
- Codex II reaches the system only through `modules/api/public-api.js`.
  `tests/node/codex-boundary.test.mjs` and `tests/node/public-api-surface.test.mjs` must keep
  passing. The link list follows the optional-buffs pattern (a shared partial Codex templates
  include, plus listeners Codex sheets inherit) and bumps `PUBLIC_API_VERSION` to 3.
- Classic sheet and dialog CSS goes in `styles/mandar.css` (the defence card's styles are there to
  mirror). `styles/starwarsffg.css` is hand-maintained: never commit `npm run compile` output for
  it. Codex styles stay in `codex/styles/`.
- English strings in `lang/en.json` (Codex labels in `codex/lang/`).
- `CHANGELOG.md` entry under `Unreleased` and the wiki tutorial updated before any push.
- The system ships no compendiums (`system.json` `packs` is empty), so library code reaches the
  world only through the library run, or a GM writing macros by hand.

## How it works

### Words used below

- **Option**: one entry in a macro's JSON; one row on the side card.
- **Option macro**: a macro whose text is option JSON.
- **Link**: an option macro's uuid stored on an item.
- **Library**: the system's built-in option JSON for known talent and quality names.
- **Payer pool**: what an option's strain cost is paid from: strain for characters and nemeses,
  wounds for rivals; none for minions and vehicles.

### Data

- Talent, weapon, armour, gear, itemattachment and itemmodifier (quality) items gain a list of
  links: macro uuids. *(Builder's call: the field name, e.g. `system.rollOptions`, an array of
  strings.)*
- An option macro is an ordinary Foundry `Macro`, of either type and by any author, whose
  `command` is JSON: one option object, or an array of them. The library run creates its macros as
  the GM, type `script`. *(Builder's call: a flag marking it as an option macro, set by the library
  run and when a GM first links it, so the save check knows to run.)*
- A link that does not resolve (the macro was deleted) or a macro whose JSON is invalid contributes
  nothing, with a console warning at roll time.
- A macro's text can be edited by whoever owns it; Foundry's server enforces that. A GM who links
  a macro a player owns lets that player change what it does. That is the GM's choice.
- The dialog must read the macros of every link before it renders. World macros resolve
  synchronously; a macro in a compendium needs loading first. *(Builder's check: a player's client
  can read a GM macro the player has no permission on. If it cannot, the library run gives option
  macros Observer permission for all players; running one does nothing, since its text is plain
  JSON.)*

### The option format

Each option is an object with these keys. Every key except `label` is optional.

```jsonc
{
  "id": "guns-blazing",            // stable within the macro; defaults to the option's position
  "label": "Guns Blazing",         // what the card and the chat line show; defaults to the linking item's name
  "hint": "Once per round",        // a short reminder under the option on the side card
  "offer": {                       // when the option appears; every key given must match
    "skills": ["Ranged: Light"],   //   the rolled skill's key is one of these
    "skillTypes": ["Combat"],      //   the rolled skill's type is one of these
    "attack": true,                //   the roll is made with a weapon (personal or ship)
    "twoWeapons": "same"           //   Two weapons is set to "same", "different" or "any" (not "no")
  },
  "amount": { "max": "ranks", "label": "Strain" },  // the player picks 1..max; max is a positive
                                                    // whole number, "ranks" or "forceRating"
  "cost": { "strain": 2, "maneuvers": 1 },          // a whole number of 0 or more, or "amount"
  "dice": { "difficulty": -1 }                      // see below
}
```

**`dice` keys:** `boost`, `setback`, `removeSetback`, `difficulty`, `upgradeAbility`,
`downgradeAbility`, `upgradeDifficulty`, `downgradeDifficulty`. Each value is a whole number
(negative allowed), `"ranks"`, `"amount"` or `"forceRating"`.

**Limits:** every number is a finite whole number. Costs are 0 or more, so no option can lower
strain and make room for another. A numeric `amount.max` is 1 or more. When `amount.max` is a word
that resolves to 0 at roll time (a Force rating of 0, say), the option is shown greyed with the
reason ("Force rating 0"). The amount the player picks is a whole number from 1 to the max (and to
what the payer pool still has room for).

**What the words mean:**

- `ranks`: of the **linking item**. For a talent, its ranks as optional buffs count them (talent
  items with the same name summed, a learned tree node counting 1, an unranked talent 1, a cleared
  rank 1); for a quality, its rank; for anything else, 1.
- `forceRating`: the rolling actor's Force rating, as the sheet shows it.
- `amount`: the number the player picked in the option's box (only valid when `amount` is given).

**Rules the validator enforces:** the JSON parses; it is an option or an array of options; each
option is an object with only the keys above; `offer.twoWeapons` is one of `same`, `different`,
`any`; skill types are the five known ones; values are of the types listed and within the limits
above; `"amount"` appears only in an option with an `amount`; `label`, when given, is a non-empty
string. Errors name the option and the key ("option 2: cost.strain must be a whole number of 0 or
more, or \"amount\"").

**When it runs:**

- **On save** of an option macro by a GM: errors are shown, and the GM's text is not lost (the
  editor keeps it so it can be fixed). *(Builder's call how: refuse the update and keep Foundry's
  macro editor open, or save it and warn; either way the GM sees the errors at once.)*
- **When a GM drops a macro onto a link list:** an invalid macro is refused with its errors.
- **At roll time:** an invalid macro is skipped, with a console warning.

### Which items offer their options

The rolling actor is the one `rollActorFrom` (`modules/dice/roll-actor.js`) finds: for a crew roll
from a vehicle sheet, the crew member. Its items count with the optional-buffs rules:

- **talents** the actor has (items, and learned specialization tree nodes): when their `offer`
  matches. The same talent from several sources is one row, with its ranks combined.
- **weapons**, their **qualities**, their **attachments** and the attachments' qualities: only on
  attacks made **with that weapon**, and only while it is carried (not marked "not carried").
- **armour** (while equipped) and its qualities and attachments, and **gear** (while carried): when
  their `offer` matches.
- **A quality or modification that is switched off** (its Installed? / active box unticked, as
  `isModifierSuspended` reads it) **or broken** (`system.broken === true`) offers nothing. This
  applies to qualities on a weapon or armour and to the modifications inside an attachment.
- **Force power rolls offer nothing.** A roll with no actor offers nothing.

Two items linking the same macro show its options once (rows are keyed by macro uuid and option
id, plus the talent name for talents). *(Builder's call.)*

### Two weapons (built in)

On a roll made with a personal weapon (`item.type === "weapon"`), the side card's first row is
**Two weapons: No / Same skill / Different skills**, starting at No. Same skill adds **one**
difficulty die and Different skills **two**. Nothing else changes: the player rolls with the
weapon they opened the dialog with, and the second hit is the table's.

### What a ticked option does to the pool

Ticked options and the Two weapons choice join the layer the dialog already keeps on top of the
player's pool (`_effectivePool` in `modules/dice/roll-builder.js`): the preview, the simulation and
the roll use base pool + ticked buffs + Two weapons + ticked options. The base pool that manual
edits change is never touched.

Order, following `applyOfferedBuffs` (`modules/dice/optional-buff-pool.js`): counts first (boost,
setback, remove setback, difficulty: Two weapons' dice and Guns Blazing's `-1` together, so they
cancel exactly), then ability upgrades and downgrades, then difficulty upgrades and downgrades,
then target defence and the Adversary upgrade as today. No count goes below zero, except setback the
player already set below zero by hand, as today.

### Costs and what can be ticked

- **Payer pool:** characters and nemeses pay strain; rivals pay wounds; minions and vehicles
  cannot pay, so options with a strain cost are greyed for them ("Minions can't suffer strain").
  Options without a cost are unaffected.
- **Room:** an option is greyed, with its reason ("Would take strain to 13 / 12"), when
  current + the cost of everything already ticked + its own cost would go **over** the threshold.
  Reaching the threshold exactly is allowed; an unknown threshold never refuses, as in
  `wouldIncapacitate`. An `amount` box is capped to what still fits.
- **Who can charge:** every charge goes through the GM bridge's queue for the payer (see
  Constraints), whoever rolls. When the bridge would find no writer for the payer (no GM
  connected, and no owner of the payer connected), costed options are greyed ("Needs the GM
  connected").
- **Dependencies:** an option whose `offer.twoWeapons` does not match the current Two weapons
  choice is shown greyed ("Needs Two weapons: same skill"). Changing Two weapons so it no longer
  matches unticks it.
- **Footer:** when the roll offers any option with a cost, the card's footer shows the payer pool
  after the roll ("Strain after roll: 12 / 12", or "Wounds after roll" for a rival).
- **Paying:** at the Roll click the dialog snapshots what is ticked, with the pool. The total cost
  is charged through `postThenPay`, after the message posts, as one request to the bridge. A failed
  post charges nothing. Maneuvers are shown, never counted.
- **What the roller is told about the charge.** The roll stays posted whatever happens. The bridge
  already tells these apart, and the warning must too:
  - **Charged** (the writer confirmed): nothing more to say.
  - **Not charged, for certain:** no writer could be reached, so nothing was sent; or the writer
    refused (the actor can no longer pay, or the writer's version is too old). The warning names
    the actor, the cost and the reason ("Kira's 2 strain for Guns Blazing was not charged: it
    would take her past her threshold").
  - **Still waiting:** the coordinator's existing "still waiting for confirmation" notice covers
    it. A later confirmation needs nothing more; a later refusal gives the "not charged" warning.
  - **Unknown:** the writer disconnected before confirming, so the charge may or may not have gone
    through. The warning says so and tells the user to check the actor's strain before charging it
    by hand. It never says "not charged".

### Side card

A card hanging off the dialog's **right** edge, built like the vehicle defence card that hangs off
the left (`ffg-defence-panel`, moved to the window by `_relocateDefencePanel`), with a fold tab.

- It appears only when the roll has something to offer: Two weapons, an option, or an optional buff.
- It **opens unfolded** on every roll. Folded, only the tab shows, with a count of ticked rows.
- Sections, each shown only when it has rows: **Two weapons** (three-way switch), **Talents &
  qualities** (options), **Optional buffs** (moved from the dialog body, behaving as today), then
  the footer.
- An option row: a checkbox, the label with the rank where the source is ranked ("Point Blank 2"),
  its cost ("2 strain · maneuver"), an amount box when it has one, and its `hint` or the reason it
  is greyed underneath.

Mockups of the agreed layout were shown during brainstorming (open, folded, and the chat line);
exact styling is the builder's.

### Chat card

A new line, in the same way as the defence-zone and optional-buffs lines (`defenceZoneText`,
`optionalBuffsText` in `modules/dice/roll.js` and `templates/dice/roll-ffg.html`):

> Roll options: Two weapons (same skill), Guns Blazing (2 strain), Point Blank 2, Frenzied Attack 2 (2 strain)

Each entry is the label, then the rank for a ranked source or the chosen amount for an option with
an amount, then its costs in brackets (strain or wounds, and maneuvers). No line when nothing was
used. The optional-buffs line stays as it is. *(Builder's call: two lines rather than merging.)*

### A pool the GM sends to a player

Today the share button bakes the sender's ticked buffs, defence and Adversary upgrade into the pool,
and the recipient sees the buffs ticked and locked (`appliedBuffs`, `withAppliedBuffs`). That
changes:

- The sent message carries the **base pool** (the player's edits, nothing layered), the
  **defence dice** the sender's targets gave, the **Adversary ranks** and mode, and the
  **selections**: ticked option rows (with amounts), ticked buffs, and the Two weapons choice.
- The recipient's dialog opens with the selections **ticked and unlocked**, uses the sent defence
  and Adversary ranks instead of its own targets, and layers everything in the usual order, so its
  preview matches the sender's. Unticking takes a selection's dice off. A selection that no longer
  fits (no room left in the payer pool, the item or macro gone) arrives unticked.
- Option costs are charged when the **recipient's** roll posts, for the actor the roll is for,
  through the GM bridge's queue. The sender's ammo and one-check effects are still paid when
  the sender's message posts, as today.
- A message sent before this change (with `appliedBuffs` and a baked pool) still opens as it does
  today.

### Link lists on items

On the classic talent, weapon, armour, gear, attachment and quality sheets; in the popups that edit
copies inside other items (`itemEditor` for qualities and attachments inside a weapon or armour,
`talentEditor` for specialization tree nodes); and on the Codex II sheets for talent, weapon,
armour, gear and attachment:

- a **Roll options** block listing the linked macros by name, each with an open control (opens
  Foundry's macro editor) and a remove control, and a drop zone for a macro dragged from the macro
  directory or the hotbar;
- **shown only to a GM**;
- a dropped macro is refused if its JSON is invalid (with the errors).

*(Builder's call: placed next to the Optional buffs block on the Modifiers tab, and the matching
place in the popups and on Codex sheets.)*

**Only the GM can change links.** A `preUpdateItem` check refuses a non-GM update that changes a
link list, and allows everything else a player does with copies today. The rule compares the item
before and after the update:

- **The item's own link list** must be unchanged.
- **Copies it holds** are matched before and after by identity: a quality or attachment by its id
  (the `id` / `_id` each copy gets when dropped), a specialization tree node by its slot key **and**
  the talent it holds (`itemId`, falling back to the name); the qualities inside an attachment, by
  the attachment's id and then their own.
  - A copy present **before and after** must keep exactly the same links.
  - A copy **removed** (a quality or attachment taken off), **added** (one dropped on), or
    **replaced** (a tree slot now holding a different talent) is allowed, whatever links it carries.
  - **Reordering** copies changes nothing, since they are matched by identity, not position.

Creating an item is copying, not editing: an item a player drops, duplicates or takes from a
compendium keeps the links it came with. The check runs on the player's own client, which is as
far as Foundry lets a system enforce it: it stops every sheet path, not a determined player at the
console. The library's macros belong to the GM, and Foundry's server refuses a player's edit to
their text. The decision (old data, new data → allowed or refused, with the reason) is a pure
function, tested in Node.

### The library

Data shipped with the system: one entry per known item, with its names and its option JSON. Names
match case-insensitively, ignoring spaces, hyphens and punctuation ("Auto-fire", "Autofire" and
"Auto Fire" are one name). The first iteration, as the user accepted it:

| Item | Offered on | Cost | Dice | Card |
| --- | --- | --- | --- | --- |
| **Auto-fire** (quality) | attacks with that weapon | — | +1 difficulty | Auto-fire |
| **Intense Focus** | any skill check | 1 strain, 1 maneuver | upgrade ability once | Intense Focus |
| **Frenzied Attack** | Melee, Brawl | strain = amount (1..ranks) | upgrade ability × amount | Frenzied Attack N |
| **Guns Blazing** | Ranged (Light), Two weapons = same skill | 2 strain | −1 difficulty (cancels Two weapons' die) | Guns Blazing |
| **Saber Swarm** | Lightsaber | 1 strain, 1 maneuver | — (Linked = Force rating is the table's) | Saber Swarm |
| **True Aim** | Combat skills | 1 maneuver | +1 boost, upgrade ability × ranks | True Aim N |
| **Sniper Shot** | Ranged (Light), Ranged (Heavy), Gunnery | 1 maneuver | upgrade difficulty × amount (1..ranks range bands) | Sniper Shot N |
| **Point Blank** | Ranged (Light), Ranged (Heavy) | — | — (+1 damage per rank is the table's) | Point Blank N |

Hints on the card: "Once per round" on Saber Swarm and True Aim; "Short range or engaged" on Point
Blank; "Not thrown weapons" on Sniper Shot. Library names are the English book names, plus the
spellings the OggDude importer produces where they differ. *(Builder's call: the book rules above
are what the user accepted; the builder checks each entry against the rule text while writing it,
and raises any disagreement rather than silently changing it.)*

### The library run

A GM-only function on `game.ffg` that the wiki shows as a one-line script macro. It:

1. Asks for confirmation, saying what it will scan.
2. **Creates the library's macros** in a "Roll options" folder in the world, one per library
   entry, marked with the entry's id. An entry whose macro already exists (found by that mark) is
   left as it is, even if the GM edited it.
3. **Scans:** world items; the items of every world actor; the items of every unlinked token's
   actor on every scene; and every **unlocked** Item or Actor compendium, world or module. Locked
   compendiums are skipped and named in the report. *(Builder's call: skip rather than unlock.)*
   A compendium shared between worlds gets links to this world's macros, which mean nothing in
   another world; the report says so for module compendiums.
4. In each of those, finds every place a library item lives: talent and quality items themselves,
   specialization tree nodes, qualities on weapons, armour and attachments, attachments installed
   on weapons and armour, and those attachments' qualities. Species entries are skipped.
5. **Links** the library macro where the name matches and the item has **no live link** (none, or
   only links to macros that no longer exist). An item with a live link is left alone.
6. Reports what it created and linked, per kind and per place, what it skipped and why, and any
   errors.

Running it twice changes nothing the second time. What to create and link is a pure function
(input: plain item data and the existing library macros; output: the creations and updates),
tested in Node; the runner only gathers documents and applies the result.

## Left to the builder

- Module and file names, field and flag names, and how the card's state is held in the dialog.
- Layout and styling of the side card, the fold tab and the link lists, within what is described.
- Wording of labels, hints and messages.
- How the skill's type reaches the dialog (from the actor's skill or the configured skill list) for
  each place that opens it; a place that cannot supply it offers only options without
  `skillTypes`.
- Whether the bridged charge reuses the `damage` operation with a cost check or adds its own
  operation, as long as every charge goes through the coordinator's queue, the writer re-checks
  the threshold, and an older writer refuses through a capability check.
- How the save check keeps the GM's text (see **When it runs**).
- The player-read check for macros (see **Data**).
- Checking each library entry against the rule text, as above.

## Testing

Node tests for the parts free of Foundry:

- validation: parsing, one option or a list, every key and value type, unknown keys, `"amount"`
  without `amount`, bad skill types, error messages naming the option and key; every library entry
  passes;
- limits: negative, fractional and non-finite costs refused; cost 0 accepted; numeric
  `amount.max` of 0, negative or fractional refused; a word max resolving to 0 greys the option;
  the picked amount kept within 1..max and the room left;
- which links count: unresolved links and invalid JSON skipped; any author and either macro type
  accepted;
- offering: skills, skill types, attack-only, weapon-borne options only with that weapon, carried /
  equipped rules, switched-off and broken qualities and attachment modifications offering nothing
  (on a weapon, on armour, inside an attachment), talents from items and trees with combined ranks,
  the same macro on two items shown once, crew rolls offering for the crew member, Force power
  rolls, no actor;
- `ranks`, `forceRating` and `amount` resolution;
- pool changes and their order, including Two weapons + Guns Blazing cancelling exactly, around
  Adversary upgrades and negative manual setback; tick / untick / re-tick leaving the base pool
  untouched;
- room checks: strain and wounds, exactly-at-threshold allowed, over refused, amounts capped,
  minions and vehicles greyed, "needs the GM" greying, dependency greying and unticking on a Two
  weapons change;
- charging: every charge, owner or not, goes through the coordinator; two concurrent charges for
  the same actor both land (the second reads the first's result), and the second is refused when
  the two together would pass the threshold; the roller's message for each outcome (charged,
  refused, no writer, still waiting then confirmed or refused, writer disconnected = unknown),
  with "unknown" never worded as "not charged";
- the chat line's text;
- sent pools: the message's selections round-tripping, the recipient's layered pool matching the
  sender's, a selection that no longer fits, an old `appliedBuffs` message;
- the library planner: matches, name normalisation, existing macros reused and never overwritten,
  live links left alone, dead links replaced, tree nodes, qualities on weapons, armour and
  attachments, attachment qualities, species skipped, idempotence;
- the link guard's decision: the item's own links changed by a player refused; a kept copy's links
  changed refused; a quality or attachment removed, added or replaced allowed; a tree slot given a
  different talent allowed; copies reordered allowed; qualities inside an attachment matched
  through the attachment; any change by a GM allowed.

In Foundry, on the `test` world (ask before starting Foundry: the campaign world shares the data
folder), by hand: run the library and check the report and the macro folder; on a character with
the first-iteration talents and a weapon with Auto-fire, check each option shows where it should,
greys out at the threshold, changes the preview, charges after posting (and not on a failed post),
and is named in chat; edit a library macro and see every linked item follow; a rival paying wounds
and a minion greyed; a crew roll charging the crew member; a player rolling for an actor they do
not own, charged through the GM; two quick rolls in a row both charged; a broken or uninstalled
Auto-fire offering nothing; a player removing a linked quality from their weapon without being
refused; the link lists on classic sheets, popups and Codex sheets, and their absence for a
player; a GM-sent pool arriving ticked and unticking cleanly.

## Documentation

- `CHANGELOG.md` under `Unreleased`: **Added** entries for roll options with the first library and
  Two weapons, option macros and the link lists, and the library run (with a sub-bullet telling the
  GM to run it once); a **Changed** entry for optional buffs moving onto the side card and arriving
  unlocked in a sent pool.
- Wiki: chapter 9 (*Changing a roll before and after*) for the side card, Two weapons and options;
  the item-editing chapter for option macros, the link lists, the option format and the library
  table; the library run and how to start it; screenshots.
