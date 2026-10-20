# Optional Buffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named, opt-in groups of modifier rows on weapons, armour, gear, talents and attachments, ticked per roll in the roll dialog, edited on both the classic and the Codex II item sheets; plus the carried toggle on the classic actor sheet.

**Architecture:** Three pure modules hold every decision (editing the buff list, which buffs a roll offers, what ticked buffs do to the pool) and are covered in Node. Thin Foundry-side code wires them into the item data model, one shared sheet partial (classic and Codex both include it and inherit its listeners from `ItemSheetFFG`), the roll dialog's existing layering in `_effectivePool`, and the chat card line pattern of `defenceZoneText`.

**Tech Stack:** Foundry VTT V14 (ApplicationV2, TypeDataModels), plain ES modules, Handlebars, `node --test` with the stub in `tests/node/_stub/foundry-stub.mjs`, the in-Foundry Mocha tier (`tests/ffg-tests.js`).

**Spec:** `docs/superpowers/specs/2026-10-20-optional-buffs-design.md`

## Global Constraints

- Item types that carry buffs: `weapon`, `armour`, `gear`, `talent`, `itemattachment`. Nothing else.
- Row types a buff may hold, exactly: `Roll Modifiers`, `Dice Modifiers`, `Result Modifiers`, `Skill Add Advantage`, `Skill Add Dark`, `Skill Add Despair`, `Skill Add Failure`, `Skill Add Light`, `Skill Add Success`, `Skill Add Threat`, `Skill Add Triumph`, `Skill Add Upgrade`, `Skill Boost`, `Skill Rank`, `Skill Remove Setback`, `Skill Setback`.
- Buff rows never become Active Effects, never touch `system.attributes` or `system.skills`, and never show in a sheet's dice preview.
- No migration: `system.optionalBuffs` defaults to `[]`.
- Decisions live in modules with no Foundry globals beyond the stub's allowlist (`foundry.utils.*`, `CONFIG.logger`, `game.settings.get`, `game.i18n.localize`).
- Codex code never imports a system path (`tests/node/codex-boundary.test.mjs`); it reaches the system through the public API and the shared partials.
- Classic sheet CSS goes in `styles/mandar.css`; never commit `npm run compile` output for `styles/starwarsffg.css`. Codex CSS goes in `codex/styles/cdx.css`, scoped under `.cdx`.
- English strings in `lang/en.json` under `SWFFG.OptionalBuffs.*` (and `SWFFG.Carried*`).
- Commit after each task with the YeNov identity; do not push.
- `npm test` and `npm run check:imports` pass after every task.

## Review Focus

1. **An unlinked token's character.** The dialog must read buffs from the token's own actor, not the world actor it was made from. Pinned by `rollActorFrom` tests (Task 5).
2. **A sent pool rolled by the player.** Buffs the GM ticked must not be applied twice, and must still be named on the card even if the player's dialog can't match them to an item. Pinned by `withAppliedBuffs` tests (Task 2).
3. **Old, hand-edited or imported data in `optionalBuffs`.** A row of a type a buff can't hold, a missing id, a non-array value: ignored, never thrown on. Pinned by `cleanBuffs` tests (Task 1).
4. **Downgrades past zero.** Downgrade rows bigger than the pool must never leave a negative die count. Pinned in Task 3.
5. **A buff with a name but no rows that apply, or no name.** Not offered when nothing applies (pinned in Task 2); shown as "Unnamed buff" in the dialog when unnamed (checked by hand in Task 5, Step 6).

---

### Task 1: Buff list rules

**Files:**
- Create: `modules/helpers/optional-buffs.js`
- Test: `tests/node/optional-buffs.test.mjs`

**Interfaces:**
- Produces:
  - `BUFF_ITEM_TYPES: string[]` — the five item types.
  - `BUFF_MODTYPES: string[]` — the sixteen row types, in the Global Constraints order.
  - `isSkillModtype(modtype: string): boolean` — true for the types starting with `"Skill "`.
  - `buffModifierTypes(allTypes: object): object` — `allTypes` (shaped like `CONFIG.FFG.allowableModifierTypes`, key → `{value, label}`) filtered to `BUFF_MODTYPES`, same entry objects.
  - `newBuff(): Buff` and `newBuffRow(): BuffRow`.
  - `cleanBuffs(raw: unknown): Buff[]`.
  - `addBuff(buffs)`, `removeBuff(buffs, buffId)`, `renameBuff(buffs, buffId, name)`, `addBuffRow(buffs, buffId)`, `setBuffRow(buffs, buffId, index, patch)`, `removeBuffRow(buffs, buffId, index)` — each returns a new `Buff[]` and never mutates its input.
  - Types: `Buff = {id: string, name: string, rows: BuffRow[]}`, `BuffRow = {modtype: string, mod: string, value: number}`.

- [ ] **Step 1: Write the failing tests**

```js
test("only row types a buff can hold are offered in its picker", () => {
  const all = { Stat: { value: "Stat" }, "Skill Boost": { value: "Skill Boost" },
    "Roll Modifiers": { value: "Roll Modifiers" }, "Career Skill": { value: "Career Skill" } };
  assert.deepEqual(Object.keys(buffModifierTypes(all)), ["Skill Boost", "Roll Modifiers"]);
});
test("a new buff has an id, no name and no rows", () => {
  const b = newBuff();
  assert.equal(typeof b.id, "string"); assert.ok(b.id.length > 0);
  assert.deepEqual({ name: b.name, rows: b.rows }, { name: "", rows: [] });
});
test("a new row starts as one Add Boost", () => {
  const [b] = addBuff([]);
  assert.deepEqual(addBuffRow([b], b.id)[0].rows, [{ modtype: "Roll Modifiers", mod: "Add Boost", value: 1 }]);
});
test("editing returns a new list and leaves the old one as it was", () => {
  const before = [{ id: "a", name: "Hutt contacts", rows: [] }];
  const snapshot = structuredClone(before);
  renameBuff(before, "a", "Changed"); addBuffRow(before, "a"); removeBuff(before, "a");
  assert.deepEqual(before, snapshot);
});
test("rename, remove and row edits touch only their target", () => {
  const list = [{ id: "a", name: "A", rows: [{ modtype: "Skill Boost", mod: "Charm", value: 1 },
    { modtype: "Skill Setback", mod: "Charm", value: 1 }] }, { id: "b", name: "B", rows: [] }];
  assert.deepEqual(renameBuff(list, "a", "Hood up").map((b) => b.name), ["Hood up", "B"]);
  assert.deepEqual(removeBuff(list, "a").map((b) => b.id), ["b"]);
  assert.deepEqual(removeBuffRow(list, "a", 0)[0].rows, [{ modtype: "Skill Setback", mod: "Charm", value: 1 }]);
  assert.deepEqual(setBuffRow(list, "a", 1, { mod: "Deception" })[0].rows[1],
    { modtype: "Skill Setback", mod: "Deception", value: 1 });
});
test("a row's value is kept a whole number", () => {
  const list = [{ id: "a", name: "", rows: [{ modtype: "Skill Boost", mod: "Charm", value: 1 }] }];
  assert.equal(setBuffRow(list, "a", 0, { value: "2" })[0].rows[0].value, 2);
  assert.equal(setBuffRow(list, "a", 0, { value: "abc" })[0].rows[0].value, 0);
});
test("stored data that a buff can't hold is dropped, not thrown on", () => {
  assert.deepEqual(cleanBuffs(undefined), []);
  assert.deepEqual(cleanBuffs({ not: "an array" }), []);
  const [b] = cleanBuffs([{ name: 7, rows: [{ modtype: "Stat", mod: "Wounds", value: 1 },
    { modtype: "Skill Boost", mod: "Charm", value: "1" }, null] }, "junk"]);
  assert.equal(typeof b.id, "string"); assert.equal(b.name, "");
  assert.deepEqual(b.rows, [{ modtype: "Skill Boost", mod: "Charm", value: 1 }]);
});
```

Import from `"../../modules/helpers/optional-buffs.js"` and the stub (`"./_stub/foundry-stub.mjs"`) for `foundry.utils.randomID`.

- [ ] **Step 2: Run to see it fail**

Run: `node --test tests/node/optional-buffs.test.mjs`
Expected: FAIL, `Cannot find module …optional-buffs.js`.

- [ ] **Step 3: Implement `modules/helpers/optional-buffs.js`**

Ids come from `foundry.utils.randomID()`. `cleanBuffs` keeps array entries that are objects, gives a missing or non-string `id` a new one, turns a non-string `name` into `""`, keeps only rows that are objects whose `modtype` is in `BUFF_MODTYPES`, and coerces `mod` to a string and `value` with `parseInt(…, 10) || 0`. The edit functions run `cleanBuffs` on their input first, so a sheet can hand them stored data as it is.

- [ ] **Step 4: Run to see it pass**

Run: `node --test tests/node/optional-buffs.test.mjs` — Expected: PASS (7 tests). Then `npm test` and `npm run check:imports` — both pass.

- [ ] **Step 5: Commit** — `git add modules/helpers/optional-buffs.js tests/node/optional-buffs.test.mjs`, message "Add the optional buff list rules".

---

### Task 2: Which buffs a roll offers

**Files:**
- Create: `modules/helpers/optional-buffs-offer.js`
- Test: `tests/node/optional-buffs-offer.test.mjs`

**Interfaces:**
- Consumes: `cleanBuffs`, `isSkillModtype` (Task 1).
- Produces:
  - `isCarried(item): boolean` — `item?.flags?.starwarsffg?.carried !== false`.
  - `collectOfferedBuffs({items, skillKey, weaponId, isForcePower}): OfferedBuff[]`. `items` is the actor's items (Documents or plain objects with `id|_id, name, type, system, flags`); `skillKey` is a skill key such as `"Charm"` or `null`; `weaponId` is the id of the weapon making the attack or `null`.
  - `withAppliedBuffs(offered: OfferedBuff[], applied: {key, name}[]): OfferedBuff[]`.
  - `OfferedBuff = {key: string, name: string, source: string, rows: BuffRow[], applied?: boolean}`. `rows` hold only the rows that apply to this roll, with `value` already multiplied (see below); `source` is the item's name (the talent's name for talents).

Rules to implement (from the spec, "Which items count", "Which buffs a roll offers", "How many times a row counts"):

| Source | Counts when | Skill rows | Roll / Dice / Result rows | Multiplier |
| --- | --- | --- | --- | --- |
| weapon | `isCarried` | if `row.mod === skillKey` | only if this weapon is `weaponId` | skill rows × quantity; attack rows × 1 |
| armour | `system.equippable.equipped` | if `row.mod === skillKey` | always | × quantity |
| gear | `isCarried` | if `row.mod === skillKey` | always | × quantity |
| attachment in `weapon.system.itemattachment[]` | its weapon counts | as weapon | only if its weapon is `weaponId` | as its weapon |
| attachment in `armour.system.itemattachment[]` | its armour counts | as armour | always | as its armour |
| talent item | always | if `row.mod === skillKey` | always | × `system.ranks.current` when `system.ranks.ranked`, else × 1 |
| specialization tree node (`spec.system.talents[k]` with `islearned === true`) | always | as talent | always | × 1 per learned node |

- Quantity is `Number(system.quantity.value)`, treated as 1 when missing or below 1.
- Talents are grouped by talent name (case-insensitive) and buff id, across talent items and tree nodes: one offered buff whose multiplier is the sum of contributions, except an unranked talent counts 1 however often it appears (`isRanked` on a node, `ranks.ranked` on an item).
- Keys: `"<itemId>:<buffId>"`, `"<itemId>:<attachmentId>:<buffId>"`, `"talent:<lower-case talent name>:<buffId>"`.
- `isForcePower` → `[]`. A buff with no applicable rows is not offered.
- `withAppliedBuffs` marks offered buffs whose key is in `applied` with `applied: true`, then appends `{key, name, source: "", rows: [], applied: true}` for applied keys with no offered match, in `applied` order.

- [ ] **Step 1: Write the failing tests**

Build fixtures with a small `item(type, {id, name, buffs, equipped, carried, quantity, attachments, ranks})` helper in the test file. One test per line below, each asserting with literal keys and values:

```js
test("a skill row is offered only on rolls of its skill")          // Skill Boost Charm 1 on gear: offered for "Charm", [] for "Stealth"
test("a weapon's attack rows count only on its own attack, once")  // quantity 2: weaponId match → value 1; other weaponId → not offered
test("a weapon's skill rows count by quantity, equipped or not")   // equipped:false quantity 2, Skill Boost Charm 1 → value 2
test("a weapon or gear marked not carried offers nothing")         // carried:false, including an attachment on that weapon
test("armour offers its buffs only while equipped")                // equipped:false → []; equipped, Roll Modifiers Add Boost 1, quantity 1 → offered on any skill
test("gear rows count by quantity")                                // quantity 3, Skill Boost Stealth 1 → value 3
test("a weapon attachment's attack rows follow its weapon")        // offered with weaponId = parent id, key "w1:att1:b1"; not offered for another weapon
test("an armour attachment's roll rows count while the armour is equipped")
test("a ranked talent's rows count by its ranks, an unranked talent's once")  // ranks {ranked:true,current:2} → 2; ranked:false current:3 → 1
test("a talent learned twice in trees is one buff counted twice")  // two learned nodes, isRanked, same buff id → one entry, value 2, key "talent:grit:b1"
test("unlearned tree nodes offer nothing")
test("a Force power roll offers nothing")
test("a buff with no row that applies is not offered")
test("buffs the GM already ticked are marked applied, and unknown ones still listed")
  // withAppliedBuffs([{key:"g1:b1",…}], [{key:"g1:b1",name:"A"},{key:"x:y",name:"Elsewhere"}])
  // → [{key:"g1:b1",…,applied:true},{key:"x:y",name:"Elsewhere",source:"",rows:[],applied:true}]
```

- [ ] **Step 2: Run to see it fail** — `node --test tests/node/optional-buffs-offer.test.mjs`, Expected: FAIL (module missing).
- [ ] **Step 3: Implement `modules/helpers/optional-buffs-offer.js`** per the table and rules above. Read buffs with `cleanBuffs` everywhere, including tree nodes (`node.optionalBuffs`) and attachment copies (`attachment.system.optionalBuffs`).
- [ ] **Step 4: Run to see it pass** — the file passes (14 tests); `npm test` and `npm run check:imports` pass.
- [ ] **Step 5: Commit** — "Decide which optional buffs a roll offers".

---

### Task 3: What ticked buffs do to the pool

**Files:**
- Create: `modules/dice/optional-buff-pool.js`
- Test: `tests/node/optional-buff-pool.test.mjs`

**Interfaces:**
- Consumes: `OfferedBuff` (Task 2); `DicePoolFFG` imported from `./pool.js` (loads in Node without the stub).
- Produces: `applyOfferedBuffs(pool: DicePoolFFG, buffs: OfferedBuff[], {characteristic = null, rank = null} = {}): DicePoolFFG` — a new pool; `pool` is not changed.

Order of application, so it matches `DiceHelpers.rollSkill` then `ModifierHelpers.getDicePoolModifiers`:
1. **Skill Rank**: sum N over all rows. Skip when N is 0 or `characteristic`/`rank` is null. Otherwise build the positive dice twice the way `rollSkill` does (`dice-helpers.js:89,106`: `ability = max(c, r)`, then `upgrade(min(c, r) + u)` with `u = Number(pool.upgrades) || 0`), for `r = rank` and `r = rank + N`, and add the differences in `ability` and `proficiency` to the pool.
2. **Counts**: Skill Boost → `boost`; Skill Setback → `setback`; Skill Remove Setback → `remsetback`; Skill Add Success/Advantage/Triumph/Light/Failure/Threat/Despair/Dark → that field; Roll Modifiers `Add Boost`/`Add Setback`/`Remove Setback` → `boost`/`setback`/`remsetback`; Result Modifiers `Add <X>` → field `<x>`; Dice Modifiers `Add Difficulty` → `difficulty`.
3. **Ability upgrades**: Skill Add Upgrade and Dice Modifiers `Upgrade Ability` → `upgrade(v)`; `Downgrade Ability` → `upgrade(-v)`.
4. **Difficulty upgrades**: `Upgrade Difficulty` → `upgradeDifficulty(v)`; `Downgrade Difficulty` → `upgradeDifficulty(-v)`.
5. Clamp every die and symbol count at 0.

- [ ] **Step 1: Write the failing tests**

```js
const offered = (rows) => [{ key: "k", name: "B", source: "S", rows }];
const row = (modtype, mod, value) => ({ modtype, mod, value });
for (const [r, field, want] of [
  [row("Skill Boost", "Charm", 2), "boost", 2],
  [row("Skill Remove Setback", "Charm", 1), "remsetback", 1],
  [row("Skill Add Advantage", "Charm", 1), "advantage", 1],
  [row("Roll Modifiers", "Add Setback", 1), "setback", 1],
  [row("Result Modifiers", "Add Triumph", 1), "triumph", 1],
  [row("Dice Modifiers", "Add Difficulty", 1), "difficulty", 3],
]) test(`${r.modtype} ${r.mod} adds to ${field}`, () => {
  assert.equal(applyOfferedBuffs(new DicePoolFFG({ ability: 2, difficulty: 2 }), offered([r]))[field], want);
});
test("Skill Add Upgrade upgrades an ability die", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2 }), offered([row("Skill Add Upgrade", "Charm", 1)]));
  assert.deepEqual([p.ability, p.proficiency], [1, 1]);
});
test("Upgrade Difficulty upgrades a difficulty die", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ difficulty: 2 }), offered([row("Dice Modifiers", "Upgrade Difficulty", 1)]));
  assert.deepEqual([p.difficulty, p.challenge], [1, 1]);
});
test("a rank below the characteristic turns an ability die into proficiency", () => {
  // characteristic 3, rank 1: 2 ability + 1 proficiency; rank 2: 1 ability + 2 proficiency
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2, proficiency: 1, boost: 1 }),
    offered([row("Skill Rank", "Charm", 1)]), { characteristic: 3, rank: 1 });
  assert.deepEqual([p.ability, p.proficiency, p.boost], [1, 2, 1]);
});
test("a rank at the characteristic adds an ability die", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ proficiency: 2 }),
    offered([row("Skill Rank", "Charm", 1)]), { characteristic: 2, rank: 2 });
  assert.deepEqual([p.ability, p.proficiency], [1, 2]);
});
test("Skill Rank does nothing when the characteristic is unknown", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 2 }), offered([row("Skill Rank", "Charm", 1)]));
  assert.deepEqual([p.ability, p.proficiency], [2, 0]);
});
test("downgrades never leave a negative count", () => {
  const p = applyOfferedBuffs(new DicePoolFFG({ ability: 1, difficulty: 1 }),
    offered([row("Dice Modifiers", "Downgrade Ability", 5), row("Dice Modifiers", "Downgrade Difficulty", 5)]));
  for (const f of ["ability", "proficiency", "difficulty", "challenge"]) assert.ok(p[f] >= 0, f);
});
test("the pool given is left as it was", () => {
  const base = new DicePoolFFG({ ability: 2 });
  applyOfferedBuffs(base, offered([row("Skill Boost", "Charm", 1), row("Skill Add Upgrade", "Charm", 1)]));
  assert.deepEqual([base.ability, base.proficiency, base.boost], [2, 0, 0]);
});
```

- [ ] **Step 2: Run to see it fail** — `node --test tests/node/optional-buff-pool.test.mjs`, Expected: FAIL (module missing).
- [ ] **Step 3: Implement `applyOfferedBuffs`** in `modules/dice/optional-buff-pool.js`, cloning with `new DicePoolFFG(pool)` and following the five-step order above.
- [ ] **Step 4: Run to see it pass**, then `npm test` and `npm run check:imports`.
- [ ] **Step 5: Commit** — "Apply ticked optional buffs to a dice pool".

---

### Task 4: Store buffs and edit them on the classic item sheets

**Files:**
- Modify: `modules/data/item-templates.js` (new export `OptionalBuffsTemplate`)
- Modify: the `mix(...)` lists in `modules/data/models/item/weapon.js:25-33`, `armour.js:17-25`, `gear.js:13-19`, `talent.js:11`, `itemattachment.js:15-22` (append `OptionalBuffsTemplate`)
- Create: `templates/parts/shared/ffg-optional-buffs.html`
- Modify: `templates/items/ffg-weapon-sheet.html:125`, `ffg-armour-sheet.html:119`, `ffg-gear-sheet.html:65`, `ffg-talent-sheet.html:45`, `ffg-itemattachment-sheet.html:71` (include the new partial right after the `ffg-modifiers.html` include)
- Modify: `modules/items/item-sheet-ffg.js` (`getData` near `:730`; new `_activateOptionalBuffListeners(html)` called after the editable gate at `:1252`; `_onDropTalentToSpecialization` copy at `:2484-2488`)
- Modify: `modules/helpers/partial-templates.js` (preload the partial)
- Modify: `lang/en.json`, `styles/mandar.css` (next to the modifiers block at `:3958-4042`)
- Create: `tests/optional-buffs.test.js`; Modify: `tests/ffg-tests.js:71-81` (register `["OptionalBuffsTests", () => import("./optional-buffs.test.js")]`)

**Interfaces:**
- Consumes: Task 1's edit functions, `cleanBuffs`, `buffModifierTypes`, `BUFF_ITEM_TYPES`.
- Produces:
  - `system.optionalBuffs` on the five item types: `ArrayField(new f.ObjectField())`, initial `[]`.
  - Tree slots carry `optionalBuffs` (the slot is an untyped `ObjectField`, so no schema change; an array replaces wholesale on re-drop).
  - Attachments need no copy code: installing one duplicates its whole document into `system.itemattachment` (`item-sheet-ffg.js:2542`), buffs included. As with modifiers today, a talent already in a tree or an attachment already installed keeps the buffs it had when it was dropped or installed.
  - The partial `templates/parts/shared/ffg-optional-buffs.html`, whose context is `optionalBuffs: Buff[]`, `buffModifierTypes`, `modifierChoices`, `showOptionalBuffs: boolean`.
  - `ItemSheetFFG#_activateOptionalBuffListeners(html)`, which Codex inherits (Task 6).

Markup rules for the partial (they keep the existing modifier handlers off it, `item-sheet-ffg.js:1274,1277,1291` and the attachment handlers at `:1255-1258`):
- Wrapper `<section class="optional-buffs">`, shown only when `showOptionalBuffs`.
- Each buff: `.optional-buff[data-buff-id]` with `input.optional-buff-name`, `a.optional-buff-control[data-action="add-row"]` and `[data-action="delete"]`.
- Each row: `.optional-buff-row[data-row-index]` with `select.optional-buff-modtype`, `select.optional-buff-mod`, `input.optional-buff-value`, and `a.optional-buff-control[data-action="delete-row"]`.
- A header `a.optional-buff-control[data-action="create"]`.
- **No `name` attribute on any input or select** (the form submit must not pick them up), and none of the classes `attribute*`, `flat_editor`, `modtype`, `mod`, `add-mod`, `dropdown`.
- An unnamed buff's input shows the placeholder `SWFFG.OptionalBuffs.NamePlaceholder`.

Listener rules:
- Every control builds the next list with Task 1's functions from `cleanBuffs(this.item.system.optionalBuffs)` and saves it with `this.item.update({"system.optionalBuffs": next})`.
- Change events inside `.optional-buffs` call `event.stopPropagation()`.
- Before saving, honour Edit Mode exactly as `ModifierHelpers.onClickAttributeControl` does (`modifiers.js:250`).
- On a modtype change, set `mod` to the first `value` of `modifierChoices[modtype]` (cache the context's `modifierChoices` on the sheet in `getData`).
- `showOptionalBuffs` is `BUFF_ITEM_TYPES.includes(this.item.type)`.

Lang keys:
- `SWFFG.OptionalBuffs.Title` "Optional buffs"
- `.Add` "Add buff"
- `.NamePlaceholder` "Buff name, shown in the roll dialog"
- `.AddRow` "Add row"
- `.Delete` "Delete buff"
- `.DeleteRow` "Delete row"
- `.Unnamed` "Unnamed buff"

- [ ] **Step 1: Write the failing Foundry-tier suite** `tests/optional-buffs.test.js`, exporting `OptionalBuffsTests(suite, suiteInstance, Test, chai, harness)`:
  - "a weapon keeps its optional buffs through an update": create a weapon with `system.optionalBuffs: [{id:"b1", name:"Hood up", rows:[{modtype:"Skill Boost", mod:"Stealth", value:1}]}]`, update its name, and expect `item.system.optionalBuffs` to deep-equal what was given.
  - "the same holds for armour, gear, talent and itemattachment": table over the four types.
  - "a talent dropped into a specialization brings its buffs":
    1. Create a talent with one buff, and a specialization.
    2. Render the specialization's sheet and take its `.specialization-talent` element whose `id` is `talent0`.
    3. Call `await spec.sheet._onDropTalentToSpecialization({ currentTarget: li, dataTransfer: { getData: () => JSON.stringify({ type: "Item", uuid: talent.uuid }) }, preventDefault() {}, stopPropagation() {} })`. This is the handler bound at `item-sheet-ffg.js:1338-1343`; it reads `event.currentTarget` and `event.dataTransfer` only.
    4. Wait for `spec.system.talents.talent0.optionalBuffs` to deep-equal the talent's.
- [ ] **Step 2: Run it to see it fail**: `FFG_TEST_GREP="Optional buffs" npm run test:foundry -- functional`, against the `test` world (see `tests/README.md`). Expected: the persistence tests fail (`optionalBuffs` stripped to `undefined`). If no test world can be started, record that and continue: Step 6 still checks it by hand.
- [ ] **Step 3: Add `OptionalBuffsTemplate`** and append it to the five `mix` lists.
- [ ] **Step 4: Add the partial, the includes, the preload entry, `getData` context, `_activateOptionalBuffListeners`, the drop copy (`optionalBuffs: foundry.utils.deepClone(cleanBuffs(<dropped talent>.system.optionalBuffs))` next to `attributes`), the lang keys and the CSS.**
- [ ] **Step 5: Run the suite again** — it passes. `npm test` and `npm run check:imports` pass.
- [ ] **Step 6: Check by hand in Foundry** on a weapon, an armour, a gear, a talent and an attachment sheet:
  - add a buff, name it, add two rows, change a modtype (the target list follows), set values, delete a row, delete a buff, and reload; everything is kept;
  - on a read-only sheet (an Observer, or a locked compendium) the block shows but changes nothing;
  - the Modifiers list above still adds and deletes ordinary rows, and buff rows never appear there or as Active Effects.
- [ ] **Step 7: Commit** — "Store optional buffs and edit them on the classic item sheets".

---

### Task 5: Offer buffs in the roll dialog and name them on the card

**Files:**
- Create: `modules/dice/roll-actor.js`; Test: `tests/node/roll-actor.test.mjs`
- Modify: `modules/helpers/dice-helpers.js` (`rollSkill` open at `:117`, `rollItem` at `:237-274`, `rollSkillDirect` at `:277-300`: add `skillKey`, `characteristic`, `rank` to `rollOptions`)
- Modify: `modules/dice/roll-builder.js` (constructor `:13-44`; `_prepareContext` `:141-222`; `_onRender` listener; `_effectivePool` `:700-714`; Roll handler snapshot `:298-300`, send-to-player `:384-385`, card `:414-421`)
- Modify: `templates/dice/roll-options-ffg.html` (new section after the dice table ending at `:138`, before the Options `<details>` at `:139`)
- Modify: `modules/swffg-main.js:1700-1704` (forward `appliedBuffs`, `skillKey`, `characteristic`, `rank`)
- Modify: `modules/dice/roll.js` (`optionalBuffsText` at the five `defenceZoneText` points: `:281`, `:285`, `:414`, `:428`) and `templates/dice/roll-ffg.html:7-11`
- Modify: `lang/en.json`, `styles/mandar.css`

**Interfaces:**
- Consumes: `collectOfferedBuffs`, `withAppliedBuffs` (Task 2); `applyOfferedBuffs` (Task 3).
- Produces:
  - `rollActorFrom({data, item}, lookupWorldActor): Actor|null` in `modules/dice/roll-actor.js`. The first match wins: `data.document` when `data.document?.documentName === "Actor"`, then `item?.actor`, then `data.token?.actor`, then `lookupWorldActor(data.actor?._id)`, else `null`.
  - `rollOptions` fields `skillKey: string|null`, `characteristic: number|null`, `rank: number|null`, `appliedBuffs: {key, name}[]`, stored on `this.roll` under the same names.
  - `RollFFG#optionalBuffsText: string|null`.
- Lang keys:
  - `SWFFG.OptionalBuffs.DialogTitle` "Optional buffs"
  - `.From` "from {source}"
  - `.AlreadyApplied` "Already in this pool"
  - `.CardLine` "Optional buffs: {names}"

Builder rules:
- In the constructor, offered = `withAppliedBuffs(collectOfferedBuffs({items: actor.items.contents ?? [], skillKey, weaponId, isForcePower}), this.roll.appliedBuffs)`. Here:
  - `actor = rollActorFrom(...)`;
  - `weaponId` is `item.id ?? item._id` when the item is a `weapon` (a sent pool carries a plain object);
  - `isForcePower = this.roll.item?.type === "forcepower"`.
- Ticked keys live in a `Set` on the dialog and start empty. Applied entries render checked and disabled, and are never fed to `applyOfferedBuffs` (they are already in the pool).
- In `_effectivePool`, when any key is ticked, start from `applyOfferedBuffs(this._clonePool(), tickedBuffs, {characteristic, rank})` and layer defence and Adversary on that, as today. The live `this.dicePool` is never modified by buffs. `_initializeInputs` keeps showing the base counts, as it does for defence.
- A checkbox change updates the set and calls `this._updatePreview(html)`.
- On Roll, snapshot the ticked buffs with the other snapshots at `:298-300`. The card line names applied plus ticked buffs, `game.i18n.format("SWFFG.OptionalBuffs.CardLine", {names})`, or is `null` when there are none.
- When sending the pool, `this.roll.appliedBuffs` = applied plus ticked, as `{key, name}`.
- A buff with an empty name shows `SWFFG.OptionalBuffs.Unnamed`.

- [ ] **Step 1: Write the failing `rollActorFrom` tests**

```js
const actor = (id) => ({ documentName: "Actor", id });
test("a sheet's live actor is used first, so an unlinked token's own actor is read", () => {
  assert.equal(rollActorFrom({ data: { document: actor("token-copy"), actor: { _id: "world" } } }, () => actor("world")).id, "token-copy");
});
test("an item's owner is used when the data has no live actor", () => {
  assert.equal(rollActorFrom({ data: { actor: { _id: "world" } }, item: { actor: actor("owner") } }, () => actor("world")).id, "owner");
});
test("a token's actor comes before the world actor", () => {
  assert.equal(rollActorFrom({ data: { token: { actor: actor("tok") }, actor: { _id: "world" } } }, () => actor("world")).id, "tok");
});
test("a sent pool's plain data falls back to the world actor", () => {
  assert.equal(rollActorFrom({ data: { document: { _id: "x" }, actor: { _id: "world" } } }, (id) => actor(id)).id, "world");
});
test("no actor anywhere gives null", () => {
  assert.equal(rollActorFrom({ data: {} }, () => undefined), null);
});
```

- [ ] **Step 2: Run to see it fail** — `node --test tests/node/roll-actor.test.mjs`, FAIL (module missing).
- [ ] **Step 3: Implement `rollActorFrom`**; run the file to see it pass.
- [ ] **Step 4: Wire the dialog, entry points, forwarding, card, lang and CSS** per the builder rules. `tests/node/system-windows-codex-free.test.mjs` must still pass: no `codex` or `cdx-dice` text in `roll-builder.js`.
- [ ] **Step 5: Run `npm test` and `npm run check:imports`** — both pass.
- [ ] **Step 6: Check by hand in Foundry**, with the Task 4 buffs on a character:
  - a Charm roll from the sheet offers the gear's Charm buff and the equipped armour's Roll buff, but not an unequipped armour's;
  - an attack with the weapon offers its attack buff, and an attack with another weapon does not;
  - ticking moves the preview and the simulation, and unticking puts them back, also after hand-adding a boost die;
  - the roll posts with the "Optional buffs: …" line;
  - a Force power roll offers none;
  - on an unlinked token whose items differ from its world actor, the token's buffs are offered;
  - as GM, tick a buff and send the pool to a player: their dialog shows it checked and locked, offers the rest, and the card names both;
  - a buff with no name shows as "Unnamed buff";
  - a talent dropped into a specialization tree and learned offers its buff.
- [ ] **Step 7: Commit** — "Offer optional buffs in the roll dialog and name them on the card".

---

### Task 6: Optional buffs editor on the Codex II item sheets

**Files:**
- Modify: `codex/templates/items/codex-weapon.html:81`, `codex-armour.html:54`, `codex-gear.html:46`, `codex-talent.html:42`, `codex-itemattachment.html:52-55` (include `systems/starwarsffg/templates/parts/shared/ffg-optional-buffs.html` after the `ffg-modifiers.html` include, inside the `cdx-pane attributes` section)
- Modify: `codex/styles/cdx.css` (`.cdx .optional-buffs …` next to the modifiers pane rules at `:1060-1065`, `:1752`; check each scheme file for colours that need a matching rule)
- Modify: `tests/node/public-api-surface.test.mjs` (`SHARED_PARTIALS` gains the partial; `SURFACE["modules/items/item-sheet-ffg.js"]`, creating the key if absent, gains `"_activateOptionalBuffListeners("`)
- Modify: `modules/api/public-api.js:33` (`PUBLIC_API_VERSION = 2`, with a line in its header saying v2 adds the optional buffs partial and listeners) and `codex/scripts/api-check.js:7` (`REQUIRED_API_VERSION = 2`)

**Interfaces:**
- Consumes: the partial and `_activateOptionalBuffListeners` from Task 4. `CodexItemSheet` already calls `super.getData` (`codex-item-sheet.js:102`) and `super.activateListeners` (`:153`), so the context and the listeners arrive with no Codex script change.

- [ ] **Step 1: Add the partial and the needle to `public-api-surface.test.mjs`, and the include to one Codex template.** Run `npm test`. Expected: PASS for the surface test, since Task 4 already made and preloaded the partial; `codex/tests/node/asset-paths.test.mjs` passes, since the include resolves. If either fails, fix the path before going on.
- [ ] **Step 2: Add the include to the other four Codex templates, the Codex CSS and the version bump.** Run `npm test` and `npm run check:imports`. Both pass, including `public-api.test.mjs` and `codex-boundary.test.mjs`.
- [ ] **Step 3: Check by hand in Foundry** with Codex II as the item sheet theme, on all five types and in at least two schemes (one light, one dark):
  - add, rename, add a row, change a modtype, delete a row, delete a buff, reload: all kept;
  - the block reads in Codex style;
  - Codex's own modifier rows still work.
- [ ] **Step 4: Commit** — "Edit optional buffs on the Codex II item sheets".

---

### Task 7: Carried toggle on the classic actor sheet

**Files:**
- Modify: `templates/parts/actor/ffg-weapon-armor-gear.html`:
  - weapons: header `:4-13`, row next to the equip toggle `:29-35`;
  - armour: header `:50-58`, row `:72-77`;
  - gear: header `:93-100`, row controls `:128-131`.
- Modify: `modules/actors/actor-sheet-ffg.js` (handler next to the equip toggle at `:990-1000`, after the editable gate at `:734`)
- Modify: `lang/en.json`, `styles/mandar.css` (next to `.toggle-equipped` at `:2905-2911`)

**Interfaces:**
- Consumes: `isCarried` (Task 2) for the template's state through a context flag, or the same test inline in Handlebars: `(eq item.flags.starwarsffg.carried false)`.
- Produces: an `a.item-carried-toggle` control writing `flags.starwarsffg.carried`. Use that class, **not** `toggle-carried`: Codex cards inherit `ActorSheetFFG.activateListeners` and already bind `.toggle-carried` themselves (`codex/scripts/codex-sheets.js:735-746`), so reusing the class would flip the flag twice per click.
- Lang keys:
  - `SWFFG.Carried` "Carried"
  - `SWFFG.CarriedHint` "Carried: counts toward encumbrance and offers its optional buffs. Untick for items left on the ship or at base."

- [ ] **Step 1: Write the failing Foundry-tier test** in `tests/optional-buffs.test.js`: "the classic carried toggle flips the flag once". Render a character's classic sheet with one gear item, click `.item-carried-toggle`, wait for the update, and expect `item.flags.starwarsffg.carried === false`. Click again and expect `true`.
- [ ] **Step 2: Run it** — `FFG_TEST_GREP="Optional buffs" npm run test:foundry -- functional` — Expected: FAIL (no such control). If no test world is available, note it and rely on Step 5.
- [ ] **Step 3: Add the column, the handler (Edit Mode guard as at `:990-1000`, then `item.setFlag("starwarsffg", "carried", !isCarried(item))`), the lang keys and the CSS.**
- [ ] **Step 4: Run the suite** — passes; `npm test` passes.
- [ ] **Step 5: Check by hand in Foundry**:
  - on the classic character, nemesis, rival and minion sheets, untick carried on a gear item: encumbrance drops, and the same item shows not carried on the Codex sheet;
  - tick it on the Codex sheet: the classic sheet follows;
  - one click flips it once on both sheets;
  - a not-carried weapon's buffs are no longer offered in the roll dialog.
- [ ] **Step 6: Commit** — "Add the carried toggle to the classic actor sheet".

---

### Task 8: Changelog and wiki

**Files:**
- Modify: `CHANGELOG.md` (top of `Unreleased`)
- Wiki clone (`https://github.com/YeNov/StarWarsFFG.wiki.git`, YeNov identity):
  - `Tutorial-09-Changing-a-roll-before-and-after.md`
  - `Tutorial-06-Edit-Mode-and-Active-Effects.md`
  - the chapter that covers inventory and encumbrance (`Tutorial-16-More-worth-knowing.md` if no better fit)
  - `images/`

- [ ] **Step 1: Write two `Added` entries**:
  - optional buffs: what they are, where they're edited (both sheet styles), that the player ticks them per roll and the card names them;
  - the classic carried toggle: that it now exists on the classic sheet as well, and that not-carried weapons and gear leave encumbrance and offer no buffs.
  One or two lines each, in user terms.
- [ ] **Step 2: Update the three wiki chapters** with a short section each, and take WebP screenshots of the classic buff block, the Codex buff block, the roll dialog section and the classic carried toggle. The PNG masters go in `docs/tutorial-shots/`, which is not tracked.
- [ ] **Step 3: Commit the changelog** in this repo ("Describe optional buffs and the classic carried toggle"). Commit the wiki on a local branch; it is pushed only with the user's go-ahead, once the release ships.
