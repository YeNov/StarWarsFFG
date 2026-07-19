# Requirements Brief — Crit-Trauma Weekly Recovery Counter

> Self-contained brief for a cold session. Repo: `starwarsffg` Foundry VTT system (git, not Perforce).
> Working branch: `crit-trauma-counter`. Source design spec: `docs/crit_trauma_helpers_spec.md` (read it in full).

## Goal
Add a per-injury "you've already used this week's healing attempt" tracker, driven off a single shared,
GM-advanced in-game clock (`campaignDay`). One GM input recomputes every character's every cooldown.
Scope is the **Codex II theme sheets only** and is **card-scoped** (data + controls live on the crit item's
card markup), so any actor type that holds a crit injury inherits the controls for free.

## Rules basis (EotE SRD, already verified in the spec)
- Character crits: Resilience self-heal needs a **full week of rest first**, then once/week. Medicine (ally)
  once/week/injury, **no rest gate**. The two cooldowns are **independent**.
- Vehicle crits: RAW = unlimited Mechanics retries. So the vehicle weekly cooldown is an **opt-in house rule**,
  gated behind a setting defaulting **Off**.

## Time model
- One world-scope integer `campaignDay`, GM-writable, player-readable. No Foundry clock / Simple Calendar
  dependency — time is narrated at a variable rate. GM bumps the day; all cooldowns recompute.
- Availability math (compute defensively; null must never enter arithmetic):
  - Resilience attemptable when `currentDay >= (resilienceLastAttemptDay ?? receivedDay ?? -Infinity) + 7`
  - Medicine attemptable when `medicineLastAttemptDay` unset **or** `currentDay >= medicineLastAttemptDay + 7`
  - Null stamp = "never attempted" = attemptable now.
  - Rewind clamp: if GM lowers `campaignDay` below a stamp, clamp `daysLeft` at 7 (no negatives/overflow).

## Data model (declared schema fields on the item — NOT flags; spec Q6=A)
Add three nullable day fields (initial `null`) to the crit item DataModel(s):
- `receivedDay` — rest-gate origin (Resilience only); stamped at genuine creation.
- `resilienceLastAttemptDay` — self-heal cooldown stamp.
- `medicineLastAttemptDay` — assisted cooldown stamp.

Declared-schema (not flags) is deliberate: the V14 DataModel cutover hides *undeclared* system paths from the
prepared view, so flags/undeclared fields would read back wrong on the sheet.

## UI
- **Global (once):** a persistent, player-visible **"Day N [+]"** readout in the Destiny Tracker widget body.
  GM clicks **[+]** → "advance how many days?" prompt (default 7). The always-visible readout is the reminder
  that fights the one real failure mode: the GM forgetting to advance the day.
- **Per crit card — two independent controls:**
  - Resilience (self): **"Roll Resilience"** button when attemptable → **auto-resolves** (spec Q8=B): net
    successes >= 1 → delete the crit; otherwise stamp `resilienceLastAttemptDay`. Roll tagged with the item id.
    On cooldown → "Self-heal in N days".
  - Medicine (assisted): **"Failed"** marker (manual; the roll is done separately, success → player deletes the
    crit) → stamps `medicineLastAttemptDay`. On cooldown → "Medicine in N days".
  - Asymmetry is principled: Resilience = actor rolling on their own sheet (auto-resolve is safe); Medicine =
    an ally on someone else's sheet (manual marker avoids a "whose cooldown" mess). The two are decoupled — a
    failed Resilience attempt leaves that week's Medicine attempt available.
- **Vehicle card:** a single Mechanics-path control, shown **only when `vehicleCritWeeklyLimit` = On**.

## Settings
- `campaignDay` — Integer, world scope, player-readable, GM-writable. Start at Day 1 (cosmetic).
  `onChange` → re-render open Codex sheets so countdowns update immediately (see CSS/widget note below for how
  the Destiny Tracker readout updates — it does NOT re-render).
- `vehicleCritWeeklyLimit` — Boolean, world scope, **default Off** (RAW-accurate); flip On for the house rule.

## Grounded integration points (verified against the codebase 2026-07-19)
- **Item DataModels:** `modules/data/models/item/criticalinjury.js` and `.../criticaldamage.js` — each extends
  `mix(BaseItemDataModel, CoreTemplate)` and adds top-level `min`/`max`/`severity` NumberFields. Add the three
  day fields here (vehicle path uses `criticaldamage`; character/rival/nemesis/minion use `criticalinjury`).
- **Card markup (shared):** `templates/parts/codex/cdx-injuries.html` — renders each crit as
  `<div class="item cdx-injury" data-item-id="{{item._id}}">`. Shared by character/rival/nemesis
  (`codex-character.html`) and minion (`codex-minion.html`). Manual add is `.item-add.criticalinjury`.
- **Vehicle card:** `templates/actors/codex/codex-vehicle.html` ~line 133 — the `criticaldamage` block
  (`.cdx-cards-head` + `.item.cdx-injury[data-item-id]`, no manual add).
- **Handlers:** `modules/actors/codex-sheets.js` — bind once in `_cdxActivate(html)` (line 467); the bespoke
  pattern is `root.querySelector(...).addEventListener(...)`; actor writes use
  `this.actor.update({...}, { render: false })`; item writes use `item.update({ "system.<field>": day })`.
  Tear down any added listeners/observers in `close()` (line 430). Classes: `CodexActorSheet` /
  `CodexAdversarySheet`.
- **Availability helper:** register a Handlebars helper in `modules/swffg-main.js` (alongside `iff` ~1217 and
  `renderMultiple` ~1250). It reads the item's day fields + `game.settings.get("starwarsffg","campaignDay")`
  and returns attemptable/daysLeft per path.
- **Settings:** `modules/settings/settings-helpers.js` — precedent house-rule world boolean is
  `codexAdvantageHealsStrain` (~line 405) registered under the existing `codexSettings` menu (~line 91).
  Follow that shape for `vehicleCritWeeklyLimit`; register `campaignDay` alongside. Many settings use
  `onChange: this.debouncedReload` (full reload) — prefer a lighter targeted re-render of open Codex sheets.
- **Destiny Tracker widget:** `modules/ffg-destiny-tracker.js` (ApplicationV2, template
  `templates/ffg-destiny-tracker.html`). CRITICAL: it is rendered exactly once at ready and is **deliberately
  never re-rendered** — the destiny pool is updated in place by the `dPool*` settings' `onChange` rewriting the
  DOM (`#destinyLight`/`#destinyDark`) directly. The "Day N [+]" readout MUST follow the same in-place-update
  pattern (a `campaignDay` onChange rewrites the readout's text node), not a widget re-render. GM-only `[+]`;
  players see the number only. Listeners bind in `_activateListeners(html)`.
- **Crit creation stamp:** `modules/helpers/apply-crit.js` embeds the crit via
  `applyToTargetActor(realActor, { type: "crit", items: [...] })` (~line 209). `receivedDay` must be stamped at
  genuine creation — both this path AND the manual `.item-add.criticalinjury` "+" path.

## Hard project constraints (dispatched sessions won't otherwise know these)
- **CSS is hand-maintained. NEVER run `gulp css` / `npm run compile`.** Both `starwarsffg.css` and
  `mandar.css` are hand-edited and the SCSS has drifted. Edit CSS files directly.
- **The active theme is `mandar`**, which *disables* `starwarsffg.css` entirely (not a specificity fight).
  Codex sheet styling lives in `styles/cdx.css` (loaded by the Codex sheets regardless of theme) — put the crit
  **card** styles there. BUT the **Destiny Tracker readout is global chrome, not a Codex sheet** — global/UI CSS
  must be duplicated into BOTH `starwarsffg.css` and `mandar.css` to survive the mandar theme. This tension
  (card styling vs global-widget styling) is a real open question the design must resolve explicitly.
- Use `system.*` keys for item writes (not `data.*`).
- Foundry VTT V13 line, ApplicationV2 sheets. This is the `YeNov/StarWarsFFG` fork; all GitHub writes target
  that fork only (never `StarWarsFoundryVTT/StarWarsFFG`).

## Open questions to resolve in the design
1. `campaignDay` onChange → live refresh: exact mechanism for re-rendering open Codex sheets AND updating the
   Destiny Tracker readout in place (two different update paths).
2. How the tagged auto-resolve Resilience roll's result is read back (define success = net successes >= 1;
   Triumph/Despair irrelevant to the heal outcome).
3. Where the Destiny Tracker readout CSS lives given the mandar-disables-starwarsffg.css constraint.
4. Whether `criticaldamage` needs all three day fields or only the Mechanics-path stamp (vehicle has no
   Resilience/Medicine split).

## Non-goals
- No Foundry clock / Simple Calendar integration.
- No changes to non-Codex (V1/mandar/legacy) sheets — card-scoped, Codex only.
- No automatic day advancement; the GM always advances manually.
- No change to RAW vehicle behaviour unless the GM opts into `vehicleCritWeeklyLimit`.
