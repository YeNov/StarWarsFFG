# Vehicle Defence Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an attacker pick which defence zone of a targeted vehicle they are shooting into, from a reticle in the roll dialog, and feed that zone's value into the pool as setback dice.

**Architecture:** All zone maths lives in a new pure module, `modules/helpers/vehicle-defence.js`, which reads zones from the vehicle's own prepared `system.stats.shields` and emits the reticle as an SVG **string**. The dialog (`RollBuilderFFG`) owns only selection state and DOM injection. Every target-derived defence number — the vehicle zone and the existing character defence — is resolved in one place, `_effectivePool()`, which is already the single seam feeding both the dice preview and the executed roll.

**Tech Stack:** Foundry VTT v13 ApplicationV2, vanilla ES modules, Handlebars templates, hand-written CSS, Node's built-in test runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-09-10-vehicle-defence-zones-design.md](../specs/2026-09-10-vehicle-defence-zones-design.md) — read it first; this plan argues from it.

## Global Constraints

- **Branch:** `vehicle-defence-zones`. Already created, already carries the spec commit. Do not branch again.
- **GitHub writes go only to `YeNov/StarWarsFFG`.** Never to `StarWarsFoundryVTT/StarWarsFFG`. `upstream` is read-only.
- **Never run `gulp css` or `npm run compile`.** Both `styles/starwarsffg.css` and `styles/mandar.css` are hand-maintained and the SCSS has drifted. Every CSS rule must be written into **both** files: the active `mandarBeskarAstromech` theme disables `starwarsffg.css` entirely, so a rule in only one file is invisible.
- **Node test tier boundary.** `tests/node/_stub/foundry-stub.mjs` deliberately refuses to stub `foundry.applications.*`, `Hooks`, `Actor`, `Item`, `ChatMessage`, `ui.notifications`, or any DOM API, and `tests/node/stub-boundary.test.mjs` enforces that statically and at runtime. `modules/dice/roll-builder.js` destructures `foundry.applications.api` at module scope, so it and everything importing it (including `modules/helpers/dice-helpers.js`) **cannot** be imported in a Node test. Verified: `node -e "import('./modules/helpers/dice-helpers.js')"` fails with `foundry is not defined`. Those files are verified live in Foundry, never headlessly. Do not try to grow the stub.
- **Every shell command in this plan is POSIX — run them through the Bash tool (Git Bash), not PowerShell.** They use `tail`, `head` and `grep`, none of which exist as PowerShell cmdlets. Do **not** translate them to `Select-Object -Last` / `Select-String`: this workspace's PowerShell is 5.1, where redirecting a native executable's stderr wraps every line in an ErrorRecord (`NativeCommandError`) and sets `$?` to `$false` even when the process exited 0. `npm test 2>&1 | ...` would then report a failure on a completely passing suite, which is worse than no gate at all. The commands as written were run verbatim in Git Bash to establish the baselines below.
- **Verified baselines, measured on this branch before any change:**
  - `npm test` → **690 pass, 0 fail**.
  - `npm run check:imports` → **PASS — 0 unpinned findings**.
  - `npm run lint` is **NOT clean**: 584 problems, 82 errors, all pre-existing. Never gate on "lint passes". Gate on the per-file error count not rising. Current error counts for files this plan touches: `modules/dice/roll-builder.js` **2**, `modules/dice/roll.js` **2**, `modules/helpers/dice-helpers.js` **0**, `modules/swffg-main.js` **6**.
- **`CHANGELOG.md` must describe the change before the branch is pushed or a PR is opened** (project CLAUDE.md). Task 10 writes it. Treat a missing entry as unfinished work.
- **Commit at the end of every task.** Never end a work session with finished work uncommitted.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility | Testable headlessly? |
| --- | --- | --- |
| `modules/helpers/vehicle-defence.js` (new) | Zone extraction from a vehicle, target resolution, reticle SVG geometry. No `game`, no DOM. | **Yes** |
| `modules/helpers/defence-helpers.js` (existing) | Gains the pure character-defence calculation beside the existing `applyCharacterDefenceCap`. No `game`, no DOM. | **Yes** |
| `modules/helpers/dice-helpers.js` | `getDefenseDice` becomes a thin gate delegating to the pure helper; stops injecting defence into pools it builds; `displayRollDialog` gains a trailing options object. | No |
| `modules/dice/roll-builder.js` | Selection state, panel render/refresh, click-time snapshot, defence folded into `_effectivePool()`. | No |
| `modules/dice/roll.js` | Carries `defenceZone` through `render`/`toJSON`/`fromData` beside `flavorText`. | No |
| `modules/swffg-main.js` | Passes the resolved-defence lock and zone snapshot back when a sent pool is reopened. | No |
| `templates/dice/roll-options-ffg.html` | Flex row: existing column plus an empty `<aside>`. | No |
| `templates/dice/roll-ffg.html` | The chat-card line. | No |
| `styles/starwarsffg.css` **and** `styles/mandar.css` | Panel and reticle styling, identical rules in both. | No |
| `lang/en.json` | New `SWFFG.VehicleDefenseZone.*` keys. | No |
| `tests/node/vehicle-defence.test.mjs` (new) | Tests for Tasks 1–3. | — |
| `tests/node/character-defence-dice.test.mjs` (new) | Tests for Task 4. | — |

**One deliberate deviation from the spec, and why.** The spec has `_effectivePool()` calling `DiceHelpers.getDefenseDice`. `modules/helpers/dice-helpers.js` already imports `modules/dice/roll-builder.js` (line 2), so that would close an import cycle in exactly the area where a module-eval poisoning incident has bitten this codebase before. Instead the *calculation* moves to the pure `defence-helpers.js`, which `roll-builder.js` imports directly with no cycle. `DiceHelpers.getDefenseDice` survives as a delegating wrapper carrying the spec's new signature, and additionally tolerates the old `(skill, itemData)` shape so a world macro written against it keeps working rather than silently returning zero. Behaviour is identical either way.

---

## Task 1: Zone extraction

**Files:**
- Create: `modules/helpers/vehicle-defence.js`
- Create: `tests/node/vehicle-defence.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `ZONE_ORDER: string[]`, `vehicleDefenceZones(actor): Array<{key: string, value: number}>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/node/vehicle-defence.test.mjs`:

```js
/**
 * Vehicle defence zones. A vehicle's defence is per-zone: there is no single
 * "ship defence" number in the rules, and an attack always resolves against one
 * zone. These tests pin the contract that the zone SET comes entirely from the
 * actor's own prepared data, while only the ARRANGEMENT is hardcoded.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ZONE_ORDER, vehicleDefenceZones } from "../../modules/helpers/vehicle-defence.js";

/** Actor stand-in carrying a prepared `stats.shields` block. */
const vehicle = (shields) => ({ type: "vehicle", system: { stats: { shields } } });

test("the four stock zones come back in nautical order, not stored order", () => {
  // Stored order is fore, port, starboard, aft -- laying wedges out in that order
  // would put port on the right and starboard at the bottom.
  const actor = vehicle({ fore: 2, port: 1, starboard: 1, aft: 0, label: "Shields" });
  assert.deepEqual(vehicleDefenceZones(actor), [
    { key: "fore", value: 2 },
    { key: "starboard", value: 1 },
    { key: "aft", value: 0 },
    { key: "port", value: 1 },
  ]);
});

test("the string `label` field is excluded structurally, not by name", () => {
  // `label` is a StringField; zones are NumberFields. An empty label would coerce
  // to 0 under Number(), so the filter tests the type, never the key.
  const actor = vehicle({ fore: 1, aft: 1, label: "" });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore", "aft"]);
});

test("a two-zone craft yields two zones and nothing is invented", () => {
  assert.deepEqual(vehicleDefenceZones(vehicle({ fore: 1, aft: 1 })), [
    { key: "fore", value: 1 },
    { key: "aft", value: 1 },
  ]);
});

test("an unknown zone key is kept and sorted after the known ones", () => {
  const actor = vehicle({ fore: 2, port: 1, starboard: 1, aft: 0, dorsal: 3 });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), [
    "fore", "starboard", "aft", "port", "dorsal",
  ]);
});

test("two unknown keys keep their stored order relative to each other", () => {
  const actor = vehicle({ ventral: 1, fore: 2, dorsal: 3 });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore", "ventral", "dorsal"]);
});

test("non-numeric and non-finite values are dropped", () => {
  const actor = vehicle({ fore: 2, aft: "1", port: NaN, starboard: null });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore"]);
});

test("a negative zone survives extraction; clamping is the caller's job", () => {
  // An Active Effect can drive a zone below zero. It must still DISPLAY as stored.
  assert.deepEqual(vehicleDefenceZones(vehicle({ fore: -1 })), [{ key: "fore", value: -1 }]);
});

test("missing, null or malformed shields yield no zones rather than throwing", () => {
  assert.deepEqual(vehicleDefenceZones(vehicle(undefined)), []);
  assert.deepEqual(vehicleDefenceZones(vehicle(null)), []);
  assert.deepEqual(vehicleDefenceZones(vehicle("broken")), []);
  assert.deepEqual(vehicleDefenceZones({}), []);
  assert.deepEqual(vehicleDefenceZones(undefined), []);
});

test("a shields block holding only a label yields no zones", () => {
  assert.deepEqual(vehicleDefenceZones(vehicle({ label: "Shields" })), []);
});

test("ZONE_ORDER is arrangement only and never decides which zones exist", () => {
  assert.deepEqual(ZONE_ORDER, ["fore", "starboard", "aft", "port"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module` for `modules/helpers/vehicle-defence.js`.

- [ ] **Step 3: Write the implementation**

Create `modules/helpers/vehicle-defence.js`:

```js
/**
 * Vehicle defence zones.
 *
 * A vehicle's defence is not one number. Each zone (`system.stats.shields.<zone>`)
 * carries its own value, and an attack resolves against exactly one of them --
 * the zone the attacker is shooting into. Nothing here ever aggregates the zones:
 * there is no "ship defence" stat in the rules, so a max or an average would be
 * inventing one.
 *
 * The zone SET always comes from the actor's own prepared data. `stats.shields` is
 * a SchemaField, so the prepared object contains exactly the declared fields --
 * today `fore, port, starboard, aft, label`. If the data model later drops to two
 * zones or gains a fifth, everything here follows with no code change.
 *
 * Pure and dependency-free (no imports, no `game`, no DOM) so it can be unit tested
 * headlessly, the same contract `vehicle-hardpoints.js` keeps.
 */

/**
 * Where zones SIT, never which zones exist.
 *
 * Stored order is fore, port, starboard, aft; laying wedges out in that order puts
 * port on the right and starboard at the bottom. This table sorts whatever zones
 * the data supplied so the arrangement makes nautical sense. Unrecognised keys are
 * appended in their stored order. This is the one place a list of zone names
 * appears, and it is deliberate.
 */
export const ZONE_ORDER = ["fore", "starboard", "aft", "port"];

/**
 * A vehicle's defence zones, ordered for display.
 * @param {object} actor a prepared vehicle Actor (or any object with `system.stats.shields`).
 * @returns {Array<{key: string, value: number}>} empty for missing or malformed data.
 */
export function vehicleDefenceZones(actor) {
  const shields = actor?.system?.stats?.shields;
  if (!shields || typeof shields !== "object") return [];

  // Type, not name: `label` is a StringField and every zone is a NumberField, so
  // this separates them structurally. Testing the key would hardcode the zone set,
  // and Number("") === 0 would let an empty label masquerade as a zone.
  const zones = [];
  for (const [key, value] of Object.entries(shields)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    zones.push({ key, value });
  }

  const rank = (key) => {
    const index = ZONE_ORDER.indexOf(key);
    return index === -1 ? ZONE_ORDER.length : index;
  };
  // The index tiebreak keeps unknown keys in stored order rather than relying on
  // sort stability.
  return zones
    .map((zone, index) => ({ zone, index }))
    .sort((a, b) => rank(a.zone.key) - rank(b.zone.key) || a.index - b.index)
    .map((entry) => entry.zone);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, total count risen from 690 to 700, `fail 0`.

- [ ] **Step 5: Confirm the new module stays import-clean**

Run: `npm run check:imports 2>&1 | tail -3`
Expected: `PASS — 0 unpinned finding(s)`.

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/vehicle-defence.js tests/node/vehicle-defence.test.mjs
git commit -m "Add vehicle defence zone extraction

Reads a vehicle's defence zones from its own prepared stats.shields, keeping
entries by field TYPE so the string label is excluded structurally rather than
by name. A hardcoded table orders the zones for display only -- it never
decides which zones exist, so a two-zone or six-zone vehicle works unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Target resolution

**Files:**
- Modify: `modules/helpers/vehicle-defence.js`
- Modify: `tests/node/vehicle-defence.test.mjs`

**Interfaces:**
- Consumes: `vehicleDefenceZones(actor)` from Task 1.
- Produces: `resolveDefenceTarget(targets): {status: "none" | "single" | "ambiguous", actor: object | null, zones: Array<{key, value}>}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/node/vehicle-defence.test.mjs`:

```js
import { resolveDefenceTarget } from "../../modules/helpers/vehicle-defence.js";

/** Token stand-ins. `game.user.targets` is a Set of Tokens, so tests pass Sets. */
const shipToken = (shields) => ({ actor: { type: "vehicle", system: { stats: { shields } } } });
const troopToken = () => ({ actor: { type: "character", system: { stats: { defence: { ranged: 1, melee: 0 } } } } });

test("no targets at all resolves to none", () => {
  const result = resolveDefenceTarget(new Set());
  assert.equal(result.status, "none");
  assert.equal(result.actor, null);
  assert.deepEqual(result.zones, []);
});

test("a lone non-vehicle target resolves to none", () => {
  assert.equal(resolveDefenceTarget(new Set([troopToken()])).status, "none");
});

test("exactly one vehicle resolves to single, carrying its zones", () => {
  const token = shipToken({ fore: 2, port: 1, starboard: 1, aft: 0 });
  const result = resolveDefenceTarget(new Set([token]));
  assert.equal(result.status, "single");
  assert.equal(result.actor, token.actor);
  assert.deepEqual(result.zones.map((z) => z.key), ["fore", "starboard", "aft", "port"]);
});

test("a non-vehicle alongside one vehicle is still single", () => {
  const token = shipToken({ fore: 2, aft: 1 });
  const result = resolveDefenceTarget(new Set([troopToken(), token]));
  assert.equal(result.status, "single");
  assert.equal(result.actor, token.actor);
});

test("two vehicles are ambiguous and carry no zones", () => {
  const result = resolveDefenceTarget(new Set([shipToken({ fore: 2 }), shipToken({ fore: 3 })]));
  assert.equal(result.status, "ambiguous");
  assert.equal(result.actor, null);
  assert.deepEqual(result.zones, []);
});

test("a vehicle whose shields yield no zones takes the none path", () => {
  // Same outcome as targeting no vehicle at all: no panel, no contribution.
  assert.equal(resolveDefenceTarget(new Set([shipToken({ label: "Shields" })])).status, "none");
  assert.equal(resolveDefenceTarget(new Set([shipToken(undefined)])).status, "none");
});

test("a null or undefined target collection resolves to none rather than throwing", () => {
  assert.equal(resolveDefenceTarget(undefined).status, "none");
  assert.equal(resolveDefenceTarget(null).status, "none");
});

test("a target with no actor is ignored", () => {
  assert.equal(resolveDefenceTarget(new Set([{ actor: null }])).status, "none");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `resolveDefenceTarget is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `modules/helpers/vehicle-defence.js`:

```js
/**
 * Which vehicle, if any, this roll resolves against.
 *
 * Only a SINGLE vehicle target is supported. Two ships lit up at once is genuinely
 * ambiguous -- the attacker may be fore of one and aft of the other -- so rather
 * than guess or silently contribute nothing, the caller is told to say so on screen.
 *
 * A vehicle whose shields yield no zones takes the `none` path, because there is
 * nothing to pick and a reticle with no wedges would be a dead control.
 *
 * @param {Iterable<object>|null|undefined} targets `game.user.targets`, or any iterable of Tokens.
 * @returns {{status: "none"|"single"|"ambiguous", actor: object|null, zones: Array<{key: string, value: number}>}}
 */
export function resolveDefenceTarget(targets) {
  const none = { status: "none", actor: null, zones: [] };
  if (!targets) return none;

  const vehicles = [];
  for (const token of targets) {
    if (token?.actor?.type === "vehicle") vehicles.push(token.actor);
  }
  if (vehicles.length === 0) return none;
  if (vehicles.length > 1) return { status: "ambiguous", actor: null, zones: [] };

  const actor = vehicles[0];
  const zones = vehicleDefenceZones(actor);
  if (zones.length === 0) return none;
  return { status: "single", actor, zones };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen to 708, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/vehicle-defence.js tests/node/vehicle-defence.test.mjs
git commit -m "Resolve which vehicle a roll's targets point at

Returns none, single or ambiguous. Two targeted vehicles is genuinely
ambiguous -- the attacker can be fore of one and aft of the other -- so it is
reported rather than guessed. A vehicle with no readable zones takes the none
path, since a reticle with no wedges would be a dead control.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Reticle geometry

**Files:**
- Modify: `modules/helpers/vehicle-defence.js`
- Modify: `tests/node/vehicle-defence.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks (geometry is standalone).
- Produces: `zoneReticleSvg({zones, selected}): string`, where `zones` is `Array<{key: string, label: string, value: number, ariaLabel: string}>` — the dialog adds `label` and `ariaLabel` because localisation needs `game`, which this module must not touch — and `selected` is a zone `key` or `null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/node/vehicle-defence.test.mjs`:

```js
import { zoneReticleSvg } from "../../modules/helpers/vehicle-defence.js";

const labelled = (...keys) => keys.map((key, i) => ({
  key,
  label: key.toUpperCase(),
  value: i,
  ariaLabel: `${key}, ${i} setback`,
}));

test("one wedge is emitted per zone", () => {
  const four = zoneReticleSvg({ zones: labelled("fore", "starboard", "aft", "port"), selected: null });
  assert.equal((four.match(/class="ffg-zone[ "]/g) ?? []).length, 4);
  const two = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: null });
  assert.equal((two.match(/class="ffg-zone[ "]/g) ?? []).length, 2);
  const six = zoneReticleSvg({ zones: labelled("a", "b", "c", "d", "e", "f"), selected: null });
  assert.equal((six.match(/class="ffg-zone[ "]/g) ?? []).length, 6);
});

test("exactly the selected zone is marked, by index not by key", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "starboard", "aft", "port"), selected: "aft" });
  assert.equal((svg.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((svg.match(/aria-pressed="false"/g) ?? []).length, 3);
  assert.match(svg, /data-zone-index="2"[^>]*aria-pressed="true"/);
  // Raw zone keys must never reach an attribute value.
  assert.doesNotMatch(svg, /data-zone-key=/);
});

test("nothing selected puts the whole reticle in its warning state", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: null });
  assert.match(svg, /class="ffg-zone-reticle ffg-zone-unpicked"/);
  assert.equal((svg.match(/aria-pressed="true"/g) ?? []).length, 0);
});

test("a selected zone clears the warning state", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: "fore" });
  assert.match(svg, /class="ffg-zone-reticle"/);
  assert.doesNotMatch(svg, /ffg-zone-unpicked/);
});

test("every wedge is keyboard-operable", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: null });
  assert.equal((svg.match(/role="button"/g) ?? []).length, 2);
  assert.equal((svg.match(/tabindex="0"/g) ?? []).length, 2);
  assert.equal((svg.match(/aria-label="/g) ?? []).length, 2);
});

test("displayed text is XML-escaped", () => {
  const svg = zoneReticleSvg({
    zones: [{ key: "fore", label: `Fore & "aft" <hack>`, value: 1, ariaLabel: `a & b` }],
    selected: null,
  });
  assert.doesNotMatch(svg, /<hack>/);
  assert.match(svg, /Fore &amp; &quot;aft&quot; &lt;hack&gt;/);
  assert.match(svg, /aria-label="a &amp; b"/);
});

test("a single zone draws a complete donut instead of a degenerate 360 arc", () => {
  // SVG cannot draw an arc whose endpoints coincide -- it renders nothing at all.
  const svg = zoneReticleSvg({ zones: labelled("fore"), selected: null });
  const path = svg.match(/ d="([^"]+)"/)[1];
  const outerArcs = (path.match(/A 54 54/g) ?? []).length;
  const innerArcs = (path.match(/A 21 21/g) ?? []).length;
  assert.equal(outerArcs, 2, "outer ring split into two half arcs");
  assert.equal(innerArcs, 2, "inner ring split into two half arcs");
  assert.match(path, /Z$/);
});

test("a four-zone reticle puts the first zone at the top", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "starboard", "aft", "port"), selected: null });
  const first = svg.match(/data-zone-index="0"[\s\S]*?d="([^"]+)"/)[1];
  // Wedge 0 spans -45deg..45deg, so its outer arc runs from x<60 to x>60 across the top (y<60).
  const [, x0, y0] = first.match(/^M ([\d.-]+) ([\d.-]+)/);
  assert.ok(Number(x0) < 60 && Number(y0) < 60, `wedge 0 starts top-left, got ${x0},${y0}`);
});

test("no zones yields an empty string rather than an empty reticle", () => {
  assert.equal(zoneReticleSvg({ zones: [], selected: null }), "");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `zoneReticleSvg is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `modules/helpers/vehicle-defence.js`:

```js
/* ------------------------------------------------------------------ *
 * Reticle geometry
 *
 * The reticle is returned as an SVG STRING rather than built as DOM, so the
 * geometry stays unit testable and this module keeps its no-DOM contract. The
 * dialog only assigns the result to innerHTML.
 * ------------------------------------------------------------------ */

const VIEWBOX = 120;
const CENTRE = 60;
const OUTER_R = 54;
const INNER_R = 21;
const LABEL_R = 40;
const VALUE_R = 30;

/** Point on a circle, measuring degrees CLOCKWISE from 12 o'clock. */
function polar(radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  const round = (n) => Math.round(n * 100) / 100;
  return [round(CENTRE + radius * Math.cos(radians)), round(CENTRE + radius * Math.sin(radians))];
}

/**
 * A full circle cannot be drawn as one arc: its start and end points coincide and
 * SVG renders nothing. Any span of 360 degrees is split into two halves.
 */
function arcSpans(from, to) {
  if (to - from < 360) return [[from, to]];
  const middle = from + 180;
  return [[from, middle], [middle, to]];
}

/** A donut segment: outer arc clockwise, inner arc back. */
function donutPath(from, to) {
  const spans = arcSpans(from, to);
  const [startX, startY] = polar(OUTER_R, from);
  let d = `M ${startX} ${startY}`;
  for (const [a, b] of spans) {
    const [x, y] = polar(OUTER_R, b);
    d += ` A ${OUTER_R} ${OUTER_R} 0 ${b - a > 180 ? 1 : 0} 1 ${x} ${y}`;
  }
  const [innerX, innerY] = polar(INNER_R, to);
  d += ` L ${innerX} ${innerY}`;
  for (const [a, b] of [...spans].reverse()) {
    const [x, y] = polar(INNER_R, a);
    d += ` A ${INNER_R} ${INNER_R} 0 ${b - a > 180 ? 1 : 0} 0 ${x} ${y}`;
  }
  return `${d} Z`;
}

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
/** Every displayed string is escaped: zone labels ultimately come from world data. */
const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);

/**
 * The zone picker, as SVG markup.
 *
 * Wedges are the circle divided by however many zones there are, with the first
 * centred at 12 o'clock. Nothing about "four" is baked in.
 *
 * Attributes carry the zone's INDEX, never its key: the caller holds the same
 * ordered array and maps back, so no schema-derived string reaches the markup.
 *
 * @param {object} options
 * @param {Array<{key: string, label: string, value: number, ariaLabel: string}>} options.zones
 *   ordered zones, already localised by the caller (this module must not touch `game`).
 * @param {string|null} options.selected the selected zone's `key`, or null for none.
 * @returns {string} SVG markup, or "" when there are no zones.
 */
export function zoneReticleSvg({ zones, selected }) {
  if (!Array.isArray(zones) || zones.length === 0) return "";

  const count = zones.length;
  const sweep = 360 / count;
  const rootClass = selected == null ? "ffg-zone-reticle ffg-zone-unpicked" : "ffg-zone-reticle";

  const wedges = zones.map((zone, index) => {
    const centreAngle = index * sweep;
    const path = donutPath(centreAngle - sweep / 2, centreAngle + sweep / 2);
    const [labelX, labelY] = polar(LABEL_R, centreAngle);
    const [valueX, valueY] = polar(VALUE_R, centreAngle);
    const isSelected = selected != null && zone.key === selected;
    const zeroClass = zone.value <= 0 ? " ffg-zone-empty" : "";
    return [
      `<g class="ffg-zone${isSelected ? " ffg-zone-selected" : ""}${zeroClass}"`,
      ` data-zone-index="${index}" role="button" tabindex="0"`,
      ` aria-pressed="${isSelected ? "true" : "false"}" aria-label="${escapeXml(zone.ariaLabel)}">`,
      `<path class="ffg-zone-wedge" d="${path}"/>`,
      `<text class="ffg-zone-name" x="${labelX}" y="${labelY}">${escapeXml(zone.label)}</text>`,
      `<text class="ffg-zone-value" x="${valueX}" y="${valueY}">${escapeXml(zone.value)}</text>`,
      `</g>`,
    ].join("");
  });

  return [
    `<svg class="${rootClass}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    wedges.join(""),
    `<circle class="ffg-zone-hub" cx="${CENTRE}" cy="${CENTRE}" r="${INNER_R}"/>`,
    `</svg>`,
  ].join("");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen to 717, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/vehicle-defence.js tests/node/vehicle-defence.test.mjs
git commit -m "Generate the defence zone reticle as an SVG string

Wedges are the circle divided by however many zones the vehicle has, first
zone at 12 o'clock, so two- and six-zone craft need no special case. A single
zone is the exception: a 360-degree arc has coincident endpoints and renders
nothing, so its ring is split into two halves.

Returning markup rather than building DOM keeps the geometry unit testable.
Attributes carry zone indexes and every displayed string is XML-escaped, so
no world-authored text reaches the markup raw.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Character defence, extracted pure

**Files:**
- Modify: `modules/helpers/defence-helpers.js`
- Create: `tests/node/character-defence-dice.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `RANGED_DEFENCE_SKILLS: string[]`, `MELEE_DEFENCE_SKILLS: string[]`, `characterDefenceDice({skillValue, targets}): number`.

**Why:** `getDefenseDice` currently lives in `dice-helpers.js`, which cannot be imported in a Node test. Extracting the calculation gets it under test; Task 5 makes `getDefenseDice` a thin gate over it.

- [ ] **Step 1: Write the failing tests**

Create `tests/node/character-defence-dice.test.mjs`:

```js
/**
 * Character defence contributed by targeted non-vehicle actors.
 *
 * The attacking skill chooses WHICH stat is read; the max is then taken across
 * targets for that one stat. (The pre-existing code was easy to misread as taking
 * a max across ranged AND melee -- it never did.)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { characterDefenceDice } from "../../modules/helpers/defence-helpers.js";

const trooper = (ranged, melee) => ({
  actor: { type: "character", system: { stats: { defence: { ranged, melee } } } },
});
const ship = () => ({ actor: { type: "vehicle", system: { stats: { shields: { fore: 4 } } } } });

test("a ranged skill reads ranged defence", () => {
  assert.equal(characterDefenceDice({ skillValue: "Ranged: Heavy", targets: [trooper(2, 4)] }), 2);
});

test("gunnery counts as ranged", () => {
  assert.equal(characterDefenceDice({ skillValue: "Gunnery", targets: [trooper(3, 0)] }), 3);
});

test("a melee skill reads melee defence", () => {
  assert.equal(characterDefenceDice({ skillValue: "Lightsaber", targets: [trooper(4, 1)] }), 1);
});

test("a skill in neither list contributes nothing", () => {
  assert.equal(characterDefenceDice({ skillValue: "Piloting: Space", targets: [trooper(3, 3)] }), 0);
  assert.equal(characterDefenceDice({ skillValue: null, targets: [trooper(3, 3)] }), 0);
});

test("the maximum is taken across targets for the chosen stat only", () => {
  const targets = [trooper(1, 9), trooper(3, 9), trooper(2, 9)];
  assert.equal(characterDefenceDice({ skillValue: "Ranged: Light", targets }), 3);
});

test("a targeted vehicle contributes nothing here -- the zone picker owns it", () => {
  assert.equal(characterDefenceDice({ skillValue: "Gunnery", targets: [ship()] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Gunnery", targets: [ship(), trooper(2, 0)] }), 2);
});

test("a vehicle target does not throw despite having no defence stat", () => {
  // The live bug this replaces: reading .ranged off an undefined `defence`.
  assert.doesNotThrow(() => characterDefenceDice({ skillValue: "Ranged: Heavy", targets: [ship()] }));
});

test("missing, malformed or absent targets yield zero", () => {
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: undefined }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [{ actor: null }] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [{ actor: { type: "character" } }] }), 0);
});

test("a negative or non-numeric defence never produces negative dice", () => {
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [trooper(0, -3)] }), 0);
  assert.equal(characterDefenceDice({ skillValue: "Melee", targets: [trooper(0, "two")] }), 0);
});

test("a Set of targets works, since game.user.targets is one", () => {
  assert.equal(characterDefenceDice({ skillValue: "Brawl", targets: new Set([trooper(0, 2)]) }), 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `characterDefenceDice is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `modules/helpers/defence-helpers.js`:

```js
/**
 * The skills whose attacks are opposed by ranged and melee defence respectively.
 * A skill in neither list is not an attack these stats apply to.
 */
export const RANGED_DEFENCE_SKILLS = ["Ranged: Light", "Ranged: Heavy", "Gunnery"];
export const MELEE_DEFENCE_SKILLS = ["Melee", "Brawl", "Lightsaber"];

/**
 * Setback dice contributed by the defence of targeted CHARACTERS.
 *
 * The attacking skill selects which stat is read; the maximum is then taken across
 * the targeted tokens for that one stat. Vehicles are skipped entirely -- they have
 * no ranged/melee split, and their per-zone defence is resolved by the roll dialog's
 * zone picker instead. Skipping them here is also what stops the old crash: vehicles
 * have no `stats.defence`, and the previous code read `.ranged` straight off it.
 *
 * Pure: no `game`, no DOM, no settings. The caller applies the `useDefense` gate.
 *
 * @param {object} options
 * @param {string|null} options.skillValue the attacking skill's `.value`, e.g. "Ranged: Heavy".
 * @param {Iterable<object>|null|undefined} options.targets `game.user.targets`, or any iterable of Tokens.
 * @returns {number} setback dice, never negative.
 */
export function characterDefenceDice({ skillValue, targets }) {
  const stat = RANGED_DEFENCE_SKILLS.includes(skillValue)
    ? "ranged"
    : MELEE_DEFENCE_SKILLS.includes(skillValue)
      ? "melee"
      : null;
  if (!stat || !targets) return 0;

  let dice = 0;
  for (const token of targets) {
    const actor = token?.actor;
    if (!actor || actor.type === "vehicle") continue;
    const value = Number(actor.system?.stats?.defence?.[stat]);
    if (Number.isFinite(value) && value > dice) dice = value;
  }
  return Math.max(0, dice);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen to 727, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/defence-helpers.js tests/node/character-defence-dice.test.mjs
git commit -m "Extract character defence dice into the pure defence helper

The calculation lived in dice-helpers.js, which imports the roll dialog and so
cannot be loaded in a Node test. Moving it here puts it under test and fixes
the crash on the way: a targeted vehicle has no stats.defence, and reading
.ranged off it threw and killed the roll.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Move defence resolution into the dialog

**Files:**
- Modify: `modules/helpers/dice-helpers.js` (lines 83, 116, 119-137, 139-141, 240, 264)
- Modify: `modules/dice/roll-builder.js` (lines 8-24, 497-503)

**Interfaces:**
- Consumes: `characterDefenceDice` (Task 4), `resolveDefenceTarget` (Task 2).
- Produces:
  - `DiceHelpers.getDefenseDice(skillValue, item, targets): number` — the gated wrapper. Accepts either a skill `.value` string or a whole skill object, and defaults omitted `targets` to `game.user.targets`, so the previous `(skill, itemData)` call shape still works.
  - `DiceHelpers.displayRollDialog(data, dicePool, description, skillName, item, flavorText, sound, rollOptions = {})`.
  - `RollBuilderFFG` constructor eighth parameter `rollOptions = {}`, accepting `{skillValue, targetDefenceResolved, defenceZone}`.
  - `this.roll.skillValue`, `this.roll.targetDefenceResolved`, `this.roll.defenceZone` on the dialog.
  - `this._defenceZone` (selected key or `null`), `this._defenceTarget` (a `resolveDefenceTarget` result).
  - `RollBuilderFFG.prototype._defenceEligible(): boolean` — the single eligibility gate, used by all three defence paths.
  - `RollBuilderFFG.prototype._defenceZoneLabel(key): string` — localised zone name with a capitalised-key fallback.
  - `RollBuilderFFG.prototype._defenceDice(): number`.
  - `RollBuilderFFG.prototype._defenceZoneSnapshot(): {key: string|null, label: string|null, dice: number} | null`.

**Why both files in one task:** Task 5 removes defence from the pools built in `dice-helpers.js` and adds it in `roll-builder.js`. Split across two commits, the tree in between rolls attacks with no defence at all. Landing them together keeps every commit working.

- [ ] **Step 1: Rewrite `getDefenseDice` as a gate over the pure helper**

In `modules/helpers/dice-helpers.js`, add to the imports at the top of the file:

```js
import { characterDefenceDice } from "./defence-helpers.js";
```

Replace the whole of `getDefenseDice` (currently lines 119-137) with:

```js
  /**
   * Setback dice from targeted characters' defence.
   *
   * The `useDefense` client setting and the "is this an attack?" check live here;
   * the calculation itself is in defence-helpers.js so it can be unit tested.
   *
   * NOTE: this no longer runs while a pool is being BUILT. The roll dialog resolves
   * defence from `_effectivePool()` against live targets, so re-targeting mid-dialog
   * is reflected in both the preview and the roll. Vehicles are not handled here at
   * all -- their per-zone defence is the dialog's zone picker.
   *
   * Both call shapes are accepted. The old one was `(skill, itemData)` with the
   * targets read implicitly, and a world macro written against it would otherwise
   * pass a skill OBJECT where a string is now expected -- matching neither skill
   * list and silently returning 0 with no error to notice.
   *
   * @param {string|object|null} skillValue the attacking skill's `.value`
   *   ("Ranged: Heavy"), or the whole skill object.
   * @param {object} item the weapon or ship weapon being rolled.
   * @param {Iterable<object>} [targets] defaults to `game.user.targets`.
   */
  static getDefenseDice(skillValue, item, targets) {
    if (!game.settings.get("starwarsffg", "useDefense")) return 0;
    const isWeapon = item?.type === "weapon"
      || item?.type === "shipweapon"
      || item?.metaData?.tags?.includes("weapon");
    if (!isWeapon) return 0;
    const value = typeof skillValue === "string" ? skillValue : (skillValue?.value ?? null);
    return characterDefenceDice({ skillValue: value, targets: targets ?? game.user?.targets ?? [] });
  }
```

- [ ] **Step 2: Stop injecting defence into pools at build time**

In `rollSkill`, delete line 83:

```js
    let defenseDice = this.getDefenseDice(skill, itemData);
```

and change the pool's setback (line 90) from:

```js
      setback: (skill.setback ?? 0) + status.setback + defenseDice,
```

to:

```js
      setback: (skill.setback ?? 0) + status.setback,
```

Make the identical pair of edits in `rollItem`: delete line 240 and drop `+ defenseDice` from its `setback` line.

- [ ] **Step 3: Give `displayRollDialog` a trailing options object**

Replace `displayRollDialog` (lines 139-141) with:

```js
  /**
   * @param {object} rollOptions optional, non-positional extras:
   *   `skillValue` the attacking skill's `.value`, needed for character defence;
   *   `targetDefenceResolved` true when the pool already contains all target-derived
   *     defence (a pool sent to another player), which locks further defence off;
   *   `defenceZone` a `{key, label, dice}` snapshot carried by such a pool.
   */
  static async displayRollDialog(data, dicePool, description, skillName, item, flavorText, sound, rollOptions = {}) {
    return new RollBuilderFFG(data, dicePool, description, skillName, item, flavorText, sound, rollOptions).render(true);
  }
```

Then pass the skill value from the two attack paths. In `rollSkill`, line 116 becomes:

```js
    await this.displayRollDialog(data, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize(skill.label)}`, skill.label, itemData, flavorText, sound, { skillValue: skill.value });
```

In `rollItem`, line 264 becomes:

```js
    this.displayRollDialog(actorSheet, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${skill.label}`, skill.label, item, flavorText, sound, { skillValue: itemData.skill.value });
```

Leave the other nine `displayRollDialog` call sites untouched; they fall through to the constructor's own resolution.

- [ ] **Step 4: Add dialog state**

In `modules/dice/roll-builder.js`, add to the imports:

```js
import { characterDefenceDice } from "../helpers/defence-helpers.js";
import { resolveDefenceTarget } from "../helpers/vehicle-defence.js";
```

Import the pure helpers directly rather than `DiceHelpers`: `dice-helpers.js` imports this file, so going through it would close an import cycle.

Replace the constructor signature and `this.roll` block (lines 8-17) with:

```js
  constructor(rollData, rollDicePool, rollDescription, rollSkillName, rollItem, rollAdditionalFlavor, rollSound, rollOptions = {}) {
    super();
    this.roll = {
      data: rollData,
      skillName: rollSkillName,
      item: rollItem,
      sound: rollSound,
      flavor: rollAdditionalFlavor,
      // The skill's `.value` ("Ranged: Heavy"), not its label -- character defence
      // keys off it. Callers that know it pass it; a weapon roll can recover it from
      // the item; anything else contributes no character defence, exactly as a skill
      // outside the two lists always has.
      skillValue: rollOptions.skillValue ?? rollItem?.system?.skill?.value ?? null,
      // True when this pool arrived with all target-derived defence already in it --
      // a pool sent to another player. The recipient's own targets must not add it
      // a second time.
      targetDefenceResolved: rollOptions.targetDefenceResolved === true,
      // {key, label, dice} carried by such a pool so its chat card keeps the line.
      defenceZone: rollOptions.defenceZone ?? null,
    };
```

Then, after `this._adversaryMode = true;` (line 23), add:

```js
    /** Selected defence zone key, or null. Cleared on every target change. */
    this._defenceZone = null;
    /** Latest resolveDefenceTarget() result; refreshed by the targetToken hook. */
    this._defenceTarget = { status: "none", actor: null, zones: [] };
    /** Whether the side panel is currently widening the window. */
    this._defencePanelShown = false;
```

- [ ] **Step 5: Fold defence into the effective pool**

Add this method to `RollBuilderFFG`, immediately above `_effectivePool`:

```js
  /**
   * Whether target-derived defence applies to this roll at all.
   *
   * Shared by the dice calculation, the side panel and the chat-card snapshot, so
   * the three cannot disagree: a Piloting check with a ship targeted must show no
   * picker and stamp no "no zone chosen" line on its card, even though a vehicle
   * is targeted.
   */
  _defenceEligible() {
    if (this.roll.targetDefenceResolved) return false;
    if (!game.settings.get("starwarsffg", "useDefense")) return false;
    const item = this.roll.item;
    return item?.type === "weapon"
      || item?.type === "shipweapon"
      || item?.metaData?.tags?.includes("weapon") === true;
  }

  /**
   * Localised zone name, falling back to the capitalised raw key.
   *
   * `game.i18n.localize` hands back the key itself when there is no string, so a
   * future zone with no translation would otherwise read
   * "SWFFG.VehicleDefenseDorsal" on screen and on the chat card.
   */
  _defenceZoneLabel(key) {
    const suffix = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    const localised = game.i18n.localize(`SWFFG.VehicleDefense${suffix}`);
    return localised === `SWFFG.VehicleDefense${suffix}` ? suffix : localised;
  }

  /**
   * Setback dice from whatever this roll is aimed at, right now.
   *
   * Character defence and the vehicle zone are combined with `Math.max`, which
   * preserves the max-across-targets behaviour the system has always had when more
   * than one thing is targeted. A pool that arrived already resolved contributes
   * nothing: it holds the sender's exact defence, not a request to recompute it
   * from the recipient's targeting.
   */
  _defenceDice() {
    if (!this._defenceEligible()) return 0;

    const targets = game.user?.targets ?? [];
    const character = characterDefenceDice({ skillValue: this.roll.skillValue, targets });

    let zone = 0;
    if (this._defenceTarget.status === "single" && this._defenceZone != null) {
      const selected = this._defenceTarget.zones.find((z) => z.key === this._defenceZone);
      zone = Math.max(0, selected?.value ?? 0);
    }
    return Math.max(character, zone);
  }
```

Replace `_effectivePool` (lines 497-503) with:

```js
  _effectivePool(defenceOverride = null) {
    const defence = defenceOverride == null ? this._defenceDice() : defenceOverride;
    const adversaryActive = this._adversaryMode && this.adversaryRanks > 0 && this.dicePool.difficulty > 0;
    // No modification at all: hand back the live base pool that manual edits mutate.
    if (!adversaryActive && defence === 0) return this.dicePool;
    const clone = this._clonePool();
    clone.setback += defence;
    if (adversaryActive) clone.upgradeDifficulty(this.adversaryRanks);
    return clone;
  }
```

- [ ] **Step 6: Resolve targets on open and on every target change**

In `_onRender`, replace the existing hook registration (lines 233-237) with:

```js
    this._defenceTarget = resolveDefenceTarget(game.user?.targets);
    this._refreshAdversary(html);
    this._adversaryHookId = Hooks.on("targetToken", (user) => {
      if (user?.id !== game.user.id) return;
      // Any target change rebuilds target-derived state from the NEW target. The
      // selection is always cleared, even when the new vehicle happens to share a
      // zone key, so every change costs one deliberate pick.
      this._defenceTarget = resolveDefenceTarget(game.user?.targets);
      this._defenceZone = null;
      this._refreshAdversary(html);
    });
```

`_refreshAdversary` already ends in `_updatePreview`, so the preview follows the new defence without further wiring. Task 6 hangs the panel refresh off the same path.

- [ ] **Step 7: Snapshot defence at click time**

In the Roll handler, replace line 253:

```js
      const rollPool = this._effectivePool();
```

with:

```js
      // Snapshot defence and the pool together, synchronously, BEFORE the awaits
      // below (status effects, item repair, ammo). A target change during one of
      // those awaits must not make the chat card describe a different pool from the
      // one actually rolled.
      const defenceSnapshot = this._defenceDice();
      const zoneSnapshot = this._defenceZoneSnapshot();
      const rollPool = this._effectivePool(defenceSnapshot);
```

Add the snapshot helper beside `_defenceDice`:

```js
  /**
   * The zone line this roll should carry, frozen at click time.
   * `dice` is what the zone actually contributed, which is 0 when character defence
   * won the `Math.max`; the line reports the zone chosen, not the winning number.
   * @returns {{key: string, label: string, dice: number}|null}
   */
  _defenceZoneSnapshot() {
    // Checked before eligibility: a received pool is not eligible to resolve
    // defence again, but it still carries the sender's zone for its card.
    if (this.roll.targetDefenceResolved) return this.roll.defenceZone;
    if (!this._defenceEligible()) return null;

    const status = this._defenceTarget.status;
    if (status === "none") return null;
    // `ambiguous` is still a vehicle attack that went out with no zone applied, so
    // the card must say so just as an unpicked single target does. Returning null
    // here would let a two-vehicle roll pass silently, which is exactly the quiet
    // failure the loud-not-blocking rule exists to prevent.
    if (status === "ambiguous" || this._defenceZone == null) return { key: null, label: null, dice: 0 };

    const zone = this._defenceTarget.zones.find((z) => z.key === this._defenceZone);
    if (!zone) return { key: null, label: null, dice: 0 };
    return { key: zone.key, label: this._defenceZoneLabel(zone.key), dice: Math.max(0, zone.value) };
  }
```

Hold `zoneSnapshot` in scope; Task 8 attaches it to the `RollFFG`, Task 9 sends it with a forwarded pool. Until then it is computed and unused, which is intentional and harmless.

- [ ] **Step 8: Verify no test regressed and no gate slipped**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, 727 tests, `fail 0`. (These files are outside the Node tier; this confirms nothing else broke.)

Run: `npm run check:imports 2>&1 | tail -3`
Expected: `PASS — 0 unpinned finding(s)`.

Run: `npx eslint modules/helpers/dice-helpers.js modules/dice/roll-builder.js 2>&1 | tail -3`
Expected: error count unchanged — `dice-helpers.js` still **0** errors, `roll-builder.js` still **2**. Warnings may move; errors must not rise.

- [ ] **Step 9: Commit**

```bash
git add modules/helpers/dice-helpers.js modules/dice/roll-builder.js
git commit -m "Resolve target defence in the roll dialog instead of at pool build time

Defence was computed once, before the dialog existed, and baked into the pool's
setback count. Nothing recomputed it, so targeting a defender AFTER clicking the
attack never applied their defence, and switching targets rolled the old one's
number. It now resolves in _effectivePool(), the single seam feeding both the
dice preview and the executed roll, against live targets.

Ship weapons are accepted alongside personal weapons, so a ship weapon fired at
a character finally picks up their ranged defence. The dialog also tracks which
vehicle is targeted, ready for the zone picker; a target change clears the
selection and rebuilds from the new target.

Roll-time defence is snapshotted synchronously with the pool, so a target change
during the awaits that follow cannot desynchronise the two.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The side panel

**Files:**
- Modify: `templates/dice/roll-options-ffg.html:1` and its closing `</form>`
- Modify: `modules/dice/roll-builder.js`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `zoneReticleSvg` (Task 3), and `this._defenceTarget`, `this._defenceZone`, `_defenceEligible()`, `_defenceZoneLabel()` (all Task 5).
- Produces: `_refreshDefencePanel(html)`, `_setDefencePanelWidth(show)`; DOM contract `aside.ffg-defence-panel` containing `.ffg-defence-ship`, `.ffg-defence-reticle`, `.ffg-defence-selected`, `.ffg-defence-warning`.

- [ ] **Step 1: Add the localisation keys**

In `lang/en.json`, immediately after the `"SWFFG.VehicleDefenseStarboard"` line (line 204), insert:

```json
  "SWFFG.VehicleDefenseZone.Heading": "Defence zone",
  "SWFFG.VehicleDefenseZone.Selected": "{zone} · +{dice} setback",
  "SWFFG.VehicleDefenseZone.None": "None chosen",
  "SWFFG.VehicleDefenseZone.NoneWarning": "Rolling without the target's shields.",
  "SWFFG.VehicleDefenseZone.Ambiguous": "Target one vehicle to pick a zone.",
  "SWFFG.VehicleDefenseZone.ZoneAria": "{zone}, {dice} setback",
  "SWFFG.VehicleDefenseZone.CardLine": "{zone} zone · +{dice} setback",
  "SWFFG.VehicleDefenseZone.CardNone": "No defence zone chosen",
```

- [ ] **Step 2: Add the panel container to the template**

In `templates/dice/roll-options-ffg.html`, change line 1 from:

```html
<form style="overflow-y: scroll; scrollbar-width: thin;">
```

to:

```html
<form style="overflow-y: scroll; scrollbar-width: thin; display: flex; align-items: stretch;">
```

and insert the aside immediately before the closing `</form>`, as a sibling of `.dice-pool-dialog`:

```html
  <aside class="ffg-defence-panel" hidden>
    <div class="ffg-defence-heading">{{localize "SWFFG.VehicleDefenseZone.Heading"}}</div>
    <div class="ffg-defence-ship"></div>
    <div class="ffg-defence-reticle"></div>
    <div class="ffg-defence-selected"></div>
    <div class="ffg-defence-warning"></div>
  </aside>
```

- [ ] **Step 3: Render and refresh the panel**

Add the import in `modules/dice/roll-builder.js`:

```js
import { resolveDefenceTarget, zoneReticleSvg } from "../helpers/vehicle-defence.js";
```

(replacing the Task 5 import line, which imported only `resolveDefenceTarget`).

Add these methods beside `_refreshAdversary`:

```js
  /**
   * Grow or shrink the window by the panel's width, once each way.
   *
   * A hard setPosition({width: 510}) would stomp a dialog the user had already
   * resized, so the change is a delta and `_defencePanelShown` stops repeated
   * retargeting from accumulating it.
   */
  _setDefencePanelWidth(show) {
    if (show === this._defencePanelShown) return;
    const PANEL_WIDTH = 160;
    const current = this.position?.width;
    if (typeof current === "number") {
      this.setPosition({ width: show ? current + PANEL_WIDTH : Math.max(350, current - PANEL_WIDTH) });
    }
    this._defencePanelShown = show;
  }

  /** Rebuild the defence panel from `this._defenceTarget`. */
  _refreshDefencePanel(html) {
    const panel = html.find(".ffg-defence-panel")[0];
    if (!panel) return;

    // The same gate the dice and the card snapshot use, so a non-attack roll with a
    // ship targeted shows no picker.
    const status = this._defenceEligible() ? this._defenceTarget.status : "none";
    const show = status === "single" || status === "ambiguous";
    panel.hidden = !show;
    this._setDefencePanelWidth(show);
    if (!show) return;

    const ship = panel.querySelector(".ffg-defence-ship");
    const reticle = panel.querySelector(".ffg-defence-reticle");
    const selected = panel.querySelector(".ffg-defence-selected");
    const warning = panel.querySelector(".ffg-defence-warning");

    if (status === "ambiguous") {
      // textContent, not innerHTML: actor names are world-authored.
      ship.textContent = "";
      reticle.innerHTML = "";
      selected.textContent = "";
      warning.textContent = game.i18n.localize("SWFFG.VehicleDefenseZone.Ambiguous");
      return;
    }

    ship.textContent = this._defenceTarget.actor?.name ?? "";
    const zones = this._defenceTarget.zones.map((zone) => {
      const label = this._defenceZoneLabel(zone.key);
      return {
        key: zone.key,
        label,
        value: zone.value,
        ariaLabel: game.i18n.format("SWFFG.VehicleDefenseZone.ZoneAria", {
          zone: label,
          dice: Math.max(0, zone.value),
        }),
      };
    });
    reticle.innerHTML = zoneReticleSvg({ zones, selected: this._defenceZone });

    const picked = zones.find((zone) => zone.key === this._defenceZone);
    selected.textContent = picked
      ? game.i18n.format("SWFFG.VehicleDefenseZone.Selected", {
          zone: picked.label,
          dice: Math.max(0, picked.value),
        })
      : game.i18n.localize("SWFFG.VehicleDefenseZone.None");
    selected.classList.toggle("ffg-defence-none", !picked);
    warning.textContent = picked ? "" : game.i18n.localize("SWFFG.VehicleDefenseZone.NoneWarning");
  }
```

Call it from `_refreshAdversary`, immediately before its closing `this._updatePreview(html);`:

```js
    this._refreshDefencePanel(html);
```

- [ ] **Step 4: Wire selection, by pointer and by keyboard**

In `_onRender`, after the `.adversary-mode-btn` handler, add:

```js
    // Delegated so it survives the panel being rebuilt on every target change.
    const selectZone = (event) => {
      const group = event.target?.closest?.(".ffg-zone");
      if (!group) return;
      event.preventDefault();
      const index = Number(group.dataset.zoneIndex);
      const zone = this._defenceTarget.zones[index];
      if (!zone) return;
      // Clicking the selected zone again clears it back to none.
      this._defenceZone = this._defenceZone === zone.key ? null : zone.key;
      this._refreshDefencePanel($(this.element));
      this._updatePreview($(this.element));
    };
    html.find(".ffg-defence-panel").on("click", selectZone);
    html.find(".ffg-defence-panel").on("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      selectZone(event);
    });
```

- [ ] **Step 5: Verify the gates**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, 727 tests, `fail 0`.

Run: `npx eslint modules/dice/roll-builder.js 2>&1 | tail -3`
Expected: still **2** errors.

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('en.json parses')"`
Expected: `en.json parses`.

- [ ] **Step 6: Commit**

```bash
git add templates/dice/roll-options-ffg.html modules/dice/roll-builder.js lang/en.json
git commit -m "Add the vehicle defence zone picker to the roll dialog

A reticle in a side panel that appears only while a single vehicle is targeted.
Clicking a wedge picks the zone the attack resolves against and its value lands
in the pool preview as setback; clicking it again clears the choice. Wedges are
focusable and answer Enter and Space, and carry aria-pressed.

Nothing picked is loud but never blocking: the reticle shows its warning state
and the Roll button stays live. Two vehicles targeted says so instead of
silently contributing nothing. The window grows and shrinks by a fixed delta so
a dialog the user resized is left alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Styling, in both themes

**Files:**
- Modify: `styles/starwarsffg.css` (after the `.adversary-pool-toggle` block at line 1327)
- Modify: `styles/mandar.css` (after the `.adversary-pool-toggle` block at line 1630)

**Interfaces:**
- Consumes: the DOM contract from Task 6 and the SVG class names from Task 3 (`.ffg-zone`, `.ffg-zone-selected`, `.ffg-zone-empty`, `.ffg-zone-wedge`, `.ffg-zone-name`, `.ffg-zone-value`, `.ffg-zone-hub`, `.ffg-zone-reticle`, `.ffg-zone-unpicked`).
- Produces: no JS interface.

**Never run `gulp css`.** Paste the identical block into both files by hand.

- [ ] **Step 1: Add the panel and reticle rules to `styles/starwarsffg.css`**

Insert after the `.starwarsffg .dice-pool-dialog .adversary-mode-btn` block:

```css
/* Vehicle defence zone picker. The dialog's form is a flex row; the existing
   column keeps its width and the panel sits beside it. */
.starwarsffg .dice-pool-dialog {
  flex: 1 1 auto;
  min-width: 0;
}
.starwarsffg .ffg-defence-panel {
  flex: 0 0 158px;
  box-sizing: border-box;
  padding: 8px 6px;
  border-left: 1px solid rgba(0, 0, 0, 0.35);
  text-align: center;
}
.starwarsffg .ffg-defence-heading {
  font-size: 8.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.7;
}
.starwarsffg .ffg-defence-ship {
  font-size: 10px;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.starwarsffg .ffg-defence-selected {
  font-size: 11px;
  font-weight: 600;
  color: #a8791f;
}
.starwarsffg .ffg-defence-selected.ffg-defence-none {
  font-weight: 500;
  color: #a3521f;
}
.starwarsffg .ffg-defence-warning {
  font-size: 9.5px;
  line-height: 1.4;
  color: #a3521f;
}
.starwarsffg .ffg-zone-reticle {
  width: 140px;
  height: 140px;
}
.starwarsffg .ffg-zone-wedge {
  fill: rgba(0, 0, 0, 0.12);
  stroke: rgba(0, 0, 0, 0.4);
  stroke-width: 1.4;
}
.starwarsffg .ffg-zone {
  cursor: pointer;
}
.starwarsffg .ffg-zone:hover .ffg-zone-wedge {
  fill: rgba(168, 121, 31, 0.25);
}
.starwarsffg .ffg-zone-selected .ffg-zone-wedge {
  fill: rgba(168, 121, 31, 0.45);
  stroke: #a8791f;
  stroke-width: 1.6;
}
.starwarsffg .ffg-zone:focus-visible {
  outline: none;
}
.starwarsffg .ffg-zone:focus-visible .ffg-zone-wedge {
  stroke: #2f6fa3;
  stroke-width: 2.2;
}
.starwarsffg .ffg-zone-name {
  font-size: 9px;
  text-anchor: middle;
  fill: currentColor;
}
.starwarsffg .ffg-zone-value {
  font-size: 12px;
  text-anchor: middle;
  fill: currentColor;
}
.starwarsffg .ffg-zone-empty .ffg-zone-name,
.starwarsffg .ffg-zone-empty .ffg-zone-value {
  opacity: 0.55;
}
.starwarsffg .ffg-zone-hub {
  fill: rgba(0, 0, 0, 0.25);
  stroke: rgba(0, 0, 0, 0.4);
  stroke-width: 1.4;
}
.starwarsffg .ffg-zone-unpicked .ffg-zone-wedge {
  fill: rgba(163, 82, 31, 0.14);
  stroke: #a3521f;
  stroke-dasharray: 4 3;
}
.starwarsffg .ffg-zone-unpicked .ffg-zone-hub {
  stroke: #a3521f;
}
```

- [ ] **Step 2: Paste the identical block into `styles/mandar.css`**

Insert the same rules after that file's `.adversary-mode-btn` block. The active `mandarBeskarAstromech` theme imports `mandar.css` and disables `starwarsffg.css` entirely, so a rule present only in the other file simply will not exist at runtime.

- [ ] **Step 3: Verify both files carry the rules**

Run: `grep -c "ffg-zone-wedge" styles/starwarsffg.css styles/mandar.css`
Expected: a non-zero, equal count for both files.

Run: `git diff --stat styles/`
Expected: both files listed, with similar line counts.

- [ ] **Step 4: Commit**

```bash
git add styles/starwarsffg.css styles/mandar.css
git commit -m "Style the vehicle defence zone panel in both themes

The rules go in both stylesheets by hand: the active mandar theme disables
starwarsffg.css outright, so a rule in only one file never renders. Keyboard
focus gets its own outline so it is distinguishable from hover.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The chat-card line

**Files:**
- Modify: `modules/dice/roll.js:278`, `:409`, `:422`
- Modify: `modules/dice/roll-builder.js:392`
- Modify: `templates/dice/roll-ffg.html:2-6`

**Interfaces:**
- Consumes: `_defenceZoneSnapshot()` (Task 5), the `SWFFG.VehicleDefenseZone.CardLine` / `.CardNone` keys (Task 6).
- Produces: `RollFFG.prototype.defenceZoneText: string | null`, surfaced to the card template as `system.defenceZoneText`.

**Why the plumbing is in four places:** `render()` overwrites `this.data` wholesale from the item uuid, so a value written onto `this.data` before rendering is lost; and a chat message is re-rendered from serialised data after a reload, so anything not in `toJSON`/`fromData` disappears. `flavorText` already threads all four points — mirror it exactly.

- [ ] **Step 1: Carry the text on the roll**

In `modules/dice/roll.js`, in `render()`, immediately after line 278 (`this.data.additionalFlavorText = this.flavorText;`) add:

```js
      this.data.defenceZoneText = this.defenceZoneText ?? null;
```

and in the `else` branch that builds a fresh `this.data`, add the same key:

```js
      this.data = {
        additionalFlavorText: this.flavorText,
        defenceZoneText: this.defenceZoneText ?? null,
      };
```

In `toJSON()`, after line 409:

```js
    json.defenceZoneText = this.defenceZoneText ?? null;
```

In `fromData()`, after line 422:

```js
    roll.defenceZoneText = data.defenceZoneText ?? null;
```

- [ ] **Step 2: Set it when the roll is built**

In `modules/dice/roll-builder.js`, replace line 392 with:

```js
        const roll = new game.ffg.RollFFG(rollPool.renderDiceExpression(), this.roll.item, rollPool, this.roll.flavor);
        // The click-time snapshot, not a fresh read: the card must describe the
        // pool that was actually rolled, even if targeting changed during the awaits.
        roll.defenceZoneText = zoneSnapshot === null
          ? null
          : zoneSnapshot.key === null
            ? game.i18n.localize("SWFFG.VehicleDefenseZone.CardNone")
            : game.i18n.format("SWFFG.VehicleDefenseZone.CardLine", {
                zone: zoneSnapshot.label,
                dice: zoneSnapshot.dice,
              });
```

- [ ] **Step 3: Render it on the card**

In `templates/dice/roll-ffg.html`, after the existing `additionalFlavorText` block (lines 2-6), insert:

```html
  {{#if system.defenceZoneText}}
  <div class="dice-defence-zone">
    {{system.defenceZoneText}}
  </div>
  {{/if}}
```

- [ ] **Step 4: Verify the gates**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, 727 tests, `fail 0`.

Run: `npx eslint modules/dice/roll.js modules/dice/roll-builder.js 2>&1 | tail -3`
Expected: `roll.js` still **2** errors, `roll-builder.js` still **2**.

- [ ] **Step 5: Commit**

```bash
git add modules/dice/roll.js modules/dice/roll-builder.js templates/dice/roll-ffg.html
git commit -m "Record the defence zone on the roll's chat card

One line saying which zone the attack resolved against and what it cost, or
that no zone was chosen -- so the GM applying damage knows which side was hit,
and a forgotten pick is still catchable after the dialog has closed.

It is its own field rather than appended to the flavour text, which belongs to
the player, and it threads render/toJSON/fromData the way flavorText does so
it survives a reload re-rendering the message from stored data.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Lock defence on a pool sent to another player

**Files:**
- Modify: `modules/dice/roll-builder.js:357-378`
- Modify: `modules/swffg-main.js:1604-1609`

**Interfaces:**
- Consumes: `this.roll.targetDefenceResolved` / `this.roll.defenceZone` (Task 5), `zoneSnapshot` (Task 5).
- Produces: `flags.starwarsffg.roll.targetDefenceResolved` and `flags.starwarsffg.roll.defenceZone` on a sent-pool chat message.

**Why:** the Send To Player path forwards `rollPool`, which is **already** the output of `_effectivePool()` — defence included. Reopening it on the recipient's client and resolving defence again from *their* targets would add it a second time. The recipient must treat the pool's defence as final.

- [ ] **Step 1: Mark the sent pool as resolved**

In `modules/dice/roll-builder.js`, immediately before the `let chatOptions = {` line inside `if (sentToPlayer)`, add:

```js
        // rollPool already contains this client's target-derived defence. Tell the
        // recipient so their own targeting does not add it again, and carry the zone
        // snapshot so the eventual card still names the zone the sender picked.
        this.roll.targetDefenceResolved = true;
        this.roll.defenceZone = zoneSnapshot;
```

`this.roll` is serialised wholesale into `flags.starwarsffg.roll`, so both fields travel with no change to the flag shape.

- [ ] **Step 2: Pass them back when the pool is reopened**

In `modules/swffg-main.js`, replace the `displayRollDialog` call at line 1608 with:

```js
    DiceHelpers.displayRollDialog(
      poolData.roll.data,
      dicePool,
      poolData.description,
      poolData.roll.skillName,
      poolData.roll.item,
      poolData.roll.flavor,
      poolData.roll.sound,
      {
        skillValue: poolData.roll.skillValue ?? null,
        targetDefenceResolved: poolData.roll.targetDefenceResolved === true,
        defenceZone: poolData.roll.defenceZone ?? null,
      },
    );
```

Messages sent before this change carry none of the three fields; each falls back to its default, so an old message reopens exactly as it does today.

- [ ] **Step 3: Verify the gates**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, 727 tests, `fail 0`.

Run: `npx eslint modules/swffg-main.js modules/dice/roll-builder.js 2>&1 | tail -3`
Expected: `swffg-main.js` still **6** errors, `roll-builder.js` still **2**.

- [ ] **Step 4: Commit**

```bash
git add modules/dice/roll-builder.js modules/swffg-main.js
git commit -m "Treat defence as final on a pool sent to another player

The sent pool already contains the sender's target-derived defence, so
resolving it again from the recipient's targets would apply it twice. The
message now says the defence is resolved, and carries the sender's zone so the
eventual chat card still names it. Messages sent before this reopen unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Changelog and live verification

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** none.

Nothing in Tasks 5–9 is reachable by the Node tier. This task is where the feature is actually proven.

- [ ] **Step 1: Write the changelog entry**

`CHANGELOG.md` opens with an `` `Unreleased` `` block. Add these bullets to the **top** of that list, in the existing user-facing voice:

```markdown
* Added — **vehicles now defend with the zone you are actually shooting at.** Target a single vehicle with a weapon and the roll dialog grows a reticle showing each of its defence zones; pick the one your attack comes from and its shields join the pool as setback dice. The zone you chose is recorded on the roll's chat card, so whoever applies the damage knows which side was hit. Rolling without picking is still allowed — the reticle and the card both say so.
* Fixed — **shooting at a vehicle with a personal weapon broke the roll.** Vehicles have per-zone shields rather than the melee/ranged defence a character has, and the system looked for the stat they do not have, so the attack failed outright instead of rolling.
* Fixed — **ship weapons ignored the defence of whatever they were shot at.** A ship weapon fired at a character never picked up their ranged defence, because only personal weapons were being checked.
* Fixed — **a defender targeted after the roll dialog opened was ignored.** Defence was worked out the moment you clicked the attack and never revisited, so targeting someone afterwards added nothing and switching targets rolled the previous defender's number. It now follows your targets while the dialog is open.
```

- [ ] **Step 2: Verify the changelog and the whole gate set**

Run: `head -6 CHANGELOG.md`
Expected: the `` `Unreleased` `` header followed by the four new bullets.

Run: `npm test 2>&1 | tail -8`
Expected: **727 pass, 0 fail**.

Run: `npm run check:imports 2>&1 | tail -3`
Expected: `PASS — 0 unpinned finding(s)`.

Run: `npx eslint modules/helpers/dice-helpers.js modules/helpers/defence-helpers.js modules/helpers/vehicle-defence.js modules/dice/roll-builder.js modules/dice/roll.js modules/swffg-main.js 2>&1 | tail -3`
Expected: total errors across those six files no higher than **10** (0 + 0 + 0 + 2 + 2 + 6), with the two new modules contributing 0.

- [ ] **Step 3: Commit the changelog**

```bash
git add CHANGELOG.md
git commit -m "Note the vehicle defence zone picker in the changelog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify live in Foundry**

Open the world with this system, **hard-reload** the client (modules are cached — otherwise you are testing the previous code), and work through every case. Report the actual result of each; do not mark the task done on any that fails.

1. **Ship weapon at one vehicle.** Panel slides out to the LEFT, window widens, ship name correct. Fore arrives already selected. Click another wedge: it fills gold, the selected line reads `Fore · +2 setback`, and exactly that many setback dice appear in the pool preview. Roll — the chat card carries `Fore zone · +2 setback`.
2. **Roll with nothing picked.** Click the selected wedge to clear it first (fore is pre-selected). Wedges dashed amber, `None chosen`, warning line shown, Roll button still enabled. The card says `No defence zone chosen`.
3. **Click the selected wedge again.** Selection clears back to the warning state and the setback dice leave the preview.
4. **Retarget to a different vehicle.** Panel rebuilds with the new ship's name and values, and the zone re-defaults to that ship's fore rather than carrying the old pick over.
5. **Retarget to a character.** Panel disappears, window returns to its previous width, and the character's ranged defence now appears in the preview.
6. **Target two vehicles.** Reticle replaced by `Target one vehicle to pick a zone.`, no vehicle setback. Roll: the card must still carry `No defence zone chosen` — an ambiguous roll went out without shields applied, and passing silently is the failure the loud-not-blocking rule exists to prevent.
7. **Non-weapon roll with a vehicle targeted.** Target a ship and roll a plain skill check (Piloting: Space, or any skill row on the sheet). No panel, no window widening, no setback, and **no zone line on the chat card** — defence does not apply to a non-attack, so nothing about it may appear.
8. **Personal ranged weapon at a vehicle.** No longer throws; the picker appears as for a ship weapon.
9. **Ship weapon at a character.** Their `defence.ranged` appears in the preview for the first time.
10. **A two-zone vehicle.** Edit a test vehicle so only `fore` and `aft` are non-zero — then confirm the reticle still shows all four wedges, because *all four are declared in the schema*. To exercise the two-wedge path you must temporarily reduce the declared fields in `modules/data/models/actor/vehicle.js`; if you do, revert it afterwards. Note the outcome either way.
11. **Send To Player with a zone picked.** As GM, pick a zone, send the pool to a player. On their client, target something of their own and open the pool: no additional defence is added, no panel is shown, and their eventual card still names the sender's zone.
12. **Target change during the post-click awaits.** Pick a zone on an ammo-tracked weapon, press Roll, and immediately retarget. The rolled setback and the card's zone must both describe the click-time state.
13. **Keyboard.** Tab through the wedges: focus is visible and distinct from hover. Enter and Space each toggle the focused wedge, and `aria-pressed`, the selected line and the preview dice all move together.
14. **Baseline regressions.** An ordinary skill roll with no target is unchanged. A weapon roll with `useDefense` turned off shows no panel and adds no defence. The Adversary toggle still upgrades difficulty, and does so *alongside* a zone setback rather than replacing it.
15. **Both themes.** Repeat case 1 under the `mandarBeskarAstromech` theme and under the stock theme; the panel must be styled in both.
16. **Reload with a card on screen.** Reload the client and confirm the zone line is still on the existing chat card (this is what the `toJSON`/`fromData` plumbing buys).
17. **Number placement.** On a four-zone ship the value sits directly under its zone name in every wedge, including aft at the bottom and port/starboard at the sides — never above or beside it.

- [ ] **Step 5: Fix anything live verification turned up, then re-run the gates**

Any fix gets its own commit. Re-run Step 2's four commands afterwards.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: zone reading → 1; ordering/geometry → 1 and 3; target resolution → 2; side panel and its states → 6 (styling 7); keyboard operability → 3 and 6; live rebuild on target change → 5 step 6; applying the setback and the click-time snapshot → 5; unifying character defence → 4 and 5; pools sent to another player → 9; chat card → 8; "when nothing appears at all" → the shared `_defenceEligible` gate in 5, applied in 5 and 6; new module API → 1–3; files-changed table → all tasks; localisation keys → 6; testing → the per-task test steps plus 10 step 4; risks → 10 step 4 cases 12 and 14, and the flex-row check folded into 6 and 10.

**One spec requirement I deliberately implemented differently**, called out in File Structure above: the spec has `_effectivePool()` calling `DiceHelpers.getDefenseDice`, which would close an import cycle, so the calculation moved to `defence-helpers.js` and `getDefenseDice` survives as a delegating wrapper. Behaviour is identical.

**Placeholder scan.** No TBD/TODO, no "handle edge cases", no "similar to Task N". Every code step carries the actual code and every run step carries the actual command and expected output.

**Type consistency.** `vehicleDefenceZones` returns `{key, value}` throughout (Tasks 1, 2, 5, 6). `zoneReticleSvg` takes the richer `{key, label, value, ariaLabel}`, which only Task 6 constructs — matching the spec's rule that localisation stays outside the pure helper. `resolveDefenceTarget`'s `{status, actor, zones}` is consumed unchanged in Tasks 5 and 6. `_defenceZoneSnapshot()` returns `{key, label, dice}` — with `key`/`label` null for an unpicked or ambiguous vehicle roll, and the whole thing null when no vehicle is targeted or the roll is not an attack — in Task 5, and is consumed with those exact fields in Tasks 8 and 9. Task 8's card text branches on `key === null`, which is what turns an unpicked *or* ambiguous roll into the `CardNone` warning. `characterDefenceDice({skillValue, targets})` is called with that shape in both Task 5 call sites.

**Test count arithmetic.** 690 baseline → 700 (Task 1, +10) → 708 (Task 2, +8) → 717 (Task 3, +9) → 727 (Task 4, +10), and 727 thereafter.
