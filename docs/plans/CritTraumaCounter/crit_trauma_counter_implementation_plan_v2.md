# Implementation Plan — Crit-Trauma Weekly Recovery Counter (v2)

> Design: `docs/plans/CritTraumaCounter/crit_trauma_counter_design_doc_v3.md` (APPROVED).
> Constraints: `docs/plans/CritTraumaCounter/requirements_brief.md`.
> Supersedes plan v1; incorporates the executability review (`crit_trauma_counter_implementation_plan_review_v1.md`).
> Repo: `starwarsffg` Foundry VTT system — **git** (not Perforce), branch `crit-trauma-counter`, `YeNov/StarWarsFFG` fork.
> **No build step:** Foundry loads the ES modules directly and **CSS is hand-maintained** — NEVER run `gulp css` / `npm run compile`. All item writes use **`system.*`** keys. Feature is **Codex-only, card-scoped**.
> Shell is **Windows PowerShell 5.1** (`&&` is a parse error — see the verification convention below). Line numbers re-confirmed against source 2026-07-19.

## Verification conventions (apply to every stage)

- **JS syntax:** `node --check <file.js>` per file. **PowerShell 5.1 has no `&&`** — run each check on its own line, or chain PowerShell-safely: `node --check A.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --check B.js`.
- **JSON:** `node -e "require('./path.json')"` (throws on trailing commas / malformed JSON). **Note:** Node's `JSON.parse` silently accepts *duplicate* keys (keeps the last), so this does **not** prove uniqueness — pair it with per-key presence/count assertions (`Select-String -Pattern '"KEY"' file | Measure-Object` expecting count 1).
- **Edit-present assertions:** grep/read-back that each new symbol/markup exists and is well-formed (balanced `{{#with}}`/`{{/with}}`, tag nesting).
- **Headless unit tests:** the repo has a Mocha harness — suites are `*.test.js` files each exporting `XxxTests(suite, suiteInstance, Test, chai)` and imported+registered in `tests/ffg-tests.js:4-13,41-50`. Run as GM in the F12 console **after a hard reload** (modules are cached — memory `run-functional-tests-console`): `const m = await import('/systems/starwarsffg/tests/ffg-tests.js'); const r = await new m.default().getData(); console.log(r.fail);` (empty `fail` array = pass; errors are in mocha's JSON, not on `r.fail[i]` enumerable props).
- **Live-in-Foundry:** the Stage 11 checklist (hard-reload first).

Each stage leaves the system **loadable** (parse-valid module set; new helpers/handlers execute only post-`init`/at render).

---

## Stage 1 — DataModel day fields (schema first)

**Files:**
- `modules/data/models/item/criticalinjury.js` — `CriticalInjuryDataModel.defineSchema()` (returns `...super.defineSchema()` + `min`/`max`/`severity`).
- `modules/data/models/item/criticaldamage.js` — `CriticalDamageDataModel.defineSchema()` (same shape).

**Edit:**
- `criticalinjury.js` — add three fields:
  ```js
  receivedDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  resilienceLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  medicineLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  ```
- `criticaldamage.js` — add ONE field (no rest gate / no split on vehicles; design §3.1):
  ```js
  mechanicsLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
  ```

**Verification (PowerShell-safe):**
```
node --check modules/data/models/item/criticalinjury.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --check modules/data/models/item/criticaldamage.js
```
- Grep both files for the new field names.
- No migration: existing crit sources lacking the keys prepare as `null` (design §3.1).

---

## Stage 2 — Availability calc as a dependency-free module + Handlebars wrapper

**Rationale for the module split:** the review noted a helper nested inside `swffg-main.js` cannot be imported by a headless test. Extract the pure math into its own dependency-free module so it is both reusable (helper + handler live re-check + test) and unit-testable.

**Files:**
- **New** `modules/helpers/crit-availability.js` — pure function, no `game`/DOM access.
- `modules/swffg-main.js` — Handlebars helper registration, immediately after `renderMultiple` (line 1250; `iff` at 1217).

**Edit:**
- `modules/helpers/crit-availability.js`:
  ```js
  // Pure, dependency-free: no game/settings/DOM access — safe to unit-test headless.
  export function availFor(stamp, currentDay) {
    if (stamp === null || stamp === undefined) return { attemptable: true, daysLeft: 0 };
    const s = Math.floor(Number(stamp));
    return { attemptable: currentDay >= s + 7, daysLeft: Math.min(7, Math.max(0, s + 7 - currentDay)) };
  }
  // system = item.system; currentDay = floored campaignDay; vehicleLimit/canSelfHeal are resolved by the caller.
  export function computeCritAvailability(system, currentDay, vehicleLimit, canSelfHeal) {
    const sys = system ?? {};
    const resStamp = sys.resilienceLastAttemptDay ?? sys.receivedDay ?? null;
    return {
      resilience: { ...availFor(resStamp, currentDay), canSelfHeal: !!canSelfHeal },
      medicine: availFor(sys.medicineLastAttemptDay ?? null, currentDay),
      mechanics: vehicleLimit ? availFor(sys.mechanicsLastAttemptDay ?? null, currentDay) : null,
    };
  }
  ```
- `swffg-main.js` — import and register the thin wrapper (reads `game.*` only at invocation, i.e. render time, after Stage 4 registers the settings):
  ```js
  import { computeCritAvailability } from "./helpers/crit-availability.js";
  // ...
  Handlebars.registerHelper("critAvailability", function (item) {
    const currentDay = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
    const vehicleLimit = game.settings.get("starwarsffg", "vehicleCritWeeklyLimit");
    const canSelfHeal = !!(item?.parent?.isOwner || game.user?.isGM);
    return computeCritAvailability(item?.system, currentDay, vehicleLimit, canSelfHeal);
  });
  ```

**Verification:**
- `node --check modules/helpers/crit-availability.js` (own line), then `node --check modules/swffg-main.js`.
- Grep `swffg-main.js` for `critAvailability` and the import; grep the new module for `computeCritAvailability`.
- The unit test for `availFor`/`computeCritAvailability` (null→attemptable; `stamp+7===currentDay` boundary; future stamp and rewound stamp both clamp `daysLeft` at 7; `resilienceLastAttemptDay ?? receivedDay` precedence) is authored in **Stage 2-tests** below and run via the harness command.

### Stage 2-tests — headless suite for the availability math

**Files:**
- **New** `tests/crit-trauma-counter.test.js` — exports `CritTraumaCounterTests(suite, suiteInstance, Test, chai)` (same signature as `tests/codex-schemes.test.js`), importing from `../modules/helpers/crit-availability.js`.
- `tests/ffg-tests.js` — add the import (beside lines 4-13) and the registration call (beside 41-50).

**Edit:** cases — `availFor(null, 5)` → `{attemptable:true,daysLeft:0}`; `availFor(0, 7)` → attemptable (boundary `0+7===7`); `availFor(3, 5)` → `{attemptable:false,daysLeft:5}`; rewind `availFor(100, 5)` → `daysLeft:7` (clamped, not 102); `computeCritAvailability({receivedDay:5}, 5, false, true)` → `resilience.attemptable:false, resilience.daysLeft:7` (fresh crit rest gate), `medicine.attemptable:true`, `mechanics:null`; with `vehicleLimit=true` and `{mechanicsLastAttemptDay:null}` → `mechanics.attemptable:true`.

**Verification:** run the harness console command; `r.fail` contains no entry whose parent title is `Crit-Trauma Counter`. (Baseline is 47 pass / 2 known-stale fails — memory `run-functional-tests-console`; assert the new suite adds only passes.)

---

## Stage 3 — Localization strings

**Files:**
- `lang/en.json` — beside the existing `SWFFG.Settings.codex.*` keys (currently 531–536, ending at `AdvantageHealsStrain.Hint`). Setting Name/Hint live here, NOT in `lang/codex` (design §3.8, verified).
- `lang/codex/en.json` — beside the existing `SWFFG.Codex.StrainRecovery.*` keys.

**Edit:**
- `lang/en.json`:
  ```json
  "SWFFG.Settings.codex.VehicleCritWeeklyLimit.Name": "Vehicle Crit Weekly Limit (House Rule)",
  "SWFFG.Settings.codex.VehicleCritWeeklyLimit.Hint": "Apply the once-per-week Mechanics cooldown to vehicle critical hits. RAW allows unlimited Mechanics retries, so this is Off by default."
  ```
- `lang/codex/en.json` — `SWFFG.Codex.CritTrauma.*`: `Day`, `RollResilience`, `Failed`, `SelfHealIn` (`{days}`), `MedicineIn` (`{days}`), `MechanicsIn` (`{days}`), `AdvancePromptTitle`, `AdvancePromptLabel`, `NoResilienceSkill`, `RollFailedNoMessage`, `AttemptUnavailable`.

**Verification:**
```
node -e "require('./lang/en.json')"
node -e "require('./lang/codex/en.json')"
```
- **Per-key count assertions** (uniqueness — `require` alone would silently keep a duplicate's last value): for each new key, `Select-String -Path lang\en.json -SimpleMatch '"SWFFG.Settings.codex.VehicleCritWeeklyLimit.Name"' | Measure-Object` expects `Count = 1`; likewise every `SWFFG.Codex.CritTrauma.*` key in `lang\codex\en.json`.

---

## Stage 4 — Settings + live-refresh path 1 (re-render helper)

**Files:**
- `modules/actors/codex-sheets.js` — add exported `refreshOpenCodexSheets()` (self-contained, near the top-level exports; imported by `settings-helpers.js` — cycle-safe direction, design §3.6).
- `modules/settings/settings-helpers.js` — register two settings near `dPoolLight` (line 202) / `codexAdvantageHealsStrain` (line 405); import `refreshOpenCodexSheets`; the `dPoolLight` `onChange` DOM-rewrite precedent is at lines 213-215.
- `modules/settings/ui-settings.js` — `codexSettings._prepareContext()` allow-list (lines 306–311).

**Edit:**
- `codex-sheets.js`:
  ```js
  export function refreshOpenCodexSheets() {
    for (const app of foundry.applications.instances.values()) {
      if (app.rendered && (app instanceof CodexActorSheet || app instanceof CodexAdversarySheet)) app.render();
    }
  }
  ```
- `settings-helpers.js` — `import { refreshOpenCodexSheets } from "../actors/codex-sheets.js";` then:
  ```js
  game.settings.register("starwarsffg", "campaignDay", {
    name: "SWFFG.Codex.CritTrauma.Day", scope: "world", config: false, default: 1, type: Number,
    onChange: () => {
      refreshOpenCodexSheets();                                   // path 1
      const el = document.querySelector("#ffg-campaign-day .ffg-campaign-day-value");   // path 2 (null-guarded)
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
- `ui-settings.js` — add to the allow-list array (306–311): `"starwarsffg.vehicleCritWeeklyLimit",`.

**Verification:**
- `node --check` each of the three files (separate lines).
- Grep `settings-helpers.js` for both registrations; grep `ui-settings.js` for `starwarsffg.vehicleCritWeeklyLimit`.
- Live (after reload): `game.settings.get("starwarsffg","campaignDay")` → `1`; the Codex settings menu now lists the vehicle toggle.

---

## Stage 5 — `receivedDay` stamping in the existing pre-create hook

**File:** `modules/swffg-main.js` — `registerActorItemValidationHooks()` (function line 76; `Hooks.on("preCreateItem", …)` line 77; the `criticalinjury`-placement guard ~102–105; called at line 194). **Do NOT add a second hook** (design §3.7).

**Edit:** inside the existing callback, after the placement-validation returns:
```js
if (item.type === "criticalinjury" && item.parent?.documentName === "Actor" && (item.system?.receivedDay === null || item.system?.receivedDay === undefined)) {
  const day = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
  item.updateSource({ "system.receivedDay": day });
}
```
Stamp-iff-null: a copied crit with a non-null `receivedDay` keeps its timeline (design §3.7). `criticaldamage` is NOT stamped.

**Verification:**
- `node --check modules/swffg-main.js`; grep for `receivedDay`.
- Live **UI creation** (both supported paths): with `campaignDay` at e.g. 5, use **Apply Crit** on a PC and the manual **`+`** add — both new crits read `system.receivedDay === 5`.
- Live **copy semantics via a supported console op** (actor-to-actor crit *drag* is NOT a supported UI path — the DragDrop `dragSelector` is `.items-list .item, .cdx-card` and `_onTransferItemDragStart` allows only weapon/armour/gear, actor-sheet-ffg.js:1375-1379 / 2161-2174, verified). Instead, in the F12 console:
  ```js
  const src = someActor.items.find(i => i.type === "criticalinjury");
  const obj = src.toObject(); obj.system.receivedDay = 99;         // known non-null
  const [copy] = await otherActor.createEmbeddedDocuments("Item", [obj]);
  console.log(copy.system.receivedDay);                            // expect 99 (retained, NOT re-stamped)
  ```

---

## Stage 6 — Crit-card markup (character + vehicle)

**Files:**
- `templates/parts/codex/cdx-injuries.html` — per-crit `<div class="item cdx-injury" data-item-id="{{item._id}}">` (line 4; shared by `codex-character.html` line 131 and `codex-minion.html`). This pane sits inside `codex-character.html`'s `{{#unless limited}}` (opens line 51, **closes line 198** — the `{{/unless}}` at 135 closes an inner `cdxCombinedInventory` block), so LIMITED users never see these controls (OBSERVER floor for Stage 9).
- `templates/actors/codex/codex-vehicle.html` — the `criticaldamage` `.cdx-injury` block (lines 137–141, inside the `damage` pane at 134).

**Edit:** wrap each card's controls in `{{#with (critAvailability item) as |avail|}} … {{/with}}` and add alongside `.cdx-card-ctl`:
- Resilience — only when `avail.resilience.canSelfHeal`: if `avail.resilience.attemptable`, `<button class="cdx-inj-resilience" data-item-id="{{item._id}}">{{localize "SWFFG.Codex.CritTrauma.RollResilience"}}</button>`; else `<span class="cdx-inj-cooldown">{{localize "SWFFG.Codex.CritTrauma.SelfHealIn" days=avail.resilience.daysLeft}}</span>`.
- Medicine — always (permitted viewers): if `avail.medicine.attemptable`, `<button class="cdx-inj-medfail" data-item-id="{{item._id}}">{{localize "SWFFG.Codex.CritTrauma.Failed"}}</button>`; else `<span class="cdx-inj-cooldown">…MedicineIn days=avail.medicine.daysLeft…</span>`.
- Vehicle (`codex-vehicle.html`): a single `.cdx-inj-mechfail` / "Mechanics in N days", rendered **only when `avail.mechanics`** is non-null.

**Expected fresh-crit state (corrected — Major):** because Stage 5 stamps a new crit's `receivedDay = currentDay` and Resilience availability uses `resilienceLastAttemptDay ?? receivedDay`, a **freshly created** PC crit shows **"Self-heal in 7 days"** (the rest gate) with the **Medicine "Failed" marker immediately available** (Medicine has no rest gate). "Roll Resilience" appears only once `campaignDay >= receivedDay + 7`.

**Verification:**
- Read-back: balanced `{{#with}}`/`{{/with}}`, every button carries `data-item-id`, no stray tags.
- Live: on a PC Codex sheet a fresh crit shows **"Self-heal in 7 days"** + **"Failed"** (not "Roll Resilience"); on a vehicle the Mechanics control is absent while `vehicleCritWeeklyLimit` is Off and appears when On.

---

## Stage 7 — Card handlers in `_cdxActivate` (+ client-side bridge helper)

**Files:**
- `modules/actors/codex-sheets.js` — `_cdxActivate(html)` (line 467); `close()` (line 430) needs **no** teardown (elements recreated each render). Reuse `_cdxApplyStrainRecovery` / `buildPool` (lines 1371–1443).
- `modules/helpers/gm-bridge.js` — add the **client-side** emit helper (GM-side listener branch is Stage 9).

**Edit:**
- `gm-bridge.js` client helper (mirrors `applyToTargetActor`'s contract, gm-bridge.js:62):
  ```js
  export async function applyCritRecoveryAttempt(actor, itemId, path) {
    if (!game.users.activeGM) { ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM")); return false; }
    game.socket.emit("system.starwarsffg", { event: "ffgCritRecovery", actorUuid: actor.uuid, itemId, path });
    return "forwarded";
  }
  ```
- `_cdxActivate` — bind per-render handlers (resolve crit via `event.target.closest(".cdx-injury").dataset.itemId`; `currentDay = Math.floor(Number(game.settings.get("starwarsffg","campaignDay"))||0)`):

  **`.cdx-inj-resilience`** — strict ordering so **no locally-constructible prerequisite runs after the stamp** (Major fix). Wrap in `try { … } finally { <clear in-flight/re-enable> }`:
  1. In-flight guard: if already in-flight for this item, return; else set it + disable the button.
  2. Permission re-check: `item.parent?.isOwner || game.user.isGM`, else abort.
  3. Live availability re-check from the live item's stamps (`availFor(item.system.resilienceLastAttemptDay ?? item.system.receivedDay ?? null, currentDay).attemptable`); if not attemptable, `ui.notifications.warn(localize AttemptUnavailable)` and abort.
  4. **Build ALL non-dice prerequisites BEFORE any stamp:** validate the actor has a **Resilience** skill (else `ui.notifications.warn(localize NoResilienceSkill)` and abort — no stamp); build the `DicePoolFFG`; render the expression; **construct the roll**:
     ```js
     const roll = new game.ffg.RollFFG(pool.renderDiceExpression());   // may throw here → happens BEFORE the stamp
     ```
  5. **Stamp the reservation:** `await item.update({ "system.resilienceLastAttemptDay": currentDay });`
  6. **Roll + read back, preserving the stamp on any post-reservation failure:**
     ```js
     let message;
     try {
       message = await roll.toMessage({
         speaker: { actor }, flavor,
         flags: { starwarsffg: { critTraumaRecovery: { actorUuid: actor.uuid, itemId, path: "resilience" } } },
       });
     } catch (err) {
       CONFIG.logger?.warn?.("Crit-trauma: resilience roll message failed post-reservation", err);
       ui.notifications.warn(game.i18n.localize("SWFFG.Codex.CritTrauma.RollFailedNoMessage"));
       return;   // KEEP the stamp — roll.js:353 evaluates the dice, :398 creates the message; a genuine attempt occurred, no free reroll
     }
     const net = message.rolls?.[0]?.ffg?.success ?? 0;   // net of failures (roll.js:188-203)
     ```
  7. Resolve: `net >= 1` → `await item.delete()`; else leave the stamp (attempt burned). **No equality-based rollback anywhere.**

  **`.cdx-inj-medfail`** — live re-check `availFor(item.system.medicineLastAttemptDay ?? null, currentDay).attemptable` (abort if not); if `item.isOwner` → `item.update({ "system.medicineLastAttemptDay": currentDay })`; else `await applyCritRecoveryAttempt(this.actor, itemId, "medicine")`.

  **`.cdx-inj-mechfail`** — **explicit house-rule + type gate on the owner-local path** (Minor fix; the owner bypasses the GM bridge, and the button can be stale mid-refresh): abort unless `game.settings.get("starwarsffg","vehicleCritWeeklyLimit") === true`; abort unless the live `item.type === "criticaldamage"`; then live re-check `availFor(item.system.mechanicsLastAttemptDay ?? null, currentDay).attemptable`; if `item.isOwner` → `item.update({ "system.mechanicsLastAttemptDay": currentDay })`; else `await applyCritRecoveryAttempt(this.actor, itemId, "mechanics")`.
- Import `applyCritRecoveryAttempt` and `availFor` into `codex-sheets.js`.

**Verification:**
- `node --check` both files (separate lines); grep `codex-sheets.js` for `cdx-inj-resilience`, `cdx-inj-medfail`, `cdx-inj-mechfail`, `critTraumaRecovery`, and that `new game.ffg.RollFFG(` appears **before** the `resilienceLastAttemptDay` update in source order; grep `gm-bridge.js` for `applyCritRecoveryAttempt` / `ffgCritRecovery`.
- Coherence: until Stage 9 the non-owner marker emits a socket event no GM branch answers (harmless no-op); the owner path works.

---

## Stage 8 — Destiny Tracker Day readout (completes live-refresh path 2)

**Files:**
- `templates/ffg-destiny-tracker.html` — add a `<section id="ffg-campaign-day">` sibling of `#destinyLight`/`#destinyDark`.
- `modules/ffg-destiny-tracker.js` — `_prepareContext` (line 56); `_activateListeners(html)` (line 100).

**Edit:**
- Template:
  ```hbs
  <section id="ffg-campaign-day"><span class="ffg-campaign-day-value">{{localize "SWFFG.Codex.CritTrauma.Day"}} {{campaignDay}}</span>{{#if isGM}}<a class="ffg-campaign-day-advance">[+]</a>{{/if}}</section>
  ```
- `_prepareContext`: add `campaignDay: game.settings.get("starwarsffg","campaignDay")` to the returned object (initial render only; the widget never re-renders — path 2 updates the value span in place).
- `_activateListeners`: bind `.ffg-campaign-day-advance` click → `DialogV2.wait` prompt (title/label localized, default 7, floored) → `game.settings.set("starwarsffg","campaignDay", current + n)`. The handler does **not** touch the DOM (Stage 4's `onChange` rewrites `.ffg-campaign-day-value`, leaving the `[+]` node/listener intact — design §3.4/§3.6).

**Verification:**
- `node --check modules/ffg-destiny-tracker.js`; read-back the template; grep for `ffg-campaign-day-value` and `ffg-campaign-day-advance`.
- Live: readout "Day 1"; GM sees `[+]`, player does not; `[+]` → enter 7 → readout "Day 8" with **no** widget re-render, and `[+]` still works.

---

## Stage 9 — GM bridge op `ffgCritRecovery` (server-side authorization + availability)

**File:** `modules/helpers/gm-bridge.js` — `registerGMBridge()` (line 100); add a branch in `game.socket.on(FFG_SOCKET, …)` mirroring the `MESSAGE_EVENT` auth block (106–129). The `APPLY_EVENT` branch (131–140) does **no** requestor auth, so the new op self-authorizes (design §3.3.3).

**Edit:** inside the handler (which early-returns unless active GM):
```js
if (data?.event === "ffgCritRecovery") {
  const actor = await fromUuid(data.actorUuid);
  const item = actor?.items.get(data.itemId);
  if (!actor || !item) return;
  const requestor = game.users.get(requestorId);
  if (!actor.testUserPermission(requestor, "OBSERVER")) {           // OBSERVER, not LIMITED (crit card hidden from limited)
    CONFIG.logger?.warn?.("FFG GM bridge: refused unauthorized crit-recovery", { requestorId }); return;
  }
  const map = { medicine: { type: "criticalinjury", field: "medicineLastAttemptDay" },
                mechanics: { type: "criticaldamage", field: "mechanicsLastAttemptDay" } };
  const m = map[data.path];
  if (!m || item.type !== m.type) return;
  if (data.path === "mechanics" && !game.settings.get("starwarsffg","vehicleCritWeeklyLimit")) return;
  const day = Math.floor(Number(game.settings.get("starwarsffg","campaignDay")) || 0);
  const stamp = item.system?.[m.field] ?? null;                     // live stamp
  if (!(stamp === null || day >= Math.floor(Number(stamp)) + 7)) return;   // server-side availability re-check
  await item.update({ [`system.${m.field}`]: day });
  return;
}
```

**Verification:**
- `node --check modules/helpers/gm-bridge.js`; grep for `ffgCritRecovery`, `testUserPermission`, `"OBSERVER"`.
- **Live two-client forged-request procedure** (requires a second client because `requestorId` comes from Foundry's socket transport):
  1. GM: pick a PC actor; note `const actorUuid = actor.uuid` and a crit `itemId` (`actor.items.find(i=>i.type==='criticalinjury').id`). Ensure that injury's `medicineLastAttemptDay` is `null`.
  2. Grant a **second user OBSERVER** on that actor. As that user (own client console):
     `game.socket.emit('system.starwarsffg', {event:'ffgCritRecovery', actorUuid:'<uuid>', itemId:'<id>', path:'medicine'});`
     → **expected:** GM stamps `medicineLastAttemptDay = <campaignDay>` (GM re-reads the item to confirm before/after); the UI marker on that user's sheet flips to "Medicine in 7 days" on next render.
  3. Lower that user to **LIMITED**; repeat the emit → **expected:** GM logs the "refused unauthorized crit-recovery" warning and the field is **unchanged** (and the user cannot even see the marker, per `{{#unless limited}}`).
  4. Restore OBSERVER; with the stamp now **cooling** (just set this week), repeat the emit → **expected:** the server availability re-check rejects it and the field is **unchanged** (no cooldown extension).

---

## Stage 10 — CSS (hand-edited; no compile)

**Files (edit directly — NEVER gulp/npm compile; memory `css-is-hand-maintained`):**
- `styles/cdx.css` — crit **card** controls (`.cdx-inj-resilience`, `.cdx-inj-medfail`, `.cdx-inj-mechfail`, `.cdx-inj-cooldown`). Loaded by Codex sheets regardless of theme.
- `styles/starwarsffg.css` **and** `styles/mandar.css` — the **global** `#ffg-campaign-day` readout. Both are needed because the active `mandar` theme disables `starwarsffg.css`; `mandarBeskarAstromech.css` imports `mandar.css`, so it inherits the mandar copy (memory `active-theme-is-mandar`; design §5(a)).

**Edit:** theme-consistent rules — button sizing/hover for card controls; muted cooldown text; compact inline layout + `[+]` affordance for the readout (harmonize with the neighbouring `.swffg-destiny` / `.destiny-points` chrome, which legitimately **differs** between the two stylesheets).

**Verification (selector COVERAGE, not byte-identical — Minor fix):**
- Grep `cdx.css` for the four card selectors.
- Confirm both `styles/starwarsffg.css` and `styles/mandar.css` contain rules for `#ffg-campaign-day` / `.ffg-campaign-day-value` / `.ffg-campaign-day-advance` (same **selector coverage**; declarations may differ to fit each theme's chrome).
- Live: the readout is visible, correctly laid out, the `[+]` is clickable, and the card controls are styled under **all three** themes — default (`starwarsffg.css`), **mandar**, and **mandarBeskarAstromech** (inherits mandar).

---

## Stage 11 — Live-in-Foundry verification checklist (final)

Hard-reload the world as GM first (modules are cached). Then:

1. **Day readout & advance:** Destiny Tracker shows "Day N"; GM sees `[+]`, player does not. `[+]` → enter 7 → readout +7 in place (no flicker) and `[+]` still works.
2. **Fresh-crit initial state (rest gate):** apply/`+`-add a crit on a PC → the card shows **"Self-heal in 7 days"** and an **available "Failed"** (Medicine) marker; `item.system.receivedDay` equals the current `campaignDay` (Stage 11.8's origin check). "Roll Resilience" is **not** shown yet.
3. **Resilience unlocks after a week, both branches:** create **two** fresh crits (A and B). Advance `campaignDay` by 7 → both now show **"Roll Resilience"**.
   - **Success→delete:** click A's button until a roll with **net success ≥ 1** occurs → A is deleted. (Repeat / advance another week if the first roll fails.)
   - **Failure→stamp:** on B, on a **net-fail** roll → B stamps and flips to "Self-heal in 7 days". Double-clicking B does not launch two rolls (in-flight guard + live re-check).
4. **Missing-skill safety:** on an actor without a Resilience skill, after advancing past the gate, clicking "Roll Resilience" warns and does **not** stamp (week not burned).
5. **Decoupling:** a failed Resilience attempt leaves that injury's Medicine "Failed" still available.
6. **Live countdown refresh:** with a Codex sheet open showing "Self-heal in 5 days", GM advances the day → the open sheet re-renders and the countdown drops, no manual reload.
7. **Medicine marker + non-owner path:** "Failed" stamps `medicineLastAttemptDay` → "Medicine in 7 days"; a non-owner ally with ≥OBSERVER can mark it (forwarded to GM, Stage 9 procedure); a LIMITED user cannot see it.
8. **Vehicle gating:** vehicle Mechanics control absent while `vehicleCritWeeklyLimit` is Off; enable it in the Codex settings menu → control appears; "Failed" stamps `mechanicsLastAttemptDay`; an owner-local click while the setting is Off does **not** stamp (explicit re-check).
9. **Non-owner cannot self-heal:** viewing another PC's sheet without ownership, the Resilience button is not rendered (`canSelfHeal` false) and the handler re-check refuses anyway.
10. **Rewind clamp:** lower `campaignDay` below a stamp → countdown shows "in 7 days", never negative.

**Headless:** the Stage 2-tests suite (`tests/crit-trauma-counter.test.js`) run via the harness console command asserts the availability math (including the rewind clamp and the fresh-crit rest gate) without a live world. Not gated on CI.

---

## Stage dependency summary

```
1 schema ─┬─ 2 helper+module ─ 2-tests ─┐
          └─ 5 stamp                     ├─ 6 markup ─ 7 handlers ─ 9 GM bridge ─ 11 live test
3 loc ─ 4 settings ─────────────────────┘                 │
                     4 also ─ 8 readout ──────────────────┘
10 CSS depends on 6 (card classes) + 8 (readout id); lands last.
```
- **2, 5, 7** read `campaignDay`; **4** must load before they *execute* (all execute post-init/at render, so any load order is parse-safe; keep numbered order for semantic safety).
- **7** emits `ffgCritRecovery`; **9** answers it — between 7 and 9 the non-owner marker is a harmless no-op, the owner path already works.
- **8** completes live-refresh path 2 (the value span Stage 4's `onChange` targets); path 1 works from Stage 4.

## Rollback / risk note

- **Reversibility:** every stage is an additive edit on `crit-trauma-counter`; revert with `git checkout -- <file>` / `git revert`. No destructive migration — the new nullable fields default `null` and are written only when a crit is stamped; removing the feature leaves inert `system.*` fields no code reads.
- **Descoped concurrency (design §2):** there is intentionally **no** cross-client atomic "one attempt per week" guarantee and **no** GM serialized coordinator. The in-flight guard + live re-check + GM-side availability re-check stop double-clicks and stale-render attempts; a genuine *simultaneous same-day* two-client Resilience race can double-roll one weekly attempt — **accepted residual** for a co-located table (single healer per crit, GM present). Do not add a distributed lock without a new decision.
- **Rollback correctness:** all locally-constructible prerequisites (skill validation, pool build, roll construction) run **before** the reservation stamp; a post-reservation `toMessage` failure keeps the stamp (roll.js:353 evaluates before :398 creates — no free reroll); the handler never rolls a day field back on equality with `currentDay` (would erase another client's same-day stamp).
- **Git/account:** any push targets `YeNov/StarWarsFFG` only (project CLAUDE.md, memory `push-as-yenov-account`); never upstream `StarWarsFoundryVTT/StarWarsFFG`.

---

## Review response

| Finding (severity) | Outcome |
|---|---|
| Stages 6/11 — checklist contradicts the Resilience rest gate (**Major**) | **Fixed.** Stage 6 fresh-crit expected state is now **"Self-heal in 7 days" + available Medicine "Failed"**; Stage 11.2 asserts that initial state, then Stage 11.3 advances `campaignDay` +7 and exercises **both** success→delete (crit A) and failure→stamp (crit B) using two injuries. |
| Stage 7 — roll constructed after stamping (**Major**) | **Fixed.** Step 4 now renders the expression and constructs `const roll = new game.ffg.RollFFG(pool.renderDiceExpression())` **before** the step-5 stamp; step 6 wraps `roll.toMessage(...)` in an explicit try/catch that warns and returns **preserving** the stamp; no equality-based rollback. Verified roll.js:353 (evaluate) precedes :398 (create). |
| Stage 7 — owner-local Mechanics skips the house-rule gate (**Minor**) | **Fixed.** `.cdx-inj-mechfail` now re-reads `vehicleCritWeeklyLimit` (abort unless true), validates the live item is `criticaldamage`, and applies the null-or-≥7-days predicate before stamping — on both the local and forwarded paths. |
| Stage 1 — `&&` not runnable in PowerShell 5.1 (**Minor**) | **Fixed.** Verification convention + Stage 1 use separate lines / `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };`. |
| Stages 2/11 — availability test not importable/callable (**Minor**) | **Fixed (option a).** Availability math extracted to dependency-free `modules/helpers/crit-availability.js`; new `tests/crit-trauma-counter.test.js` suite registered in `tests/ffg-tests.js`; exact harness console command given (verified `ffg-tests.js` default-export `getData()` shape and the `XxxTests(...)` suite pattern). |
| Stage 3 — JSON check can't detect duplicate keys (**Minor**) | **Fixed.** Duplicate-key claim dropped; parse check kept; per-key `Select-String … | Measure-Object` count-=1 assertions added for every new key. |
| Stage 5 — actor-to-actor crit drag unsupported (**Minor**) | **Fixed.** Verified DragDrop selector `.items-list .item, .cdx-card` + weapon/armour/gear-only transfer (actor-sheet-ffg.js:1375-1379/2161-2174). Replaced with a console `createEmbeddedDocuments` op from `toObject()` carrying a non-null `receivedDay`; Apply Crit + manual `+` kept as UI creation tests. |
| Stage 9 — forged-request procedure underspecified (**Minor**) | **Fixed.** Exact two-client procedure: UUID/itemId + OBSERVER/LIMITED setup, the player-console `game.socket.emit('system.starwarsffg', {event:'ffgCritRecovery', …})`, before/after field expectation, GM log expectation, and a cooling-stamp repeat confirming no change. |
| Stage 10 — byte-identical CSS is the wrong invariant (**Minor**) | **Fixed.** Requirement changed to same **selector coverage** in both stylesheets (declarations may differ), verified under default, mandar, and mandarBeskarAstromech. |
