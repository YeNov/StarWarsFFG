# Roll options: deferred work

Talents and features set aside during the review of the roll options library
(`modules/config/roll-option-library-entries.js`). The talents under **Special actions** are not
in the library; the features in the other sections are not built, though the talents that need
them keep a reminder row in the library. The design the library follows is
`docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md` (see its amendments).

## Special actions

A roll option is a buff on a check the player is already making. These talents are different:
the talent *is* the action. It defines its own check (skill, characteristic, difficulty, extra
dice) and what success does. Ticking a box on an ordinary roll does not fit them; they want their
own entry point, such as a button on the talent that opens the dice dialog already set up.

What such an entry point would need, beyond today's options: a set difficulty, a characteristic
or skill swap, Force dice up to the Force rating less committed dice, an opposed check, and a
note of what Force points, Advantage or success buy afterwards.

**Force combat actions**

| Talent | The action, in short |
| --- | --- |
| Disruptive Strike | Lightsaber attack with Cunning, plus Force dice; a Force point hampers the target's next attack. |
| Draw Closer | Lightsaber attack with Willpower at a silhouette 1 target up to medium range, plus Force dice; Force points pull the target closer or add a success. |
| Far Strike | Brawl attack made at range, plus Force dice; Force points extend the range. |
| Hawk Bat Swoop | Lightsaber attack with Agility at a target up to short range, plus Force dice; Force points engage the target or add Advantage. |
| Makashi Finish | Lightsaber attack with Presence on an engaged target, plus Force dice; a Force point raises the Critical Injury roll. |
| Saber Throw | Lightsaber attack thrown up to medium range, plus Force dice; Force points are needed to hit and to bring the saber back. |
| Strategic Form | Hard Lightsaber check with Force dice; on success a nearby foe may only attack this character. |
| Terrify | Hard Coercion check with Force dice; successes disorient targets, a Force point immobilizes. |

**Other special actions**

| Talent | The action, in short |
| --- | --- |
| Design Flaw (Imp) | Opposed Computers check against a disabled or restrained droid, difficulty downgraded per rank of Design Flaw, to read or change its memory. |
| Hidden Fangs | A combat check with a poisoned weapon made with Skulduggery instead of the combat skill, for 2 strain. |
| Improvised Concoction | Hard Knowledge (Xenology) check with Force dice, once per session, to brew a poison or drug. |
| In the Know (Improved) | Opposed Deception check, difficulty downgraded per rank of In the Know, to plant false intelligence. |
| Made You Talk | Opposed social check against a captured enemy, a Boost die per 2 strain they took this encounter. |
| Natural Remedy | Heal wounds and Critical Injuries with Survival instead of Medicine, at one more difficulty die. |
| Sense the Scene | Hard Perception check with Force dice at a crime scene; a Force point reads a person's emotions. |

**Kept as an option for now, a special attack later**

| Talent | Today, and later |
| --- | --- |
| Sarlacc Sweep | Today an option on Lightsaber checks that adds a difficulty die. Later its own attack: a Lightsaber attack that can hit more engaged targets for Advantage. |

## Damage, Pierce and crit from options

Options can now change the attacking weapon's damage and critical rating for one attack:
`weapon: { damage, critical }`, with the `skillRank` word for the rolled skill's rank. The chat
line shows the numbers and Apply Damage opens with the damage
(`docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md`, "Amendments: weapon damage and
crit from options"). Point Blank and Deadly Accuracy use it.

Still deferred: Pierce, a word for a characteristic's value, and Apply Crit adding a bonus to the
roll (as opposed to the crit rating). The talents below still need checking against their rule
text before their entries take a `weapon` key; until then the card note names the effect and the
table applies it. Damage: Ambush, Ambusher, Barrage, Embrace Your Hate, Falling Avalanche, Finish
the Fight, Finish the Fight (Improved), Martial Grace, Momentum, Prey on the Weak, Ride Down,
Temple Training; Pierce: One Shot, One Kill, Precise Aim (Improved); crit: Clanker Killer
(Improved), Hunter, Hunter (Supreme), Sorry About the Mess, Overcharged Battery.

## A skill the character picks once

Compelling Counterpart has the player choose a social skill once (per Droid Companion). Today it is
offered on every social check and the player ticks it on the right one. A real choice would put
`choose: { skill: [...] }` in the option and keep the pick on the character's own talent (the macro
is shared by everyone), as a new stored field on talents and specialization tree slots. The first
time the row shows it carries a skill dropdown; after that it is offered only on the picked skill,
and the pick can be changed on the talent sheet.

## Initiative talents, the rest

Initiative rolls carry the roll options card
(`docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md`). What the dialog still
leaves to the table:

- **Get The Drop** adds Success equal to the character's Stealth ranks, typed into the row's
  amount. A value word for another skill's rank (such as `"skill:Stealth"`) would fill it in and
  cap it.
- **On The Lookout** costs a Destiny Point, flipped by hand. A `destiny` cost, charged through the
  GM after the roll posts as strain is, would flip it, and grey the row when no light side point is
  left.
- **The allies' half** of both talents: allies add the bonus to their own initiative checks. Their
  rolls do not see the talent, so they add the Success in the add table.
