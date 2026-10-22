# Roll Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player ticks talent, quality and Two weapons options on a foldable side card of the roll dialog, and the dice change at once. The strain (wounds for a rival) the ticked options cost is charged after the roll posts, through the GM bridge's queue. A GM-run library install creates option macros for the first eight options and links them into existing items.

**Architecture:** Every decision is a pure module under `modules/helpers/`, `modules/dice/` or `modules/config/`, covered by Node tests in `tests/node/`. Foundry-side code stays thin: the roll dialog (`RollBuilderFFG`), the item sheets and popups, two hooks, the GM bridge's new operation, and the library runner. Ticked options become ordinary optional-buff rows, so one pass of `applyOfferedBuffs` applies buffs, Two weapons and options in the order the spec fixes.

**Tech Stack:** Foundry VTT V14 (ApplicationV2, TypeDataModels, Handlebars), plain ES modules, `node --test` with the Foundry stub (`tests/node/_stub/foundry-stub.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md`

## Global Constraints

- Work on a feature branch from `main` (suggested `feat/roll-options`). Commit after each task. Do not push or open a PR without the user's go-ahead.
- Repository: `YeNov/StarWarsFFG` only. No absolute local paths, emails or machine names in tracked files.
- Pure modules import nothing that touches Foundry globals beyond the Node stub's (`foundry`, `CONFIG`, `CONST`, `game`); never widen the stub (`tests/node/stub-boundary.test.mjs`).
- English strings in `lang/en.json` under `SWFFG.RollOptions.*`. Never add a key whose dotted prefix is already a string (`tests/node/lang-expansion.test.mjs`): `SWFFG.RollOptions` itself is never a string.
- Classic CSS in `styles/mandar.css`; never commit `npm run compile` output for `styles/starwarsffg.css`. Codex styles in `codex/styles/`.
- Codex II reaches the system only through `modules/api/public-api.js`; `PUBLIC_API_VERSION` becomes **3**.
- Costs are paid through `postThenPay` (`modules/dice/roll-costs.js`), after the message posts.
- **One charging rule:** every option charge, owners included, goes through the GM bridge's coordinator queue, the same `applyCoordinator` that `applyToTargetActor` uses (`modules/helpers/gm-bridge.js`). Option charges call `chargeRollCost` (Task 6), which adds no notification of its own; nothing writes option strain with a direct `actor.update`.
- Payer pool and threshold rule: reuse `defenceCostPool`, `readCostPool`, `wouldIncapacitate` from `modules/helpers/defensive-talents.js` (characters and nemeses pay strain, rivals wounds, minions and vehicles cannot pay; reaching the threshold is allowed, going over is not; an unknown threshold never refuses).
- **Remaining capacity** means the payer pool's threshold, minus its current value, minus the strain of the options already ticked; it is unlimited when the threshold is unknown (not a positive number). The plan uses this term wherever an option's cost is checked.
- Skill types: exactly `Combat`, `General`, `Knowledge`, `Social`, `Magic`.
- Option format keys (spec, *The option format*): `id`, `label`, `hint`, `offer{skills, skillTypes, attack, twoWeapons}`, `amount{max, label}`, `cost{strain, maneuvers}`, `dice{boost, setback, removeSetback, difficulty, upgradeAbility, downgradeAbility, upgradeDifficulty, downgradeDifficulty}`. Every key optional.
- Before any push: `CHANGELOG.md` entry under `Unreleased` and the wiki tutorial updated (Task 18).
- Foundry testing uses the `test` world only. Ask the user before starting Foundry: their campaign world shares the data folder.
- After each task: `npm test`, `npm run check:imports` and `npm run lint` pass. A Foundry-only module that no test imports gets a syntax check with `node --input-type=module --check < <file>` (plain `node --check` misses ESM errors here).

## Review Focus

1. **A quality's rank stored as a string** (`"2"`, which the drop handler writes when it stacks ranks) must count as 2 for `"ranks"`, never as `"2"` concatenated or NaN. Test in Task 3.
2. **A roll opened without a skill key** (a macro, Token Action HUD, an item roll with no skill) must still offer options without `offer.skills` / `offer.skillTypes`, offer none of those with them, and never throw. Test in Task 3.
3. **The payer's strain changing between opening the dialog and the charge** (another hit lands meanwhile) must end in the writer refusing and the roller reading "not charged", with the reason. Tests in Task 6 (the writer's refusal and its classification).
4. **Library name variants**: `Auto-Fire`, `auto fire `, `AUTOFIRE` must match the Auto-fire entry, while `Point Blank (Improved)` must not match `Point Blank`. Test in Task 2.
5. **An amount whose maximum resolves to 0** (an `amount.max` of `"forceRating"` on an actor with Force rating 0) must grey the option with a reason, and no amount box may show 0..0 or NaN. Test in Task 5.

---

## File Structure

**Create — pure, Node-tested**

| File | Responsibility |
| --- | --- |
| `modules/helpers/roll-options.js` | The option format: constants, `normalizeName`, `validateOptions`, `parseOptionText`, `LINK_ITEM_TYPES`. |
| `modules/config/roll-option-library.js` | The eight library entries and `libraryEntryFor`. |
| `modules/helpers/roll-options-offer.js` | Which options a roll offers: `linkedMacroUuids`, `skillTypeOf`, `collectOfferedOptions`. |
| `modules/dice/roll-option-pool.js` | Options to dice: `optionDiceRows`, `layerPool` (the dialog's whole layering, shared by sender and recipient). |
| `modules/helpers/roll-option-costs.js` | The dialog's inputs, row states, remaining capacity and totals: `rollOptionInputs`, `planOptionStates`, `canChargeFor`. |
| `modules/helpers/roll-option-card.js` | The chat line: `rollOptionCardEntries`, `formatRollOptionsLine`. |
| `modules/dice/roll-option-sent.js` | A sent pool's layers: `packSentLayers`, `readSentLayers`. |
| `modules/helpers/roll-option-links.js` | Link lists and the guard: `addLink`, `removeLink`, `copyIdentity`, `nodeIdentity`, `withCopyLinks`, `linkSnapshot`, `linkChangeVerdict`. |
| `modules/helpers/roll-option-library-plan.js` | The library run's decisions: `planLibraryMacros`, `planItemLinks`. |

**Create — Foundry-side**

| File | Responsibility |
| --- | --- |
| `modules/helpers/roll-option-hooks.js` | `registerRollOptionHooks` (link guard, macro save check), `localizeOptionErrors`, the shared link-list UI (`describeRollOptionLinks`, `bindRollOptionLinks`), `chargeRollOptionCost`. |
| `modules/helpers/roll-option-library-run.js` | `installRollOptionLibrary`: confirm, create macros, scan, link, report. |
| `templates/parts/shared/ffg-roll-option-links.html` | The GM link list block, shared by classic sheets, popups and Codex sheets. |
| `templates/dice/parts/roll-options-panel.html` | The side card's inner content, re-rendered on every change. |

**Modify:** `modules/data/item-templates.js`, the six item models, `modules/items/item-sheet-ffg.js`, `modules/items/item-editor.js`, six classic item sheet templates, three popup templates, `modules/helpers/partial-templates.js`, `modules/helpers/actor-apply-coordinator.js`, `modules/helpers/gm-bridge.js`, `modules/dice/roll-builder.js`, `templates/dice/roll-options-ffg.html`, `modules/dice/roll.js`, `templates/dice/roll-ffg.html`, `modules/swffg-main.js`, `styles/mandar.css`, five Codex item templates, `codex/styles/`, `modules/api/public-api.js`, `codex/scripts/api-check.js`, `tests/node/public-api-surface.test.mjs`, `lang/en.json`, `CHANGELOG.md`.

---

### Task 0: Two Foundry feasibility checks

Two answers change later tasks (the save check in Task 9, macro permissions in Task 17), so get them before writing code. They need no system changes: only the browser console on the `test` world.

**Files:**
- Modify: this plan's **Task 0 results** block below (record the answers; commit them).

- [ ] **Step 1: Ask the user before starting Foundry** (their campaign world shares the data folder). Then start it on the `test` world: `node tools/foundry-test-server.mjs` with `FVTT_APP` / `FVTT_DATA` set as `tests/README.md` describes.
- [ ] **Step 2: Can a player read a GM macro they have no permission on?** As the GM, create a script macro `ffgtest-read` with command `[{"label":"x"}]` and default ownership None. Log in as a player in a second browser (or a `sessions.player()` Playwright context, `tests/README.md`), and run `game.macros.getName("ffgtest-read")?.command` in its console.
  - Prints the text → **readable**.
  - `undefined`, or the macro is missing → **not readable**.
- [ ] **Step 3: Does Foundry's macro editor keep the text after a refused save?** As the GM, run `Hooks.once("preUpdateMacro", () => false)`, open `ffgtest-read` in the macro editor, change its text and save.
  - The editor stays open with the changed text → **keeps text**.
  - It closes, or reverts the text → **loses text**.
- [ ] **Step 4: Clean up** — delete `ffgtest-read` and the test player; stop Foundry.
- [ ] **Step 5: Record and commit** — fill in the block below, then `git commit -m "Record the roll options feasibility checks"`.

**Task 0 results** (recorded 2026-10-21, Foundry 14.364, system 2.1.6, `test` world):
- Player can read a GM macro without permission: **readable**. A player with default ownership None got the command through `game.macros.get`, `getName`, `fromUuid` and `fromUuidSync` (the macro's `visible` was false). Task 17 leaves library macro ownership at its default.
- Macro editor after a refused save: **loses text**. With `preUpdateMacro` returning false, Save Macro closed `MacroConfig` and the stored command stayed as before; without the hook, the same steps saved the new text. Task 9's save check lets the save through and shows the errors as a warning.

---

### Task 1: The option format and its validator

**Files:**
- Create: `modules/helpers/roll-options.js`
- Test: `tests/node/roll-options.test.mjs`

**Interfaces:**
- Produces:
  - `SKILL_TYPES = ["Combat","General","Knowledge","Social","Magic"]`
  - `DICE_KEYS = ["boost","setback","removeSetback","difficulty","upgradeAbility","downgradeAbility","upgradeDifficulty","downgradeDifficulty"]`
  - `TWO_WEAPONS_CHOICES = ["no","same","different"]`, `TWO_WEAPONS_OFFERS = ["same","different","any"]`
  - `LINK_ITEM_TYPES = ["talent","weapon","armour","gear","itemattachment","itemmodifier"]`
  - `normalizeName(name: string): string` — strip accents, lowercase, keep only `[a-z0-9]`.
  - `validateOptions(value: unknown): {ok: true, options: Option[]} | {ok: false, errors: OptionError[]}` — accepts one option object or an array; `options` is always an array of deep copies.
  - `parseOptionText(text: string): same result` — `JSON.parse`, then `validateOptions`.
  - `OptionError = {option: number|null, key: string, code: string, detail?: string}`; `option` is 1-based (null for whole-text errors). Codes: `json`, `notList`, `notObject`, `unknownKey`, `notText`, `notTextList`, `notSkillType`, `notBoolean`, `notTwoWeapons`, `notCost`, `notMax`, `notDiceValue`, `amountWithoutAmount`, `duplicateId` (a second option in the same macro with an `id` already used; reported on the later one, key `id`).

- [ ] **Step 1: Write the failing tests** in `tests/node/roll-options.test.mjs` (import the stub first, as every Node test does):

```js
test("one option or a list both validate to a list", () => {
  assert.deepEqual(validateOptions({ label: "A" }), { ok: true, options: [{ label: "A" }] });
  assert.equal(validateOptions([{}, { label: "B" }]).options.length, 2);
});
test("broken JSON reports a whole-text error", () => {
  const r = parseOptionText("[{");
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map(({ option, code }) => ({ option, code })), [{ option: null, code: "json" }]);
});
test("unknown keys are named with their option", () => {
  assert.deepEqual(validateOptions([{}, { lable: "x" }]).errors, [{ option: 2, key: "lable", code: "unknownKey" }]);
  assert.equal(validateOptions({ offer: { skill: ["Melee"] } }).errors[0].key, "offer.skill");
});
test("costs are whole numbers of 0 or more, or amount", () => {
  for (const strain of [-2, 1.5, Infinity, "2"]) {
    assert.deepEqual(validateOptions({ amount: { max: 2 }, cost: { strain } }).errors, [{ option: 1, key: "cost.strain", code: "notCost" }]);
  }
  assert.equal(validateOptions({ cost: { strain: 0, maneuvers: 0 } }).ok, true);
  assert.equal(validateOptions({ amount: { max: "ranks" }, cost: { strain: "amount" } }).ok, true);
});
test("amount.max is a positive whole number or ranks / forceRating", () => {
  for (const max of [0, -1, 2.5, "amount", "rank"]) assert.equal(validateOptions({ amount: { max } }).errors[0].code, "notMax");
  for (const max of [1, 3, "ranks", "forceRating"]) assert.equal(validateOptions({ amount: { max } }).ok, true);
});
test("amount words need an amount", () => {
  assert.deepEqual(validateOptions({ dice: { upgradeAbility: "amount" } }).errors,
    [{ option: 1, key: "dice.upgradeAbility", code: "amountWithoutAmount" }]);
  assert.equal(validateOptions({ cost: { strain: "amount" } }).errors[0].code, "amountWithoutAmount");
});
test("dice values are whole numbers (negative allowed) or ranks / amount / forceRating", () => {
  assert.equal(validateOptions({ dice: { difficulty: -1, boost: "ranks", setback: "forceRating" } }).ok, true);
  assert.equal(validateOptions({ dice: { boost: 0.5 } }).errors[0].code, "notDiceValue");
  assert.equal(validateOptions({ dice: { ability: 1 } }).errors[0].code, "unknownKey");
});
test("offer checks skills, skill types, attack and twoWeapons", () => {
  assert.equal(validateOptions({ offer: { skills: ["Melee"], skillTypes: ["Combat"], attack: true, twoWeapons: "any" } }).ok, true);
  assert.equal(validateOptions({ offer: { skills: "Melee" } }).errors[0].code, "notTextList");
  assert.equal(validateOptions({ offer: { skillTypes: ["Fighting"] } }).errors[0].code, "notSkillType");
  assert.equal(validateOptions({ offer: { attack: "yes" } }).errors[0].code, "notBoolean");
  assert.equal(validateOptions({ offer: { twoWeapons: "no" } }).errors[0].code, "notTwoWeapons");
});
test("label, hint and id are non-empty text when given", () => {
  assert.equal(validateOptions({ label: "" }).errors[0].code, "notText");
  assert.equal(validateOptions({ hint: 3 }).errors[0].key, "hint");
});
test("an explicit id may appear only once in a macro", () => {
  assert.deepEqual(validateOptions([{ id: "x" }, { id: "y" }, { id: "x" }]).errors, [{ option: 3, key: "id", code: "duplicateId" }]);
  assert.equal(validateOptions([{ id: "1" }, {}]).ok, true); // an id that looks like a position is fine
});
test("every error in a list is reported, not just the first", () => {
  assert.equal(validateOptions([{ lable: 1 }, { cost: { strain: -1 } }]).errors.length, 2);
});
test("normalizeName ignores case, spaces, hyphens, punctuation and accents", () => {
  assert.equal(normalizeName(" Auto-Fire "), "autofire");
  assert.equal(normalizeName("Visée juste"), "viseejuste");
  assert.notEqual(normalizeName("Point Blank (Improved)"), normalizeName("Point Blank"));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/node/roll-options.test.mjs`
Expected: FAIL, cannot find module `roll-options.js`.

- [ ] **Step 3: Implement `modules/helpers/roll-options.js`** with the exports above. It imports nothing. Collect every error rather than stopping at the first; validate `amountWithoutAmount` after the key checks of the same option.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/node/roll-options.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/roll-options.js tests/node/roll-options.test.mjs
git commit -m "Add the roll option format and its validator"
```

---

### Task 2: The library

**Files:**
- Create: `modules/config/roll-option-library.js`
- Test: `tests/node/roll-option-library.test.mjs`

**Interfaces:**
- Consumes: `normalizeName`, `validateOptions` (Task 1).
- Produces:
  - `ROLL_OPTION_LIBRARY: ReadonlyArray<{id: string, kind: "talent"|"quality", names: string[], macroName: string, options: Option[]}>`
  - `libraryEntryFor(kind: "talent"|"quality", name: string): entry | null`

The entries, exactly (spec, *The library*); `macroName` is `"Roll option: <first name>"`:

| id | kind | names | options |
| --- | --- | --- | --- |
| `auto-fire` | quality | `Auto-fire` | `[{"id":"auto-fire","label":"Auto-fire","offer":{"attack":true},"dice":{"difficulty":1}}]` |
| `intense-focus` | talent | `Intense Focus` | `[{"id":"intense-focus","label":"Intense Focus","cost":{"strain":1,"maneuvers":1},"dice":{"upgradeAbility":1}}]` |
| `frenzied-attack` | talent | `Frenzied Attack` | `[{"id":"frenzied-attack","label":"Frenzied Attack","offer":{"skills":["Melee","Brawl"]},"amount":{"max":"ranks","label":"Strain"},"cost":{"strain":"amount"},"dice":{"upgradeAbility":"amount"}}]` |
| `guns-blazing` | talent | `Guns Blazing` | `[{"id":"guns-blazing","label":"Guns Blazing","offer":{"skills":["Ranged: Light"],"twoWeapons":"same"},"cost":{"strain":2},"dice":{"difficulty":-1}}]` |
| `saber-swarm` | talent | `Saber Swarm` | `[{"id":"saber-swarm","label":"Saber Swarm","hint":"Once per round","offer":{"skills":["Lightsaber"]},"cost":{"strain":1,"maneuvers":1}}]` |
| `true-aim` | talent | `True Aim` | `[{"id":"true-aim","label":"True Aim","hint":"Once per round","offer":{"skillTypes":["Combat"]},"cost":{"maneuvers":1},"dice":{"boost":1,"upgradeAbility":"ranks"}}]` |
| `sniper-shot` | talent | `Sniper Shot` | `[{"id":"sniper-shot","label":"Sniper Shot","hint":"Not thrown weapons","offer":{"skills":["Ranged: Light","Ranged: Heavy","Gunnery"]},"amount":{"max":"ranks","label":"Range bands"},"cost":{"maneuvers":1},"dice":{"upgradeDifficulty":"amount"}}]` |
| `point-blank` | talent | `Point Blank` | `[{"id":"point-blank","label":"Point Blank","hint":"Short range or engaged","offer":{"skills":["Ranged: Light","Ranged: Heavy"]}}]` |

Before writing each entry, check it against the rule text in the books (spec, *The library*: raise any disagreement with the user rather than changing an entry silently). Add an OggDude spelling to `names` only where the importer's name differs after `normalizeName`.

- [ ] **Step 1: Write the failing tests**

```js
test("every library entry validates", () => {
  for (const entry of ROLL_OPTION_LIBRARY) assert.equal(validateOptions(entry.options).ok, true, entry.id);
});
test("the first iteration has exactly the eight entries", () => {
  assert.deepEqual(ROLL_OPTION_LIBRARY.map((e) => e.id).sort(),
    ["auto-fire","frenzied-attack","guns-blazing","intense-focus","point-blank","saber-swarm","sniper-shot","true-aim"]);
});
test("names match across case, spacing and punctuation, within their kind", () => {
  for (const name of ["Auto-Fire", "auto fire ", "AUTOFIRE"]) assert.equal(libraryEntryFor("quality", name)?.id, "auto-fire");
  assert.equal(libraryEntryFor("talent", "Auto-fire"), null);
  assert.equal(libraryEntryFor("talent", "Point Blank (Improved)"), null);
  assert.equal(libraryEntryFor("talent", "point blank")?.id, "point-blank");
});
test("no two entries of a kind share a normalized name", () => { /* collect normalizeName of every name per kind; assert no duplicates */ });
test("Guns Blazing cancels exactly one Two weapons die", () => {
  assert.deepEqual(libraryEntryFor("talent", "Guns Blazing").options[0].dice, { difficulty: -1 });
});
```

- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-library.test.mjs`, FAIL (module missing).
- [ ] **Step 3: Implement** `modules/config/roll-option-library.js` with a frozen array and `libraryEntryFor`. It imports only `../helpers/roll-options.js`.
- [ ] **Step 4: Run the tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the first roll option library"` (both files).

---

### Task 3: Which options a roll offers

**Files:**
- Create: `modules/helpers/roll-options-offer.js`
- Test: `tests/node/roll-options-offer.test.mjs`

**Interfaces:**
- Consumes: `normalizeName` (Task 1); `isCarried` (`modules/helpers/optional-buffs-offer.js`); `isModifierSuspended` (`modules/helpers/modifier-switch.js`).
- Produces:
  - `linkedMacroUuids(items: Iterable<object>): string[]` — every uuid in `system.rollOptions` on the items, their qualities (`system.itemmodifier`), attachments (`system.itemattachment`), attachments' qualities, and specialization tree nodes (`system.talents.*.rollOptions`); deduplicated, in first-seen order. The dialog loads these before rendering.
  - `skillTypeOf(actor: object|null, skillKey: string|null, configuredSkills: object|null): string|null` — `actor.system.skills[skillKey].type`, else `configuredSkills[skillKey].type`, else null.
  - `collectOfferedOptions({items, macros, context}): OfferedOption[]`
    - `macros: Map<string, {ok: true, options: Option[]} | {ok: false}>` — parsed macro text by uuid; a missing uuid or `ok: false` contributes nothing.
    - `context: {skillKey: string|null, skillType: string|null, weaponId: string|null, isAttack: boolean, isForcePower: boolean, forceRating: number}`
    - `OfferedOption = {key: string, label: string, source: string, ranked: boolean, rank: number, hint: string|null, twoWeapons: "same"|"different"|"any"|null, amount: {max: number, label: string|null}|null, cost: {strain: number|"amount", maneuvers: number|"amount"}, dice: Record<string, number|"amount">}` — `"ranks"` and `"forceRating"` are already resolved to numbers in `amount.max` and `dice`; `"amount"` stays as it is, in `cost` and `dice`, until a row's amount is known (Tasks 4 and 5). A missing `cost` key is 0.

Rules (spec, *Which items offer their options* and *What the words mean*):
- Force power roll → `[]`.
- Talent items and learned tree nodes (`islearned === true`) group by `normalizeName(talent name)` + macro uuid + option id. `rank` = sum of contributions (a talent item gives `system.ranks.current` when `system.ranks.ranked`, a cleared or non-numeric rank gives 1, an unranked talent 1; a tree node gives 1); `ranked` = every source ranked (`ranks.ranked` / node `isRanked`).
- Weapons count only when `isCarried` and `id === context.weaponId`: the weapon itself, its qualities, its attachments, and the attachments' qualities. Armour counts while `system.equippable.equipped`; gear while `isCarried`; each with their qualities and attachments.
- A quality or attachment modification is skipped when `isModifierSuspended(q)` or `q.system?.broken === true`.
- `ranks` for a quality is `Number(system.rank)` (a string `"2"` counts 2; below 1 or not a number counts 1); for weapon, armour, gear and attachment itself, 1.
- `offer.skills` must contain `skillKey`; `offer.skillTypes` must contain `skillType`; `offer.attack` needs `isAttack`. A null `skillKey` / `skillType` fails any option that names skills / skill types. `offer.twoWeapons` does not filter: it is copied to `twoWeapons` for Task 5 to grey.
- `key` = `"<macroUuid>:id:<option.id>"` for an option with an explicit `id`, or `"<macroUuid>:#<index>"` (0-based position) for one without, plus `":<normalized talent name>"` for talents. The two forms cannot collide, and Task 1 refuses duplicate explicit ids, so every option of a valid macro gets its own key. Two sources with the same key give one row.
- `label` = `option.label` or the linking item's name; `source` = the linking item's name.

- [ ] **Step 1: Write the failing tests.** Fixture helpers build plain items like `tests/node/optional-buffs-offer.test.mjs` does, with `system.rollOptions: ["Macro.m1"]` and a `macros` map. Tests (one `test()` each, assertions as stated):
  - `skill and skill type conditions` — option `offer.skills:["Melee"]` offered for `skillKey:"Melee"`, not for `"Charm"`; `offer.skillTypes:["Combat"]` offered for `skillType:"Combat"`, not `"Social"`.
  - `a roll with no skill key offers only unconditioned options` — macro with `[{label:"Free"},{label:"Melee only",offer:{skills:["Melee"]}},{label:"Combat only",offer:{skillTypes:["Combat"]}}]`, `skillKey:null, skillType:null` → labels `["Free"]`.
  - `attack-only options need a weapon roll` — `offer.attack:true` offered with `isAttack:true`, not without.
  - `weapon-borne options only on that weapon's attack` — weapon `w1` and its quality and attachment and attachment quality all linked; `weaponId:"w1"` → 4 rows; `weaponId:"w2"` → 0; `w1` marked `carried:false` → 0.
  - `switched-off or broken qualities and modifications offer nothing` — quality `system.active:false` → none; quality `system.broken:true` → none; same two cases for a modification inside an attachment on a weapon, and for a quality on equipped armour.
  - `armour only while equipped, gear while carried`.
  - `talent ranks combine across items and tree nodes` — talent item ranked `current:2` + learned tree node `isRanked:true` → `rank:3, ranked:true`; an unlearned node adds nothing; `current:null` counts 1.
  - `ranks and forceRating resolve to numbers` — `dice:{upgradeAbility:"ranks"}` on a rank-2 talent → `dice.upgradeAbility === 2`; `amount:{max:"forceRating"}` with `forceRating:3` → `amount.max === 3`; `dice:{upgradeAbility:"amount"}` stays `"amount"`.
  - `a quality's string rank counts as a number` — quality `system.rank:"2"`, `dice:{difficulty:"ranks"}` → `dice.difficulty === 2`.
  - `the same macro on two talents shows once per talent name; on two gear items once` — two gear items linking `Macro.m1` → one row.
  - `explicit ids and positions never share a key` — macro `[{id:"1", label:"A"}, {label:"B"}]` on one gear item → two rows, keys `"Macro.m1:id:1"` and `"Macro.m1:#1"`.
  - `unresolved or invalid macros contribute nothing` — uuid absent from `macros`, and `{ok:false}` → `[]`.
  - `Force power rolls offer nothing`.
  - `label defaults to the linking item's name and twoWeapons is carried through`.
  - `skillTypeOf reads the actor's skill, then the configured list` — `{system:{skills:{Melee:{type:"Combat"}}}}` → `"Combat"`; actor without it + configured `{Melee:{type:"Combat"}}` → `"Combat"`; neither → null.
  - `linkedMacroUuids walks items and every copy` — one uuid on each of: a talent, a weapon quality, an attachment, an attachment's quality, a tree node → five uuids, duplicates removed.

- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-options-offer.test.mjs`, FAIL.
- [ ] **Step 3: Implement** `modules/helpers/roll-options-offer.js` with the three exports.
- [ ] **Step 4: Run the tests** — PASS; then `npm test` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Work out which roll options a roll offers"`.

---

### Task 4: Options to dice, and the dialog's layering

**Files:**
- Create: `modules/dice/roll-option-pool.js`
- Test: `tests/node/roll-option-pool.test.mjs`

**Interfaces:**
- Consumes: `DicePoolFFG` (`modules/dice/pool.js`), `applyOfferedBuffs` (`modules/dice/optional-buff-pool.js`), `OfferedOption` (Task 3).
- Produces:
  - `optionDiceRows(ticked: Array<{option: OfferedOption, amount: number}>, twoWeapons: "no"|"same"|"different"): Array<{modtype: string, mod: string, value: number}>` — Two weapons first (`same` → 1, `different` → 2 rows' worth of `Dice Modifiers|Add Difficulty`), then each option's dice with `"amount"` replaced by its `amount`. Mapping:

    | dice key | row |
    | --- | --- |
    | `boost` | `Roll Modifiers` / `Add Boost` |
    | `setback` | `Roll Modifiers` / `Add Setback` |
    | `removeSetback` | `Roll Modifiers` / `Remove Setback` |
    | `difficulty` | `Dice Modifiers` / `Add Difficulty` |
    | `upgradeAbility` | `Dice Modifiers` / `Upgrade Ability` |
    | `downgradeAbility` | `Dice Modifiers` / `Downgrade Ability` |
    | `upgradeDifficulty` | `Dice Modifiers` / `Upgrade Difficulty` |
    | `downgradeDifficulty` | `Dice Modifiers` / `Downgrade Difficulty` |

  - `layerPool(base: DicePoolFFG, {buffs = [], rows = [], skill = {}, defence = 0, adversaryRanks = 0, adversaryMode = true}): DicePoolFFG` — a new pool, `base` untouched: one `applyOfferedBuffs(copy, [...buffs, {rows}], skill)` pass, then `setback = max(0, setback + defence)`, then `upgradeDifficulty(adversaryRanks)` when `adversaryMode && adversaryRanks > 0 && difficulty > 0` (the difficulty after options). This is `_effectivePool`'s order (`modules/dice/roll-builder.js`), moved here so the sender and the recipient of a sent pool compute the same pool.

- [ ] **Step 1: Write the failing tests**
  - `two weapons add one or two difficulty dice` — base `{difficulty:2}`: `same` → 3, `different` → 4, `no` → 2.
  - `Guns Blazing cancels the Two weapons die exactly, around an Adversary upgrade` — base `{ability:2, difficulty:2}`, `twoWeapons:"same"` + option `dice:{difficulty:-1}`, `adversaryRanks:1` → `difficulty:1, challenge:1` (same as no Two weapons and no Guns Blazing).
  - `options and buffs share one pass` — base `{difficulty:0}`, a buff row `Dice Modifiers|Upgrade Difficulty 1`, `twoWeapons:"same"` → `difficulty:0, challenge:1` (counts first, then the upgrade).
  - `amount and ranks become counts` — option `dice:{upgradeAbility:"amount"}` ticked with `amount:2`, base `{ability:3}` → `ability:1, proficiency:2`.
  - `the base pool is never changed` — after `layerPool`, `base` deep-equals its copy taken before.
  - `a negative manual setback survives and cancels defence` — base `{setback:-1}`, `defence:2` → `setback:1`; base `{setback:-2}`, `defence:1`, nothing ticked → `setback:0`.
  - `the Adversary upgrade waits for difficulty` — base `{difficulty:0}`, `adversaryRanks:2`, nothing ticked → `difficulty:0, challenge:0`; with `twoWeapons:"same"` → `difficulty:1, challenge:1` (the one die from Two weapons is upgraded once, then the second upgrade finds no difficulty die and adds one, as `DicePoolFFG.upgradeDifficulty` does).
  - `adversaryMode false skips the upgrade`.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-pool.test.mjs`.
- [ ] **Step 3: Implement** both functions in `modules/dice/roll-option-pool.js`.
- [ ] **Step 4: Run the tests** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Turn ticked roll options into dice in one layering pass"`.

---

### Task 5: The dialog's inputs, row states and remaining capacity

**Files:**
- Create: `modules/helpers/roll-option-costs.js`
- Test: `tests/node/roll-option-costs.test.mjs`

**Interfaces:**
- Consumes: `OfferedOption`, `skillTypeOf` (Task 3); `readCostPool`, `wouldIncapacitate` (`modules/helpers/defensive-talents.js`).
- Produces:
  - `canChargeFor({hasActiveGM: boolean, isOwner: boolean}): boolean` — `hasActiveGM || isOwner` (the coordinator's own rule in `actor-apply-coordinator.js` `apply`).
  - `rollOptionInputs(actor: object|null, {skillKey, item, configuredSkills, hasActiveGM}): {items: object[], context: object, pool: object|null, canCharge: boolean}` — everything Task 13 reads off the actor, in one place that tolerates a roll with no actor (`rollActorFrom` returns null for some rolls). With `actor === null`: `items: []`, `context.forceRating: 0`, `context.skillType` from `configuredSkills` only, `pool: null`, `canCharge: false`. Otherwise `items: [...actor.items]`, `forceRating: Number(actor.system?.stats?.forcePool?.max) || 0`, `pool: readCostPool(actor)`, `canCharge: canChargeFor({hasActiveGM, isOwner: actor.isOwner === true})`. `context` also carries `skillKey`, `weaponId` (`item.id` when `item.type === "weapon"`), `isAttack` (`item.type` is `weapon` or `shipweapon`) and `isForcePower` (`item.type === "forcepower"`).
  - `planOptionStates({offered, selection, twoWeapons, pool, canCharge}): {rows: RowState[], selection: Record<string, number>, strain: number, maneuvers: number, after: number|null}`
    - `selection`: ticked keys → amount (1 for options without `amount`).
    - `pool`: `readCostPool(actor)` result or null.
    - `RowState = {key, ticked: boolean, amount: number, maxAmount: number|null, cost: {strain: number, maneuvers: number}, disabled: boolean, reason: {code: string, data: object}|null}` — `cost` is resolved with the row's amount (the chosen amount for a ticked row, 1 for an unticked one), so `"amount"` never reaches the totals, the card or the chat line.
    - Reason codes and data: `needsTwoWeapons {choice}`, `cannotPay {}`, `needsWriter {}`, `zeroMax {}`, `overThreshold {unit, value, threshold}`.
    - Returned `selection` drops what cannot stay ticked and caps amounts; `strain` and `maneuvers` are the ticked rows' resolved totals; `after = pool.current + strain` (null without a pool).

Algorithm (spec, *Costs and what can be ticked*), in this order:
0. Selection keys that are not among `offered` are dropped (a sent option whose item or macro is gone).
1. A row whose `twoWeapons` does not match the choice (`same`/`different` need that choice, `any` needs not `no`) → disabled `needsTwoWeapons`, unticked.
2. A row with a strain cost (`cost.strain > 0` or `"amount"`): no pool → `cannotPay`; `!canCharge` → `needsWriter`. Unticked. A row with no strain cost is never limited by the payer pool.
3. `amount.max === 0` → `zeroMax`, unticked.
4. Ticked rows, in `offered` order, against the remaining capacity so far:
   - fixed strain cost (a number above 0): unticked with `overThreshold` when it exceeds the remaining capacity; its amount, if it has one, keeps the full `1..max` range;
   - `cost.strain === "amount"`: `amount` is capped to `min(max, remaining capacity)`, unticked with `overThreshold` when that is below 1;
   - no strain cost: unchanged.
5. Unticked rows, against the remaining capacity after every ticked row:
   - fixed strain cost: disabled `overThreshold` when it exceeds the remaining capacity; otherwise enabled, `maxAmount = max`;
   - `cost.strain === "amount"`: disabled `overThreshold` when the remaining capacity is below 1; otherwise `maxAmount = min(max, remaining capacity)`;
   - no strain cost: enabled, `maxAmount = max`.

- [ ] **Step 1: Write the failing tests**
  - `exactly at the threshold is allowed, over is not` — pool `{current:10, threshold:12, unit:"strain"}`, Guns Blazing (2) ticked → ticked, `after:12`; Intense Focus (1) unticked → disabled `overThreshold {unit:"strain", value:13, threshold:12}`.
  - `strain-per-amount is capped to the remaining capacity` — pool `{current:9, threshold:12}`, Frenzied Attack `max:5` ticked with amount 5 → amount 3, `maxAmount:3`, `cost.strain:3`.
  - `a strain-per-amount option with no remaining capacity greys out` — pool `{current:12, threshold:12}` → Frenzied Attack disabled `overThreshold`.
  - `a free amount option keeps its full range at the threshold` — pool `{current:12, threshold:12}`, Sniper Shot (`amount.max:2`, `cost.maneuvers:1`, no strain) → enabled, `maxAmount:2`; ticked with amount 2 → stays 2.
  - `a fixed-cost amount option keeps its full range` — option `amount.max:3`, `cost.strain:1`: with remaining capacity 1 → enabled, `maxAmount:3`; ticked with amount 3 → stays 3, `cost.strain:1`; with remaining capacity 0 → disabled `overThreshold`.
  - `a maneuver cost per amount resolves with the amount and charges no strain` — option `amount.max:3`, `cost:{maneuvers:"amount"}`, ticked with amount 3, `pool:null` → stays ticked, row `cost {strain:0, maneuvers:3}`, totals `maneuvers:3, strain:0`.
  - `a roll with no actor gives empty, safe inputs` — `rollOptionInputs(null, {skillKey:"Melee", item:null, configuredSkills:{Melee:{type:"Combat"}}, hasActiveGM:true})` → `items:[]`, `pool:null`, `canCharge:false`, `context.forceRating:0`, `context.skillType:"Combat"`; and `planOptionStates({offered:[], selection:{}, twoWeapons:"no", pool:null, canCharge:false}).rows` is `[]`.
  - `inputs read the actor` — a character with `forcePool.max:2`, `isOwner:true`, strain 3 / 12 → `forceRating:2`, `pool.current:3`, `canCharge:true` with `hasActiveGM:false`.
  - `a zero maximum greys the option` — `amount:{max:0}` → disabled `zeroMax`; no row has `maxAmount` 0 enabled or NaN.
  - `minions and vehicles cannot pay strain but keep free options` — `pool:null` → strain rows `cannotPay`; Point Blank (no cost) enabled and stays ticked.
  - `rivals are measured in wounds` — pool `{unit:"wounds", current:8, threshold:10}` → reason data `unit:"wounds"`.
  - `without a writer, costed options grey out` — `canCharge:false` → `needsWriter`; free options unaffected.
  - `dependencies follow the Two weapons choice and untick` — Guns Blazing ticked, `twoWeapons:"no"` → unticked, `needsTwoWeapons {choice:"same"}`; `"different"` likewise; `"same"` → enabled.
  - `ticked rows are fitted in order` — remaining capacity 2, Guns Blazing (2) then Intense Focus (1) both ticked → Guns Blazing stays, Intense Focus unticked `overThreshold`.
  - `an unknown threshold never refuses` — `threshold:0` → nothing disabled for capacity.
  - `a selection key that is not offered is dropped` — `selection:{gone:1}` → returned `selection` is `{}`.
  - `canChargeFor` — the four combinations.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-costs.test.mjs`.
- [ ] **Step 3: Implement** `modules/helpers/roll-option-costs.js`.
- [ ] **Step 4: Run the tests** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Plan roll option rows against the capacity left to pay them"`.

---

### Task 6: Charging through the GM bridge

**Files:**
- Modify: `modules/helpers/actor-apply-coordinator.js` (capability list, disconnect code)
- Modify: `modules/helpers/gm-bridge.js` (new `roll-cost` operation, `chargeRollCost`, `classifyCharge`)
- Test: `tests/node/gm-bridge-apply.test.mjs`, `tests/node/actor-apply-coordinator.test.mjs`

**Interfaces:**
- Produces (coordinator): `ROLL_OPTION_COST_CAPABILITY = "roll-option-cost-v1"` added to `SUPPORTED_CAPABILITIES`; `WRITER_DISCONNECTED = "writer-disconnected"` as the `code` of the existing "disconnected before confirming" rejection.
- Produces (bridge):
  - `ROLL_COST_UNAFFORDABLE = "roll-cost-unaffordable"`
  - `narrowApplyRequest` accepts `{type: "roll-cost", path, delta}`: `path` must equal `defenceCostPool(actorType)?.path`, `delta` an integer ≥ 1; anything else `{ok:false, reason:"roll-cost"}`.
  - `planRollCostWrite(actor, op): Record<string, number>` — validates `path`/`delta` as above on every path (owners skip narrowing, as for the two-pool damage form), throws `ApplyRequestError(..., ROLL_COST_UNAFFORDABLE)` when `wouldIncapacitate(readCostPool(actor), op.delta)`, else `{[path]: current + delta}`.
  - `performApply` handles `"roll-cost"` with `actor.update(planRollCostWrite(actor, op))`.
  - `chargeRollCost(actor, delta): Promise<"local"|"forwarded"|false>` — `applyCoordinator.apply(actor, {type: "roll-cost", path: readCostPool(actor).path, delta}, {capability: ROLL_OPTION_COST_CAPABILITY})`; rejections propagate. Unlike `applyToTargetActor`, it shows no notification itself.
  - `classifyCharge({result, error}): {kind: "charged"|"notCharged"|"unknown", reason: "noWriter"|"unaffordable"|"outdated"|"failed"|null}` (pure) — `result` `"local"`/`"forwarded"` → charged; `result === false` → notCharged/noWriter; error code `ROLL_COST_UNAFFORDABLE` → notCharged/unaffordable; `WRITER_OUTDATED` → notCharged/outdated; `WRITER_DISCONNECTED` → **unknown** (the write may have happened); any other error → notCharged/failed.

- [ ] **Step 1: Write the failing tests** (append to the existing files, in their style)
  - gm-bridge: `roll-cost requests are narrowed to the actor's own cost pool` — character + strain path, delta 3 → ok; wounds path on a character → refused; rival + wounds path → ok; minion → refused; delta 0, -1, 1.5 → refused.
  - gm-bridge: `a roll cost is refused past the threshold, allowed at it` — `planRollCostWrite({type:"character", system:{stats:{strain:{value:10,max:12}}}}, {type:"roll-cost", path:"system.stats.strain.value", delta:2})` → `{"system.stats.strain.value": 12}`; delta 3 → throws with `code === ROLL_COST_UNAFFORDABLE`.
  - coordinator: `two concurrent roll costs for one actor both land` — a coordinator whose injected `performApply` runs `planRollCostWrite` against a fake actor and writes after an `await`; two `apply` calls started together, strain 0 → 5 after costs 2 and 3.
  - coordinator: `the second of two concurrent costs is refused when together they pass the threshold` — strain 9 / 12, costs 2 and 2 → first lands (11), second rejects with `ROLL_COST_UNAFFORDABLE`, strain stays 11.
  - coordinator: `a writer that disconnects before confirming rejects with WRITER_DISCONNECTED` — extend the existing disconnect test to assert `err.code === "writer-disconnected"`.
  - coordinator: `a roll cost needs the roll-option capability` — a writer advertising only `defensive-damage-v1` → rejects with `WRITER_OUTDATED`.
  - gm-bridge: `classifyCharge` — one assertion per mapping row: `{result:"local"}` and `{result:"forwarded"}` → charged; `{result:false}` → `{kind:"notCharged", reason:"noWriter"}`; errors with codes `roll-cost-unaffordable` / `writer-outdated` → notCharged with `unaffordable` / `outdated`; `writer-disconnected` → `{kind:"unknown"}`; a plain `new Error("x")` → `{kind:"notCharged", reason:"failed"}`.
  - gm-bridge: `a charge refused because strain rose meanwhile reads as not charged` — the refusal error from the "second of two concurrent costs" case above, through `classifyCharge` → `{kind:"notCharged", reason:"unaffordable"}`.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/gm-bridge-apply.test.mjs tests/node/actor-apply-coordinator.test.mjs`.
- [ ] **Step 3: Implement** the coordinator constants and code, then the bridge operation and `chargeRollCost`.
- [ ] **Step 4: Run the tests** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Charge roll option costs through the bridge queue"`.

---

### Task 7: The chat line

**Files:**
- Create: `modules/helpers/roll-option-card.js`
- Modify: `modules/dice/roll.js` (carry `rollOptionsText` everywhere `optionalBuffsText` is carried: the two render branches near lines 281–287, `toJSON` near 416, `fromData` near 431), `templates/dice/roll-ffg.html` (a `.dice-roll-options` block after `.dice-optional-buffs`), `styles/mandar.css` (style it like `.dice-optional-buffs`), `lang/en.json`
- Test: `tests/node/roll-option-card.test.mjs`

**Interfaces:**
- Consumes: `OfferedOption`, the `planOptionStates` result (Tasks 3, 5).
- Produces:
  - `rollOptionCardEntries({offered, states, twoWeapons, unit}): CardEntry[]` — `states` is the `planOptionStates` result; Two weapons first (when not `no`), then each ticked row in `offered` order, its costs taken from the row's resolved `cost` (never `"amount"`). `CardEntry = {label: string|null, labelKey: string|null, number: number|null, strain: number, unit: "strain"|"wounds", maneuvers: number}`; Two weapons uses `labelKey` `SWFFG.RollOptions.Card.TwoWeaponsSame` / `...Different`; `number` is the row's amount for an amount option, else the rank for a ranked source, else null.
  - `formatRollOptionsLine(entries: CardEntry[], localize: (key: string, data?: object) => string): string|null` — null for no entries; otherwise `localize("SWFFG.RollOptions.CardLine", {entries})` with entries joined by `", "`; each entry is `label[ number][ (costs)]`, costs joined by `", "` from `SWFFG.RollOptions.Cost.Strain` / `.Wound` / `.Wounds` / `.Maneuver` / `.Maneuvers` with `{n}`.
- Strings (`lang/en.json`): `SWFFG.RollOptions.CardLine`: `"Roll options: {entries}"`; `SWFFG.RollOptions.Card.TwoWeaponsSame`: `"Two weapons (same skill)"`; `SWFFG.RollOptions.Card.TwoWeaponsDifferent`: `"Two weapons (different skills)"`; `SWFFG.RollOptions.Cost.Strain`: `"{n} strain"`; `.Wound`: `"{n} wound"`; `.Wounds`: `"{n} wounds"`; `.Maneuver`: `"{n} maneuver"`; `.Maneuvers`: `"{n} maneuvers"`.

- [ ] **Step 1: Write the failing tests** with a fake `localize` that substitutes `{name}` from an English table:
  - `the spec's example line` — Two weapons same, Guns Blazing (2 strain), Point Blank rank 2, Frenzied Attack amount 2 (2 strain) → `"Roll options: Two weapons (same skill), Guns Blazing (2 strain), Point Blank 2, Frenzied Attack 2 (2 strain)"`.
  - `maneuvers and wounds` — Intense Focus for a rival → `"Intense Focus (1 wound, 1 maneuver)"`.
  - `nothing used, no line` — `formatRollOptionsLine([], t) === null`.
  - `an unranked talent shows no number` — Saber Swarm → `"Saber Swarm (1 strain, 1 maneuver)"`.
  - `a maneuver cost per amount shows the resolved count` — an option labelled `"Steady Aim"` with `amount.max:3`, `cost:{maneuvers:"amount"}`, ticked with amount 3, through `planOptionStates` then `rollOptionCardEntries` → `"Steady Aim 3 (3 maneuvers)"`, and the entry's `strain` is 0.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-card.test.mjs`.
- [ ] **Step 3: Implement** the module, the `roll.js` and template changes, the CSS and the strings.
- [ ] **Step 4: Run** — the new test PASS; `npm test` PASS; `node --input-type=module --check < modules/dice/roll.js` prints nothing.
- [ ] **Step 5: Commit** — `git commit -m "Name the roll options used on the chat card"`.

---

### Task 8: The link field on items, and copies that carry it

**Files:**
- Modify: `modules/data/item-templates.js` (add `RollOptionLinksTemplate`: `rollOptions: new f.ArrayField(new f.StringField({ blank: false }))`), `modules/data/models/item/talent.js`, `weapon.js`, `armour.js`, `gear.js`, `itemattachment.js`, `itemmodifier.js` (mix it in), `modules/items/item-sheet-ffg.js` (`_onDropTalentToSpecialization`: copy `rollOptions: [...(itemObject.system.rollOptions ?? [])]` next to `optionalBuffs`)
- Test: `tests/node/roll-option-fields.test.mjs`

**Interfaces:**
- Produces: `system.rollOptions: string[]` on the six item types; tree nodes carry `rollOptions` like `optionalBuffs`. Qualities and attachments carry it inside their copies already, because `_onDropItem` duplicates the whole item.

- [ ] **Step 1: Write the failing test** — a source-text check in the style of `tests/node/public-api-surface.test.mjs`: each of the six model files contains `RollOptionLinksTemplate`, `item-templates.js` declares `rollOptions: new f.ArrayField(`, and `_onDropTalentToSpecialization` in `item-sheet-ffg.js` contains `rollOptions:`.
- [ ] **Step 2: Run to see it fail** — `node --test tests/node/roll-option-fields.test.mjs`.
- [ ] **Step 3: Implement** the template, the six mixes and the tree copy.
- [ ] **Step 4: Run** — PASS; `npm test` PASS; `node --input-type=module --check` on each changed file prints nothing.
- [ ] **Step 5: Commit** — `git commit -m "Give items a roll option link list and copy it into trees"`.

---

### Task 9: The link guard and the macro save check

**Files:**
- Create: `modules/helpers/roll-option-links.js`, `modules/helpers/roll-option-hooks.js`
- Modify: `modules/swffg-main.js` (call `registerRollOptionHooks()` in `init`, next to the other `Hooks.on("preCreateItem", …)` registrations), `lang/en.json`
- Test: `tests/node/roll-option-links.test.mjs`

**Interfaces:**
- Consumes: `parseOptionText` (Task 1).
- Produces (`roll-option-links.js`, pure):
  - `addLink(list: string[]|undefined, uuid: string): string[]` (no duplicates), `removeLink(list, uuid): string[]`
  - `copyIdentity(copy: object): string` — `"<copy._id ?? copy.id ?? ''>|<copy.name ?? ''>"`
  - `nodeIdentity(slotKey: string, node: object): string` — `"<slotKey>|<node.itemId || node.name || ''>"`
  - `withCopyLinks(list: object[], identity: string, links: string[]): object[]` — a new array where the copy with that identity has `system.rollOptions = links`
  - `linkSnapshot(itemData: object): Map<string, string>` — keys `self`, `q:<identity>`, `a:<identity>`, `a:<identity>/q:<identity>`, `t:<nodeIdentity>`; values the link list joined with `"\n"` (order matters).
  - `linkChangeVerdict(before: object, after: object, {isGM: boolean}): {ok: true} | {ok: false, where: string}` — GM always ok; otherwise every key present in **both** snapshots must have the same value (`where` names the first that differs).
- Produces (`roll-option-hooks.js`, Foundry-side):
  - `registerRollOptionHooks()` registers:
    - `preUpdateItem(item, changes, options, userId)`: skip unless `changes.system` touches `rollOptions`, `itemmodifier`, `itemattachment` or `talents`; build `after = foundry.utils.mergeObject(item.toObject(), changes, {inplace: false, performDeletions: true})`; on a refused verdict, `ui.notifications.warn(SWFFG.RollOptions.Links.NotAllowed)` and return false.
    - `preUpdateMacro(macro, changes)`: when `changes.command !== undefined` and the macro (or `changes.flags.starwarsffg.rollOption`) is flagged `flags.starwarsffg.rollOption === true`, run `parseOptionText(changes.command)`; on errors show them (`localizeOptionErrors`) and return false.
  - `localizeOptionErrors(errors: OptionError[]): string[]` — `game.i18n.format("SWFFG.RollOptions.Error.<Code>", {option, key, detail})` with `Code` the code's first letter capitalised.
- Strings: `SWFFG.RollOptions.Links.NotAllowed`: `"Only the GM can change roll option links."`; `SWFFG.RollOptions.Error.Header`: `"{name} was not saved:"`; one `SWFFG.RollOptions.Error.<Code>` per code, e.g. `Json`: `"The text is not valid JSON: {detail}"`, `NotList`: `"The text must be one option or a list of options."`, `NotObject`: `"Option {option} must be an object."`, `UnknownKey`: `"Option {option}: {key} is not a known key."`, `NotCost`: `"Option {option}: {key} must be a whole number of 0 or more, or \"amount\"."`, `NotMax`: `"Option {option}: {key} must be a whole number of 1 or more, \"ranks\" or \"forceRating\"."`, `AmountWithoutAmount`: `"Option {option}: {key} uses \"amount\", but the option has no amount."`, `DuplicateId`: `"Option {option}: the id is already used by another option in this macro."`, and the rest in the same voice.
- **Save-check mode comes from Task 0.** If Foundry's macro editor keeps the GM's text after a refused update, `preUpdateMacro` refuses invalid text (returns false). If it loses the text, it lets the save through and shows the errors as a warning instead; the invalid text then fails `parseOptionText` at roll time and the macro is skipped, as the spec allows.

- [ ] **Step 1: Write the failing tests** (`roll-option-links.test.mjs`, data built as plain objects)
  - `a player cannot change an item's own links` — `{system:{rollOptions:["Macro.a"]}}` → `["Macro.b"]`, `isGM:false` → `{ok:false, where:"self"}`; same with `isGM:true` → ok.
  - `a player cannot change a kept copy's links` — weapon quality `{_id:"q1", name:"Auto-fire", system:{rollOptions:["Macro.a"]}}` → same copy with `[]` → refused, `where:"q:q1|Auto-fire"`.
  - `removing, adding and replacing copies is allowed` — quality removed → ok; quality with links added → ok; tree slot `talent3` going from `{itemId:"t1", rollOptions:["Macro.a"]}` to `{itemId:"t2", rollOptions:["Macro.b"]}` → ok.
  - `reordering copies is allowed` — two qualities swapped in the array, links unchanged → ok.
  - `a modification inside an attachment is matched through the attachment` — attachment `a1` keeps modification `m1`, whose links change → refused with `where:"a:a1|<name>/q:m1|<name>"`.
  - `other changes pass` — a quality's rank or name changing → ok.
  - `addLink and removeLink` — no duplicates; removing an absent uuid returns the list unchanged.
  - `withCopyLinks replaces only the matching copy`.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-links.test.mjs`.
- [ ] **Step 3: Implement** `roll-option-links.js`, then `roll-option-hooks.js` and its registration, and the strings.
- [ ] **Step 4: Run** — PASS; `npm test` PASS; `node --input-type=module --check < modules/helpers/roll-option-hooks.js` prints nothing.
- [ ] **Step 5: Commit** — `git commit -m "Let only the GM change roll option links, and check option macros on save"`.

---

### Task 10: Link lists on the classic item sheets

**Files:**
- Create: `templates/parts/shared/ffg-roll-option-links.html`
- Modify: `modules/helpers/partial-templates.js` (register the partial), `modules/items/item-sheet-ffg.js` (`getData`, `activateListeners`, two new methods), `templates/items/ffg-weapon-sheet.html`, `ffg-armour-sheet.html`, `ffg-gear-sheet.html`, `ffg-talent-sheet.html`, `ffg-itemattachment-sheet.html` (include the partial right after `ffg-optional-buffs.html`), `templates/items/ffg-itemmodifier-sheet.html` (include it where that sheet lists its modifiers), `styles/mandar.css`, `lang/en.json`

**Interfaces:**
- Consumes: `LINK_ITEM_TYPES`, `parseOptionText` (Task 1); `addLink`, `removeLink` (Task 9); `localizeOptionErrors` (Task 9); `createBuffEditQueue` (`modules/helpers/optional-buffs.js`, reused as a generic save queue).
- Produces, shared with the popups (Task 11), in `modules/helpers/roll-option-hooks.js`:
  - `describeRollOptionLinks(uuids: string[]|undefined): Array<{uuid: string, name: string, missing: boolean}>` — names from `fromUuidSync(uuid)`; a missing macro is named with `SWFFG.RollOptions.Links.Missing`.
  - `bindRollOptionLinks(root: HTMLElement|jQuery, {save: (change: (links: string[]) => string[]) => Promise<void>}): void` — on `.roll-option-links`: `dragover` allows the drop; `drop` reads `{type:"Macro", uuid}` from `text/plain`, loads the macro with `fromUuid`, runs `parseOptionText(macro.command)`; on errors shows `SWFFG.RollOptions.Links.Invalid` with `localizeOptionErrors` and stops; otherwise calls `save((links) => addLink(links, uuid))` and, when the macro is not flagged and the user can update it, sets `flags.starwarsffg.rollOption = true`. Click `[data-action="open"]` → `macro.sheet.render(true)`; `[data-action="remove"]` → `save((links) => removeLink(links, uuid))`.
- Produces on `ItemSheetFFG` (inherited by Codex sheets in Task 15, so keep these names):
  - context: `showRollOptionLinks = game.user.isGM && LINK_ITEM_TYPES.includes(type)`; `rollOptionLinks = describeRollOptionLinks(system.rollOptions)`.
  - `_activateRollOptionLinkListeners(html)` — `bindRollOptionLinks(html, {save: (change) => this._saveRollOptionLinks(change)})`.
  - `_saveRollOptionLinks(change: (links: string[]) => string[])` — through a `createBuffEditQueue({read: () => system.rollOptions, write: (next) => update({"system.rollOptions": next})})`, refusing while the owning actor is in Edit Mode, as `_saveOptionalBuffs` does.
  - Partial markup: a `section.roll-option-links` with a title, one row per link (`data-uuid`, name, open and remove controls) and a drop hint, all wrapped in `{{#if showRollOptionLinks}}`.
- Strings: `SWFFG.RollOptions.Links.Title`: `"Roll options"`; `.Drop`: `"Drop a macro here to link its roll options"`; `.Open`: `"Open macro"`; `.Remove`: `"Remove link"`; `.Missing`: `"Missing macro"`; `.Invalid`: `"{name} has errors and was not linked:"`.

- [ ] **Step 1: Add a surface pin** to `tests/node/public-api-surface.test.mjs` for `"_activateRollOptionLinkListeners("` and `"async _saveRollOptionLinks("` under `modules/items/item-sheet-ffg.js`, and run `node --test tests/node/public-api-surface.test.mjs` to see it fail.
- [ ] **Step 2: Implement** the partial, its registration, the two shared helpers, the context, the listeners (called from `activateListeners` next to `_activateOptionalBuffListeners`), the six template includes, the CSS (mirror `.optional-buffs`) and the strings.
- [ ] **Step 3: Run** — the surface test PASS; `npm test` PASS; `npm run lint` PASS.
- [ ] **Step 4: Commit** — `git commit -m "Link roll option macros from the classic item sheets"`.

---

### Task 11: Link lists in the embedded popups

**Files:**
- Modify: `modules/items/item-editor.js` (`itemEditor` and `talentEditor`: context and listeners), `templates/items/dialogs/ffg-embedded-itemmodifier.html`, `ffg-embedded-itemattachment.html`, `ffg-embedded-talent.html` (include the partial)

**Interfaces:**
- Consumes: the partial, strings, `describeRollOptionLinks` and `bindRollOptionLinks` (Task 10); `copyIdentity`, `withCopyLinks` (Task 9).
- Produces:
  - `itemEditor#_prepareContext` adds `showRollOptionLinks` (GM only) and `rollOptionLinks = describeRollOptionLinks(this.data.clickedObject.system.rollOptions)`; `talentEditor` reads `this.data.sourceObject.system.talents[this.data.talentId].rollOptions`.
  - Both call `bindRollOptionLinks(html, {save: (change) => this._saveCopyLinks(change)})` from their render listeners.
  - `itemEditor#_saveCopyLinks(change)`: for a quality, `withCopyLinks(sourceObject.system.itemmodifier, copyIdentity(clickedObject), next)` then `sourceObject.update({"system.itemmodifier": list})`; for an attachment, the same on `system.itemattachment`; then refresh `this.data.clickedObject` from the saved list and re-render. `talentEditor#_saveCopyLinks(change)`: `sourceObject.update({[`system.talents.${talentId}.rollOptions`]: next})`.
  - These saves must not go through the popup's form submit (`_updateObject`), whose write-back rebuilds the copy from form fields.
- Not in this task (spec scope): modifications inside an attachment that is installed on a weapon are edited inline in the attachment popup (`ffg-modification.html`) and get no link list; the library run still links them.

- [ ] **Step 1: Implement** the context, the shared listener helper, the two `_saveCopyLinks` methods and the three template includes.
- [ ] **Step 2: Run** — `npm test` PASS; `npm run lint` PASS; `node --input-type=module --check < modules/items/item-editor.js` prints nothing.
- [ ] **Step 3: Commit** — `git commit -m "Link roll option macros from the quality, attachment and tree popups"`.

---

### Task 12: The side card, Two weapons, and buffs moved onto it

**Files:**
- Create: `templates/dice/parts/roll-options-panel.html`
- Modify: `templates/dice/roll-options-ffg.html` (remove the `section.optional-buffs` block; add an `aside.ffg-roll-options-panel` with a fold tab and an inner container, mirroring `aside.ffg-defence-panel`), `modules/dice/roll-builder.js`, `modules/helpers/partial-templates.js`, `styles/mandar.css`, `lang/en.json`

**Interfaces:**
- Consumes: `layerPool` (Task 4).
- Produces (inside `RollBuilderFFG`):
  - `this._twoWeapons = "no"`; `this._rollActor` (the actor `_collectOptionalBuffs` resolves, kept for later tasks).
  - `_effectivePool(defenceOverride = null)` becomes a call to `layerPool(this.dicePool, {buffs: this._tickedBuffs(), rows: optionDiceRows(this._tickedOptions(), this._twoWeapons), skill: {characteristic, rank}, defence, adversaryRanks: this.adversaryRanks, adversaryMode: this._adversaryMode})`. Until Task 13, `_tickedOptions()` returns `[]`.
  - `_relocateRollOptionsPanel()` hangs the card on the window's **right** edge, as `_relocateDefencePanel` does on the left; `_renderRollOptionsPanel()` re-renders the inner container from `roll-options-panel.html` with the current state; listeners are delegated on the panel so they survive re-rendering.
  - The card shows when the roll offers Two weapons (`this.roll.item?.type === "weapon"`), an optional buff or (later) an option. It opens unfolded; folding leaves the tab with a count of ticked rows (ticked buffs + ticked options + 1 when Two weapons is not `no`).
  - Two weapons is a three-way switch (`no` / `same` / `different`); a change re-renders the card and updates the preview.
  - Optional buffs keep their behaviour (ticking updates the preview; sent buffs still locked until Task 14) but render inside the card.
- Strings: `SWFFG.RollOptions.Panel.Toggle`: `"Roll options"`; `.TwoWeapons`: `"Two weapons"`; `.TwoWeaponsNo`: `"No"`; `.TwoWeaponsSame`: `"Same skill"`; `.TwoWeaponsDifferent`: `"Different skills"`; `.Options`: `"Talents & qualities"`; `.Ticked`: `"{count} ticked"`.

- [ ] **Step 1: Implement** the template, the partial registration, the builder changes and the CSS (copy the defence panel's positioning rules, mirrored to the right).
- [ ] **Step 2: Run** — `npm test` PASS (the existing optional-buff tests must still pass); `npm run lint` PASS; `node --input-type=module --check < modules/dice/roll-builder.js` prints nothing.
- [ ] **Step 3: Commit** — `git commit -m "Move roll choices onto a foldable side card and add Two weapons"`.

---

### Task 13: Option rows in the dialog, charging and the chat line

**Files:**
- Modify: `modules/dice/roll-builder.js`, `templates/dice/parts/roll-options-panel.html`, `modules/helpers/roll-option-hooks.js` (add `chargeRollOptionCost`), `styles/mandar.css`, `lang/en.json`

**Interfaces:**
- Consumes: `linkedMacroUuids`, `collectOfferedOptions` (Task 3); `rollOptionInputs`, `planOptionStates` (Task 5); `chargeRollCost`, `classifyCharge` (Task 6); `rollOptionCardEntries`, `formatRollOptionsLine` (Task 7); `parseOptionText` (Task 1).
- Produces:
  - Inputs: `this._optionInputs = rollOptionInputs(this._rollActor, {skillKey: this.roll.skillKey, item: this.roll.item, configuredSkills: CONFIG.FFG.skills, hasActiveGM: !!game.users.activeGM})`. **No code in the dialog reads `actor.items`, `actor.system` or `actor.isOwner` directly**: `this._rollActor` can be null (`rollActorFrom` returns null for a roll with no actor), and the inputs already turn that into an empty item list, Force rating 0 and no payer. A roll with no actor must open, preview and post as it does today.
  - Loading: `_prepareContext` (async) loads every uuid from `linkedMacroUuids(this._optionInputs.items)` once per dialog with `fromUuid`, parses each command with `parseOptionText`, and keeps `this._rollOptionMacros: Map`. A load or parse failure logs `CONFIG.logger.warn` and leaves that uuid out.
  - `this._offeredOptions = collectOfferedOptions({items: inputs.items, macros, context: inputs.context})`.
  - `this._optionSelection = {}`; every change (tick, amount, Two weapons) runs `planOptionStates({offered, selection, twoWeapons, pool: inputs.pool, canCharge: inputs.canCharge})`, stores the result and its `selection`, re-renders the card and updates the preview. When the GM connects or disconnects the dialog keeps its inputs; the writer's own check at charge time is what counts.
  - `_tickedOptions(): Array<{option, amount}>` from the current selection.
  - Row markup: checkbox, label (+ rank when `ranked`), cost text from the row's resolved `cost` (`2 strain · maneuver`, built from the `SWFFG.RollOptions.Cost.*` strings), an amount box (`min 1`, `max = maxAmount`) when the option has an amount, then the hint or the localized reason. Footer `SWFFG.RollOptions.Panel.StrainAfter` / `.WoundsAfter` with `{value: after, threshold}` when there is a payer and any offered option has a strain cost.
  - Roll click: snapshot the states, Two weapons and the card entries (`rollOptionCardEntries({offered, states, twoWeapons, unit: inputs.pool?.unit ?? "strain"})`) synchronously with the pool (before any `await`, as the existing snapshot does). Set `roll.rollOptionsText = formatRollOptionsLine(entries, localize)`. When `states.strain > 0` (which implies a payer), push `() => chargeRollOptionCost(this._rollActor, states.strain, entries)` onto the costs `postThenPay` runs.
  - `chargeRollOptionCost(actor, total, entries): Promise<void>` (in `roll-option-hooks.js`) — calls `chargeRollCost`, classifies with `classifyCharge`, never throws:
    - `charged` → nothing;
    - `notCharged` → `ui.notifications.warn(SWFFG.RollOptions.Charge.NotCharged)` with `{actor, cost, options, reason}`, the reason from `SWFFG.RollOptions.Charge.Reason.<NoWriter|Unaffordable|Outdated|Failed>`;
    - `unknown` → `ui.notifications.warn(SWFFG.RollOptions.Charge.Unknown)`.
    - The coordinator's own "still waiting" notice covers a slow reply; a later rejection lands in the `notCharged` / `unknown` branches because the promise settles then.
- Strings: `SWFFG.RollOptions.Panel.StrainAfter`: `"Strain after roll: {value} / {threshold}"`; `.WoundsAfter`: `"Wounds after roll: {value} / {threshold}"`; `SWFFG.RollOptions.Reason.NeedsTwoWeaponsSame`: `"Needs Two weapons: same skill"`; `.NeedsTwoWeaponsDifferent`: `"Needs Two weapons: different skills"`; `.NeedsTwoWeaponsAny`: `"Needs Two weapons"`; `.CannotPay`: `"Minions can't suffer strain"`; `.NeedsWriter`: `"Needs the GM connected"`; `.ZeroMax`: `"Nothing to choose: the maximum is 0"`; `.OverThreshold`: `"Would take {unit} to {value} / {threshold}"`; `SWFFG.RollOptions.Charge.NotCharged`: `"{actor}'s {cost} for {options} was not charged: {reason}."`; `.Reason.NoWriter`: `"no GM or owner of {actor} is connected"`; `.Reason.Unaffordable`: `"it would take them past their threshold"`; `.Reason.Outdated`: `"the client that would apply it runs an older version"`; `.Reason.Failed`: `"the update failed"`; `.Unknown`: `"{actor}'s {cost} for {options} may or may not have been charged: the client applying it disconnected. Check {actor}'s {unit} before charging it by hand."`

- [ ] **Step 1: Implement** the inputs, loading, state, rows, footer, Roll click snapshot, `chargeRollOptionCost` and the strings.
- [ ] **Step 2: Run** — `npm test` PASS (Task 5's no-actor test covers the inputs); `npm run lint` PASS; syntax checks on `roll-builder.js` and `roll-option-hooks.js` print nothing.
- [ ] **Step 3: Check the dialog still opens with no actor** — `grep -nE "_rollActor\.(items|system|isOwner)|actor\.(items|system|isOwner)" modules/dice/roll-builder.js` shows no new unguarded reads in the code this task added; the Foundry check in Task 18 opens one for real.
- [ ] **Step 4: Commit** — `git commit -m "Offer roll options in the dialog and charge them after the roll posts"`.

---

### Task 14: A pool the GM sends to a player

**Files:**
- Create: `modules/dice/roll-option-sent.js`
- Modify: `modules/dice/roll-builder.js` (send branch and constructor), `modules/swffg-main.js` (the `.ffg-pool-to-player` click handler near line 1684 passes `sentLayers`)
- Test: `tests/node/roll-option-sent.test.mjs`

**Interfaces:**
- Consumes: `layerPool`, `optionDiceRows` (Task 4); `planOptionStates` (Task 5).
- Produces:
  - `packSentLayers({defence, adversaryRanks, adversaryMode, options, buffs, twoWeapons}): {v: 1, defence: number, adversaryRanks: number, adversaryMode: boolean, options: Record<string, number>, buffs: string[], twoWeapons: "no"|"same"|"different"}` — stored as `flags.starwarsffg.sentLayers`.
  - `readSentLayers(flags: object): object|null` — the normalized layers, or null for a message without `sentLayers` (sent before this change: it opens as today, with `appliedBuffs` locked and the baked pool).
  - Sender: the message's `dicePool` becomes the **base** pool (`this.dicePool`, nothing layered) plus `sentLayers` with the click-time defence (`_defenceDice()`), Adversary ranks and mode, the ticked option keys and amounts, ticked buff keys and the Two weapons choice. `roll.appliedBuffs` is no longer written for new messages. Ammo and one-check effects are still paid on the sender's post; option costs are not charged by the sender.
  - Recipient (`RollBuilderFFG` constructor, `rollOptions.sentLayers`): `_defenceDice()` returns `sentLayers.defence`; `adversaryRanks` and `_adversaryMode` come from `sentLayers` and the `targetToken` hook leaves them alone; buffs whose key is in `sentLayers.buffs` start ticked and **unlocked**; `_optionSelection` starts as `sentLayers.options` and passes through `planOptionStates`, which unticks what no longer fits; `_twoWeapons = sentLayers.twoWeapons`.

- [ ] **Step 1: Write the failing tests**
  - `layers round-trip` — `readSentLayers({sentLayers: packSentLayers(x)})` deep-equals the normalized `x`.
  - `an old message has no layers` — `readSentLayers({roll: {appliedBuffs: [{key: "k"}]}})` → null.
  - `the recipient's pool matches the sender's` — the same base pool, buffs, options and Two weapons through `layerPool` with the sender's live defence and ranks, and with `readSentLayers(...)` values, give equal pools (one case with an Adversary rank and Guns Blazing, one with a negative manual setback).
  - `a sent option that no longer fits arrives unticked` — `sentLayers.options = {gb: 1}` with Guns Blazing (2 strain) and a pool at 11 / 12 → `planOptionStates(...).selection` has no `gb`.
  - `bad layers are cleaned` — negative defence → 0; unknown `twoWeapons` → `"no"`; non-integer amounts dropped.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-sent.test.mjs`.
- [ ] **Step 3: Implement** the module, then the sender, recipient and click-handler changes.
- [ ] **Step 4: Run** — PASS; `npm test` PASS; `npm run lint` PASS.
- [ ] **Step 5: Commit** — `git commit -m "Send roll options and buffs unlocked with a GM-sent pool"`.

---

### Task 15: Codex II sheets and the API bump

**Files:**
- Modify: `codex/templates/items/codex-weapon.html`, `codex-armour.html`, `codex-gear.html`, `codex-talent.html`, `codex-itemattachment.html` (include `ffg-roll-option-links.html` right after `ffg-optional-buffs.html`), `codex/styles/` (style the block in Codex style), `modules/api/public-api.js` (`PUBLIC_API_VERSION = 3`, with a comment line: "apiVersion 3 adds the roll option link list: the shared partial templates/parts/shared/ffg-roll-option-links.html and ItemSheetFFG#_activateRollOptionLinkListeners / #_saveRollOptionLinks"), `codex/scripts/api-check.js` (`REQUIRED_API_VERSION = 3`)
- Test: `tests/node/public-api.test.mjs`, `tests/node/public-api-surface.test.mjs`, `codex/tests/node/api-check.test.mjs`, `tests/node/codex-boundary.test.mjs` (all existing)

**Interfaces:**
- Consumes: Task 10's partial and inherited methods (Codex item sheets extend `ItemSheetFFG`, so `getData` and `activateListeners` already supply the context and listeners).
- Codex has no quality sheet, so it covers five types.

- [ ] **Step 1: Make the changes.**
- [ ] **Step 2: Run** — `npm test` PASS (the API and Codex tests read the constants, so they follow the bump); `npm run check:imports` PASS.
- [ ] **Step 3: Commit** — `git commit -m "Show roll option links on Codex II item sheets (API 3)"`.

---

### Task 16: The library planner

**Files:**
- Create: `modules/helpers/roll-option-library-plan.js`
- Test: `tests/node/roll-option-library-plan.test.mjs`

**Interfaces:**
- Consumes: `ROLL_OPTION_LIBRARY`, `libraryEntryFor` (Task 2); `copyIdentity`, `nodeIdentity` (Task 9).
- Produces:
  - `planLibraryMacros(entries, existing: Array<{uuid: string, libraryId: string}>): {create: Entry[], uuidByEntry: Map<string, string>}` — entries with no existing macro go in `create`; existing ones map their uuid and are never rewritten.
  - `planItemLinks(itemData: object, {uuidByEntry: Map<string,string>, isLive: (uuid: string) => boolean}): {update: object|null, linked: Array<{entryId: string, place: string}>}`
    - A place "has no live link" when its list is empty or every uuid fails `isLive`; only those are linked (the list is replaced by `[uuid]`).
    - Places and update keys: a talent item itself (`kind:"talent"`) and a quality item itself (`kind:"quality"`) → `"system.rollOptions"`; qualities on a weapon, armour or attachment → the whole `"system.itemmodifier"` array; attachments installed on a weapon or armour → the whole `"system.itemattachment"` array, with their own qualities linked inside; specialization tree nodes (every node, learned or not) → `"system.talents.<slot>.rollOptions"`. Species are skipped.
    - `place` strings: `"item"`, `"quality:<name>"`, `"attachment:<name>/quality:<name>"`, `"tree:<slot>:<name>"`.
    - `update` is null when nothing changes.

- [ ] **Step 1: Write the failing tests**
  - `existing macros are reused and never rewritten` — one existing `{uuid:"Macro.af", libraryId:"auto-fire"}` → `create` has 7 entries, `uuidByEntry.get("auto-fire") === "Macro.af"`.
  - `a talent item gets its link` — `{type:"talent", name:"Guns Blazing", system:{rollOptions:[]}}` → `update {"system.rollOptions": [uuid]}`.
  - `name variants match` — talent `"guns-blazing"` matches.
  - `a live link is left alone; a dead link is replaced` — `["Macro.x"]` with `isLive → true` → null; with `isLive → false` → replaced.
  - `qualities on a weapon and on an attachment's modifications are linked` — weapon with Auto-fire quality and an attachment carrying an Auto-fire modification → one `system.itemmodifier` and one `system.itemattachment` in the update; `linked` names both places.
  - `tree nodes are linked by name, learned or not` — specialization with `talent0` Intense Focus (unlearned) → `"system.talents.talent0.rollOptions"`.
  - `species are skipped` — `{type:"species", system:{talents:{x:{name:"Point Blank"}}}}` → null.
  - `unknown names are left alone` — talent `"Parry"` → null.
  - `running twice changes nothing the second time` — apply the first plan's update to the data, plan again → null.
- [ ] **Step 2: Run to see them fail** — `node --test tests/node/roll-option-library-plan.test.mjs`.
- [ ] **Step 3: Implement** the module.
- [ ] **Step 4: Run** — PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `git commit -m "Plan the roll option library run"`.

---

### Task 17: The library run

**Files:**
- Create: `modules/helpers/roll-option-library-run.js`
- Modify: `modules/swffg-main.js` (`game.ffg.rollOptions = { installLibrary: installRollOptionLibrary }`), `lang/en.json`

**Interfaces:**
- Consumes: `ROLL_OPTION_LIBRARY` (Task 2); `planLibraryMacros`, `planItemLinks` (Task 16).
- Produces: `installRollOptionLibrary(): Promise<object|null>` — GM only (others get a warning and null). Steps (spec, *The library run*):
  1. A `foundry.applications.api.DialogV2.confirm` naming what it scans; cancel → null.
  2. Find or create the world folder `SWFFG.RollOptions.Library.FolderName` (`"Roll options"`, type `Macro`); find existing macros by `flags.starwarsffg.rollOptionLibraryId`; create the missing ones as type `script`, name `entry.macroName`, command `JSON.stringify(entry.options, null, 2)`, flags `{starwarsffg: {rollOption: true, rollOptionLibraryId: entry.id}}`. If Task 0 found that a player cannot read a GM macro they have no permission on, also set `ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER}`.
  3. Scan world items; each world actor's items; each unlinked token's actor (`!token.actorLink`) on every scene; every unlocked `Item` or `Actor` compendium (load documents; for actors, their items). Skip locked compendiums and list them.
  4. For each item, `planItemLinks` with `isLive = (uuid) => !!fromUuidSync(uuid)` (world macros); apply `item.update(update)`; one failure is reported and the run goes on.
  5. Return and show the report (a whispered chat message to the GM): created macros, linked places per kind and per location, skipped locked compendiums, and for module compendiums the note that links point at this world's macros.
- Strings: `SWFFG.RollOptions.Library.FolderName`, `.ConfirmTitle`: `"Install roll option library"`, `.ConfirmBody`: `"Creates the library's macros in a \"Roll options\" folder and links them into matching talents and qualities on actors, world items, unlocked compendiums and unlinked tokens. Macros and links you already have are left as they are."`, `.Report*` lines for each part of the report, `.ModuleCompendiumNote`: `"{pack} is a module compendium: its new links point at this world's macros and do nothing in other worlds."`, `.GMOnly`: `"Only a GM can install the roll option library."`.
- The wiki macro line (Task 18): `game.ffg.rollOptions.installLibrary()`.

- [ ] **Step 1: Implement** the runner, its registration and the strings.
- [ ] **Step 2: Run** — `npm test` PASS; `npm run lint` PASS; `node --input-type=module --check < modules/helpers/roll-option-library-run.js` prints nothing.
- [ ] **Step 3: Commit** — `git commit -m "Add the GM roll option library run"`.

---

### Task 18: Verify in Foundry, then changelog and wiki

**Files:**
- Modify: `CHANGELOG.md`; the wiki (separate repo `https://github.com/YeNov/StarWarsFFG.wiki.git`, set `user.email` in that clone as the memory note on fresh clones says)

- [ ] **Step 1: Ask the user before starting Foundry** (their campaign world shares the data folder), then start it on the `test` world, as in Task 0.
- [ ] **Step 2: Conformance** — `await game.ffg.reportDataModelConformance()` as the GM: no new findings.
- [ ] **Step 3: Walk the spec's Foundry checks.**
  - Open a roll dialog with no actor from the GM console (`game.ffg.DiceHelpers.displayRollDialog({}, new starwarsffg.helpers.DicePoolFFG({ability: 2, difficulty: 2}), "No actor", "Test", null, "", null)`): it opens, shows no option rows, and rolls.
  - Run the library and read the report and the macro folder.
  - On a character with the eight talents and a weapon with Auto-fire, check each option:
    - shows where it should;
    - greys out at the threshold;
    - changes the preview;
    - charges only after posting, and not on a failed post;
    - is named in chat.
  - Edit a library macro and see every linked item follow.
  - A rival pays wounds; a minion's strain options are greyed.
  - A crew roll charges the crew member.
  - A player rolling for an actor they don't own is charged through the GM.
  - Two quick rolls in a row are both charged.
  - A broken or uninstalled Auto-fire offers nothing.
  - A player can remove a linked quality from their weapon.
  - The link lists appear on the classic sheets, the popups and the Codex sheets, and not for a player.
  - A GM-sent pool arrives ticked and unticks cleanly.

  Fix anything found in the task that owns it, with a test where the fix is in a pure module.
- [ ] **Step 4: CHANGELOG.** Under `Unreleased`:
  - **Added** entries for roll options (with the first library and Two weapons), option macros with their link lists, and the library run, with a sub-bullet telling the GM to run `game.ffg.rollOptions.installLibrary()` once;
  - a **Changed** entry for optional buffs moving onto the side card and arriving unlocked in a sent pool.

  Keep to one or two user-facing lines each.
- [ ] **Step 5: Wiki.**
  - Chapter 9 (*Changing a roll before and after*): the side card, Two weapons and options.
  - The item-editing chapter: option macros, the link lists, the option format and the library table.
  - The library run and how to start it.
  - Screenshots as WebP under `images/`, marks redrawn with `python tools/annotate-tutorial-shots.py <wiki-clone>`.

  Commit in the wiki clone; push only with the user's go-ahead.
- [ ] **Step 6: Final run** — `npm test`, `npm run check:imports`, `npm run lint` all PASS; check the diff for private paths and emails.
- [ ] **Step 7: Commit** — `git commit -m "Describe roll options in the changelog"`.
