# Design Doc — Crit-Trauma Weekly Recovery Counter (v1)

> System: `starwarsffg` Foundry VTT (V13 line, ApplicationV2). Branch: `crit-trauma-counter`.
> Sources: `docs/plans/CritTraumaCounter/requirements_brief.md`, `docs/crit_trauma_helpers_spec.md`.
> This is a **design** doc — architecture and decisions, not a build order.
> All integration points below were re-read against the codebase 2026-07-19; drift is noted inline.

---

## 1. Problem statement

Star Wars FFG crit recovery is rate-limited, but the rules are easy to forget at the table:

- **Character crits (EotE SRD):** the injured actor's own **Resilience** self-heal needs a *full week of
  rest first*, then may be attempted once per week. An ally's **Medicine** check is once per week per injury,
  with *no rest gate*. The two cooldowns are **independent** — a failed Resilience attempt does not consume
  that week's Medicine attempt.
- **Vehicle crits (RAW):** unlimited **Mechanics** retries, no weekly limit. A weekly cooldown on vehicles is
  therefore a *house rule*, not RAW.

Today nothing in the system tracks "you already used this week's attempt for this injury," so GMs and players
police it by memory. The single real failure mode is not the math — it is the **GM forgetting that in-game
time has passed**, which silently freezes every cooldown.

We want a tracker that (a) records per-injury attempts, (b) recomputes every character's every cooldown from
**one** GM input (an in-game day counter), and (c) keeps the day counter *always visible* so the GM is
reminded to advance it.

## 2. Goals and non-goals

**Goals**

- Per-injury weekly cooldown tracking for character crits (independent Resilience + Medicine paths) and,
  opt-in, vehicle crits (Mechanics path).
- A single world-scoped `campaignDay` integer that, when advanced by the GM, recomputes *all* cooldowns.
- A persistent, player-visible **"Day N [+]"** readout in the Destiny Tracker widget; GM-only advance control.
- **Card-scoped** implementation: data lives on the crit item, controls live in the crit-card markup, so any
  actor type holding a crit inherits the controls for free. Adding a future sheet = include the card markup.
- Codex II theme only. Null / legacy stamps treated as "attemptable now." Null must never enter arithmetic.
- Live refresh: advancing the day updates open Codex countdowns and the readout immediately, no manual reload.

**Non-goals**

- No Foundry world clock / Simple Calendar integration (time is narrated at a variable rate).
- No automatic day advancement — the GM always advances manually.
- No changes to non-Codex (V1 / mandar / legacy) sheets.
- No change to RAW vehicle behaviour unless the GM opts into `vehicleCritWeeklyLimit`.
- No new permission model — reuse the existing owner-or-GM / gm-bridge forwarding pattern.

## 3. Proposed architecture

The design is **card-scoped**: data travels on the item, a Handlebars helper does the availability math at
render time, markup lives in the shared crit-card templates, handlers bind once per render in the Codex
`_cdxActivate`, and styling splits between `cdx.css` (cards) and the global stylesheets (the readout). The
`campaignDay` setting's `onChange` is the single live-refresh engine.

### 3.1 Data model — declared schema fields on the crit items

Declared schema fields, **not flags**. This is deliberate: the V14 DataModel cutover hides *undeclared*
`system.*` paths from the prepared view, so a flag or undeclared field would read back wrong on the sheet
(see memory `datamodel-prune-data-loss`). Values are nullable, initial `null` = "never stamped."

**`modules/data/models/item/criticalinjury.js`** — currently
`class CriticalInjuryDataModel extends mix(BaseItemDataModel, CoreTemplate)` with top-level
`min` / `max` / `severity` NumberFields (verified). Add three nullable day fields:

| Field | Purpose |
|---|---|
| `receivedDay` | rest-gate origin (Resilience only); stamped at genuine creation |
| `resilienceLastAttemptDay` | self-heal cooldown stamp |
| `medicineLastAttemptDay` | assisted cooldown stamp |

Declared as `new f.NumberField({ initial: null, nullable: true })` (Foundry `NumberField` defaults to
`nullable: false` with `initial: 0`; both must be set so an unstamped injury reads back `null`, not `0` —
`0` would be a valid day and mean "attempted on day 0", a real bug).

**`modules/data/models/item/criticaldamage.js`** — same base shape (verified, identical to `criticalinjury`).
Resolves **open question (d):** vehicles have no rest gate and no self/assist split, so `criticaldamage` gets a
**single** stamp field, `mechanicsLastAttemptDay` (nullable, initial `null`) — **not** `receivedDay` and **not**
the Resilience/Medicine pair. Carrying the three character fields here would leave two permanently-`null` dead
fields and a misleading schema; the vehicle card template is separate anyway (§3.3), so type-branching is
already natural. (See §4 for the rejected "uniform three-field schema" alternative.)

### 3.2 Availability helper

A single Handlebars helper registered in **`modules/swffg-main.js`**, alongside `iff` (line 1217, verified) and
`renderMultiple` (line 1250, verified). Proposed name `critAvailability`. It takes the item, reads
`game.settings.get("starwarsffg", "campaignDay")`, and returns a struct consumed via
`{{#with (critAvailability item) as |avail|}}` in the card templates:

```
{ resilience: { attemptable, daysLeft }, medicine: { attemptable, daysLeft }, mechanics: { attemptable, daysLeft } }
```

Math (compute defensively — `null` never enters arithmetic):

- **Resilience** attemptable when `currentDay >= (resilienceLastAttemptDay ?? receivedDay ?? -Infinity) + 7`.
- **Medicine** attemptable when `medicineLastAttemptDay` is null **or** `currentDay >= medicineLastAttemptDay + 7`.
- **Mechanics** (vehicle) same shape as Medicine, keyed off `mechanicsLastAttemptDay`.
- `daysLeft = Math.min(7, Math.max(0, stamp + 7 - currentDay))` — the `max(0, …)` prevents negatives, the
  `min(7, …)` is the **rewind clamp** (if the GM lowers `campaignDay` below a stamp, show at most 7, never an
  overflow). Null stamp ⇒ `attemptable: true`, `daysLeft: 0`.

Reading the setting at render time is correct because the card re-renders on every `campaignDay` change (§3.6).

### 3.3 Per-card controls (markup + handlers)

**Character/rival/nemesis/minion card — `templates/parts/codex/cdx-injuries.html`** (verified: renders each
crit as `<div class="item cdx-injury" data-item-id="{{item._id}}">`; shared by `codex-character.html` and
`codex-minion.html`; manual add is `.item-add.criticalinjury`). Inside each `.cdx-injury`, add two independent
controls wrapped in `{{#with (critAvailability item) as |avail|}}`:

- **Resilience (self)** — when `avail.resilience.attemptable`, a **"Roll Resilience"** button
  (`.cdx-inj-resilience`); otherwise a **"Self-heal in {{avail.resilience.daysLeft}} days"** readout.
- **Medicine (assisted)** — when `avail.medicine.attemptable`, a **"Failed"** marker button
  (`.cdx-inj-medfail`); otherwise a **"Medicine in {{avail.medicine.daysLeft}} days"** readout.

**Vehicle card — `templates/actors/codex/codex-vehicle.html`** (verified: the `criticaldamage` block sits at
~line 133–142, `.cdx-cards-head` + `.item.cdx-injury[data-item-id]`, no manual add). Add a **single**
Mechanics-path control (`.cdx-inj-mechfail` / "Mechanics in N days"), rendered only when the
`vehicleCritWeeklyLimit` setting is On. Gate that at the template level with the existing `iff` helper against a
context flag surfaced from the sheet's `getData`, or read the setting inside `critAvailability` and return
`mechanics: null` when the house rule is Off so the template simply renders nothing.

**Handlers — `modules/actors/codex-sheets.js`, `_cdxActivate(html)` (line 467, verified).** Classes
`CodexActorSheet` (line 1448, verified) and `CodexAdversarySheet`. Bind per render, matching the existing
in-file precedent (the `.cdx-hcollapse-btn` and `.cdx-tab` handlers bind every render with **no** teardown
because their elements are recreated each render and the old listeners die with the old DOM). The crit-card
buttons follow that pattern exactly, so **no `close()` teardown is required** — the `close()` override
(line 430, verified) only tears down things bound to *persistent* nodes (the pill-stack's document listener,
ResizeObservers). Bind via delegation on the injuries container or per-button `querySelectorAll`; resolve the
target crit from `event.target.closest(".cdx-injury").dataset.itemId`.

Writes follow the in-file conventions (verified): actor writes `this.actor.update({…}, { render: false })`;
item writes `item.update({ "system.<field>": day })` with **`system.*`** keys (never `data.*`).

- **Resilience button** → **auto-resolve** (resolves **open question (c)**, §5). Build the actor's Resilience
  skill pool and roll inline, exactly as `_cdxApplyStrainRecovery` (codex-sheets.js:1429, verified) does:
  `const message = await new game.ffg.RollFFG(pool.renderDiceExpression()).toMessage({ speaker: { actor }, … });`
  then read `const net = message.rolls?.[0]?.ffg?.success ?? 0;`. `roll.js` already nets successes against
  failures before this field is exposed (roll.js:189–193, verified), so **`ffg.success >= 1` is the win
  condition** (Triumph/Despair irrelevant to the heal). Win ⇒ delete the crit item; otherwise
  `item.update({ "system.resilienceLastAttemptDay": currentDay })`. The item id is in the handler's closure, so
  **no roll "tagging" or chat-hook round-trip is needed** — this is a deliberate simplification over the brief
  (see §4).
- **Medicine "Failed" marker** → manual; the Medicine check is rolled separately and, on success, the crit
  owner deletes the crit. The marker only stamps
  `item.update({ "system.medicineLastAttemptDay": currentDay })`. Because an ally may be viewing another PC's
  sheet and not own the item, route the write through **owner-or-GM**: `item.update` when the user owns the
  item, otherwise forward to the active GM via the existing `gm-bridge.js` pattern that `apply-crit` already
  uses (see §5 open risk). The two paths are decoupled — a failed Resilience attempt leaves that week's
  Medicine attempt available.
- **Vehicle Mechanics "Failed" marker** → same manual-stamp shape as Medicine, keyed off
  `mechanicsLastAttemptDay`.

### 3.4 Global Day readout (Destiny Tracker widget)

**`modules/ffg-destiny-tracker.js`** (ApplicationV2; template `templates/ffg-destiny-tracker.html`, both
verified). CRITICAL constraint confirmed in source: the widget is rendered **exactly once** at ready and is
*deliberately never re-rendered* — the destiny pool updates in place via the `dPool*` settings' `onChange`
rewriting `#destinyLight` / `#destinyDark` directly (`_prepareContext` supplies only the *initial* values).

- **Template:** add a `<section id="ffg-campaign-day">` to `templates/ffg-destiny-tracker.html` (a sibling of
  the `#destinyLight` / `#destinyDark` sections) rendering `Day {{campaignDay}}` and, wrapped in `{{#if isGM}}`,
  a `[+]` control. Players see the number only.
- **Initial value:** add `campaignDay: game.settings.get("starwarsffg","campaignDay")` to the object returned by
  `_prepareContext` (line 56, verified). This fills the readout at first (only) render, mirroring how
  `destinyPool` is seeded.
- **`[+]` handler:** bind in `_activateListeners(html)` (line 100, verified). GM clicks `[+]` → a
  `DialogV2.wait` "advance how many days?" prompt (default **7**) → `game.settings.set("starwarsffg",
  "campaignDay", current + n)`. The setting's `onChange` (§3.5/§3.6) does the rest; the handler itself does not
  touch the DOM or re-render the widget.

### 3.5 Settings

**`modules/settings/settings-helpers.js`** (verified: `codexSettings` menu registered ~line 91;
`codexAdvantageHealsStrain` world boolean ~line 405 is the house-rule precedent; `dPoolLight`'s `onChange`
rewrites the tracker DOM at lines 213–215).

- **`campaignDay`** — `type: Number`, `scope: "world"`, `config: false`, `default: 1` (cosmetic start day),
  registered standalone (like `dPoolLight`, not inside the codex menu — it is live game state driven by the
  widget, not a config toggle). World scope makes it player-readable; GM-only is enforced by the UI (only the
  GM's `[+]` writes it). `onChange` performs the dual live-refresh in §3.6. Floor/validate the value to an
  integer on write.
- **`vehicleCritWeeklyLimit`** — `type: Boolean`, `scope: "world"`, `config: false`, **`default: false`**
  (RAW-accurate). Register under the existing `codexSettings` menu following the `codexAdvantageHealsStrain`
  shape. Its `onChange` should re-render open Codex sheets (§3.6) so the vehicle control appears/disappears
  immediately; a `debouncedReload` would also work but is heavier than needed.

Deliberately **not** using `onChange: this.debouncedReload` (the common full-page-reload pattern in this file)
for `campaignDay` — a full reload on every day-advance is jarring and unnecessary when a targeted re-render
plus a text rewrite suffices.

### 3.6 Live-refresh mechanism — the two update paths

Resolves **open question (b).** The `campaignDay` `onChange` runs on **every** client when the world value
propagates, and does **two** things:

1. **Open Codex sheets re-render** (countdowns recompute). Iterate the live ApplicationV2 registry
   (`foundry.applications.instances`), filter to instances that are `rendered` **and**
   `instanceof CodexActorSheet || instanceof CodexAdversarySheet`, and call `.render()` on each. The
   `critAvailability` helper re-reads `campaignDay` during that render, so every countdown updates. This is
   targeted (Codex-only, open-only), avoiding the full-page `debouncedReload`.
2. **Destiny Tracker readout updates in place** (the widget is never re-rendered). Mirror the exact dPool
   precedent at settings-helpers.js:213–215 — `document.getElementById("ffg-campaign-day")` and rewrite its
   text/innerHTML to the new `Day N` (preserving the GM `[+]` child). No widget re-render.

Both paths live in the one `onChange` body. Path 1 is the "sheets re-render" path; path 2 is the "never-
re-rendered widget updates in place" path — the same split the brief calls out.

### 3.7 `receivedDay` stamping at genuine creation

`receivedDay` is the Resilience rest-gate origin and must be stamped whenever a character crit is genuinely
created — both the **`apply-crit.js`** path and the manual **`.item-add.criticalinjury`** "+" path. Verified:
`apply-crit.js` embeds via `applyToTargetActor(realActor, { type: "crit", items: [item.toObject()] })`
(line 209), which forwards to `gm-bridge.js` → `actor.createEmbeddedDocuments("Item", op.items)` (verified).

**Recommended: a single `preCreateItem` Hook choke point** (registered wherever system hooks are wired in
`swffg-main.js`). On `preCreateItem`, if the item `type === "criticalinjury"`, is embedded on an Actor
(`item.parent instanceof Actor` / `item.isEmbedded`), and `system.receivedDay` is null, stamp it with the
current `campaignDay` via the change source. This is the DRY single point that catches **both** known paths
**and** any future creation path (drag-drop, importer), and it runs GM-side after the gm-bridge forward, where
the world `campaignDay` reads identically. `criticaldamage` is **not** stamped here (no rest gate — vehicles
have no `receivedDay`; see §3.1). See §4 for the rejected "stamp inline at each call site" alternative.

## 4. Alternatives considered

- **Flags instead of declared schema fields.** Rejected: the V14 DataModel cutover hides undeclared `system.*`
  paths from the prepared view, so a flag would read back wrong on the sheet (memory `datamodel-prune-data-loss`).
  Declared `NumberField`s are the whole point of Q6=A.
- **Foundry world clock / Simple Calendar.** Rejected: campaign time is narrated at a variable rate; there is no
  reliable in-fiction clock to hang a cooldown on. A single GM-advanced integer is authoritative and dependency-free.
- **World- or actor-level cooldown store** (e.g. a map of injury→lastAttempt on the actor or in world flags).
  Rejected: breaks per-injury granularity and card-scoping. Putting the stamps on the item means the cooldown
  travels with the injury and any actor type that holds one inherits the behaviour for free.
- **Sheet-scoped implementation** (compute availability in `getData`, inject per-sheet controls). Rejected in
  favour of card-scoping: a Handlebars helper + shared card markup means adding a future sheet is "include the
  markup," nothing else — no per-sheet wiring.
- **Uniform three-field schema on `criticaldamage`.** Rejected (resolves open question (d)): vehicles have no
  rest gate and no self/assist split, so two of the three fields would be permanently `null` and the schema
  would misrepresent the vehicle recovery rule. A single `mechanicsLastAttemptDay` is honest and the vehicle
  template is already separate.
- **Tagged auto-resolve roll + chat-hook read-back** (the brief's "roll tagged with the item id"). Rejected as
  unnecessary indirection: `_cdxApplyStrainRecovery` already proves the inline pattern — roll via
  `RollFFG(...).toMessage()` and read `message.rolls[0].ffg.success` synchronously, with the item id already in
  closure. No tag, no hook, no cross-message correlation. Simpler and matches existing code (resolves (c)).
- **`campaignDay` `onChange: debouncedReload`** (full page reload). Rejected: too heavy for a routine
  day-advance. Targeted Codex re-render + in-place readout rewrite gives instant feedback with no reload flash.
- **Stamp `receivedDay` inline at each call site** (in `apply-crit.js` before forwarding, and in the manual-add
  handler). Workable but rejected as primary: two sites to keep in sync and blind to future creation paths. The
  `preCreateItem` hook is one choke point that covers all of them.

## 5. Risks and open questions

**Resolved brief open questions**

- **(a) Where the readout CSS lives** (the mandar-disables-`starwarsffg.css` tension). Resolved by **splitting by
  scope**:
  - Crit **card** controls (buttons, countdown text on the injury cards) → **`styles/cdx.css` only**. The Codex
    sheets load `cdx.css` regardless of the active theme, so card styling survives mandar there and nowhere else
    is needed.
  - The Destiny Tracker **Day readout** is **global chrome, not a Codex sheet** — it renders outside any
    `cdx.css` scope. Its CSS must be **duplicated into BOTH `starwarsffg.css` and `mandar.css`**, because the
    active `mandar` theme disables `starwarsffg.css` entirely (memory `active-theme-is-mandar`). This mirrors
    how other global/UI chrome (e.g. token-HUD status icons) is maintained in both files. **CSS is hand-edited
    in all three files — never run `gulp css` / `npm run compile`** (memory `css-is-hand-maintained`).
- **(b) Two live-update paths** — resolved in §3.6: one `campaignDay` `onChange` both (1) re-renders open Codex
  sheets via `foundry.applications.instances` filtered to the Codex sheet classes, and (2) rewrites
  `#ffg-campaign-day` in place, mirroring the dPool `onChange` at settings-helpers.js:213–215.
- **(c) Reading the auto-resolve roll result** — resolved in §3.3: inline `message.rolls[0].ffg.success` (already
  net of failures per roll.js:189–193); `>= 1` deletes the crit, else stamps `resilienceLastAttemptDay`.
- **(d) `criticaldamage` fields** — resolved in §3.1: a single `mechanicsLastAttemptDay`, no `receivedDay`, no
  Resilience/Medicine split.

**Remaining risks / decisions to confirm at build time**

- **Non-owner Medicine/Mechanics stamp (permissions).** The asymmetry rationale ("Medicine = an ally on someone
  else's sheet") means a non-owner may click the "Failed" marker, and `item.update` on an unowned embedded item
  fails. Recommended: owner-or-GM write with gm-bridge forwarding for non-owners (the pattern `apply-crit`
  already relies on). Confirm whether that forwarding path is worth wiring now or whether gating the control to
  owner/GM is acceptable for v1.
- **`preCreateItem` over-firing.** The hook stamps on *any* embedded `criticalinjury` creation, including
  drag-copies and importer output. This is intended (a new crit on an actor is a new injury), but must be gated
  on `item.parent instanceof Actor` + `type === "criticalinjury"` + `receivedDay == null` so it never touches
  world-sidebar items or re-stamps an already-stamped injury.
- **`campaignDay` integer discipline.** `NumberField`/`Number` settings are floats; floor/validate on write and
  in the helper so a stray decimal never skews `+ 7` math.
- **Resilience skill lookup.** The auto-resolve assumes the actor has a "Resilience" skill entry (as
  `_cdxApplyStrainRecovery` assumes Cool/Discipline). Handle the missing-skill case with a notification rather
  than a null-pool roll.
- **Rewind clamp correctness.** The `min(7, max(0, …))` clamp (§3.2) is the single guard against negative/overflow
  countdowns when the GM lowers the day; unit-cover the null, past-stamp, future-stamp, and rewound cases.
- **Day-origin cosmetic.** Start at Day 1 (§3.5); purely cosmetic, no math depends on the absolute origin.

**Project constraints honoured throughout:** Codex-only / card-scoped; `system.*` keys (never `data.*`);
hand-edited CSS across `cdx.css` + `starwarsffg.css` + `mandar.css` with no gulp/npm compile; all GitHub writes
target the `YeNov/StarWarsFFG` fork only.
