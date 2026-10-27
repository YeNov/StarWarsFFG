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
2. **A weapon whose `damage.adjusted` is 0** (never opened in the sheet): the bonus must add to `damage.value`, and the card must show the new number. The template falls back to `value` when `adjusted` is 0. Task 4 tests it.
3. **A crit bonus that would drop the rating below 1** (e.g. crit 1, Hunter −1): the card shows 1. Task 4 tests it.
4. **A GM-sent pool**: the player's dialog must show and apply the same weapon numbers after re-planning. No new code; Task 6 checks it by hand and Task 2 tests that the planner gives a ticked sent row its `weapon`.
5. **An option with `weapon` on a non-attack roll** (a Combat skill check without a weapon, e.g. from the skills list): not offered. Task 2 tests it.

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
- Modify: `modules/dice/roll-options-card.js` (new `weaponAdjust()`)
- Modify: `modules/dice/roll-builder.js` (set `roll.weaponAdjust` next to `roll.rollOptionsText`, ~line 539)
- Test: `tests/node/roll-option-weapon.test.mjs`

**Interfaces:**
- Consumes: planned rows (Task 2).
- Produces:
  - `sumWeaponAdjust(rows: Array<{ticked: boolean, weapon: object|null}>): {damage: number, critical: number} | null` — null when both sums are 0.
  - `applyWeaponAdjust(itemData: object, adjust: object|null): object` — returns itemData. Sets `system.damage.adjusted` to (adjusted, or value when adjusted is 0) + damage, floor 0; `system.crit.adjusted` likewise with floor 1; records `system.rollOptionWeapon = adjust`. Returns itemData untouched when `adjust` is null, when the copy has no `system.damage`, or when `system.rollOptionWeapon` is already set.
  - `RollOptionsCard#weaponAdjust()` → `sumWeaponAdjust(this.states.rows)`.
  - `RollFFG#weaponAdjust` (default null), carried by `toJSON`/`fromData`.

- [ ] **Step 1: Write the failing tests** in `tests/node/roll-option-weapon.test.mjs`:
  - sum of two ticked rows `{2,0}` and `{1,-1}` → `{damage: 3, critical: -1}`; unticked rows ignored; all zero → null.
  - apply `{damage: 2, critical: 0}` to `{system: {damage: {value: 5, adjusted: 7}, crit: {value: 3, adjusted: 3}}}` → damage.adjusted 9, crit.adjusted 3.
  - adjusted 0, value 5 → damage.adjusted 7 (Review Focus 2).
  - crit adjusted 1, critical −1 → 1 (Review Focus 3); damage 1, damage −3 → 0.
  - applying twice gives the same numbers as once (Review Focus 1).
  - null adjust, or no `system.damage`, leaves the object unchanged.
- [ ] **Step 2: Run** `node --test tests/node/roll-option-weapon.test.mjs` — fails (module missing).
- [ ] **Step 3: Implement** the helper. In `RollFFG.render`, call `applyWeaponAdjust(this.data, this.weaponAdjust)` after the `rollOptionsText` line in the `this.data` branch only (the else branch has no weapon). Add `weaponAdjust` to `toJSON`/`fromData` beside `rollOptionsText`. In `roll-builder.js`, `roll.weaponAdjust = this._card.weaponAdjust();`.
- [ ] **Step 4: Run** `npm test` and `node --input-type=module --check < modules/dice/roll.js` (and the other two edited files) — pass.
- [ ] **Step 5: Commit** `Apply roll option damage and crit to the attack's chat card`.

### Task 5: Library entries and the deferred list

**Files:**
- Modify: `modules/config/roll-option-library-entries.js` (Point Blank; new Deadly Accuracy entry after it)
- Modify: `docs/roll-options-deferred.md` ("Damage, Pierce and crit from options")
- Test: the existing library tests (`tests/node/roll-option-library*.test.mjs`) validate every entry.

- [ ] **Step 1: Edit Point Blank**: add `weapon: { damage: "ranks" }`. Check the rule text: +1 damage per rank at short range or engaged — the hint already says the range.
- [ ] **Step 2: Add Deadly Accuracy**: `id: "deadly-accuracy"`, `names: ["Deadly Accuracy"]`, one option `{ id: "deadly-accuracy", label: "Deadly Accuracy", hint: "Only on the skill you chose", offer: { skillTypes: ["Combat"], attack: true }, weapon: { damage: "skillRank" } }`. Check the rule text (damage equal to ranks in the chosen combat skill) and whether OggDude imports it under another spelling; add that to `names`.
- [ ] **Step 3: Update the deferred list**: remove Point Blank from the talent list; say `weapon` damage/crit and `skillRank` now exist; Pierce, characteristic words and Apply Crit stay deferred; the remaining talents still need their rule check.
- [ ] **Step 4: Run** `npm test` — passes.
- [ ] **Step 5: Commit** `Point Blank and Deadly Accuracy add damage from the roll dialog`.

### Task 6: Docs and a check in Foundry

**Files:**
- Modify: `CHANGELOG.md` (topmost unreleased block, or a new `Unreleased` block)
- Wiki clone (`git clone https://github.com/YeNov/StarWarsFFG.wiki.git`, set `user.email` to the YeNov address): the roll options page — the `weapon` key and the `skillRank` word, one line each in the format reference.

- [ ] **Step 1: Changelog**, one line: roll options can now add weapon damage or change the critical rating for one attack; Point Blank and Deadly Accuracy use it. Sub-bullet: worlds that already installed the library macros keep the old text until the GM re-runs the library or edits the macro.
- [ ] **Step 2: Wiki** — add the lines; no screenshot changes unless the roll options line in one is now wrong.
- [ ] **Step 3: Check in Foundry** (headless test world): a character with Ranged (Light) 2 and Point Blank 2 attacks with a blaster pistol (damage 6): tick Point Blank → card shows damage 8, line "Point Blank 2 (+2 damage)", Apply Damage opens at 8 + successes. Reload the page: still 8. Send the same pool from the GM to the player with Point Blank ticked: the player's roll also shows 8.
- [ ] **Step 4: Commit** the changelog (`Changelog for weapon damage from roll options`); commit and push the wiki only after the user agrees.
