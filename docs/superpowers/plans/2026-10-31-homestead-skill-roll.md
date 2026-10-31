# Homestead Skill Roll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Roll skill button on the homestead sheet (classic and Codex II) that rolls a chosen character's skill with the homestead's upgrade modifiers added, in the standard dice dialog, with the upgrades' optional buffs on the roll options card.

**Architecture:** Pure helpers in `modules/helpers/homestead-roll.js` choose the rollers, filter skills and turn upgrade modifier rows into buff-shaped row groups. A picker app collects character + skill, builds the pool the way crew rolls do (`get_dice_pool` + `crewRollBuffOptions`), folds the default rows in with `applyOfferedBuffs`, and opens `DiceHelpers.displayRollDialog` with a new `homesteadUuid` roll option. The roll builder resolves that homestead and hands its items to the roll options card, which offers their buffs next to the character's.

**Tech Stack:** Foundry VTT 14, ES modules, Handlebars, `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-31-homestead-skill-roll-design.md`

## Global Constraints

- Button visible only to users with **Owner** permission on the homestead.
- Rollers: `character` actors only. A player sees the characters they own; the GM sees `character` actors owned by at least one non-GM user.
- One roller → no character prompt. None → notification, nothing opens.
- Only `homesteadupgrade` items count; Storage items add nothing. A modifier row with `active === false` adds nothing.
- Default upgrade rows count when their modtype is in `BUFF_MODTYPES`; a `Skill …` row only when `row.mod` is the rolled skill's key.
- Skill picker search filters the list 0.2 s (200 ms) after the last keystroke (`foundry.utils.debounce`).
- A roll from the character sheet must be unchanged.
- Codex scripts reach the system only through the public API (`tests/node/codex-boundary.test.mjs`).
- Upgrades get the optional buffs editor only, not roll option macro links.
- CHANGELOG entry and wiki tutorial line before push (CLAUDE.md). No absolute paths or private data in tracked files.
- `node --check` misses ESM errors here: parse new files with `node --input-type=module --check < file`.

## Review Focus

1. **Double counting** — a roll from the character sheet with a homestead in the world must show exactly the old pool; a homestead roll must add each upgrade row once. (Task 2 test `defaultRows ignore inactive and foreign-skill rows`; Task 5 manual check.)
2. **Character with no such skill / no characteristic** (e.g. a custom skill theme) — the picker lists only the character's skills; `get_dice_pool` returning the incoming pool must not open a dialog with 0 ability dice silently. (Task 4: warn and stop when `crewRollBuffOptions` has no `skillKey`.)
3. **GM sends the homestead roll to a player** — the recipient's card must still offer the homestead buffs, and ticked ones stay ticked. (Task 3: `homesteadUuid` travels with the sent pool.)
4. **Homestead deleted or no longer owned between click and roll** — the card falls back to the character's buffs only, no error. (Task 3 test `homesteadItems returns [] for a missing homestead`.)
5. **Several upgrades with the same buff name** — keys must stay distinct so ticking one doesn't tick the other. (Task 1 test.)

---

### Task 1: Homestead upgrades carry optional buffs

**Files:**
- Modify: `modules/data/models/item/homesteadupgrade.js` (mix in `OptionalBuffsTemplate`)
- Modify: `modules/helpers/optional-buffs.js` (`BUFF_ITEM_TYPES` gains `"homesteadupgrade"`)
- Modify: `modules/helpers/optional-buffs-offer.js` (new `case "homesteadupgrade"`; export `applicableRows`)
- Modify: `templates/items/ffg-homesteadupgrade-sheet.html` and the Codex II homestead upgrade item sheet, only if the buffs editor does not appear from `showOptionalBuffs` alone (check how `ffg-modifiers.html` / the Codex item modifiers tab render it for gear)
- Test: `tests/node/optional-buffs-offer.test.mjs`, `tests/node/optional-buffs.test.mjs`

**Interfaces:**
- Produces: `collectOfferedBuffs({ items })` offers buffs from `homesteadupgrade` items with rules `{ skillTimes: 1, rollRows: true, rollTimes: 1 }`, key `` `${id}:${buff.id}` ``, source = item name.
- Produces: `export function applicableRows(buff, { skillKey, skillTimes, rollRows, rollTimes })` (unchanged body, now exported).

- [ ] **Step 1: Write the failing tests**
  - `optional-buffs.test.mjs`: `BUFF_ITEM_TYPES includes homesteadupgrade`.
  - `optional-buffs-offer.test.mjs`, `offers homestead upgrade buffs`: an upgrade `{ id: "u1", name: "Workshop", type: "homesteadupgrade", system: { optionalBuffs: [{ id: "b1", name: "Ship repairs", rows: [{ modtype: "Skill Boost", mod: "Mechanics", value: 1 }, { modtype: "Roll Modifiers", mod: "Add Advantage", value: 1 }] }] } }` with `skillKey: "Mechanics"` → one entry `{ key: "u1:b1", name: "Ship repairs", source: "Workshop" }` with both rows at value 1; with `skillKey: "Charm"` → only the Roll Modifiers row.
  - `keeps same-named buffs on two upgrades apart`: two upgrades `u1`, `u2` each with buff id `b1` named "Repairs" → keys `u1:b1` and `u2:b1`.
- [ ] **Step 2: Run `npm test`** — expected: the three new tests FAIL.
- [ ] **Step 3: Implement** the model mixin, the type in `BUFF_ITEM_TYPES`, the `case`, and the `applicableRows` export.
- [ ] **Step 4: Run `npm test`** — expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "Homestead upgrades can carry optional buffs"`

### Task 2: Pure homestead roll helpers

**Files:**
- Create: `modules/helpers/homestead-roll.js` (no Foundry globals, so Node covers it)
- Test: `tests/node/homestead-roll.test.mjs`

**Interfaces:**
- Consumes: `BUFF_MODTYPES`, `isSkillModtype` (optional-buffs.js); `applicableRows` (Task 1).
- Produces:
  - `homesteadRollers({ actors, user, users }) -> Array<Actor>` — `character` actors; for `user.isGM`, those where some non-GM in `users` has OWNER (`actor.testUserPermission(u, "OWNER")`); otherwise those `actor.testUserPermission(user, "OWNER")`. Sorted by name.
  - `filterSkills(skills, query) -> Array<{ key, label }>` — `skills` is `[{ key, label }]`; case-insensitive substring match on `label` (and on `key`); blank query returns all; keeps input order.
  - `homesteadDefaultRows(items, skillKey) -> Array<{ key, name, source, rows }>` — one entry per `homesteadupgrade` item with at least one applying row, built from `system.attributes` rows that are `active !== false` and whose `modtype` is in `BUFF_MODTYPES`, filtered with `applicableRows(..., { skillKey, skillTimes: 1, rollRows: true, rollTimes: 1 })`. `key` = `` `${id}:default` ``, `name`/`source` = item name. Non-upgrade items are ignored.

- [ ] **Step 1: Write the failing tests** in `homestead-roll.test.mjs`:
  - `rollers for a player are their own characters` — actors: own character "Bo", own minion, someone else's character → `["Bo"]`.
  - `rollers for the GM are player-owned characters` — GM user; a character owned by player P, a GM-only character → only the first.
  - `filterSkills matches label case-insensitively` — `[{key:"Mechanics",label:"Mechanics"},{key:"Medicine",label:"Medicine"},{key:"Charm",label:"Charm"}]`, query `"me"` → Mechanics, Medicine; `""` → all three.
  - `defaultRows ignore inactive and foreign-skill rows` — upgrade "Workshop" with attributes `{ a: { modtype: "Skill Boost", mod: "Mechanics", value: 1 }, b: { modtype: "Skill Boost", mod: "Charm", value: 1 }, c: { modtype: "Roll Modifiers", mod: "Add Advantage", value: 1, active: false }, d: { modtype: "Characteristic", mod: "Brawn", value: 1 } }`, skill `Mechanics` → one entry, rows = only `a`.
  - `defaultRows ignore storage items` — a `gear` item with a Skill Boost row → `[]`.
- [ ] **Step 2: Run `npm test`** — expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions.
- [ ] **Step 4: Run `npm test`** and `node --input-type=module --check < modules/helpers/homestead-roll.js` — expected: pass, no output.
- [ ] **Step 5: Commit** — `git commit -m "Pure helpers for rolling from a homestead"`

### Task 3: The roll dialog offers the homestead's buffs

**Files:**
- Modify: `modules/dice/roll-builder.js` (new `homesteadUuid` roll option; resolve it in `_resolveRollActor`'s neighbourhood; pass items to the card at line ~71)
- Modify: `modules/dice/roll-options-card.js` (constructor `extraItems = []`; `#collectBuffs` uses `[...actorItems, ...extraItems]`)
- Modify: the pool-send path that writes `poolData` and `modules/swffg-main.js:~1717` that reads it, so `homesteadUuid` travels with a sent pool
- Modify: `modules/helpers/homestead-roll.js` (add `homesteadItems`)
- Test: `tests/node/homestead-roll.test.mjs`

**Interfaces:**
- Produces: roll option `homesteadUuid: string|null` accepted by `DiceHelpers.displayRollDialog(..., rollOptions)`; stored as `this.roll.homesteadUuid`.
- Produces: `homesteadItems(homestead) -> Array` in homestead-roll.js — `homesteadupgrade` items of a homestead actor, `[]` for null, a non-homestead actor, or an actor with no items.
- Produces: `new RollOptionsCard({ ..., extraItems })`.

- [ ] **Step 1: Write the failing tests** — `homesteadItems returns [] for a missing homestead` (`null`, `{ type: "character", items: [...] }`), and `homesteadItems returns only upgrades` (one upgrade, one gear → the upgrade).
- [ ] **Step 2: Run `npm test`** — expected: FAIL.
- [ ] **Step 3: Implement** `homesteadItems`; in roll-builder resolve `fromUuidSync(this.roll.homesteadUuid)` inside a try/catch (missing → `[]`) and pass `extraItems: homesteadItems(homestead)` to the card; add `homesteadUuid` to the sent pool data and read it back on receipt.
- [ ] **Step 4: Run `npm test`** — expected: all pass (including existing roll options tests).
- [ ] **Step 5: Commit** — `git commit -m "The roll options card offers a homestead's buffs"`

### Task 4: Character and skill picker, and the roll

**Files:**
- Create: `modules/apps/homestead-roll-dialog.js`
- Create: `templates/dialogs/homestead-roll.html` (follow the folder existing dialogs use if it differs)
- Modify: `lang/en.json` (keys below; other languages fall back to English)
- Modify: `styles/mandar.css` for classic-theme styling (never commit `npm run compile` output for `styles/starwarsffg.css`)

**Interfaces:**
- Consumes: Task 2 helpers, Task 3 roll option, `get_dice_pool`, `crewRollBuffOptions` (dice-helpers.js), `applyOfferedBuffs` (dice/optional-buff-pool.js), `DicePoolFFG`, `DiceHelpers.displayRollDialog`.
- Produces: `export async function rollFromHomestead(homestead: Actor): Promise<void>`.

Behaviour:
1. Refuse (warn) unless `homestead.isOwner`.
2. `homesteadRollers({ actors: game.actors, user: game.user, users: game.users })`; none → `ui.notifications.warn(SWFFG.Homestead.Roll.NoCharacters)`.
3. One window: a character select (hidden when there is one roller) and a skill list with a search input. The list is the chosen character's `system.skills`, labels localized, sorted by label; changing the character rebuilds it. The input re-filters through `filterSkills` via `foundry.utils.debounce(..., 200)`. Clicking a skill rolls and closes.
4. Roll: `pool = get_dice_pool(actor.id, skillKey, new DicePoolFFG({ difficulty: 2 }))`; `options = crewRollBuffOptions(actor.id, skillKey)`; if `!options.skillKey` warn `SWFFG.Homestead.Roll.NoSkill` and stop; `pool = applyOfferedBuffs(pool, homesteadDefaultRows(homesteadItems(homestead), skillKey), { characteristic: options.characteristic, rank: options.rank })`; `displayRollDialog(actor.sheet, pool, "<Rolling> <skill label>", skillKey, {}, flavor, undefined, { ...options, homesteadUuid: homestead.uuid })` with `flavor = game.i18n.format("SWFFG.Homestead.Roll.Flavor", { name: homestead.name })`.

Lang keys: `SWFFG.Homestead.Roll.Button` "Roll skill", `.Title` "Roll with {name}", `.Character` "Character", `.Search` "Search skills", `.NoCharacters` "You have no character to roll with.", `.NoSkill` "{actor} can't roll that skill.", `.Flavor` "with {name}".

- [ ] **Step 1:** Implement the module and template.
- [ ] **Step 2:** `node --input-type=module --check < modules/apps/homestead-roll-dialog.js` — expected: no output. `npm test` — expected: pass (the import checks cover the new file).
- [ ] **Step 3: Commit** — `git commit -m "Pick a character and skill to roll from a homestead"`

### Task 5: Buttons on both sheets, then verify in Foundry

**Files:**
- Modify: `templates/actors/ffg-homestead-sheet.html` (header button, rendered only when `owner`), `modules/actors/actor-sheet-ffg.js` (click → `rollFromHomestead(this.actor)`, homestead only)
- Modify: `modules/api/public-api.js` (`helpers` gains `"rollFromHomestead"`; bump `PUBLIC_API_VERSION` to 4) and where the parts are passed to `buildPublicApi`
- Modify: `codex/templates/actors/codex-homestead.html` (button in `.cdx-header-actions`, owner only), `codex/scripts/codex-sheets.js` (click → `rollFromHomestead` through `codex/scripts/system-api.js`), `codex/lang` if Codex keeps its own strings
- Modify: `CHANGELOG.md` (topmost unreleased block), the wiki's homestead page (separate repo; set `user.email` to the fork identity in a fresh clone)
- Test: existing public API / codex boundary tests

- [ ] **Step 1:** Update the public API shape test expectations if one pins the list; run `npm test` — expected: pass, including `codex-boundary.test.mjs`.
- [ ] **Step 2:** Add both buttons and the CHANGELOG entry ("Added — **roll a skill from the homestead sheet**: … upgrades' modifiers and optional buffs count …", one or two lines).
- [ ] **Step 3: Foundry check** (headless or the owner's world after a restart): as a player owning two characters and the homestead — picker shows both; search "me" narrows after a short pause; a Workshop with Skill Boost Mechanics adds 1 boost to Mechanics only; its optional buff appears unticked on the card; chat card reads "with <homestead>". As an Observer — no button. As the GM — only player characters listed. Roll the same skill from the character sheet — pool unchanged. Classic and Codex II sheets both.
- [ ] **Step 4: Commit** — `git commit -m "Roll skill button on the homestead sheets"`; wiki commit in the wiki repo. Push / PR only with the user's go-ahead.
