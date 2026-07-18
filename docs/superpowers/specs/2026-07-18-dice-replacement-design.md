# Replace a rolled die with a die or a result — design (v3)

**Date:** 2026-07-18
**Branch:** `claude/dice-replacement-feature-7c88b7`
**Scope:** Local fork. FFG narrative dice only. Min generation V13, must keep working on V14.
**Status:** Design draft v3 — revised after round-2 review
(`2026-07-18-dice-replacement-design_doc_review_v2.md`, verdict NEEDS-REVISION: 1 Blocker + 2 Minors).
See **Review response** at the end for a finding-by-finding map (rounds 1 and 2).

House style follows `docs/superpowers/specs/2026-05-24-apply-crit-chat-button-design.md`.

**Changes vs v2 (round-2):**
- §5.2 **Blocker fix** — `spliceReplacement` no longer assumes `term.denom` or plain `{op:"+"}`
  operators. It takes injected `getDenom` and `makeOperator` adapters; the live wrapper passes
  `t => t.constructor?.DENOMINATION` and `() => new foundry.dice.terms.OperatorTerm({operator:"+"})`,
  so the cross-denomination branch is actually taken and produces real, serializable `RollTerm`s.
- §5.2/§5.7 **Minor** — the removed face's audit tally is captured through the same defensive
  `faceTally(...) ?? zeroTally()` path used by recompute (deep-cloned), and `original.label` is derived
  from the result-table fallback and localized at capture time.
- §5.8/§5.10 **Minor** — exact stylesheet paths `styles/starwarsffg.css` and `styles/mandar.css`.

---

## 1. Problem

After a narrative-dice roll is posted to chat, a GM or the roller sometimes needs to surgically alter
*one* die of the pool — a talent/rule swaps a die type, or a table effect grants a flat symbol. Today
the only recourse is to re-roll the whole pool or narrate the change by hand; the stored roll and its
computed FFG totals cannot be touched. We want a per-die edit that mutates the persisted roll,
recomputes the FFG totals (with cancellation and the triumph/despair coupling), updates the message in
the DB for **everyone**, and leaves a visible, auditable "this was modified" trail.

## 2. Goals

- Right-click a rendered die glyph in an FFG roll's chat card → modal with two modes:
  - **Dice mode:** remove the clicked die, roll a fresh die of a chosen FFG type **in its place**.
  - **Result mode:** remove the clicked die, append a chosen FFG symbol × N.
- Recompute `RollFFG.ffg` (success/failure & advantage/threat cancellation, triumph→success,
  despair→failure) after the mutation, **purely** and unit-testably.
- Persist the mutated roll on the `ChatMessage`, re-render for all clients, and survive reload.
- Mark the message as modified and preserve enough of the original to audit (original die/result →
  replacement, who did it, and when).
- Gate the action to **GM or message author**, mirroring `ApplyCrit`/`ApplyDamage`.

## 3. Non-goals

- No editing of standard/polyhedral dice or non-FFG terms (right-click is only wired to FFG glyphs).
- No re-roll of the whole pool (exists elsewhere), no undo stack beyond the single audit trail.
- No user-chosen face for the fresh die (Dice mode rolls randomly).
- No change to roll creation or the dice-pool builder UI.
- No new socket/permission primitive for V13 — reuse the existing gate; a narrow `gm-bridge.js`
  extension is specified only as a V14 fallback (§5.6, §8).

## 4. Background — how an FFG roll is structured today (verified in-repo)

Grounding, because the whole design rides on these facts:

- **`RollFFG` (`modules/dice/roll.js`)** extends core `Roll`. It carries:
  - `this.ffg = {success, failure, advantage, threat, triumph, despair, light, dark}` — the
    **post-cancellation** totals. Cancellation is `evaluate()` lines ~187‑201; only
    success↔failure and advantage↔threat cancel — **light/dark and triumph/despair are never cancelled**.
  - `this.addedResults[]` — injected symbols, each `{type, symbol:"[SU]"…, value, negative}`.
    Rendered in both the card and tooltip. Natural home for Result‑mode appends.
  - Triumph→success / despair→failure coupling for *injected* symbols is done by hand in the
    **constructor** (lines ~73‑91): a Triumph bumps both `ffg.triumph` and `ffg.success`.
  - `toJSON()` / `static fromData()` (lines 396‑417) persist `ffg, hasFFG, hasStandard, data,
    addedResults, flavorText`. **Anything new we add to the roll must round‑trip here.**
- **Dice terms** (`modules/dice/dietype/*Die.js`): each `extends foundry.dice.terms.DiceTerm`. The
  denomination is a **static class field** — `static DENOMINATION` — accessed as
  `term.constructor.DENOMINATION` (`p a b i c s f`; there is **no** instance `term.denom`). `roll()`
  sets, per face, `result.ffg = CONFIG.FFG.<TYPE>_RESULTS[result.result]` — each result object already
  carries its per-face symbol tally (and `image`/`label`). `evaluate()` aggregates those into
  `term.ffg`. **`getResultLabel(result)` returns the `<img>` glyph keyed on the term's own class** — so
  a face of one die type cannot be rendered inside another type's term (this is exactly why a
  cross-type replacement must become its own term).
- **Per-face tables** (`modules/config/ffg-dice.js`, `configureDice()`): e.g.
  `PROFICIENCY_RESULTS[12] = {success:1, triumph:1, …}` and `CHALLENGE_RESULTS[12] =
  {failure:1, despair:1, …}`. **The triumph→success / despair→failure coupling for *dice* is already
  baked into these tables.** So the recompute applies the coupling manually **only** to `addedResults`.
- **Registration** (`modules/swffg-main.js`): `game.ffg.diceterms = [Ability, Boost, Challenge,
  Difficulty, Force, Proficiency, Setback]Die` (line 184); `CONFIG.Dice.terms` maps denominations
  `a b c i f p s` → classes (lines 215‑221); `CONFIG.Dice.rolls[0] = RollFFG` (line 212).
- **Render** (`roll.js` `render()`, lines 245‑341): builds
  `ffgDice = this.dice.map(d => ({isFFG, rolls: d.results.map(r => ({result: d.getResultLabel(r)}))}))`
  (lines 291‑303, re-verified — note `d.getResultLabel(r)` at 293‑300 uses the term's class) and passes
  `addedResults`, `ffg`, and `diceresults: CONFIG.FFG.diceresults` (= `pool_results`,
  `swffg-config.js:27`) to `templates/dice/roll-ffg.html`. **The visible dice card is produced by
  `RollFFG#render()` at message-render time**; `content` is only the numeric total. Updating the stored
  roll and re-rendering the message regenerates the card — the core mechanism this feature relies on.
- **Card order is term/result order.** `render()` maps `this.dice` in order and each `d.results` in
  order; `roll-ffg.html` (~23‑29) prints exactly that. So `DicePoolFFG.renderDiceExpression()`
  (`modules/dice/pool.js:280‑288`) `2dp+1da` renders `p1, p2, a1`. **Any "in place" claim must preserve
  this order.**
- **`this.dice` is a getter** (core `Roll`) over `this.terms` (plus `_dice`, empty for a plain FFG
  pool). For a normal pool, `roll.dice[k]` **is** the same `DiceTerm` object as in `roll.terms`.
- **Chat hook** (`swffg-main.js:1473`): `Hooks.on("renderChatMessageHTML", async (message, html) =>
  …)` — `html` is a **native HTMLElement**; the code wraps `$html = $(html)` and calls
  `ApplyDamage.bindChatMessage` / `ApplyCrit.bindChatMessage` (1481‑1482). New binding goes here.

## 5. Architecture

### 5.1 Data-model changes to the persisted roll

One additive field on `RollFFG`, round-tripped through `toJSON()`/`fromData()`:

- `this.modifications = []` — the audit trail (see §5.7).

Everything else is edited in place on **existing** persisted structures: `this.terms` (dice
add/remove/split), `this.addedResults` (result append), and `this.ffg` (recomputed).

```js
// toJSON(): after the existing json.addedResults / json.flavorText
json.modifications = this.modifications ?? [];
// fromData(): after the existing roll.addedResults / roll.flavorText
roll.modifications = data.modifications ?? [];
```

Core `Roll#toJSON` already serializes `terms` (each `term.toJSON()` includes `results`, and each result
object still carries our custom `.ffg`), `formula`, `total`, `evaluated`; `RollFFG#toJSON` adds
`ffg`/`addedResults`. A fresh die inserted into `terms`, a split term, a spliced result, and an
appended `addedResults` entry all persist and reconstruct with **no schema change** — provided every
object placed into `terms` is a real `RollTerm` (see §5.2 Blocker fix).

**Symbol-token normalization (correctness guard).** `render()` calls `updateSymbols()`, which mutates
`addedResults[i].symbol` in place, enriching `"[AD]"` → `<img…>`. To avoid persisting enriched HTML
(double-enriched on the next render), the mutation routine rewrites every `addedResults[i].symbol` from
its `type` via a fixed token map before persisting:

```
Success:[SU] Failure:[FA] Advantage:[AD] Threat:[TH] Triumph:[TR] Despair:[DE] Light:[LI] Dark:[DA]
```

### 5.2 Recompute + in-place mutation algorithm

The FFG totals are **derived** and must be recomputed from raw (pre-cancellation) inputs — `this.ffg`
is stored already-cancelled, and `evaluate()` throws once `_evaluated`. So we recompute from scratch
after every mutation. New module `modules/dice/replace-die.js` holds the pure helpers plus a live
wrapper.

**(a) Denomination → result-table map, zero tally, and defensive per-face tally** (never assume
`r.ffg` exists):

```js
const RESULTS_BY_DENOM = { p:"PROFICIENCY_RESULTS", a:"ABILITY_RESULTS", b:"BOOST_RESULTS",
  i:"DIFFICULTY_RESULTS", c:"CHALLENGE_RESULTS", s:"SETBACK_RESULTS", f:"FORCE_RESULTS" };

export const zeroTally = () =>
  ({ success:0, failure:0, advantage:0, threat:0, triumph:0, despair:0, light:0, dark:0 });

export function faceTally(die, r) {
  if (!r || r.active === false) return null;                 // skip discarded/inactive faces
  if (r.ffg) return r.ffg;                                   // normal path (round-tripped)
  const table = CONFIG.FFG?.[RESULTS_BY_DENOM[die?.constructor?.DENOMINATION]];
  return table?.[r.result] ?? null;                          // recover legacy/malformed face
}
```

**(b) Pure totals** (zero Foundry deps → unit-testable):

```js
export function computeFFGTotals(faceTallies, added) {
  const t = zeroTally();
  for (const f of faceTallies) if (f) for (const k of Object.keys(t)) t[k] += Number(f[k]) || 0;
  for (const a of added) {
    const v = (a.negative ? -1 : 1) * (Number(a.value) || 0);
    switch (a.type) {
      case "Success":  t.success  += v; break;
      case "Failure":  t.failure  += v; break;
      case "Advantage":t.advantage+= v; break;
      case "Threat":   t.threat   += v; break;
      case "Light":    t.light    += v; break;
      case "Dark":     t.dark     += v; break;
      case "Triumph":  t.triumph  += v; t.success += v; break; // coupling (constructor parity)
      case "Despair":  t.despair  += v; t.failure += v; break; // coupling (constructor parity)
    }
  }
  if (t.success < t.failure) { t.failure -= t.success; t.success = 0; }
  else                       { t.success -= t.failure; t.failure = 0; }
  if (t.advantage < t.threat){ t.threat -= t.advantage; t.advantage = 0; }
  else                       { t.advantage -= t.threat; t.threat = 0; }
  return t; // light/dark and triumph/despair intentionally uncancelled — matches evaluate()
}
```

**(c) Term-tally recompute** (keep `term.ffg` internally consistent, not stale):

```js
export function recomputeTermFFG(term) {
  const agg = zeroTally();
  for (const r of term.results) { const f = faceTally(term, r); if (f) for (const k of Object.keys(agg)) agg[k] += Number(f[k]) || 0; }
  term.ffg = agg;
}
```

**(d) Roll-level recompute wrapper:**

```js
export function recomputeRollFFG(roll) {
  const faces = roll.dice
    .filter(d => game.ffg.diceterms.includes(d.constructor))
    .flatMap(d => d.results.map(r => faceTally(d, r)))
    .filter(Boolean);
  roll.ffg = computeFFGTotals(faces, roll.addedResults ?? []);
}
```

#### In-place replacement (the Major from round 1, hardened in round 2)

The clicked glyph maps to `(dieIndex, resultIndex)` in the current render (§5.3). The card renders in
term/result order (§4), so the replacement must occupy the clicked coordinate. Because
`getResultLabel` is keyed on the term's class, a **different**-type replacement must become its own
term; a **same**-type replacement can stay inside the term.

Build an evaluated one-type term from already-evaluated result objects (used when a multi-die term is
split; reuses the existing result objects, no re-roll):

```js
function cloneEvaluatedTerm(SourceClass, results) {
  const t = new SourceClass(1);          // ctor arg immaterial; we set number/results explicitly
  t.results = results; t.number = results.length;
  t._evaluated = true; t._isFFG = true;
  recomputeTermFFG(t);
  return t;
}
```

**Pure ordering core — adapters injected (Blocker fix).** The helper must not know how a term exposes
its denomination or how to build an operator; both are injected so the *same* pure function serves the
model-shaped unit tests and the live Foundry-shaped call:

```js
// getDenom(term) -> denomination string; makeOperator("+") -> an additive operator term;
// makeTerm(sourceTerm, results) -> a term of sourceTerm's type carrying `results`.
export function spliceReplacement(terms, ti, j, freshTerm, { getDenom, makeOperator, makeTerm }) {
  const term = terms[ti];
  const before = term.results.slice(0, j);
  const after  = term.results.slice(j + 1);
  let segments;
  if (getDenom(freshTerm) === getDenom(term)) {
    // Same type → in-place single-face swap; stays one term, position unchanged.
    const results = term.results.slice();
    results[j] = freshTerm.results[0];
    segments = [makeTerm(term, results)];
  } else {
    // Different type → split the term around j and drop the fresh one-die term into the gap.
    segments = [];
    if (before.length) segments.push(makeTerm(term, before));
    segments.push(freshTerm);
    if (after.length)  segments.push(makeTerm(term, after));
  }
  const insert = [];
  segments.forEach((s, k) => { if (k) insert.push(makeOperator("+")); insert.push(s); }); // real ops
  const out = terms.slice();
  out.splice(ti, 1, ...insert);
  return out;
}
```

Because exactly the `ti` slot is replaced by `segments` joined with real `+` operator terms, the
operators that already flanked the term still connect to the first/last segment — no dangling or
doubled operator for any `j` (leading/middle/trailing) or term size. Worked examples: `2dp+1da` replace
`(0,0)`→boost ⇒ `b,p,a`; replace `(0,1)`→boost ⇒ `p,b,a`; same-denom replace `(0,0)`→prof ⇒ `p*,p,a`
(one `2dp` term). Order is preserved in every case, and every produced element is a real `RollTerm`
(`DiceTerm` subclass or `OperatorTerm`) so `Roll.resetFormula()` and `Roll.toJSON()` behave.

**Live Dice-mode wrapper** — passes the live adapters (`term.constructor.DENOMINATION`, real
`OperatorTerm`), and always delegates to `spliceReplacement` so its internal denom check drives the
same/cross branch correctly (round-2 Blocker: v2 called the helper for the cross case but the helper's
`.denom` check was `undefined===undefined`, silently taking the same-type path and rendering the
foreign face from the wrong table):

```js
const term = roll.dice[dieIndex];
const ti = roll.terms.indexOf(term);
if (ti === -1) return warnAndAbort();                       // guard: inner-roll pools (out of scope)
// audit capture BEFORE mutating (see §5.7)
const removed = term.results[resultIndex];
const originalTally = foundry.utils.deepClone(faceTally(term, removed) ?? zeroTally());
const originalDenom = term.constructor?.DENOMINATION;
const originalLabel = localizeFaceLabel(term, removed);

const D = new CONFIG.Dice.terms[denom](1); await D.evaluate();   // fresh random die of chosen type
roll.terms = spliceReplacement(roll.terms, ti, resultIndex, D, {
  getDenom: t => t?.constructor?.DENOMINATION,
  makeOperator: () => new foundry.dice.terms.OperatorTerm({ operator: "+" }),
  makeTerm: (src, results) => cloneEvaluatedTerm(src.constructor, results), // recomputes term.ffg
});
```

**Removal (Result mode, and the "remove" half of the surgery).** Result mode removes the clicked face
and appends a symbol to `addedResults` (rendered in their own block), so position need not be
preserved:

```js
const term = roll.dice[dieIndex];
const removed = term.results[resultIndex];
const originalTally = foundry.utils.deepClone(faceTally(term, removed) ?? zeroTally());
const originalDenom = term.constructor?.DENOMINATION;
const originalLabel = localizeFaceLabel(term, removed);

term.results.splice(resultIndex, 1);
term.number = Math.max(0, (term.number ?? term.results.length + 1) - 1);
if (term.results.length === 0) {                            // drop empty term + one flanking operator
  const ti = roll.terms.indexOf(term);
  if (ti !== -1) {
    roll.terms.splice(ti, 1);
    const op = roll.terms[ti] ?? roll.terms[ti - 1];
    if (op instanceof foundry.dice.terms.OperatorTerm) roll.terms.splice(roll.terms.indexOf(op), 1);
  }
} else recomputeTermFFG(term);
roll.addedResults.push({ type, symbol: TOKEN[type], value: qty, negative: false });
```

Removing the whole face drops **all** symbols it contributed (e.g. Success+Advantage) — the brief's
requirement falls out because that face leaves the tally list.

**`localizeFaceLabel`** (defensive label for the audit line, §5.7):

```js
const DIE_NAME = { p:"SWFFG.DiceProficiency", a:"SWFFG.DiceAbility", b:"SWFFG.DiceBoost",
  i:"SWFFG.DiceDifficulty", c:"SWFFG.DiceChallenge", s:"SWFFG.DiceSetback", f:"SWFFG.DiceForce" };
function localizeFaceLabel(term, r) {
  const denom = term?.constructor?.DENOMINATION;
  const table = CONFIG.FFG?.[RESULTS_BY_DENOM[denom]];
  const raw = r?.ffg?.label ?? table?.[r?.result]?.label ?? "";      // Force faces use "" labels
  return raw ? game.i18n.localize(raw) : game.i18n.localize(DIE_NAME[denom] ?? "");
}
```

**Finalize (both modes):** normalize `addedResults` symbols (§5.1) → `recomputeRollFFG(roll)` →
`roll.resetFormula()` (keeps `_formula` consistent after add/split; harmless for FFG display) → push a
`roll.modifications` entry built from the captured `originalTally/originalDenom/originalLabel` (§5.7) →
persist (§5.5).

### 5.3 Chat-template change — stable per-die identity

Give each glyph the die/result coordinates so a right-click maps back to
`roll.dice[dieIndex].results[resultIndex]`.

`render()` — enrich the `ffgDice` mapping (lines 291‑303):

```js
ffgDice: this.dice.map((d, dieIndex) => ({
  isFFG: game.ffg.diceterms.includes(d.constructor),
  dieIndex,
  denom: d.constructor.DENOMINATION,
  rolls: d.results.map((r, resultIndex) => ({ result: d.getResultLabel(r), resultIndex })),
})),
```

`templates/dice/roll-ffg.html` — the `.ffgDiceArray > ol.dice-rolls` loop (~23‑29):

```hbs
{{#each ffgDice}} {{#if this.isFFG}} {{#each this.rolls}}
<li class="roll ffg-die" data-die-index="{{../dieIndex}}"
    data-result-index="{{this.resultIndex}}" data-denom="{{../denom}}">{{{this.result}}}</li>
{{/each}} {{/if}} {{/each}}
```

Indices need only be correct **for the current render**; the handler resolves against the current
`roll.dice`, and after a mutation the message re-renders with fresh indices (a split reshuffles term
boundaries but keeps glyph order, §5.2). They are not a persistent identity — the audit trail (§5.7)
captures original identity at mutation time. The tooltip (`templates/dice/tooltip-ffg.html`, per-die
loop ~11‑15) is not marked in v1 (right-clicking a hover tooltip is awkward); a same-type split leaves
untouched terms grouped while the split term shows as smaller groups — cosmetic only.

### 5.4 Right-click trigger and modal UX (both modes)

**Trigger.** New `modules/helpers/replace-die.js` exporting a `ReplaceDie` class, bound from the
existing hook next to the Apply* binders:

```js
ReplaceDie.bindChatMessage(message, $html);   // in renderChatMessageHTML, swffg-main.js ~1482
```

`bindChatMessage(message, html)`:
- Gate first (identical to `ApplyCrit.bindChatMessage`): `const authorId = message.author?.id ??
  message.user; if (game.user.id !== authorId && !game.user.isGM) return;` — bind nothing for others.
- Delegate a `contextmenu` listener on `.ffgDiceArray li.roll.ffg-die[data-die-index]`. In the handler:
  `ev.preventDefault(); ev.stopPropagation();` — **stopPropagation is essential**: Foundry's ChatLog
  attaches a `ContextMenu` (right-click) to the whole message; without it the core "delete message"
  menu opens on top of ours. Then read `dataset.dieIndex/resultIndex/denom` and call
  `ReplaceDie.show(message, {dieIndex, resultIndex, denom})`.

**Modal** — one `DialogV2.wait({...})` (mirrors `apply-crit.js`), `foundry.applications.api.DialogV2`,
inline styles (consistent with the Apply* dialogs; no external CSS for dialog internals):

- Title: `game.i18n.format("SWFFG.ReplaceDie.DialogTitle", { die: <clicked die label> })`.
- Top mode toggle: two radios — **Replace with a die** / **Replace with a result** — toggling two
  panels via the `render` callback (the pattern `apply-crit.js` uses to wire its `±` buttons).
- **Dice panel:** 7 selectable icon buttons, one per FFG type, each showing `CONFIG.FFG.<T>_ICON` and
  the localized name (`SWFFG.DiceProficiency|DiceAbility|DiceBoost|DiceDifficulty|DiceChallenge|
  DiceSetback|DiceForce`). Selecting one stores its denomination (`p/a/b/i/c/s/f`).
- **Result panel:** 8 selectable icon buttons (`SUCCESS_ICON`…`DARK_ICON`) mapped to types
  Success/Failure/Advantage/Threat/Triumph/Despair/Light/Dark, plus `<input type="number" min="1"
  value="1">` quantity.
- Buttons: **Replace** (`action:"replace"`, `default:true`, icon `fa-check`) and **Cancel** (`fa-times`,
  reuse `SWFFG.ApplyDamage.Cancel`). `rejectClose:false`.
- The `replace` callback validates a selection (else warn `SWFFG.ReplaceDie.NoSelection`), then runs the
  §5.2 mutation + §5.5 persist.

### 5.5 Persistence and re-render

The mutation runs on the acting client, which then writes the whole roll back:

```js
recomputeRollFFG(roll);
await message.update({
  rolls: message.rolls.map((r, i) => (i === 0 ? JSON.stringify(roll) : JSON.stringify(r))),
  flags: { starwarsffg: { diceModified: true, modifiedBy: game.user.id } },
});
```

- `ChatMessage#rolls` is a JSON field of serialized rolls; `JSON.stringify(roll)` invokes
  `RollFFG#toJSON()`, producing the FFG-augmented payload with the new `modifications`. Updating the
  message triggers `renderChatMessageHTML` on **every** client, which re-invokes `RollFFG#render()`
  against the reconstructed roll → card and totals update for all, and survive reload.
- The fresh die (Dice mode) is evaluated **once** on the acting client and its concrete result is
  persisted, so every client sees the same outcome — not re-rolled per client.
- The `flags.starwarsffg.diceModified/modifiedBy` mirror is a cheap hook-level flag; the authoritative
  audit is on the roll (§5.7).

Source-verification status: the direct-update path is confirmed against **local V13 source**
(`ChatMessage.rolls` is a JSON field; the author is treated as owner; render regenerates roll HTML from
`this.rolls`). V14 is treated as API-doc-consistent but **not** verified from this checkout — see §5.6/§8.

### 5.6 Permissions and GM forwarding

- **Gate:** GM or message author, enforced in `bindChatMessage` exactly as `ApplyCrit`/`ApplyDamage`
  (`game.user.id !== (message.author?.id ?? message.user) && !game.user.isGM`).
- **The DB write needs no bridge on V13.** Unlike Apply Damage/Crit — which write to a **target actor**
  the player does not own, hence `gm-bridge.js` — here the write target is the **ChatMessage itself**.
  On local V13 source, a message treats its **author as owner**, and default document update permission
  is **owner**; a GM can update any document. Those are exactly the two gated actors, so
  `message.update(...)` succeeds directly for both; no socket forwarding is required.
- **V14 caveat and fallback (round-1 Question).** This checkout has no V14 source, so "author is owner
  for update" on V14 is asserted from the public API docs (`renderChatMessageHTML(message, html,
  context?)` hook; `ChatMessage.update(data, operation?)`), not source-verified here. The design (1)
  keeps the no-bridge direct update for V13, (2) adds an explicit V14 verification item (§8), and (3)
  specifies a narrow fallback **only if** V14 testing shows a non-GM author cannot update their own
  message: a new `gm-bridge.js` op `{type:"update-message", messageUuid, update}` forwarded to
  `game.users.activeGM`, mirroring the existing `applyToTargetActor`/`performApply`/`registerGMBridge`
  shape (`performApply` gains a branch that resolves the message via `fromUuid` and calls
  `message.update(op.update)`).

### 5.7 The "modified" audit marker — storage and surfacing

**Storage — on the roll** (`roll.modifications`, round-tripped per §5.1). One entry per replacement,
with a timestamp, and the original tally/label captured through the **same defensive path** used by
recompute (round-2 Minor — no raw `{...removed.ffg}` spread, which could lose symbols or throw on a
malformed/legacy face):

```js
{
  by: game.user.id, byName: game.user.name,
  at: new Date().toISOString(),                       // when — for post-reload / export auditing
  mode: "dice" | "result",
  original: {
    denom: originalDenom,                             // term.constructor.DENOMINATION
    face:  removed.result,
    label: originalLabel,                             // localizeFaceLabel(term, removed) — table fallback
    ffg:   originalTally,                             // deepClone(faceTally(term, removed) ?? zeroTally())
  },
  replacement: mode === "dice"
      ? { kind: "die", denom }
      : { kind: "result", type, symbol: TOKEN[type], value: qty },
}
```

Capturing `originalTally` via `foundry.utils.deepClone(faceTally(...) ?? zeroTally())` (a) survives a
missing/inactive `r.ffg` exactly as recompute does, and (b) snapshots the tally instead of aliasing the
shared `CONFIG.FFG.*_RESULTS` object (which `configureDice()` can rebuild on theme change).
`new Date().toISOString()` is runtime code in the live handler; it is not subject to the workflow-script
`Date` restriction.

Storing on the roll means the marker is available inside `RollFFG#render()` with no message plumbing,
travels with the roll, and reuses the serialization we already extend. It **is** stored on the message
(the roll is part of `message.rolls`). The `flags.starwarsffg.diceModified` mirror (§5.5) is the
quick-check duplicate.

**Surfacing — in the card.** `render()` adds to `chatData`:
`modified: (this.modifications?.length ?? 0) > 0` and `modifications: this.modifications`.
`roll-ffg.html`, when `modified`, renders a small badge near the flavor/label row (`<span
class="ffg-modified-badge" title="…">✎ {{localize "SWFFG.ReplaceDie.ModifiedBadge"}}</span>`) plus an
expandable list, one line per entry: "**{byName}** ({at}): {original.label} → {replacement summary}",
using the stored glyphs/labels so the original — and when it changed — is visible after the die is gone.

### 5.8 CSS (hand-maintained — edit BOTH exact files)

Per the standing rule, add identical rules to **`styles/starwarsffg.css` AND `styles/mandar.css`**;
never recompile from SCSS. (`system.json` loads `styles/starwarsffg.css`; `swffg-main.js:355‑365`
disables it under the `mandar`/`mandarBeskarAstromech` theme, and `styles/mandarBeskarAstromech.css`
imports `styles/mandar.css` — so a rule must live in both to show in either theme.) New selectors:
- `.ffg-die { cursor: context-menu; }` (right-clickable affordance).
- `.ffg-modified-badge { … }` — small inline chip.
The dialog uses inline styles like the Apply* dialogs, so no dialog CSS is required.

### 5.9 Localization (new `SWFFG.ReplaceDie.*` — add to ALL `lang/*.json`)

The brief requires the keys in `lang/en.json` **and every other present language file**. Verified set
(7 files): `ca.json, de.json, en.json, es.json, fr.json, pt-BR.json, ua.json`. Add the same
`SWFFG.ReplaceDie.*` keys to **all seven**; English fallback text is acceptable for locales not yet
translated, but the keys must be present in each file so a non-English world never shows raw
`SWFFG.ReplaceDie.*` strings.

New keys: `ContextLabel` ("Replace with dice / result"), `DialogTitle` ("Replace {die}"), `ModeDie`
("Replace with a die"), `ModeResult` ("Replace with a result"), `Quantity` ("Quantity"), `Replace`
("Replace"), `ModifiedBadge` ("Modified"), `NoSelection` ("Choose a die or a result first.").
Reuse `SWFFG.Dice*` (die names, 344‑350), `SWFFG.RollResult*` (symbol names, 603‑610; plurals),
`SWFFG.ButtonRoll` (359), `SWFFG.ApplyDamage.Cancel`.

### 5.10 Files touched

- **New:** `modules/helpers/replace-die.js` (`ReplaceDie` — bind, modal, mutate, persist).
- **New:** `modules/dice/replace-die.js` (`faceTally`, `zeroTally`, `computeFFGTotals`,
  `recomputeTermFFG`, `recomputeRollFFG`, `spliceReplacement`, `cloneEvaluatedTerm`,
  `localizeFaceLabel` — pure helpers + wrapper).
- **Edit:** `modules/dice/roll.js` — `ffgDice` identity in `render()`; `modified`/`modifications` into
  `chatData`; `modifications` in `toJSON`/`fromData`.
- **Edit:** `modules/swffg-main.js` — import + call `ReplaceDie.bindChatMessage` in the hook (~1482);
  (V14 fallback only) a `update-message` branch if `gm-bridge.js` is extended.
- **Edit:** `templates/dice/roll-ffg.html` — `data-*` on die `<li>`; modified badge/list block.
- **Edit:** all seven `lang/*.json` — `SWFFG.ReplaceDie.*` (§5.9).
- **Edit:** `styles/starwarsffg.css` **and** `styles/mandar.css` — the selectors in §5.8.
- **(V14 fallback only) Edit:** `modules/helpers/gm-bridge.js` — `update-message` op (§5.6).

## 6. Alternatives considered

**A. Where replacement state is stored.**
- *Chosen — mutate the persisted `RollFFG` on `message.rolls[0]`.* The card is a pure function of the
  roll (`render()`), so recompute+re-render is automatic and reload-safe.
- *Rejected — deltas in `message.flags` patched into the DOM.* Forks the source of truth: `roll.ffg`
  and displayed totals would disagree, and any other consumer of `message.rolls[0].ffg` sees stale numbers.
- *Rejected — post a new message and delete the old.* Breaks message identity/ordering/references.

**B. How "track original" is surfaced.**
- *Chosen — an audit array on the roll (`roll.modifications`), badge + expandable list, with timestamp
  and defensively-captured original tally/label.*
- *Alternative — `message.flags` only, injected by the hook.* Cleaner roll object, but the card renderer
  would need the message (it doesn't get it today), forcing marker logic into the hook.
- *Alternative — keep the removed face inline as a struck-through "ghost" (`active:false`).* Most
  self-evident audit, but complicates recompute/index math; the `faceTally` `active` guard already lays
  groundwork if adopted later.

**C. In-place mutation mechanics.**
- *Chosen — adapter-injected `spliceReplacement`: same-denom single-face swap; cross-denom
  split-around-coordinate with real `OperatorTerm`s* (§5.2). Preserves glyph order and keeps untouched
  multi-die terms grouped; produces only real `RollTerm`s.
- *Rejected — append the fresh die at the tail* (v1). Violates "put in its place" and scrambles order.
- *Rejected — a helper hard-coding `term.denom` / `{op:"+"}`* (v2). Denomination lives at
  `term.constructor.DENOMINATION` and core requires real `OperatorTerm`s — the helper silently took the
  wrong branch and produced non-serializable terms (round-2 Blocker). Injecting `getDenom`/`makeOperator`
  keeps the helper pure *and* correct against the live term shape.
- *Rejected — explode the whole roll to one-die-per-term.* Trivially in-place but rewrites the term
  structure (and tooltip grouping) of untouched dice; the surgical split is more faithful.

## 7. Risks & open questions

1. **Card re-render assumption.** Assumes the FFG card is produced by `RollFFG#render()` at render time
   (content = numeric total). Verified from `toMessage()`/`render()` and local V13 source; worth a live
   check on V14 that core doesn't cache rendered roll HTML into `message.content`.
2. **`this.dice` vs `this.terms` aliasing.** The split relies on `roll.terms.indexOf(term)` finding the
   clicked die (true when `_dice` is empty — plain pools). Inner-`RollFFG` pools populate `_dice`; the
   wrapper guards (`ti === -1` → abort with a notice) and targets plain pools only.
2b. **`resetFormula()` behavior** on the installed core — confirm it rebuilds `_formula` from `terms`
   without re-evaluating (used only for tidiness; FFG display doesn't depend on it). Now safe to call
   because all inserted elements are real `RollTerm`s.
3. **Result mode always removes the clicked die** (per brief). Slightly non-obvious ("add only" might be
   expected); locked — keep a clear modal label.
4. **Dice So Nice.** The fresh Dice-mode die is evaluated directly (`die.evaluate()`), so no 3D
   animation fires. Acceptable for an edit action.
5. **Right-click capture conflicts.** Beyond core's ChatLog `ContextMenu` (handled via
   `stopPropagation`), confirm no module hijacks `contextmenu` on chat glyphs (project memory:
   statuscounter rebinds shift+click, not right-click).
6. **Added-result re-targeting.** Whether a previously appended result (or the fresh die) should itself
   be right-clickable to undo/replace. Cheap (splice `addedResults[k]`) but expands "audit" into
   "history"; v1 leaves added-result glyphs non-targetable. Open.

## 8. Verification / test plan

**Unit (pure, no DOM — extend `tests/`, run via `ffg-tests.js` in the F12 console as GM per baseline):**
- `computeFFGTotals` — success/failure cancel; advantage/threat cancel; light & dark never cancel;
  Triumph adds success (survives net-zero); Despair adds failure; negative `addedResults`; empty inputs.
- `faceTally` — returns `r.ffg` when present; recovers from `CONFIG.FFG.*_RESULTS` when `ffg` is missing;
  returns `null` for `active === false`; malformed face → `null` (no silent zero-tally bug).
- `recomputeTermFFG` — matches the die's `evaluate()` aggregation over its results.
- `spliceReplacement` **model-shape** order tests (adapters = model accessors/factories: `getDenom = t
  => t.denom`, `makeOperator = () => ({op:"+"})`, `makeTerm = (src, res) => ({denom: src.denom, results:
  res})`): `2dp+1da` replace `(0,0)`→boost ⇒ flattened `b,p,a`; `(0,1)`→boost ⇒ `p,b,a`; middle-term
  split in `1dp+2da+1db`; same-denom swap keeps one term and exact position.
- `spliceReplacement` **live-adapter regression (Blocker)** — in the Foundry test context, build real
  `ProficiencyDie`/`AbilityDie` terms and a real `BoostDie` fresh term; call with the live adapters
  (`t => t.constructor.DENOMINATION`, real `OperatorTerm`). Assert cross-denom output is
  `[DieTerm, OperatorTerm, DieTerm, …]`, **every** output element has a callable `toJSON()`, `getDenom`
  correctly distinguishes types (cross-denom takes the split branch; same-denom takes the swap branch),
  and flattened render order is preserved.
- **Audit capture** — on a face with a missing/`undefined` `ffg`, the captured `original.ffg` equals the
  table-recovered tally (or `zeroTally()`), not `undefined`, and does not throw; `original.label`
  localizes from the table fallback (and to the die-type name for empty Force labels).

**Manual (Foundry, GM + player clients):** roll `2dp+1da`; right-click the **first** proficiency →
Dice-mode boost → card shows boost in that slot (not at the end), totals recompute, both clients update,
badge + timestamp show, survives reload; Result-mode "+2 Advantage" → face removed, symbols appended,
cancellation correct; remove the last face of a term → term drops cleanly; permission — a third
non-author non-GM player sees no context menu; triumph/despair face swap updates the standalone tallies.

**V14 verification item (round-1 Question):** on a V14 world, confirm a non-GM **author** can
`ChatMessage.update` their own `rolls`/`flags` (author treated as owner). If it fails, enable the §5.6
`gm-bridge.js` `update-message` fallback; V13 keeps the direct path regardless.

## Review response

### Round 2 (`…_review_v2.md`)

- **Blocker — §5.2, `spliceReplacement` used test-shape terms in the live wrapper → Fixed.** The pure
  helper now takes injected `{ getDenom, makeOperator, makeTerm }` adapters and uses `getDenom(term)`
  (not `.denom`) and `makeOperator("+")` (not `{op:"+"}`). The live wrapper passes `t =>
  t.constructor?.DENOMINATION` and `() => new foundry.dice.terms.OperatorTerm({ operator:"+" })`, so the
  cross-denomination branch is actually taken and inserts real, serializable `RollTerm`s — the foreign
  face becomes its own die term (correct result table) rather than being rendered from the source
  class. Verified against `modules/dice/dietype/*Die.js` (all seven expose `static DENOMINATION`, no
  instance `.denom`) and `modules/dice/roll.js` `render()`/`toJSON`. Added the live-adapter regression
  test (cross-denom ⇒ `[DieTerm, OperatorTerm, DieTerm…]`, every term has `toJSON()`, order preserved).
- **Minor — §5.2/§5.7, audit bypassed the defensive face-tally path → Applied.** The removed face's
  tally is now captured as `foundry.utils.deepClone(faceTally(term, removed) ?? zeroTally())` and stored
  as `modifications[].original.ffg`; `original.label` is derived via `localizeFaceLabel` (result-table
  fallback) and localized at capture time. No more raw `{...removed.ffg}` spread.
- **Minor — §5.8/§5.10, stylesheet paths → Applied.** Both sections now name the exact files
  `styles/starwarsffg.css` and `styles/mandar.css` (verified present under `styles/`; `system.json`
  loads `styles/starwarsffg.css`).
- **Verified-without-findings (kept intact):** dice face-table coupling + `computeFFGTotals` no
  double-count; Result-mode empty-term operator cleanup (now with real `OperatorTerm`s); author-or-GM
  gate; V13 direct-update; 7-file localization scope.

### Round 1 (`…_review_v1.md`) — carried forward

- **Major — Dice mode not in place → Fixed** (in-place split/swap algorithm, §5.2; hardened in round 2).
- **Major — localization vs brief → Fixed** (keys in all seven `lang/*.json`, §5.9).
- **Minor — stale `term.ffg` → Applied** (`recomputeTermFFG`, §5.2).
- **Minor — guard missing/inactive faces → Applied** (`faceTally`, §5.2).
- **Minor — audit "when" → Applied** (`at: ISO`, §5.7).
- **Question — V14 verification external → Addressed** (V13 source-verified; V14 doc-only + explicit
  test item + `gm-bridge.js` fallback, §5.6/§8).

**Locked brief decisions preserved:** permanent/shared mutation with recompute + re-render; audit of
original→replacement; GM-or-author gate; Result-mode result **and** count; FFG-only scope (7 dice / 8
symbols); native `contextmenu` trigger; random fresh die; whole-face removal; ApplicationV2/DialogV2;
CSS in both stylesheets; no SCSS recompile.
