# Implementation Plan — Crit-Trauma Weekly Recovery Counter (v3)

> Design: `docs/plans/CritTraumaCounter/crit_trauma_counter_design_doc_v3.md` (APPROVED).
> Constraints: `docs/plans/CritTraumaCounter/requirements_brief.md`.
> Supersedes plan v2; incorporates the second executability review (`crit_trauma_counter_implementation_plan_review_v2.md`) — all 9 prior findings Resolved; this revision fixes the 1 new Major + 1 new Minor.
> Repo: `starwarsffg` Foundry VTT system — **git** (not Perforce), branch `crit-trauma-counter`, `YeNov/StarWarsFFG` fork.
> **No build step:** Foundry loads the ES modules directly and **CSS is hand-maintained** — NEVER run `gulp css` / `npm run compile`. All item writes use **`system.*`** keys. Feature is **Codex-only, card-scoped**.
> Shell is **Windows PowerShell 5.1** (`&&` is a parse error — see the verification convention). Line numbers re-confirmed against source 2026-07-19.

## Single source of truth for the availability math

The null / rewind-clamp / `>= 7-days` predicate has **exactly one implementation**, in the dependency-free module `modules/helpers/crit-availability.js` (Stage 2). Three call sites import from it — the Handlebars wrapper (`swffg-main.js`), the card handlers' live re-check (`codex-sheets.js`), and the **authoritative GM-side re-check** (`gm-bridge.js`) — so the security boundary can never drift from the unit-tested math. No hand-written copy of the predicate exists anywhere else.

## Verification conventions (apply to every stage)

- **JS syntax:** `node --check <file.js>` per file. **PowerShell 5.1 has no `&&`** — run each check on its own line, or chain PowerShell-safely: `node --check A.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --check B.js`.
- **JSON:** `node -e "require('./path.json')"` (throws on trailing commas / malformed JSON). Node's `JSON.parse` silently accepts *duplicate* keys (keeps the last), so pair it with per-key count assertions (`Select-String -SimpleMatch '"KEY"' file | Measure-Object`, expect `Count = 1`).
- **Edit-present assertions:** grep/read-back that each new symbol/markup exists and is well-formed (balanced `{{#with}}`/`{{/with}}`, tag nesting).
- **Headless unit tests:** the repo has a Mocha harness — suites are `*.test.js` files each exporting `XxxTests(suite, suiteInstance, Test, chai)` and imported+registered in `tests/ffg-tests.js:4-13,41-50`. Run as GM in the F12 console **after a hard reload** (modules are cached — memory `run-functional-tests-console`): `const m = await import('/systems/starwarsffg/tests/ffg-tests.js'); const r = await new m.default().getData(); console.log(r.fail, r.pass);` (empty `fail` = pass).
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

**Rationale:** a helper nested inside `swffg-main.js` cannot be imported by a headless test or by the GM bridge. Extract the pure math into its own **import-free** module so it is the single source of truth reused by the Handlebars wrapper (Stage 2), the card handlers (Stage 7), the GM bridge (Stage 9), and the unit suite (Stage 2-tests).

**Files:**
- **New** `modules/helpers/crit-availability.js` — pure functions, no `game`/DOM/other-module imports. Exports **`availFor(stamp, currentDay)`** (the low-level null/rewind/≥7 predicate used directly by the GM bridge and the handler live re-check) **and** the higher-level per-item **`computeCritAvailability(...)`** used by the Handlebars wrapper. Both share the one `availFor` implementation.
- `modules/swffg-main.js` — Handlebars helper registration, immediately after `renderMultiple` (line 1250; `iff` at 1217).

**Edit:**
- `modules/helpers/crit-availability.js`:
  ```js
  // Pure, dependency-free (no imports, no game/settings/DOM access) — safe for headless tests
  // AND for import by gm-bridge.js (cycle-safe: this module imports nothing).
  export function availFor(stamp, currentDay) {
    if (stamp === null || stamp === undefined) return { attemptable: true, daysLeft: 0 };
    const s = Math.floor(Number(stamp));
    return { attemptable: currentDay >= s + 7, daysLeft: Math.min(7, Math.max(0, s + 7 - currentDay)) };
  }
  // system = item.system; currentDay = floored campaignDay; vehicleLimit/canSelfHeal resolved by the caller.
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
- Grep the new module for both `export function availFor` and `export function computeCritAvailability`; grep `swffg-main.js` for `critAvailability` and the import.
- **Downstream import consistency:** confirm the plan wires `availFor` into `codex-sheets.js` (Stage 7) and `gm-bridge.js` (Stage 9) rather than re-deriving the math — grep those files (after their stages) for `from "../helpers/crit-availability.js"` / `from "./crit-availability.js"` and assert no other file contains a literal `+ 7` cooldown predicate.

### Stage 2-tests — headless suite for the availability math

**Files:**
- **New** `tests/crit-trauma-counter.test.js` — exports `CritTraumaCounterTests(suite, suiteInstance, Test, chai)`, importing from `../modules/helpers/crit-availability.js`.
- `tests/ffg-tests.js` — add the import (beside lines 4-13) and the registration call (beside 41-50).

**Edit — use the exact repo suite contract** (matching `tests/codex-schemes.test.js:8-9`):
```js
import { availFor, computeCritAvailability } from "../modules/helpers/crit-availability.js";

export const CritTraumaCounterTests = (suite, suiteInstance, Test, chai) => {
  const _suite = suiteInstance.create(suite, "Crit-Trauma Counter");   // <-- exact parent title used by the verification filter

  _suite.addTest(new Test("null stamp is attemptable now", function () {
    chai.expect(availFor(null, 5)).to.deep.equal({ attemptable: true, daysLeft: 0 });
  }));
  _suite.addTest(new Test("boundary: stamp+7 === currentDay is attemptable", function () {
    chai.expect(availFor(0, 7).attemptable).to.equal(true);
  }));
  _suite.addTest(new Test("mid-cooldown reports remaining days", function () {
    chai.expect(availFor(3, 5)).to.deep.equal({ attemptable: false, daysLeft: 5 });
  }));
  _suite.addTest(new Test("rewind clamps daysLeft at 7 (never overflow)", function () {
    chai.expect(availFor(100, 5).daysLeft).to.equal(7);
  }));
  _suite.addTest(new Test("fresh crit: receivedDay gates Resilience, Medicine open, mechanics null", function () {
    const a = computeCritAvailability({ receivedDay: 5 }, 5, false, true);
    chai.expect(a.resilience.attemptable).to.equal(false);
    chai.expect(a.resilience.daysLeft).to.equal(7);
    chai.expect(a.medicine.attemptable).to.equal(true);
    chai.expect(a.mechanics).to.equal(null);
  }));
  _suite.addTest(new Test("mechanics present only when vehicleLimit on", function () {
    chai.expect(computeCritAvailability({ mechanicsLastAttemptDay: null }, 5, true, false).mechanics.attemptable).to.equal(true);
  }));
};
```
`tests/ffg-tests.js`: `import { CritTraumaCounterTests } from "./crit-trauma-counter.test.js";` and `CritTraumaCounterTests(suite, suiteInstance, Test, chai);`.

**Verification (registration-proof — must assert PASSES, not just absence of failures):**
```js
const m = await import('/systems/starwarsffg/tests/ffg-tests.js');
const r = await new m.default().getData();
const mine = r.pass.filter(t => t.parent?.title === "Crit-Trauma Counter");
const myFails = r.fail.filter(t => t.parent?.title === "Crit-Trauma Counter");
console.log(mine.length, myFails.length);   // EXPECT: 6  0
```
Requiring `mine.length === 6` (the exact case count) **and** `myFails.length === 0` means an unregistered or mis-titled suite fails the check (0 passes) rather than silently "passing" on zero failures.

---

## Stage 3 — Localization strings

**Files:**
- `lang/en.json` — beside the existing `SWFFG.Settings.codex.*` keys (531–536, ending at `AdvantageHealsStrain.Hint`). Setting Name/Hint live here, NOT in `lang/codex` (design §3.8, verified).
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
- Per-key count assertions (uniqueness): for each new key, `Select-String -Path lang\en.json -SimpleMatch '"SWFFG.Settings.codex.VehicleCritWeeklyLimit.Name"' | Measure-Object` expects `Count = 1`; likewise every `SWFFG.Codex.CritTrauma.*` key in `lang\codex\en.json`.

---

## Stage 4 — Settings + live-refresh path 1 (re-render helper)

**Files:**
- `modules/actors/codex-sheets.js` — add exported `refreshOpenCodexSheets()` (self-contained, near the top-level exports; imported by `settings-helpers.js` — cycle-safe direction, design §3.6).
- `modules/settings/settings-helpers.js` — register two settings near `dPoolLight` (line 202) / `codexAdvantageHealsStrain` (line 405); import `refreshOpenCodexSheets`; the `dPoolLight` `onChange` DOM-rewrite precedent is at 213-215.
- `modules/settings/ui-settings.js` — `codexSettings._prepareContext()` allow-list (306–311).

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
- Live (after reload): `game.settings.get("starwarsffg","campaignDay")` → `1`; the Codex settings menu lists the vehicle toggle.

---

## Stage 5 — `receivedDay` stamping in the existing pre-create hook

**File:** `modules/swffg-main.js` — `registerActorItemValidationHooks()` (function line 76; `Hooks.on("preCreateItem", …)` line 77; `criticalinjury`-placement guard ~102–105; called at line 194). **Do NOT add a second hook** (design §3.7).

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
- Live **copy semantics via a supported console op** (actor-to-actor crit *drag* is NOT supported — DragDrop `dragSelector` is `.items-list .item, .cdx-card` and `_onTransferItemDragStart` allows only weapon/armour/gear, actor-sheet-ffg.js:1375-1379 / 2161-2174, verified):
  ```js
  const src = someActor.items.find(i => i.type === "criticalinjury");
  const obj = src.toObject(); obj.system.receivedDay = 99;
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

**Expected fresh-crit state:** because Stage 5 stamps a new crit's `receivedDay = currentDay` and Resilience uses `resilienceLastAttemptDay ?? receivedDay`, a **freshly created** PC crit shows **"Self-heal in 7 days"** with the **Medicine "Failed" marker immediately available** (Medicine has no rest gate). "Roll Resilience" appears only once `campaignDay >= receivedDay + 7`.

**Verification:**
- Read-back: balanced `{{#with}}`/`{{/with}}`, every button carries `data-item-id`, no stray tags.
- Live: a fresh PC crit shows **"Self-heal in 7 days"** + **"Failed"** (not "Roll Resilience"); on a vehicle the Mechanics control is absent while `vehicleCritWeeklyLimit` is Off and appears when On.

---

## Stage 7 — Card handlers in `_cdxActivate` (+ client-side bridge helper)

**Files:**
- `modules/actors/codex-sheets.js` — `_cdxActivate(html)` (line 467); `close()` (line 430) needs **no** teardown (elements recreated each render). Reuse `_cdxApplyStrainRecovery` / `buildPool` (lines 1371–1443). Import `availFor` from `../helpers/crit-availability.js` (same math as helper + bridge) and `applyCritRecoveryAttempt` from `../helpers/gm-bridge.js`.
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
- `_cdxActivate` — bind per-render handlers (resolve crit via `event.target.closest(".cdx-injury").dataset.itemId`; `currentDay = Math.floor(Number(game.settings.get("starwarsffg","campaignDay"))||0)`; all live re-checks use the imported `availFor`):

  **`.cdx-inj-resilience`** — strict ordering so **no locally-constructible prerequisite runs after the stamp**. Wrap in `try { … } finally { <clear in-flight/re-enable> }`:
  1. In-flight guard: if already in-flight for this item, return; else set it + disable the button.
  2. Permission re-check: `item.parent?.isOwner || game.user.isGM`, else abort.
  3. Live availability re-check: `availFor(item.system.resilienceLastAttemptDay ?? item.system.receivedDay ?? null, currentDay).attemptable`; if false, `ui.notifications.warn(localize AttemptUnavailable)` and abort.
  4. **Build ALL non-dice prerequisites BEFORE any stamp:** validate the actor has a **Resilience** skill (else `ui.notifications.warn(localize NoResilienceSkill)` and abort — no stamp); build the `DicePoolFFG`; render the expression; **construct the roll**:
     ```js
     const roll = new game.ffg.RollFFG(pool.renderDiceExpression());   // may throw here → BEFORE the stamp
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
  7. Resolve: `net >= 1` → `await item.delete()`; else leave the stamp. **No equality-based rollback anywhere.**

  **`.cdx-inj-medfail`** — live re-check `availFor(item.system.medicineLastAttemptDay ?? null, currentDay).attemptable` (abort if false); if `item.isOwner` → `item.update({ "system.medicineLastAttemptDay": currentDay })`; else `await applyCritRecoveryAttempt(this.actor, itemId, "medicine")`.

  **`.cdx-inj-mechfail`** — explicit house-rule + type gate on the owner-local path (the owner bypasses the GM bridge, and the button can be stale mid-refresh): abort unless `game.settings.get("starwarsffg","vehicleCritWeeklyLimit") === true`; abort unless the live `item.type === "criticaldamage"`; then live re-check `availFor(item.system.mechanicsLastAttemptDay ?? null, currentDay).attemptable`; if `item.isOwner` → `item.update({ "system.mechanicsLastAttemptDay": currentDay })`; else `await applyCritRecoveryAttempt(this.actor, itemId, "mechanics")`.

**Verification:**
- `node --check` both files (separate lines); grep `codex-sheets.js` for `cdx-inj-resilience`, `cdx-inj-medfail`, `cdx-inj-mechfail`, `critTraumaRecovery`, the `availFor` import, and that `new game.ffg.RollFFG(` appears **before** the `resilienceLastAttemptDay` update in source order; grep `gm-bridge.js` for `applyCritRecoveryAttempt` / `ffgCritRecovery`.
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

## Stage 9 — GM bridge op `ffgCritRecovery` (server-side auth + shared-module availability)

**File:** `modules/helpers/gm-bridge.js` — add `import { availFor } from "./crit-availability.js";` at the top (currently the file imports only `./minions.js`; `crit-availability.js` has no imports → **cycle-safe**, verified). In `registerGMBridge()` (line 100), add a branch to `game.socket.on(FFG_SOCKET, …)` mirroring the `MESSAGE_EVENT` auth block (106–129). The `APPLY_EVENT` branch (131–140) does **no** requestor auth, so the new op self-authorizes (design §3.3.3).

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
  if (!availFor(stamp, day).attemptable) return;                    // SHARED module — one implementation of the null/rewind/>=7 math
  await item.update({ [`system.${m.field}`]: day });
  return;
}
```
The authoritative GM-side availability check now routes through the **same** `availFor()` the helper, handlers, and unit tests use — no hand-written predicate remains in the bridge (New Major fix).

**Verification:**
- `node --check modules/helpers/gm-bridge.js`; grep for `ffgCritRecovery`, `testUserPermission`, `"OBSERVER"`, the `availFor` import, and confirm the branch calls `availFor(stamp, day).attemptable` (and that no literal `+ 7` cooldown expression remains in `gm-bridge.js`).
- **Live two-client forged-request procedure** (requires a second client — `requestorId` comes from Foundry's socket transport):
  1. GM: pick a PC actor; note `const actorUuid = actor.uuid` and a crit `itemId` (`actor.items.find(i=>i.type==='criticalinjury').id`). Ensure that injury's `medicineLastAttemptDay` is `null`.
  2. Grant a **second user OBSERVER** on that actor. As that user (own console):
     `game.socket.emit('system.starwarsffg', {event:'ffgCritRecovery', actorUuid:'<uuid>', itemId:'<id>', path:'medicine'});`
     → **expected:** GM stamps `medicineLastAttemptDay = <campaignDay>` (GM re-reads the item before/after); the marker flips to "Medicine in 7 days" on next render.
  3. Lower that user to **LIMITED**; repeat the emit → **expected:** GM logs "refused unauthorized crit-recovery" and the field is **unchanged** (the user also cannot see the marker, per `{{#unless limited}}`).
  4. Restore OBSERVER; with the stamp now **cooling**, repeat the emit → **expected:** the shared `availFor` re-check rejects it and the field is **unchanged** (no cooldown extension).

---

## Stage 10 — CSS (hand-edited; no compile)

**Files (edit directly — NEVER gulp/npm compile; memory `css-is-hand-maintained`):**
- `styles/cdx.css` — crit **card** controls (`.cdx-inj-resilience`, `.cdx-inj-medfail`, `.cdx-inj-mechfail`, `.cdx-inj-cooldown`). Loaded by Codex sheets regardless of theme.
- `styles/starwarsffg.css` **and** `styles/mandar.css` — the **global** `#ffg-campaign-day` readout. Both are needed because the active `mandar` theme disables `starwarsffg.css`; `mandarBeskarAstromech.css` imports `mandar.css`, so it inherits the mandar copy (memory `active-theme-is-mandar`; design §5(a)).

**Edit:** theme-consistent rules — button sizing/hover for card controls; muted cooldown text; compact inline layout + `[+]` affordance for the readout (harmonize with the neighbouring `.swffg-destiny` / `.destiny-points` chrome, which legitimately **differs** between the two stylesheets).

**Verification (selector COVERAGE, not byte-identical):**
- Grep `cdx.css` for the four card selectors.
- Confirm both `styles/starwarsffg.css` and `styles/mandar.css` contain rules for `#ffg-campaign-day` / `.ffg-campaign-day-value` / `.ffg-campaign-day-advance` (same **selector coverage**; declarations may differ to fit each theme).
- Live: the readout is visible, correctly laid out, `[+]` clickable, and card controls styled under **all three** themes — default (`starwarsffg.css`), **mandar**, and **mandarBeskarAstromech** (inherits mandar).

---

## Stage 11 — Live-in-Foundry verification checklist (final)

Hard-reload the world as GM first (modules are cached). Then:

1. **Day readout & advance:** Destiny Tracker shows "Day N"; GM sees `[+]`, player does not. `[+]` → enter 7 → readout +7 in place (no flicker) and `[+]` still works.
2. **Fresh-crit initial state (rest gate):** apply/`+`-add a crit on a PC → the card shows **"Self-heal in 7 days"** and an **available "Failed"** (Medicine) marker; `item.system.receivedDay` equals the current `campaignDay`. "Roll Resilience" is **not** shown yet.
3. **Resilience unlocks after a week, both branches:** create **two** fresh crits (A and B). Advance `campaignDay` by 7 → both now show **"Roll Resilience"**.
   - **Success→delete:** click A until a roll with **net success ≥ 1** occurs → A is deleted. (Repeat / advance another week if the first roll fails.)
   - **Failure→stamp:** on B, on a **net-fail** roll → B stamps and flips to "Self-heal in 7 days". Double-clicking B does not launch two rolls.
4. **Missing-skill safety:** on an actor without a Resilience skill, after advancing past the gate, clicking "Roll Resilience" warns and does **not** stamp (week not burned).
5. **Decoupling:** a failed Resilience attempt leaves that injury's Medicine "Failed" still available.
6. **Live countdown refresh:** with a Codex sheet open showing "Self-heal in 5 days", GM advances the day → the open sheet re-renders and the countdown drops, no manual reload.
7. **Medicine marker + non-owner path:** "Failed" stamps `medicineLastAttemptDay` → "Medicine in 7 days"; a non-owner ally with ≥OBSERVER can mark it (forwarded to GM, Stage 9 procedure); a LIMITED user cannot see it.
8. **Vehicle gating:** vehicle Mechanics control absent while `vehicleCritWeeklyLimit` is Off; enable it in the Codex settings menu → control appears; "Failed" stamps `mechanicsLastAttemptDay`; an owner-local click while the setting is Off does **not** stamp (explicit re-check).
9. **Non-owner cannot self-heal:** viewing another PC's sheet without ownership, the Resilience button is not rendered (`canSelfHeal` false) and the handler re-check refuses anyway.
10. **Rewind clamp:** lower `campaignDay` below a stamp → countdown shows "in 7 days", never negative.

**Headless:** the Stage 2-tests suite (`tests/crit-trauma-counter.test.js`) run via the harness console command asserts the availability math (including the rewind clamp and the fresh-crit rest gate) — the same `availFor()` the GM bridge enforces — without a live world. Not gated on CI.

---

## Stage dependency summary

```
1 schema ─┬─ 2 helper+module ─ 2-tests ─┐
          └─ 5 stamp                     ├─ 6 markup ─ 7 handlers ─ 9 GM bridge ─ 11 live test
3 loc ─ 4 settings ─────────────────────┘                 │
                     4 also ─ 8 readout ──────────────────┘

crit-availability.js (Stage 2, import-free) is imported by:
  swffg-main.js (2, wrapper) · codex-sheets.js (7, live re-check) · gm-bridge.js (9, GM re-check) · crit-trauma-counter.test.js (2-tests)
  → ONE availFor() implementation; cycle-safe (module imports nothing; gm-bridge imports only minions.js).
```
- **2, 5, 7** read `campaignDay`; **4** must load before they *execute* (all execute post-init/at render, so any load order is parse-safe; keep numbered order for semantic safety).
- **7** emits `ffgCritRecovery`; **9** answers it — between 7 and 9 the non-owner marker is a harmless no-op, the owner path already works.
- **8** completes live-refresh path 2 (the value span Stage 4's `onChange` targets); path 1 works from Stage 4.

## Rollback / risk note

- **Reversibility:** every stage is an additive edit on `crit-trauma-counter`; revert with `git checkout -- <file>` / `git revert`. No destructive migration — the new nullable fields default `null` and are written only when a crit is stamped; removing the feature leaves inert `system.*` fields no code reads.
- **Descoped concurrency (design §2):** there is intentionally **no** cross-client atomic "one attempt per week" guarantee and **no** GM serialized coordinator. The in-flight guard + live re-check + GM-side availability re-check stop double-clicks and stale-render attempts; a genuine *simultaneous same-day* two-client Resilience race can double-roll one weekly attempt — **accepted residual** for a co-located table (single healer per crit, GM present). Do not add a distributed lock without a new decision.
- **Rollback correctness:** all locally-constructible prerequisites (skill validation, pool build, roll construction) run **before** the reservation stamp; a post-reservation `toMessage` failure keeps the stamp (roll.js:353 evaluates before :398 creates — no free reroll); the handler never rolls a day field back on equality with `currentDay`.
- **Git/account:** any push targets `YeNov/StarWarsFFG` only (project CLAUDE.md, memory `push-as-yenov-account`); never upstream `StarWarsFoundryVTT/StarWarsFFG`.

---

## Review response

### Plan v1 → v2 findings (all Resolved in v2, retained here)

| Finding (severity) | Outcome |
|---|---|
| Stages 6/11 — fresh-crit checklist vs rest gate (**Major**) | **Fixed** in v2/v3 (Stage 6 expects "Self-heal in 7 days" + Medicine; Stage 11.2/11.3 verify then advance +7, both branches). |
| Stage 7 — roll constructed after stamp (**Major**) | **Fixed** (construct `RollFFG` in step 4 before the step-5 stamp; try/catch preserves the stamp). |
| Stage 7 — owner-local Mechanics house-rule gate (**Minor**) | **Fixed** (re-read `vehicleCritWeeklyLimit`, validate `criticaldamage`, live predicate). |
| Stage 1 — `&&` in PowerShell 5.1 (**Minor**) | **Fixed** (separate lines / `$LASTEXITCODE`). |
| Stages 2/11 — tests not importable/registered (**Minor**) | **Fixed** (dependency-free module + registered suite + exact console command). |
| Stage 3 — JSON dup-key claim (**Minor**) | **Fixed** (claim dropped; per-key count assertions). |
| Stage 5 — actor-to-actor drag unsupported (**Minor**) | **Fixed** (console `createEmbeddedDocuments` copy test). |
| Stage 9 — forged-request procedure (**Minor**) | **Fixed** (exact two-client OBSERVER/LIMITED/cooling procedure). |
| Stage 10 — byte-identical CSS (**Minor**) | **Fixed** (selector coverage across the three themes). |

### Plan v2 → v3 new findings

| Finding (severity) | Outcome |
|---|---|
| Stages 2/9 — GM bridge kept a third hand-written availability predicate (**Major**) | **Fixed.** `modules/helpers/gm-bridge.js` now `import { availFor } from "./crit-availability.js";` and the GM branch uses `if (!availFor(stamp, day).attemptable) return;` — one shared, unit-tested implementation across wrapper, handler, and bridge. Verified cycle-safe (crit-availability.js has no imports; gm-bridge.js imports only minions.js; neither imports swffg-main.js/codex-sheets.js). Bridge import + use added to Stage 2's downstream-consistency check and Stage 9's file list/verification. |
| Stage 2-tests — suite title/run assertion underspecified (**Minor**) | **Fixed.** The suite is declared exactly as `suiteInstance.create(suite, "Crit-Trauma Counter")` (matching `codex-schemes.test.js`), and the verification now requires **`mine.length === 6` passing cases** for that parent title **and** zero matching failures — so an unregistered/mis-titled suite fails the check instead of silently passing on zero failures. |
