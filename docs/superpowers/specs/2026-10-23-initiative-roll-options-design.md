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
   own. Worlds that already ran the library keep the old macro text until the GM refreshes it (see
   **The library**).
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
  in tracker order. Cancelling or closing one dialog leaves only the combatants it covered
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
- Fixing the existing quirk that `rollInitiative`'s promise never settles when its dialog is
  cancelled, beyond what the group flow needs to move on to the next dialog.

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
```

- `true`: the option is offered only on initiative rolls (and every other key given must still
  match, as today).
- Absent or `false`: no restriction. Such an option is offered on initiative rolls whenever its
  other keys match the picked skill, as on any check.
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
is built from. The roll carries every result the layered pool adds (Success, Advantage, Triumph,
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
   tracker order, each waiting for the previous to close.

A call listing one combatant (Roll All with a single owned combatant, say) is the one-combatant
case.

Calls made while writing this up *(mine)*:

- A single combatant left for the shared dialog in the With talents path gets the old dialog,
  without the card, as the old path would show it. It is not treated as a one-combatant roll.
- The promise `rollInitiative` returns settles once the last dialog of the flow has closed. Closing
  the prompt, and cancelling a one-combatant dialog, keep today's behaviour (it never settles).
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
| Ready for Anything | `initiative: true` | remove Setback × ranks |
| Ready for Anything (Mass Combat) | `skills: ["Leadership", "Discipline", "Knowledge: Warfare"]` | a second option in the same entry: remove Setback × ranks, hint naming Mass Combat checks |

- The initiative-only entries drop `skills: ["Cool", "Vigilance"]`. *(My call: a table that has
  flagged another skill for initiative still gets the talent on it.)*
- Hints lose the word "Initiative" where it now says nothing; they keep "once per session",
  "spend a Destiny Point" and the notes about allies. *(Wording left to the builder.)*
- The two Ready for Anything options have distinct ids. Since an initiative roll uses the
  initiative row and a Leadership, Discipline or Warfare check from the sheet uses the other, they
  meet only on a world that flags one of those three skills for initiative, where both show and the
  player ticks one.
- **Existing worlds.** `installLibrary()` never overwrites a macro, so a world that already ran it
  keeps the four macros as they were: offered on Cool and Vigilance checks from the sheet, and now
  also on initiative rolls, because those are Cool or Vigilance checks too. To take the new text,
  the GM deletes those four macros from the Roll options folder and runs `installLibrary()` again:
  it recreates them and relinks every item whose link died. Editing the text by hand works too.
  Until then no option in that world has `initiative: true`, so group rolls never show the prompt;
  a one-combatant roll still shows the old rows, because they match the skill. The CHANGELOG and
  the wiki say both.

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
  the same skill; an option without the key offered on both; `initiative: true` with `skills` needs
  both; the initiative context (no weapon, not an attack, not a Force power);
- the library: the four entries initiative-only, Ready for Anything's two options and their ids,
  hints;
- talent detection and the group split: nobody talented gives the old path; a mix gives the shared
  group and the talented ones in tracker order; everyone talented gives no shared dialog; one
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
a Cool check from the sheet no longer offering the four after the macros are refreshed; and the
dice dialog's card still working (Two weapons, a sent pool, a Boost trade, a tooltip).

## Documentation

- `CHANGELOG.md` under `Unreleased`: **Added**, roll options and optional buffs on initiative
  rolls, with the group-roll prompt; the `initiative` offer key under the roll option macros entry.
  **Changed**, the four library entries are initiative-only, with a sub-bullet telling a GM who ran
  the library already how to refresh them.
- Wiki (local clone of `https://github.com/YeNov/StarWarsFFG.wiki.git`, committed as YeNov):
  `Tutorial-10-Initiative-and-the-combat-tracker.md` (**Rolling initiative**: the card and the
  group prompt; **Vehicles**: the Pilot's talents); `Tutorial-09-Changing-a-roll-before-and-after.md`
  (**The roll options card**: that initiative rolls carry it too); `Tutorial-16-More-worth-knowing.md`
  (the `offer` row of the format table gains `initiative`, and the refresh steps for a world that
  already ran the library). A new screenshot of the initiative dialog with the card open, if the
  user agrees to a Foundry session for it.
