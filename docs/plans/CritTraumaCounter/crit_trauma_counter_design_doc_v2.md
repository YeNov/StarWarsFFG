# Design Doc — Crit-Trauma Weekly Recovery Counter (v2)

> System: `starwarsffg` Foundry VTT (V13 line, ApplicationV2). Branch: `crit-trauma-counter`.
> Sources: `docs/plans/CritTraumaCounter/requirements_brief.md`, `docs/crit_trauma_helpers_spec.md`.
> Supersedes v1; incorporates the independent review (`crit_trauma_counter_design_doc_review_v1.md`).
> This is a **design** doc — architecture and decisions, not a build order.
> Every code claim below was re-read against source 2026-07-19 (including the reviewer's citations).

---

## 1. Problem statement

Star Wars FFG crit recovery is rate-limited, but the rules are easy to forget at the table:

- **Character crits (EotE SRD):** the injured actor's own **Resilience** self-heal needs a *full week of
  rest first*, then may be attempted once per week. An ally's **Medicine** check is once per week per injury,
  with *no rest gate*. The two cooldowns are **independent** — a failed Resilience attempt does not consume
  that week's Medicine attempt.
- **Vehicle crits (RAW):** unlimited **Mechanics** retries, no weekly limit. A weekly cooldown on vehicles is
  therefore a *house rule*, not RAW.

Nothing in the system tracks "you already used this week's attempt for this injury." The single real failure
mode is not the math — it is the **GM forgetting that in-game time has passed**, which silently freezes every
cooldown. We want a tracker that records per-injury attempts, recomputes every cooldown from **one** GM input
(an in-game day counter), and keeps that counter *always visible* so the GM is reminded to advance it.

## 2. Goals and non-goals

**Goals**

- Per-injury weekly cooldown tracking for character crits (independent Resilience + Medicine paths) and,
  opt-in, vehicle crits (Mechanics path).
- A single world-scoped `campaignDay` integer that, when advanced by the GM, recomputes *all* cooldowns.
- A persistent, player-visible **"Day N [+]"** readout in the Destiny Tracker widget; GM-only advance control.
- **Card-scoped** implementation: data on the crit item, controls in the crit-card markup, math in a Handlebars
  helper. Adding a future sheet = include the card markup.
- Codex II theme only. Null / legacy stamps = "attemptable now"; null never enters arithmetic.
- Correct permission handling: Resilience is owner/GM-only; the ally Medicine/Mechanics marker forwards through
  a **narrow, authorized** GM bridge.
- Live refresh with no manual reload; no duplicate weekly attempts under double-click or multi-client races.

**Non-goals**

- No Foundry world clock / Simple Calendar integration.
- No automatic day advancement — the GM always advances manually.
- No changes to non-Codex (V1 / mandar / legacy) sheets.
- No change to RAW vehicle behaviour unless the GM opts into `vehicleCritWeeklyLimit`.
- No generic privileged embedded-item write channel (a scoped, validated op only — §3.3.3).

## 3. Proposed architecture

Card-scoped: data travels on the item, a Handlebars helper does availability math at render time, markup lives
in the shared crit-card templates, handlers bind per render in the Codex `_cdxActivate`, styling splits
`cdx.css` (cards) vs the global stylesheets (readout), and the `campaignDay` `onChange` is the single
live-refresh engine. All user-facing strings are localized in `lang/codex/en.json` (§3.8).

### 3.1 Data model — declared schema fields on the crit items

Declared schema fields, **not flags** (the V14 DataModel cutover hides *undeclared* `system.*` paths from the
prepared view, so a flag reads back wrong on the sheet — memory `datamodel-prune-data-loss`).

**`modules/data/models/item/criticalinjury.js`** — currently `min`/`max`/`severity` NumberFields on
`mix(BaseItemDataModel, CoreTemplate)` (verified). Add three day fields, each declared
`new f.NumberField({ nullable: true, initial: null, integer: true })`:

| Field | Purpose |
|---|---|
| `receivedDay` | rest-gate origin (Resilience only); stamped at genuine creation (§3.7) |
| `resilienceLastAttemptDay` | self-heal cooldown stamp |
| `medicineLastAttemptDay` | assisted cooldown stamp |

`nullable: true, initial: null` is set **explicitly** (not to correct a default — on the installed V13 runtime
`NumberField` already defaults `nullable: true`, `initial: undefined`, per the review's verified reading of
`common/data/fields.mjs`) so that (a) an unstamped injury reads back a stable `null` rather than `undefined`,
and (b) the intent is legible in the schema. `integer: true` is added because every value is a campaign-day
integer; writes additionally `Math.floor` defensively (§3.5). **No migration is needed:** existing crit sources
lacking these keys prepare as `null` and are persisted only when first stamped; legacy crits are therefore
immediately attemptable, matching Q11=A.

**`modules/data/models/item/criticaldamage.js`** — same base shape (verified). Resolves **open question (d):**
vehicles have no rest gate and no self/assist split, so `criticaldamage` gets a **single** field,
`mechanicsLastAttemptDay` (same declaration) — **not** `receivedDay` and **not** the Resilience/Medicine pair.
The vehicle card template is already separate (§3.3), so type-branching is natural; carrying the three character
fields here would leave two permanently-`null` dead fields and misrepresent the vehicle rule (see §4).

### 3.2 Availability helper

One Handlebars helper registered in **`modules/swffg-main.js`** alongside `iff` (line 1217) and `renderMultiple`
(line 1250) (both verified). Proposed name `critAvailability`. It takes `(item, options)` where the calling
context supplies whether the current user may self-heal, reads
`game.settings.get("starwarsffg", "campaignDay")`, and returns a struct consumed via
`{{#with (critAvailability item) as |avail|}}`:

```
{
  resilience: { attemptable, daysLeft, canSelfHeal },   // canSelfHeal = item.parent?.isOwner || game.user.isGM
  medicine:   { attemptable, daysLeft },
  mechanics:  { attemptable, daysLeft } | null           // null when vehicleCritWeeklyLimit is Off
}
```

Math (null never enters arithmetic):

- **Resilience** attemptable when `currentDay >= (resilienceLastAttemptDay ?? receivedDay ?? -Infinity) + 7`.
- **Medicine** attemptable when `medicineLastAttemptDay` is null **or** `currentDay >= medicineLastAttemptDay + 7`.
- **Mechanics** (vehicle) same shape as Medicine, keyed off `mechanicsLastAttemptDay`; the helper returns
  `mechanics: null` when `vehicleCritWeeklyLimit` is Off so the template renders nothing.
- `daysLeft = Math.min(7, Math.max(0, stamp + 7 - currentDay))` — `max(0, …)` prevents negatives, `min(7, …)` is
  the **rewind clamp** (GM lowering `campaignDay` below a stamp shows at most 7, never overflow). Null stamp ⇒
  `attemptable: true, daysLeft: 0`.
- `canSelfHeal` is computed from the item's parent ownership so the **template** can hide the Resilience control
  from non-owners (Finding 3); the **handler** re-checks it independently (§3.3.1).

Reading the setting at render time is correct because the card re-renders on every `campaignDay` change (§3.6).

### 3.3 Per-card controls (markup + handlers)

**Character card — `templates/parts/codex/cdx-injuries.html`** (verified: each crit is
`<div class="item cdx-injury" data-item-id="{{item._id}}">`; shared by `codex-character.html` and
`codex-minion.html`; manual add `.item-add.criticalinjury`). Inside each `.cdx-injury`, wrapped in
`{{#with (critAvailability item) as |avail|}}`:

- **Resilience (self)** — rendered **only when `avail.resilience.canSelfHeal`**. When
  `avail.resilience.attemptable`, a **"Roll Resilience"** button (`.cdx-inj-resilience`); otherwise a
  **"Self-heal in {{avail.resilience.daysLeft}} days"** readout. Non-owners never see the button (Finding 3).
- **Medicine (assisted)** — visible to any permitted viewer. When `avail.medicine.attemptable`, a **"Failed"**
  marker button (`.cdx-inj-medfail`); otherwise **"Medicine in {{avail.medicine.daysLeft}} days"**.

**Vehicle card — `templates/actors/codex/codex-vehicle.html`** (verified: the `criticaldamage` block at
~line 133–142). Add a single Mechanics-path control (`.cdx-inj-mechfail` / "Mechanics in N days"), rendered only
when `avail.mechanics` is non-null (i.e. the house rule is On).

**Handlers — `modules/actors/codex-sheets.js`, `_cdxActivate(html)` (line 467, verified).** Classes
`CodexActorSheet` (line 1448) and `CodexAdversarySheet`. Bind per render (matching the in-file `.cdx-hcollapse-btn`
/ `.cdx-tab` precedent: no `close()` teardown needed because the elements are recreated each render and their
listeners die with the old DOM; the `close()` override at line 430 only tears down listeners on *persistent*
nodes). Resolve the crit from `event.target.closest(".cdx-injury").dataset.itemId`.

**Important permission fact (Finding 3, verified):** `CodexSchemeMixin.activateListeners` (codex-sheets.js:392-397)
calls `super.activateListeners` then `_cdxActivate` **unconditionally**. The base returns early at
`actor-sheet-ffg.js:508-510` (`if (!this.isEditable) return;`) — but that only skips the base's editable-only
bindings; **`_cdxActivate` still runs for non-owners/observers.** So every handler below must enforce its own
permission gate; render-time visibility is not an authority check.

#### 3.3.1 Resilience button — owner/GM only, reserve-before-roll (Findings 3, 4, 6)

Gate: the handler first re-checks `item.parent?.isOwner || game.user.isGM` and returns if false (defence in depth
behind the `canSelfHeal` template gate). Then, to prevent duplicate weekly attempts under double-click or
simultaneous owner+GM clicks on two clients (Finding 6):

1. **Local in-flight guard** — set a per-item in-flight key and disable the button on first click; clear on
   completion.
2. **Live re-check** — re-read the *live* item (`this.actor.items.get(itemId)`) and recompute availability from
   its current `system.*` stamps. If no longer attemptable, notify and abort. Render-time state is not trusted.
3. **Reserve, then roll** — persist the reservation *before* rolling:
   `await item.update({ "system.resilienceLastAttemptDay": currentDay })`. A concurrent second attempt now fails
   the live re-check in step 2.
4. **Roll inline and read back** — build the actor's Resilience skill pool and roll exactly as
   `_cdxApplyStrainRecovery` (codex-sheets.js:1429, verified):
   `const message = await new game.ffg.RollFFG(pool.renderDiceExpression()).toMessage({ speaker: { actor }, flavor, flags: { starwarsffg: { critTraumaRecovery: { actorUuid: actor.uuid, itemId, path: "resilience" } } } });`
   then `const net = message.rolls?.[0]?.ffg?.success ?? 0;`. `roll.js` nets successes against failures before
   exposing this field (roll.js:188-203, verified), so **`net >= 1` is the win condition** (Triumph/Despair
   irrelevant). The **item-id tag is restored as a message flag** (Finding 4) — the brief's "roll tagged with the
   item id" requirement is satisfied and durable audit/correlation metadata is retained — while resolution stays
   inline via the closure (no chat hook needed merely because the tag exists).
5. **Resolve** — win ⇒ `await item.delete()` (the reservation stamp is moot once the crit is gone); loss ⇒ leave
   the reservation stamp in place (the attempt is correctly burned).
6. **Roll-creation failure** — if `toMessage()` throws (so no genuine attempt was made), clear **only** the
   reservation this operation wrote (`item.update({ "system.resilienceLastAttemptDay": <prior value> }`) so a
   failure to roll does not silently burn the week.

Writes use **`system.*`** keys (never `data.*`) and `item.update`/`item.delete`; the owner always owns their own
embedded crit, so these succeed locally with no bridge.

#### 3.3.2 Medicine / Mechanics "Failed" marker — via the narrow GM bridge (Finding 2)

The Medicine check is rolled separately; on success the crit **owner** deletes the crit. The marker only stamps
the cooldown. Because an ally may view another PC's (or a vehicle's) sheet without owning it, the write cannot
assume ownership. The handler:

1. Re-checks live availability (as §3.3.1 step 2) to avoid a redundant stamp.
2. If the user owns the item → `item.update({ "system.medicineLastAttemptDay": <GM/authoritative day> }`)
   locally (owner path).
3. Otherwise → forward a **dedicated, narrow, authorized** operation through the GM bridge (§3.3.3). The
   Mechanics marker is identical but with `path: "mechanics"` and stamps `mechanicsLastAttemptDay`.

The two character paths remain decoupled: a failed Resilience attempt leaves that week's Medicine attempt
available.

#### 3.3.3 The `crit-recovery-attempt` GM-bridge operation (Finding 2)

**Verified constraint:** `modules/helpers/gm-bridge.js` `performApply` supports only `damage`/`crit`/`kill-minion`
(lines 35-44), and the `APPLY_EVENT` branch (lines 131-140) performs **no requestor authorization** — it calls
`performApply(actor, data)` after `fromUuid`. Routing an arbitrary item path/value through it would be a
privileged-write escalation. We therefore add a **new, self-authorizing** event, not a new `performApply` op.

Design of the new op:
- **Client payload** carries only `{ event: "ffgCritRecovery", actorUuid, itemId, path }`, where `path` is an
  **enum** (`"medicine"` | `"mechanics"`) — never a raw field name and never a client-supplied day value.
- **GM-side branch** in `registerGMBridge` (mirroring the existing `MESSAGE_EVENT` authorization pattern at
  gm-bridge.js:106-129, which already reads the Foundry-injected `requestorId` second socket arg):
  1. Act only as the active GM (`game.user.id === game.users.activeGM?.id`).
  2. Resolve `actor = await fromUuid(actorUuid)`; resolve `item = actor?.items.get(itemId)`; bail if missing or
     not embedded in that actor (**item-membership check**).
  3. **Authorize the requestor:** `const requestor = game.users.get(requestorId)` must be a GM **or** have at
     least OBSERVER/LIMITED permission on the actor (the same "may use this actor's sheet" bar the feature
     assumes for an assisting ally). Reject and log otherwise.
  4. **Validate path↔type:** `medicine` requires `item.type === "criticalinjury"`; `mechanics` requires
     `criticaldamage` **and** `vehicleCritWeeklyLimit` On. Reject otherwise.
  5. **Whitelist the destination field:** map the enum to exactly `system.medicineLastAttemptDay` or
     `system.mechanicsLastAttemptDay` — no other key is writable.
  6. **Derive the day from the GM's own** `game.settings.get("starwarsffg","campaignDay")` (floored), never from
     the client. Then `await item.update({ [field]: day })`.
- The client-side helper mirrors `applyToTargetActor`'s shape (`"local"|"forwarded"|false`, warn on no GM), so
  the caller reports the outcome consistently. Owner/GM writes stay local (§3.3.2 step 2).

This keeps the bridge's existing damage/crit/kill-minion ops untouched and adds one narrowly-scoped, validated,
GM-authoritative write.

### 3.4 Global Day readout (Destiny Tracker widget)

**`modules/ffg-destiny-tracker.js`** (ApplicationV2; template `templates/ffg-destiny-tracker.html`, verified).
Confirmed constraint: the widget renders **exactly once** at ready and is *never re-rendered* — the pool updates
in place via the `dPool*` `onChange` rewriting `#destinyLight`/`#destinyDark` (`_prepareContext` supplies only
the *initial* values).

- **Template:** add a `<section id="ffg-campaign-day">` sibling of the destiny sections containing a **stable
  value span** and a GM-only advance control:
  `<span class="ffg-campaign-day-value">{{localize "SWFFG.Codex.CritTrauma.Day"}} {{campaignDay}}</span>{{#if isGM}}<a class="ffg-campaign-day-advance">[+]</a>{{/if}}`.
  Players see the number only.
- **Initial value:** add `campaignDay: game.settings.get("starwarsffg","campaignDay")` to the object returned by
  `_prepareContext` (line 56, verified), mirroring how `destinyPool` is seeded at first render.
- **`[+]` handler:** bind in `_activateListeners(html)` (line 100, verified). GM clicks `[+]` → a `DialogV2.wait`
  "advance how many days?" prompt (default **7**, floored/validated) → `game.settings.set("starwarsffg",
  "campaignDay", current + n)`. The handler does not touch the DOM or re-render the widget.

**Stable-span update (Finding 5):** the dPool precedent rewrites a whole section's `innerHTML`, which is safe
only because that section owns its own click listener. Here the GM listener lives on the `[+]` **child**, so the
live-refresh must update **only** `.ffg-campaign-day-value`'s `textContent` and leave the `[+]` node (and its
listener) intact. Both the container and the value span are null-guarded before touching them (unlike the
existing dPool code).

### 3.5 Settings

**`modules/settings/settings-helpers.js`** (verified: `codexSettings` menu registered ~line 91;
`codexAdvantageHealsStrain` world boolean ~line 405 is the house-rule precedent; `dPoolLight`'s `onChange`
rewrites the tracker DOM at lines 213-215).

- **`campaignDay`** — `type: Number`, `scope: "world"`, `config: false`, `default: 1` (cosmetic start),
  registered standalone (like `dPoolLight`; it is live game state, not a config toggle). World scope makes it
  player-readable; GM-only writing is enforced by the UI. Values are `Math.floor`-ed on write. `onChange`
  performs the dual live-refresh (§3.6). **Not** `debouncedReload` (a full reload per day-advance is jarring).
- **`vehicleCritWeeklyLimit`** — `type: Boolean`, `scope: "world"`, `config: false`, **`default: false`**
  (RAW-accurate), registered following the `codexAdvantageHealsStrain` shape. Its `onChange` re-renders open
  Codex sheets (§3.6) so the vehicle control appears/disappears immediately.

**Reachability (Finding 1, verified):** `config: false` settings do not appear in Foundry's normal Settings UI,
and the custom Codex menu is **not** auto-populated — `modules/settings/ui-settings.js:306-311`
(`codexSettings._prepareContext`) has an explicit allow-list of only `"starwarsffg.defaultSheetTheme"` and
`"starwarsffg.codexAdvantageHealsStrain"`. Therefore `"starwarsffg.vehicleCritWeeklyLimit"` **must be added to
that allow-list** so a GM can actually toggle it. `campaignDay` is intentionally **not** added there (it is
driven from the widget, not the settings dialog). `modules/settings/ui-settings.js` and `lang/codex/en.json` are
declared touch points.

### 3.6 Live-refresh mechanism — the two update paths

Resolves **open question (b).** The `campaignDay` `onChange` runs on **every** client when the world value
propagates and does two things:

1. **Open Codex sheets re-render** (countdowns recompute). Iterate the ApplicationV2 registry **by value**
   (Finding 9, verified: `foundry.applications.instances` is a `Map<string, ApplicationV2>`, so iterating the Map
   yields `[id, app]` pairs that fail an `instanceof` test):
   `for (const app of foundry.applications.instances.values()) if (app.rendered && (app instanceof CodexActorSheet || app instanceof CodexAdversarySheet)) app.render();`
   To keep the class references cycle-safe, this iteration is packaged as an exported
   `refreshOpenCodexSheets()` **in `codex-sheets.js`** and imported by `settings-helpers.js` (rather than
   importing the sheet classes into the settings module).
2. **Destiny Tracker readout updates in place** (widget never re-renders). Update only
   `.ffg-campaign-day-value`'s `textContent` (§3.4), null-guarded, leaving the `[+]` listener intact.

Both live in the one `onChange` body: path 1 is the "sheets re-render" path, path 2 is the "never-re-rendered
widget updates in place" path.

### 3.7 `receivedDay` stamping at genuine creation (Finding 7)

**Fold into the existing hook, don't add a second one.** `modules/swffg-main.js:76-113`
`registerActorItemValidationHooks()` is already a `preCreateItem` hook that validates crit placement (and blocks
`criticalinjury` on non-character actors at lines 102-105). Add the `receivedDay` stamp there.

**Rule and copy semantics (precisely defined):** in that hook, when `item.type === "criticalinjury"`, the item
is embedded on an Actor, and `system.receivedDay` **is null**, stamp it via `item.updateSource({
"system.receivedDay": <current campaignDay, floored> })`.

- The two required paths both arrive with `receivedDay == null` and are stamped: **Apply Crit** copies a
  world-table crit whose field defaults `null` (`apply-crit.js` embeds via
  `applyToTargetActor(realActor, { type: "crit", items: [item.toObject()] })`, line 209, verified → gm-bridge
  `createEmbeddedDocuments`, verified); the **manual `.item-add.criticalinjury`** path creates sparse data → null.
- **Copy/duplicate semantics:** a crit that already carries a **non-null** `receivedDay` (actor-to-actor
  drag/copy, actor duplication, importer payload) is treated as **carrying its own timeline** — the hook leaves
  it untouched. This is the honest definition of "genuine creation": the item arrives *without* a stamp. v1's
  claim that the hook treats copies as brand-new injuries is **dropped**; the stamp-iff-null rule neither
  overwrites preserved state nor invents a false origin.

`criticaldamage` is **not** stamped here (no rest gate — vehicles have no `receivedDay`; §3.1).

### 3.8 Localization (Finding 11)

All new strings live in **`lang/codex/en.json`** (verified: existing `SWFFG.Codex.StrainRecovery.*` and
`SWFFG.Settings.codex.*` keys are there). Add a `SWFFG.Codex.CritTrauma.*` group for button labels
("Roll Resilience", "Failed"), the pluralizable countdown lines ("Self-heal in {n} days", "Medicine in {n} days",
"Mechanics in {n} days"), the "Day" prefix, the advance dialog title/prompt, and error/notification text; add
`SWFFG.Settings.codex.VehicleCritWeeklyLimit.{Name,Hint}` for the new setting. Use `localize` / `game.i18n.format`
throughout (countdowns via `format` for the day count). Translations follow as available; English is the fallback.

## 4. Alternatives considered

- **Flags instead of declared schema fields.** Rejected: the V14 cutover hides undeclared `system.*` paths from
  the prepared view, so a flag reads back wrong on the sheet.
- **Foundry world clock / Simple Calendar.** Rejected: time is narrated at a variable rate; a single GM-advanced
  integer is authoritative and dependency-free.
- **World- or actor-level cooldown store.** Rejected: breaks per-injury granularity and card-scoping. Stamps on
  the item travel with the injury; any actor type that holds one inherits the behaviour.
- **Sheet-scoped implementation.** Rejected in favour of card-scoping: a helper + shared markup means adding a
  future sheet is "include the markup," nothing else.
- **Uniform three-field schema on `criticaldamage`.** Rejected (resolves (d)): two of three fields would be
  permanently `null` and misrepresent the vehicle rule; a single `mechanicsLastAttemptDay` is honest.
- **Generic embedded-item write through the existing GM bridge.** Rejected as a privileged-write escalation (the
  `APPLY_EVENT` branch does no requestor auth). Replaced by the narrow, self-authorizing `crit-recovery-attempt`
  op (§3.3.3).
- **Dropping the item-id tag entirely** (v1). Rejected on review: the brief explicitly requires a tagged roll and
  the flag is cheap audit metadata. v2 keeps the inline closure read-back **and** adds the message flag.
- **Roll-then-stamp ordering** (v1). Rejected: it permits duplicate weekly attempts during the `toMessage` await.
  v2 reserves the stamp before rolling, with a live re-check and an in-flight guard (§3.3.1).
- **`campaignDay` `onChange: debouncedReload`.** Rejected: too heavy; targeted Codex re-render + in-place readout
  rewrite gives instant feedback with no reload flash.
- **Whole-section `innerHTML` rewrite for the readout** (dPool style). Rejected here: it would destroy the `[+]`
  child listener. v2 uses a stable value span updated by `textContent` (§3.4).
- **A second `preCreateItem` hook for stamping.** Rejected: fold into the existing
  `registerActorItemValidationHooks` to avoid uncoordinated hooks (§3.7).

## 5. Risks and open questions

**Resolved brief open questions**

- **(a) Readout CSS location** (the mandar-disables-`starwarsffg.css` tension) — split by scope: crit **card**
  controls → **`styles/cdx.css` only** (loaded by Codex sheets regardless of theme); the Destiny Tracker **Day
  readout** is global chrome → **duplicated into BOTH `styles/starwarsffg.css` and `styles/mandar.css`** because
  the active `mandar` theme disables `starwarsffg.css` (memory `active-theme-is-mandar`;
  `mandarBeskarAstromech.css` imports `mandar.css`, so no third copy). **CSS is hand-edited in all files — never
  run `gulp css` / `npm run compile`** (memory `css-is-hand-maintained`).
- **(b) Two live-update paths** — §3.6: one `onChange` re-renders open Codex sheets via
  `foundry.applications.instances.values()` filtered by `instanceof`, and rewrites `.ffg-campaign-day-value`
  in place.
- **(c) Reading the auto-resolve roll result** — §3.3.1: inline `message.rolls[0].ffg.success` (net of failures
  per roll.js:188-203); `>= 1` deletes the crit, else the reservation stamp stays.
- **(d) `criticaldamage` fields** — §3.1: a single `mechanicsLastAttemptDay`; no `receivedDay`/split.

**Minion scope (Question 8, resolved).** Verified: `criticalinjury` creation is **blocked** for minions
(swffg-main.js:102-105 allows only character/nemesis/rival), and Apply Crit **kills** a minion instead of
embedding a crit (apply-crit.js:87-96). The shared `cdx-injuries.html` partial *renders* for minions, so a
**pre-existing/legacy** minion crit would display working controls — harmless — but **no supported flow creates
one.** Decision: minions are **legacy-only**; the design does **not** claim normal minion support and does **not**
widen the creation allow-list. (If minion crits are ever wanted, that is a separate change to both the validation
allow-list and Apply Crit's minion branch.)

**Remaining risks / build-time confirmations**

- **Requestor-permission bar for the Medicine marker.** §3.3.3 authorizes a non-owner requestor at ≥ LIMITED/
  OBSERVER on the actor. Confirm that bar matches table expectations (an assisting ally who can open the sheet);
  tighten to owner-only-forwarding if a stricter policy is wanted.
- **Resilience skill presence.** The auto-resolve assumes a "Resilience" skill entry (as `_cdxApplyStrainRecovery`
  assumes Cool/Discipline). Handle the missing-skill case with a localized notification, not a null-pool roll.
- **Reservation vs roll-creation failure.** §3.3.1 step 6 clears only the stamp this op wrote if `toMessage`
  throws; verify the prior value is captured before the reserve write so a genuine cooldown is never lost.
- **Integer discipline.** All day writes and the advance prompt are `Math.floor`-ed; `integer: true` on the
  fields is the schema backstop.
- **Rewind clamp coverage.** Unit-cover null, past-stamp, future-stamp, and rewound cases against
  `Math.min(7, Math.max(0, …))`.

**Project constraints honoured:** Codex-only / card-scoped; `system.*` keys (never `data.*`); hand-edited CSS
across `cdx.css` + `starwarsffg.css` + `mandar.css` with no gulp/npm compile; all GitHub writes target the
`YeNov/StarWarsFFG` fork only.

## 6. Declared touch points

- `modules/data/models/item/criticalinjury.js` — three day fields.
- `modules/data/models/item/criticaldamage.js` — `mechanicsLastAttemptDay`.
- `modules/swffg-main.js` — `critAvailability` helper; `receivedDay` stamp folded into
  `registerActorItemValidationHooks`.
- `templates/parts/codex/cdx-injuries.html`, `templates/actors/codex/codex-vehicle.html` — card controls.
- `modules/actors/codex-sheets.js` — handlers in `_cdxActivate`; exported `refreshOpenCodexSheets()`.
- `modules/helpers/gm-bridge.js` — new authorized `crit-recovery-attempt` event + client helper.
- `modules/settings/settings-helpers.js` — `campaignDay` and `vehicleCritWeeklyLimit` registrations + the
  `campaignDay` `onChange`.
- `modules/settings/ui-settings.js` — add `vehicleCritWeeklyLimit` to the `codexSettings` allow-list.
- `modules/ffg-destiny-tracker.js`, `templates/ffg-destiny-tracker.html` — Day readout + `[+]` handler.
- `styles/cdx.css` (card), `styles/starwarsffg.css` + `styles/mandar.css` (readout).
- `lang/codex/en.json` — new `SWFFG.Codex.CritTrauma.*` and `SWFFG.Settings.codex.VehicleCritWeeklyLimit.*` keys.

---

## Review response

| # | Finding (severity) | Outcome |
|---|---|---|
| 1 | `vehicleCritWeeklyLimit` unreachable (Major) | **Fixed.** §3.5 + §6: add `"starwarsffg.vehicleCritWeeklyLimit"` to the `codexSettings` allow-list in `ui-settings.js:306-311` (verified only `defaultSheetTheme`/`codexAdvantageHealsStrain` present) and add localized Name/Hint keys; `ui-settings.js` + `lang/codex/en.json` are declared touch points. |
| 2 | Non-owner Medicine/Mechanics write path doesn't exist (Major) | **Fixed.** §3.3.3 designs a narrow `crit-recovery-attempt` event (`actorUuid`/`itemId`/enum `path`); GM branch authorizes `requestorId`, checks item membership, validates path↔type (+ house-rule), whitelists the exact field, and derives the day from the GM's own `campaignDay`. Existing damage/crit/kill-minion ops untouched. Verified the APPLY_EVENT branch does no requestor auth, so the new event self-authorizes like MESSAGE_EVENT. |
| 3 | Resilience exposed to non-owners (Major) | **Fixed.** Verified `_cdxActivate` runs even when the base returns early at `actor-sheet-ffg.js:508-510`. §3.2/§3.3.1: `canSelfHeal` gate in the helper/context hides the button for non-owners **and** the handler re-checks `isOwner || isGM`. |
| 4 | Dropping the item-id tag violates the brief (Major) | **Fixed.** §3.3.1 keeps the inline read-back **and** adds `flags.starwarsffg.critTraumaRecovery = { actorUuid, itemId, path }` to `toMessage` (no chat hook required). |
| 5 | DOM rewrite destroys the `[+]` listener (Major) | **Fixed.** §3.4: stable `.ffg-campaign-day-value` span updated by `textContent`; `[+]` node/listener left intact; both nodes null-guarded. |
| 6 | Roll-then-stamp permits duplicate attempts (Major) | **Fixed.** §3.3.1: in-flight guard + live re-check + reserve-before-roll ordering; delete on success; on roll-creation failure clear only the stamp this op wrote. |
| 7 | `preCreateItem` coverage false for copied crits (Major) | **Fixed.** §3.7: stamp folded into the existing `registerActorItemValidationHooks` (swffg-main.js:76-113, verified) — no second hook; copy semantics defined as stamp-iff-null (non-null carries its own timeline); v1's "treats copies as new" claim dropped. |
| 8 | Minion support conflicts with creation rules (Question) | **Resolved (documented).** §5: verified minion `criticalinjury` creation is blocked (swffg-main.js:102-105) and Apply Crit kills minions (apply-crit.js:87-96). Minions are legacy-only; no claim of normal minion support; allow-list unchanged. |
| 9 | ApplicationV2 registry Map iteration (Minor) | **Fixed.** §3.6: iterate `foundry.applications.instances.values()` then `instanceof` filter; packaged as `refreshOpenCodexSheets()` in `codex-sheets.js` and imported by `settings-helpers.js` for cycle-safety. |
| 10 | Schema defaults / integer days (Minor) | **Fixed.** §3.1: declare `{ nullable: true, initial: null, integer: true }`; corrected the defaults explanation (V13 `NumberField` already defaults `nullable: true`/`initial: undefined`); noted no migration (missing keys prepare as `null`, persisted only when stamped); floor values on write. |
| 11 | Localization missed (Minor) | **Fixed.** §3.8 + §6: `SWFFG.Codex.CritTrauma.*` and `SWFFG.Settings.codex.VehicleCritWeeklyLimit.*` in `lang/codex/en.json`, used via `localize`/`game.i18n.format`. |
