# Homestead skill roll — design

## Intent

A homestead (a base, a ship's home port, a workshop) is shared by the party. Its
upgrades — a workshop, a medbay, a library — should help the characters who use
them. Today an upgrade can carry modifiers (Skill Boost on Mechanics, and so on),
but nothing reads them: the homestead has no characteristics or skills, so the
modifiers never reach a roll.

This feature lets a player roll one of their character's skills **from the
homestead sheet**, with the homestead's upgrades added to the pool, in the
standard dice dialog. Upgrades also gain **optional buffs**, the situational
bonuses weapons and gear already carry.

## The flow (decided with the user)

1. A **Roll skill** button on the homestead actor sheet.
2. **Pick a character.** The roller's own characters: actors of type
   `character` the current user owns.
   - Exactly one → picked without asking.
   - Several → a small window lists them; the user picks one.
   - None → a notification says so; nothing opens.
   - **For the GM**: only player characters — `character` actors owned by at
     least one non-GM user — not every actor in the world.
3. **Pick a skill** from that character's skill list (the skill theme in use).
   The picker has a search box: typing filters the list, and the list updates
   0.2 s after the last keystroke.
4. **The standard dice dialog opens**, built exactly as a roll from that
   character's own sheet would build it (characteristic + ranks, the
   character's talents, gear and status effects), **plus the default modifiers
   of the homestead's upgrades** that apply to the chosen skill.
5. **The roll options card** on the right of the dialog works as it does today:
   the character's roll options and optional buffs, **plus the optional buffs
   of the homestead's upgrades** that fit the skill, all unticked.
6. The roll posts as the **character's** roll. Strain from ticked roll options
   is charged to the character, as today.

## Who sees the button

Only users with **Owner** permission on the homestead. Observers see the sheet
but no button.

## Which items count

Only `homesteadupgrade` items on the homestead. Items in the Storage tab add
nothing.

All upgrades on the homestead count; there is no per-upgrade on/off switch in
this version.

## Upgrade changes

- Homestead upgrades get the **optional buffs editor** under Modifiers, on the
  classic item sheet and the Codex II item sheet, the same editor weapons and
  gear use (`modules/helpers/optional-buffs.js`, `BUFF_ITEM_TYPES`).
- The upgrade's existing **default modifiers** (`system.attributes`) are what
  step 4 adds. Rows that change a roll's dice count (the row types listed in
  `BUFF_MODTYPES`: Skill Boost, Skill Setback, Skill Add Advantage, Roll
  Modifiers, Dice Modifiers and so on); a Skill row counts only when its skill is
  the one rolled. Other row types (Characteristic, Stat…) do nothing here.

## Constraints

- Use the existing dice dialog and roll options card; no new roll dialog.
- The character's own roll must not change: rolling from the character sheet
  gives the same pool as before, with no homestead modifiers.
- The homestead's modifiers must not leak onto the character's sheet or Active
  Effects; they count only for a roll started from the homestead.
- Works for linked and unlinked character tokens no differently than a
  sheet roll does today (the character is the world actor picked in step 2).
- Codex II: a Codex II homestead sheet is being built on branch
  `claude/codex-homestead-sheet-b1f5ea` (not merged yet). The button belongs on
  both the classic and the Codex II homestead sheets; whichever lands second adds
  it to the other.
- CHANGELOG entry and wiki tutorial update are part of the work (see CLAUDE.md).

## Non-goals

- No homestead characteristics or skills of its own.
- No storage-item modifiers.
- No per-upgrade enable/disable or "installed" state.
- No change to who may edit upgrades or buffs.

## Anti-goals

- Upgrade modifiers silently counted twice (once as Active Effects, once by this
  feature), or appearing on rolls from the character sheet.
- A player able to roll with a homestead they only observe.

## Calls made by Claude (not discussed with the user)

- The character picker lists `character` actors only — not minions, rivals,
  vehicles or nemeses of other types.
- The chat card notes the homestead (for example "with Home Base"), so the table
  knows where the extra dice came from.
- Where the skill picker comes from: a simple list in the same window as, or
  right after, the character picker.
- An upgrade modifier row that is switched off (its own `active` toggle) adds
  nothing.
- Upgrades get the optional buffs editor only, not roll option macro links.
- A homestead roll the GM sends to a player keeps its ticked homestead buffs
  through the existing `withAppliedBuffs` handling.

## Left to the builder

- How the extra pool is assembled (wrapping `DiceHelpers.rollSkill` /
  `rollSkillDirect`, or reading the upgrades' rows into the pool before
  `displayRollDialog`), and how the roll options card learns about the
  homestead's buffs (for example, passing extra items to `collectOfferedBuffs`).
- The picker window's look, following existing dialogs.
- Button placement on the classic sheet header.
