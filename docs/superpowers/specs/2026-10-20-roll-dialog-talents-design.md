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
roll, and may cost something. Options are **data carried by the item** (a talent, a weapon quality,
a weapon…), written as JSON by the GM, so the long tail of talents can be covered without new code
for each one.

## What the user decided

1. **Each item carries its own option code.** Talents (Guns Blazing, Saber Swarm) carry their logic;
   the **Auto-fire quality** carries the autofire option.
2. **Two-weapon attacks are built in**, not item code: on any attack the player picks **no / same
   skill / different skills**.
3. **The code is JSON** (a config describing behaviour), not a script.
4. **The system ships a library** of ready-made code for the common talents and qualities, and a
   **GM macro injects it** into matching items: on characters and actors generally, in the world's
   items, and in compendiums.
5. **Players cannot edit the code.** Only the GM can.
6. **First iteration** covers exactly: two-weapon attacks (built in), Auto-fire, Intense Focus,
   Frenzied Attack, Guns Blazing, Saber Swarm, True Aim, Sniper Shot and Point Blank. A broader pass
   over more talents comes later.
7. **The system's job ends at the roll.** Extra hits (second weapon, Auto-fire, Linked) and
   spending advantage stay with the table.
8. **Nothing is enforced per round.** "Once per round" is not tracked or blocked.
9. **Options do not change the weapon.** Linked, damage and range are not written onto the weapon
   copy the chat card carries; the chat card **names each option used, with its rank** (or chosen
   amount) where it has one.
10. **An option cannot be ticked if its cost would incapacitate the actor.** Rivals pay **wounds**
    instead of strain, and **minions** cannot use options with a strain cost (the Parry / Reflect
    rule).
11. **The GM code editor is on both the classic and the Codex II item sheets.**
12. **The options sit on a foldable side card on the right of the roll dialog**, and the **optional
    buffs move onto that card** too.
13. **A pool the GM sends to a player** keeps its options **ticked but not locked**: the player can
    untick them.
14. **An option can be offered by skill type** (Combat, General, Knowledge, Social, Magic) as well as
    by named skill.

Played back and accepted (the user answered "all good" or did not object):

- Strain is charged only once the roll has reached chat; nothing is charged on ticking or closing.
- Every option starts unticked on every roll.
- Maneuvers an option needs are shown (on the card and in chat) but not counted or limited.
- Guns Blazing greys out until Two weapons is set.
- The card opens unfolded each time; folded, its tab shows how many options are ticked.
- Ticking updates the dice preview at once, and the player's manual edits survive any ticking.
- The code is GM-edited JSON, checked on save; bad JSON or an unknown field is refused with a
  message and the old code is kept.
- The macro skips items that already carry code, and ends with a report.
- Rules as read back to the user for the first iteration (see **The library**).

## Goals

- A GM can give any talent, weapon, armour, gear, attachment or quality a list of roll options, as
  JSON, from the classic or the Codex II item sheet.
- The roll dialog's side card offers exactly the options that fit the roll, with their cost, and
  greys out (with the reason) those the actor cannot pay for or whose condition is not met.
- A ticked option changes the dice as its code says; the roll charges its strain (or wounds) after
  it posts; the chat card names it.
- Two-weapon attacks add their difficulty from the card, on any personal weapon attack.
- One macro run puts the library's code on every matching item the GM can edit.

## Non-goals

- Anything after the roll: extra hits, spending advantage, activating Auto-fire or Linked, Apply
  Damage or Apply Crit changes.
- Changing the weapon for the roll (qualities, damage, range) or the weapon copy on the chat card.
- Tracking or enforcing once-per-round use, counting maneuvers, or measuring range to the target.
- Script code on items, or any way for item data to run code.
- Library entries beyond the first iteration's eight, and library names in languages other than
  English. The GM can still write code by hand on any item, whatever its name.
- Options on Force power rolls (they get none, as with optional buffs), on vehicle and ship weapon
  attacks (Two weapons is for personal weapons), or from species, careers or specializations as
  items (talents learned in their trees do count).
- Translations beyond English. Other languages fall back to the English strings.

## Anti-goals (a failure even if it otherwise works)

- **Strain charged for a roll that never reached chat**, or charged on ticking, or charged twice.
- **An option taking an actor past their strain (or wound) threshold.**
- **A player editing option code from any sheet**, or item data that can run code.
- **Ticking and unticking that leaves the pool changed.** Manual edits survive any sequence of
  ticks, as they do for optional buffs today.
- **The macro overwriting code the GM wrote or changed.**
- **Changing what existing items do.** An item without code behaves exactly as before; the only
  visible changes for existing data are that optional buffs move onto the side card and that buffs
  in a sent pool arrive unlocked (decision 13).

## Constraints

- Items use V14 TypeDataModels (`modules/data/item-templates.js`, `modules/data/models/item/`). The
  new field must be declared on the talent, weapon, armour, gear, itemattachment and itemmodifier
  models or Foundry strips it on save. Check `modules/data/conformance-report.js` still passes.
- Copies the system already makes must carry the code: a talent dropped into a specialization tree
  (`_onDropTalentToSpecialization` in `modules/items/item-sheet-ffg.js` copies fields one by one,
  as it does for `optionalBuffs`); a talent granted by a species (`system.talents` on the species);
  a quality dropped onto a weapon, armour or attachment (`_onDropItem` duplicates the whole item, so
  the field travels if it is on the quality's `system`); an attachment installed on a weapon or
  armour (`system.itemattachment`), with its own qualities.
- Decisions go in modules free of Foundry globals, covered by Node tests (`tests/node/`, see
  `tests/README.md` and the stub boundary). The dialog, sheets, macro runner and chat stay thin
  Foundry-side code, as `roll-costs.js` / `roll-builder.js` and `optional-buff-pool.js` do.
- Costs are paid through `postThenPay` (`modules/dice/roll-costs.js`), after the message posts.
- Codex II reaches the system only through `modules/api/public-api.js`.
  `tests/node/codex-boundary.test.mjs` and `tests/node/public-api-surface.test.mjs` must keep
  passing. The new editor follows the optional-buffs pattern (a shared partial Codex templates
  include, plus listeners Codex sheets inherit) and bumps `PUBLIC_API_VERSION` to 3.
- Classic sheet and dialog CSS goes in `styles/mandar.css` (the defence card's styles are there to
  mirror). `styles/starwarsffg.css` is hand-maintained: never commit `npm run compile` output for
  it. Codex styles stay in `codex/styles/`.
- English strings in `lang/en.json` (Codex labels in `codex/lang/`).
- `CHANGELOG.md` entry under `Unreleased` and the wiki tutorial updated before any push.
- The system ships no compendiums (`system.json` `packs` is empty), so library code reaches items
  only through the macro or by hand.

## How it works

### Words used below

- **Option**: one entry of an item's code; one row on the side card.
- **Code**: an item's list of options (the `rollOptions` field).
- **Library**: the system's built-in code for known talent and quality names.
- **Payer pool**: what an option's strain cost is paid from: strain for characters and nemeses,
  wounds for rivals; none for minions and vehicles.

### Data

Talent, weapon, armour, gear, itemattachment and itemmodifier (quality) items gain `system.rollOptions`:
an array of option objects. *(Builder's call: stored parsed, as an `ArrayField` of `ObjectField`
like `optionalBuffs`, and shown pretty-printed in the editor.)*

### The option format

Each option is an object with these keys. Every key except `label` is optional.

```jsonc
{
  "id": "guns-blazing",            // stable within the item; defaults to the option's position
  "label": "Guns Blazing",         // what the card and the chat line show; defaults to the item's name
  "hint": "Once per round",        // a short reminder under the option on the side card
  "offer": {                       // when the option appears; every key given must match
    "skills": ["Ranged: Light"],   //   the rolled skill's key is one of these
    "skillTypes": ["Combat"],      //   the rolled skill's type is one of these
    "attack": true,                //   the roll is made with a personal weapon
    "twoWeapons": "same"           //   Two weapons is set to "same", "different" or "any" (not "no")
  },
  "amount": { "max": "ranks", "label": "Strain" },  // the player picks 1..max; max is a number,
                                                    // "ranks" or "forceRating"
  "cost": { "strain": 2, "maneuvers": 1 },          // a number, or "amount"
  "dice": { "difficulty": -1 }                      // see below
}
```

**`dice` keys:** `boost`, `setback`, `removeSetback`, `difficulty`, `upgradeAbility`,
`downgradeAbility`, `upgradeDifficulty`, `downgradeDifficulty`. Each value is a whole number
(negative allowed), `"ranks"`, `"amount"` or `"forceRating"`.

**What the words mean:**

- `ranks`: for a talent, its ranks as optional buffs count them (talent items with the same name
  summed, a learned tree node counting 1, an unranked talent 1, a cleared rank 1); for a quality,
  its rank; for anything else, 1.
- `forceRating`: the rolling actor's Force rating, as the sheet shows it.
- `amount`: the number the player picked in the option's box (only valid when `amount` is given).

**Rules the validator enforces** (on save in the editor, and on every item at roll time, where an
invalid option is skipped with a console warning): the code is an array; each option is an object
with only the keys above; `offer.twoWeapons` is one of `same`, `different`, `any`; skill types are
the five known ones; values are of the types listed; `"amount"` appears only in an option with an
`amount`; `label` is a non-empty string. Errors name the option and the key ("option 2:
cost.strain must be a number or \"amount\"").

### Which items offer their options

The rolling actor (as `rollActorFrom` in `modules/dice/roll-actor.js` finds it) and its items,
with the optional buffs rules:

- **talents** the character has (items, species grants and learned tree nodes): when their `offer`
  matches. The same talent from several sources is one option, with its ranks combined.
- **weapons**, their **qualities**, their **attachments** and the attachments' qualities: only on
  attacks made **with that weapon**, and only while it is carried (not marked "not carried").
- **armour** (while equipped) and its qualities and attachments, and **gear** (while carried): when
  their `offer` matches.
- **Force power rolls offer nothing.** A roll with no actor offers nothing.

Duplicates: two items offering the same option (same item name and option id) show once.
*(Builder's call.)*

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

- **Payer pool:** characters and nemeses pay strain (`system.stats.strain`); rivals pay wounds
  (`system.stats.wounds`); minions and vehicles cannot pay, so options with a strain cost are
  greyed for them ("Minions can't suffer strain"). Options without a cost are unaffected.
- **Room:** an option is greyed, with its reason ("Would take strain to 13 / 12"), when
  current + the cost of everything already ticked + its own cost would go **over** the threshold.
  Reaching the threshold exactly is allowed. An `amount` box is capped to what still fits.
- **Dependencies:** an option whose `offer.twoWeapons` does not match the current Two weapons
  choice is shown greyed ("Needs Two weapons: same skill"). Changing Two weapons so it no longer
  matches unticks it.
- **Footer:** when the roll offers any option with a cost, the card's footer shows the payer pool
  after the roll ("Strain after roll: 12 / 12", or "Wounds after roll" for a rival).
- **Paying:** at the Roll click the dialog snapshots what is ticked, with the pool. The total cost
  is added to the payer pool through `postThenPay`, after the message posts, in one actor update. A
  failed post charges nothing. Maneuvers are shown, never counted.

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

Today the share button bakes the sender's ticked buffs into the pool and the recipient sees them
ticked and locked (`appliedBuffs`, `withAppliedBuffs`). That changes:

- The sent pool carries the base pool with target defence and the Adversary upgrade as today, **but
  not** the dice of ticked options, buffs or Two weapons. Those travel as selections (keys, amounts,
  the Two weapons choice).
- The recipient's dialog opens with them **ticked and unlocked** and applies them itself, so
  unticking takes their dice off. An option that no longer fits (no room left in the payer pool,
  the item gone) arrives unticked.
- Option costs are paid when the **recipient's** roll posts, by the actor the roll is for. The
  sender's ammo and one-check effects are still paid when the sender's message posts, as today.
- A message sent before this change (with `appliedBuffs`) still opens as it does today.

### The GM code editor

On the classic talent, weapon, armour, gear, attachment and quality sheets, and on the Codex II
sheets for the same types: a **Roll options** block holding a JSON text area and a Save button,
**shown only to a GM**. Save validates; on errors it shows them and keeps the stored code. An empty
text area clears the code. *(Builder's call: placed next to the Optional buffs block on the
Modifiers tab, and on the matching Codex tab.)*

**Players cannot change the code:** they never see the editor, and a `preUpdateItem` guard refuses
a non-GM update that changes `system.rollOptions` on an item. Copies that arrive by dropping an
item (a talent into a tree, a quality onto a weapon) are not edits and still work for players. This
guard runs on the player's own client, which is as far as Foundry lets a system enforce it; it
stops the sheet path, not a determined player at the console.

### The library

Data shipped with the system: one entry per known item, with its names and its code. Names match
case-insensitively, ignoring spaces, hyphens and punctuation ("Auto-fire", "Autofire" and
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

### The injection macro

A GM-only function on `game.ffg` that the wiki shows as a one-line script macro. It:

1. Asks for confirmation, saying what it will scan.
2. Scans: world items; the items of every world actor; the items of every unlinked token's actor on
   every scene; and every **unlocked** Item or Actor compendium, world or module. Locked compendiums
   are skipped and named in the report. *(Builder's call: skip rather than unlock.)*
3. In each of those, finds every place a library item lives: talent and quality items themselves,
   specialization tree nodes, species talent grants, qualities on weapons, armour and attachments,
   attachments installed on weapons and armour, and those attachments' qualities.
4. Writes the library code where the name matches and **no code is there yet** (an empty array
   counts as none). Anything with code is left alone.
5. Reports what it changed, per kind and per place, what it skipped and why, and any errors.

Running it twice changes nothing the second time. The decision of what to write where is a pure
function (input: plain item data; output: the updates), tested in Node; the runner only gathers
documents and applies the updates.

## Left to the builder

- Module and file names, the stored shape's details within the format above, and how the card's
  state is held in the dialog.
- Layout and styling of the side card, the fold tab and the editor, within what is described.
- Wording of labels, hints and messages.
- How the skill's type reaches the dialog (from the actor's skill or the configured skill list) for
  each place that opens it; a place that cannot supply it offers only options without
  `skillTypes`.
- Checking each library entry against the rule text, as above.

## Testing

Node tests for the parts free of Foundry:

- validation: every key and value type, unknown keys, `"amount"` without `amount`, bad skill types,
  error messages naming the option and key; every library entry passes;
- offering: skills, skill types, attack-only, weapon-borne options only with that weapon, carried /
  equipped rules, talents from items, species and trees with combined ranks, Force power rolls,
  no actor;
- `ranks`, `forceRating` and `amount` resolution;
- pool changes and their order, including Two weapons + Guns Blazing cancelling exactly, around
  Adversary upgrades and negative manual setback; tick / untick / re-tick leaving the base pool
  untouched;
- room checks: strain and wounds, exactly-at-threshold allowed, over refused, amounts capped,
  minions and vehicles greyed, dependency greying and unticking on Two weapons change;
- the chat line's text;
- sent-pool selections round-tripping, including an option that no longer fits and an old
  `appliedBuffs` message;
- the injection planner: matches, name normalisation, skip when code exists, tree nodes, species
  grants, qualities on weapons, armour and attachments, attachment qualities, idempotence;
- the non-GM guard's decision (pure part).

In Foundry, on the `test` world (ask before starting Foundry: the campaign world shares the data
folder), by hand: run the macro and check the report; on a character with the first-iteration
talents and a weapon with Auto-fire, check each option shows where it should, greys out at the
threshold, changes the preview, charges after posting (and not on a failed post), and is named in
chat; a rival paying wounds and a minion greyed; the GM editor on classic and Codex sheets, its
validation, and its absence for a player; a GM-sent pool arriving ticked and unticking cleanly.

## Documentation

- `CHANGELOG.md` under `Unreleased`: **Added** entries for roll options with the first library and
  Two weapons, the GM code editor, and the injection macro (with a sub-bullet telling the GM to run
  it once); a **Changed** entry for optional buffs moving onto the side card and arriving unlocked
  in a sent pool.
- Wiki: chapter 9 (*Changing a roll before and after*) for the side card, Two weapons and options;
  the item-editing chapter for the GM code editor, with the option format and the library table;
  the macro and how to run it; screenshots.
