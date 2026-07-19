# Crit-Trauma Weekly Recovery Counter — Design Spec

## Concept & rules basis
A per-injury "you've used this week's healing attempt" tracker for the SW FFG system,
driven automatically off a single shared in-game clock. Rules verified against the EotE SRD:

- **Character crits:** Resilience self-heal requires a *full week of rest first*, then once/week;
  Medicine (ally) once/week/injury, no rest gate; **the two are independent**
  ([SRD: recovery-organics](https://sw-eote-srd.vercel.app/personal/status-recovery/recovery-organics)).
- **Vehicle crits:** RAW = *unlimited* Mechanics retries, no weekly limit
  ([SRD: vehicle-actions](https://sw-eote-srd.vercel.app/vehicles/vehicle-combat/vehicle-actions)) —
  so the weekly cooldown for vehicles is an opt-in house rule.

## Time model
- One world-level integer **`campaignDay`**, GM-writable, player-readable.
- No reliance on Foundry's clock or Simple Calendar (time is purely narrated, variable rate).
  The GM bumps the day when narrating time passing; **one input recomputes every character's every cooldown**.

## Data model — fields on the `criticalinjury` item (declared schema, Q6=A)

| Field | Purpose |
|---|---|
| `receivedDay` | initial rest gate (Resilience only); stamped at genuine creation (`ApplyCrit` + manual "+") |
| `resilienceLastAttemptDay` | self-heal cooldown |
| `medicineLastAttemptDay` | assisted cooldown |

Null = "never stamped" = **attemptable now** (Q11=A); compute defensively so null never enters arithmetic.

## Availability (helper reads item + `campaignDay`)
- **Resilience** attemptable when `currentDay >= (resilienceLastAttemptDay ?? receivedDay ?? -Infinity) + 7`
- **Medicine** attemptable when `medicineLastAttemptDay` unset **or** `currentDay >= medicineLastAttemptDay + 7`
  (no rest gate)

## UI

**Global (once):** persistent, player-visible **"Day N [+]"** readout in the Destiny Tracker widget body
(`modules/ffg-destiny-tracker.js`); GM clicks **[+]** → "advance how many days?" prompt (default 7).
The always-visible readout *is* the reminder that fights the one real failure mode (GM forgetting to advance).

**Per crit card — two independent controls:**

| Path | Attemptable | On cooldown |
|---|---|---|
| Resilience (self) | **"Roll Resilience"** button — *auto-resolves* (Q8=B): success → delete crit; fail → stamp `resilienceLastAttemptDay`. Roll tagged with item id. | "Self-heal in N days" |
| Medicine (assisted) | **"Failed"** marker (manual; roll done separately, success → player deletes crit) → stamps `medicineLastAttemptDay` | "Medicine in N days" |

Asymmetry is principled: Resilience = the actor rolling on their own sheet (readable → auto-resolve);
Medicine = an ally on someone else's sheet (manual marker avoids "whose cooldown" mess).
They're decoupled, so a failed Resilience attempt leaves the Medicine attempt available that week.

**Vehicle card:** single Mechanics-path control, shown **only when `vehicleCritWeeklyLimit` = On**.

## Architecture — card-scoped (not sheet-scoped)
Codex theme only. Data travels on the item; a Handlebars helper does the math; markup goes in
**`templates/parts/codex/cdx-injuries.html`** (char/nemesis/rival crits) + the `criticaldamage` block in
**`templates/actors/codex/codex-vehicle.html`**; handlers bind once in **`_cdxActivate`**
(`modules/actors/codex-sheets.js:467`); styling in **`cdx.css`** alone.
Adding it to a future sheet = just include the card markup, nothing else.

Note: `cdx-injuries.html` is shared by character/rival/nemesis (`codex-character.html`) and minion
(`codex-minion.html`). Card-scoping means rival/minion inherit the controls for free — correct behaviour:
if an actor holds a crit injury, the healing rules apply regardless of actor type.

## Settings
- **`vehicleCritWeeklyLimit`** — Boolean, world scope, **default Off (RAW-accurate)**; flip On per-world for the house rule.

## Loose ends to decide at build time (minor)
1. **`campaignDay` change → live sheet refresh:** on the setting's `onChange`, re-render open Codex sheets so countdowns update immediately.
2. **Rewind clamp:** if a GM lowers `campaignDay` below a stamp, clamp `daysLeft` at 7 (don't show negatives/overflow).
3. **Auto-resolve success threshold:** define "success" = net successes >= 1 (Triumph/Despair irrelevant to the heal outcome); confirm how the tagged roll's result is read back.
4. **Day origin:** start at Day 1 (cosmetic).

## Decision log (grilling Q&A)
- Q1 Time source: manual GM-advanced campaign day (no reliable in-game clock).
- Q2 Granularity: per-injury; a failed attempt burns that week.
- Q3 Attempt recording: decoupled from the dice roll (button marks state, roll done separately) — later refined per path.
- Q4 Advance input: GM control on the Destiny Tracker / group-manager widget.
- Q5 Widget form: persistent, player-visible "Day N [+]" readout (not a buried menu item).
- Q6 Storage: declared schema fields on the item (not flags).
- Q7 Vehicle scope: include vehicle crits, gated behind `vehicleCritWeeklyLimit` (default Off).
- Q8 Resilience button: auto-resolve (B); Resilience-only on that control; Resilience & Medicine cooldowns decoupled.
- Q9/Q10 Sheets: Codex theme only; character + nemesis (+ vehicle) — superseded by card-scoping.
- Q11 Legacy/null stamps: treat as "attemptable now."
