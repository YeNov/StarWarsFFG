# Weapon Damage and Crit from Roll Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ticked roll option can add to (or take from) the attacking weapon's damage and critical rating for that one attack, with a new `skillRank` word so Deadly Accuracy and Point Blank work.

**Architecture:** The option format gains a `weapon: { damage, critical }` key, validated and resolved exactly like `dice` values. The planner puts the resolved numbers on each ticked row; a new pure helper sums them and applies them to the chat card's weapon copy. `RollFFG` carries the sum, serializes it, and applies it in `render()` after the copy is reloaded from the item uuid. Apply Damage needs no change: it reads that same copy.

**Tech Stack:** Foundry VTT 14 system code (ES modules), Node `node --test` for the pure modules.

**Spec:** [docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md](../specs/2026-10-20-roll-dialog-talents-design.md), section "Amendments: weapon damage and crit from options (2026-10-27)". Read the whole "The option format" and "Amendments: the talent review" sections too.

## Global Constraints

- Only `damage` and `critical` under `weapon`. Damage never below 0; crit never below 1.
- `skillRank` is the rank of the skill the roll was opened with, before any `skill` swap; 0 with no skill or no actor.
- An option with a `weapon` key is offered only when `context.isAttack` is true.
- `weapon` is not allowed inside `choices`.
- Pure modules import nothing from Foundry so Node tests cover them; parse-check edited ES modules with `node --input-type=module --check < file`.
- Do not commit `npm run compile` output for `styles/starwarsffg.css`.
- New user-facing strings go in `lang/en.json` only.

## Review Focus

1. **Re-rendering a chat message** (reload, scroll-back, another client): the bonus must apply once, not stack. The copy is reloaded from the uuid on most renders, but not when the item is gone. Task 4 pins this with a marker test.
2. **Damage that ends at exactly 0** (base 1, an option −1): the card, its crit line and Apply Damage must all use the adjusted copy. Today the template and `planDamageSeed` read `adjusted == 0` as "never adjusted" and fall back to the raw `value` (and the template to the raw crit), so base 1 → 0 with 2 successes gives 3 instead of 2. Task 4 routes both through one reader that honours the option marker, and tests it.
3. **A weapon whose `damage.adjusted` is 0 because it was never opened in the sheet**: the bonus adds to `damage.value`. Task 4 tests it.
4. **The target changes while Roll is awaiting** (a re-plan between the click and the post): the weapon numbers must be the ones the line names and the charge pays for. Task 4 derives them from the click-time `optionEntries` snapshot, and tests that a later re-plan does not change them.
5. **A world that already installed the library**: an unedited Point Blank macro must get the new text on the next library run, and one the GM edited stays as it is and is reported. Task 5 tests both.

Also covered by tests, lower risk: crit floor at 1 (Task 4); a GM-sent pool re-plans to the same numbers (Task 2 tests the planner, Task 6 by hand); an option with `weapon` is not offered on a non-attack roll (Task 2).

---

### Task 1: Option format — `weapon` key and `skillRank` word

**Files:**
- Modify: `modules/helpers/roll-options.js` (header comment, `OPTION_KEYS`, `MAX_WORDS`, `DICE_WORDS`, new `checkWeapon`)
- Test: `tests/node/roll-options.test.mjs`

**Interfaces:**
- Produces: `export const WEAPON_KEYS = Object.freeze(["damage", "critical"])`; `diceWord("skillRank")` → `{word: "skillRank", sign: 1}`; `diceWord("-skillRank")` → sign −1.

- [ ] **Step 1: Write the failing tests** in `tests/node/roll-options.test.mjs`:
  - `validateOptions([{ id: "a", weapon: { damage: 2, critical: "-ranks" } }])` has no errors.
  - `weapon: { damage: "skillRank" }` and `amount: { max: "skillRank" }` and `dice: { boost: "skillRank" }` are valid.
  - `weapon: { pierce: 1 }` → error `{ key: "weapon.pierce", code: "unknownKey" }`.
  - `weapon: { damage: "lots" }` → `{ key: "weapon.damage", code: "notDiceValue" }`.
  - `weapon: 3` → `{ key: "weapon", code: "notObject" }`.
  - `weapon: { damage: "amount" }` without `amount` → `{ key: "weapon.damage", code: "amountWithoutAmount" }`.
  - A choice with `weapon` → `{ key: "choices[1].weapon", code: "unknownKey" }` (CHOICE_KEYS unchanged).
- [ ] **Step 2: Run** `node --test tests/node/roll-options.test.mjs` — the new tests fail.
- [ ] **Step 3: Implement.** Add `"weapon"` to `OPTION_KEYS`, `"skillRank"` to `MAX_WORDS` and `DICE_WORDS`. `checkWeapon(weapon, fail, amountUsers)` mirrors `checkDice` over `WEAPON_KEYS` with group `"weapon"`; call it from the option check beside `checkDice`. Update the header comment's format block and word list.
- [ ] **Step 4: Run** `node --test tests/node/roll-options.test.mjs` — all pass.
- [ ] **Step 5: Commit** `Accept weapon damage and crit in roll options`.

### Task 2: Offer and plan — resolve `skillRank` and `weapon`

**Files:**
- Modify: `modules/helpers/roll-option-costs.js` (`rollOptionInputs`, `planOptionStates`)
- Modify: `modules/helpers/roll-options-offer.js` (`collectOfferedOptions`, header comment)
- Test: `tests/node/roll-options-offer.test.mjs`, `tests/node/roll-option-costs.test.mjs`

**Interfaces:**
- Consumes: Task 1's `WEAPON_KEYS`, `diceWord`.
- Produces:
  - `context.skillRank: number` from `rollOptionInputs` — `Number(actor.system.skills[skillKey].rank) || 0`, 0 with no actor or skill.
  - Offered row gains `weapon: Record<"damage"|"critical", number|string> | null` (`ranks`, `forceRating`, `skillRank` resolved; `amount` and live words left as words).
  - Planned row gains `weapon: {damage: number, critical: number} | null` — numbers on a ticked row, `null` on an unticked or disabled one.

- [ ] **Step 1: Write the failing tests.**
  - Offer: with `context.skillRank: 3`, an option `weapon: { damage: "skillRank" }`, `offer: {}` on an attack → offered row `weapon` is `{ damage: 3 }`; `"-skillRank"` → −3; `dice: { boost: "skillRank" }` → `boost: 3`.
  - Offer: the same option with `context.isAttack: false` is not offered; an option without `weapon` still is.
  - Inputs: `rollOptionInputs(actor, { skillKey: "Ranged: Light" })` with `system.skills["Ranged: Light"].rank = 2` → `context.skillRank === 2`; no actor → 0.
  - Plan: a ticked row with `weapon: { damage: "amount" }` and amount 2 → planned `weapon` `{ damage: 2, critical: 0 }`; the same row unticked → `weapon: null`.
- [ ] **Step 2: Run** `node --test tests/node/roll-options-offer.test.mjs tests/node/roll-option-costs.test.mjs` — the new tests fail.
- [ ] **Step 3: Implement.** In `collectOfferedOptions`, skip an option with `weapon` unless `context.isAttack`; extend `resolve` with `skillRank`; add `weapon: option.weapon ? resolveDice(option.weapon) : null` to the row. In the planner, `resolvedWeapon(option, amount, live)` uses `resolveValue` over `WEAPON_KEYS` and fills missing keys with 0; set it wherever a ticked row returns `dice: own.dice`, and `weapon: null` on every other return.
- [ ] **Step 4: Run** the same command — all pass; then `npm test` — no other test broke.
- [ ] **Step 5: Commit** `Resolve skillRank and weapon values for roll options`.

### Task 3: Chat line shows weapon numbers

**Files:**
- Modify: `modules/helpers/roll-option-card.js` (`rollOptionCardEntries`, `formatRollOptionsLine`)
- Modify: `lang/en.json`
- Test: `tests/node/roll-option-card.test.mjs`

**Interfaces:**
- Consumes: planned row `weapon` (Task 2).
- Produces: entry gains `weapon: {damage: number, critical: number} | null`.

- [ ] **Step 1: Write the failing tests.** With a ticked Point Blank row (ranked, rank 2, `weapon: {damage: 2, critical: 0}`), the line is `Roll options: Point Blank 2 (+2 damage)`. A row with `{damage: 0, critical: -1}` and no cost → `Hunter (Crit −1)` (U+2212 minus, as the existing cost text uses — check `costParts`). A row with weapon numbers and 1 strain → `X (+1 damage, 1 strain)`: weapon parts first, then costs, in one bracket. Zero parts are left out.
- [ ] **Step 2: Run** `node --test tests/node/roll-option-card.test.mjs` — fails.
- [ ] **Step 3: Implement.** Copy `row.weapon` onto the entry; in `formatRollOptionsLine` prepend weapon parts to `costs`. Lang keys: `"SWFFG.RollOptions.Card.Damage": "{value} damage"`, `"SWFFG.RollOptions.Card.Critical": "Crit {value}"`, where `value` is signed (`+2`, `−1`).
- [ ] **Step 4: Run** — passes.
- [ ] **Step 5: Commit** `Show weapon damage and crit on the roll options line`.

### Task 4: Apply the bonus to the chat card's weapon copy

**Files:**
- Create: `modules/helpers/roll-option-weapon.js`
- Modify: `modules/dice/roll.js` (`render`, `toJSON`, `fromData`)
- Modify: `modules/dice/roll-builder.js` (capture beside `optionEntries`, ~line 386; assign beside `roll.rollOptionsText`, ~line 541)
- Modify: `templates/chat/roll-weapon-card.html` (lines 7–10: the two damage/crit branches)
- Modify: `modules/helpers/apply-damage-plan.js` (`planDamageSeed`, lines 115–117)
- Test: `tests/node/roll-option-weapon.test.mjs`, `tests/node/apply-damage.test.mjs`

**Interfaces:**
- Consumes: entries from `rollOptionCardEntries`, each with `weapon` (Task 3).
- Produces:
  - `sumWeaponAdjust(entries: Array<{weapon: object|null}>): {damage: number, critical: number} | null` — sums the entries (every entry is a ticked row); null when both sums are 0.
  - `applyWeaponAdjust(itemData: object, adjust: object|null): object` — returns itemData. Sets `system.damage.adjusted` to (adjusted, or value when adjusted is 0) + damage, floor 0; `system.crit.adjusted` likewise with floor 1; records `system.rollOptionWeapon = adjust`. Untouched when `adjust` is null, when the copy has no `system.damage`, or when `system.rollOptionWeapon` is already set.
  - `cardWeaponStats(itemSystem: object): {damage: number, crit: number}` — the one rule for which numbers the card uses. With `rollOptionWeapon` set: `damage.adjusted` and `crit.adjusted`, even when 0. Otherwise today's rule: both `adjusted` when damage `adjusted != 0`, else both raw `value`s (the crit follows the damage branch, as the template does now).
  - `RollFFG#weaponAdjust` (default null), carried by `toJSON`/`fromData`.

- [ ] **Step 1: Write the failing tests** in `tests/node/roll-option-weapon.test.mjs`:
  - sum of entries `{2,0}` and `{1,-1}` → `{damage: 3, critical: -1}`; entries without `weapon` ignored; all zero → null.
  - **Click-time capture** (Review Focus 4): build entries with `rollOptionCardEntries` from a plan with Point Blank ticked and take `sumWeaponAdjust(entries)`. Then re-plan with it unticked, as a target change during the awaits would. The captured sum is still `{damage: 2, critical: 0}`, and the new plan's entries sum to null.
  - apply `{damage: 2, critical: 0}` to `{system: {damage: {value: 5, adjusted: 7}, crit: {value: 3, adjusted: 3}}}` → damage.adjusted 9, crit.adjusted 3.
  - adjusted 0, value 5 → damage.adjusted 7.
  - crit adjusted 1, critical −1 → 1; damage 1, damage −3 → 0.
  - applying twice gives the same numbers as once (Review Focus 1).
  - null adjust, or no `system.damage`, leaves the object unchanged.
  - `cardWeaponStats` (Review Focus 2): damage 1, crit 3 (adjusted 1 and 3), after `applyWeaponAdjust` with `{damage: -1, critical: -1}` → `{damage: 0, crit: 2}`. An unmarked copy with damage adjusted 0 → both raw values (today's behaviour).
- [ ] **Step 2: Add to `tests/node/apply-damage.test.mjs`**: `planDamageSeed` on a copy with base damage 1 reduced to 0 by `applyWeaponAdjust`, with 2 successes → `autoDamage` 2 (today 3). An unmarked copy with adjusted 0 still uses `value`.
- [ ] **Step 3: Run** `node --test tests/node/roll-option-weapon.test.mjs tests/node/apply-damage.test.mjs` — the new tests fail.
- [ ] **Step 4: Implement.**
  - The helper module, pure (nothing from Foundry).
  - `planDamageSeed`: replace the `adjusted !== 0 ? adjusted : baseValue` lines with `cardWeaponStats(itemSystem).damage`.
  - `RollFFG.render`, in the `this.data` branch after the `rollOptionsText` line: `applyWeaponAdjust(this.data, this.weaponAdjust)`, then `this.data.weaponStats = cardWeaponStats(this.data.system)` when `this.data.system?.damage` exists. Add `weaponAdjust` to `toJSON`/`fromData`.
  - Template: replace the two `iff` branches on lines 7–10 with one, guarded by `system.weaponStats`, showing `weaponStats.damage + ffg.success` and `weaponStats.crit`. Markup and classes unchanged.
  - Builder: `const weaponAdjust = sumWeaponAdjust(optionEntries);` right after `const optionEntries = this._card.entries();`, and `roll.weaponAdjust = weaponAdjust;` beside `roll.rollOptionsText`. Nothing reads the card again after the awaits.
- [ ] **Step 5: Run** `npm test`, and `node --input-type=module --check <` each edited module — pass.
- [ ] **Step 6: Commit** `Apply roll option damage and crit to the attack's chat card`.

### Task 5: Library entries and the deferred list

**Files:**
- Modify: `modules/config/roll-option-library-entries.js` (Point Blank; new Deadly Accuracy entry after it)
- Modify: `docs/roll-options-deferred.md` ("Damage, Pierce and crit from options")
- Test: `tests/node/roll-option-library-plan.test.mjs`; the existing library tests also validate every entry.

**Interfaces:**
- Consumes: `planLibraryMacros(entries, existing)` and `libraryMacroText(entry)` from `modules/helpers/roll-option-library-plan.js`. An installed macro is updated only when its text matches one of `entry.previous` (key order and spacing aside); otherwise it goes in `edited` and is left alone.

- [ ] **Step 1: Write the failing tests** in `tests/node/roll-option-library-plan.test.mjs`, against the real `LIBRARY_ENTRIES` (Review Focus 5):
  - an installed `point-blank` macro holding today's library text (the options array without `weapon`) → one `update`, whose command parses to the new options with `weapon: { damage: "ranks" }`; nothing in `edited`.
  - an installed `point-blank` macro the GM edited (today's text with a different hint) → no `update`; listed in `edited`.
- [ ] **Step 2: Run** `node --test tests/node/roll-option-library-plan.test.mjs` — the first test fails (Point Blank has no `previous`).
- [ ] **Step 3: Edit Point Blank**: copy today's `options` array verbatim into `previous: [ <that array> ]`, with the comment Get The Drop uses. Then add `weapon: { damage: "ranks" }` to the current option. Check the rule text: +1 damage per rank at short range or engaged — the hint already says the range.
- [ ] **Step 4: Add Deadly Accuracy** (new, so no `previous`): `id: "deadly-accuracy"`, `names: ["Deadly Accuracy"]`, one option `{ id: "deadly-accuracy", label: "Deadly Accuracy", hint: "Only on the skill you chose", offer: { skillTypes: ["Combat"], attack: true }, weapon: { damage: "skillRank" } }`. Check the rule text (damage equal to ranks in the chosen combat skill) and whether OggDude imports it under another spelling; add that to `names`.
- [ ] **Step 5: Update the deferred list**: remove Point Blank from the talent list; say `weapon` damage/crit and `skillRank` now exist; Pierce, characteristic words and Apply Crit stay deferred; the remaining talents still need their rule check.
- [ ] **Step 6: Run** `npm test` — passes.
- [ ] **Step 7: Commit** `Point Blank and Deadly Accuracy add damage from the roll dialog`.

### Task 6: Docs and a check in Foundry

**Files:**
- Modify: `CHANGELOG.md` (topmost unreleased block, or a new `Unreleased` block)
- Wiki clone (`git clone https://github.com/YeNov/StarWarsFFG.wiki.git`, set `user.email` to the YeNov address): the roll options page — the `weapon` key and the `skillRank` word, one line each in the format reference.

- [ ] **Step 1: Changelog**, one line: roll options can now add weapon damage or change the critical rating for one attack; Point Blank and Deadly Accuracy use it. Sub-bullet: to get the new Point Blank text and Deadly Accuracy, the GM runs the library again; a Point Blank macro the GM edited is left as it is and reported.
- [ ] **Step 2: Wiki** — add the lines; no screenshot changes unless the roll options line in one is now wrong.
- [ ] **Step 3: Check in Foundry** (headless test world): a character with Ranged (Light) 2 and Point Blank 2 attacks with a blaster pistol (damage 6): tick Point Blank → card shows damage 8, line "Point Blank 2 (+2 damage)", Apply Damage opens at 8 + successes. Reload the page: still 8. With a test macro at damage −1 on a damage-1 weapon and 2 successes: the card shows 0 + 2 = 2 and the adjusted crit, and Apply Damage opens at 2. Re-run the library in a world holding the old Point Blank macro: it updates. Send the same pool from the GM to the player with Point Blank ticked: the player's roll also shows 8.
- [ ] **Step 4: Commit** the changelog (`Changelog for weapon damage from roll options`); commit and push the wiki only after the user agrees.
