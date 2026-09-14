# Minion Vehicle Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Minion Vehicle** Sheet Option that makes a vehicle behave as a minion group:
- pooled hull trauma
- a derived count of vehicles left
- crew group skills ranked at vehicles left − 1
- critical hits that destroy one vehicle
- group controls and the token tally on both the classic and Codex vehicle sheets

**Architecture:**
- All group arithmetic and every actor-facing decision live in one new pure module, `modules/helpers/minion-group.js`, which is unit-tested in Node.
- Foundry-bound code (prepared data, `_preUpdate`, roll paths, Apply Crit, the GM bridge, both sheets) only calls into that module.
- The stored `system.stats.hullTrauma.max` stays the per-vehicle threshold. The group threshold and vehicles left exist only in prepared data. Group size is a new stored `system.quantity.max`.

**Tech Stack:**
- Foundry VTT V14 system code: ES modules, ApplicationV2 sheets, Handlebars templates.
- `node:test` Node test tier.
- gulp-sass for the classic sheet's SCSS. The Codex sheet's CSS (`styles/cdx.css`) is hand-written.

**Spec:** `docs/superpowers/specs/2026-09-14-minion-vehicle-groups-design.md`

## Global Constraints

- **Repository.** GitHub writes go to `YeNov/StarWarsFFG` only, with the `YeNov` account. Never write to `StarWarsFoundryVTT/StarWarsFFG`.
- **Branch.** `minion-vehicle-groups`, already created off `main` and holding the spec commit.
- **Commits.** Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Changelog.** `CHANGELOG.md` gets its entry in the existing `Unreleased` block before any push or PR. It has one or two lines per change, written for GMs.
- **Toggle.** Stored at `flags.starwarsffg.config.minionVehicle`, Boolean, default `false`.
- **Rules.**
  - group threshold = per-vehicle threshold × group size
  - vehicles left = `clamp(size − floor((damage − 1) / perVehicle), 0, size)`
  - group skill rank = `clamp(left − 1, 0, 5)`
- **System Strain.** Unchanged: never pooled, never removes vehicles.
- **Apply Damage.** Unchanged.
- **Minions.** Behaviour unchanged, including the existing `getKillMinionUpdate` off-by-one.
- **`minion-group.js` purity.** No Foundry globals (`game`, `CONFIG`, `foundry`, `ui`, `Hooks`) anywhere in the module.
- **Tests.** Node tests import only what they test. They must not stub `Actor`, `Item`, `Hooks`, `ui.notifications`, `game.socket` or DOM APIs (enforced by `tests/node/stub-boundary.test.mjs`).
- **Gates.**
  - `npm test` stays green. The baseline on `main` is 840 passing.
  - `npm run check:imports` passes.
  - `npm run lint` reports no more than the baseline **82 errors**. Warnings are 492 at baseline; don't add any.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `modules/helpers/minion-group.js` (new) | Group arithmetic (threshold, left, rank, step, wipe-out, hull pool segments, prepared-data pooling) and actor adapters (`isMinionVehicle`, `groupTrack`, `crewRollOptions`, `effectiveSkillRank`, `withGroupSkillRanks`, `prototypeLinkUpdate`). |
| `tests/node/minion-group.test.mjs` (new) | Arithmetic tests, including parity with the Codex minion stepper. |
| `tests/node/minion-group-actor.test.mjs` (new) | Adapter tests. |
| `tests/node/minion-kill-helpers.test.mjs` (new) | `minions.js` update builders for minion vehicles and minions. |
| `modules/data/models/actor/vehicle.js` | Adds `quantity`. |
| `modules/actors/actor-ffg.js` | Pools hull in prepared data; flips the prototype token link. |
| `modules/actors/actor-sheet-ffg.js` | Sheet Option; crew roll call sites; classic sheet context and forced render. |
| `modules/helpers/dice-helpers.js` | `get_dice_pool` accepts `options.groupSkillRank`. |
| `modules/helpers/crew.js` | Crew preview and pilot rolls accept the vehicle actor and pass group options. |
| `modules/combat-ffg.js` | Pilot initiative uses group-scaled skill ranks. |
| `modules/helpers/minions.js` | Kill and wipe-out builders branch for minion vehicles. |
| `modules/helpers/gm-bridge.js` | `kill-minion` narrowing accepts a minion vehicle. |
| `modules/helpers/apply-crit.js` | A crit on a minion vehicle destroys one vehicle. |
| `modules/swffg-main.js` | Token tally for minion vehicles. |
| `modules/actors/codex-sheets.js` | Hull pool context; group stepper through `groupTrack` / `stepUnits`. |
| `templates/actors/ffg-vehicle-sheet.html` | Per-vehicle threshold label and the group row. |
| `templates/actors/codex/codex-vehicle.html` | Group Strength card and Combined Hull Pool. |
| `scss/components/_vehiclesheet.scss` | Classic group row spacing. |
| `styles/cdx.css`, `styles/cdx-eldritch.css` | Hull pool bar segments. |
| `lang/en.json`, `lang/codex/en.json` | New strings. |
| `CHANGELOG.md` | Unreleased entry. |

---

### Task 1: Group arithmetic

**Files:**
- Create: `modules/helpers/minion-group.js`
- Test: `tests/node/minion-group.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `modules/helpers/minion-group.js`):
  - `HULL_PIP_LIMIT: number` (20)
  - `groupThreshold(perUnit: number, size: number): number`
  - `unitsLeft(damage: number, perUnit: number, size: number): number`
  - `groupSkillRank(left: number): number`
  - `stepUnits(damage: number, perUnit: number, size: number, dir: -1|1): number`
  - `wipeOutDamage(perUnit: number, size: number): number`
  - `hullPoolSegments(damage: number, perUnit: number, size: number): Array<{bar: false, pips: boolean[]} | {bar: true, pct: number}>`
  - `prepareMinionVehicleHull(system: object): void`. Mutates `system.stats.hullTrauma.{unit,max}` and `system.quantity.value`.

- [ ] **Step 1: Write the failing test**

Create `tests/node/minion-group.test.mjs`:

```js
/**
 * The minion group rules shared by minions and minion vehicle groups.
 *
 * A group has a size, a per-unit threshold and one combined damage track. A unit is lost each
 * time the damage EXCEEDS another per-unit threshold (the track is 1-indexed), and group skills
 * rank at units left - 1, capped at 5. The stepper arithmetic was lifted out of the Codex minion
 * sheet, so it is pinned against a verbatim copy of the original.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  HULL_PIP_LIMIT,
  groupThreshold,
  unitsLeft,
  groupSkillRank,
  stepUnits,
  wipeOutDamage,
  hullPoolSegments,
  prepareMinionVehicleHull,
} from "../../modules/helpers/minion-group.js";

test("the group threshold is the per-unit threshold times the group size", () => {
  assert.equal(groupThreshold(6, 4), 24);
  assert.equal(groupThreshold(0, 4), 0);
  assert.equal(groupThreshold(6, 0), 0);
  assert.equal(groupThreshold(-2, 4), 0);
});

test("a unit is lost only when the damage exceeds another per-unit threshold", () => {
  const left = (damage) => unitsLeft(damage, 6, 4);
  assert.equal(left(0), 4);
  assert.equal(left(6), 4);
  assert.equal(left(7), 3);
  assert.equal(left(12), 3);
  assert.equal(left(13), 2);
  assert.equal(left(24), 1);
  assert.equal(left(25), 0);
  assert.equal(left(99), 0);
});

test("a per-unit threshold of zero never divides by zero", () => {
  assert.equal(unitsLeft(0, 0, 4), 4);
  assert.equal(unitsLeft(1, 0, 4), 0);
  assert.equal(unitsLeft(3, 6, 0), 0);
});

test("group skills rank at units left minus one, between 0 and 5", () => {
  assert.equal(groupSkillRank(0), 0);
  assert.equal(groupSkillRank(1), 0);
  assert.equal(groupSkillRank(2), 1);
  assert.equal(groupSkillRank(4), 3);
  assert.equal(groupSkillRank(6), 5);
  assert.equal(groupSkillRank(9), 5);
});

test("destroying a unit keeps the partial damage on the next one", () => {
  assert.equal(stepUnits(0, 6, 4, -1), 7, "a clean group loses one unit with no partial");
  assert.equal(stepUnits(7, 6, 4, -1), 13, "then exactly one threshold more");
  assert.equal(stepUnits(3, 6, 4, -1), 9, "2 partial damage is carried over");
  assert.equal(unitsLeft(9, 6, 4), 3);
  assert.equal(stepUnits(25, 6, 4, -1), 25, "nothing left to destroy");
});

test("reviving a unit is the reverse, and a clean group stays clean", () => {
  assert.equal(stepUnits(13, 6, 4, 1), 7);
  assert.equal(stepUnits(9, 6, 4, 1), 3);
  assert.equal(stepUnits(7, 6, 4, 1), 0);
  assert.equal(stepUnits(3, 6, 4, 1), 3);
  assert.equal(stepUnits(0, 6, 4, 1), 0);
});

/** The Codex minion stepper's arithmetic, copied verbatim from codex-sheets.js before it moved. */
function codexMinionStep(woundsValue, unitWounds, quantityMax, dir) {
  const unit = Math.max(1, Math.trunc(Number(unitWounds) || 1));
  const qmax = Math.max(0, Math.trunc(Number(quantityMax) || 0));
  const cur = Math.max(0, Math.trunc(Number(woundsValue) || 0));
  const ceiling = qmax * unit + 1;
  const deaths = cur >= 1 ? Math.floor((cur - 1) / unit) : 0;
  const partial = cur >= 1 ? (cur - 1) - deaths * unit : 0;
  const targetDeaths = Math.max(0, Math.min(qmax, deaths - dir));
  return (targetDeaths === 0 && partial === 0)
    ? 0
    : Math.max(0, Math.min(ceiling, targetDeaths * unit + partial + 1));
}

test("stepping reproduces the Codex minion stepper exactly", () => {
  for (const unit of [0, 1, 2, 3, 5, 12]) {
    for (const size of [0, 1, 3, 6]) {
      for (let wounds = 0; wounds <= 80; wounds++) {
        for (const dir of [-1, 1]) {
          assert.equal(
            stepUnits(wounds, unit, size, dir),
            codexMinionStep(wounds, unit, size, dir),
            `wounds ${wounds}, unit ${unit}, size ${size}, dir ${dir}`,
          );
        }
      }
    }
  }
});

test("wiping out a group takes it one past the group threshold", () => {
  assert.equal(wipeOutDamage(6, 4), 25);
  assert.equal(unitsLeft(wipeOutDamage(6, 4), 6, 4), 0);
  assert.equal(unitsLeft(wipeOutDamage(0, 4), 0, 4), 0);
});

test("the hull pool shows one row of pips per vehicle below the pip limit", () => {
  assert.deepEqual(hullPoolSegments(8, 3, 3), [
    { bar: false, pips: [true, true, true] },
    { bar: false, pips: [true, true, true] },
    { bar: false, pips: [true, true, false] },
  ]);
  assert.deepEqual(hullPoolSegments(5, 3, 0), []);
});

test("a per-vehicle hull at the pip limit or above is one bar per vehicle", () => {
  assert.deepEqual(hullPoolSegments(30, HULL_PIP_LIMIT, 2), [
    { bar: true, pct: 100 },
    { bar: true, pct: 50 },
  ]);
});

test("preparing a minion vehicle pools the hull once, however often it runs", () => {
  const system = { stats: { hullTrauma: { value: 13, max: 6 } }, quantity: { value: 1, max: 4 } };
  prepareMinionVehicleHull(system);
  assert.deepEqual(system.stats.hullTrauma, { value: 13, max: 24, unit: 6 });
  assert.equal(system.quantity.value, 2);
  prepareMinionVehicleHull(system);
  assert.equal(system.stats.hullTrauma.max, 24);
  assert.equal(system.quantity.value, 2);
  assert.doesNotThrow(() => prepareMinionVehicleHull({}));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/minion-group.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `modules/helpers/minion-group.js`.

- [ ] **Step 3: Write the implementation**

Create `modules/helpers/minion-group.js`:

```js
/**
 * Minion group rules, shared by minion actors and by vehicles with the Minion Vehicle Sheet
 * Option on (a squadron of identical, minion-crewed craft).
 *
 * A group has a size and a per-unit threshold, and one combined damage track. A unit is lost
 * each time the damage EXCEEDS another per-unit threshold -- the track is 1-indexed, so a group
 * of 4 with 6 per unit loses its first unit at 7 damage, not 6. Group skills rank at units
 * left - 1, capped at 5.
 *
 * Pure: no Foundry globals, so the rules are tested in Node.
 */

/** A per-unit hull at or above this draws one bar per vehicle rather than pips, the cutoff `_cdxTrack` uses. */
export const HULL_PIP_LIMIT = 20;

const toCount = (value) => Math.max(0, Math.trunc(Number(value) || 0));

/** The whole group's threshold. */
export function groupThreshold(perUnit, size) {
  return toCount(perUnit) * toCount(size);
}

/** Units still standing. A per-unit threshold of 0 leaves the whole group up until any damage lands. */
export function unitsLeft(damage, perUnit, size) {
  const units = toCount(size);
  const taken = toCount(damage);
  const unit = toCount(perUnit);
  if (unit === 0) return taken > 0 ? 0 : units;
  return Math.max(0, Math.min(units, units - Math.floor((taken - 1) / unit)));
}

/** A group skill's rank for a group with `left` units standing. */
export function groupSkillRank(left) {
  return Math.max(0, Math.min(5, toCount(left) - 1));
}

/**
 * The damage after destroying (`dir` -1) or reviving (`dir` +1) one unit. The current damage is
 * split into lost units plus partial damage on the next unit; the lost count moves by one and the
 * SAME partial is re-attached, so a hit already sitting on the next unit survives the step. From a
 * clean group that costs per-unit + 1, afterwards exactly per-unit. Clamped to one past the
 * group threshold, which is the whole group lost.
 */
export function stepUnits(damage, perUnit, size, dir) {
  const unit = Math.max(1, toCount(perUnit));
  const units = toCount(size);
  const current = toCount(damage);
  const ceiling = units * unit + 1;
  const lost = current >= 1 ? Math.floor((current - 1) / unit) : 0;
  const partial = current >= 1 ? (current - 1) - lost * unit : 0;
  const targetLost = Math.max(0, Math.min(units, lost - Math.sign(Number(dir) || 0)));
  if (targetLost === 0 && partial === 0) return 0;
  return Math.max(0, Math.min(ceiling, targetLost * unit + partial + 1));
}

/** The damage that leaves no unit standing. */
export function wipeOutDamage(perUnit, size) {
  return groupThreshold(perUnit, size) + 1;
}

/**
 * The Codex Combined Hull Pool track: one entry per vehicle, filled left to right. A small
 * per-vehicle hull is a row of pips like the minion wound pool; a large one is a single bar,
 * since 30 pips per ship would not fit.
 */
export function hullPoolSegments(damage, perUnit, size) {
  const unit = toCount(perUnit);
  const taken = toCount(damage);
  const segments = [];
  for (let index = 0; index < toCount(size); index++) {
    const filled = Math.max(0, Math.min(unit, taken - index * unit));
    segments.push(unit < HULL_PIP_LIMIT
      ? { bar: false, pips: Array.from({ length: unit }, (_, pip) => pip < filled) }
      : { bar: true, pct: Math.round((filled / unit) * 100) });
  }
  return segments;
}

/**
 * Pool a minion vehicle group's hull in PREPARED data. The stored threshold is per vehicle (what
 * stat blocks and importers write, plus any hull-threshold Active Effects by now); it is kept as
 * `hullTrauma.unit` and `hullTrauma.max` becomes the whole group's, so the token bar, the
 * over-threshold figure and both sheets read the pool. Re-running on the same object keeps `unit`
 * rather than multiplying the pooled max again.
 */
export function prepareMinionVehicleHull(system) {
  const hull = system?.stats?.hullTrauma;
  const quantity = system?.quantity;
  if (!hull || !quantity) return;
  const perUnit = hull.unit ?? hull.max;
  hull.unit = perUnit;
  hull.max = groupThreshold(perUnit, quantity.max);
  quantity.value = unitsLeft(hull.value, perUnit, quantity.max);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/node/minion-group.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full suite and the import gate**

Run: `npm test` then `npm run check:imports`
Expected: all tests pass (840 + 11 = 851); the gate prints `PASS`.

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/minion-group.js tests/node/minion-group.test.mjs
git commit -m "Add the minion group arithmetic shared by minions and vehicle groups

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Actor adapters for group rules

**Files:**
- Modify: `modules/helpers/minion-group.js` (append)
- Test: `tests/node/minion-group-actor.test.mjs`

**Interfaces:**
- Consumes: `groupSkillRank`, and the module-private `toCount`, from Task 1.
- Produces (exported from `modules/helpers/minion-group.js`):
  - `isMinionVehicle(actor): boolean`
  - `groupTrack(actor): {path: string, damage: number, perUnit: number, size: number} | null`
    - For a minion, `path` is `"system.stats.wounds.value"`.
    - For a minion vehicle, `path` is `"system.stats.hullTrauma.value"`.
  - `crewRollOptions(vehicleActor): {groupSkillRank?: number}`
  - `effectiveSkillRank(skill, options = {}): number`
  - `withGroupSkillRanks(system, options = {}): object`. Returns `system` itself when there's no rank to apply, otherwise a shallow copy with a new `skills` object.
  - `prototypeLinkUpdate(actor, changes): {actorLink: boolean} | null`

- [ ] **Step 1: Write the failing test**

Create `tests/node/minion-group-actor.test.mjs`:

```js
/**
 * The actor-facing side of the minion group rules: which actors are groups, where their damage
 * track lives, how a crew member's group skills scale when rolling for a minion vehicle, and when
 * toggling Minion Vehicle flips the prototype token's link.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isMinionVehicle,
  groupTrack,
  crewRollOptions,
  effectiveSkillRank,
  withGroupSkillRanks,
  prototypeLinkUpdate,
} from "../../modules/helpers/minion-group.js";

const vehicle = ({ minionVehicle, hull = { value: 0, max: 6 }, quantity = { value: 4, max: 4 }, isToken = false } = {}) => ({
  type: "vehicle",
  isToken,
  flags: minionVehicle === undefined ? {} : { starwarsffg: { config: { minionVehicle } } },
  system: { stats: { hullTrauma: hull }, quantity },
});

const flagChange = (minionVehicle) => ({ flags: { starwarsffg: { config: { minionVehicle } } } });

test("only a vehicle with the Minion Vehicle option ticked is a minion vehicle", () => {
  assert.equal(isMinionVehicle(vehicle({ minionVehicle: true })), true);
  assert.equal(isMinionVehicle(vehicle({ minionVehicle: false })), false);
  assert.equal(isMinionVehicle(vehicle()), false);
  assert.equal(isMinionVehicle({ type: "minion", flags: flagChange(true).flags }), false);
  assert.equal(isMinionVehicle(null), false);
});

test("a minion's group track is its wounds; a minion vehicle's is its hull", () => {
  const minion = {
    type: "minion",
    system: { stats: { wounds: { value: 5, max: 12 } }, unit_wounds: { value: 3 }, quantity: { value: 3, max: 4 } },
  };
  assert.deepEqual(groupTrack(minion), { path: "system.stats.wounds.value", damage: 5, perUnit: 3, size: 4 });

  // Prepared data: the per-vehicle threshold is `unit`, and `max` is the whole group's.
  assert.deepEqual(
    groupTrack(vehicle({ minionVehicle: true, hull: { value: 8, max: 24, unit: 6 } })),
    { path: "system.stats.hullTrauma.value", damage: 8, perUnit: 6, size: 4 },
  );
  // Unprepared data: the stored threshold is already per vehicle.
  assert.deepEqual(
    groupTrack(vehicle({ minionVehicle: true, hull: { value: 8, max: 6 } })),
    { path: "system.stats.hullTrauma.value", damage: 8, perUnit: 6, size: 4 },
  );
  assert.equal(groupTrack(vehicle({ minionVehicle: false })), null);
  assert.equal(groupTrack({ type: "rival", system: {} }), null);
});

test("crew roll options carry the group skill rank of the vehicle they are given", () => {
  assert.deepEqual(crewRollOptions(vehicle({ minionVehicle: true, quantity: { value: 3, max: 4 } })), { groupSkillRank: 2 });
  assert.deepEqual(crewRollOptions(vehicle({ minionVehicle: true, quantity: { value: 0, max: 4 } })), { groupSkillRank: 0 });
  assert.deepEqual(crewRollOptions(vehicle({ minionVehicle: false, quantity: { value: 3, max: 4 } })), {});
  assert.deepEqual(crewRollOptions(undefined), {});
});

test("only a group skill takes the group rank", () => {
  assert.equal(effectiveSkillRank({ rank: 1, groupskill: true }, { groupSkillRank: 3 }), 3);
  assert.equal(effectiveSkillRank({ rank: 1, groupskill: false }, { groupSkillRank: 3 }), 1);
  assert.equal(effectiveSkillRank({ rank: 2, groupskill: true }, {}), 2);
  assert.equal(effectiveSkillRank({ rank: 2, groupskill: true }), 2);
  assert.equal(effectiveSkillRank({ groupskill: true }, { groupSkillRank: 0 }), 0);
  assert.equal(effectiveSkillRank({ rank: "3" }), 3);
  assert.equal(effectiveSkillRank(undefined), 0);
});

test("group skill ranks are applied to a copy of the crew's data", () => {
  const system = {
    characteristics: { Agility: { value: 3 } },
    skills: {
      Gunnery: { rank: 1, groupskill: true, characteristic: "Agility" },
      Cool: { rank: 2, groupskill: false, characteristic: "Presence" },
    },
  };
  const scaled = withGroupSkillRanks(system, { groupSkillRank: 3 });
  assert.equal(scaled.skills.Gunnery.rank, 3);
  assert.equal(scaled.skills.Gunnery.characteristic, "Agility");
  assert.equal(scaled.skills.Cool.rank, 2);
  assert.equal(scaled.characteristics, system.characteristics);
  assert.equal(system.skills.Gunnery.rank, 1, "the crew actor's own data is untouched");
  assert.equal(withGroupSkillRanks(system, {}), system);
  assert.equal(withGroupSkillRanks(system), system);
});

test("switching Minion Vehicle unlinks or relinks the prototype token", () => {
  assert.deepEqual(prototypeLinkUpdate(vehicle({ minionVehicle: false }), flagChange(true)), { actorLink: false });
  assert.deepEqual(prototypeLinkUpdate(vehicle({ minionVehicle: true }), flagChange(false)), { actorLink: true });
  assert.deepEqual(prototypeLinkUpdate(vehicle(), flagChange(true)), { actorLink: false });
  // Sheet Options sends dotted keys, which may reach _preUpdate flat or partly expanded.
  assert.deepEqual(prototypeLinkUpdate(vehicle(), { "flags.starwarsffg.config.minionVehicle": true }), { actorLink: false });
  assert.deepEqual(prototypeLinkUpdate(vehicle(), { flags: { "starwarsffg.config.minionVehicle": true } }), { actorLink: false });
});

test("the prototype token is left alone unless the option changes on a world vehicle", () => {
  assert.equal(prototypeLinkUpdate(vehicle({ minionVehicle: true }), flagChange(true)), null, "Accept rewrites every option");
  assert.equal(prototypeLinkUpdate(vehicle({ minionVehicle: false, isToken: true }), flagChange(true)), null);
  assert.equal(prototypeLinkUpdate({ type: "minion", flags: {} }, flagChange(true)), null);
  assert.equal(prototypeLinkUpdate(vehicle(), { name: "TIE Squadron" }), null);
  assert.equal(prototypeLinkUpdate(vehicle(), undefined), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/minion-group-actor.test.mjs`
Expected: FAIL with `SyntaxError: The requested module ... does not provide an export named 'isMinionVehicle'`.

- [ ] **Step 3: Write the implementation**

Append to `modules/helpers/minion-group.js`:

```js
/** A vehicle whose Sheet Options tick Minion Vehicle. */
export function isMinionVehicle(actor) {
  return actor?.type === "vehicle" && actor?.flags?.starwarsffg?.config?.minionVehicle === true;
}

/**
 * Where a group's combined damage lives and what it is measured against: a minion's wounds by
 * `unit_wounds`, a minion vehicle's hull trauma by its per-vehicle threshold. `null` for anything
 * that is not a group.
 */
export function groupTrack(actor) {
  const system = actor?.system;
  if (actor?.type === "minion") {
    return {
      path: "system.stats.wounds.value",
      damage: toCount(system?.stats?.wounds?.value),
      perUnit: toCount(system?.unit_wounds?.value),
      size: toCount(system?.quantity?.max),
    };
  }
  if (isMinionVehicle(actor)) {
    const hull = system?.stats?.hullTrauma;
    return {
      path: "system.stats.hullTrauma.value",
      // Prepared data keeps the per-vehicle threshold as `unit`; unprepared data still has it in `max`.
      damage: toCount(hull?.value),
      perUnit: toCount(hull?.unit ?? hull?.max),
      size: toCount(system?.quantity?.max),
    };
  }
  return null;
}

/**
 * Options for `get_dice_pool` when a crew member rolls for a vehicle. A minion vehicle group ranks
 * the crew's group skills by ITS vehicles left, read from the actor given -- the sheet's own actor,
 * which is the token actor on an unlinked squadron -- never from a lookup by id.
 */
export function crewRollOptions(vehicleActor) {
  if (!isMinionVehicle(vehicleActor)) return {};
  return { groupSkillRank: groupSkillRank(vehicleActor.system?.quantity?.value) };
}

/** A skill's rank for a roll: the group rank for a group skill when one is given, its own otherwise. */
export function effectiveSkillRank(skill, options = {}) {
  if (skill?.groupskill && Number.isFinite(options?.groupSkillRank)) return options.groupSkillRank;
  return Number(skill?.rank) || 0;
}

/**
 * A copy of a crew actor's system data with its group skills at the group rank, for code that
 * reads skill ranks straight off system data (combat initiative). The crew actor's own prepared
 * data is never modified.
 */
export function withGroupSkillRanks(system, options = {}) {
  if (!system?.skills || !Number.isFinite(options?.groupSkillRank)) return system;
  const skills = {};
  for (const [key, skill] of Object.entries(system.skills)) {
    skills[key] = skill?.groupskill ? { ...skill, rank: options.groupSkillRank } : skill;
  }
  return { ...system, skills };
}

/** Read a path from update data whose keys may be nested, dotted, or a mix of both. */
function readUpdateValue(changes, path) {
  const parts = path.split(".");
  let node = changes;
  for (let index = 0; index < parts.length; index++) {
    if (node === null || typeof node !== "object") return undefined;
    const rest = parts.slice(index).join(".");
    if (Object.hasOwn(node, rest)) return node[rest];
    node = node[parts[index]];
  }
  return node;
}

/**
 * The prototype token change that goes with switching Minion Vehicle on a world vehicle: unlinked
 * while it is a group, like a minion, so each token placed is its own squadron; linked again when
 * it is not. Sheet Options writes every option on each Accept, so only an actual change counts. A
 * token actor has no prototype token of its own to change.
 */
export function prototypeLinkUpdate(actor, changes) {
  if (actor?.type !== "vehicle" || actor?.isToken) return null;
  const next = readUpdateValue(changes, "flags.starwarsffg.config.minionVehicle");
  if (typeof next !== "boolean" || next === isMinionVehicle(actor)) return null;
  return { actorLink: !next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/node/minion-group-actor.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass (858).

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/minion-group.js tests/node/minion-group-actor.test.mjs
git commit -m "Decide group tracks, crew skill ranks and token links for minion vehicles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The toggle, the group size and the pooled hull

**Files:**
- Modify: `modules/data/models/actor/vehicle.js:59-60` (before `spaceShip`)
- Modify: `modules/actors/actor-ffg.js:1-5` (imports), `:176` (`_preUpdate` end), `:254-256` (vehicle over-threshold branch)
- Modify: `modules/actors/actor-sheet-ffg.js:726-745` (vehicle Sheet Options)
- Modify: `lang/en.json:482` (after `SWFFG.EnableSensorsHint`)

**Interfaces:**
- Consumes (Tasks 1–2): `prepareMinionVehicleHull(system)`, `isMinionVehicle(actor)`, `prototypeLinkUpdate(actor, changes)`.
- Produces:
  - Stored `system.quantity.max` on vehicles.
  - Prepared `system.quantity.value`, `system.stats.hullTrauma.unit` and the pooled `system.stats.hullTrauma.max` whenever `flags.starwarsffg.config.minionVehicle === true`.
  - The **Minion Vehicle** Sheet Option.
  - Lang keys `SWFFG.MinionVehicle`, `SWFFG.MinionVehicleHint`.

- [ ] **Step 1: Add the group size to the vehicle data model**

In `modules/data/models/actor/vehicle.js`, replace:

```js
      spaceShip: new f.BooleanField({ initial: false }),
```

with:

```js
      // A minion vehicle group's size (Sheet Options -> Minion Vehicle). `max` is stored; `value`,
      // the vehicles left, is derived from hull trauma in ActorFFG#prepareDerivedData while the
      // option is on and unused while it is off. The same shape as a minion's `quantity`, so the
      // token tally reads either.
      quantity: new f.SchemaField({ value: num(1), max: num(1) }),
      spaceShip: new f.BooleanField({ initial: false }),
```

- [ ] **Step 2: Pool the hull in prepared data**

In `modules/actors/actor-ffg.js`, add after the line `import { buildSkillDefaults } from "../helpers/skill-defaults.js";`:

```js
import { isMinionVehicle, prepareMinionVehicleHull, prototypeLinkUpdate } from "../helpers/minion-group.js";
```

Replace:

```js
    } else if (["vehicle"].includes(actor.type)) {
      data.stats.hullOverThreshold = data.stats.hullTrauma.value - data.stats.hullTrauma.max;
```

with:

```js
    } else if (["vehicle"].includes(actor.type)) {
      // A minion vehicle group pools its hull FIRST, so this over-threshold figure, the token bar
      // and both sheets all read the whole group's threshold.
      if (isMinionVehicle(actor)) prepareMinionVehicleHull(data);
      data.stats.hullOverThreshold = data.stats.hullTrauma.value - data.stats.hullTrauma.max;
```

- [ ] **Step 3: Flip the prototype token link with the option**

In `modules/actors/actor-ffg.js`, the `_preUpdate` method ends with `    await super._preUpdate(changes, options, user);` (line 176, the first occurrence in the file). Replace that line with:

```js
    // Turning Minion Vehicle on unlinks the prototype token, as a minion's is, so each token
    // placed is its own group; turning it off links it again. Tokens already on a scene keep
    // whatever link they have.
    const linkUpdate = prototypeLinkUpdate(this, changes);
    if (linkUpdate) {
      changes.prototypeToken = foundry.utils.mergeObject(changes.prototypeToken ?? {}, linkUpdate);
    }
    await super._preUpdate(changes, options, user);
```

- [ ] **Step 4: Register the Sheet Option**

In `modules/actors/actor-sheet-ffg.js`, inside `if (this.actor.type === "vehicle") {`, replace:

```js
      this.sheetoptions.register("enableSensors", {
        name: game.i18n.localize("SWFFG.EnableSensors"),
        hint: game.i18n.localize("SWFFG.EnableSensorsHint"),
        type: "Boolean",
        default: true,
      });
```

with:

```js
      this.sheetoptions.register("enableSensors", {
        name: game.i18n.localize("SWFFG.EnableSensors"),
        hint: game.i18n.localize("SWFFG.EnableSensorsHint"),
        type: "Boolean",
        default: true,
      });
      // A squadron of identical minion-crewed craft run with the minion rules. Accept re-renders
      // the sheet, so the group controls appear or go at once.
      this.sheetoptions.register("minionVehicle", {
        name: game.i18n.localize("SWFFG.MinionVehicle"),
        hint: game.i18n.localize("SWFFG.MinionVehicleHint"),
        type: "Boolean",
        default: false,
      });
```

- [ ] **Step 5: Add the strings**

In `lang/en.json`, replace:

```json
  "SWFFG.EnableSensorsHint": "Enable the sensor box for this vehicle",
```

with:

```json
  "SWFFG.EnableSensorsHint": "Enable the sensor box for this vehicle",
  "SWFFG.MinionVehicle": "Minion Vehicle",
  "SWFFG.MinionVehicleHint": "Treat this vehicle as a group of identical minion vehicles, such as a TIE squadron. Hull Trauma Threshold is per vehicle: the group's threshold is that value × vehicles in the group, and a vehicle is destroyed each time the damage passes another per-vehicle threshold. Crew group skills roll at vehicles left − 1 (max 5). A critical hit destroys one vehicle. System Strain is shared by the group. Turning this on unlinks the prototype token so each token you place is its own group.",
```

- [ ] **Step 6: Run the gates**

Run: `npm test` (the lang expansion test covers the new keys), `npm run check:imports`, `npm run lint`
Expected: tests pass (858); gate `PASS`; lint shows `82 errors` or fewer.

- [ ] **Step 7: Commit**

```bash
git add modules/data/models/actor/vehicle.js modules/actors/actor-ffg.js modules/actors/actor-sheet-ffg.js lang/en.json
git commit -m "Pool a minion vehicle group's hull behind a Minion Vehicle sheet option

The stored hull threshold stays per vehicle; prepared data multiplies it by
the new group size and derives the vehicles left. Switching the option on a
world vehicle unlinks or relinks its prototype token.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Crew rolls at the group's strength

**Files:**
- Modify: `modules/helpers/dice-helpers.js:371-390` (`get_dice_pool`) and its imports at the top of the file
- Modify: `modules/helpers/crew.js:1-3`, `:148-196` (`build_crew_roll`), `:198-239` (`buildPilotRoll`), `:247-251` (`handlePilotCheck`)
- Modify: `modules/actors/actor-sheet-ffg.js:17-26` (imports), `:416-418` (crew preview), `:1397`, `:1428`, `:1798` (`get_dice_pool` calls)
- Modify: `modules/combat-ffg.js:1-2` (imports), `:1073-1092` (`_findActorForInitiative`)

**Interfaces:**
- Consumes (Task 2): `crewRollOptions(vehicleActor)`, `effectiveSkillRank(skill, options)`, `withGroupSkillRanks(system, options)`.
- Produces:
  - `get_dice_pool(actor_id, skill_name, incoming_roll, options = {})`
  - `build_crew_roll(vehicle: Actor|string, crew_id, crew_role)`
  - `buildPilotRoll(vehicle: Actor|string, pilot_id, difficulty = 2)`

- [ ] **Step 1: Let the dice pool take a group rank**

In `modules/helpers/dice-helpers.js`, add after `import { characterDefenceDice } from "./defence-helpers.js";`:

```js
import { effectiveSkillRank } from "./minion-group.js";
```

Replace:

```js
 * @param incoming_roll existing dice, e.g. difficulty dice
 * @returns {DicePoolFFG}
 */
export function get_dice_pool(actor_id, skill_name, incoming_roll) {
```

with:

```js
 * @param incoming_roll existing dice, e.g. difficulty dice
 * @param options.groupSkillRank the rank the actor's GROUP skills roll at, when a crew member rolls
 *   for a minion vehicle group (see crewRollOptions in minion-group.js); other skills keep theirs
 * @returns {DicePoolFFG}
 */
export function get_dice_pool(actor_id, skill_name, incoming_roll, options = {}) {
```

and replace:

```js
  const skillRank = Number(skill.rank) || 0;
```

with:

```js
  const skillRank = effectiveSkillRank(skill, options);
```

- [ ] **Step 2: Resolve the vehicle actor in crew rolls**

In `modules/helpers/crew.js`, replace:

```js
import DiceHelpers from "../helpers/dice-helpers.js";
```

with:

```js
import DiceHelpers from "../helpers/dice-helpers.js";
import { crewRollOptions } from "./minion-group.js";

/**
 * The vehicle a crew roll is for. An id resolves to the WORLD actor, which is wrong for an unlinked
 * token -- a minion vehicle squadron's own hull and vehicles left live on the token actor -- so
 * sheets pass the actor itself. Ids are still accepted for macros.
 */
function resolveVehicle(vehicle) {
  return typeof vehicle === "string" ? game.actors.get(vehicle) : vehicle;
}
```

In `build_crew_roll`, replace:

```js
 * @param vehicle actor object for the vehicle the crew is on
```

with:

```js
 * @param vehicle the vehicle actor the crew is on (or its actor ID)
```

and replace:

```js
  const vehicle_actor = game.actors.get(vehicle);
```

with:

```js
  const vehicle_actor = resolveVehicle(vehicle);
```

and replace:

```js
  pool = get_dice_pool(crew_id, role_info[0].role_skill, pool);
  return pool.renderPreview().innerHTML;
```

with:

```js
  pool = get_dice_pool(crew_id, role_info[0].role_skill, pool, crewRollOptions(vehicle_actor));
  return pool.renderPreview().innerHTML;
```

Replace the start of `buildPilotRoll`:

```js
 * @param vehicle_id - the vehicle actor object
 * @param pilot_id - the actor ID of the pilot
 * @param difficulty - the difficulty of the check (omit to default to "average")
 * @returns {Promise<Window.DicePoolFFG>}
 */
export async function buildPilotRoll(vehicle_id, pilot_id, difficulty = 2) {
  const starting_pool = {'difficulty': difficulty};
  const vehicle = game.actors.get(vehicle_id);
```

with:

```js
 * @param vehicleOrId - the vehicle actor (or its actor ID)
 * @param pilot_id - the actor ID of the pilot
 * @param difficulty - the difficulty of the check (omit to default to "average")
 * @returns {Promise<Window.DicePoolFFG>}
 */
export async function buildPilotRoll(vehicleOrId, pilot_id, difficulty = 2) {
  const starting_pool = {'difficulty': difficulty};
  const vehicle = resolveVehicle(vehicleOrId);
```

and replace:

```js
  // update the pool with actor information
  return get_dice_pool(pilot_id, skill, pool);
```

with:

```js
  // update the pool with actor information
  return get_dice_pool(pilot_id, skill, pool, crewRollOptions(vehicle));
```

In `handlePilotCheck`, replace:

```js
  const pool = await buildPilotRoll(vehicle.id, pilot_id);
```

with:

```js
  const pool = await buildPilotRoll(vehicle, pilot_id);
```

- [ ] **Step 3: Pass the sheet's own vehicle from the sheet**

In `modules/actors/actor-sheet-ffg.js`, add after `import {get_dice_pool} from "../helpers/dice-helpers.js";`:

```js
import { crewRollOptions } from "../helpers/minion-group.js";
```

Replace:

```js
                  roll = build_crew_roll(this.actor.id, crew[i].actor_id, crew[i].role);
                } else {
                  roll = (await buildPilotRoll(this.actor.id, crew[i].actor_id, 0)).renderPreview().innerHTML;
```

with:

```js
                  roll = build_crew_roll(this.actor, crew[i].actor_id, crew[i].role);
                } else {
                  roll = (await buildPilotRoll(this.actor, crew[i].actor_id, 0)).renderPreview().innerHTML;
```

Replace (weapon-picker gunner path inside `.roll-button-crew`):

```js
              pool = get_dice_pool(crew_id, skill, pool);
```

with:

```js
              pool = get_dice_pool(crew_id, skill, pool, crewRollOptions(ship));
```

Replace (role-skill path inside `.roll-button-crew`):

```js
        pool = get_dice_pool(crew_id, role_info[0].role_skill, pool);
```

with:

```js
        pool = get_dice_pool(crew_id, role_info[0].role_skill, pool, crewRollOptions(ship));
```

Replace (in `vehicleCrewGunneryRoll`):

```js
    pool = get_dice_pool(selectedGunner.actor_id, weaponSkill, pool);
```

with:

```js
    pool = get_dice_pool(selectedGunner.actor_id, weaponSkill, pool, crewRollOptions(ship));
```

- [ ] **Step 4: Scale the pilot's initiative skills**

In `modules/combat-ffg.js`, replace:

```js
import PopoutEditor from "./popout-editor.js";
```

with:

```js
import PopoutEditor from "./popout-editor.js";
import { crewRollOptions, withGroupSkillRanks } from "./helpers/minion-group.js";
```

In `_findActorForInitiative`, replace:

```js
        if (realActor?.system) {
          data = realActor.system;
        }
```

with:

```js
        if (realActor?.system) {
          // A minion vehicle group's pilot rolls Cool/Vigilance at the group's strength, read from
          // this combatant's own vehicle (the token actor on an unlinked squadron).
          data = withGroupSkillRanks(realActor.system, crewRollOptions(c.actor));
        }
```

- [ ] **Step 5: Run the gates**

Run: `npm test`, `npm run check:imports`, `npm run lint`
Expected: tests pass (858); gate `PASS`; lint `82 errors` or fewer, and no new warnings.

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/dice-helpers.js modules/helpers/crew.js modules/actors/actor-sheet-ffg.js modules/combat-ffg.js
git commit -m "Roll crew group skills at a minion vehicle group's strength

Weapon, crew-role and pilot rolls, the Crew tab dice preview and pilot
initiative rank the crew's group skills at vehicles left - 1. Crew rolls
read the sheet's own vehicle instead of the world actor, so an unlinked
squadron token counts its own vehicles.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Destroying vehicles, critical hits and the token tally

**Files:**
- Modify: `modules/helpers/minions.js:1-12`
- Modify: `modules/helpers/gm-bridge.js:16-18` (imports), `:46-78` (`narrowApplyRequest`), `:128` (`prepareForwardedApply`)
- Modify: `modules/helpers/apply-crit.js:9` (imports), `:87` (minion branch)
- Modify: `modules/swffg-main.js:59` (imports), `:2268` (`refreshToken`)
- Modify: `lang/en.json:857` (`SWFFG.Settings.showMinionCount.Hint`)
- Test: `tests/node/minion-kill-helpers.test.mjs` (new), `tests/node/gm-bridge-apply.test.mjs`

**Interfaces:**
- Consumes (Tasks 1–2): `isMinionVehicle`, `groupTrack`, `stepUnits`, `wipeOutDamage`.
- Produces:
  - `getKillMinionUpdate(actor)` / `getKillMinionGroupUpdate(actor)` return hull updates for minion vehicles.
  - `narrowApplyRequest(data, actorType, { minionGroup = false } = {})`

- [ ] **Step 1: Write the failing tests**

Create `tests/node/minion-kill-helpers.test.mjs`:

```js
/**
 * The kill and wipe-out updates behind the sheet buttons, the Codex Wipe Out and Apply Crit.
 * A minion vehicle group loses a whole vehicle and keeps the partial hull damage on the next one.
 * Minions keep their existing arithmetic.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getKillMinionUpdate, getKillMinionGroupUpdate } from "../../modules/helpers/minions.js";

/** A prepared squadron of 4 with 6 hull each. */
const squadron = (value, hull = { value, max: 24, unit: 6 }) => ({
  type: "vehicle",
  flags: { starwarsffg: { config: { minionVehicle: true } } },
  system: { stats: { hullTrauma: hull }, quantity: { value: 4, max: 4 } },
});

test("destroying a vehicle in a minion vehicle group keeps the partial hull damage", () => {
  assert.deepEqual(getKillMinionUpdate(squadron(0)), { "system.stats.hullTrauma.value": 7 });
  assert.deepEqual(getKillMinionUpdate(squadron(3)), { "system.stats.hullTrauma.value": 9 });
  assert.equal(getKillMinionUpdate(squadron(25)), null);
});

test("a group with no per-vehicle hull cannot lose a vehicle", () => {
  assert.equal(getKillMinionUpdate(squadron(0, { value: 0, max: 0, unit: 0 })), null);
});

test("wiping out a minion vehicle group takes it one past the group threshold", () => {
  assert.deepEqual(getKillMinionGroupUpdate(squadron(3)), { "system.stats.hullTrauma.value": 25 });
});

test("a plain vehicle is not a group, and minions keep their existing arithmetic", () => {
  const plain = { type: "vehicle", flags: {}, system: { stats: { hullTrauma: { value: 0, max: 6 } } } };
  assert.equal(getKillMinionUpdate(plain), null);

  const minion = {
    type: "minion",
    system: { stats: { wounds: { value: 0, max: 12 } }, unit_wounds: { value: 3 }, quantity: { value: 4, max: 4 } },
  };
  assert.deepEqual(getKillMinionUpdate(minion), { "system.stats.wounds.value": 4 });
  assert.deepEqual(getKillMinionGroupUpdate(minion), { "system.stats.wounds.value": 13 });
});
```

In `tests/node/gm-bridge-apply.test.mjs`, replace:

```js
import {
  narrowApplyRequest,
  isApplyRequestAuthorized,
  DAMAGE_PATHS,
  CRIT_ITEM_TYPES,
} from "../../modules/helpers/gm-bridge.js";
```

with:

```js
import {
  narrowApplyRequest,
  isApplyRequestAuthorized,
  prepareForwardedApply,
  DAMAGE_PATHS,
  CRIT_ITEM_TYPES,
} from "../../modules/helpers/gm-bridge.js";
```

and add after the test `"only a minion may be killed by a forwarded request"`:

```js
test("a minion vehicle group may lose a vehicle to a forwarded request; a plain vehicle may not", () => {
  assert.deepEqual(
    narrowApplyRequest({ type: "kill-minion" }, "vehicle", { minionGroup: true }),
    { ok: true, op: { type: "kill-minion" } },
  );
  assert.equal(narrowApplyRequest({ type: "kill-minion" }, "vehicle", { minionGroup: false }).reason, "not-a-minion");
  assert.equal(narrowApplyRequest({ type: "kill-minion" }, "character", { minionGroup: true }).reason, "not-a-minion");
});

test("the minion vehicle check is made on the resolved target, not the payload", () => {
  const requestor = { id: "p1", active: true, isGM: false };
  const squadron = {
    type: "vehicle",
    flags: { starwarsffg: { config: { minionVehicle: true } } },
    testUserPermission: () => false,
  };
  assert.deepEqual(
    prepareForwardedApply(squadron, { type: "kill-minion", minionGroup: true, path: "x" }, requestor, true),
    { type: "kill-minion" },
  );
  const plain = { ...squadron, flags: {} };
  assert.throws(
    () => prepareForwardedApply(plain, { type: "kill-minion", minionGroup: true }, requestor, true),
    /not-a-minion/,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/node/minion-kill-helpers.test.mjs tests/node/gm-bridge-apply.test.mjs`
Expected: FAIL.
- The squadron kill and wipe-out cases get the minion arithmetic: `null` for a kill, because the existing path reads `unit_wounds`.
- `narrowApplyRequest(..., "vehicle", { minionGroup: true })` still returns `not-a-minion`.
- `prepareForwardedApply` throws for the squadron.

- [ ] **Step 3: Branch the kill helpers for minion vehicles**

In `modules/helpers/minions.js`, replace:

```js
export function getKillMinionUpdate(actor) {
  const minionHealth = Number(actor?.system?.unit_wounds?.value) || 0;
```

with:

```js
import { groupTrack, isMinionVehicle, stepUnits, wipeOutDamage } from "./minion-group.js";

export function getKillMinionUpdate(actor) {
  // A minion vehicle group loses one whole vehicle and keeps any partial hull damage on the next.
  if (isMinionVehicle(actor)) {
    const track = groupTrack(actor);
    if (track.perUnit <= 0) return null;
    const next = stepUnits(track.damage, track.perUnit, track.size, -1);
    return next === track.damage ? null : { [track.path]: next };
  }

  const minionHealth = Number(actor?.system?.unit_wounds?.value) || 0;
```

and replace:

```js
export function getKillMinionGroupUpdate(actor) {
  const maxWounds = Number(actor?.system?.stats?.wounds?.max) || 0;
```

with:

```js
export function getKillMinionGroupUpdate(actor) {
  if (isMinionVehicle(actor)) {
    const track = groupTrack(actor);
    return { [track.path]: wipeOutDamage(track.perUnit, track.size) };
  }

  const maxWounds = Number(actor?.system?.stats?.wounds?.max) || 0;
```

- [ ] **Step 4: Let the GM bridge destroy a vehicle in a group**

In `modules/helpers/gm-bridge.js`, replace:

```js
import { killMinion } from "./minions.js";
```

with:

```js
import { killMinion } from "./minions.js";
import { isMinionVehicle } from "./minion-group.js";
```

Replace:

```js
 * @param {object} data       The raw socket payload.
 * @param {string} actorType  The resolved target actor's `type`.
 * @returns {{ok: true, op: object}|{ok: false, reason: string}}
 */
export function narrowApplyRequest(data, actorType) {
```

with:

```js
 * @param {object} data       The raw socket payload.
 * @param {string} actorType  The resolved target actor's `type`.
 * @param {object} [target]   Facts about the resolved target, never taken from the payload.
 * @param {boolean} [target.minionGroup]  The target is a vehicle with Minion Vehicle on.
 * @returns {{ok: true, op: object}|{ok: false, reason: string}}
 */
export function narrowApplyRequest(data, actorType, { minionGroup = false } = {}) {
```

Replace:

```js
    case "kill-minion": {
      if (actorType !== "minion") return { ok: false, reason: "not-a-minion" };
```

with:

```js
    case "kill-minion": {
      // A crit on a minion vehicle group destroys one vehicle, as one on a minion group kills one minion.
      const isGroup = actorType === "minion" || (actorType === "vehicle" && minionGroup === true);
      if (!isGroup) return { ok: false, reason: "not-a-minion" };
```

Replace:

```js
  const narrowed = narrowApplyRequest(data, actor.type);
```

with:

```js
  const narrowed = narrowApplyRequest(data, actor.type, { minionGroup: isMinionVehicle(actor) });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/node/minion-kill-helpers.test.mjs tests/node/gm-bridge-apply.test.mjs`
Expected: PASS.

- [ ] **Step 6: Send crits on a minion vehicle group down the minion branch**

In `modules/helpers/apply-crit.js`, replace:

```js
import { applyToTargetActor } from "./gm-bridge.js";
```

with:

```js
import { applyToTargetActor } from "./gm-bridge.js";
import { isMinionVehicle } from "./minion-group.js";
```

Replace:

```js
    if (type === "minion") {
      try {
```

with:

```js
    // A crit on a minion group takes out one member instead of rolling on a table: one minion,
    // or one vehicle of a minion vehicle group.
    if (type === "minion" || isMinionVehicle(realActor)) {
      try {
```

- [ ] **Step 7: Draw the token tally for minion vehicle groups**

In `modules/swffg-main.js`, replace:

```js
import {drawAdversaryCount, drawMinionCount, registerTokenControls} from "./helpers/token.js";
```

with:

```js
import {drawAdversaryCount, drawMinionCount, registerTokenControls} from "./helpers/token.js";
import { isMinionVehicle } from "./helpers/minion-group.js";
```

Replace:

```js
    if (token?.actor?.type === "minion") {
      drawMinionCount(token);
    }
```

with:

```js
    if (token?.actor?.type === "minion" || isMinionVehicle(token?.actor)) {
      drawMinionCount(token);
    }
```

In `lang/en.json`, replace:

```json
  "SWFFG.Settings.showMinionCount.Hint": "Shows alive/total minions in group on tokens",
```

with:

```json
  "SWFFG.Settings.showMinionCount.Hint": "Shows alive/total minions in group on tokens, and vehicles left/total on minion vehicle groups",
```

- [ ] **Step 8: Run the gates**

Run: `npm test`, `npm run check:imports`, `npm run lint`
Expected: tests pass (858 + 4 + 2 = 864); gate `PASS`; lint `82 errors` or fewer.

- [ ] **Step 9: Commit**

```bash
git add modules/helpers/minions.js modules/helpers/gm-bridge.js modules/helpers/apply-crit.js modules/swffg-main.js lang/en.json tests/node/minion-kill-helpers.test.mjs tests/node/gm-bridge-apply.test.mjs
git commit -m "Destroy one vehicle of a minion vehicle group on a crit or kill

Apply Crit, the kill and wipe-out helpers and the GM bridge treat a minion
vehicle like a minion group, and its token shows the vehicles-left tally.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Classic vehicle sheet

**Files:**
- Modify: `modules/actors/actor-sheet-ffg.js:396-401` (vehicle `getData`), `:571-593` (forced render)
- Modify: `templates/actors/ffg-vehicle-sheet.html:99-100` (hull box), `:108` (after the four-box grid)
- Modify: `scss/components/_vehiclesheet.scss:18-24` (`.header-fields .grid`)
- Modify: `lang/en.json` (after `SWFFG.MinionVehicleHint`)

**Interfaces:**
- Consumes:
  - `isMinionVehicle` (Task 2).
  - Prepared `hullTrauma.unit`, `quantity.value` and pooled `hullTrauma.max` (Task 3).
  - `.minion-control` click handler → `killMinion` / `killMinionGroup` (Task 5).
- Produces sheet context, which the Codex sheet also reads in Task 7:
  - `isMinionVehicle: boolean`
  - `minionVehicle: { perVehicle: number }`

- [ ] **Step 1: Expose the group context**

In `modules/actors/actor-sheet-ffg.js`, replace the import added in Task 4:

```js
import { crewRollOptions } from "../helpers/minion-group.js";
```

with:

```js
import { crewRollOptions, isMinionVehicle } from "../helpers/minion-group.js";
```

Then replace:

```js
        data.vehicleTalents = this.actor.items.filter((item) => item.type === "talent");
```

with:

```js
        data.vehicleTalents = this.actor.items.filter((item) => item.type === "talent");
        // A minion vehicle group's sheet edits the per-vehicle hull threshold, which prepared data
        // keeps as `hullTrauma.unit`. That key is not in the schema, so the serialized `data.data`
        // copy above drops it; `data.data.stats.hullTrauma.max` there is the whole group's.
        data.isMinionVehicle = isMinionVehicle(this.actor);
        if (data.isMinionVehicle) {
          const hull = this.actor.system.stats.hullTrauma;
          data.minionVehicle = { perVehicle: hull.unit ?? hull.max };
        }
```

- [ ] **Step 2: Re-render when a group input changes**

In `modules/actors/actor-sheet-ffg.js`, replace:

```js
    if (this.actor.type === "minion") {
      const minionDerivedInputs = [
        'input[name="data.unit_wounds.value"]',
        'input[name="data.quantity.max"]',
        'input[name="data.stats.wounds.value"]',
      ].join(", ");
```

with:

```js
    // A minion vehicle group derives the same way from its hull: per-vehicle threshold and group
    // size -> group threshold, hull trauma -> vehicles left -> the crew's dice previews.
    if (this.actor.type === "minion" || isMinionVehicle(this.actor)) {
      const minionDerivedInputs = (this.actor.type === "minion"
        ? [
          'input[name="data.unit_wounds.value"]',
          'input[name="data.quantity.max"]',
          'input[name="data.stats.wounds.value"]',
        ]
        : [
          'input[name="data.stats.hullTrauma.max"]',
          'input[name="data.quantity.max"]',
          'input[name="data.stats.hullTrauma.value"]',
        ]).join(", ");
```

- [ ] **Step 3: Show the per-vehicle threshold in the Hull Trauma box**

In `templates/actors/ffg-vehicle-sheet.html`, replace:

```handlebars
          {{!-- Hull Trauma Box --}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.VehicleHullTrauma" fields=(array (object name="data.stats.hullTrauma.max" value=data.stats.hullTrauma.max type="Number" label="SWFFG.Threshold" disabled=disabled) (object name="data.stats.hullTrauma.value" value=data.stats.hullTrauma.value type="Number" label="SWFFG.Current") ))}}
```

with:

```handlebars
          {{!-- Hull Trauma Box. A minion vehicle group edits its PER-VEHICLE threshold here: the
                input still writes the stored threshold, which is per vehicle, while the prepared
                max is the whole group's and is shown read-only in the group row below. --}}
          {{#if isMinionVehicle}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.VehicleHullTrauma" fields=(array (object name="data.stats.hullTrauma.max" value=minionVehicle.perVehicle type="Number" label="SWFFG.MinionVehiclePerVehicle" disabled=disabled) (object name="data.stats.hullTrauma.value" value=data.stats.hullTrauma.value type="Number" label="SWFFG.Current") ))}}
          {{else}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.VehicleHullTrauma" fields=(array (object name="data.stats.hullTrauma.max" value=data.stats.hullTrauma.max type="Number" label="SWFFG.Threshold" disabled=disabled) (object name="data.stats.hullTrauma.value" value=data.stats.hullTrauma.value type="Number" label="SWFFG.Current") ))}}
          {{/if}}
```

- [ ] **Step 4: Add the group row under the four boxes**

In `templates/actors/ffg-vehicle-sheet.html`, replace:

```handlebars
          {{!-- Encumbrance Capacity Box --}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.VehicleEncumbranceCapacity" fields=(array (object name="data.stats.encumbrance.max" value=data.stats.encumbrance.max type="Number" label="SWFFG.Threshold" disabled=disabled) (object name="data.stats.encumbrance.value" value=data.stats.encumbrance.value type="Number" label="SWFFG.Current") ))}}
        </div>
      </div>
```

with:

```handlebars
          {{!-- Encumbrance Capacity Box --}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.VehicleEncumbranceCapacity" fields=(array (object name="data.stats.encumbrance.max" value=data.stats.encumbrance.max type="Number" label="SWFFG.Threshold" disabled=disabled) (object name="data.stats.encumbrance.value" value=data.stats.encumbrance.value type="Number" label="SWFFG.Current") ))}}
        </div>
      </div>
      {{#if isMinionVehicle}}
      {{!-- Minion vehicle group: size and vehicles left, the whole group's threshold (unnamed and
            disabled, so it is never submitted), and the destroy buttons the .minion-control
            listener already handles. --}}
      <div class="container flex-group-center">
        <div class="grid grid-3col minion-vehicle-stats">
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.MinionVehicleCount" fields=(array (object name="data.quantity.max" value=data.quantity.max type="Number" label="SWFFG.MinionQuantityMax") (object name="data.quantity.value" value=data.quantity.value type="Number" label="SWFFG.MinionVehicleLeft" disabled=true) ))}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="single" title="SWFFG.MinionVehicleGroupThreshold" type="Number" value=data.stats.hullTrauma.max disabled=true)}}
          {{> "systems/starwarsffg/templates/parts/shared/ffg-block.html" (object blocktype="split" title="SWFFG.MinionVehicleLosses" fields=(array (object name="minion-control kill-minion" type="Button" icon='<a class="fa-solid fa-skull-crossbones"></a>' label="SWFFG.MinionVehicleDestroy") (object name="minion-control kill-group" type="Button" icon='<a><i class="fa-solid fa-skull-crossbones"></i><i class="fa-solid fa-jet-fighter"></i><i class="fa-solid fa-skull-crossbones"></i></a>' label="SWFFG.MinionVehicleWipeOut") ))}}
        </div>
      </div>
      {{/if}}
```

- [ ] **Step 5: Space the group row like the four-box grid**

In `scss/components/_vehiclesheet.scss`, replace:

```scss
        .grid {
          margin: 5px;

          &.grid-4col {
            margin: 10px;
          }
        }
```

with:

```scss
        .grid {
          margin: 5px;

          &.grid-4col {
            margin: 10px;
          }

          // Minion vehicle group row, directly under the four stat boxes.
          &.minion-vehicle-stats {
            margin: 0 10px 10px;
          }
        }
```

- [ ] **Step 6: Add the strings**

In `lang/en.json`, add after the `"SWFFG.MinionVehicleHint": ...` line from Task 3:

```json
  "SWFFG.MinionVehiclePerVehicle": "Per Vehicle",
  "SWFFG.MinionVehicleCount": "Vehicles in Group",
  "SWFFG.MinionVehicleLeft": "Left",
  "SWFFG.MinionVehicleGroupThreshold": "Group Hull Threshold",
  "SWFFG.MinionVehicleLosses": "Destroy",
  "SWFFG.MinionVehicleDestroy": "Vehicle",
  "SWFFG.MinionVehicleWipeOut": "Group",
```

- [ ] **Step 7: Run the gates and compile the styles**

Run: `npm test`, `npm run check:imports`, `npm run lint`, `npm run compile`
Expected:
- tests pass (864)
- gate `PASS`, which also resolves the template partial paths
- lint `82 errors` or fewer
- `gulp css` finishes without errors and `styles/starwarsffg.css` (tracked; gulp writes `scss/starwarsffg.scss` there) contains `.minion-vehicle-stats`

- [ ] **Step 8: Commit**

```bash
git add modules/actors/actor-sheet-ffg.js templates/actors/ffg-vehicle-sheet.html scss/components/_vehiclesheet.scss styles/starwarsffg.css lang/en.json
git commit -m "Show a minion vehicle group's size, threshold and losses on the classic sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Codex vehicle sheet

**Files:**
- Modify: `modules/actors/codex-sheets.js:26` (imports), `:822-856` (group stepper), `:1538-1545` (vehicle context), `:1601-1605` (fallback context)
- Modify: `templates/actors/codex/codex-vehicle.html:32-49` (Hull Trauma card and the row after it)
- Modify: `styles/cdx.css:632`, `styles/cdx-eldritch.css:719`
- Modify: `lang/codex/en.json` (after `SWFFG.Codex.WoundsSuffered`)

**Interfaces:**
- Consumes:
  - `groupTrack(actor)`, `stepUnits(...)`, `hullPoolSegments(...)` (Tasks 1–2)
  - `isMinionVehicle` and `minionVehicle.perVehicle` context (Task 6)
  - `killMinionGroup` dispatch (Task 5)
- Produces context:
  - `cdxVehHullGroups: Array<{bar, pips?|pct?}>`
  - `cdxVehHullHint: string`

- [ ] **Step 1: Route the Group Strength stepper through the shared rules**

In `modules/actors/codex-sheets.js`, replace:

```js
import { killMinionGroup } from "../helpers/minions.js";
```

with:

```js
import { killMinionGroup } from "../helpers/minions.js";
import { groupTrack, hullPoolSegments, stepUnits } from "../helpers/minion-group.js";
```

Replace the whole block from the comment `    // Minion Group-Strength steppers (members alive ±1). Alive count is DERIVED` down to and including the end of its `forEach`, which is the line `    });` immediately before `    // Wipe Out — eliminate the whole group (wounds → max+1 ⇒ alive 0).`, with:

```js
    // Group-Strength steppers (units left ±1), on a minion's sheet and on a minion vehicle
    // group's. Units left are DERIVED from the group's damage track in prepared data, and the
    // track is 1-indexed -- a unit only drops one point PAST its threshold -- so a flat ±threshold
    // step is off by one. stepUnits (minion-group.js) splits the damage into lost units plus the
    // partial damage on the next one, moves the lost count by one and keeps that partial:
    //   e.g. 3/member, 2 applied, − → 5 wounds = 1 dead + the 2 carried over.
    // groupTrack picks the track: wounds by unit_wounds for a minion, hull trauma by the
    // per-vehicle threshold for a minion vehicle group.
    root.querySelectorAll(".cdx-gs-step").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const dir = Number(ev.currentTarget.dataset.dir) || 0; // −1 destroy, +1 revive
        const track = groupTrack(this.actor);
        if (!track) return;
        const next = stepUnits(track.damage, track.perUnit, track.size, dir);
        if (next === track.damage) return;
        await this.actor.update({ [track.path]: next });
      });
    });
```

Also replace the comment line:

```js
    // Wipe Out — eliminate the whole group (wounds → max+1 ⇒ alive 0).
```

with:

```js
    // Wipe Out — eliminate the whole group (damage → group threshold + 1 ⇒ none left).
```

- [ ] **Step 2: Build the Combined Hull Pool context**

In `modules/actors/codex-sheets.js`, in the vehicle `try` block, replace:

```js
        ctx.cdxVehTracks = {
          hull: this._cdxTrack(Number(s.hullTrauma?.value) || 0, Number(s.hullTrauma?.max) || 0),
          strain: this._cdxTrack(Number(s.systemStrain?.value) || 0, Number(s.systemStrain?.max) || 0),
        };
```

with:

```js
        ctx.cdxVehTracks = {
          hull: this._cdxTrack(Number(s.hullTrauma?.value) || 0, Number(s.hullTrauma?.max) || 0),
          strain: this._cdxTrack(Number(s.systemStrain?.value) || 0, Number(s.systemStrain?.max) || 0),
        };
        // A minion vehicle group's Combined Hull Pool: one segment group per vehicle, filled left
        // to right like the minion wound pool (a bar per vehicle once its hull is too big for pips).
        if (ctx.isMinionVehicle) {
          const perVehicle = ctx.minionVehicle?.perVehicle ?? 0;
          ctx.cdxVehHullGroups = hullPoolSegments(s.hullTrauma?.value, perVehicle, this.actor.system?.quantity?.max);
          ctx.cdxVehHullHint = game.i18n.format("SWFFG.Codex.HullSuffered", { n: perVehicle });
        }
```

In the `catch` fallback, replace:

```js
        ctx.cdxVehTracks = { hull: {}, strain: {} };
```

with:

```js
        ctx.cdxVehTracks = { hull: {}, strain: {} };
        ctx.cdxVehHullGroups = [];
        ctx.cdxVehHullHint = "";
```

- [ ] **Step 3: Swap the Hull Trauma card for Group Strength**

In `templates/actors/codex/codex-vehicle.html`, replace:

```handlebars
      {{!-- Hull Trauma · System Strain --}}
      <div class="cdx-derived">
        <div class="cdx-stat wounds wide">
```

with:

```handlebars
      {{!-- Hull Trauma · System Strain. A minion vehicle group shows Group Strength in the hull
           card's place and its Combined Hull Pool below the row; System Strain is unchanged. --}}
      <div class="cdx-derived">
        {{#if isMinionVehicle}}
        <div class="cdx-stat cdx-gs wide">
          <div class="cdx-stat-head"><span>{{localize "SWFFG.Codex.GroupStrength"}}</span></div>
          <div class="cdx-gs-body">
            <div class="cdx-gs-main">
              <div class="cdx-stepline cdx-gs-counter">
                <button type="button" class="cdx-step cdx-gs-step" data-dir="-1" title="{{localize "SWFFG.MinionVehicleDestroy"}}"><i class="fas fa-minus"></i></button>
                <div class="cdx-gs-count"><span class="cdx-gs-cur">{{data.quantity.value}}</span><span class="cdx-slash">/</span>{{#if disabled}}<span class="cdx-gs-max">{{data.quantity.max}}</span>{{else}}<input class="cdx-gs-max-in" type="text" name="data.quantity.max" value="{{data.quantity.max}}" data-dtype="Number" />{{/if}}</div>
                <button type="button" class="cdx-step cdx-gs-step" data-dir="1"><i class="fas fa-plus"></i></button>
              </div>
              <span class="cdx-gs-label">{{localize "SWFFG.Codex.VehiclesInGroup"}}</span>
            </div>
            <button type="button" class="cdx-wipeout" title="{{localize "SWFFG.MinionVehicleWipeOut"}}"><i class="fa-solid fa-skull-crossbones"></i><span>{{localize "SWFFG.Codex.WipeOut"}}</span></button>
          </div>
        </div>
        {{else}}
        <div class="cdx-stat wounds wide">
```

Then replace:

```handlebars
        <div class="cdx-stat strain wide">
```

with:

```handlebars
        {{/if}}
        <div class="cdx-stat strain wide">
```

- [ ] **Step 4: Add the Combined Hull Pool under the row**

In `templates/actors/codex/codex-vehicle.html`, replace:

```handlebars
      {{!-- Systems panel (key/value; values editable in edit mode) --}}
```

with:

```handlebars
      {{#if isMinionVehicle}}
      {{!-- Combined hull pool: total hull trauma across the group, one segment group per vehicle.
           The per-vehicle input writes the stored threshold, which is per vehicle. --}}
      <div class="cdx-stat cdx-wp">
        <div class="cdx-stat-head"><span>{{localize "SWFFG.Codex.CombinedHullPool"}} · {{#if disabled}}{{minionVehicle.perVehicle}}{{else}}<input class="cdx-wp-unit-in" type="text" name="data.stats.hullTrauma.max" value="{{minionVehicle.perVehicle}}" data-dtype="Number" />{{/if}} {{localize "SWFFG.Codex.PerVehicle"}}</span></div>
        <div class="cdx-wp-body">
          <div class="cdx-stepline cdx-wp-counter">
            <button type="button" class="cdx-step" data-stat="hullTrauma" data-dir="-1"><i class="fas fa-minus"></i></button>
            <div class="cdx-wp-count"><span class="cdx-wp-cur">{{data.stats.hullTrauma.value}}</span><span class="cdx-slash">/</span><span class="cdx-wp-max">{{data.stats.hullTrauma.max}}</span></div>
            <button type="button" class="cdx-step" data-stat="hullTrauma" data-dir="1"><i class="fas fa-plus"></i></button>
            <span class="cdx-wp-label">{{cdxVehHullHint}}</span>
          </div>
          <div class="cdx-wound-track">
            {{#each cdxVehHullGroups}}<div class="cdx-member-group">{{#if this.bar}}<span class="cdx-wound-seg cdx-hull-bar"><span class="cdx-hull-bar-fill" style="width:{{this.pct}}%"></span></span>{{else}}{{#each this.pips}}<span class="cdx-wound-seg{{#if this}} filled{{/if}}"></span>{{/each}}{{/if}}</div>{{/each}}
          </div>
        </div>
      </div>
      {{/if}}

      {{!-- Systems panel (key/value; values editable in edit mode) --}}
```

- [ ] **Step 5: Style the per-vehicle bar**

In `styles/cdx.css`, replace:

```css
.cdx .cdx-wound-seg.filled { background:var(--cdx-ink); }
```

with:

```css
.cdx .cdx-wound-seg.filled { background:var(--cdx-ink); }
/* Minion vehicle group: the vehicle's left column already spaces its children with a gap. */
.cdx .cdx-veh-left > .cdx-wp { margin-top:0; }
/* A per-vehicle hull of 20 or more is one bar per vehicle rather than a row of pips. */
.cdx .cdx-wound-seg.cdx-hull-bar { width:84px; position:relative; overflow:hidden; }
.cdx .cdx-hull-bar-fill { position:absolute; top:0; bottom:0; left:0; background:var(--cdx-ink); }
```

In `styles/cdx-eldritch.css`, replace:

```css
.cdx form.scheme-eldritch .cdx-wound-seg.filled { background:#aaa18e; }
```

with:

```css
.cdx form.scheme-eldritch .cdx-wound-seg.filled { background:#aaa18e; }
.cdx form.scheme-eldritch .cdx-hull-bar-fill { background:#aaa18e; }
```

- [ ] **Step 6: Add the Codex strings**

In `lang/codex/en.json`, replace:

```json
  "SWFFG.Codex.WoundsSuffered": "wounds suffered — every {n} removes a member",
```

with:

```json
  "SWFFG.Codex.WoundsSuffered": "wounds suffered — every {n} removes a member",
  "SWFFG.Codex.VehiclesInGroup": "vehicles in the group",
  "SWFFG.Codex.CombinedHullPool": "Combined Hull Pool",
  "SWFFG.Codex.PerVehicle": "per vehicle",
  "SWFFG.Codex.HullSuffered": "hull trauma suffered — every {n} destroys a vehicle",
```

- [ ] **Step 7: Run the gates**

Run: `npm test`, `npm run check:imports`, `npm run lint`
Expected: tests pass (864), including `minion-group.test.mjs`'s stepper parity case that guards Step 1; gate `PASS`; lint `82 errors` or fewer.

- [ ] **Step 8: Commit**

```bash
git add modules/actors/codex-sheets.js templates/actors/codex/codex-vehicle.html styles/cdx.css styles/cdx-eldritch.css lang/codex/en.json
git commit -m "Show Group Strength and a Combined Hull Pool on the Codex sheet for minion vehicles

The Group Strength stepper now runs through the shared group rules, with
the minion arithmetic unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Changelog and live verification

**Files:**
- Modify: `CHANGELOG.md:3` (top of the `Unreleased` block)

**Interfaces:**
- Consumes: everything above.
- Produces: the user-facing entry; a verified feature.

- [ ] **Step 1: Write the changelog entry**

In `CHANGELOG.md`, replace:

```markdown
`Unreleased`

```

with:

```markdown
`Unreleased`

* Added — **minion vehicle groups** for squadrons of identical craft. Tick *Minion Vehicle* in a vehicle's Sheet Options and its Hull Trauma Threshold becomes per vehicle: the group pools hull trauma, loses a vehicle each time the damage passes another vehicle's threshold, and a critical hit destroys one vehicle. Crew group skills (a TIE Pilot minion's Gunnery, say) roll at vehicles left − 1, and both vehicle sheets and the token tally show how many are left; System Strain stays one track for the group.
  * Turning it on unlinks the vehicle's prototype token so each token placed is its own group. Tokens already on a scene keep their link, so replace them.
```

- [ ] **Step 2: Run every gate**

Run: `npm test`, `npm run check:imports`, `npm run lint`, `npm run compile`
Expected: 864 passing; `PASS`; `82 errors` or fewer; compile clean.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "Describe minion vehicle groups in the changelog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify in a running Foundry world**

Check that Foundry is reachable, at `http://localhost:30000` or the port the user's world uses. If it isn't running, ask the user to start their world, then continue. Reload the world so the changed system code loads. In the in-app browser, logged in as GM:

1. Open a TIE fighter vehicle (import one or create one with Hull Trauma Threshold 6), then Sheet Options → tick **Minion Vehicle** → Accept. Expected:
   - The sheet re-renders with the group UI.
   - In the actor's Prototype Token config, *Link Actor Data* is **off**.
2. **Classic sheet.** Set Vehicles in Group Max to 4. Expected:
   - Left 4, Group Hull Threshold 24, Hull Trauma box labelled *Per Vehicle* showing 6.
   - Set Current to 7: Left becomes 3. Set it to 13: Left becomes 2.
   - **Destroy → Vehicle** from 13 gives 19 (Left 1). **Group** gives 25 (Left 0).
3. **Codex sheet.** Open the same actor with the Codex sheet. Expected:
   - Group Strength shows left/max, and − / + change it by one vehicle while keeping partial damage.
   - The Combined Hull Pool shows 4 groups of 6 pips.
   - Wipe Out gives 0 left.
   - In Edit Mode the per-vehicle input edits 6, and the pool redraws.
4. **Crew.** Drag a minion actor with Gunnery and Piloting: Space ticked GS onto the Crew tab as Pilot and Gunner, with Hull Trauma back at 0. Expected:
   - The Crew tab dice previews and a Weapons tab roll show Gunnery at rank 3 (4 vehicles left).
   - After destroying one vehicle, rank 2.
   - Rolling the crew minion from its own sheet still uses its own head count.
5. **Tokens.** Place two tokens of the squadron. With *Show Minion Count* on, each shows a 4-pip tally. Expected:
   - Target one and use **Apply Crit** from a weapon roll's chat card: that token's tally drops by one, and no Critical Damage item is added.
   - The other token is unchanged.
6. **Initiative.** Add a squadron token to combat and roll initiative. Expected: the Cool/Vigilance pool uses the pilot's GS rank for vehicles left − 1.
7. **Toggle off.** Untick Minion Vehicle. Expected:
   - The sheets show the ordinary Hull Trauma threshold (6).
   - The prototype token is linked again.
   - The tally is gone, and Apply Crit opens the crit dialog again.

Report what was verified. If a step fails, stop and debug with superpowers:systematic-debugging before changing code.

- [ ] **Step 5: Offer the follow-ups**

Offer two separate background tasks, not part of this branch:
- **Minion kill off-by-one.** `getKillMinionUpdate` in `modules/helpers/minions.js` adds `unit_wounds + 1` on every kill, so each kill after the first leaves an extra wound on the next minion. It could use `stepUnits`.
- **Codex vehicle Crew count.** It counts `shipcrew` items in `modules/actors/codex-sheets.js` (vehicle context), but crew live in `flags.starwarsffg.crew`, so it always shows 0.

Do not push or open a PR until the user asks. When they do:
- verify `gh auth status` shows `YeNov`
- run `gh pr create --repo YeNov/StarWarsFFG`
- update the changelog entry with the PR link
