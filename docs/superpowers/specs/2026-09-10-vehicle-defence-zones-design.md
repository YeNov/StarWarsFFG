# Vehicle defence zones in the roll dialog — design

**Date:** 2026-09-10
**Branch:** `vehicle-defence-zones`
**Scope:** Local fork only; no upstream PR.

## Problem

A vehicle's defence is not one number. Each vehicle carries a defence value per zone
(`system.stats.shields.{fore, port, starboard, aft}` — [vehicle.js:30](../../../modules/data/models/actor/vehicle.js)),
and an attack resolves against exactly one of them: the zone the attacker is shooting into.
Targeting a token cannot tell the system which that is, because in practice starship combat is
run in the fiction rather than on a positioned, rotated map. Only the attacker knows.

The current pipeline has no concept of this at all. `DiceHelpers.getDefenseDice()`
([dice-helpers.js:119](../../../modules/helpers/dice-helpers.js)) reads
`target.actor.system.stats.defence.ranged|melee`, which vehicles do not have, so today:

1. Firing a **personal** ranged weapon at a targeted vehicle throws a `TypeError`
   (`Cannot read properties of undefined (reading 'ranged')`) and the roll dies.
2. Firing a **ship weapon** at anything contributes no defence whatsoever, because the
   function only accepts `itemData.type === "weapon"` and never `"shipweapon"`.
3. Consequently a vehicle's shields never affect any roll.

A third, pre-existing problem surfaces once any part of the dialog becomes target-aware:
character defence is computed **before** the dialog opens ([dice-helpers.js:83](../../../modules/helpers/dice-helpers.js),
[:240](../../../modules/helpers/dice-helpers.js)) and baked into the pool's `setback` count.
Nothing recomputes it. Target a defender *after* clicking the attack and their defence is
silently never applied; switch targets mid-dialog and the old defender's number is rolled.

## Goal

Let the attacker pick the defence zone in the roll dialog, live, with the chosen zone's value
feeding the pool as setback dice — and unify defence resolution so every target-derived number
in the dialog follows the current targets.

## Non-goals

- No silhouette-based difficulty or setback adjustments.
- No damage application to zones, and no stripping of shields when a hit lands.
- No schema change and no migration. `system.stats.shields` is read exactly as it is stored.
- No aggregate "ship defence" number is ever computed. There is no such thing in the rules;
  an attack always resolves against one zone.
- No geometric derivation of the zone from token positions or rotation.

## Decisions taken during design

| Question | Decision |
| --- | --- |
| Who picks the zone | The attacker, in the roll dialog. No geometry, no persistent facing. |
| Where the value comes from | `system.stats.shields.<zone>` directly. Never aggregated. |
| How zones are enumerated | From the actor's own prepared `shields` object, never a hardcoded key list. |
| Zone count | Whatever the data has. Four today; two or six must work with no code change. |
| Nothing picked | The roll is **allowed**, loudly: warning styling, warning line, and a note on the chat card. Never blocked. |
| Multiple vehicles targeted | Unsupported: no reticle, no vehicle setback, and the reason is stated on screen. |
| Target changes mid-dialog | Rebuild target-derived state from the new target. Selection always cleared. |
| Character defence | Becomes live too, resolved in the same place as the zone. |
| Chat card | One line recording the zone and its setback, or the missing-zone warning. |

## Behaviour

### Reading zones from the actor

Zones come from **prepared** data, `actor.system.stats.shields`. Because that is a `SchemaField`,
the prepared object contains exactly the declared fields and nothing else, so the zone set is
whatever the data model declares — today `fore, port, starboard, aft, label`.

Extraction keeps entries where `typeof value === "number" && Number.isFinite(value)`. That
separates zones from `label` structurally (a `StringField`) without naming any key, which is the
whole point: if the model later drops to two zones or gains a fifth, the picker follows with no
code change.

Per-zone display value is the stored number. The setback contribution is `Math.max(0, value)`,
so a zone driven negative by an Active Effect displays as stored but cannot roll negative dice.

Zone extraction itself remains dependency-free and returns `{key, value}`. The dialog's
presentation layer adds labels by resolving `SWFFG.VehicleDefense<Key>` (`Fore`, `Aft`, `Port`,
`Starboard` already exist at [en.json:201-204](../../../lang/en.json)), falling back to the
capitalised raw key for any zone without a string. Keeping localisation outside the helper is
what allows `vehicle-defence.js` to remain independent of `game`.

### Ordering and geometry

Stored order is `fore, port, starboard, aft`. Laying wedges out in that order would put port on
the right and starboard at the bottom, so arrangement uses a **presentation-only** ordering
table:

```js
const ZONE_ORDER = ["fore", "starboard", "aft", "port"];
```

It sorts whatever zones the data supplied; unrecognised keys are appended in their stored order.
It never decides which zones exist or how many — only where they sit. This is the one place a
list of zone names appears, and it is deliberate.

Wedges are then `360 / N` degrees each, with the first zone centred at 12 o'clock. Rendering is a
donut: outer radius 54, inner radius 21, in a `0 0 120 120` viewBox. Consequences:

| `stats.shields` contains | Result |
| --- | --- |
| 4 numeric zones (today) | Sorted `fore, starboard, aft, port`; four 90° wedges |
| 2 numeric zones (`fore`, `aft`) | Two 180° wedges — top half, bottom half |
| 1 numeric zone | One full-circle wedge, drawn as two 180° arcs; clicking anywhere selects it |
| 5 zones, one unknown (`dorsal`) | Known four sorted first, `dorsal` appended; five 72° wedges |
| `shields` missing, `null`, or not an object | Zero zones → no panel, same path as "not a vehicle" |
| Only `label` present | Zero numeric zones → no panel |
| A zone holding a non-number | Dropped by the filter |

In the five-zone case the known zones drift off their nautical angles (starboard lands at 72°
rather than 90°). Accepted: even division stays predictable for any N, and the case cannot occur
unless the data model changes.

### Target resolution

`resolveDefenceTarget(targets)` returns one of three statuses:

- `none` — no vehicle among the targeted tokens. No panel.
- `single` — exactly one vehicle. Panel shows its reticle.
- `ambiguous` — two or more vehicles. Panel shows the "target one vehicle to pick a zone"
  state instead of a reticle, and contributes no vehicle setback.

A non-vehicle targeted alongside a single vehicle does not make it ambiguous.

### The side panel

The dialog keeps its 350 px column untouched. A ~158 px `<aside>` appears to its right while the
eligible roll has either a `single` or `ambiguous` vehicle-target status, and the window widens to
make room. The reticle itself appears only for `single`; `ambiguous` uses the same aside for its
explanation. The aside is hidden for `none`.

For `single`, panel contents are, top to bottom: a small-caps `Defence zone` heading, the
vehicle's name, the reticle, and the selected zone plus its setback (`Fore · +2 setback`). For
`ambiguous`, the heading remains but the vehicle name, reticle, and selected-value line are
replaced by the explanatory placeholder.

States:

- **Zone picked** — that wedge filled gold with a gold stroke; others neutral; a zone at value 0
  is a legal pick and gets normal selected styling, it simply adds nothing.
- **Nothing picked** — every wedge dashed amber, hub ring amber, `None chosen`, and a warning
  line: *"Rolling without the target's shields."* The Roll button stays enabled.
- **Ambiguous** — no reticle; a dashed placeholder and *"Target one vehicle to pick a zone."*
- **Hover** — faint gold pre-light on the wedge under the cursor.

Clicking the selected wedge again clears the selection back to "none".

Every wedge is keyboard-operable as well as clickable: it is focusable, has `role="button"`, an
`aria-label` containing the zone name and setback value, and an `aria-pressed` state matching the
selection. Enter or Space performs the same toggle as a click, and keyboard focus receives a
visible outline independent of hover styling.

The hub is an empty circle. It deliberately carries no number: the wedge already shows the zone
value and the dice pool preview on the left already shows the setback dice appearing, so a hub
number would be a third copy of the same fact.

Window width is handled as a **delta**, applied once when the panel appears and once when it
disappears, guarded by a flag so repeated retargeting cannot accumulate width. A hard
`setPosition({width: 510})` is wrong — the dialog is user-resizable and that would stomp a
window the user had already sized.

### Live rebuild on target change

The existing `targetToken` hook registered in `_onRender`
([roll-builder.js:234](../../../modules/dice/roll-builder.js)) is reused, including its
`user?.id !== game.user.id` guard, so another player's targeting never touches this dialog.

**Rule: any target change rebuilds the target-derived state from the new target.** The panel is
torn down and rebuilt from the new vehicle's zones, and the selection is *always* cleared — even
when the new ship happens to have the same zone key. Every target change therefore costs one
deliberate pick.

This rebuilds only the target-derived parts, not the whole dialog. A full `render()` would wipe
manual pool edits and any flavour/sound values already entered, which is exactly why
`_refreshAdversary` manipulates the DOM instead of re-rendering. The panel's constant structural
shell may be injected as `innerHTML`, but actor names are assigned with `textContent`. The SVG
uses numeric zone indexes in `data-*` attributes rather than raw keys, and `zoneReticleSvg`
XML-escapes every displayed label before interpolation. No actor-authored or schema-derived text
is inserted as raw markup.

### Applying the setback

All defence resolution moves into `_effectivePool()`
([roll-builder.js:497](../../../modules/dice/roll-builder.js)), which is already the single seam
where the dialog turns the base pool into what it displays and what it rolls — both
`_updatePreview` ([:434](../../../modules/dice/roll-builder.js)) and the Roll handler
([:253](../../../modules/dice/roll-builder.js)) go through it.

```
setback += Math.max(characterDefence, zoneValue)
```

- **characterDefence** — unchanged semantics: the attacking skill selects which stat is read
  (`Ranged: Light`, `Ranged: Heavy`, `Gunnery` → `defence.ranged`; `Melee`, `Brawl`,
  `Lightsaber` → `defence.melee`; any other skill contributes nothing), and the maximum is taken
  across the targeted non-vehicle tokens.
- **zoneValue** — the selected zone's value, or 0 when nothing is picked or the status is
  `ambiguous`. There is **no** ranged/melee split for vehicles: a lightsaber boarding action and
  a heavy laser cannon read the same zone, because a vehicle has neither stat. The zone therefore
  applies on any weapon roll, not only the six skills in those two lists.
- `Math.max` between them preserves today's max-across-targets behaviour when a ship and a
  trooper are lit up at once.

Working in `_effectivePool()` means the preview and the roll cannot disagree, the base pool stays
untouched so re-picking a zone needs no delta bookkeeping, and manual `+setback` edits and the
Adversary clone keep working unchanged.

At Roll-button click, the handler synchronously snapshots the target collection, selected zone,
resolved status, and formatted chat-card value at the same moment it snapshots the effective
pool. `_effectivePool()` consumes that snapshot for the executed pool, and the later `RollFFG`
construction uses the same snapshot for `defenceZone`. None of the awaited status-effect, item,
or ammo work between those two points may re-read `_defenceZone` or `game.user.targets`; a target
change during an await must not make the card describe a different pool from the one rolled.

### Unifying character defence

`getDefenseDice` stops being called from `rollSkill` ([:83](../../../modules/helpers/dice-helpers.js))
and `rollItem` ([:240](../../../modules/helpers/dice-helpers.js)); those pools no longer carry
baked-in defence. The function itself stays, with four changes:

1. Signature becomes `getDefenseDice(skillValue, item, targets)` — the skill's `.value` string
   rather than a skill object, since the dialog holds the value and not the object, plus an
   explicit target collection. The `useDefense` check stays inside. Safe to change: the two call
   sites being removed were its only consumers.
2. Guard the read: `target.actor.system?.stats?.defence?.[stat] ?? 0` — fixes the vehicle crash.
3. Accept `shipweapon` alongside `weapon` — fixes ship-weapon-vs-character.
4. Return 0 for vehicle targets; the dialog owns those.

It is then called once, from `_effectivePool()`, against live `game.user.targets`. Blast radius is
small: those were the only two call sites in the system, and `RollBuilderFFG` is the only dialog
every attack passes through. (`combat-ffg.js` rolls pools directly for initiative, which never had
defence.)

**Skill identity in the dialog.** `getDefenseDice` needs the skill's `.value`
(`"Ranged: Heavy"`), but the dialog is handed `skill.label`. `RollBuilderFFG` gains
`this.roll.skillValue`, resolved as: an explicit new optional trailing argument to
`displayRollDialog` → else `this.roll.item?.system?.skill?.value` → else `null`. Initial rolls from
`rollSkill` and `rollItem` pass the explicit value; ordinary non-attack call sites remain
untouched and fall through. The sent-pool replay path described below passes through the value
stored on `this.roll`. A `null` skillValue contributes 0 character defence, matching today's
behaviour for a skill in neither list.

### Pools sent to another player

The existing Send To Player path sends `rollPool`, which is already the result of
`_effectivePool()`. A recipient must therefore treat target-derived defence as **resolved and
locked**. Otherwise opening the received pool while targeting a character or vehicle would add
defence a second time.

The sent message carries two additional fields inside its existing `roll` flag data:

- `targetDefenceResolved: true`, meaning the received `DicePoolFFG` already includes all
  target-derived defence and `_effectivePool()` must not call `getDefenseDice` or add a zone;
- the click-time `defenceZone` snapshot, when a vehicle was involved, so the eventual roll keeps
  the same chat-card line.

The chat-message handler in `swffg-main.js` passes those fields, plus the stored `skillValue`,
back into `displayRollDialog`. A received resolved pool hides the vehicle-zone panel and ignores
the recipient's live targets for defence: the sent pool contains the sender's exact defence
contribution, not a request to recalculate it from another user's targeting state. Manual pool
edits still operate on that received base pool; Adversary behavior is unchanged by this flag.

### Chat card

A single line, rendered in [roll-ffg.html](../../../templates/dice/roll-ffg.html) below the
existing `additionalFlavorText` block — deliberately **not** folded into that field, which holds
the player's own flavour text.

Content is `Fore zone · +2 setback`, or the warning `No defence zone chosen` when the roll went
out unpicked. It is absent for an ordinary roll with no vehicle target, but a received resolved
pool retains the sender's carried zone snapshot even though the recipient's panel is hidden.

Plumbing mirrors `flavorText` exactly, in all four places, or the line is lost when a message is
re-rendered from stored data after a reload:

- snapshotted synchronously with the effective pool, then assigned on the `RollFFG` instance in
  the Roll handler
  ([roll-builder.js:392](../../../modules/dice/roll-builder.js));
- re-applied onto `this.data` in `render()` ([roll.js:278](../../../modules/dice/roll.js)) —
  necessary because `render()` overwrites `this.data` from the item uuid;
- written in `toJSON()` ([roll.js:409](../../../modules/dice/roll.js));
- read back in `fromData()` ([roll.js:422](../../../modules/dice/roll.js)).

### When nothing appears at all

No panel, and no newly calculated vehicle contribution, when any of these hold: the `useDefense`
client setting is off; the roll is not a `weapon`/`shipweapon`; the pool arrived with
`targetDefenceResolved: true`; no targeted token is a vehicle; or the vehicle's `shields` yields
zero numeric zones. Clearing all targets hides the panel and restores the width.

## New module

`modules/helpers/vehicle-defence.js`, pure and dependency-free — no `game`, no DOM — following
the [vehicle-hardpoints.js](../../../modules/helpers/vehicle-hardpoints.js) precedent so it is
headlessly testable.

```js
export const ZONE_ORDER = ["fore", "starboard", "aft", "port"];

/** Ordered zones for a vehicle: [{key, value}]. Empty for malformed data. */
export function vehicleDefenceZones(actor)

/** {status: "none"|"single"|"ambiguous", actor, zones} from a target collection. */
export function resolveDefenceTarget(targets)

/** SVG markup string for labelled zones. Wedge count = zones.length. */
export function zoneReticleSvg({ zones, selected })
```

`zoneReticleSvg` returning a **string** rather than touching the DOM keeps the geometry unit
testable; the dialog only assigns it to `innerHTML`. The helper treats labels as text, escapes
them for XML, and emits only numeric zone indexes in attributes. The one-zone case is special:
SVG cannot draw a visible 360° arc whose endpoints coincide, so its donut path uses two 180° arc
segments.

## Files changed

| File | Change |
| --- | --- |
| `modules/helpers/vehicle-defence.js` | New. Zone extraction, target resolution, reticle geometry. |
| `modules/helpers/dice-helpers.js` | `getDefenseDice` guarded, accepts `shipweapon`, returns 0 for vehicles; the two calls in `rollSkill`/`rollItem` removed; optional `skillValue` passed to `displayRollDialog`. |
| `modules/dice/roll-builder.js` | `_defenceZone` state, panel build/refresh on the existing `targetToken` hook, width delta, defence folded into `_effectivePool()`, zone text onto the `RollFFG`. |
| `modules/dice/roll.js` | `defenceZone` carried through `render`/`toJSON`/`fromData` alongside `flavorText`. |
| `modules/swffg-main.js` | Received sent pools pass through the resolved-defence flag, zone snapshot, and stored skill value. |
| `templates/dice/roll-options-ffg.html` | Flex row: existing column plus an empty `<aside>` container, hidden by default. |
| `templates/dice/roll-ffg.html` | The chat-card line. |
| `styles/starwarsffg.css` **and** `styles/mandar.css` | Panel and reticle styling. Both files are hand-maintained and the active theme disables the other, so a rule in only one is invisible. Do not run `gulp css`. |
| `lang/en.json` | New `SWFFG.VehicleDefenseZone.*` keys. |
| `CHANGELOG.md` | Entry before the branch is pushed. |

## Localisation keys

`SWFFG.VehicleDefenseZone.Heading`, `.Selected` (`{zone} · +{dice} setback`), `.None`,
`.NoneWarning`, `.Ambiguous`, `.CardLine`, `.CardNone`. Existing `SWFFG.VehicleDefense{Fore,Aft,Port,Starboard}`
are reused for wedge labels. English only; other languages fall back via `checkdiff.js`.

## Testing

**Headless unit tests** on `vehicle-defence.js`:

- `vehicleDefenceZones` drops `label`, drops non-numeric values, returns `[]` for missing or
  malformed `shields`, and applies `ZONE_ORDER` with unknown keys appended.
- `resolveDefenceTarget` returns each of the three statuses, including a vehicle plus a
  non-vehicle resolving to `single`.
- `zoneReticleSvg` emits N wedges for N zones, marks exactly the selected one, emits the warning
  styling when `selected` is null, and escapes label text. Its one-zone path uses two non-degenerate
  arcs and forms a complete donut rather than a zero-length 360° arc.

**Live verification in Foundry** (run from the console after a hard reload — the Functional
Testing macro is dead on V13):

1. Ship weapon at a single vehicle: panel appears, window widens, picking a zone adds that many
   setback dice to the preview, rolling emits the card line.
2. Roll with nothing picked: warning state, roll allowed, card carries the warning line.
3. Retarget to a second vehicle: panel rebuilds with the new ship's values, selection cleared.
4. Retarget to a character: panel gone, width restored, and their ranged defence now applies.
5. Two vehicles targeted: ambiguous state, no setback.
6. Personal ranged weapon at a vehicle: no longer throws.
7. Ship weapon at a character: picks up `defence.ranged` for the first time.
8. Baseline regression: an ordinary skill roll with no target is unchanged.
9. Send a pool with a selected vehicle zone to another player: their targets do not add defence
   again, and their eventual chat card retains the sender's zone line.
10. Change targets immediately after pressing Roll while an item/ammo update is pending: the
    rolled setback and chat-card zone still describe the click-time snapshot.
11. Tab to every wedge and toggle it with Enter and Space; focus, `aria-pressed`, preview dice,
    and selected styling all update together.

## Risks

- Moving character defence out of the pool constructor is a behaviour change nobody asked for.
  It is included because it removes a defence path rather than adding one, and because leaving it
  would put two contradictory defence behaviours in the same dialog. If it proves noisy it can be
  reverted independently of the zone panel.
- `roll-options-ffg.html` becoming a flex row must not disturb the existing scroll behaviour on
  its `<form>`; verify against the root-PART element handling before relying on the wrapper.
