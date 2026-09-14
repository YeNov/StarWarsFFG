# Minion vehicle groups — design

**Date:** 2026-09-14
**Branch:** `minion-vehicle-groups`
**Scope:** `YeNov/StarWarsFFG` fork only.

## Problem

GMs run squadrons of identical, minion-crewed craft (a flight of four TIE/ln fighters) with the
minion rules: one combined damage track, a vehicle lost each time the damage passes another
vehicle's threshold, and the crew's group skills weakening as the group shrinks. The system has
those rules only for the `minion` actor type
([actor-ffg.js `_prepareMinionData`](../../../modules/actors/actor-ffg.js)). There is one `vehicle`
type and nothing that makes a vehicle behave as a group, so today a squadron is either one
vehicle with a hand-edited hull threshold and no automation, or four separate actors.

Two facts shape the design:

1. **Vehicles have no skills or characteristics.** `VehicleDataModel`
   ([vehicle.js](../../../modules/data/models/actor/vehicle.js)) mixes in only Biography,
   Attributes and MetaOnly. Every skilled vehicle roll borrows the skill from a crew member stored
   in `flags.starwarsffg.crew` ([crew.js](../../../modules/helpers/crew.js)) and builds the pool
   with `get_dice_pool(crew_id, skill)` ([dice-helpers.js](../../../modules/helpers/dice-helpers.js)).
2. **Several crew roll paths look the vehicle up by id** (`build_crew_roll(vehicle_id, …)`,
   `buildPilotRoll(vehicle_id, …)`), which is always the world actor. An unlinked squadron token
   would read the wrong group.

## Goal

A **Minion Vehicle** toggle in a vehicle's Sheet Options that applies the minion rules to it:
pooled hull trauma, a derived count of vehicles left, crew group skills ranked at vehicles left − 1,
critical hits destroying one vehicle, and the same group controls and token tally minions have, on
both the classic and Codex vehicle sheets.

## Non-goals

- No new actor type. Vehicles stay one type; the behaviour is a per-actor option.
- No skills or characteristics on vehicles.
- No change to System Strain. It stays one ordinary track for the whole group, with the threshold
  as entered.
- No change to Apply Damage.
- No change to minion behaviour, including the existing kill-helper off-by-one noted under
  Follow-ups.
- No migration. Existing vehicles read the new field's defaults.
- No changes to tokens already placed on scenes.

## Decisions taken during design

| Question | Decision |
| --- | --- |
| Where group skills come from | The crew actor's own skills. A skill with GS ticked on the crew actor is ranked at `clamp(vehicles left − 1, 0, 5)` when rolled from a minion vehicle group; any other skill keeps its rank. |
| System Strain | Unchanged: one track, not pooled, never removes vehicles. |
| Critical hit on the group | Destroys one vehicle. No crit table roll, no Critical Damage item. |
| Sheets | Classic and Codex. |
| Token link | Turning the toggle on unlinks the prototype token; turning it off relinks it. Placed tokens untouched. |
| Per-vehicle hull threshold | The existing stored `system.stats.hullTrauma.max`. The group threshold is derived, never stored. |
| Group size | New stored field `system.quantity.max`; `system.quantity.value` (vehicles left) is derived. Same shape as minions. |

## Design

### 1. Toggle

Registered with the other vehicle options in `ActorSheetFFG.activateListeners`
([actor-sheet-ffg.js](../../../modules/actors/actor-sheet-ffg.js), vehicle block beside
`enableHyperdrive` / `enableSensors`):

```js
this.sheetoptions.register("minionVehicle", {
  name: game.i18n.localize("SWFFG.MinionVehicle"),
  hint: game.i18n.localize("SWFFG.MinionVehicleHint"),
  type: "Boolean",
  default: false,
});
```

Stored at `flags.starwarsffg.config.minionVehicle`. The Codex sheet inherits the registration.

Hint text (`SWFFG.MinionVehicleHint`):

> Treat this vehicle as a group of identical minion vehicles, such as a TIE squadron. Hull Trauma
> Threshold is per vehicle: the group's threshold is that value × vehicles in the group, and a
> vehicle is destroyed each time the damage passes another per-vehicle threshold. Crew group skills
> roll at vehicles left − 1 (max 5). A critical hit destroys one vehicle. System Strain is shared by
> the group. Turning this on unlinks the prototype token so each token you place is its own group.

### 2. Data

`VehicleDataModel` gains:

```js
quantity: new f.SchemaField({ value: num(1), max: num(1) }),
```

`max` is the stored group size. `value` is always overwritten in prepared data while the toggle is
on and ignored while it is off. The per-vehicle hull threshold is the stored
`system.stats.hullTrauma.max`, which is what stat blocks and the OggDude importer already write.

### 3. Group rules module

New pure module `modules/helpers/minion-group.js`, with no Foundry globals at import time, so it
can be tested in Node:

| Export | Contract |
| --- | --- |
| `isMinionVehicle(actor)` | `actor?.type === "vehicle"` and the `config.minionVehicle` flag is `true`. |
| `groupThreshold(perUnit, size)` | `max(0, perUnit) × max(0, size)`. |
| `unitsLeft(damage, perUnit, size)` | `clamp(size − floor((damage − 1) / perUnit), 0, size)`, the minion formula (a unit drops when damage *exceeds* each per-unit threshold). With `perUnit <= 0`, returns `size` at 0 damage and `0` above it. |
| `groupSkillRank(left)` | `clamp(left − 1, 0, 5)`. |
| `effectiveSkillRank(skill, options)` | `options.groupSkillRank` when it is a number and `skill.groupskill` is true, else `skill.rank`. |
| `stepUnits(damage, perUnit, size, dir)` | The next damage value after destroying (`dir = −1`) or reviving (`dir = +1`) one unit. Splits the damage into destroyed units plus partial damage on the next unit, moves the destroyed count by one (clamped to `[0, size]`) and keeps the same partial damage. Result clamped to `[0, size × perUnit + 1]`; returns the input unchanged at either end. Inputs are truncated to integers, with `perUnit` floored at 1 and `size` and `damage` at 0, as the stepper does today. This is the arithmetic the Codex minion stepper already uses ([codex-sheets.js](../../../modules/actors/codex-sheets.js) `.cdx-gs-step`), extracted. |
| `wipeOutDamage(perUnit, size)` | `groupThreshold(perUnit, size) + 1`. |
| `crewRollOptions(vehicleActor)` | `{ groupSkillRank: groupSkillRank(vehicleActor.system.quantity.value) }` for a minion vehicle, else `{}`. Reads the actor it is given, never a lookup. |
| `prototypeLinkUpdate(actor, changes)` | Returns `{ actorLink: !enabled }` when `changes` sets `flags.starwarsffg.config.minionVehicle` to a value different from the actor's current flag, the actor is a vehicle, and the actor is not a token actor; otherwise `null`. |

### 4. Prepared data

In `ActorFFG.prepareDerivedData` ([actor-ffg.js](../../../modules/actors/actor-ffg.js)), in the
vehicle branch **before** `hullOverThreshold` is computed, when `isMinionVehicle(this)`:

```js
const hull = data.stats.hullTrauma;
const unit = hull.unit ?? hull.max;          // guard against a second prepare pass
hull.unit = unit;
hull.max = groupThreshold(unit, data.quantity.max);
data.quantity.value = unitsLeft(hull.value, unit, data.quantity.max);
```

`hull.max` at this point already includes Active Effects (Threshold → Hull Trauma), so an
attachment raises each vehicle's hull. The Edit Mode owner prepares without stat effects
(`ActorFFG.allApplicableEffects`), so the per-vehicle input they edit shows and saves the base value.

The token bar (`bar1: stats.hullTrauma`), the FFG `_drawBar` override and
`modifyTokenAttribute`, which does not cap hull trauma, read the pooled track with no change.

### 5. Token link

`ActorFFG._preUpdate` calls `prototypeLinkUpdate(this, changes)` and, when it returns an object,
merges it into `changes.prototypeToken`. The Sheet Options Accept handler rewrites every option on
each save, which is why the change is detected against the current flag and not by the key's
presence.

### 6. Crew rolls

`get_dice_pool(actor_id, skill_name, incoming_roll, options = {})` resolves the skill as today and
takes its rank from `effectiveSkillRank(skill, options)`. Existing callers pass nothing.

Call sites that pass `crewRollOptions(<vehicle actor>)`:

| Path | Change |
| --- | --- |
| `ActorSheetFFG.vehicleCrewGunneryRoll` (Weapons tab roll, both sheets) | Pass `crewRollOptions(this.actor)`. |
| `.roll-button-crew` handler: weapon-picker gunner path and role-skill path | Pass `crewRollOptions(this.actor)`. |
| `handlePilotCheck` → `buildPilotRoll` ([crew.js](../../../modules/helpers/crew.js)) | `buildPilotRoll` accepts a vehicle actor or an id (id kept for macros); passes the options. `handlePilotCheck` passes the actor. |
| `build_crew_roll` (Crew tab dice preview, from `ActorSheetFFG.getData`) | Accepts a vehicle actor or an id; `getData` passes `this.actor`; passes the options. |
| `_findActorForInitiative` ([combat-ffg.js](../../../modules/combat-ffg.js)) | For a minion vehicle combatant, returns a copy of the Pilot crew's system data whose GS skills carry `effectiveSkillRank(skill, crewRollOptions(c.actor))`. The crew actor's prepared data is never mutated. |

The roll dialog receives the built pool, so the scaled rank reaches the chat card. Rolls made from
the crew actor's own sheet are unchanged. A minion vehicle without crew keeps the difficulty-only
fallback.

### 7. Destroying vehicles and critical hits

`killMinion(actor)` and `killMinionGroup(actor)` ([minions.js](../../../modules/helpers/minions.js))
branch on `isMinionVehicle(actor)`:

- Destroy one: `system.stats.hullTrauma.value = stepUnits(value, unit, size, −1)`, no update when unchanged.
- Wipe out: `system.stats.hullTrauma.value = wipeOutDamage(unit, size)`.

The minion branches keep their current code.

`ApplyCrit.show` ([apply-crit.js](../../../modules/helpers/apply-crit.js)) sends a minion vehicle
target down the minion branch, `applyToTargetActor(realActor, { type: "kill-minion" })`, before any
crit table work.

`narrowApplyRequest` ([gm-bridge.js](../../../modules/helpers/gm-bridge.js)) accepts `kill-minion`
for a minion or a minion vehicle. The check is made against the resolved target actor on the GM's
side, not a flag in the payload, so a plain vehicle, character, rival or nemesis is still refused.
`performApply` is unchanged; `killMinion` dispatches.

### 8. Token tally

The `refreshToken` hook ([swffg-main.js](../../../modules/swffg-main.js)) draws the tally for
`actor.type === "minion" || isMinionVehicle(actor)`. `drawMinionCount` already reads
`system.quantity.value/max` and still honours the `showMinionCount` setting, whose hint gains a
mention of minion vehicles.

### 9. Classic vehicle sheet

`ActorSheetFFG.getData` exposes `isMinionVehicle`. In `ffg-vehicle-sheet.html`, group mode only:

- The Hull Trauma box's threshold field is labelled **Per Vehicle** and shows
  `data.stats.hullTrauma.unit`, still named `data.stats.hullTrauma.max` and still `disabled` outside
  Edit Mode.
- A second header row (`grid-3col`, reusing `.minion-stats`):
  - **Vehicles in Group**: split block, `data.quantity.max` (editable) and Left (`data.quantity.value`, `disabled=true`).
  - **Group Hull Threshold**: read-only block with no `name`.
  - **Destroy Vehicle / Wipe Out**: `minion-control kill-minion` / `minion-control kill-group`
    buttons, handled by the existing `.minion-control` listener.
- The forced-render change listener that today covers minion derived inputs also covers
  `data.quantity.max`, `data.stats.hullTrauma.value` and `data.stats.hullTrauma.max` for a minion
  vehicle.

### 10. Codex vehicle sheet

In `codex-vehicle.html`, group mode replaces the Hull Trauma card with:

- **Group Strength**: the minion markup: `.cdx-gs-step` −/+ around `data.quantity.value` / max
  (max an input in Edit Mode, named `data.quantity.max`), a *Vehicles in group* label, and
  `.cdx-wipeout`.
- **Combined Hull Pool · N per vehicle**: per-vehicle input named `data.stats.hullTrauma.max` with
  value `data.stats.hullTrauma.unit` (Edit Mode only), the existing `data-stat="hullTrauma"` ±
  stepper and current-value input, and a track built from a new `cdxVehHullGroups` context entry:
  one group per vehicle, pips when the per-vehicle value is below 20 (the cutoff `_cdxTrack` uses
  for pips versus a bar), otherwise one mini bar per vehicle filled by that vehicle's share of the
  damage.

The System Strain card is hidden in group mode, as a minion sheet has no strain box; the track itself is untouched, so Group Strength spans that row alone.

On every Codex vehicle, group or not, the Silhouette / Speed / Handling / Armour chip row sits above the two columns (`cdx-veh-chiprow`, full width) instead of at the top of the left column.

Handler changes in `CodexActorSheet`:

- `.cdx-gs-step` computes the next value with `stepUnits` for the actor's track: `stats.wounds` and
  `unit_wounds` for minions, `stats.hullTrauma` and `hullTrauma.unit` for minion vehicles. Minion
  results are identical to today's.
- `.cdx-wipeout` keeps calling `killMinionGroup`, which dispatches.
- The explicit-write listeners already cover `data.quantity.max` and `data.stats.hullTrauma.max`.

### 11. Localisation

`lang/en.json`: `SWFFG.MinionVehicle`, `SWFFG.MinionVehicleHint`, `SWFFG.MinionVehiclePerVehicle`,
`SWFFG.MinionVehicleCount`, `SWFFG.MinionVehicleLeft`, `SWFFG.MinionVehicleGroupThreshold`,
`SWFFG.MinionVehicleLosses`, `SWFFG.MinionVehicleDestroy`, `SWFFG.MinionVehicleWipeOut`, plus the updated
`showMinionCount` hint.
`lang/codex/en.json`: `SWFFG.Codex.CombinedHullPool`, `SWFFG.Codex.PerVehicle`,
`SWFFG.Codex.VehiclesInGroup`, `SWFFG.Codex.HullSuffered`.
Other languages fall back to English.

## Error handling

- A per-vehicle threshold of 0 or less makes no division: `unitsLeft` handles it explicitly.
- A group size of 0 or less gives a group threshold of 0 and 0 vehicles left, no exception.
- Codex context building for the hull groups sits inside the vehicle `try` block, whose fallback
  sets `cdxVehHullGroups = []`.
- The kill-minion bridge refusal for a non-group target keeps its existing notification.

## Testing

Node tests (`npm test`):

- `tests/node/minion-group.test.mjs` covers every export in section 3:
  - `unitsLeft` at 0, `perUnit`, `perUnit + 1`, the group threshold, the group threshold + 1, and beyond
  - the `perUnit <= 0` guard
  - the `groupSkillRank` clamp
  - `stepUnits` destroy and revive with partial damage preserved, and no change at either end
  - the second-pass guard
  - `effectiveSkillRank` with and without GS and options
  - `prototypeLinkUpdate` for a changed flag, an unchanged flag, a token actor and a non-vehicle
- `tests/node/gm-bridge-apply.test.mjs`: `kill-minion` accepted for a minion vehicle, refused for a
  plain vehicle and a character.
- A regression case asserting `stepUnits` reproduces the Codex minion stepper's current results
  across a grid of wounds, unit and size values.

Gates: `npm test`, `npm run check:imports`, `npm run lint`, `npm run compile`.

Live check in Foundry:

1. Toggle Minion Vehicle on a TIE fighter and confirm the prototype token is unlinked.
2. Set the group size to 4 on both sheets and check view mode and Edit Mode.
3. Apply Damage across per-vehicle boundaries and confirm Left, the tally and the token bar.
4. Apply Crit and confirm one vehicle is destroyed with no Critical Damage item added.
5. Add a TIE Pilot minion with GS Gunnery and Piloting as crew. Confirm the weapon roll, pilot
   check, Crew tab preview and initiative all use vehicles left − 1.
6. Place two tokens and confirm they have independent pools.
7. Turn the toggle off and confirm the sheets and the token link revert.

## Changelog

An **Added** entry in the `Unreleased` block of `CHANGELOG.md`, written for GMs, linked to the PR
once opened.

## Follow-ups (separate tasks)

- `getKillMinionUpdate` always adds `unit_wounds + 1`, so every minion kill after the first leaves
  one extra wound on the next member. The Codex stepper does not have this problem.
- The Codex vehicle sheet's *Crew* count counts `shipcrew` items, but crew live in
  `flags.starwarsffg.crew`, so it always reads 0.
