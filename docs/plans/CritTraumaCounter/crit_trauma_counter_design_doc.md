# Design Doc — Crit-Trauma Weekly Recovery Counter (v3)

> System: `starwarsffg` Foundry VTT (V13 line, ApplicationV2). Branch: `crit-trauma-counter`.
> Sources: `docs/plans/CritTraumaCounter/requirements_brief.md`, `docs/crit_trauma_helpers_spec.md`.
> Supersedes v2; incorporates the second review (`crit_trauma_counter_design_doc_review_v2.md`) and the
> project owner's descope decision on multi-client concurrency.
> This is a **design** doc — architecture and decisions, not a build order.
> Every code claim below was re-read against source 2026-07-19 (including the reviewer's v2 citations).

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
  a **narrow, authorized, server-validated** GM bridge (§3.3.3).
- **Ordinary-misuse protection:** a per-item local in-flight guard + a live re-check immediately before acting +
  a GM-side availability re-check together prevent everyday double-clicks and stale-render attempts (§3.3.1).

**Non-goals**

- No Foundry world clock / Simple Calendar integration.
- No automatic day advancement — the GM always advances manually.
- No changes to non-Codex (V1 / mandar / legacy) sheets.
- No change to RAW vehicle behaviour unless the GM opts into `vehicleCritWeeklyLimit`.
- No generic privileged embedded-item write channel (only the scoped, validated op in §3.3.3).
- **No cross-client atomic "one attempt per week" guarantee, and no GM serialized reservation coordinator**
  (project-owner descope). Foundry's `Item#update` has no compare-and-set, and the day field carries no
  reservation owner, so a genuine *simultaneous same-day* race between two clients (both read the item as
  attemptable before either write propagates) can produce two rolls for one weekly attempt. This is an
  **accepted residual risk** for the intended co-located table (a single healer per crit, GM present): the
  guards above stop the realistic failure modes (double-click, acting on a stale render), and the always-visible
  Day readout keeps the GM in the loop. Hardening this into a true distributed lock is explicitly out of scope.

## 3. Proposed architecture

Card-scoped: data on the item, a Handlebars helper does availability math at render time, markup in the shared
crit-card templates, handlers bind per render in the Codex `_cdxActivate`, styling splits `cdx.css` (cards) vs
the global stylesheets (readout), and the `campaignDay` `onChange` is the single live-refresh engine.
User-facing strings are localized across `lang/en.json` (the setting) and `lang/codex/en.json` (feature-sheet
strings) — see §3.8.

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

`nullable: true, initial: null` is explicit (not to correct a default — on the installed V13 runtime
`NumberField` already defaults `nullable: true`, `initial: undefined`) so an unstamped injury reads back a stable
`null` rather than `undefined`, and the intent is legible. `integer: true` because every value is a campaign-day
integer; writes additionally `Math.floor` defensively (§3.5). **No migration needed:** existing crit sources
lacking these keys prepare as `null` and persist only when first stamped; legacy crits are immediately
attemptable (Q11=A).

**`modules/data/models/item/criticaldamage.js`** — same base shape (verified). Resolves **open question (d):**
vehicles have no rest gate and no self/assist split, so `criticaldamage` gets a **single** field,
`mechanicsLastAttemptDay` (same declaration) — no `receivedDay`, no Resilience/Medicine pair.

### 3.2 Availability helper

One Handlebars helper `critAvailability` registered in **`modules/swffg-main.js`** alongside `iff` (line 1217) and
`renderMultiple` (line 1250) (both verified). It takes the item, reads
`game.settings.get("starwarsffg","campaignDay")`, and returns a struct consumed via
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
- **Mechanics** (vehicle) same shape as Medicine, keyed off `mechanicsLastAttemptDay`; returns `mechanics: null`
  when `vehicleCritWeeklyLimit` is Off.
- `daysLeft = Math.min(7, Math.max(0, stamp + 7 - currentDay))` — `max(0,…)` prevents negatives, `min(7,…)` is the
  **rewind clamp**. Null stamp ⇒ `attemptable: true, daysLeft: 0`.
- `canSelfHeal` lets the **template** hide the Resilience control from non-owners (Finding 3); the **handler** and
  the **GM bridge** each re-check permission and availability independently (§3.3) — render-time state is never an
  authority check.

The same availability predicate (`stamp == null || currentDay >= stamp + 7`) is reused verbatim by the handler's
live re-check and by the GM-bridge server-side check, so all three agree.

### 3.3 Per-card controls (markup + handlers)

**Character card — `templates/parts/codex/cdx-injuries.html`** (verified). Inside each `.cdx-injury`, wrapped in
`{{#with (critAvailability item) as |avail|}}`:

- **Resilience (self)** — rendered **only when `avail.resilience.canSelfHeal`**. When attemptable, a
  **"Roll Resilience"** button (`.cdx-inj-resilience`); otherwise a **"Self-heal in N days"** readout.
- **Medicine (assisted)** — visible to any permitted viewer. When attemptable, a **"Failed"** marker button
  (`.cdx-inj-medfail`); otherwise **"Medicine in N days"**.

**Vehicle card — `templates/actors/codex/codex-vehicle.html`** (verified: `criticaldamage` block ~line 133-142).
A single Mechanics control (`.cdx-inj-mechfail` / "Mechanics in N days"), rendered only when `avail.mechanics` is
non-null.

**Handlers — `modules/actors/codex-sheets.js`, `_cdxActivate(html)` (line 467, verified).** Classes
`CodexActorSheet` (line 1448) and `CodexAdversarySheet`. Bind per render (matching the `.cdx-hcollapse-btn` /
`.cdx-tab` precedent: no `close()` teardown needed — elements are recreated each render). Resolve the crit from
`event.target.closest(".cdx-injury").dataset.itemId`.

**Permission fact (verified):** `CodexSchemeMixin.activateListeners` (codex-sheets.js:392-397) calls
`_cdxActivate` **unconditionally** after the base's `if (!this.isEditable) return;` (actor-sheet-ffg.js:508-510),
so `_cdxActivate` runs even for non-owners/observers. Every handler enforces its own gate.

**Visibility fact (verified — New Finding 1):** the entire crit-card body (the injuries tab and its pane) sits
inside `{{#unless limited}}` in `codex-character.html` (opens line 51, injuries pane line 131, closes line 135),
`codex-minion.html`, and `codex-vehicle.html`. A **LIMITED** user therefore cannot see any crit marker at all.
This sets the authorization floor for the GM bridge at **OBSERVER**, not LIMITED (§3.3.3).

#### 3.3.1 Resilience button — owner/GM only; prerequisites-before-stamp ordering (Findings 3, 6; New Finding 3)

The handler runs strictly in this order so that (a) nothing that can fail *before a die is cast* ever burns the
week, and (b) ordinary double-clicks / stale renders are caught:

1. **Local in-flight guard** — set a per-item in-flight key and disable the button on first click; clear in a
   `finally`. Stops the everyday double-click.
2. **Permission re-check** — `item.parent?.isOwner || game.user.isGM`, else abort (defence behind the
   `canSelfHeal` template gate).
3. **Live availability re-check** — re-read the *live* item (`this.actor.items.get(itemId)`) and recompute
   Resilience availability from its current stamps (same predicate as §3.2). If not attemptable, notify and
   abort. This catches acting on a stale render and the local second click after step 4's write.
4. **Build all non-mutating prerequisites** — validate the actor has a **Resilience** skill and build its
   `DicePoolFFG` (as `_cdxApplyStrainRecovery` builds Cool/Discipline pools, codex-sheets.js:1371-1389,
   verified). A missing skill raises a **localized notification and aborts *before any stamp*** — so a
   configuration gap can never consume a weekly attempt (New Finding 3).
5. **Stamp the attempt** — `await item.update({ "system.resilienceLastAttemptDay": currentDay })`
   (`currentDay` = floored `campaignDay`). This is the local reservation: a subsequent local click now fails
   step 3. It is **not** a cross-client atomic reservation — the simultaneous-two-client race is the accepted
   residual of §2.
6. **Roll and read back** — roll inline with the item-id tag restored as a message flag (Finding 4):
   `const message = await new game.ffg.RollFFG(pool.renderDiceExpression()).toMessage({ speaker: { actor }, flavor, flags: { starwarsffg: { critTraumaRecovery: { actorUuid: actor.uuid, itemId, path: "resilience" } } } });`
   Then `const net = message.rolls?.[0]?.ffg?.success ?? 0;`. `roll.js` nets successes against failures before
   exposing this field (roll.js:188-203, verified), so **`net >= 1` wins** (Triumph/Despair irrelevant).
7. **Resolve** — win ⇒ `await item.delete()`; loss ⇒ the stamp from step 5 stands (attempt correctly burned).

**Rollback correctness (New Finding 3, verified against `RollFFG.toMessage`).** `toMessage` **evaluates the dice
first** (`if (!this._evaluated) await this.evaluate();`, roll.js:353) and **creates the ChatMessage afterward**
(`cls.create(...)`, roll.js:398). Consequences, honoured by the ordering above:

- All fallible *non-dice* work (skill validation, pool build) happens in step 4, **before** the step-5 stamp — so
  a pre-roll failure cannot burn the week without any rollback logic at all.
- Once the dice have evaluated, **a genuine attempt has occurred.** If `cls.create` throws *after* evaluation, the
  stamp is **kept** and the user/GM is notified (a localized warning). Rolling the stamp back here would grant a
  free reroll and is explicitly **not** done.
- The schema stores only a day, not an operation token, so the design **never** rolls `resilienceLastAttemptDay`
  back merely because it equals `currentDay` — that could erase a different client's valid same-day reservation.
  Because step 4 front-loads every non-dice failure, no equality-based rollback is needed.

Writes use `system.*` keys and `item.update`/`item.delete`; the owner owns their own embedded crit, so these
succeed locally with no bridge.

#### 3.3.2 Medicine / Mechanics "Failed" marker — via the narrow GM bridge

The check is rolled separately; on success the crit **owner** deletes the crit. The marker only stamps the
cooldown. The handler:

1. Re-checks live availability (as §3.3.1 step 3) to avoid a redundant stamp.
2. If the user owns the item → stamp locally
   (`item.update({ "system.medicineLastAttemptDay": <floored campaignDay> }`)).
3. Otherwise → forward the narrow, validated `crit-recovery-attempt` op (§3.3.3). Mechanics is identical with
   `path: "mechanics"` → `mechanicsLastAttemptDay`.

The two character paths stay decoupled: a failed Resilience attempt leaves that week's Medicine attempt available.

#### 3.3.3 The `crit-recovery-attempt` GM-bridge operation (Finding 2; New Finding 1)

**Verified constraint:** `modules/helpers/gm-bridge.js` `performApply` supports only `damage`/`crit`/`kill-minion`
(lines 35-44), and the `APPLY_EVENT` branch (lines 131-140) performs **no requestor authorization**. We add a
**new, self-authorizing** socket event (`ffgCritRecovery`) rather than extending `performApply`, mirroring the
authorization pattern the `MESSAGE_EVENT` branch already uses (gm-bridge.js:106-129, which reads the
Foundry-injected `requestorId` second socket arg — trusted, not client-spoofable).

- **Client payload:** `{ event: "ffgCritRecovery", actorUuid, itemId, path }`, where `path` is the enum
  `"medicine" | "mechanics"` — never a raw field name, never a client-supplied day.
- **GM-side branch** (acts only as the active GM):
  1. Resolve `actor = await fromUuid(actorUuid)`, `item = actor?.items.get(itemId)`; bail if missing / not
     embedded in that actor (**membership check**).
  2. **Authorize the requestor:** `actor.testUserPermission(game.users.get(requestorId), "OBSERVER")` (the GM is
     implicitly OWNER). **OBSERVER, not LIMITED** — because the crit card is hidden from LIMITED users behind
     `{{#unless limited}}` (verified), so LIMITED must not be able to drive an action the real UI withholds.
     Reject and log otherwise.
  3. **Validate path↔type (+ house rule):** `medicine` requires `item.type === "criticalinjury"`; `mechanics`
     requires `criticaldamage` **and** `vehicleCritWeeklyLimit` On. Reject otherwise.
  4. **Server-side availability re-check (New Finding 1):** recompute that path's availability from the GM's own
     floored `campaignDay` and the item's *live* stamp, and **reject unless the stamp is null or
     `currentDay >= stamp + 7`.** This is authorization/validation — never a client convenience check — so a
     modified client cannot re-stamp a cooling-down injury and improperly extend its cooldown.
  5. **Whitelist the field + derive the day:** map the enum to exactly `system.medicineLastAttemptDay` or
     `system.mechanicsLastAttemptDay`, set it to the GM's floored `campaignDay`, and
     `await item.update({ [field]: day })`.
- The client helper mirrors `applyToTargetActor`'s `"local"|"forwarded"|false` contract (warn on no GM). Owner/GM
  writes stay local (§3.3.2 step 2). Existing damage/crit/kill-minion ops are untouched.

Note this is single-write validation, not a reservation lock: it prevents an unauthorized or already-cooling-down
stamp, but does not serialize two simultaneous authorized requests — consistent with the §2 descope.

### 3.4 Global Day readout (Destiny Tracker widget)

**`modules/ffg-destiny-tracker.js`** (ApplicationV2; template `templates/ffg-destiny-tracker.html`, verified).
The widget renders **once** at ready and is *never re-rendered*; the pool updates in place via the `dPool*`
`onChange` rewriting `#destinyLight`/`#destinyDark` (`_prepareContext` supplies only *initial* values).

- **Template:** add a `<section id="ffg-campaign-day">` sibling of the destiny sections with a **stable value
  span** plus a GM-only advance control:
  `<span class="ffg-campaign-day-value">{{localize "SWFFG.Codex.CritTrauma.Day"}} {{campaignDay}}</span>{{#if isGM}}<a class="ffg-campaign-day-advance">[+]</a>{{/if}}`.
  Players see the number only.
- **Initial value:** add `campaignDay: game.settings.get("starwarsffg","campaignDay")` to `_prepareContext`
  (line 56, verified).
- **`[+]` handler:** bind in `_activateListeners(html)` (line 100, verified). GM clicks `[+]` → a `DialogV2.wait`
  "advance how many days?" prompt (default **7**, floored) → `game.settings.set("starwarsffg","campaignDay",
  current + n)`. The handler does not touch the DOM or re-render the widget.

**Stable-span update (Finding 5):** the dPool precedent rewrites a whole section's `innerHTML`, which is safe only
because that section owns its own listener. Here the GM listener is on the `[+]` **child**, so live-refresh must
update **only** `.ffg-campaign-day-value`'s `textContent`, leaving the `[+]` node/listener intact. Both the
container and the value span are null-guarded before use.

### 3.5 Settings

**`modules/settings/settings-helpers.js`** (verified: `codexSettings` menu ~line 91; `codexAdvantageHealsStrain`
~line 405; `dPoolLight`'s `onChange` rewrites the tracker DOM at lines 213-215).

- **`campaignDay`** — `type: Number`, `scope: "world"`, `config: false`, `default: 1`, registered standalone
  (like `dPoolLight`). World scope = player-readable; GM-only writing enforced by the UI. `Math.floor` on write.
  `onChange` performs the dual live-refresh (§3.6). **Not** `debouncedReload`.
- **`vehicleCritWeeklyLimit`** — `type: Boolean`, `scope: "world"`, `config: false`, **`default: false`**
  (RAW-accurate), following the `codexAdvantageHealsStrain` shape. Its `onChange` re-renders open Codex sheets so
  the vehicle control appears/disappears immediately.

**Reachability (Finding 1, verified):** the custom Codex menu is not auto-populated —
`modules/settings/ui-settings.js:306-311` (`codexSettings._prepareContext`) has an explicit allow-list of only
`"starwarsffg.defaultSheetTheme"` and `"starwarsffg.codexAdvantageHealsStrain"`. `"starwarsffg.vehicleCritWeeklyLimit"`
**must be added to that allow-list** so a GM can toggle it. `campaignDay` is intentionally not added there (it is
driven from the widget).

### 3.6 Live-refresh mechanism — the two update paths

Resolves **open question (b).** The `campaignDay` `onChange` runs on **every** client and does two things:

1. **Open Codex sheets re-render.** Iterate the ApplicationV2 registry **by value** (verified: it is a
   `Map<string, ApplicationV2>`, so iterating the Map yields `[id, app]` pairs that fail `instanceof`):
   `for (const app of foundry.applications.instances.values()) if (app.rendered && (app instanceof CodexActorSheet || app instanceof CodexAdversarySheet)) app.render();`
   Packaged as an exported `refreshOpenCodexSheets()` **in `codex-sheets.js`**, imported by `settings-helpers.js`
   (cycle-safe direction).
2. **Destiny Tracker readout updates in place.** Update only `.ffg-campaign-day-value`'s `textContent` (§3.4),
   null-guarded, leaving the `[+]` listener intact.

### 3.7 `receivedDay` stamping at genuine creation (Finding 7)

Fold into the existing hook — `modules/swffg-main.js:76-113` `registerActorItemValidationHooks()` is already the
`preCreateItem` hook that validates crit placement (and blocks `criticalinjury` on non-character actors at
lines 102-105, verified). Add: when `item.type === "criticalinjury"`, the item is embedded on an Actor, and
`system.receivedDay` **is null**, stamp via
`item.updateSource({ "system.receivedDay": <floored campaignDay> })`.

**Copy/duplicate semantics (defined):** both required paths arrive with `receivedDay == null` and get stamped —
**Apply Crit** copies a world-table crit whose field defaults `null` (embeds via
`applyToTargetActor(realActor, { type: "crit", items: [item.toObject()] })`, apply-crit.js:209 →
`createEmbeddedDocuments`, verified); the **manual `.item-add.criticalinjury`** path creates sparse data → null. A
crit already carrying a **non-null** `receivedDay` (actor-to-actor copy, duplication, import) **carries its own
timeline** and is left untouched. "Genuine creation" = the item arrives *without* a stamp. `criticaldamage` is
**not** stamped here (no rest gate).

### 3.8 Localization (Finding 11; New Finding 4)

Two files, matching where the *existing* keys actually live:

- **`lang/en.json`** — `SWFFG.Settings.codex.VehicleCritWeeklyLimit.{Name,Hint}`, placed **beside** the other
  `SWFFG.Settings.codex.*` keys. (Correction: the precedent `SWFFG.Settings.codex.AdvantageHealsStrain.{Name,Hint}`
  live at `lang/en.json:535-536`, **not** in `lang/codex/en.json` — verified; v2's "verified precedent" pointing
  at `lang/codex/en.json` was inaccurate. Keeping the setting key here avoids splitting the `SWFFG.Settings.codex.*`
  namespace across files.)
- **`lang/codex/en.json`** — the feature-sheet strings: `SWFFG.Codex.CritTrauma.*` for button labels
  ("Roll Resilience", "Failed"), pluralizable countdowns ("Self-heal in {n} days", "Medicine in {n} days",
  "Mechanics in {n} days"), the "Day" prefix, the advance dialog title/prompt, and error/notification text (these
  sit beside the existing `SWFFG.Codex.StrainRecovery.*` keys — verified present here).

Use `localize` / `game.i18n.format` throughout (countdowns via `format` for the day count); English is the
fallback.

## 4. Alternatives considered

- **Flags instead of declared schema fields.** Rejected: the V14 cutover hides undeclared `system.*` paths.
- **Foundry world clock / Simple Calendar.** Rejected: time is narrated at a variable rate.
- **World-/actor-level cooldown store.** Rejected: breaks per-injury granularity and card-scoping.
- **Sheet-scoped implementation.** Rejected in favour of card-scoping.
- **Uniform three-field schema on `criticaldamage`.** Rejected (resolves (d)): two dead null fields.
- **Generic embedded-item write through the existing GM bridge.** Rejected as privileged-write escalation
  (APPLY_EVENT does no auth); replaced by the narrow, self-authorizing, availability-validating `ffgCritRecovery`
  op (§3.3.3).
- **Dropping the item-id tag** (v1). Rejected: brief requires it; kept as a cheap message flag with inline
  read-back.
- **Roll-then-stamp ordering / equality-based rollback** (v2). Rejected on re-review: `toMessage` evaluates dice
  before creating the message, so post-evaluation rollback grants a free reroll, and equality-based rollback can
  erase another client's stamp. Replaced by prerequisites-before-stamp ordering with no post-evaluation rollback
  (§3.3.1).
- **GM serialized reservation coordinator for true cross-client atomicity.** Considered and **descoped by the
  project owner** (§2): the co-located-table failure modes are covered by cheaper guards, and a distributed lock
  is disproportionate to the residual risk.
- **`campaignDay` `onChange: debouncedReload`.** Rejected: too heavy.
- **Whole-section `innerHTML` rewrite for the readout.** Rejected: destroys the `[+]` listener.
- **A second `preCreateItem` hook for stamping.** Rejected: folded into the existing hook.
- **Authorizing the bridge at LIMITED.** Rejected (New Finding 1): the crit card is hidden from LIMITED users, so
  the floor is OBSERVER.

## 5. Risks and open questions

**Resolved brief open questions**

- **(a) Readout CSS location** — split by scope: crit **card** controls → **`styles/cdx.css` only**; the Day
  **readout** is global chrome → **duplicated into BOTH `styles/starwarsffg.css` and `styles/mandar.css`** (the
  active `mandar` theme disables `starwarsffg.css`; `mandarBeskarAstromech.css` imports `mandar.css`, so no third
  copy). **CSS is hand-edited — never run `gulp css` / `npm run compile`.**
- **(b) Two live-update paths** — §3.6.
- **(c) Reading the auto-resolve roll result** — §3.3.1: inline `message.rolls[0].ffg.success` (net per
  roll.js:188-203); `>= 1` deletes the crit.
- **(d) `criticaldamage` fields** — §3.1: a single `mechanicsLastAttemptDay`.

**Minion scope (resolved).** Verified: `criticalinjury` creation is blocked for minions (swffg-main.js:102-105)
and Apply Crit kills minions (apply-crit.js:87-96). Minions are **legacy-only**; the shared markup is harmless for
a pre-existing minion crit but no supported flow creates one. No allow-list widening.

**Accepted residual risk (per §2 descope).** A genuine simultaneous same-day two-client Resilience race can
double-roll one weekly attempt. Accepted for the co-located table; not mitigated by a coordinator.

**Remaining build-time confirmations**

- **OBSERVER floor fit.** §3.3.3 authorizes a non-owner requestor at OBSERVER; confirm that matches table
  expectations for an assisting ally, or tighten to owner-only-forwarding.
- **Resilience skill presence.** Step 4 validates it and aborts with a localized notice before any stamp.
- **Integer discipline.** All day writes and the advance prompt are `Math.floor`-ed; `integer: true` is the schema
  backstop.
- **Rewind clamp coverage.** Unit-cover null, past-stamp, future-stamp, and rewound cases against
  `Math.min(7, Math.max(0, …))`.

**Project constraints honoured:** Codex-only / card-scoped; `system.*` keys; hand-edited CSS across `cdx.css` +
`starwarsffg.css` + `mandar.css` with no gulp/npm compile; all GitHub writes target the `YeNov/StarWarsFFG` fork
only.

## 6. Declared touch points

- `modules/data/models/item/criticalinjury.js` — three day fields.
- `modules/data/models/item/criticaldamage.js` — `mechanicsLastAttemptDay`.
- `modules/swffg-main.js` — `critAvailability` helper; `receivedDay` stamp folded into
  `registerActorItemValidationHooks`.
- `templates/parts/codex/cdx-injuries.html`, `templates/actors/codex/codex-vehicle.html` — card controls.
- `modules/actors/codex-sheets.js` — handlers in `_cdxActivate`; exported `refreshOpenCodexSheets()`.
- `modules/helpers/gm-bridge.js` — new authorized `ffgCritRecovery` event (OBSERVER + server-side availability
  re-check) + client helper.
- `modules/settings/settings-helpers.js` — `campaignDay` and `vehicleCritWeeklyLimit` registrations + the
  `campaignDay` `onChange`.
- `modules/settings/ui-settings.js` — add `vehicleCritWeeklyLimit` to the `codexSettings` allow-list.
- `modules/ffg-destiny-tracker.js`, `templates/ffg-destiny-tracker.html` — Day readout + `[+]` handler.
- `styles/cdx.css` (card), `styles/starwarsffg.css` + `styles/mandar.css` (readout).
- `lang/en.json` — `SWFFG.Settings.codex.VehicleCritWeeklyLimit.{Name,Hint}` (beside the other codex-setting
  keys).
- `lang/codex/en.json` — feature-sheet strings `SWFFG.Codex.CritTrauma.*`.

---

## Review response

### Prior v1 findings (re-confirmed status)

| # | Finding | Outcome |
|---|---|---|
| 1 | `vehicleCritWeeklyLimit` unreachable | **Fixed** (§3.5/§6: allow-list in ui-settings.js:306-311). |
| 2 | Non-owner Medicine/Mechanics write path | **Fixed** — narrow op in §3.3.3; its two open gaps (permission threshold, availability trust) are closed by New Finding 1 below. |
| 3 | Resilience exposed to non-owners | **Fixed** (§3.2/§3.3.1: `canSelfHeal` gate + handler re-check). |
| 4 | Item-id roll tag omitted | **Fixed** (§3.3.1: `flags.starwarsffg.critTraumaRecovery`). |
| 5 | Day refresh destroys `[+]` listener | **Fixed** (§3.4/§3.6: stable value span + `textContent`). |
| 6 | Duplicate Resilience attempts | **Fixed for ordinary misuse** (in-flight guard + live re-check + prerequisites-before-stamp, §3.3.1); **multi-client atomicity Descoped-per-owner** (§2). |
| 7 | False universal `preCreateItem` coverage | **Fixed** (§3.7: folded hook, stamp-if-null copy semantics). |
| 8 | Minion scope | **Resolved/documented** (§5: legacy-only). |
| 9 | ApplicationV2 registry iteration | **Fixed** (§3.6: `.values()` + `instanceof`). |
| 10 | NumberField defaults / integer days | **Fixed** (§3.1: `{nullable:true, initial:null, integer:true}`). |
| 11 | Localization omitted | **Fixed**, with placement corrected by New Finding 4 below. |

### New v2 findings

| # | Finding (severity) | Outcome |
|---|---|---|
| N1 | GM bridge authorizes hidden actions + no availability enforcement (Major) | **Fixed.** §3.3.3: authorize at `actor.testUserPermission(requestor, "OBSERVER")` (GM implicitly OWNER) — verified the crit card is behind `{{#unless limited}}` (codex-character.html 51/131/135), so LIMITED cannot see the marker; and the GM recomputes the path's availability from its own floored `campaignDay` + the live stamp, rejecting unless `stamp == null || currentDay >= stamp + 7`. Server-side authorization, not a client convenience check. |
| N2 | Same-day updates are not an atomic multi-client reservation (Major) | **Descoped per project owner.** §2 removes the cross-client "one attempt/week" promise and states the simultaneous same-day race as an accepted residual for a co-located table; no GM serialized coordinator is built. Ordinary double-click / stale-render cases remain covered by §3.3.1. |
| N3 | Rollback cannot identify "only the reservation this op wrote" (Major) | **Fixed.** §3.3.1 reordered so skill validation + pool build happen **before** the stamp (a missing skill can't burn the week); verified `RollFFG.toMessage` evaluates dice (roll.js:353) then creates the message (roll.js:398), so post-evaluation ChatMessage failure keeps the stamp (no free reroll) and notifies; the design introduces **no** equality-based rollback of the day field. |
| N4 | Localization-file evidence inaccurate (Minor) | **Fixed.** §3.8/§6: `SWFFG.Settings.codex.VehicleCritWeeklyLimit.{Name,Hint}` go in `lang/en.json` beside the existing codex-setting keys (verified at `lang/en.json:535-536`); feature-sheet strings stay in `lang/codex/en.json`; `lang/en.json` added to touch points and the inaccurate "verified precedent" note corrected. |
