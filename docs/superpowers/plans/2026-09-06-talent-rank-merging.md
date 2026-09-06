# Talent Rank Merging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adding a talent an actor already has raises that talent's rank on the existing item instead of creating a second item, and removing ranks gives back exactly what was added.

**Architecture:** All decisions live in one pure module, `modules/helpers/talent-stacking.js`, unit-tested under node. Foundry wiring is thin: `ItemFFG._preCreate` cancels a duplicate create and increments instead, `ActorFFG._preCreateDescendantDocuments` folds duplicates inside one batch, and the two removal paths (XP refund, species removal) revoke ranks through the same module. A GM-callable repair merges duplicates that already exist.

**Tech Stack:** Foundry VTT v13 (ApplicationV2 era), ES modules, `node --test` (`npm test`), Handlebars templates, no build step for JS.

**Spec:** `docs/superpowers/specs/2026-09-06-talent-rank-merging-design.md`

## Global Constraints

- Branch: `talent-rank-merging`, off `main`. Do not push or open a PR without a `CHANGELOG.md` entry (repo `CLAUDE.md` treats a missing entry as unfinished work).
- GitHub write actions only in the `YeNov/StarWarsFFG` fork, as the `YeNov` gh account (`gh auth switch --user YeNov` before pushing, back to `yehornovakov` after).
- Never run `gulp css` / `npm run compile`. `styles/*.css` are hand-maintained; this plan touches no CSS.
- Tests: `npm test` runs `node --test "tests/node/**/*.test.mjs"`. Baseline before this plan: **567 pass / 0 fail**. Every task must leave that suite green.
- `npm run check:imports` must stay PASS. New modules must be importable under node — no Foundry globals at module scope in `modules/helpers/talent-stacking.js`.
- Commit after every task. Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Rank semantics used everywhere: a ranked talent whose `system.ranks.current` is `null`, absent or unparseable counts as **1**, matching `ModifierHelpers.rankMultiplier` (`modules/helpers/modifiers.js:651`). Never treat a cleared rank as 0.
- Talent identity is the **trimmed, case-sensitive** name.
- Return shapes refine the sketch in the spec's §6; the signatures in this plan are authoritative.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `modules/helpers/talent-stacking.js` (create) | Pure planning: grant, batch collapse, revoke, duplicate repair. No Foundry globals. |
| `tests/node/talent-stacking.test.mjs` (create) | Unit tests for all four planners. |
| `modules/items/item-ffg.js` (modify, `_preCreate` ~line 36) | Cancel a duplicate talent create; increment the existing item instead. |
| `modules/actors/actor-ffg.js` (modify, after `_preCreate` ~line 57) | `_preCreateDescendantDocuments` folds duplicates within one create batch. |
| `modules/actors/actor-sheet-ffg.js` (modify, ~2150 refund, ~2810 buy) | Log a `talent-rank` undo for a merged purchase; refund it by decrementing. |
| `modules/helpers/xp-refund.js` (modify) | Resolve the new `talent-rank` undo descriptor. |
| `modules/swffg-main.js` (modify, ~1986 create hook, ~2050 delete hook, ~1665 registration) | Species grants carry provenance; species removal revokes ranks; register the repair helper. |
| `modules/helpers/item-helpers.js` (modify, after `repairCareerSkillEffects` ~line 713) | `repairDuplicateTalents({dryRun})`. |
| `lang/en.json` (modify) | Two new strings. |
| `CHANGELOG.md` (modify) | User-facing entry. |

---

### Task 1: Grant planning and batch collapse

**Files:**
- Create: `modules/helpers/talent-stacking.js`
- Test: `tests/node/talent-stacking.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `talentName(value: unknown): string` — trimmed name, `""` when unusable.
  - `talentRanks(item: object): number` — current ranks of a talent (item document or plain create data), minimum 1.
  - `planTalentGrant(existingTalents: object[], incoming: object): {action: "create"} | {action: "increment", itemId: string|null, ranks: number, total: number} | {action: "refuse", reason: "not-ranked", itemId: string|null}`
  - `collapseTalentBatch(entries: object[]): object[]` — new array, new objects for anything it changes; non-talent entries pass through untouched.

- [ ] **Step 1: Write the failing tests**

Create `tests/node/talent-stacking.test.mjs`:

```javascript
/**
 * Talents stack as ranks on one item, never as duplicate items.
 * See docs/superpowers/specs/2026-09-06-talent-rank-merging-design.md.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  talentName,
  talentRanks,
  planTalentGrant,
  collapseTalentBatch,
} from "../../modules/helpers/talent-stacking.js";

/** A talent as it appears on an actor (document-like) or in create data. */
const talent = (name, { id = null, ranked = true, current = 1, tier = 1, flags } = {}) => ({
  _id: id,
  id,
  name,
  type: "talent",
  system: { ranks: { ranked, current }, tier },
  flags: flags ?? {},
});

test("a talent's rank floors at 1 when it is null, missing or unparseable", () => {
  assert.equal(talentRanks(talent("Grit", { current: 3 })), 3);
  assert.equal(talentRanks(talent("Grit", { current: null })), 1);
  assert.equal(talentRanks(talent("Grit", { current: "x" })), 1);
  assert.equal(talentRanks({ name: "Grit", type: "talent", system: {} }), 1);
});

test("names are compared trimmed and case-sensitively", () => {
  assert.equal(talentName("  Grit "), "Grit");
  assert.equal(talentName(42), "");
  const plan = planTalentGrant([talent("Grit", { id: "a" })], talent(" Grit "));
  assert.equal(plan.action, "increment");
  assert.equal(planTalentGrant([talent("Grit", { id: "a" })], talent("grit")).action, "create");
});

test("a talent the actor does not have is created", () => {
  assert.deepEqual(planTalentGrant([talent("Grit", { id: "a" })], talent("Dedication")), { action: "create" });
  assert.deepEqual(planTalentGrant([], talent("Grit")), { action: "create" });
  assert.deepEqual(planTalentGrant(undefined, talent("Grit")), { action: "create" });
});

test("a ranked talent the actor already has increments the existing item", () => {
  const plan = planTalentGrant([talent("Grit", { id: "a", current: 2 })], talent("Grit", { current: 1 }));
  assert.deepEqual(plan, { action: "increment", itemId: "a", ranks: 1, total: 3 });
});

test("an incoming talent carrying several ranks adds all of them", () => {
  const plan = planTalentGrant([talent("Grit", { id: "a", current: 1 })], talent("Grit", { current: 3 }));
  assert.deepEqual(plan, { action: "increment", itemId: "a", ranks: 3, total: 4 });
});

test("a non-ranked talent the actor already has is refused", () => {
  const plan = planTalentGrant([talent("Nobody's Fool", { id: "b", ranked: false })], talent("Nobody's Fool", { ranked: false }));
  assert.deepEqual(plan, { action: "refuse", reason: "not-ranked", itemId: "b" });
});

test("an unusable incoming name is left to normal creation", () => {
  assert.deepEqual(planTalentGrant([talent("Grit", { id: "a" })], { type: "talent", system: {} }), { action: "create" });
});

test("a batch with two copies of one new talent keeps a single entry with the ranks summed", () => {
  const batch = [talent("Grit", { current: 1 }), talent("Grit", { current: 2 }), talent("Parry")];
  const collapsed = collapseTalentBatch(batch);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0].name, "Grit");
  assert.equal(collapsed[0].system.ranks.current, 3);
  assert.equal(collapsed[1].name, "Parry");
});

test("collapsing does not mutate the entries it was given", () => {
  const batch = [talent("Grit", { current: 1 }), talent("Grit", { current: 2 })];
  collapseTalentBatch(batch);
  assert.equal(batch[0].system.ranks.current, 1);
});

test("a batch duplicate of a non-ranked talent is dropped, not summed", () => {
  const collapsed = collapseTalentBatch([
    talent("Nobody's Fool", { ranked: false }),
    talent("Nobody's Fool", { ranked: false }),
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].system.ranks.current, 1);
});

test("non-talent entries and unusable names pass through untouched", () => {
  const gear = { name: "Blaster", type: "weapon" };
  const nameless = { type: "talent", system: {} };
  const collapsed = collapseTalentBatch([gear, nameless, nameless]);
  assert.deepEqual(collapsed, [gear, nameless, nameless]);
  assert.deepEqual(collapseTalentBatch(undefined), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="talent"` (or `node --test tests/node/talent-stacking.test.mjs`)
Expected: FAIL — `Cannot find module .../modules/helpers/talent-stacking.js`.

- [ ] **Step 3: Write the module**

Create `modules/helpers/talent-stacking.js`:

```javascript
/**
 * Talents stack as ranks on one item, never as duplicate items.
 *
 * A ranked talent bought, dropped or granted more than once used to arrive as a
 * second embedded item with the same name. The sheets already merged those for
 * display (`ActorFFG#_prepareCharacterData` sums same-named ranked talents into one
 * `talentList` entry), so the duplication was invisible until the copies drifted
 * apart -- a tier edited on one copy, modifiers on another.
 *
 * Every decision about that lives here, with no Foundry globals, so it can be unit
 * tested and shared by the create path, the XP refund, the species grant/removal
 * hooks and the repair helper.
 *
 * A rank that is not a usable number counts as 1, never 0: `ranks.current` is a
 * nullable NumberField and a cleared Rank field persists `null`. This mirrors
 * `ModifierHelpers.rankMultiplier`, which is what scales a ranked talent's
 * modifiers -- and why merging is safe: one item at rank 2 grants exactly what two
 * items at rank 1 granted.
 *
 * @see docs/superpowers/specs/2026-09-06-talent-rank-merging-design.md
 */

/** Trimmed talent name, or "" when there is nothing usable to key on. */
export function talentName(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** Ranks held by a talent (document or create data). Always >= 1. */
export function talentRanks(item) {
  const rank = Number(item?.system?.ranks?.current);
  if (!Number.isFinite(rank) || rank < 1) return 1;
  return Math.trunc(rank);
}

/** The id of a talent, whether it is a document or plain create data. */
function talentId(item) {
  return item?.id ?? item?._id ?? null;
}

/**
 * What should happen when `incoming` is added to an actor that already holds
 * `existingTalents`.
 *
 * @param {object[]} existingTalents  the actor's talent items
 * @param {object} incoming           the talent being created
 * @returns {{action: "create"}
 *          |{action: "increment", itemId: string|null, ranks: number, total: number}
 *          |{action: "refuse", reason: "not-ranked", itemId: string|null}}
 */
export function planTalentGrant(existingTalents, incoming) {
  const name = talentName(incoming?.name);
  if (!name) return { action: "create" };

  const existing = (existingTalents ?? []).find((t) => talentName(t?.name) === name);
  if (!existing) return { action: "create" };

  // A talent with no ranks cannot be held twice; the caller reports this.
  if (!existing.system?.ranks?.ranked) {
    return { action: "refuse", reason: "not-ranked", itemId: talentId(existing) };
  }

  const ranks = talentRanks(incoming);
  return { action: "increment", itemId: talentId(existing), ranks, total: talentRanks(existing) + ranks };
}

/**
 * Fold same-named talents inside one create batch together. Two copies of a talent
 * the actor does NOT yet have would each see an actor without it, so this runs
 * before the per-item check.
 *
 * Returns a new array; entries it changes are copied, so the caller's data is never
 * mutated.
 *
 * @param {object[]} entries  item create data
 * @returns {object[]}
 */
export function collapseTalentBatch(entries) {
  const out = [];
  const seen = new Map(); // talent name -> index in `out`
  for (const entry of (entries ?? [])) {
    const name = entry?.type === "talent" ? talentName(entry?.name) : "";
    if (!name) {
      out.push(entry);
      continue;
    }
    const at = seen.get(name);
    if (at === undefined) {
      seen.set(name, out.length);
      out.push(entry);
      continue;
    }
    const kept = out[at];
    // A non-ranked talent cannot stack: drop the duplicate outright.
    if (!kept?.system?.ranks?.ranked) continue;
    out[at] = {
      ...kept,
      system: { ...kept.system, ranks: { ...kept.system.ranks, current: talentRanks(kept) + talentRanks(entry) } },
    };
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/node/talent-stacking.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full suite and the import gate**

Run: `npm test` then `npm run check:imports`
Expected: 578 pass / 0 fail (567 baseline + 11), and `PASS — 0 unpinned finding(s)`.

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/talent-stacking.js tests/node/talent-stacking.test.mjs
git commit -m "Add talent grant planning and batch collapse

Talents stack as ranks on one item, never as duplicate items. The decisions
live in a pure module so the create path, the refund, the species hooks and
the repair helper all share them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Revoke and duplicate-repair planning

**Files:**
- Modify: `modules/helpers/talent-stacking.js`
- Test: `tests/node/talent-stacking.test.mjs`

**Interfaces:**
- Consumes: `talentName`, `talentRanks` from Task 1.
- Produces:
  - `planTalentRevoke(talent: object, ranks?: number): {action: "decrement", total: number} | {action: "delete"}`
  - `planDuplicateRepair(talents: object[]): null | {action: "skip", reason: "not-ranked"} | {action: "merge", keepId: string|null, rank: number, tier: number, grantedRanks: Record<string, number>, deleteIds: (string|null)[]}`
  - `groupTalentsByName(talents: object[]): Map<string, object[]>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/node/talent-stacking.test.mjs` (extend the existing import list with `planTalentRevoke`, `planDuplicateRepair`, `groupTalentsByName`):

```javascript
test("revoking fewer ranks than the talent holds decrements it", () => {
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 }), 1), { action: "decrement", total: 2 });
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 }), 2), { action: "decrement", total: 1 });
});

test("revoking the last rank deletes the talent", () => {
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 1 }), 1), { action: "delete" });
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 2 }), 5), { action: "delete" });
});

test("a non-ranked talent is deleted whatever is revoked", () => {
  assert.deepEqual(planTalentRevoke(talent("Nobody's Fool", { ranked: false }), 1), { action: "delete" });
});

test("revoking defaults to one rank and never takes less than one", () => {
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 })), { action: "decrement", total: 2 });
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 }), 0), { action: "decrement", total: 2 });
});

test("talents are grouped by trimmed name", () => {
  const groups = groupTalentsByName([talent("Grit", { id: "a" }), talent(" Grit ", { id: "b" }), talent("Parry", { id: "c" })]);
  assert.deepEqual([...groups.keys()], ["Grit", "Parry"]);
  assert.deepEqual(groups.get("Grit").map((t) => t.id), ["a", "b"]);
});

test("a single copy needs no repair", () => {
  assert.equal(planDuplicateRepair([talent("Grit", { id: "a" })]), null);
  assert.equal(planDuplicateRepair([]), null);
});

test("duplicates merge onto the oldest copy, summing ranks and keeping the highest tier", () => {
  const older = { ...talent("Precise Aim", { id: "a", current: 1, tier: 1 }), _stats: { createdTime: 100 } };
  const newer = { ...talent("Precise Aim", { id: "b", current: 1, tier: 2 }), _stats: { createdTime: 200 } };
  assert.deepEqual(planDuplicateRepair([newer, older]), {
    action: "merge",
    keepId: "a",
    rank: 2,
    tier: 2,
    grantedRanks: {},
    deleteIds: ["b"],
  });
});

test("granted ranks from every copy are merged and summed per grantor", () => {
  const a = { ...talent("Grit", { id: "a", current: 1, flags: { starwarsffg: { grantedRanks: { spec1: 1 } } } }), _stats: { createdTime: 1 } };
  const b = { ...talent("Grit", { id: "b", current: 2, flags: { starwarsffg: { grantedRanks: { spec1: 1, spec2: 1 } } } }), _stats: { createdTime: 2 } };
  const plan = planDuplicateRepair([a, b]);
  assert.deepEqual(plan.grantedRanks, { spec1: 2, spec2: 1 });
  assert.equal(plan.rank, 3);
});

test("a group containing a non-ranked talent is skipped rather than summed", () => {
  const plan = planDuplicateRepair([talent("Grit", { id: "a" }), talent("Grit", { id: "b", ranked: false })]);
  assert.deepEqual(plan, { action: "skip", reason: "not-ranked" });
});

test("copies with no creation timestamp keep the order they were given", () => {
  const plan = planDuplicateRepair([talent("Grit", { id: "a" }), talent("Grit", { id: "b" })]);
  assert.equal(plan.keepId, "a");
  assert.deepEqual(plan.deleteIds, ["b"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/node/talent-stacking.test.mjs`
Expected: FAIL — `planTalentRevoke is not a function` (and the other two new names).

- [ ] **Step 3: Write the implementation**

Append to `modules/helpers/talent-stacking.js`:

```javascript
/**
 * What should happen when `ranks` ranks are taken back off a talent -- an XP refund,
 * or a species that granted it being removed.
 *
 * @param {object} talent  the talent item
 * @param {number} [ranks=1]  how many ranks the grantor is taking back
 * @returns {{action: "decrement", total: number}|{action: "delete"}}
 */
export function planTalentRevoke(talent, ranks = 1) {
  if (!talent?.system?.ranks?.ranked) return { action: "delete" };
  const take = Math.max(1, Math.trunc(Number(ranks) || 1));
  const total = talentRanks(talent) - take;
  return total > 0 ? { action: "decrement", total } : { action: "delete" };
}

/** Group talent items by trimmed name, preserving the order they were given in. */
export function groupTalentsByName(talents) {
  const groups = new Map();
  for (const talent of (talents ?? [])) {
    const name = talentName(talent?.name);
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(talent);
  }
  return groups;
}

/** Creation timestamp used to pick the copy to keep; absent stats sort last-stable. */
function createdTime(item) {
  const time = Number(item?._stats?.createdTime);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * How to merge a group of same-named talent items into one.
 *
 * @param {object[]} talents  every copy of one talent on an actor
 * @returns {null
 *          |{action: "skip", reason: "not-ranked"}
 *          |{action: "merge", keepId: string|null, rank: number, tier: number,
 *            grantedRanks: Record<string, number>, deleteIds: Array<string|null>}}
 */
export function planDuplicateRepair(talents) {
  const copies = (talents ?? []).filter(Boolean);
  if (copies.length < 2) return null;
  // Summing ranks onto a talent that has none would invent data; report instead.
  if (copies.some((t) => !t.system?.ranks?.ranked)) return { action: "skip", reason: "not-ranked" };

  // Stable sort: equal (or absent) timestamps keep the given order, so the first
  // copy the actor lists is the one kept.
  const ordered = copies
    .map((talent, index) => ({ talent, index }))
    .sort((a, b) => (createdTime(a.talent) - createdTime(b.talent)) || (a.index - b.index))
    .map((entry) => entry.talent);

  const grantedRanks = {};
  let rank = 0;
  let tier = 0;
  for (const copy of ordered) {
    rank += talentRanks(copy);
    const copyTier = Number.parseInt(copy?.system?.tier, 10);
    if (Number.isFinite(copyTier) && copyTier > tier) tier = copyTier;
    for (const [grantor, granted] of Object.entries(copy?.flags?.starwarsffg?.grantedRanks ?? {})) {
      const amount = Number(granted);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      grantedRanks[grantor] = (grantedRanks[grantor] ?? 0) + Math.trunc(amount);
    }
  }

  return {
    action: "merge",
    keepId: talentId(ordered[0]),
    rank,
    tier: tier > 0 ? tier : 1,
    grantedRanks,
    deleteIds: ordered.slice(1).map(talentId),
  };
}
```

Note `talentId` is already defined in Task 1 — do not redefine it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/node/talent-stacking.test.mjs`
Expected: PASS, 21 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 588 pass / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/talent-stacking.js tests/node/talent-stacking.test.mjs
git commit -m "Add talent revoke and duplicate-repair planning

Removing ranks has to mirror adding them - decrement, delete only at zero -
and a repair needs to know which copy to keep, what the merged rank and tier
are, and how the granted-rank provenance combines.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Merge on create

**Files:**
- Modify: `modules/items/item-ffg.js` (`_preCreate`, ~line 36)
- Modify: `modules/actors/actor-ffg.js` (after `_preCreate`, ~line 64)
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `planTalentGrant`, `collapseTalentBatch`, `talentRanks` (Task 1).
- Produces: a talent create on an actor that already has that talent no longer produces a second item. The increment writes `system.ranks.current` and, when the create data carries `flags.starwarsffg.grantedBy`, adds to `flags.starwarsffg.grantedRanks[<grantor id>]` on the surviving item (Task 5 supplies that flag).

- [ ] **Step 1: Add the localization strings**

In `lang/en.json`, next to the other `SWFFG.Talents.*` keys, add:

```json
  "SWFFG.Talents.Stacking.NotRanked": "{name} is not a ranked talent, and {actor} already has it. Nothing was added.",
  "SWFFG.Talents.Stacking.Merged": "{name} is now rank {rank} on {actor}.",
```

Verify the file still parses: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'));console.log('json ok')"`

- [ ] **Step 2: Add the talent branch to `ItemFFG._preCreate`**

In `modules/items/item-ffg.js`, add to the imports at the top:

```javascript
import { planTalentGrant, talentRanks } from "../helpers/talent-stacking.js";
```

Then, inside `async _preCreate(data, operation, user)`, immediately AFTER the existing line

```javascript
    const parent = operation?.parent ?? this.parent;
```

insert:

```javascript
    // Talents stack as ranks on one item, never as duplicate items. This is the one
    // point every add path goes through -- XP buy, drag-drop, compendium drop, the
    // species grant hook, importers, macros -- and it runs once, on the initiating
    // client only, so the increment below cannot be applied twice.
    // See docs/superpowers/specs/2026-09-06-talent-rank-merging-design.md.
    if (this.type === "talent" && parent?.documentName === "Actor" && game.user.id === user.id) {
      const plan = planTalentGrant(parent.items.filter((i) => i.type === "talent"), this._source);
      if (plan.action === "refuse") {
        ui.notifications.warn(game.i18n.format("SWFFG.Talents.Stacking.NotRanked", { name: this.name, actor: parent.name }));
        return false;
      }
      if (plan.action === "increment") {
        const existing = parent.items.get(plan.itemId);
        if (existing) {
          const update = { "system.ranks.current": plan.total };
          // A grantor (a species, say) records what it contributed so removing it can
          // take back exactly that much. A talent bought with XP records nothing here;
          // its ranks are tracked by the XP log's undo descriptor instead.
          const grantedBy = this._source?.flags?.starwarsffg?.grantedBy;
          if (grantedBy) {
            const held = Number(existing.getFlag("starwarsffg", "grantedRanks")?.[grantedBy]) || 0;
            update[`flags.starwarsffg.grantedRanks.${grantedBy}`] = held + plan.ranks;
          }
          try {
            await existing.update(update);
            ui.notifications.info(game.i18n.format("SWFFG.Talents.Stacking.Merged", { name: existing.name, rank: plan.total, actor: parent.name }));
          } catch (err) {
            CONFIG.logger.error(`Failed to add ${plan.ranks} rank(s) of ${this.name} to ${parent.name}`, err);
            ui.notifications.error(game.i18n.format("SWFFG.Talents.Stacking.NotRanked", { name: this.name, actor: parent.name }));
          }
          return false;
        }
      }
    }
```

`return false` cancels the creation, so no second item appears.

- [ ] **Step 3: Fold duplicates inside one create batch**

In `modules/actors/actor-ffg.js`, add to the imports:

```javascript
import { collapseTalentBatch } from "../helpers/talent-stacking.js";
```

and add this method directly after `_preCreate` (~line 64):

```javascript
  /** @override
   * Two copies of a talent the actor does NOT yet have arrive in the same create
   * batch (an importer, a multi-item drop), and each would see an actor without it,
   * so `ItemFFG._preCreate` cannot merge them against each other. Fold them here
   * first; whatever survives is then merged against the actor per item.
   */
  async _preCreateDescendantDocuments(parent, collection, data, options, userId) {
    if (collection === "items" && Array.isArray(data) && data.some((d) => d?.type === "talent")) {
      const collapsed = collapseTalentBatch(data);
      if (collapsed.length !== data.length) {
        data.length = 0;
        data.push(...collapsed);
      }
    }
    return super._preCreateDescendantDocuments(parent, collection, data, options, userId);
  }
```

- [ ] **Step 4: Verify nothing regressed and the modules still import**

Run: `npm test` — expected 588 pass / 0 fail.
Run: `npm run check:imports` — expected PASS.
Run: `npx eslint modules/items/item-ffg.js modules/actors/actor-ffg.js modules/helpers/talent-stacking.js` — expected 0 errors (warnings are pre-existing).

There is no headless harness for Foundry document hooks; the behaviour is verified live in Task 7.

- [ ] **Step 5: Commit**

```bash
git add modules/items/item-ffg.js modules/actors/actor-ffg.js lang/en.json
git commit -m "Merge a duplicate talent into the existing item's rank on create

ItemFFG._preCreate cancels the create and raises the existing talent's rank
instead; a non-ranked talent the actor already has is refused with a warning.
ActorFFG._preCreateDescendantDocuments folds same-named talents inside one
batch first, since neither copy would otherwise see the other.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: XP purchase and refund bookkeeping

**Files:**
- Modify: `modules/helpers/xp-refund.js`
- Modify: `modules/actors/actor-sheet-ffg.js` (purchase ~line 2810, refund ~line 2148)
- Test: `tests/node/xp-refund-item.test.mjs`

**Interfaces:**
- Consumes: `planTalentRevoke` (Task 2); the create-side merge (Task 3), which is why `createEmbeddedDocuments` can now return an empty array.
- Produces: `resolveRefundTarget` additionally returns `{kind: "talent-rank", itemId: string, ranks: number, cost: number}` for an undo descriptor `{type: "talent-rank", itemId, ranks}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/node/xp-refund-item.test.mjs`:

```javascript
test("a merged talent purchase resolves to the ranks it added", () => {
  const logEntries = [{ id: "RANK000000000001", xp: { cost: 15 }, undo: { type: "talent-rank", itemId: "tal1", ranks: 1 } }];
  assert.deepEqual(resolveRefundTarget("RANK000000000001", { logEntries }), {
    kind: "talent-rank",
    itemId: "tal1",
    ranks: 1,
    cost: 15,
  });
});

test("a talent-rank descriptor with no ranks recorded takes back one", () => {
  const logEntries = [{ id: "RANK000000000002", xp: { cost: 5 }, undo: { type: "talent-rank", itemId: "tal1" } }];
  assert.equal(resolveRefundTarget("RANK000000000002", { logEntries }).ranks, 1);
});

test("a talent-rank descriptor with no item resolves to nothing", () => {
  const logEntries = [{ id: "RANK000000000003", xp: { cost: 5 }, undo: { type: "talent-rank" } }];
  assert.deepEqual(resolveRefundTarget("RANK000000000003", { logEntries }), { kind: "none" });
});

test("an item descriptor logged before merging still deletes the item", () => {
  const logEntries = [{ id: "ITEM000000000001", xp: { cost: 10 }, undo: { type: "item", itemId: "tal9" } }];
  assert.deepEqual(resolveRefundTarget("ITEM000000000001", { logEntries }), { kind: "item", itemId: "tal9", cost: 10 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/node/xp-refund-item.test.mjs`
Expected: FAIL — the first three return `{kind: "none"}`.

- [ ] **Step 3: Resolve the new descriptor**

In `modules/helpers/xp-refund.js`, immediately after the existing `if (undo?.type === "item" ...)` line, add:

```javascript
  // A talent purchase that merged into a talent the actor already had bought ranks,
  // not a document: the refund takes those ranks back and deletes the item only if
  // that empties it. Entries logged before merging existed carry `item` and still
  // delete, so nothing already in an XP log changes meaning.
  if (undo?.type === "talent-rank" && undo.itemId) {
    const ranks = Math.max(1, Math.trunc(Number(undo.ranks) || 1));
    return { kind: "talent-rank", itemId: undo.itemId, ranks, cost };
  }
```

Also extend the `@returns` JSDoc above the function with the new shape:

```javascript
 *          |{kind: "talent-rank", itemId: string, ranks: number, cost: number}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/node/xp-refund-item.test.mjs`
Expected: PASS.

- [ ] **Step 5: Log the descriptor when a purchase merges**

In `modules/actors/actor-sheet-ffg.js`, in the talent purchase callback, replace:

```javascript
              const [grantedItem] = await this.object.createEmbeddedDocuments("Item", [purchasedItem]);
```

with:

```javascript
              // A talent the actor already has merges into that item's rank instead of
              // creating a document (ItemFFG._preCreate), so createEmbeddedDocuments
              // returns nothing. Find the target BEFORE the create so the purchase is
              // still refundable either way.
              const mergeTarget = purchasedItem.type === "talent"
                ? this.object.items.find((i) => i.type === "talent" && i.name?.trim() === purchasedItem.name?.trim())
                : null;
              const [grantedItem] = await this.object.createEmbeddedDocuments("Item", [purchasedItem]);
              const undo = grantedItem?.id
                ? { type: "item", itemId: grantedItem.id }
                : (mergeTarget?.id ? { type: "talent-rank", itemId: mergeTarget.id, ranks: 1 } : undefined);
```

Then replace the two arguments at the end of the `xpLogSpend` call:

```javascript
                grantedItem?.id ? foundry.utils.randomID() : undefined,
                grantedItem?.id ? { type: "item", itemId: grantedItem.id } : undefined,
```

with:

```javascript
                undo ? foundry.utils.randomID() : undefined,
                undo,
```

- [ ] **Step 6: Refund by decrementing**

In `modules/actors/actor-sheet-ffg.js`, add to the imports:

```javascript
import { planTalentRevoke } from "../helpers/talent-stacking.js";
```

In the refund callback's final `else` block (the one shared by item grants and tree nodes, which restores the XP afterwards), replace:

```javascript
                  if (target.kind === "item") {
```

with:

```javascript
                  if (target.kind === "talent-rank") {
                    const talent = this.object.items.get(target.itemId);
                    if (talent) {
                      const plan = planTalentRevoke(talent, target.ranks);
                      if (plan.action === "delete") {
                        await this.object.deleteEmbeddedDocuments("Item", [talent.id]);
                      } else {
                        await talent.update({ "system.ranks.current": plan.total });
                      }
                    } else {
                      CONFIG.logger.warn(`talent ${target.itemId} is already gone; refunding the XP only`);
                    }
                  } else if (target.kind === "item") {
```

- [ ] **Step 7: Verify**

Run: `npm test` — expected 592 pass / 0 fail.
Run: `npx eslint modules/actors/actor-sheet-ffg.js modules/helpers/xp-refund.js` — expected 0 errors.

- [ ] **Step 8: Commit**

```bash
git add modules/helpers/xp-refund.js modules/actors/actor-sheet-ffg.js tests/node/xp-refund-item.test.mjs
git commit -m "Refund a merged talent purchase by taking its rank back

Buying a talent the actor already has now raises a rank instead of creating an
item, so the purchase logs a talent-rank undo descriptor and the refund
decrements, deleting the item only when the last rank goes. Entries logged
before this keep their item descriptor and still delete.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Species grants carry and give back their ranks

**Files:**
- Modify: `modules/swffg-main.js` (createItem hook ~line 1986, deleteItem hook ~line 2028)

**Interfaces:**
- Consumes: `planTalentRevoke`, `talentRanks` (Tasks 1-2); the `grantedBy` flag read by `ItemFFG._preCreate` (Task 3).
- Produces: species-granted talents carry `flags.starwarsffg.grantedRanks[<species item id>]`; removing the species takes back exactly those ranks.

- [ ] **Step 1: Send provenance with the grant**

In `modules/swffg-main.js`, add to the imports:

```javascript
import { planTalentRevoke, talentRanks } from "./helpers/talent-stacking.js";
```

In the `createItem` hook, replace the talent loop:

```javascript
        for(const talentId of Object.keys(item.system.talents)) {
          const talentUuid = item.system.talents[talentId].source;
          const talent = await fromUuid(talentUuid);
          if (talent) {
            toAdd.push(talent);
          }
        }
```

with:

```javascript
        for(const talentId of Object.keys(item.system.talents)) {
          const talentUuid = item.system.talents[talentId].source;
          const talent = await fromUuid(talentUuid);
          if (talent) {
            // Carry the grant's provenance in the create data: whether the talent is
            // created fresh or merged into one the character already has, removing the
            // species must take back exactly what it gave. `grantedBy` is what
            // ItemFFG._preCreate folds into the surviving item's grantedRanks.
            const talentData = talent.toObject();
            foundry.utils.setProperty(talentData, "flags.starwarsffg.fromSpecies", true);
            foundry.utils.setProperty(talentData, "flags.starwarsffg.grantedBy", item.id);
            foundry.utils.setProperty(talentData, `flags.starwarsffg.grantedRanks.${item.id}`, talentRanks(talentData));
            toAdd.push(talentData);
          }
        }
```

The existing post-create `created_item.update({flags: {starwarsffg: {fromSpecies: true}}})` stays: it is what flags the created *abilities*, and re-writing the flag on a talent that now carries it is harmless.

- [ ] **Step 2: Give back ranks instead of deleting by name**

In the `deleteItem` hook, replace:

```javascript
        const toDelete = [];
        for(const talentId of Object.keys(item.system.talents)) {
          const speciesTalent = item.system.talents[talentId];
          const actorTalent = actor.items.find(i => i.name === speciesTalent.name && i.type === "talent");
          if (actorTalent) {
            toDelete.push(actorTalent.id);
          }
        }
```

with:

```javascript
        const toDelete = [];
        const toUpdate = [];
        for(const talentId of Object.keys(item.system.talents)) {
          const speciesTalent = item.system.talents[talentId];
          const wanted = String(speciesTalent?.name ?? "").trim();
          const actorTalent = actor.items.find(i => i.type === "talent" && String(i.name ?? "").trim() === wanted);
          if (!actorTalent) continue;
          // Take back only what this species granted. The talent may also hold ranks the
          // character bought -- before this, the whole item was deleted by name, which
          // took those with it.
          const granted = Number(actorTalent.getFlag("starwarsffg", "grantedRanks")?.[item.id]) || 1;
          const plan = planTalentRevoke(actorTalent, granted);
          if (plan.action === "delete") {
            toDelete.push(actorTalent.id);
          } else {
            toUpdate.push({
              _id: actorTalent.id,
              "system.ranks.current": plan.total,
              [`flags.starwarsffg.grantedRanks.-=${item.id}`]: null,
            });
          }
        }
        if (toUpdate.length > 0) {
          await actor.updateEmbeddedDocuments("Item", toUpdate);
        }
```

- [ ] **Step 3: Verify**

Run: `npm test` — expected 592 pass / 0 fail (no new tests; this task is wiring over tested planners).
Run: `npm run check:imports` — expected PASS.
Run: `npx eslint modules/swffg-main.js` — expected 0 errors.

- [ ] **Step 4: Commit**

```bash
git add modules/swffg-main.js
git commit -m "Give back only the ranks a species granted when it is removed

A species grant now travels with its provenance, so a talent it shares with one
the character bought merges into a single item and removal decrements it. The
old code deleted the first talent matching the species talent's NAME, which
took the character's own purchase with it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Repair helper for actors that already have duplicates

**Files:**
- Modify: `modules/helpers/item-helpers.js` (after `repairCareerSkillEffects`, ~line 713)
- Modify: `modules/swffg-main.js` (registration ~line 1663)
- Test: `tests/node/talent-stacking.test.mjs` (planner already covered — no new pure logic)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `groupTalentsByName`, `planDuplicateRepair` (Task 2).
- Produces: `game.starwarsffg.repairDuplicateTalents({dryRun})` → `Promise<{scanned: number, actors: Array<{actor: string, merged: Array<{name: string, from: number, to: number}>}>, skipped: Array<{actor: string, name: string, reason: string}>}>`

- [ ] **Step 1: Implement the helper**

In `modules/helpers/item-helpers.js`, add to the imports:

```javascript
import { groupTalentsByName, planDuplicateRepair } from "./talent-stacking.js";
```

and add this static method after `repairCareerSkillEffects`:

```javascript
  /**
   * Merge duplicate talent items on every actor into one item per talent, with the
   * ranks summed.
   *
   * A ranked talent added more than once used to arrive as a second item with the
   * same name. The sheets merged them for display, so the copies drifted apart
   * unnoticed -- a tier edited on one, modifiers on another.
   *
   * Active Effects need no repair: a ranked talent's numeric modifiers are scaled at
   * application time by `ModifierHelpers.rankMultiplier`, so one item at rank 2
   * grants exactly what two items at rank 1 granted.
   *
   * Intended to be called by a GM from the console:
   *   `await game.starwarsffg.repairDuplicateTalents({dryRun: true})` to preview,
   *   then without `dryRun` to apply.
   *
   * @param {object} [options]
   * @param {boolean} [options.dryRun=false] - report what would change without changing it
   * @returns {Promise<{scanned: number, actors: Array<object>, skipped: Array<object>}>}
   */
  static async repairDuplicateTalents({ dryRun = false } = {}) {
    const report = { scanned: 0, actors: [], skipped: [] };
    for (const actor of game.actors ?? []) {
      const talents = actor.items?.filter((i) => i.type === "talent") ?? [];
      if (!talents.length) continue;
      report.scanned += 1;
      const merged = [];
      for (const [name, copies] of groupTalentsByName(talents)) {
        const plan = planDuplicateRepair(copies);
        if (!plan) continue;
        if (plan.action === "skip") {
          report.skipped.push({ actor: actor.name, name, reason: plan.reason });
          continue;
        }
        merged.push({ name, from: copies.length, to: plan.rank });
        if (dryRun) continue;
        const update = { _id: plan.keepId, "system.ranks.current": plan.rank, "system.tier": plan.tier };
        if (Object.keys(plan.grantedRanks).length) {
          update["flags.starwarsffg.grantedRanks"] = plan.grantedRanks;
        }
        await actor.updateEmbeddedDocuments("Item", [update]);
        await actor.deleteEmbeddedDocuments("Item", plan.deleteIds.filter(Boolean));
      }
      if (merged.length) report.actors.push({ actor: actor.name, merged });
    }
    CONFIG.logger.debug(
      `repairDuplicateTalents scanned ${report.scanned} actor(s), ${report.actors.length} had duplicates, ${report.skipped.length} group(s) skipped`,
    );
    return report;
  }
```

- [ ] **Step 2: Register it**

In `modules/swffg-main.js`, inside the `game.starwarsffg = Object.assign(...)` block, after `repairCareerSkillEffects`, add:

```javascript
    // `repairDuplicateTalents` merges talents that were added more than once as
    // separate items into one item with the ranks summed -- the state actors were
    // left in before talents stacked as ranks.
    repairDuplicateTalents: (options) => ItemHelpers.repairDuplicateTalents(options),
```

- [ ] **Step 3: Write the CHANGELOG entry**

In `CHANGELOG.md`, add to the top `Unreleased` block:

```markdown
* Fixed — **a talent added twice became two separate copies instead of going up a rank**. The sheet showed "Grit 2" while the character actually carried two Grit items, which then drifted apart: editing one left the other stale, and the tier you set on one might not be the one displayed. Buying, dropping or importing a talent a character already has now raises that talent's rank, and a talent with no ranks can't be added twice at all.
  * **Characters with duplicates from before this are not repaired automatically.** As a GM, run `await game.starwarsffg.repairDuplicateTalents({dryRun: true})` in the console to see what would merge, then without `dryRun` to do it.
  * Refunding a rank in the XP log now takes back one rank instead of deleting the whole talent, and removing a species gives back only the ranks that species granted — it used to delete a same-named talent the character had bought.
```

- [ ] **Step 4: Verify**

Run: `npm test` — expected 592 pass / 0 fail.
Run: `npm run check:imports` — expected PASS.
Run: `npx eslint modules/helpers/item-helpers.js modules/swffg-main.js` — expected 0 errors.
Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'));console.log('json ok')"`

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/item-helpers.js modules/swffg-main.js CHANGELOG.md
git commit -m "Add repairDuplicateTalents for actors that already have duplicates

Merges each group of same-named talent items into the oldest copy with the
ranks summed, the highest tier kept and the granted-rank provenance combined.
A group containing a non-ranked talent is reported, not merged. dryRun
previews without writing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Live verification

**Files:** none — this task changes nothing. Its deliverable is a verified feature.

**Interfaces:**
- Consumes: Tasks 3-6.
- Produces: confirmation, or a defect report that sends a specific earlier task back.

This cannot be automated: there is no headless Foundry harness in this repo (the browser mocha suite in `tests/ffg-tests.js` does not cover document hooks). The user runs these in the live world after a **hard reload** (modules are cached — without it you are testing the old code).

- [ ] **Step 1: Ask the user to run the checks**

1. **Buy a rank.** On a character, buy a ranked talent they already have. Expect: no second item in the Items list, the talent's rank goes up by 1, the XP log shows the purchase.
2. **Refund it.** Refund that XP-log entry. Expect: rank goes back down by 1, the item survives, the XP returns.
3. **Refund the last rank.** Buy a talent the character does not have, then refund it. Expect: the item is deleted, as before.
4. **Drop a duplicate.** Drag a talent the character already has from a compendium. Expect: rank goes up, no second item, an info notification.
5. **Non-ranked duplicate.** Drag a non-ranked talent the character already has. Expect: a warning, no change.
6. **Species.** Add a species granting a talent the character bought, then remove the species. Expect: after adding, one item with the ranks combined; after removing, the character's own ranks survive.
7. **Repair.** Run `await game.starwarsffg.repairDuplicateTalents({dryRun: true})` and check the report includes Nyxara's `Precise Aim`; then run it for real and confirm one item at rank 2 remains, and the Codex talents tab still groups it under the tier it should be.

- [ ] **Step 2: Fix or proceed**

If anything fails, treat it with `superpowers:systematic-debugging` and fix in the task that owns the behaviour; do not patch symptoms in a later file. Re-run `npm test` after any fix.

- [ ] **Step 3: Push, PR, merge**

```bash
gh auth switch --user YeNov
git push -u origin talent-rank-merging
gh pr create --repo YeNov/StarWarsFFG --base main --head talent-rank-merging --title "Talents stack as ranks, not duplicate items" --body "<summary of the change, the repair helper, and the live checks that were run>"
```

Merge when CI (if any) and review are clear, then:

```bash
git checkout main && git pull --ff-only
gh auth switch --user yehornovakov
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| §1 Interception point | Task 3 |
| §2 Batch creates | Task 3 |
| §3 Provenance (`grantedRanks`) | Task 3 (fold-in) + Task 5 (grant) |
| §4 XP refund | Task 4 |
| §4 Species removal | Task 5 |
| §5 Repair helper | Task 6 |
| §6 New pure module | Tasks 1-2 |
| Error handling | Task 3 (increment failure, notifications), Task 4 (missing item), Task 6 (skips) |
| Testing | Tasks 1, 2, 4 (node), Task 7 (live) |

**Placeholders:** none — every code step carries the code to write.

**Type consistency:** `planTalentGrant` / `collapseTalentBatch` / `planTalentRevoke` / `planDuplicateRepair` / `groupTalentsByName` / `talentName` / `talentRanks` are named identically in their definitions (Tasks 1-2) and at every call site (Tasks 3-6). The refund `kind` string `"talent-rank"` matches the undo `type` string logged in Task 4 and resolved in Task 4. The flag path `flags.starwarsffg.grantedRanks.<grantorId>` is written in Tasks 3 and 5, read in Tasks 5 and 6, and merged in Task 2.

**Known gap accepted:** `repairDuplicateTalents` scans `game.actors` only — not unlinked token actors on scenes, which `repairCareerSkillEffects` does walk. Duplicates on an unlinked token come from its base actor and are repaired there; a token whose delta added its own duplicate is rare enough to leave to a follow-up rather than complicate the first pass.
