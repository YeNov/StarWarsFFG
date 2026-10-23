# Roll options on initiative rolls — design

**Date:** 2026-10-23
**Branch:** `claude/initiative-roll-options-7f4517`
**Builds on:** `docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md` (roll options),
including its amendments. Where this document is silent, that one applies.

## Why

Four talents exist to help initiative checks: Rapid Reaction (suffer strain, +1 Success per
strain), Get The Drop (+1 Success per Stealth rank, once per session), On The Lookout (spend a
Destiny Point, +1 Success) and Ready for Anything (remove a Setback die per rank). The roll options
library has them, but they are offered on `skills: ["Cool", "Vigilance"]`, so they show only when
someone rolls Cool or Vigilance from the sheet. Initiative never reaches the dice dialog: every way
of rolling it (the tracker's die icon, Roll All, Roll NPCs, the GM's reroll, `Actor#rollInitiative`
from modules) ends in `CombatFFG.rollInitiative` (`modules/combat-ffg.js`), which opens its own
small dialog (`templates/dialogs/ffg-initiative.html`): a skill picker (Vigilance, Cool, and any
skill flagged "use for initiative"; the world's Initiative mode setting picks the default) and an
"add dice" table that applies to every combatant rolled. No roll option or optional buff reaches
it. A player with Rapid Reaction adds the Success by hand and takes the strain by hand.

## What the user decided

1. **The roll options card hangs on the initiative dialog**, the same folded card the dice dialog
   has. The initiative dialog itself (skill picker, add dice table, Roll / Cancel) stays.
2. **Rapid Reaction, Get The Drop, On The Lookout and Ready for Anything become initiative-only**:
   a new offer key, `initiative: true`, offers an option only on initiative rolls, and the four
   library entries use it. Ready for Anything's Mass Combat half stays as a second option of its
   own. Running the library again brings worlds that already ran it up to the new text, without
   touching a macro the GM edited (see **The library**).
3. **Group rolls** (one call that rolls more than one combatant: Roll All, Roll NPCs, a module
   passing several ids): when at least one of the listed combatants has an initiative option, a
   prompt first asks whether to roll with talents.
   - **No**: the old shared dialog for everyone, as today.
   - **Yes**: the combatants without initiative options go through the old shared dialog together;
     each combatant with one gets an initiative dialog of their own, with the card.
4. **Optional buffs ride on the same card**: the buffs on the roller's items that fit the picked
   skill show in the card's buffs section and layer onto the pool, as on every other roll.

Played back and not objected to (calls made during the conversation):

- Rolling **one** combatant opens the initiative dialog with the card, with no prompt.
- **Has an initiative option** means: among the options the roller's items link (talents, armour,
  gear, and their qualities and attachments, under the same carried and equipped rules), at least
  one has `offer.initiative === true`, whatever its other keys say. A character whose only fitting
  option is a general one (Intense Focus) does not trigger the prompt, but Intense Focus is still on
  their card when they get a dialog of their own.
- In the Yes path, the shared dialog comes first, then the per-combatant dialogs one after another
  in the order the call lists the combatants (for Roll All and Roll NPCs, the order they were added
  to the encounter; the tracker has no order before initiative is rolled). Cancelling or closing
  one dialog leaves only the combatants it covered
  unrolled; the next dialog still opens. Closing the prompt itself rolls nobody.
- Strain (wounds, for a rival) is charged as on any roll: after the initiative message posts,
  through the GM bridge's queue (`chargeRollOptionCost`), and the chat card gets the usual
  "Roll options:" line.
- For a vehicle, the crew member in the Pilot role is the roller, as the initiative pool already
  uses them: their talents are offered and they pay, as on crew rolls.
- Get The Drop's Stealth ranks stay an amount the player types; On The Lookout's Destiny Point is
  still spent by hand. Both are boundaries the roll options design already set.

## Goals

- Rolling one combatant's initiative offers, on the card, every option and buff that fits the
  picked skill on an initiative roll; ticked rows change the rolled pool, are charged after the
  message posts, and are named in chat.
- Switching Vigilance and Cool (or another initiative skill) re-offers the card for that skill.
- Group rolls follow decision 3.
- The library's four initiative talents are offered on initiative rolls only; Ready for Anything
  is also offered on Mass Combat checks.
- The card's code exists once, shared by the dice dialog and the initiative dialog.

## Non-goals

- A dice preview or simulation in the initiative dialog. *(My call: the dialog keeps its look; the
  card says what each row does, and the chat card shows the pool rolled.)*
- Any change to how the initiative pool is built (`_buildInitiativePool`), to the initiative value
  (Successes + Advantage / 100), or to the tracker's slots and claims.
- Options or buffs on the old shared dialog. It stays exactly as it is.
- Two weapons, target defence and the Adversary upgrade on initiative: there is no weapon and no
  target.
- Looking up Get The Drop's Stealth ranks, flipping a Destiny Point, tracking once per session,
  or giving allies the bonus that Get The Drop and On The Lookout grant them.
- Sending an initiative pool to a player.

## Anti-goals (a failure even if it otherwise works)

- **Strain charged for an initiative roll that never reached chat**, or charged twice.
- **A combatant rolled twice** in the Yes path (in the shared dialog and in one of their own), or
  **silently skipped** (neither rolled nor left for the user to cancel).
- **Tables that use no initiative options see a change.** No prompt when no listed combatant has
  one; a one-combatant dialog whose roller has nothing to offer looks and rolls exactly as today
  (the card stays hidden, as on the dice dialog).
- **An option with `initiative: true` showing on a check made from the sheet.**
- **The dice dialog's card behaving differently** after its code is shared: Two weapons, sent
  pools, swaps, Boost trades, minimum difficulty, tooltips and buffs work as before.

## Constraints

- Everything in the roll options design's **Constraints** still holds: decisions live in modules
  free of Foundry globals with Node tests (`tests/node/`, see `tests/README.md`); charges go through
  `postThenPay` and the GM bridge's coordinator; classic CSS goes in `styles/mandar.css` and the
  compiled `styles/starwarsffg.css` is never committed; English strings in `lang/en.json`; Codex
  reaches the system only through `modules/api/public-api.js` (nothing here touches Codex).
- `CombatFFG.rollInitiative(ids, { formula, updateTurn, messageOptions })` keeps its signature and
  its callers (core and modules). The hidden-combatant roll mode, the `core.initiativeRoll` flag,
  one sound per batch, `chatBubble: false` and keeping the current turn (`updateTurn`) apply to
  every dialog the flow opens.
- `npm test` and `npm run check:imports` pass, with no new eslint problems.

## How it works

### The option format

`offer` gains one key:

```jsonc
"offer": { "initiative": true }   // offered only on initiative rolls
"offer": { "initiative": false }  // never offered on initiative rolls
```

- `true`: the option is offered only on initiative rolls (and every other key given must still
  match, as today).
- `false`: the option is never offered on initiative rolls; elsewhere its other keys decide. For a
  row that belongs to another kind of check of the same skill (Mass Combat checks on Cool,
  Leadership or Discipline).
- Absent: no restriction. Such an option is offered on initiative rolls whenever its other keys
  match the picked skill, as on any check.
- The validator accepts a boolean only (the `notBoolean` error, as for `attack`). The header of
  `modules/helpers/roll-options.js` and the wiki's format table list the key.

### Which options an initiative roll offers

The roller is the combatant's actor (the token's own actor for an unlinked token), or the Pilot
crew member for a vehicle, exactly as `_findActorForInitiative` picks the data the pool is built
from. The offer context is that of a skill check with no item: the picked skill's key and type,
not an attack, no weapon, not a Force power, the roller's Force rating, and **initiative: true**.
So the card offers talents and the options of equipped armour and carried gear (with their
qualities and attachments) that match; weapons offer nothing, since no weapon is rolled.

Optional buffs: those `collectOfferedBuffs` offers for the picked skill key with no weapon.

**Changing the skill** re-collects the offer for the new skill. A ticked row or buff that is still
offered keeps its tick, amount and branch; one that is no longer offered is dropped.

### The pool

The base pool is built as today: the picked skill's pool for the roller, plus the add dice table.
Ticked buffs and options are layered on it in the same order and with the same code as the dice
dialog (`layerPool`), with no defence and no Adversary upgrade. The skill layer (for Skill Rank
buffs and swaps) uses the picked skill's characteristic value and rank from the same data the pool
is built from, and the add table's upgrades are recorded on the pool (`upgrades`), as the dice
dialog records the player's, so a Skill Rank buff or a swap rebuilds the positive dice around them
(characteristic 3, rank 2, one added upgrade and a +1 Skill Rank buff roll three Proficiency and one
Ability, not four Proficiency). The roll carries every result the layered pool adds (Success, Advantage, Triumph,
Despair, Failure, Threat, Light, Dark), not only the four passed today, and the initiative value
is computed as today, so an added Success raises it.

### Charging and the chat card

As in the dice dialog: the plan made at the Roll click fixes the pool, the chat line and the
charge. The initiative message posts, then the strain is charged with `chargeRollOptionCost` for the
roller. A failed post charges nothing. The message carries `rollOptionsText` and
`optionalBuffsText`, so the chat card shows the same lines as any roll.

### One combatant

The initiative dialog opens as today, titled with the combatant's name, plus the card (hidden when
there is nothing to offer, folded otherwise, with its count of ticked rows on the tab). Cancel
rolls nothing and charges nothing.

### Group rolls

1. More than one combatant listed: for each, find the roller and load the option macros its items
   link. A combatant is **talented** when at least one loaded option has `offer.initiative === true`.
2. Nobody talented: the old shared dialog, unchanged.
3. Somebody talented: a prompt names the talented combatants and offers **With talents** and
   **All together**. Closing it rolls nobody.
4. **All together**: the old shared dialog for everyone.
5. **With talents**: the old shared dialog for the combatants who are not talented (skipped when
   there are none), then one initiative dialog with the card for each talented combatant, in
   the order the call lists them, each waiting for the previous to close.

A call listing one combatant (Roll All with a single owned combatant, say) is the one-combatant
case.

### Combatants that cannot roll

Combatants are looked up by their own id (today's code goes through the token, which fails for a
combatant without one). In any dialog, one combatant that cannot roll never stops the others:

- **No actor** (its actor was deleted): skipped, with a warning naming it. It is never talented.
- **A vehicle with no crew member in the Pilot role**: skipped, with a warning saying it needs a
  Pilot (today this is only a console message, then an error).
- **No data for the picked skill** (an actor without that skill or its characteristic): skipped,
  with a warning naming the combatant and the skill.
- **No token** (a combatant added from an actor): it rolls; the message's speaker has no token, its
  alias and the flavor use the combatant's name, and the hidden rule reads the combatant's own
  hidden flag. The scene is the combatant's, else the viewed one, else none.
- A combatant that is not found, or that the user does not own, is skipped quietly, as today.
- **Opening the dialog never fails on these either.** Today's dialog setup reads the combatant's
  actor name, its system data and each listed skill's data before anything is rolled. It is
  rebuilt so that a one-combatant dialog for an actorless combatant, or for an actor without
  Vigilance or Cool, still opens: the title falls back to the combatant's name, and the skill
  picker lists Vigilance and Cool plus any skill flagged for initiative that exists. The card is
  only built for a roller with an actor (and a Pilot, for a vehicle). Its plans use an empty base
  pool, plus the add table, whenever the picked skill has no data. That holds on every replan,
  not only the first. The Roll then skips such a combatant with its warning.

Calls made while writing this up *(mine)*:

- A single combatant left for the shared dialog in the With talents path gets the old dialog,
  without the card, as the old path would show it. It is not treated as a one-combatant roll.
- The promise `rollInitiative` returns settles, with the combat, once the flow has ended: the last
  dialog closed, or the prompt closed. Today a cancelled dialog leaves it pending forever; nothing
  in the system waits on that, and settling is what lets the group flow move to the next dialog.
- Each per-combatant dialog opens only after the previous one's roll has posted and its charge has
  been answered, so a linked actor listed as two combatants (two tokens of one character) sees its
  strain already raised by the first roll when the second dialog plans.

### Sharing the card's code

The card's Foundry-side code lives in `RollBuilderFFG` today: loading the linked macros, offering,
planning (live values, Boost supply, swaps, minimum difficulty), tooltips, the rows' context, the
reasons a row is greyed, the footer, the ticked count, rendering the panel template, moving the card
onto the window, and the delegated listeners. The initiative dialog needs the same. That code moves
out of `RollBuilderFFG` into a piece both dialogs use; the dice dialog keeps what only it has (Two
weapons, sent pools, defence, Adversary). What can be pure goes into Foundry-free helpers with Node
tests. *(Shape left to the builder: one shared controller class, or shared functions.)*

### The library

| Entry | Offered on | Rows |
| --- | --- | --- |
| Rapid Reaction | `initiative: true` | unchanged otherwise: strain = amount (1..ranks), +Success × amount |
| Get The Drop | `initiative: true` | unchanged otherwise: amount "Your Stealth ranks", +Success × amount |
| On The Lookout | `initiative: true` | unchanged otherwise: +1 Success |
| Ready for Anything | `initiative: true`, `skills: ["Cool", "Vigilance"]` | remove Setback × ranks |
| Ready for Anything (Mass Combat) | `initiative: false`, `skills: ["Leadership", "Discipline", "Knowledge: Warfare"]` | a second option in the same entry: remove Setback × ranks, hint naming Mass Combat checks |
| Master Strategist | `initiative: false` added to its skills | unchanged otherwise (a Mass Combat talent that today shows on Cool checks, so it would show on Cool initiative rolls) *(my call)* |

- Rapid Reaction, Get The Drop and On The Lookout drop `skills: ["Cool", "Vigilance"]`: their
  rules say "initiative checks", so a table that has flagged another skill for initiative still
  gets them. Ready for Anything keeps Cool and Vigilance, because its rule names them.
- The two Ready for Anything options never meet: the Mass Combat row is never offered on an
  initiative roll, and the initiative row only on one. So the talent removes its ranks in Setback
  once, even on a world that flags Leadership for initiative.
- Hints lose the word "Initiative" where it now says nothing; they keep "once per session",
  "spend a Destiny Point" and the notes about allies. *(Wording left to the builder.)*

**Existing worlds.** Deleting and recreating a library macro would break items: the run relinks
only places with no live link, so an item holding the old library link and a custom one would keep
a dead link and get no new one, and locked compendiums are skipped. Instead the run updates
library macros **in place**, so their uuids, and every link to them, stay valid:

- An entry may list its earlier texts (`previous`: earlier `options` arrays). The five entries
  above list the text they had before this change.
- When the run finds an existing library macro (by its library mark) whose JSON is structurally
  equal to one of its entry's earlier texts, the GM never edited it: the run rewrites its text to
  the entry's current options.
- **Every** macro carrying a library mark is checked, not only the first per entry: a world can
  hold two (a GM's duplicate, an import), and items may link either. The first stays the one new
  links point at, as today.
- A library macro whose JSON matches neither the current text nor an earlier one was edited by the
  GM and is left alone. The run's report lists it when its entry's text has changed, so the GM can
  bring it up to date by hand.
- Creating missing macros and linking work as before. The run still never overwrites a macro the
  GM changed, which is the original design's rule.

So a world that already ran the library gets the new behaviour by running `installLibrary()` once
more. Until then its four macros keep the old text: offered on Cool and Vigilance checks from the
sheet and, being Cool or Vigilance checks, on initiative rolls; with no `initiative: true` in the
world, group rolls never show the prompt. The CHANGELOG and the wiki say so. The unreleased
CHANGELOG line that says a second run leaves macros alone "edited or not" changes to match.

## Left to the builder

- Module, class and function names; the shape of the shared card code.
- The prompt's look and wording, and how the per-combatant dialogs are sequenced in code.
- Card placement on the initiative window and any CSS it needs (in `styles/mandar.css`), matching
  the dice dialog's card.
- Hint wording in the library entries.
- Removing the **Options on initiative rolls** section from `docs/roll-options-deferred.md`.

## Testing

Node, for the parts free of Foundry:

- validation: `offer.initiative` true and false accepted, any other value refused with the
  `notBoolean` error naming the key; every library entry still validates;
- offering: an `initiative: true` option offered on an initiative roll and not on a sheet check of
  the same skill; an `initiative: false` option offered on the sheet check and not on the
  initiative roll; an option without the key offered on both; `initiative: true` with `skills`
  needs both; the initiative context (no weapon, not an attack, not a Force power);
- the library: the entries above, Ready for Anything's two options never both offered on one roll
  (also with Leadership as the initiative skill), hints, and each changed entry's `previous` text;
- the library run's plan: an unedited library macro gets the current text and keeps its uuid; an
  edited one is left and reported; an item holding the library link and a custom link keeps both
  and needs no relink; a second run changes nothing;
- combatants that cannot roll: no actor, a vehicle without a Pilot and a missing skill skipped with
  their reason while the rest of the batch rolls; a tokenless combatant rolling with a token-free
  speaker; the whole group flow (prompt, both answers, closing it) with such combatants listed;
- the add table's upgrades recorded, and a Skill Rank buff over them giving three Proficiency and
  one Ability for characteristic 3, rank 2, one added upgrade;
- talent detection and the group split: nobody talented gives the old path; a mix gives the shared
  group and the talented ones in the order listed; everyone talented gives no shared dialog; one
  combatant gives the one-combatant case; options switched off, broken, on gear not carried or
  armour not equipped do not count;
- the initiative pool: base pool plus add dice plus ticked buffs and options, in the dice dialog's
  order; no defence or Adversary; Successes from options counted in the initiative value; Triumph
  and Despair carried; the skill layer from the picked skill;
- re-offering on a skill change: ticks kept for rows still offered, dropped for the rest;
- the card helpers moved out of `RollBuilderFFG` keep (or gain) their tests.

In Foundry, on the `test` world (ask before starting Foundry: the campaign world shares the data
folder), by hand: a character with Rapid Reaction, Get The Drop, On The Lookout and Ready for
Anything rolls initiative from the tracker; each row shows, Rapid Reaction greys at the strain
threshold, ticking changes what is rolled, strain is charged after the message posts, and chat
names the options; switching Vigilance and Cool; an optional buff on Vigilance; a vehicle whose
Pilot has Rapid Reaction; a rival paying wounds; Roll NPCs with a mix of talented and plain NPCs
(prompt, All together, With talents, cancelling one dialog); a player rolling their own character;
a Cool check from the sheet no longer offering the four after a second library run updated their
macros in place (an item that also links a custom macro still offers both); and the
dice dialog's card still working (Two weapons, a sent pool, a Boost trade, a tooltip).

## Documentation

- `CHANGELOG.md` under `Unreleased`: **Added**, roll options and optional buffs on initiative
  rolls, with the group-roll prompt; the `initiative` offer key under the roll option macros entry.
  **Changed**, the four library entries are initiative-only (and Master Strategist's Mass Combat
  row stays off initiative), with a sub-bullet telling a GM who ran the library already to run it
  once more, which updates the library macros they have not edited and lists the ones they have.
  The existing unreleased sub-bullet about running `installLibrary()` again is corrected to match.
  A **Fixed** entry: a combatant without a token, a vehicle without a Pilot or a combatant whose
  actor is gone no longer stops a whole initiative roll.
- Wiki (local clone of `https://github.com/YeNov/StarWarsFFG.wiki.git`, committed as YeNov):
  `Tutorial-10-Initiative-and-the-combat-tracker.md` (**Rolling initiative**: the card and the
  group prompt; **Vehicles**: the Pilot's talents); `Tutorial-09-Changing-a-roll-before-and-after.md`
  (**The roll options card**: that initiative rolls carry it too); `Tutorial-16-More-worth-knowing.md`
  (the `offer` row of the format table gains `initiative`, and the refresh steps for a world that
  already ran the library). A new screenshot of the initiative dialog with the card open, if the
  user agrees to a Foundry session for it.

## Amendments: the plan review (2026-10-23)

The user's review of the first plan found five problems; the sections above now carry the fixes.

- **Combatants that cannot roll** (new section): lookup by combatant id; no actor, no Pilot or no
  skill data skips that combatant with a warning; a tokenless combatant rolls.
- **The pool**: the add table's upgrades are recorded, so Skill Rank buffs and swaps rebuild the
  dice correctly.
- **The library, existing worlds**: library macros are updated in place when the GM never edited
  them, instead of being deleted and recreated, which broke items with more than one link.
- **The option format and the library**: `initiative: false` keeps a row off initiative rolls;
  Ready for Anything's initiative row keeps Cool and Vigilance, and its Mass Combat row never
  shows on initiative, so the talent cannot apply twice. Master Strategist gets `initiative: false`
  too *(my call)*.
- The plan no longer names a personal email address.

A second review of the revised plan added two more, also folded in above: the dialog's own setup
is guarded against missing actors and skills (on every replan too), and the library run checks
every macro carrying a library mark, not only the first per entry.
