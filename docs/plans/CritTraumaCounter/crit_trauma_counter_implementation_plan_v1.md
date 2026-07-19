# Implementation Plan — Crit-Trauma Weekly Recovery Counter (v1)

> Design: `docs/plans/CritTraumaCounter/crit_trauma_counter_design_doc_v3.md` (APPROVED).
> Constraints: `docs/plans/CritTraumaCounter/requirements_brief.md`.
> Repo: `starwarsffg` Foundry VTT system — **git** (not Perforce), branch `crit-trauma-counter`, `YeNov/StarWarsFFG` fork.
> **No build step:** Foundry loads the ES modules directly and **CSS is hand-maintained** — NEVER run `gulp css` / `npm run compile`. All item writes use **`system.*`** keys. Feature is **Codex-only, card-scoped**.
> Line numbers were re-confirmed against source 2026-07-19; each stage lists the current location.

## How to verify in this repo (applies to every stage)

- **JS syntax:** `node --check <file.js>` for any edited module (catches parse errors; Foundry never "compiles").
- **Edit-present assertions:** grep/read-back that the exact new symbol/markup exists and is well-formed.
- **Handlebars/HTML:** visual read-back of balanced `{{#with}}`/`{{/with}}` and tag nesting (no compiler; a malformed partial throws only at render).
- **Live-in-Foundry** (final, Stage 11): hard-reload the world as GM (modules are cached — reload to load new code), then run the manual checklist. There is a headless harness (`ffg-tests.js`, imported in the F12 console as GM after a hard reload — see memory `run-functional-tests-console`); where a pure-function assertion is cheap (the availability math) a test is noted, but **tests are not assumed to run in CI**.

Each stage below leaves the system **loadable** (a parse-valid module set; new helpers/handlers only execute post-`init`/at render).

---

## Stage 1 — DataModel day fields (schema first)

**Files:**
- `modules/data/models/item/criticalinjury.js` — `CriticalInjuryDataModel.defineSchema()` (currently returns `...super.defineSchema()` + `min`/`max`/`severity`).
- `modules/data/models/item/criticaldamage.js` — `CriticalDamageDataModel.defineSchema()` (same shape).

**Edit:**
- In `criticalinjury.js`, add three fields to the returned schema object:
  ```js
  receivedDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  resilienceLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  medicineLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  ```
- In `criticaldamage.js`, add ONE field:
  ```js
  mechanicsLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  ```
  (No `receivedDay`, no Resilience/Medicine split — vehicles have no rest gate/self-assist split; design §3.1.)

**Verification:**
- `node --check modules/data/models/item/criticalinjury.js && node --check modules/data/models/item/criticaldamage.js`.
- Grep both files for the new field names.
- No migration needed: existing crit sources lacking the keys prepare as `null` (design §3.1). Optional live check later: open a crit item, `item.system.receivedDay` reads `null`.

---

## Stage 2 — Availability Handlebars helper `critAvailability`

**File:** `modules/swffg-main.js` — Handlebars helper registration block; register **immediately after** `renderMultiple` (currently line 1250; `iff` is at 1217).

**Edit:** register `critAvailability(item)` returning the design §3.2 struct. Pure, null-defensive; reads the setting only when invoked (at render, after Stage 4 registers it):
```js
Handlebars.registerHelper("critAvailability", function (item) {
  const currentDay = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
  const sys = item?.system ?? {};
  const avail = (stamp) => {
    if (stamp === null || stamp === undefined) return { attemptable: true, daysLeft: 0 };
    const s = Math.floor(Number(stamp));
    return { attemptable: currentDay >= s + 7, daysLeft: Math.min(7, Math.max(0, s + 7 - currentDay)) };
  };
  const resStamp = sys.resilienceLastAttemptDay ?? sys.receivedDay ?? null;
  const vehicleLimit = game.settings.get("starwarsffg", "vehicleCritWeeklyLimit");
  const canSelfHeal = !!(item?.parent?.isOwner || game.user?.isGM);
  return {
    resilience: { ...avail(resStamp), canSelfHeal },
    medicine: avail(sys.medicineLastAttemptDay ?? null),
    mechanics: vehicleLimit ? avail(sys.mechanicsLastAttemptDay ?? null) : null,
  };
});
```
Note: registering the helper does not call `game.settings.get`; that runs only when a template invokes it, by which time Stage 4 has registered the settings.

**Verification:**
- `node --check modules/swffg-main.js`; grep for `critAvailability`.
- (Optional headless) unit-assert the `avail()` cases: null → `{true,0}`; `stamp+7 === currentDay` → attemptable; future stamp and rewound stamp both clamp `daysLeft` at 7 (design §5 clamp coverage).

---

## Stage 3 — Localization strings

**Files:**
- `lang/en.json` — beside the existing `SWFFG.Settings.codex.*` keys (currently 531–536, ending at `AdvantageHealsStrain.Hint`).
- `lang/codex/en.json` — beside the existing `SWFFG.Codex.StrainRecovery.*` keys.

**Edit:**
- In `lang/en.json` add (setting Name/Hint live here, NOT in `lang/codex` — design §3.8, verified):
  ```json
  "SWFFG.Settings.codex.VehicleCritWeeklyLimit.Name": "Vehicle Crit Weekly Limit (House Rule)",
  "SWFFG.Settings.codex.VehicleCritWeeklyLimit.Hint": "Apply the once-per-week Mechanics cooldown to vehicle critical hits. RAW allows unlimited Mechanics retries, so this is Off by default."
  ```
- In `lang/codex/en.json` add a `SWFFG.Codex.CritTrauma.*` group: `Day`, `RollResilience`, `Failed`, `SelfHealIn`, `MedicineIn`, `MechanicsIn` (with a `{days}` placeholder for the three countdowns), `AdvancePromptTitle`, `AdvancePromptLabel`, `NoResilienceSkill`, `RollFailedNoMessage` (post-evaluation ChatMessage failure notice), `AttemptUnavailable`.

**Verification:**
- Both files are strict JSON: `node -e "require('./lang/en.json'); require('./lang/codex/en.json')"` (throws on a trailing comma / dup key issue).
- Grep each new key.

---

## Stage 4 — Settings + live-refresh path 1 (re-render helper)

**Files:**
- `modules/actors/codex-sheets.js` — add an exported `refreshOpenCodexSheets()` (self-contained; near the top-level exports so `settings-helpers.js` can import it cycle-safely — design §3.6).
- `modules/settings/settings-helpers.js` — register two settings near `dPoolLight` (line 202) / `codexAdvantageHealsStrain` (line 405); import `refreshOpenCodexSheets`.
- `modules/settings/ui-settings.js` — `codexSettings._prepareContext()` allow-list (currently lines 306–311).

**Edit:**
- In `codex-sheets.js`:
  ```js
  export function refreshOpenCodexSheets() {
    for (const app of foundry.applications.instances.values()) {
      if (app.rendered && (app instanceof CodexActorSheet || app instanceof CodexAdversarySheet)) app.render();
    }
  }
  ```
  (Iterate the V13 `Map` by `.values()`, then `instanceof` — design §3.6.)
- In `settings-helpers.js`, `import { refreshOpenCodexSheets } from "../actors/codex-sheets.js";` and register:
  ```js
  game.settings.register("starwarsffg", "campaignDay", {
    name: "SWFFG.Codex.CritTrauma.Day", scope: "world", config: false, default: 1, type: Number,
    onChange: () => {
      // Path 1: re-render open Codex sheets so countdowns recompute.
      refreshOpenCodexSheets();
      // Path 2: rewrite ONLY the stable value span in the never-re-rendered widget (null-guarded).
      const el = document.querySelector("#ffg-campaign-day .ffg-campaign-day-value");
      if (el) el.textContent = `${game.i18n.localize("SWFFG.Codex.CritTrauma.Day")} ${Math.floor(Number(game.settings.get("starwarsffg","campaignDay"))||0)}`;
    },
  });
  game.settings.register("starwarsffg", "vehicleCritWeeklyLimit", {
    name: "SWFFG.Settings.codex.VehicleCritWeeklyLimit.Name",
    hint: "SWFFG.Settings.codex.VehicleCritWeeklyLimit.Hint",
    scope: "world", config: false, default: false, type: Boolean,
    onChange: () => refreshOpenCodexSheets(),
  });
  ```
  (`campaignDay` is standalone like `dPoolLight`; NOT added to the codex menu. Design §3.5. The path-2 rewrite is null-guarded so it is harmless before Stage 8 adds the element.)
- In `ui-settings.js`, add to the `codexSettings` allow-list array (lines 306–311):
  ```js
  "starwarsffg.vehicleCritWeeklyLimit",
  ```

**Verification:**
- `node --check` all three files.
- Grep `settings-helpers.js` for both `game.settings.register("starwarsffg", "campaignDay"` and `"vehicleCritWeeklyLimit"`; grep `ui-settings.js` for `starwarsffg.vehicleCritWeeklyLimit`.
- Live (after a later reload): `game.settings.get("starwarsffg","campaignDay")` → `1`; the Codex settings menu now lists the vehicle house-rule toggle.

---

## Stage 5 — `receivedDay` stamping in the existing pre-create hook

**File:** `modules/swffg-main.js` — `registerActorItemValidationHooks()` (function at line 76; `Hooks.on("preCreateItem", …)` at 77; the `criticalinjury`-placement guard is at ~102–105; the hook is invoked via `registerActorItemValidationHooks()` at line 194). **Do NOT add a second hook** (design §3.7).

**Edit:** inside the existing `preCreateItem` callback, AFTER the placement-validation returns, add:
```js
if (item.type === "criticalinjury" && item.parent?.documentName === "Actor" && (item.system?.receivedDay === null || item.system?.receivedDay === undefined)) {
  const day = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
  item.updateSource({ "system.receivedDay": day });
}
```
Stamp-iff-null (a copied crit with a non-null `receivedDay` keeps its own timeline; design §3.7). `criticaldamage` is NOT stamped (no rest gate).

**Verification:**
- `node --check modules/swffg-main.js`; grep for `receivedDay`.
- Live: with `campaignDay` advanced to e.g. 5, use Apply Crit on a PC and manually `+`-add a crit — both new crits read `system.receivedDay === 5`; a crit dragged from an existing actor that already had `receivedDay` keeps its old value.

---

## Stage 6 — Crit-card markup (character + vehicle)

**Files:**
- `templates/parts/codex/cdx-injuries.html` — the per-crit `<div class="item cdx-injury" data-item-id="{{item._id}}">` (currently line 4; shared by `codex-character.html` line 131 and `codex-minion.html`). **Note:** this pane sits inside `codex-character.html`'s `{{#unless limited}}` (opens line 51, **closes line 198** — the `{{/unless}}` at 135 closes an inner `cdxCombinedInventory` block), so LIMITED users never see these controls (design §3.3, sets the OBSERVER floor for Stage 9).
- `templates/actors/codex/codex-vehicle.html` — the `criticaldamage` `.cdx-injury` block (currently lines 137–141, inside the `damage` pane at 134).

**Edit:**
- In `cdx-injuries.html`, wrap each card's controls in `{{#with (critAvailability item) as |avail|}} … {{/with}}` and add, alongside the existing `.cdx-card-ctl`:
  - Resilience — only when `avail.resilience.canSelfHeal`: if `avail.resilience.attemptable`, a `<button class="cdx-inj-resilience" data-item-id="{{item._id}}">{{localize "SWFFG.Codex.CritTrauma.RollResilience"}}</button>`; else `<span class="cdx-inj-cooldown">{{localize "SWFFG.Codex.CritTrauma.SelfHealIn" days=avail.resilience.daysLeft}}</span>` (use `game.i18n.format` string with `{days}`).
  - Medicine — always (for permitted viewers): if `avail.medicine.attemptable`, `<button class="cdx-inj-medfail" data-item-id="{{item._id}}">{{localize "SWFFG.Codex.CritTrauma.Failed"}}</button>`; else `<span class="cdx-inj-cooldown">…MedicineIn days=avail.medicine.daysLeft…</span>`.
- In `codex-vehicle.html`, wrap the `criticaldamage` card similarly; render a single `.cdx-inj-mechfail` / "Mechanics in N days" **only when `avail.mechanics`** is non-null.

**Verification:**
- Read-back: balanced `{{#with}}`/`{{/with}}`, every button carries `data-item-id`, no stray tags.
- Live: on a PC Codex sheet the Crits tab shows "Roll Resilience" + "Failed" for a fresh crit; on a vehicle the Mechanics control is absent while `vehicleCritWeeklyLimit` is Off and appears when On (after Stage 4 exists).

---

## Stage 7 — Card handlers in `_cdxActivate` (+ client-side bridge helper)

**Files:**
- `modules/actors/codex-sheets.js` — `_cdxActivate(html)` (line 467); `close()` (line 430) needs **no** teardown (elements recreated each render — design §3.3). Reuse the pool-building pattern from `_cdxApplyStrainRecovery` / `buildPool` (lines 1371–1443).
- `modules/helpers/gm-bridge.js` — add the **client-side** emit helper (the GM-side listener branch is Stage 9).

**Edit:**
- In `gm-bridge.js`, export a client helper mirroring `applyToTargetActor`'s contract:
  ```js
  export async function applyCritRecoveryAttempt(actor, itemId, path) {
    const item = actor?.items.get(itemId);
    if (item?.isOwner) { /* owner path handled by the caller */ return "local"; }
    if (!game.users.activeGM) { ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM")); return false; }
    game.socket.emit("system.starwarsffg", { event: "ffgCritRecovery", actorUuid: actor.uuid, itemId, path });
    return "forwarded";
  }
  ```
- In `_cdxActivate`, bind per-render handlers (delegate on the root or `querySelectorAll`), resolving the crit via `event.target.closest(".cdx-injury").dataset.itemId`:
  - **`.cdx-inj-resilience`** — the strict ordering of design §3.3.1: (1) in-flight guard + disable in a `try/finally`; (2) re-check `item.parent?.isOwner || game.user.isGM`; (3) live re-check availability from the live item's stamps (same predicate as the helper); (4) validate the actor has a **Resilience** skill and build its `DicePoolFFG` — missing skill → `ui.notifications.warn(localize NoResilienceSkill)` and abort **before any stamp**; (5) `await item.update({ "system.resilienceLastAttemptDay": currentDay })`; (6) roll inline with the item-id flag:
    ```js
    const message = await new game.ffg.RollFFG(pool.renderDiceExpression()).toMessage({
      speaker: { actor }, flavor,
      flags: { starwarsffg: { critTraumaRecovery: { actorUuid: actor.uuid, itemId, path: "resilience" } } },
    });
    const net = message.rolls?.[0]?.ffg?.success ?? 0;
    ```
    (7) `net >= 1` → `await item.delete()`; else leave the stamp. **No post-evaluation rollback** — if `toMessage` throws after the dice evaluate (roll.js:353 evaluates, :398 creates), keep the stamp and warn (localize RollFailedNoMessage); design §3.3.1 / New Finding 3.
  - **`.cdx-inj-medfail`** — live re-check; if `item.isOwner` → `item.update({ "system.medicineLastAttemptDay": currentDay })`; else `await applyCritRecoveryAttempt(this.actor, itemId, "medicine")`.
  - **`.cdx-inj-mechfail`** — same as medfail with `mechanicsLastAttemptDay` / `path: "mechanics"`.
  - `currentDay = Math.floor(Number(game.settings.get("starwarsffg","campaignDay"))||0)`.
- Import `applyCritRecoveryAttempt` into `codex-sheets.js`.

**Verification:**
- `node --check` both files; grep `codex-sheets.js` for `cdx-inj-resilience`, `cdx-inj-medfail`, `cdx-inj-mechfail`, and the `critTraumaRecovery` flag; grep `gm-bridge.js` for `applyCritRecoveryAttempt` and `ffgCritRecovery`.
- Coherence note: until Stage 9 the non-owner marker emits a socket event no GM branch answers (harmless no-op); the owner path already works.
- Live (after Stage 9): see Stage 11 checklist.

---

## Stage 8 — Destiny Tracker Day readout (completes live-refresh path 2)

**Files:**
- `templates/ffg-destiny-tracker.html` — add a `<section id="ffg-campaign-day">` sibling of `#destinyLight`/`#destinyDark`.
- `modules/ffg-destiny-tracker.js` — `_prepareContext` (line 56) returns the initial value; `_activateListeners(html)` (line 100) binds the GM `[+]`.

**Edit:**
- Template:
  ```hbs
  <section id="ffg-campaign-day"><span class="ffg-campaign-day-value">{{localize "SWFFG.Codex.CritTrauma.Day"}} {{campaignDay}}</span>{{#if isGM}}<a class="ffg-campaign-day-advance">[+]</a>{{/if}}</section>
  ```
- `_prepareContext`: add `campaignDay: game.settings.get("starwarsffg","campaignDay")` to the returned object (initial render only — the widget never re-renders; path 2 updates the value span in place).
- `_activateListeners`: bind `.ffg-campaign-day-advance` click → `DialogV2.wait` prompt (default 7, floored) → `game.settings.set("starwarsffg","campaignDay", current + n)`. The handler does **not** touch the DOM (the setting's `onChange` from Stage 4 rewrites `.ffg-campaign-day-value`, leaving the `[+]` node/listener intact — design §3.4/§3.6).

**Verification:**
- `node --check modules/ffg-destiny-tracker.js`; read-back the template section; grep for `ffg-campaign-day-value` and `ffg-campaign-day-advance`.
- Live: readout shows "Day 1"; GM sees `[+]`, a player does not; clicking `[+]` and entering 7 changes the readout to "Day 8" **without** the widget re-rendering, and the `[+]` still works afterwards (listener survived).

---

## Stage 9 — GM bridge op `ffgCritRecovery` (server-side authorization + availability)

**File:** `modules/helpers/gm-bridge.js` — `registerGMBridge()` (line 100); add a new branch in the `game.socket.on(FFG_SOCKET, …)` handler, mirroring the `MESSAGE_EVENT` authorization block (lines 106–129). The `APPLY_EVENT` branch (131–140) does **no** requestor auth, so the new op must self-authorize (design §3.3.3).

**Edit:** add, inside the handler (which already early-returns unless active GM):
```js
if (data?.event === "ffgCritRecovery") {
  const actor = await fromUuid(data.actorUuid);
  const item = actor?.items.get(data.itemId);
  if (!actor || !item) return;
  const requestor = game.users.get(requestorId);
  if (!actor.testUserPermission(requestor, "OBSERVER")) {   // OBSERVER, not LIMITED (crit card hidden from limited)
    CONFIG.logger?.warn?.("FFG GM bridge: refused unauthorized crit-recovery", { requestorId }); return;
  }
  const map = { medicine: { type: "criticalinjury", field: "system.medicineLastAttemptDay" },
                mechanics: { type: "criticaldamage", field: "system.mechanicsLastAttemptDay" } };
  const m = map[data.path];
  if (!m || item.type !== m.type) return;
  if (data.path === "mechanics" && !game.settings.get("starwarsffg","vehicleCritWeeklyLimit")) return;
  const day = Math.floor(Number(game.settings.get("starwarsffg","campaignDay")) || 0);
  const stamp = item.system?.[m.field.split(".")[1]] ?? null;   // live stamp
  if (!(stamp === null || day >= Math.floor(Number(stamp)) + 7)) return;   // server-side availability re-check
  await item.update({ [m.field]: day });
  return;
}
```
Membership + OBSERVER auth + path↔type (+ house-rule) + server availability re-check + field whitelist + GM-derived day (design §3.3.3 / New Finding 1).

**Verification:**
- `node --check modules/helpers/gm-bridge.js`; grep for `ffgCritRecovery`, `testUserPermission`, `"OBSERVER"`.
- Live: as a non-owner ally with ≥OBSERVER on another PC, click "Failed" → the GM stamps `medicineLastAttemptDay`; as a LIMITED user the control is not even visible; a forged emit for an already-cooling injury is rejected (no stamp change).

---

## Stage 10 — CSS (hand-edited; no compile)

**Files (edit directly — NEVER run gulp/npm compile; memory `css-is-hand-maintained`):**
- `styles/cdx.css` — the crit **card** controls (`.cdx-inj-resilience`, `.cdx-inj-medfail`, `.cdx-inj-mechfail`, `.cdx-inj-cooldown`). Loaded by Codex sheets regardless of theme, so this is the only place card styling is needed.
- `styles/starwarsffg.css` **and** `styles/mandar.css` — the **global** `#ffg-campaign-day` readout, duplicated into BOTH because the active `mandar` theme disables `starwarsffg.css` (memory `active-theme-is-mandar`; `mandarBeskarAstromech.css` imports `mandar.css`, so no third copy). Design §5(a).

**Edit:** minimal, theme-consistent rules — button sizing/hover for the card controls; muted style for cooldown text; compact inline layout + `[+]` affordance for the readout (match the neighbouring `.destiny-points` chrome).

**Verification:**
- Grep each file for the new selectors; confirm `#ffg-campaign-day` rules are byte-identical in `starwarsffg.css` and `mandar.css`.
- Live: card controls are styled on a Codex sheet under the mandar theme; the Day readout is styled in the Destiny Tracker under mandar (and, if toggled, under the default theme).

---

## Stage 11 — Live-in-Foundry verification checklist (final)

Hard-reload the world as GM first (modules are cached; reload to load new code — memory `run-functional-tests-console`). Then:

1. **Day readout & advance:** Destiny Tracker shows "Day N"; GM sees `[+]`, a player does not. GM clicks `[+]`, enters 7 → readout jumps +7 in place (no widget flicker) and `[+]` still works.
2. **Live countdown refresh:** with an open PC Codex sheet showing "Self-heal in 5 days", GM advances the day → the open sheet re-renders and the countdown drops, no manual reload.
3. **Resilience appears / auto-resolves:** on a fresh crit (owner), "Roll Resilience" shows; clicking it rolls once, and on **net success ≥ 1** the crit is deleted, on failure it stamps and flips to "Self-heal in 7 days". Double-clicking does not launch two rolls (in-flight guard + live re-check).
4. **Missing skill safety:** on an actor without a Resilience skill, clicking "Roll Resilience" warns and does **not** burn the week (no stamp written).
5. **Medicine marker:** "Failed" stamps `medicineLastAttemptDay` → "Medicine in 7 days"; a **failed Resilience** attempt leaves Medicine still available (decoupled). A non-owner ally with ≥OBSERVER can mark it (forwarded to GM); a LIMITED user cannot see it.
6. **Vehicle gating:** vehicle Mechanics control is absent while `vehicleCritWeeklyLimit` is Off; enable it in the Codex settings menu → control appears; marking "Failed" stamps `mechanicsLastAttemptDay`.
7. **Non-owner cannot self-heal:** viewing another PC's sheet without ownership, the Resilience button is not rendered (`canSelfHeal` false) and the handler re-check would refuse anyway.
8. **`receivedDay` origin:** a newly applied/added crit carries the current `campaignDay`; rewinding the day below a stamp shows "in 7 days", never a negative.

**Optional headless assertion:** add to `ffg-tests.js` a pure test of the availability predicate (null → attemptable; `stamp+7===day` boundary; rewound/future clamp at 7). Do not gate the feature on CI.

---

## Stage dependency summary

```
1 schema ─┬─ 2 helper ─┐
          └─ 5 stamp    ├─ 6 markup ─ 7 handlers ─ 9 GM bridge ─ 11 live test
3 loc ─ 4 settings ─────┘                 │
                     4 also ─ 8 readout ───┘
10 CSS depends on 6 (card classes) + 8 (readout id); can land last.
```
- **2, 5, 7** read `campaignDay`, so **4** must be loaded before they *execute* (all execute post-init/at render, so any load order is parse-safe; run them in the numbered order for semantic safety).
- **7** emits `ffgCritRecovery`; **9** answers it — between 7 and 9 the non-owner marker is a harmless no-op, the owner path already works.
- **8** completes live-refresh path 2 (the value span the Stage-4 `onChange` targets); path 1 works from Stage 4.

## Rollback / risk note

- **Reversibility:** every stage is an additive edit on branch `crit-trauma-counter`; revert a stage with `git checkout -- <file>` (or a `git revert` of its commit). No destructive data migration — the new nullable fields default `null` and are written only when a crit is stamped, so removing the feature leaves inert `system.*` fields that no code reads.
- **Descoped concurrency (design §2, New Finding 2):** there is intentionally **no** cross-client atomic "one attempt per week" guarantee and **no** GM serialized coordinator. The in-flight guard + live re-check + GM-side availability re-check stop double-clicks and stale-render attempts; a genuine *simultaneous same-day* two-client Resilience race can double-roll one weekly attempt. This is an **accepted residual risk** for a co-located table (single healer per crit, GM present) — do not add a distributed lock without a new decision.
- **Rollback correctness:** the handler never rolls a day field back based only on equality with `currentDay` (would erase another client's same-day stamp); all fallible non-dice work happens before the stamp, and post-dice-evaluation ChatMessage failure keeps the attempt (design §3.3.1).
- **Git/account:** any push targets the `YeNov/StarWarsFFG` fork only (per project CLAUDE.md and memory `push-as-yenov-account`); never the upstream `StarWarsFoundryVTT/StarWarsFFG`.
