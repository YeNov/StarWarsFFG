# Implementation plan — "Replace a rolled die with a die or a result" (v3)

**Date:** 2026-07-18
**Branch:** `feature-dice-reroll` (worktree `claude/dice-replacement-feature-7c88b7`)
**Design (source of truth):** `docs/superpowers/specs/2026-07-18-dice-replacement-design_doc_v3.md`
**Status:** Plan v3 — revised after the confirmatory executability/security review
(`2026-07-18-dice-replacement-plan_review_v3.md`, verdict NEEDS-REVISION: 1 security Major + 1 carried
NoGM Minor). See **Review response** at the end.

This plan implements frozen v3 verbatim; it does not redesign. §5.x references point at that doc.

**Changes vs v2 (confirmatory review):**
- Stage 8 conditional V14 gm-bridge fallback is now **requestor-validated and payload-narrowed** on the
  GM side — the socket listener authorizes the trusted Foundry-injected sender (GM or message author) and
  rejects any update outside the feature's `rolls` + `flags.starwarsffg` payload. Without this, any
  client could make the active GM mutate any chat message, violating the locked GM-or-owner decision
  (security Major).
- New `SWFFG.ReplaceDie.NoGM` (neutral wording) added to all seven locales and used by the message-update
  fallback, replacing the en-only, "to the target"-worded `SWFFG.GMBridge.NoGM` (carried Minor).

Everything the confirmatory reviewer checked-without-findings is unchanged (roll recompute/coupling; the
`rolls` JSONField round-trip via `message.update`; `updateSymbols` token normalization; per-die identity
surviving the separate `addedResults` block; the `contextmenu` preventDefault+stopPropagation
interference control; test-suite registration).

## Conventions & repo realities (apply to every stage)

- **Git repo (not Perforce).** Do NOT `git commit`/`git push` in any stage — the user drives that.
- **Tests run in-app.** The "Functional Testing" macro is dead on V13. **HARD reload**
  (Ctrl/Cmd+Shift+R — modules are cached; a soft reload tests OLD code), open F12 as **GM**, import the
  suite, read mocha's JSON. `tests/ffg-tests.js` is a `FormApplication` whose `getData()` runs Mocha
  (`reporter:"json"`) and returns `{pass, fail, suites}`. Recipe:
  `const m = await import("/systems/starwarsffg/tests/ffg-tests.js"); const r = await new m.default().getData(); console.log(JSON.stringify({pass:r.pass.length, fail:r.fail.map(f=>f.title)}));`
  `Error` props are non-enumerable — read titles from the JSON. **Baseline: ~47 pass / 2 fail** (2 stale
  Modifier tests). Each stage keeps the baseline and adds its own passing tests.
- **Pure logic gets DOM-free unit tests.** `computeFFGTotals` and `spliceReplacement` (model adapters)
  need no Foundry; the rest run inside the console harness where `CONFIG`, `game`, `foundry` exist.
- **CSS is hand-maintained in BOTH files.** Any rule goes into **`styles/starwarsffg.css` AND
  `styles/mandar.css`**, identical. NEVER run `gulp css` / `npm run compile`. Active theme is `mandar`
  (it disables `styles/starwarsffg.css` and imports `styles/mandar.css`), so a one-file rule is
  invisible in one theme.
- **V13 + V14.** Feature-detect only where core APIs diverge, following the `game.release.generation >=
  14` pattern already in `modules/dice/roll.js` `toMessage()`. The happy path uses V13+-stable APIs
  (`renderChatMessageHTML`, `DialogV2`, `ChatMessage.update`); the only divergence risk is author-update
  permission on V14 (Stage 5 primary path + Stage 8 conditional, now hardened, fallback).
- **Localization = all seven files** under `lang/`: `en.json, ca.json, de.json, es.json, fr.json,
  pt-BR.json, ua.json`. (`lang/codex/en.json` is NOT an installed system locale — do not touch it.)

## Stage map

1. Pure recompute + splice core + unit tests (`modules/dice/replace-die.js`, `tests/replace-die.test.js`)
2. Roll serialization round-trip for `modifications` (`modules/dice/roll.js`)
3. Per-die identity in the chat card (`roll.js` `render()` + `templates/dice/roll-ffg.html`)
4. Right-click trigger + DialogV2 modal, gated (no persistence) (`modules/helpers/replace-die.js`, `swffg-main.js`)
5. Wire mutation + persistence + permissions (rolls-capture, `resetFormula` guard, V13 direct write)
6. Audit marker surfacing + CSS in BOTH `styles/` files
7. Localization across all seven `lang/*.json` (incl. new `SWFFG.ReplaceDie.Cancel` and `SWFFG.ReplaceDie.NoGM`)
8. End-to-end manual verification (V13 + V14) + regression baseline (+ conditional, requestor-validated gm-bridge fallback)

---

## Stage 1 — Pure recompute + splice core + unit tests

**Goal.** Land the data-layer helpers (§5.2) with full unit coverage, independent of DOM/serialization/UI.

**Files & symbols.**
- **New `modules/dice/replace-die.js`** — exports, exactly per §5.2:
  - `RESULTS_BY_DENOM` (denom → `CONFIG.FFG.*_RESULTS` key), `DIE_NAME` (denom → `SWFFG.Dice*` key),
    `TOKEN` (type → `[SU]/[FA]/[AD]/[TH]/[TR]/[DE]/[LI]/[DA]`, the fixed map from §5.1).
  - `zeroTally()`, `faceTally(die, r)`, `computeFFGTotals(faceTallies, added)`, `recomputeTermFFG(term)`,
    `recomputeRollFFG(roll)`, `cloneEvaluatedTerm(SourceClass, results)`,
    `spliceReplacement(terms, ti, j, freshTerm, {getDenom, makeOperator, makeTerm})`,
    `localizeFaceLabel(term, r)`.
  - Keep this module free of DOM/dialog code (mutation wrapper + modal live in
    `modules/helpers/replace-die.js`, Stage 4/5). It may reference `CONFIG.FFG`, `game.ffg`,
    `foundry.utils`, `CONFIG.Dice.terms` (all present in the app runtime).
- **New `tests/replace-die.test.js`** — `export const ReplaceDieTests = (suite, suiteInstance, Test, chai) => {…}`,
  mirroring `tests/modifiers.test.js` (`suiteInstance.create(...)`, `_suite.addTest(new Test(...))`, `chai.expect`).
- **Edit `tests/ffg-tests.js`** — `import { ReplaceDieTests } from "./replace-die.test.js";` (near lines
  4‑12) and call `ReplaceDieTests(suite, suiteInstance, Test, chai);` in `getData()` (near lines 40‑48).

**Tests to write (per §8).**
- `computeFFGTotals`: success/failure cancel; advantage/threat cancel; light & dark never cancel;
  Triumph adds success (survives net-zero, triumph stays 1); Despair adds failure; negative
  `addedResults`; empty inputs → all zeros.
- `faceTally`: returns `r.ffg` when present; recovers from `CONFIG.FFG.*_RESULTS` when `ffg` missing
  (build `{result:12}` for a proficiency term → triumph face); `null` for `active === false`;
  unknown/malformed face → `null`.
- `recomputeTermFFG`: aggregates `results[].ffg`; matches the die's own `evaluate()` sum.
- `spliceReplacement` **model-shape** (adapters `getDenom=t=>t.denom`, `makeOperator=()=>({op:"+"})`,
  `makeTerm=(src,res)=>({denom:src.denom,results:res})`): model `2dp+1da`; replace `(0,0)`→boost ⇒
  flattened `b,p,a`; `(0,1)`→boost ⇒ `p,b,a`; middle split in `1dp+2da+1db`; same-denom swap keeps ONE
  term + exact position.
- `spliceReplacement` **live-adapter regression (round-2 Blocker)**: real `ProficiencyDie`+`AbilityDie`
  terms + a real evaluated `BoostDie`; live adapters (`t=>t.constructor.DENOMINATION`, `()=>new
  foundry.dice.terms.OperatorTerm({operator:"+"})`, `cloneEvaluatedTerm`). Assert cross-denom output is
  `[DiceTerm, OperatorTerm, DiceTerm, …]`; every element has callable `toJSON`; cross-denom takes the
  split branch, same-denom the swap branch; flattened render order preserved.
- **Audit capture**: face with `ffg` undefined → `deepClone(faceTally(term,r) ?? zeroTally())` equals the
  table-recovered tally (or zeros), never `undefined`, never throws.

**Verification.** HARD reload → F12 as GM → run recipe → new "Replace Die" suite passes; total = baseline
+ new tests; same 2 known Modifier fails. No app UI touched.

---

## Stage 2 — Roll serialization round-trip for `modifications`

**Goal.** New audit field survives `toJSON`/`fromData` and reload (§5.1). No behavior.

**Files & symbols — `modules/dice/roll.js` (`RollFFG`).**
- Constructor (~line 15, beside `this.addedResults = []`): add `this.modifications = [];`.
- `toJSON()` (~lines 396‑405, after `json.addedResults`): `json.modifications = this.modifications ?? [];`.
- `static fromData(data)` (~lines 407‑416, after `roll.addedResults`): `roll.modifications = data.modifications ?? [];`.

**Verification.** Add a round-trip test to `tests/replace-die.test.js`: build a `RollFFG`, set
`roll.modifications = [{by:"x", mode:"dice", original:{denom:"p"}, replacement:{kind:"die",denom:"b"}}]`,
`RollFFG.fromData(JSON.parse(JSON.stringify(roll)))` deep-equals `modifications`; absent field → `[]`.
HARD reload → run suite → passes. Console sanity: evaluate `/r 2dp`, round-trip via
`fromData(JSON.parse(JSON.stringify(roll)))` still has `ffg/addedResults/modifications`.

---

## Stage 3 — Per-die identity in the chat card

**Goal.** Emit stable `(dieIndex, resultIndex, denom)` on each glyph so a right-click maps to
`roll.dice[dieIndex].results[resultIndex]` (§5.3). Additive; no interactivity.

**Files & symbols.**
- **`modules/dice/roll.js` `render()`** — enrich the `ffgDice` map (lines 291‑303) with per-die
  `dieIndex` + `denom: d.constructor.DENOMINATION` and per-roll `resultIndex`, exactly the §5.3 snippet.
  Do NOT add `modified`/`modifications` chatData here — that lands in Stage 6.
- **`templates/dice/roll-ffg.html`** — the `.ffgDiceArray > ol.dice-rolls` loop (lines ~23‑29): change
  `<li class="roll">` to `<li class="roll ffg-die" data-die-index="{{../dieIndex}}"
  data-result-index="{{this.resultIndex}}" data-denom="{{../denom}}">`. The separate `addedResults`
  block (lines ~30‑34) is untouched, so per-die identity does not collide with appended results.

**Index model (correctness note).** `dieIndex` indexes **`roll.dice`**, which the core `Roll#dice` getter
builds from `DiceTerm` instances only — **`OperatorTerm`s are excluded**. So for `/r 2dp+1da`,
`roll.terms = [ProficiencyDie, OperatorTerm("+"), AbilityDie]` but `roll.dice = [ProficiencyDie,
AbilityDie]`. The handler resolves `roll.dice[dieIndex]` and then translates to the terms array via
`roll.terms.indexOf(term)` for splicing (Stage 5), so the operator offset never leaks into the identity.

**Verification.** HARD reload → roll `/r 2dp+1da` → F12 Elements on the card: the two proficiency glyphs
are `data-die-index="0"` with `data-result-index="0"` and `"1"`; **the ability glyph is
`data-die-index="1" data-result-index="0"`** (NOT die-index 2 — the `+` operator is not a die). `denom`
matches (`p`, `p`, `a`). Glyph images/totals/tooltip unchanged; no console errors.

---

## Stage 4 — Right-click trigger + DialogV2 modal (gated, no persistence)

**Goal.** Right-click opens the two-mode modal for GM/author only; confirm captures the choice but does
not yet mutate/persist (§5.4).

**Files & symbols.**
- **New `modules/helpers/replace-die.js`** exporting `class ReplaceDie`:
  - `static bindChatMessage(message, html)` — gate exactly as `ApplyCrit.bindChatMessage`
    (`const authorId = message.author?.id ?? message.user; if (game.user.id !== authorId && !game.user.isGM) return;`),
    then delegate a `contextmenu` listener on `.ffgDiceArray li.roll.ffg-die[data-die-index]`. Handler:
    `ev.preventDefault(); ev.stopPropagation();` (blocks core's ChatLog `ContextMenu`, which is
    registered on `.message[data-message-id]` via a bubbling `contextmenu` listener), read
    `dataset.dieIndex/resultIndex/denom`, call `ReplaceDie.show(...)`.
  - `static async show(message, {dieIndex, resultIndex, denom})` — resolve the clicked **face label** for
    the title via `localizeFaceLabel(sourceTerm, removed)` (the result label like "One Success", per
    §5.4 — NOT the die-type name); open one `foundry.applications.api.DialogV2.wait({...})` with a mode
    toggle (radios `ModeDie`/`ModeResult`), the Dice panel (7 icon buttons using `CONFIG.FFG.<T>_ICON` +
    `SWFFG.Dice*` names, storing `p/a/b/i/c/s/f`), the Result panel (8 symbol icon buttons + `<input
    type=number min=1 value=1>`), and **Replace** (`action:"replace"`, default, `fa-check`, label
    `SWFFG.ReplaceDie.Replace`) / **Cancel** (`fa-times`, label **`SWFFG.ReplaceDie.Cancel`**) buttons,
    `rejectClose:false`. Mirror the inline-style + `render`-callback pattern of `ApplyCrit.show`.
  - This stage's `replace` callback validates a selection (else `ui.notifications.warn(localize
    "SWFFG.ReplaceDie.NoSelection")`) and calls a placeholder `ReplaceDie.applyReplacement(message,
    {dieIndex, resultIndex}, choice)` that only `ui.notifications.info(...)`s the resolved plan. Real
    mutation lands in Stage 5.
- **`modules/swffg-main.js`** — add `import { ReplaceDie } from "./helpers/replace-die.js";` next to the
  Apply* imports (lines 46‑47); in the `renderChatMessageHTML` hook, after
  `ApplyCrit.bindChatMessage(message, $html);` (line 1482), add `ReplaceDie.bindChatMessage(message, $html);`.

**Verification.** HARD reload. As GM: right-click a glyph → modal opens; the **core delete-message menu
does NOT appear**; toggle Dice/Result panels; pick a die or symbol+qty; Replace → info notification
prints the captured plan; Cancel/Esc closes. Card does NOT change (placeholder). As a **non-author,
non-GM** second user: right-click does nothing. No console errors. (Raw locale keys may show until Stage 7.)

---

## Stage 5 — Wire mutation + persistence + permissions

**Goal.** Turn the placeholder into the real, permanent, shared edit (§5.2 finalize, §5.5, §5.6).

**Files & symbols — `modules/helpers/replace-die.js`** (`ReplaceDie.applyReplacement` → real). Import
helpers from `../dice/replace-die.js` (`faceTally, zeroTally, TOKEN, cloneEvaluatedTerm,
spliceReplacement, recomputeTermFFG, recomputeRollFFG, localizeFaceLabel`).

1. **Capture the rolls array ONCE** (folds v1 Q1 — prevents a re-deriving `message.rolls` getter from
   dropping the mutation): `const rolls = message.rolls; const roll = rolls[0];` — bail if `!roll`. All
   mutation and the later serialize use this same `rolls`/`roll`.
2. Locate `const term = roll.dice[dieIndex]; const ti = roll.terms.indexOf(term);` — if `ti === -1`,
   `ui.notifications.warn(...)` and abort (guards inner-`RollFFG` pools, §7 risk 2).
3. **Audit capture BEFORE mutating** (§5.7): `const removed = term.results[resultIndex]; const
   originalTally = foundry.utils.deepClone(faceTally(term, removed) ?? zeroTally()); const originalDenom
   = term.constructor?.DENOMINATION; const originalLabel = localizeFaceLabel(term, removed);`.
4. **Dice mode:** `const D = new CONFIG.Dice.terms[choice.denom](1); await D.evaluate();
   roll.terms = spliceReplacement(roll.terms, ti, resultIndex, D, { getDenom: t=>t?.constructor?.DENOMINATION,
   makeOperator: ()=>new foundry.dice.terms.OperatorTerm({operator:"+"}),
   makeTerm:(src,res)=>cloneEvaluatedTerm(src.constructor,res) });`
5. **Result mode:** `term.results.splice(resultIndex,1)`; decrement `term.number`; if the term is now
   empty remove it + one flanking `OperatorTerm` (exact §5.2 removal block); else `recomputeTermFFG(term)`.
   Then `roll.addedResults.push({ type: choice.type, symbol: TOKEN[choice.type], value: choice.qty, negative:false });`.
6. **Finalize:** normalize every `addedResults[i].symbol = TOKEN[addedResults[i].type]` (§5.1 idempotency);
   `recomputeRollFFG(roll)`; **guard the formula rebuild** (folds v1 Q3, no try/catch):
   `if (typeof roll.resetFormula === "function") roll.resetFormula(); else if (typeof Roll.getFormula ===
   "function") roll._formula = Roll.getFormula(roll.terms);` (else leave `_formula` stale — cosmetic for
   FFG-only rolls, which don't display the formula). Push the `roll.modifications` entry
   (`by/byName/at:new Date().toISOString()/mode/original/replacement`, §5.7).
7. **Persist (V13 direct path, §5.5)** — serialize from the SAME `rolls` captured in step 1:
   ```js
   const update = {
     rolls: rolls.map((r, i) => (i === 0 ? JSON.stringify(roll) : JSON.stringify(r))),
     flags: { starwarsffg: { diceModified: true, modifiedBy: game.user.id } },
   };
   await message.update(update);
   ```
   Valid for the two gated actors: the message **author** owns their own message; a **GM** updates any —
   so no bridge is needed on V13. (V14 author-update is checked in Stage 8; the requestor-validated
   fallback lives there.)

**Verification.** HARD reload. As GM, roll `2dp+1da`:
- Dice→Boost on the **first** proficiency (`data-die-index="0" data-result-index="0"`) → the boost glyph
  appears in slot 1 (NOT appended at the end); `message.rolls[0].ffg` and the totals line recompute;
  `message.rolls[0].formula` stays a valid additive expression; `message.rolls[0].modifications.length === 1`.
- Result→"+2 Advantage" → the clicked face's glyph is gone; `+2[AD]` shows in the added-results row;
  cancellation correct.
- Remove the **last** face of a term → the term drops with no dangling operator (no throw).
- **Shared + persistent:** with a second client connected, the card updates for both; **reload the
  world** → the change persists.
- **Permission:** a non-GM who authored a roll performs the edit on their own message with no "lacks
  permission" error.

---

## Stage 6 — Audit marker surfacing + CSS in BOTH `styles/` files

**Goal.** Make the modification visible/auditable in the card (§5.7) and add the two CSS hooks to both
hand-maintained stylesheets (§5.8).

**Files & symbols.**
- **`modules/dice/roll.js` `render()`** — add to `chatData`: `modified: (this.modifications?.length ?? 0) > 0`
  and `modifications: this.modifications` (beside `addedResults`/`ffg`, ~lines 291‑311).
- **`templates/dice/roll-ffg.html`** — when `{{#if modified}}`, render a badge near the flavor/label row
  (`<span class="ffg-modified-badge" title="…">✎ {{localize "SWFFG.ReplaceDie.ModifiedBadge"}}</span>`)
  and a native **`<details><summary>`** expandable list (folds v1 Q2 — no custom JS, theme-agnostic)
  iterating `{{#each modifications}}` → one line "**{{byName}}** ({{at}}): {{original.label}} →
  {replacement summary}". For a result replacement emit the raw token form
  (`+{{replacement.value}}{{replacement.symbol}}`) — the existing `renderChatMessageHTML` pass runs
  `PopoutEditor.renderDiceImages(content.innerHTML)` (`swffg-main.js:1476`) over the whole card, so
  `[AD]`-style tokens become glyphs automatically.
- **`styles/starwarsffg.css` AND `styles/mandar.css`** (identical in BOTH; no gulp/npm compile):
  `.ffg-die { cursor: context-menu; }` and a `.ffg-modified-badge { … }` chip style.

**Verification.** HARD reload under the **default `mandar` theme**: perform a replacement → the badge
appears, `.ffg-die` shows the context-menu cursor on hover, and the `<details>` list shows "who (when):
original → replacement" with correctly rendered symbol glyphs. Then switch the UI theme to the base
theme (which uses `styles/starwarsffg.css`) and confirm the same badge/cursor render → proves the rule
exists in both files. Confirm the audit line reads correctly after a world reload.

---

## Stage 7 — Localization across all seven `lang/*.json`

**Goal.** No raw `SWFFG.ReplaceDie.*` strings in any installed locale (§5.9, honoring the brief), a
localized Cancel button in every locale, AND a correctly-worded no-GM notice for the message fallback.

**Files & symbols.** Add the same `SWFFG.ReplaceDie.*` keys to **all seven**: `lang/en.json`,
`lang/ca.json`, `lang/de.json`, `lang/es.json`, `lang/fr.json`, `lang/pt-BR.json`, `lang/ua.json`. Keys:
`ContextLabel`, `DialogTitle` ("Replace {die}"), `ModeDie`, `ModeResult`, `Quantity`, `Replace`,
**`Cancel`** ("Cancel"), `ModifiedBadge`, `NoSelection`, and **`NoGM`** ("No active GM is connected to
apply this change." — neutral wording, message-agnostic). English text in `en.json`; English fallback
text is acceptable in the other six, but the keys MUST be present in each so no locale shows raw keys.

**Cancel-key correction (round-1 Major).** v1 reused `SWFFG.ApplyDamage.Cancel`, which is defined **only
in `lang/en.json`** (verified). The dialog uses **`SWFFG.ReplaceDie.Cancel`**, added to all seven files.

**NoGM-key correction (carried Minor).** The message-update fallback (Stage 8) must NOT reuse
`SWFFG.GMBridge.NoGM` — it is **only in `lang/en.json`** (verified) and worded "…to the target," which is
wrong for a chat-message update. Use the new **`SWFFG.ReplaceDie.NoGM`** (added to all seven above).

**Reused keys — verified present in all seven locales:** `SWFFG.Dice*` (die names) and
`SWFFG.RollResult*` (symbol names). Safe to reference from the modal in any locale. (`SWFFG.ButtonRoll`
is NOT used — the primary button is `SWFFG.ReplaceDie.Replace`.)

**Verification.** HARD reload with `core.language = en` → modal, badge, notifications show real text, no
raw keys. Switch `core.language` to another installed locale (e.g. `de`) and reload → all
`SWFFG.ReplaceDie.*` (incl. **Cancel** and **NoGM**) and reused die/symbol names resolve; no raw keys.
Validate each file parses: Foundry logs a JSON parse error on load if a trailing comma/dupe key slipped
in; spot-check `await fetch("/systems/starwarsffg/lang/<loc>.json").then(r=>r.json())` for each (no throw).

---

## Stage 8 — End-to-end manual verification (V13 + V14) + regression baseline

**Goal.** Prove the whole feature on both generations, lock the regression baseline, and — only if V14
requires it — wire a **requestor-validated** GM-forward fallback.

**Steps / Verification.**
- **Regression:** HARD reload → run the mocha suite → Replace Die suite passes; overall = baseline + new
  tests with the same 2 known-stale Modifier fails; no new console errors on load/render/update.
- **V13 scripted manual pass** (GM + ≥1 player client):
  1. In-place Dice replacement keeps glyph order (first-of-many-same-type case).
  2. Result mode removes the clicked face and appends symbol×N; cancellation correct.
  3. Triumph/Despair face swap updates the standalone triumph/despair tallies (uncancelled) plus
     success/failure.
  4. Force-die face (light/dark) replacement — light/dark never cancel.
  5. Empty-term drop leaves a valid formula.
  6. Shared update reaches all clients; **world reload** persists it; audit badge + timestamp present.
  7. Permission gate: a third non-author non-GM user sees no context menu.
- **V14 pass** (§5.6, §8): repeat items 1‑2 and 6 on a V14 world; **specifically confirm a non-GM author
  can `ChatMessage.update` their own `rolls`/`flags`.** If it succeeds → done, the Stage 5 direct path
  stands on both generations. **If (and only if) it fails**, wire the hardened fallback below and
  re-verify item 6 as a non-GM author on V14, plus the refusal test.

**Conditional V14 fallback — a requestor-validated, payload-narrowed message-forward.** Faithful to the
actual `modules/helpers/gm-bridge.js` shape (constants `FFG_SOCKET="system.starwarsffg"`,
`APPLY_EVENT="ffgApplyToTarget"`; exports `applyToTargetActor`, `registerGMBridge`; internal
`performApply(actor, op)`). **Security note:** the socket listener — not the emitting client — is the
privilege boundary. Foundry passes the **authenticated sender's user id as the second callback
argument** (verified in-repo on both sides: the emit passes only one payload object at
`modules/helpers/character-creator.js:1076‑1079`, while the existing PC-wizard GM handler reads
`args[1]` as `requestor` and looks it up with `game.users.get(requestor)` at
`modules/swffg-main.js:2026‑2030`). That second arg is therefore trusted and not spoofable, so the GM
side authorizes against it.

- **`modules/helpers/gm-bridge.js`:**
  1. Add `const MESSAGE_EVENT = "ffgUpdateMessage";`.
  2. New export (emit half — no auth data needed, the sender id is added by Foundry):
     ```js
     export async function forwardMessageUpdateToGM(message, update) {
       if (!game.users.activeGM) { ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoGM")); return false; }
       game.socket.emit(FFG_SOCKET, { event: MESSAGE_EVENT, messageUuid: message.uuid, update });
       return "forwarded";
     }
     ```
  3. In `registerGMBridge`, take the **trusted `requestorId` as the second callback arg** and dispatch on
     `data.event` so the **message path is handled BEFORE any actor resolution**. The message branch
     **authorizes the requestor (GM or the message's author) and narrows the payload** before applying:
     ```js
     game.socket.on(FFG_SOCKET, async (data, requestorId) => {   // requestorId = trusted Foundry sender
       if (game.user.id !== game.users.activeGM?.id) return;      // only the active GM acts
       try {
         if (data?.event === MESSAGE_EVENT) {
           const message = await fromUuid(data.messageUuid);
           if (!message) return;
           // AUTHORIZE: requestor must be a GM or the message author (mirrors the client gate + locked GM-or-owner rule)
           const authorId = message.author?.id ?? message.user?.id ?? message.user;
           const requestor = game.users.get(requestorId);
           if (!(requestor?.isGM || requestorId === authorId)) {
             CONFIG.logger?.warn?.("FFG GM bridge: refused unauthorized message update", { requestorId, messageUuid: data.messageUuid });
             return;
           }
           // NARROW: only this feature's payload is permitted (no author/whisper/etc. escalation)
           const upd = data.update ?? {};
           const topOk = Object.keys(upd).every(k => k === "rolls" || k === "flags");
           const flagsOk = !upd.flags || Object.keys(upd.flags).every(k => k === "starwarsffg");
           if (!topOk || !flagsOk) {
             CONFIG.logger?.warn?.("FFG GM bridge: refused out-of-scope message update", { keys: Object.keys(upd) });
             return;
           }
           await message.update(upd);
           return;
         }
         if (data?.event === APPLY_EVENT) {                        // unchanged actor path (out of scope; not re-authorized here)
           const actor = await fromUuid(data.actorUuid);
           if (!actor) return;
           await performApply(actor, data);
           if (data.gmChat) await ChatMessage.create(data.gmChat);
         }
       } catch (err) { CONFIG.logger?.warn?.("FFG GM bridge: failed to apply forwarded request", err); }
     });
     ```
     (The pre-existing `APPLY_EVENT` actor path keeps its current behavior — re-authorizing it is out of
     scope for this feature and would risk regressing Apply Damage/Crit.)
- **`modules/helpers/replace-die.js`** — gate the fallback with an **explicit generation + role check**
  (NOT `canUserModify` alone, whose presence on V14 is unconfirmed here). Since the action is already
  gated to author-or-GM, the only actor who could be blocked on V14 is a non-GM author:
  ```js
  import { forwardMessageUpdateToGM } from "./gm-bridge.js";
  const needsForward = !game.user.isGM && game.release.generation >= 14;  // non-GM author on V14
  if (needsForward) await forwardMessageUpdateToGM(message, update);
  else await message.update(update);                                       // V13 + all GMs
  ```
  (Acceptable equivalent: attempt `message.update(update)` and, on a caught permission error, call
  `forwardMessageUpdateToGM` — a try/catch is acceptable for the *permission* branch, unlike the
  `resetFormula` capability check in Stage 5.)
- **Verify (fallback wired):**
  - **Happy path:** as a non-GM author on V14, perform a replacement → the GM applies it via the socket,
    the card updates for all clients, and it survives reload. GMs and all V13 users still take the direct
    path.
  - **Refusal (security):** as a **non-owner, non-GM** player, manually emit a forged request for a
    message they did NOT author —
    `game.socket.emit("system.starwarsffg", { event: "ffgUpdateMessage", messageUuid: "<other author's message>", update: { flags: { starwarsffg: { diceModified: true } } } })`
    — and confirm the active GM **refuses** it (target message unchanged; a "refused unauthorized message
    update" warning is logged GM-side). Also confirm an authorized author's request carrying an
    out-of-scope key (e.g. `update.whisper`) is refused by the payload-narrowing check.

- **Theme check:** confirm badge/cursor render under both `mandar` and the base theme.

---

## Traceability (design § → stage)

- §5.1 data model / symbol normalization → Stages 2 (round-trip) + 5 (normalize on persist).
- §5.2 recompute + in-place splice → Stage 1 (helpers+tests) + Stage 5 (live wiring).
- §5.3 per-die identity → Stage 3.
- §5.4 trigger + modal → Stage 4.
- §5.5 persistence/re-render → Stage 5.
- §5.6 permissions + V14 fallback → Stage 5 (V13 direct) + Stage 8 (requestor-validated fallback).
- §5.7 audit marker → Stage 5 (write entry) + Stage 6 (surface).
- §5.8 CSS both files → Stage 6.
- §5.9 localization → Stage 7.
- §5.10 files-touched list → Stages 1‑7 (+ gm-bridge.js only if the Stage 8 V14 fallback is wired).

## Open questions for design

None remaining. The four v1 open questions are resolved in-plan: Q1 (rolls capture-once → Stage 5 step
1), Q2 (native `<details>/<summary>` → Stage 6), Q3 (`typeof roll.resetFormula === "function"` guard →
Stage 5 step 6), Q4 (DialogTitle = clicked **face** label via `localizeFaceLabel`, per design §5.4 →
Stage 4). See Review response.

## Review response

### Confirmatory review (`…_plan_review_v3.md`)

- **Major — Stage 8 V14 gm-bridge message fallback not requestor-validated → Fixed.** The GM-side socket
  listener now authorizes the **trusted, Foundry-injected sender** before applying any update: the
  callback takes `(data, requestorId)`, and the `MESSAGE_EVENT` branch applies the update only when
  `game.users.get(requestorId)?.isGM` OR `requestorId === (message.author?.id ?? message.user?.id ??
  message.user)` — mirroring the locked GM-or-owner rule. It additionally **narrows the payload** to the
  feature's shape (top-level keys `rolls`/`flags` only; `flags` limited to `starwarsffg`), rejecting any
  attempt to escalate to `author`/`whisper`/etc. The message branch stays dispatched **before** actor
  resolution, and the pre-existing `APPLY_EVENT` actor path is intentionally left unchanged (out of
  scope). Verified in-repo that the second callback arg is the trusted sender (emit passes one object at
  `character-creator.js:1076‑1079`; PC-wizard GM handler reads `args[1]` at `swffg-main.js:2026‑2030`).
  Added a Stage 8 verification that a non-owner, non-GM forged forward is refused GM-side (and that an
  out-of-scope payload key is refused).
- **Minor (carried from plan_review_v2) — no-GM notice reused en-only, mis-worded `SWFFG.GMBridge.NoGM`
  → Applied.** Introduced `SWFFG.ReplaceDie.NoGM` with neutral, message-agnostic wording, added to all
  seven locales in Stage 7, and used it in `forwardMessageUpdateToGM` (Stage 8) instead of
  `SWFFG.GMBridge.NoGM`.

**Checked-without-findings, kept intact (per this review):** roll recompute + Triumph/Despair coupling +
cancellation; the `rolls` JSONField round-trip via `message.update` (+ `RollFFG.toJSON/fromData` hooks);
`updateSymbols` token normalization; per-die identity surviving the separate `addedResults` block; the
`contextmenu` `preventDefault()` + `stopPropagation()` interference control; and the test-suite
registration pattern.

### Round-1 executability (`…_plan_review_v1.md`) — carried forward

- **Major — Stage 8 fallback not routable → Fixed** (routable message-forward: `MESSAGE_EVENT`,
  `forwardMessageUpdateToGM`, `data.event` dispatch resolving `messageUuid`; now also requestor-validated
  above).
- **Major — Stage 7 Cancel key en-only → Fixed** (`SWFFG.ReplaceDie.Cancel` in all seven locales; used in
  the dialog).
- **Major — Stage 3 wrong index example → Fixed** (ability in `2dp+1da` is `data-die-index="1"
  data-result-index="0"`; index into `roll.dice`, operators excluded; semantics kept).
- **Q1/Q2/Q3 — Applied & closed** (rolls capture-once → Stage 5; native `<details>` → Stage 6;
  `typeof roll.resetFormula === "function"` guard + `Roll.getFormula` fallback → Stage 5).
- **Q4 — Closed** (DialogTitle = clicked face label via `localizeFaceLabel`, per design §5.4).

**Faithful to frozen design v3 and the locked brief** (permanent/shared mutation with recompute +
re-render; audit of original→replacement; GM-or-author gate now enforced on BOTH the emitting client and
the GM-side socket endpoint; Result-mode result **and** count; FFG-only scope; native `contextmenu`
trigger; random fresh die; whole-face removal; ApplicationV2/DialogV2; CSS in both stylesheets; no SCSS
recompile).
