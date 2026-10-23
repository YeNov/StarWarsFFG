# Roll options on initiative rolls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rolling initiative offers, applies and charges roll options and optional buffs like any other roll; the initiative talents become initiative-only, and worlds that ran the library get the new text by running it again.

**Architecture:** The offer key `initiative` (true: only on initiative rolls; false: never) gates options. The library run updates its own unedited macros in place. The roll options card's Foundry-side code moves out of `RollBuilderFFG` into one controller, `RollOptionsCard`, used by the dice dialog and the initiative dialog; its pure parts go into `roll-option-card.js`. The initiative pool, roller, per-combatant batch and group flow become pure helpers in `initiative-roll.js`, with Foundry calls injected, and `CombatFFG.rollInitiative` is rebuilt on them.

**Tech Stack:** Foundry VTT 14 system, JavaScript ES modules, Handlebars templates, `node --test` with the Foundry stub (`tests/node/_stub/foundry-stub.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md` (including its Amendments), built on `docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md`.

## Global Constraints

- Work on branch `claude/initiative-roll-options-7f4517`; commit each task as it passes; never push, open a PR or merge.
- Commit with the YeNov identity this repository already has configured (`git config user.name` prints `YeNov`; check `git config user.email` is the repo's own setting before the first commit). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pure decisions live in modules free of Foundry globals, tested in `tests/node/`; `tests/node/stub-boundary.test.mjs` must keep passing (no `fromUuid`, `ui`, `Hooks`, `canvas`, DOM or `foundry.applications` in pure modules; pass lookups in).
- Parse-check ES modules with `node --input-type=module --check < <file>` (`node --check` misses ESM errors here).
- Classic sheet and dialog CSS goes in `styles/mandar.css`; never commit `npm run compile` output for `styles/starwarsffg.css`.
- English strings in `lang/en.json` (flat `SWFFG.…` keys).
- No private paths, email addresses or machine names in tracked files.
- `npm test` and `npm run check:imports` pass after every task. eslint (`npx eslint <files>`) shows no new problems: baseline 82 errors / 481 warnings overall, `modules/combat-ffg.js` 3 errors / 24 warnings, `modules/dice/roll-builder.js` 2 errors / 8 warnings; new files 0.
- `CombatFFG.rollInitiative(ids, { formula, updateTurn, messageOptions })` keeps its signature. The hidden-combatant roll mode, the `core.initiativeRoll` flag, one sound per batch, `chatBubble: false` and `updateTurn` behave as today for every dialog.
- Strain is charged only after the initiative messages post, through `chargeRollOptionCost` (GM bridge queue); a failed post charges nothing.
- The library run never overwrites a macro the GM edited.
- Ask the user before starting Foundry; test only on the `test` world.

## Review Focus

- **Ready for Anything with Leadership flagged for initiative**: only one of its two rows is ever offered, so Setback is removed once per rank. Test in Task 2.
- **An item linking the library macro and a custom macro** when the library run updates the library macro: the item keeps both links and gets the new text. Test in Task 3.
- **Switching Vigilance and Cool with Rapid Reaction ticked at 3 strain**: the row stays ticked with its amount; a row the new skill does not offer is dropped. Test in Task 4 (`keepOffered`).
- **A rival rolling initiative**: rows cost wounds and the footer reads "Wounds after roll". Test in Task 4.
- **Roll All with nobody left to roll**, and **a group listing an actorless combatant**: nothing throws, the actorless one is skipped with its warning, the rest roll. Tests in Task 6 (`runInitiativeGroup`, `planInitiativeBatch`).

---

### Task 1: The `initiative` offer key

**Files:**
- Modify: `modules/helpers/roll-options.js` (header comment's `offer` line, `OFFER_KEYS`, `checkOffer`)
- Modify: `modules/helpers/roll-options-offer.js` (`offerMatches`, the context typedef, new `hasInitiativeOption`)
- Modify: `modules/helpers/roll-option-costs.js` (`rollOptionInputs`)
- Test: `tests/node/roll-options.test.mjs`, `tests/node/roll-options-offer.test.mjs`, `tests/node/roll-option-costs.test.mjs`

**Interfaces:**
- Produces: offer key `initiative` (boolean: `true` only on initiative rolls, `false` never on them, absent no restriction); context field `isInitiative: boolean` read by `collectOfferedOptions`; `rollOptionInputs(actor, { skillKey, item, configuredSkills, hasActiveGM, initiative = false })` whose `context.isInitiative === (initiative === true)`; `hasInitiativeOption({ items, macros }) → boolean`.

- [ ] **Step 1: Write the failing tests**

In `roll-options.test.mjs`, `test("offer.initiative is a boolean")`:
```js
assert.equal(validateOptions({ offer: { initiative: true } }).ok, true);
assert.equal(validateOptions({ offer: { initiative: false } }).ok, true);
const [error] = validateOptions({ offer: { initiative: "yes" } }).errors;
assert.deepEqual([error.key, error.code], ["offer.initiative", "notBoolean"]);
```

In `roll-options-offer.test.mjs` (the file's `one`, `offer`, `labels`, `gear`, `talent`, `armour`, `quality`, `weapon` helpers; `context` gains `isInitiative: false`):
- `test("initiative: true only on initiative rolls, false never on them")`: macro `[{ label: "Init", offer: { initiative: true } }, { label: "Never", offer: { initiative: false } }, { label: "Any" }]` on `gear()` gives `["Init", "Any"]` for `{ skillKey: "Cool", isInitiative: true }` and `["Never", "Any"]` for `{ skillKey: "Cool" }`.
- `test("initiative and skills must both match")`: `{ label: "Cool init", offer: { initiative: true, skills: ["Cool"] } }` gives `[]` for `{ skillKey: "Vigilance", isInitiative: true }` and `["Cool init"]` for `{ skillKey: "Cool", isInitiative: true }`.
- `test("hasInitiativeOption looks at initiative: true only")`, with `const init = one([{ offer: { initiative: true, skills: ["Cool"] } }])`, `const never = one([{ offer: { initiative: false } }])`, `const plain = one([{ offer: { skills: ["Cool"] } }])`:
  - `hasInitiativeOption({ items: [talent()], macros: init })` is `true`; with `never` or `plain` it is `false`;
  - `false` for `gear({ carried: false })`, `armour({ equipped: false })`, `armour({ links: [], qualities: [quality({ active: false })] })`, `weapon()` (no weapon is rolled), `[]`, and `talent()` with `macros: new Map()`.

In `roll-option-costs.test.mjs`, `test("inputs mark an initiative roll")`: `rollOptionInputs(null, { skillKey: "Cool", initiative: true }).context.isInitiative` is `true`; without `initiative` it is `false`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/node/roll-options.test.mjs tests/node/roll-options-offer.test.mjs tests/node/roll-option-costs.test.mjs`
Expected: FAIL (`unknownKey` for `offer.initiative`; `hasInitiativeOption` not exported; `isInitiative` undefined).

- [ ] **Step 3: Implement**

- `roll-options.js`: `"initiative"` in `OFFER_KEYS`; `checkOffer` fails `("offer.initiative", "notBoolean")` for a non-boolean; the header's offer line lists `initiative` with its three meanings.
- `roll-options-offer.js`: `offerMatches` refuses `offer.initiative === true` unless `context.isInitiative`, and `offer.initiative === false` when `context.isInitiative`. Split the source-gathering loop of `collectOfferedOptions` into an internal `gatherOptionGroups(items, macros, weaponId)` returning the `groups` map; `collectOfferedOptions` keeps its behaviour on top of it. `hasInitiativeOption({ items, macros })` gathers with `weaponId = null` and returns whether any group's `option.offer?.initiative === true`. One header line on the key and the new function.
- `roll-option-costs.js`: `rollOptionInputs` takes `initiative = false` and sets `context.isInitiative`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test` → PASS, including every existing roll options test.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/roll-options.js modules/helpers/roll-options-offer.js modules/helpers/roll-option-costs.js tests/node/roll-options.test.mjs tests/node/roll-options-offer.test.mjs tests/node/roll-option-costs.test.mjs
git commit -m "Add an offer key that keeps a roll option to, or off, initiative rolls"
```

---

### Task 2: Library entries for initiative

**Files:**
- Modify: `modules/config/roll-option-library-entries.js` (entries `rapid-reaction`, `get-the-drop`, `on-the-lookout`, `ready-for-anything`, `master-strategist`; header comment on `previous`)
- Modify: `modules/config/roll-option-library.js` (`entry()` keeps a frozen `previous`, default `[]`; header comment)
- Test: `tests/node/roll-option-library.test.mjs`

**Interfaces:**
- Consumes: the `initiative` offer key (Task 1).
- Produces: each `ROLL_OPTION_LIBRARY` entry has `previous: ReadonlyArray<options[]>`, the entry's earlier library texts, oldest first; `[]` for an entry that never changed.

- [ ] **Step 1: Write the failing tests** (the file's `byId`; `collectOfferedOptions` imported for the second test)

`test("the initiative talents are offered on initiative rolls only")`:
```js
for (const id of ["rapid-reaction", "get-the-drop", "on-the-lookout"]) {
  assert.equal(byId(id).options.length, 1, id);
  assert.deepEqual(byId(id).options[0].offer, { initiative: true }, id);
}
assert.deepEqual(byId("ready-for-anything").options.map((o) => [o.id, o.offer, o.dice, o.hint]), [
  ["ready-for-anything", { initiative: true, skills: ["Cool", "Vigilance"] }, { removeSetback: "ranks" }, undefined],
  ["ready-for-anything-mass-combat", { initiative: false, skills: ["Leadership", "Discipline", "Knowledge: Warfare"] }, { removeSetback: "ranks" }, "Mass Combat checks"],
]);
assert.deepEqual(byId("master-strategist").options[0].offer, { initiative: false, skills: ["Leadership", "Cool", "Discipline", "Knowledge: Warfare"] });
const rapid = byId("rapid-reaction").options[0];
assert.deepEqual([rapid.hint, rapid.amount, rapid.cost, rapid.dice], [undefined, { max: "ranks", label: "Strain" }, { strain: "amount" }, { success: "amount" }]);
assert.equal(byId("get-the-drop").options[0].hint, "Once per session; allies add it too");
assert.equal(byId("on-the-lookout").options[0].hint, "Spend a Destiny Point; also allies up to your Cunning");
```

`test("Ready for Anything removes its Setback once per roll")`: a talent item named "Ready for Anything" linking `Macro.rfa`, macros `new Map([["Macro.rfa", { ok: true, options: byId("ready-for-anything").options }]])`; `collectOfferedOptions` gives these rows (by option id): `{ skillKey: "Leadership", isInitiative: true }` → none; `{ skillKey: "Cool", isInitiative: true }` → only `ready-for-anything`; `{ skillKey: "Leadership" }` → only `ready-for-anything-mass-combat`; `{ skillKey: "Cool" }` → none. No context ever gives both. (Use the full context shape: `skillType: null, weaponId: null, isAttack: false, isForcePower: false, forceRating: 0`.)

`test("changed entries keep the text they had")`: for each of the five ids, `byId(id).previous.length === 1` and `validateOptions(byId(id).previous[0]).ok`; the earlier offers are `{ skills: ["Cool", "Vigilance"] }` (rapid-reaction, get-the-drop, on-the-lookout), `{ skills: ["Cool", "Vigilance", "Leadership", "Discipline", "Knowledge: Warfare"] }` (ready-for-anything) and `{ skills: ["Leadership", "Cool", "Discipline", "Knowledge: Warfare"] }` (master-strategist); the earlier hints are `"Initiative"`, `"Once per session, initiative; allies add it too"`, `"Initiative, spend a Destiny Point; also allies up to your Cunning"`, `"Initiative (Cool or Vigilance) or Mass Combat checks"` and `"Mass Combat check; once per phase"`; every other entry's `previous` is `[]`.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/node/roll-option-library.test.mjs` → FAIL.

- [ ] **Step 3: Change the entries**

First copy each of the five entries' current `options` array, verbatim, into `previous: [ … ]` on that entry: it must match what earlier runs installed. Then change `options` as the first test states. Ready for Anything's second option is `{ id: "ready-for-anything-mass-combat", label: "Ready for Anything", hint: "Mass Combat checks", offer: {...}, dice: { removeSetback: "ranks" } }`. Everything else stays the same; the library still has 217 entries.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test` → PASS (every entry validates; names, hints and skills tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add modules/config/roll-option-library-entries.js modules/config/roll-option-library.js tests/node/roll-option-library.test.mjs
git commit -m "Offer the initiative talents on initiative rolls only"
```

---

### Task 3: The library run updates its unedited macros in place

**Files:**
- Modify: `modules/helpers/roll-option-library-plan.js` (`planLibraryMacros`, new `libraryMacroText`)
- Modify: `modules/helpers/roll-option-library-run.js` (pass each macro's `command`; apply updates; report)
- Modify: `lang/en.json` (`SWFFG.RollOptions.Library.ConfirmBody` text; two report keys)
- Test: `tests/node/roll-option-library-plan.test.mjs`

**Interfaces:**
- Consumes: `entry.previous` (Task 2).
- Produces:
  - `libraryMacroText(entry) → string` — `JSON.stringify(entry.options, null, 2)`; the runner uses it for created and updated macros.
  - `planLibraryMacros(entries, existing: Array<{ uuid, libraryId, command? }>) → { create, uuidByEntry, update: Array<{ uuid, entryId, command }>, edited: Array<{ uuid, entryId }> }`. Only the first macro per library id counts, as today. A macro whose parsed `command` is structurally equal (key order and spacing ignored) to one of its entry's `previous` goes in `update` with `command = libraryMacroText(entry)`. One equal to neither the current options nor any `previous`, for an entry whose `previous` is not empty, goes in `edited`; an unparsable command counts as edited. The other macros are left out of both lists.
- Lang: `"SWFFG.RollOptions.Library.ReportUpdated": "Macros brought up to the library's current text: {names}."`, `"SWFFG.RollOptions.Library.ReportEdited": "Left as you edited them, although the library's text for them has changed: {names}."`; `ConfirmBody` ends `"Macros you edited and links you already have are left as they are; a library macro you never edited is brought up to the library's current text."`

- [ ] **Step 1: Write the failing tests** (`const rr = ROLL_OPTION_LIBRARY.find((e) => e.id === "rapid-reaction")`; `const old = JSON.stringify(rr.previous[0], null, 2)`)

- `test("an unedited library macro is updated in place")`: `planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: old }])` gives `update` deep-equal `[{ uuid: "Macro.rr", entryId: "rapid-reaction", command: libraryMacroText(rr) }]`, `edited` `[]`, `uuidByEntry.get("rapid-reaction") === "Macro.rr"`, and no `rapid-reaction` in `create`.
- `test("key order and spacing do not count as an edit")`: the same with `command` = `JSON.stringify` of `rr.previous[0]` with each option's keys reversed and no indentation → same `update`.
- `test("an edited library macro is left and reported")`: `command` = the old text with its hint changed → `update` `[]`, `edited` `[{ uuid: "Macro.rr", entryId: "rapid-reaction" }]`; `command: "not json"` → also `edited`.
- `test("a current macro, or an edited one whose entry never changed, is left quietly")`: `command: libraryMacroText(rr)` → both lists empty; an `auto-fire` macro with an edited command → both lists empty.
- `test("an item with the library link and a custom link keeps both")`: with the update planned above, `planItemLinks({ type: "talent", name: "Rapid Reaction", system: { rollOptions: ["Macro.rr", "Macro.mine"] } }, { uuidByEntry, isLive: () => true }).update` is `null`: nothing is relinked, the item keeps `Macro.rr`, and that is the uuid whose text the run updates.
- `test("running it again changes nothing")`: every entry present with `command: libraryMacroText(entry)` → `create`, `update` and `edited` all empty.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/node/roll-option-library-plan.test.mjs` → FAIL.

- [ ] **Step 3: Implement**

The planner, as in Interfaces. In the runner: `existing` carries `command: macro.command`. Created macros use `libraryMacroText`. `update` is applied with one `Macro.updateDocuments([{ _id, command }])`, with the ids found from the uuids in `game.macros`. The report gains `updated` and `edited` names (macro names), rendered with the two new keys. Update the plan module's header and the header of `roll-option-library.js`: a run updates library macros the GM never edited, and never touches an edited one.

- [ ] **Step 4: Verify**

Run: `npm test` → PASS; `npm run check:imports` → pass; `npx eslint modules/helpers/roll-option-library-plan.js modules/helpers/roll-option-library-run.js` → no new problems.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/roll-option-library-plan.js modules/helpers/roll-option-library-run.js lang/en.json tests/node/roll-option-library-plan.test.mjs
git commit -m "Update unedited library macros in place when the library changes"
```

---

### Task 4: The card's pure helpers

**Files:**
- Modify: `modules/helpers/roll-option-card.js` (four new exports)
- Modify: `modules/dice/roll-builder.js` (`_rollOptionsPanelContext`, `_rollOptionsTickedCount` call them; delete `_optionRowsContext`, `_optionReasonText`, `_optionFooter`)
- Test: `tests/node/roll-option-card.test.mjs`

**Interfaces:**
- Produces (all take `localize(key, data?) → string`, as `localizeRollOptionText`):
  - `optionReasonText(reason: {code, data}, localize) → string` — `RollBuilderFFG._optionReasonText` moved as is; unknown code gives `""`.
  - `cardPanelContext({ twoWeaponsAvailable, twoWeapons, buffs, tickedBuffKeys, offered, states, amounts, tooltips, pool, localize }) → { twoWeapons: {available, choices}, buffs, options, footer }` — the object `_rollOptionsPanelContext` returns today (rows as `_optionRowsContext`, footer as `_optionFooter`, a nameless buff labelled `localize("SWFFG.OptionalBuffs.Unnamed")`). `tickedBuffKeys` is a `Set`, `amounts` a plain object, `tooltips` a `Map`, `pool` the `readCostPool` result or null.
  - `tickedRowCount({ buffs, tickedBuffKeys, states, twoWeapons }) → number` — applied or ticked buffs, plus ticked option rows, plus 1 when Two weapons is not `"no"`.
  - `keepOffered({ selection, choices, buffKeys }, { offered, buffs }) → { selection, choices, buffKeys }` — keeps entries whose key is still among `offered` (options) or `buffs`, values untouched; `buffKeys` a `Set` in and out.

- [ ] **Step 1: Write the failing tests** (the file's `EN`-backed `localize`, `option`, `pool`, `planOptionStates`)

- `test("a greyed row says why")`: `optionReasonText({ code: "overThreshold", data: { unit: "strain", value: 13, threshold: 12 } }, localize)` includes `"13"` and `"12"`; `{ code: "needsDifficulty", data: { min: 4 } }` includes `EN["SWFFG.DifficultyDaunting"]`; `{ code: "nope", data: {} }` is `""`.
- `test("the card's context")`: offered `[option("pb", "Point Blank", { ranked: true, rank: 2 }), option("rr", "Rapid Reaction", { strain: "amount", amount: 3 })]`, planned with selection `{ rr: 2 }` and `pool("strain")`: `options[0].label === "Point Blank 2"`, `options[1].ticked`, `options[1].amount.value === 2`, `footer === localize("SWFFG.RollOptions.Panel.StrainAfter", { value: 2, threshold: 20 })`. Unticked with `amounts: { rr: 5 }` → `amount.value === 3`. A row greyed for `overThreshold` has `reason === true` and `note` equal to its `optionReasonText`; a hint shows as `note` on a row not greyed. `tooltips: new Map([["pb", "<p>x</p>"]])` → `options[0].tooltip === "<p>x</p>"`. `twoWeapons.choices.map((c) => c.on)` is `[false, true, false]` for `"same"`. A buff `{ key: "b", name: "", applied: true }` → `{ name: EN["SWFFG.OptionalBuffs.Unnamed"], ticked: true, locked: true }`.
- `test("a rival's card counts wounds")`: the same rows with `pool("wounds")` → `footer === localize("SWFFG.RollOptions.Panel.WoundsAfter", { value: 2, threshold: 20 })`; with no costed row → `footer === null`.
- `test("ticked rows are counted for the fold tab")`: one applied buff, one ticked buff, two ticked option rows and `twoWeapons: "same"` → `5`.
- `test("a skill change keeps only what is still offered")`: `keepOffered({ selection: { a: 3, b: 1 }, choices: { a: "x", b: "y" }, buffKeys: new Set(["k1", "k2"]) }, { offered: [{ key: "a" }], buffs: [{ key: "k2" }] })` deep-equals `{ selection: { a: 3 }, choices: { a: "x" }, buffKeys: new Set(["k2"]) }`.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/node/roll-option-card.test.mjs` → FAIL.

- [ ] **Step 3: Implement the four functions; make `RollBuilderFFG` call them**

`_rollOptionsPanelContext()` returns `cardPanelContext({...})` from its fields with `localize: localizeRollOptionText`; `_rollOptionsTickedCount()` returns `tickedRowCount({...})`; the three replaced methods are deleted. Nothing else in the dialog changes.

- [ ] **Step 4: Verify**

Run: `npm test` → PASS. `node --input-type=module --check < modules/dice/roll-builder.js` → no output. `npx eslint modules/dice/roll-builder.js modules/helpers/roll-option-card.js` → no more than 2 errors / 8 warnings, all in `roll-builder.js`.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/roll-option-card.js modules/dice/roll-builder.js tests/node/roll-option-card.test.mjs
git commit -m "Move the roll options card's context into pure helpers"
```

---

### Task 5: One roll options card for every dialog

**Files:**
- Create: `modules/dice/roll-options-card.js`
- Modify: `modules/dice/roll-builder.js`

**Interfaces:**
- Consumes: Task 1 (`rollOptionInputs` with `initiative`), Task 4 helpers.
- Produces, in `modules/dice/roll-options-card.js` (Foundry-side, no Node test):
  - `async function loadOptionMacros(uuids: string[], cache = new Map()) → Map<string, {ok: true, options}>` — what `_loadRollOptions` does per uuid today (`fromUuid`, `parseOptionText`, the same console warnings); uuids already in `cache` are skipped; returns `cache`.
  - `class RollOptionsCard`
    - `constructor({ actor = null, item = null, skill = { key: null, characteristic: null, rank: null }, initiative = false, appliedBuffs = [], sent = null })` — `sent` is a `readSentLayers` result or null. Buffs come from `collectOfferedBuffs` + `withAppliedBuffs`, with a sent pool's buff ticks and Two weapons as the dice dialog's constructor sets them today. Inputs come from `rollOptionInputs(actor, { skillKey: skill.key, item, configuredSkills: CONFIG.FFG?.skills ?? null, hasActiveGM: !!game.users?.activeGM, initiative })`.
    - `actor` (read-only), `offered`, `states`, `twoWeapons` (get/set), `twoWeaponsAvailable` (`item?.type === "weapon"`).
    - `async load()` — runs once: macros, `collectOfferedOptions`, tooltips (`PopoutEditor.renderDiceImages`), and a sent pool's pending ticks and branches.
    - `async setSkill({ key, characteristic, rank })` — re-reads the inputs and buffs for the new skill and re-collects options from the loaded macros. `keepOffered` carries over ticks, branches and buff ticks; new rows get tooltips. It does not plan.
    - `plan({ basePool, defence = 0, adversaryRanks = 0, adversaryMode = false }) → states` — today's `_planOptions`. `_liveValues`, `_swapAvailable`, `_boostBase`, `_skillLayer` and `_difficultyCount` become private helpers fed from these arguments.
    - `pool({ basePool, defence = 0, adversaryRanks = 0, adversaryMode = false }) → DicePoolFFG` — `layerPool` over the latest plan (today's `_effectivePool` body).
    - `tickedBuffs()`; `buffsInPool()` (applied buffs first, then ticked).
    - `entries()` — `rollOptionCardEntries` with the payer's unit. `rollOptionsText(entries)` and `optionalBuffsText()` build the two chat lines as the Roll click does today.
    - `chargeAfterPost(entries) → (() => Promise<void>) | null` — `chargeRollOptionCost(actor, states.strain, entries)` when the latest plan's strain is above 0 and there is an actor.
    - `sentSelections() → { options, choices, buffs, twoWeapons }` — what `packSentLayers` takes from the card.
    - `attach(appElement: HTMLElement, onChange: () => (void|Promise<void>))` — moves `.ffg-roll-options-panel` onto `appElement` and binds today's delegated listeners (ticks, amounts, branches, buffs, Two weapons, fold tab). Each listener changes the card's state, then calls `onChange`.
    - `async render()` — today's `_renderRollOptionsPanel`, through `cardPanelContext` and `tickedRowCount`.

- [ ] **Step 1: Create `RollOptionsCard` and `loadOptionMacros`** by moving the code named above out of `RollBuilderFFG`, behaviour unchanged.

- [ ] **Step 2: Make `RollBuilderFFG` use it**

- The constructor resolves the actor (`rollActorFrom`) and fills in the skill context (`rollSkillContext`), as `_collectOptionalBuffs` does today, then creates `this._card`.
- A private `_cardEnv(defenceOverride = null)` returns `{ basePool: this.dicePool, defence, adversaryRanks: this.adversaryRanks, adversaryMode: this._adversaryMode }`.
- `_prepareContext` awaits `this._card.load()`.
- `_onRender` calls `this._card.attach(this.element, () => this._onRollOptionsChanged())` and `await this._card.render()`.
- `_onRollOptionsChanged` plans with `_cardEnv()`, renders the card and updates the preview.
- `_updatePreview` and `_effectivePool` go through `plan` and `pool`.
- The Roll click takes its plan, entries, pool, buffs, chat lines, charge and sent selections from the card.
- Every use of these fields goes through the card: `this._optionInputs`, `this._offeredOptions`, `this._optionSelection`, `this._optionChoices`, `this._optionAmounts`, `this._optionTooltips`, `this._optionStates`, `this._optionalBuffs`, `this._tickedBuffKeys`, `this._twoWeapons`, `this._rollActor`. The moved methods are deleted.

- [ ] **Step 3: Verify**

- `npm test` → PASS.
- `npm run check:imports` → pass.
- `node --input-type=module --check` on `modules/dice/roll-options-card.js` and on `roll-builder.js` → no output.
- `npx eslint modules/dice/roll-options-card.js modules/dice/roll-builder.js` → 0 problems in the new file; no more than 2 errors / 8 warnings in `roll-builder.js`.
- `grep -nE "_optionSelection|_offeredOptions|_tickedBuffKeys|_planOptions" modules/dice/roll-builder.js` → no matches.

The dice dialog itself is checked in Foundry in Task 10.

- [ ] **Step 4: Commit**

```bash
git add modules/dice/roll-options-card.js modules/dice/roll-builder.js
git commit -m "Keep the roll options card's code in one controller"
```

---

### Task 6: Pure initiative helpers

**Files:**
- Create: `modules/helpers/initiative-roll.js` (imports only `../dice/pool.js`, `./minion-group.js` and `./roll-options-offer.js`)
- Test: `tests/node/initiative-roll.test.mjs`

**Interfaces:**
- Consumes: `hasInitiativeOption`, `linkedMacroUuids` (Task 1 / existing).
- Produces:
  - `initiativeRoller(actor, lookupActor: (id) => object|undefined) → { actor: object|null, data: object|null, needsPilot: boolean }`:
    - a vehicle's crew (`actor.getFlag?.("starwarsffg", "crew") ?? actor.flags?.starwarsffg?.crew`) member with `role === "Pilot"`, looked up by `actor_id`, gives `{ actor: pilot, data: withGroupSkillRanks(pilot.system, crewRollOptions(actor)), needsPilot: false }`;
    - a vehicle without one, or whose Pilot the lookup cannot find, gives `{ actor, data: actor.system, needsPilot: true }`;
    - any other actor gives `{ actor, data: actor.system, needsPilot: false }`;
    - no actor gives `{ actor: null, data: null, needsPilot: false }`.
  - `initiativePool(data, skillKey, added = {}) → DicePoolFFG | null` — `null` when `data?.skills?.[skillKey]` or that skill's characteristic value is missing. Otherwise the pool `_buildInitiativePool` in `combat-ffg.js` builds today, then the add table exactly as today: `success`, `advantage`, `failure`, `threat`, `boost` and `setback` added; `force` **set** to `added.force`; `upgrade(added.upgrades)`. It also records `pool.upgrades = Number(added.upgrades) || 0`. Missing `added` fields count 0.
  - `initiativeSkillLayer(data, skillKey) → { characteristic: number|null, rank: number|null }`.
  - `initiativeValue(ffg) → number` — `ffg.success + ffg.advantage * 0.01`.
  - `initiativeSpeaker(combatant, viewedSceneId) → { scene, actor, token, alias }` — `scene: combatant.sceneId ?? viewedSceneId ?? null`, `actor: combatant.actor?.id ?? null`, `token: combatant.token?.id ?? null`, `alias: combatant.token?.name ?? combatant.name ?? ""`.
  - `initiativeHidden(combatant) → boolean` — `combatant.token?.hidden === true || combatant.hidden === true`.
  - `planInitiativeBatch(ids, { combatantOf, lookupActor, skill, added }) → { rolls: Array<{ id, combatant, actor, data, pool }>, skipped: Array<{ id, name, reason: "noActor"|"needsPilot"|"noSkill" }> }`:
    - an id with no combatant, or one not owned (`isOwner !== true`), is left out of both lists;
    - a combatant with no actor is skipped as `"noActor"`;
    - a roller with `needsPilot` is skipped as `"needsPilot"`;
    - a null `initiativePool` is skipped as `"noSkill"`;
    - `name` is the combatant's name.
  - `initiativeMacroUuids(ids, { combatantOf, lookupActor }) → string[]` — `linkedMacroUuids` over every roller's items.
  - `talentedCombatants(ids, { combatantOf, lookupActor, macros }) → Set<string>` — the ids whose roller's items pass `hasInitiativeOption`; no actor means not talented.
  - `async runInitiativeGroup(ids, { talented: Set<string>, nameOf: (id) => string, ask: (names: string[]) => Promise<"talents"|"together"|null>, open: (ids: string[], { withCard: boolean }) => Promise<void> }) → Promise<void>`:
    - no ids: nothing happens;
    - one id: `open([id], { withCard: true })`;
    - nobody talented: `open(ids, { withCard: false })`;
    - otherwise, `ask` with the talented names in order:
      - `"together"` → `open(ids, { withCard: false })`;
      - `"talents"` → `open(plain, { withCard: false })` when `plain` is not empty, then `open([id], { withCard: true })` for each talented id in order;
      - anything else → nothing.

    Each `open` is awaited before the next.

- [ ] **Step 1: Write the failing tests**

With `const data = { characteristics: { Willpower: { value: 3 } }, skills: { Vigilance: { characteristic: "Willpower", rank: 2, boost: 1, advantage: 0, success: 0 } } }`:
- `test("the skill's initiative pool, as before")`: `initiativePool(data, "Vigilance")` has `proficiency 2, ability 1, boost 1, upgrades 0`; `initiativePool(data, "Cool")` and `initiativePool(null, "Vigilance")` are `null`.
- `test("the add table, as before, with its upgrades recorded")`: `{ boost: 1, setback: 2, upgrades: 1, force: 1, success: 1, threat: 1 }` → `proficiency 3, ability 0, boost 2, setback 2, force 1, success 1, threat 1, upgrades 1`.
- `test("a Skill Rank buff over added upgrades")`: `layerPool(initiativePool(data, "Vigilance", { upgrades: 1 }), { buffs: [{ rows: [{ modtype: "Skill Rank", value: 1 }] }], skill: initiativeSkillLayer(data, "Vigilance") })` has `proficiency 3, ability 1` (`layerPool` from `modules/dice/roll-option-pool.js`).
- `test("the skill layer")`: `initiativeSkillLayer(data, "Vigilance")` → `{ characteristic: 3, rank: 2 }`; for `"Cool"` → `{ characteristic: null, rank: null }`.
- `test("the initiative value")`: `initiativeValue({ success: 2, advantage: 3 })` → `2.03`.
- `test("who rolls")`:
  - a character gives itself, its `system`, and `needsPilot: false`;
  - a vehicle with crew `[{ role: "Pilot", actor_id: "p1" }]` and a lookup returning `pilot` gives `actor === pilot`, `data.skills` deep-equal to `pilot.system.skills`, and `needsPilot: false`;
  - a vehicle with no Pilot, or with a Pilot the lookup cannot find, gives the vehicle and `needsPilot: true`;
  - `null` gives `{ actor: null, data: null, needsPilot: false }`.
- `test("speaker and hidden without a token")`:
  - `initiativeSpeaker({ name: "Kira", actor: { id: "a1" }, sceneId: null, token: null }, "s1")` → `{ scene: "s1", actor: "a1", token: null, alias: "Kira" }`;
  - with `token: { id: "t1", name: "Kira T" }` and `sceneId: "s2"` → `{ scene: "s2", actor: "a1", token: "t1", alias: "Kira T" }`;
  - `initiativeHidden({ hidden: true, token: null })` is `true`, and `initiativeHidden({ hidden: false, token: { hidden: false } })` is `false`.
- `test("a batch rolls who it can and says why the others cannot")`: the ids are `pc`, `tokenless`, `ghost` (no actor), `ship` (a vehicle without a Pilot), `droid` (no Cool skill), `stranger` (`isOwner: false`) and `missing` (no combatant), with skill `"Cool"`.
  - `rolls.map((r) => r.id)` → `["pc", "tokenless"]`, each with a pool;
  - `skipped` → `[{ id: "ghost", name: "Ghost", reason: "noActor" }, { id: "ship", name: "Ship", reason: "needsPilot" }, { id: "droid", name: "Droid", reason: "noSkill" }]`.
- `test("who is talented")`, with macros holding an `initiative: true` option:
  - `pc` (a talent linking it) is talented;
  - `ghost` and `plain` (no links) are not;
  - a vehicle whose Pilot has the talent is talented;
  - `initiativeMacroUuids` lists the talent's uuid once.
- `test("the group flow")`: fake `open` records its calls and resolves on a later tick, and fake `ask` records its names.
  - `[]` → no calls;
  - `["a"]` → `[[["a"], true]]`;
  - `["a", "b"]` with nobody talented → `[[["a", "b"], false]]`, and `ask` is never called;
  - `["a", "ghost", "b"]` with talented `{ a }`: `ask` gets `["A"]`;
    - answer `"talents"` → `[[["ghost", "b"], false], [["a"], true]]`;
    - answer `"together"` → `[[["a", "ghost", "b"], false]]`;
    - answer `null` → `[]`;
  - `["a", "c"]` with both talented and `"talents"` → `[[["a"], true], [["c"], true]]`;
  - each `open` call starts only after the previous one resolved.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/node/initiative-roll.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement** (module header: what each function is for; the pool rules are today's, moved from `combat-ffg.js`, plus the recorded upgrades).

- [ ] **Step 4: Verify**

Run: `npm test` → PASS; `npm run check:imports` → pass; `npx eslint modules/helpers/initiative-roll.js` → 0 problems.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/initiative-roll.js tests/node/initiative-roll.test.mjs
git commit -m "Pure helpers for initiative pools, rollers, batches and group rolls"
```

---

### Task 7: The card on a one-combatant initiative dialog

**Files:**
- Modify: `modules/combat-ffg.js` (`rollInitiative`; remove `_findActorForInitiative` and `_buildInitiativePool`)
- Modify: `templates/dialogs/ffg-initiative.html`
- Modify: `styles/mandar.css` (next to the `.ffg-roll-options-panel` rules)
- Modify: `lang/en.json` (after `SWFFG.InitiativePoolSelectorHint`)

**Interfaces:**
- Consumes: `RollOptionsCard` (Task 5); `initiativeRoller`, `initiativePool`, `initiativeSkillLayer`, `initiativeValue`, `initiativeSpeaker`, `initiativeHidden`, `planInitiativeBatch` (Task 6); `postThenPay` (`modules/dice/roll-costs.js`).
- Produces on `CombatFFG`:
  - `async _openInitiativeDialog(ids: string[], { formula, updateTurn, messageOptions }, { withCard: boolean }) → Promise<void>` — resolves when the dialog closes, rolled or not.
  - `async _rollInitiativeBatch(ids, { skill: string, added: object, card: RollOptionsCard|null, updateTurn, messageOptions }) → Promise<void>`.
  - Interim `rollInitiative(ids, options)`: a string becomes an array; `[]` returns `this`; otherwise `await this._openInitiativeDialog(ids, options, { withCard: ids.length === 1 })`, then returns `this`.
- Lang:
  - `"SWFFG.InitiativeSkipped.NoActor": "{name} has no actor and cannot roll initiative."`
  - `"SWFFG.InitiativeSkipped.NeedsPilot": "{name} needs a crew member in the Pilot role to roll initiative."`
  - `"SWFFG.InitiativeSkipped.NoSkill": "{name} has no {skill} to roll initiative with."`
  - `{skill}` is the localized skill name, from the key the flavor uses today: `SWFFG.SkillsName` + the skill key with `:` and spaces removed.

- [ ] **Step 1: Template, CSS and lang**

- `ffg-initiative.html`: when the context's `card` is true, add the same `<aside class="ffg-roll-options-panel ffg-ro-collapsed" aria-hidden="true">` block as in `templates/dice/roll-options-ffg.html`: the inner div, the toggle button and the count span.
- `mandar.css`: add `.starwarsffg.ffg-initiative-dialog { overflow: visible !important; }`, plus the `.minimized` / `.minimizing` rule that hides `.ffg-roll-options-panel`, as `.roll-builder-dialog` has.
- `en.json`: the three keys above.

- [ ] **Step 2: Rebuild `rollInitiative` around the two methods**

`_openInitiativeDialog` builds today's dialog: the title, the skill pools and the add table, with the same `render` wiring for the add buttons. It awaits `DialogV2.wait`, and combatants are looked up with `this.combatants.get(id)`.

With `withCard` and one id whose roller has an actor and no `needsPilot`, it:
- creates `new RollOptionsCard({ actor: roller.actor, skill: { key, ...initiativeSkillLayer(roller.data, key) }, initiative: true })` for the default skill;
- awaits `load()`;
- plans with `{ basePool: initiativePool(roller.data, key) ?? new DicePoolFFG() }`;
- passes `card: true` to the template.

In `render`, it calls `card.attach(dialog.element, replan)` and `card.render()`. A change of the skill radio calls `card.setSkill(...)` and then `replan`. Each add-dice click calls `replan`, which plans with `initiativePool(roller.data, skill, added)` from the dialog's current inputs, then renders the card.

The Roll callback reads the skill and the add table (`DicePoolFFG.fromContainer`) and awaits `_rollInitiativeBatch`.

`_rollInitiativeBatch` works in this order:
1. Calls `planInitiativeBatch(ids, { combatantOf: (id) => this.combatants.get(id), lookupActor: (id) => game.actors.get(id), skill, added })`.
2. Warns once per skipped combatant with its `SWFFG.InitiativeSkipped.*` key.
3. For each roll, plans the card (when given, with that roll's pool as base) and takes `entries`, `pool` and both chat lines from it.
4. Rolls `new RollFFG(pool.renderDiceExpression(), rollData, pool)`, with the total from `initiativeValue(roll.ffg)`.
5. Builds the message with `speaker: initiativeSpeaker(c, canvas?.scene?.id)`, a flavor that starts with the speaker's alias, and the hidden roll-mode rule on `initiativeHidden(c)`. The rest of the message data is today's.
6. Updates the combatants, then applies `updateTurn`.
7. Posts with `await postThenPay(() => ChatMessage.create(messages, { chatBubble: false }), cost ? [cost] : [])`, where `cost = card?.chargeAfterPost(entries)`.

A batch with no rolls posts nothing.

- [ ] **Step 3: Verify**

Run: `npm test` → PASS; `npm run check:imports` → pass (the template still resolves); `node --input-type=module --check < modules/combat-ffg.js` → no output; `npx eslint modules/combat-ffg.js` → no more than 3 errors / 24 warnings.

- [ ] **Step 4: Commit**

```bash
git add modules/combat-ffg.js templates/dialogs/ffg-initiative.html styles/mandar.css lang/en.json
git commit -m "Show the roll options card when one combatant rolls initiative"
```

---

### Task 8: Group rolls ask before using talents

**Files:**
- Modify: `modules/combat-ffg.js` (`rollInitiative`, two new methods)
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `loadOptionMacros` (Task 5); `initiativeMacroUuids`, `talentedCombatants`, `runInitiativeGroup` (Task 6); `_openInitiativeDialog` (Task 7).
- Produces on `CombatFFG`:
  - `async _talentedCombatantIds(ids) → Set<string>` — loads `initiativeMacroUuids(...)` with one `loadOptionMacros` call, then returns `talentedCombatants(...)`, with the same `combatantOf` and `lookupActor` as Task 7.
  - `async _askInitiativeTalents(names: string[]) → "talents"|"together"|null` — a `DialogV2.wait` with buttons `talents` (the default) and `together`, and `rejectClose: false`. Names are HTML-escaped (`foundry.utils.escapeHTML`) and joined with ", ".
- Lang:
  - `"SWFFG.InitiativeTalents.Title": "Roll initiative with talents?"`
  - `"SWFFG.InitiativeTalents.Body": "{names} can use talents on initiative. With talents, the others roll together first, then each of them rolls in a dialog of their own."`
  - `"SWFFG.InitiativeTalents.WithTalents": "With talents"`
  - `"SWFFG.InitiativeTalents.AllTogether": "All together"`

- [ ] **Step 1: Add the lang keys and the two methods**

- [ ] **Step 2: `rollInitiative` runs the group flow**

Normalize `ids` to an array. Talent detection runs only when more than one id is listed (an empty `Set` otherwise). Then:
```js
await runInitiativeGroup(ids, { talented, nameOf: (id) => this.combatants.get(id)?.name ?? "", ask: (names) => this._askInitiativeTalents(names), open: (list, { withCard }) => this._openInitiativeDialog(list, options, { withCard }) });
return this;
```

- [ ] **Step 3: Verify**

Run: `npm test` → PASS (including the lang tests); `npm run check:imports` → pass; `node --input-type=module --check < modules/combat-ffg.js` → no output; `npx eslint modules/combat-ffg.js` → no more than 3 errors / 24 warnings.

- [ ] **Step 4: Commit**

```bash
git add modules/combat-ffg.js lang/en.json
git commit -m "Ask before group initiative rolls when a combatant has initiative talents"
```

---

### Task 9: CHANGELOG, deferred list and wiki

**Files:**
- Modify: `CHANGELOG.md` (`Unreleased`)
- Modify: `docs/roll-options-deferred.md`
- Modify, in the wiki clone (scratchpad `wiki/`, YeNov identity set in that clone): `Tutorial-10-Initiative-and-the-combat-tracker.md`, `Tutorial-09-Changing-a-roll-before-and-after.md`, `Tutorial-16-More-worth-knowing.md`

- [ ] **Step 1: CHANGELOG**, in the file's voice, after the roll option macros entry:
- **Added — roll options on initiative rolls.** Rolling one combatant's initiative shows the roll options card beside the dialog, with the options and optional buffs that fit the chosen skill. Ticked options change the roll, their strain (wounds, for a rival) is charged once it posts, and the chat card names them. When a combatant has an initiative talent, Roll All and Roll NPCs first ask whether to roll with talents. With talents, the others roll together and each talented combatant gets a dialog of their own.
  - Sub-bullet: an option macro can be kept to initiative rolls with `"offer": {"initiative": true}`, or off them with `false`.
- **Changed — Rapid Reaction, Get The Drop, On The Lookout and Ready for Anything are offered on initiative rolls** instead of on every Cool or Vigilance check. Ready for Anything keeps a row for Mass Combat checks (Leadership, Discipline, Knowledge (Warfare)), which, like Master Strategist, no longer shows on initiative rolls.
  - Sub-bullet: if you already ran `installLibrary()`, run it once more. It updates these library macros in place, keeping every link. A macro you edited is left alone and named in its report.
- **Fixed — one combatant could stop a whole initiative roll**: a combatant without a token, a vehicle with no Pilot, or a combatant whose actor was deleted. Each is now rolled or skipped with a warning, and the others roll.
- Correct the existing unreleased sub-bullet "Running `installLibrary()` again … leaves the macros and links already there alone, edited or not". It should now say that a second run adds what is missing, updates library macros you never edited, and leaves edited macros and existing links alone.

- [ ] **Step 2: Deferred list**

Replace **Options on initiative rolls** with **Initiative talents, the rest**:
- a value word for another skill's rank (such as `"skill:Stealth"`) for Get The Drop;
- a Destiny Point cost for On The Lookout;
- the allies' half of both talents.

- [ ] **Step 3: Wiki**
- Chapter 10, **Rolling initiative**: the card beside the dialog, re-offered on a skill change and charged after posting; the group prompt and both answers; combatants skipped with a warning.
- Chapter 10, **Vehicles**: the Pilot's talents count, and the Pilot pays.
- Chapter 9, **The roll options card**: one sentence saying initiative rolls carry it too, linking chapter 10.
- Chapter 16: the `offer` row of the format table gains `initiative` (`true` or `false`); the library notes say a second `installLibrary()` updates unedited library macros.

Then commit in the wiki clone with the message "Describe roll options on initiative rolls". Do not push.

- [ ] **Step 4: Commit (system repo)**

```bash
git add CHANGELOG.md docs/roll-options-deferred.md
git commit -m "Changelog and deferred list for initiative roll options"
```

---

### Task 10: Final checks

- [ ] **Step 1: Node and import gate**

Run: `npm test` → all pass; `npm run check:imports` → pass.

- [ ] **Step 2: eslint against the baseline**

Run: `npx eslint modules codex/scripts` → no more than 82 errors / 481 warnings overall, and no new problem in a changed file.

- [ ] **Step 3: Ask the user, then check in Foundry**

Ask before starting Foundry, and use the `test` world only. Walk through the spec's **Testing → In Foundry** list:
- the one-combatant card, re-offered on a skill change, greying at the threshold, charged after posting, and named in chat;
- an optional buff on Vigilance;
- a vehicle Pilot, and a vehicle with no Pilot;
- a rival paying wounds;
- Roll NPCs: the prompt, both answers, cancelling one dialog, and a combatant with no actor or token;
- a player rolling their own character;
- a second library run updating the macros in place, with an item that also links a custom macro;
- regression of the dice dialog's card: Two weapons, a sent pool, a Boost trade and a tooltip.

Write down whatever could not be checked.
