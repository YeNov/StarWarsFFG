# Parry and Reflect in Apply Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Apply Damage offer Parry (melee) / Reflect (ranged), or GM-listed equivalents, as a toggle that reduces the hit before soak and charges its strain cost in the same guarded write.

**Architecture:** A new Foundry-free rules module (`defensive-talents.js`) decides which talent applies, the reduction, the cost and incapacitation. `apply-damage-plan.js` folds the reduction into the hit and returns a two-pool `changes` list. The GM bridge accepts that list, validates it on every execution path and re-checks the cost against the live actor inside the writer's per-actor queue. The apply coordinator probes the elected writer for the `defensive-damage-v1` capability before it sends a talent application. The dialog only draws the toggle and reads the settings.

**Tech Stack:** Foundry VTT V14 system (ES modules, ApplicationV2 `DialogV2`), Node 24 `node:test` for the Node tier (`npm test`), `npm run check:imports`.

**Spec:** [docs/superpowers/specs/2026-10-04-parry-reflect-apply-damage-design.md](../specs/2026-10-04-parry-reflect-apply-damage-design.md). Read it before starting a task; this plan argues from it.

## Global Constraints

- Rulesets: `vanilla` (default) and `respecialized`, world setting `defensiveTalentRuleset`. The reSpecialized target is **v.56**. Task 0 checked Block and Unarmed Block against their v.56 talent text, and Deflect against its text in the v.58 Arbiter document (no v.56 Deflect text could be read; it is assumed unchanged). Its sources are listed there.
- Name-list settings and defaults, verbatim: `meleeDefenceTalents` = `Parry, Block`; `rangedDefenceTalents` = `Reflect, Deflect`; `meleeSupremeTalents` = `Parry (Supreme), Supreme Parry`; `rangedSupremeTalents` = `Reflect (Supreme), Supreme Reflect`; `unarmedParryTalents` = `Unarmed Parry, Unarmed Block`.
- Every new setting is `scope: "world"`, `config: false`, and shown only in the new `defensiveTalentSettings` menu, registered with `restricted: true`.
- Names are comma-separated, trimmed, and matched whole and case-insensitively. An empty list turns that row off.
- Melee = `MELEE_DEFENCE_SKILLS` (Melee, Brawl, Lightsaber); ranged = `RANGED_DEFENCE_SKILLS` (Ranged: Light, Ranged: Heavy, Gunnery); any other skill gets no toggle. Vehicles never get one.
- Reduction: vanilla `2 + ranks`, with ranks summed over matching `talentList` entries and an unranked entry counting as 1; reSpecialized a flat `4` (unranked Block and Deflect, with Parry and Reflect as compatibility aliases). `reduced = max(0, damage - reduction)`, `applied = max(0, reduced - effectiveSoak)`.
- Cost: 3; Supreme → 1; Unarmed (melee only) → `max(1, cost - 1)`, applied after Supreme. The same in both rulesets: Block and Deflect cost 3 strain, Unarmed Block is Unarmed Parry's −1, and reSpecialized has no Supreme variant. Characters and nemeses pay strain; rivals pay wounds. Minions cannot voluntarily suffer strain and get no talent toggle in either mode; ordinary damage to minions is unchanged.
- Incapacitation: `current + cost > threshold`. Exactly at the threshold is allowed. A threshold that is not a positive number never disables anything. Only the cost is counted, never the hit.
- The talent toggle is greyed out (`disabled`, **no tooltip**) when the cheapest available cost would incapacitate. With the toggle on and the selected cost unaffordable, **Apply** is greyed out, with no explanation line.
- An unaffordable talent already selected stays selected. Its main toggle remains enabled so the user can turn it off explicitly; refresh never clears the selection or silently falls back to ordinary damage.
- The dialog never shows ranks or the reduction, the GM's dialog included. The public line adds only "{actorName} parries." (melee) or "{actorName} deflects." (ranged), in both rulesets, with no numbers.
- A talent application is one `actor.update` covering both pools. With no talent, Apply Damage keeps sending the legacy `{ path, delta }` form.
- Capability `defensive-damage-v1`: probe the elected writer, wait **5 seconds** for a positive reply, never reroute to an unverified writer, and don't cache the answer across applications.
- An unaffordable cost at the writer rejects the whole application with an `ApplyRequestError`: neither pool is written and neither chat message is posted.
- Project rules (CLAUDE.md): write the CHANGELOG entry before pushing; update the wiki in the same sitting; never write absolute local paths, emails or machine names into tracked files; GitHub writes go to `YeNov/StarWarsFFG` only.
- CSS: `styles/starwarsffg.css` is hand-maintained, so never commit `npm run compile` output. A dialog style goes in the SCSS partial, is hand-copied into `styles/starwarsffg.css`, and goes into `styles/mandar.css` too (the default theme).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Where this plan departs from the spec's wording

- The spec's plan object lists `costLabelKey`. The plan uses `unit` (`"strain"` or `"wounds"`) plus `unitLabelKey(unit, count)` instead, because "1 wound" and "3 wounds" need different words.
- The rules module also exports `defenceCostPool`, `readCostPool`, `planDefenceControls` and `DEFENSIVE_TALENT_LISTS`, so the dialog, the writer and the settings all share them.
- Refusals carry a stable `code` on `ApplyRequestError` (`defence-unaffordable`, `writer-outdated`). That lets the requesting client show its *own* localized warning, not the writer's English message.

## File Structure

| File | Responsibility |
|---|---|
| `modules/helpers/defensive-talents.js` (new) | All Parry/Reflect rules. No Foundry access. |
| `modules/helpers/apply-damage-plan.js` | Adds the reduction, `changes` and `defenceCost` to a hit. |
| `modules/helpers/actor-apply-coordinator.js` | `ApplyRequestError` codes, their propagation, and the capability probe. |
| `modules/helpers/gm-bridge.js` | Narrows the `changes` form, `planDamageWrite` with the live cost check, socket routing for the probe. |
| `modules/helpers/apply-damage.js` | Dialog toggle, settings read, request building, chat lines. |
| `modules/swffg-main.js` | Registers the six settings. |
| `modules/settings/ui-settings.js`, `modules/settings/settings-helpers.js` | The Parry & Reflect menu. |
| `lang/en.json` | Settings and dialog strings. |
| `scss/components/_chat_actions.scss`, `styles/starwarsffg.css`, `styles/mandar.css` | Toggle pressed and disabled styles. |
| `tests/node/defensive-talents.test.mjs` (new) | Rules. |
| `tests/node/defensive-talents-lang.test.mjs` (new) | Every key the rules and settings use exists in English. |
| `tests/node/apply-damage.test.mjs` | Reduction and `changes`. |
| `tests/node/gm-bridge-apply.test.mjs` | Narrowing and `planDamageWrite`. |
| `tests/node/actor-apply-coordinator.test.mjs` | Codes and the capability probe. |
| `tests/node/defensive-damage-apply.test.mjs` (new) | End to end: the coordinator plus the real writer check. |

Baseline before Task 1: `npm test` passes 916 tests with 0 failures, and `npm run check:imports` reports PASS.

---

### Task 0: Verify and record the supported reSpecialized revision

- [x] Read the [author's v.56 release notes](https://forum.swrpgcommunity.com/t/respecialized-project-v-56-the-force-update-final-part/1628) and the linked v.56 talent text / specialization PDFs. Record the exact source links and revision in this plan and the design. Release notes establish names, not every mechanical effect.
- [x] Confirm Block and Deflect's reduction, cost and timing, and the effects and exact names of any Supreme and Unarmed variants. v.56 replaces Parry in Martial Artist and Pit Fighter and renames Unarmed Parry to **Unarmed Block**. Older Parry/Reflect names remain compatibility aliases, not a claim about current trees.
- [x] Reconcile the design, `DEFENSIVE_TALENT_LISTS`, name-default tests, cost/formula tests, settings text and wiki draft with those sources. Add `Unarmed Block` to the unarmed defaults only if its verified effect matches the cost modifier; otherwise give it the correct behavior rather than treating the rename as proof of identical mechanics. Add a v.56-named actor fixture that exercises each supported modifier.
- [x] If the PDFs cannot be read or the mechanics differ from the provisional examples, resolve that before implementing or advertising reSpecialized support. Do not present the unchecked flat-4, 3-strain and modifier assumptions as verified rules.

**Sources (read 2026-10-04).** The supported revision is **v.56**, "reSpecialized Project v.56 - The Force Update - Final Part", posted 2026-07-06. The latest release at the time of reading was v.58 (2026-08-12). Block and Unarmed Block were read in v.56 trees, and v.58's changelog does not touch them (Martial Artist 1.51 fixes only Martial Grace).

**Assumption: Deflect's text was read only in v.58.** No v.56 tree adds Deflect, and the v.56 Force & Destiny Primer could not be read (see **Not read** below), so there is no v.56 text to compare. The Arbiter document (Arbiter 1.0, released in v.58) is the earliest released tree that carries Deflect. This plan assumes Deflect is unchanged since v.56 named it, and the settings hint, the wiki draft and manual check 14 rest on that assumption.

| Source | Revision | What it settles |
|---|---|---|
| [v.56 release notes](https://forum.swrpgcommunity.com/t/respecialized-project-v-56-the-force-update-final-part/1628) | v.56 | Names, not mechanics. Block and Deflect replace Parry and Reflect, and the author calls the new reduction unranked (the talent text bears that out). Martial Artist 1.5 swaps both ranks of Parry for Block and Unyielding, Unarmed Parry for Unarmed Block, and Improved Unarmed Parry for Improved Unarmed Block. Pit Fighter 1.11 drops Parry (D5, C15) and Unarmed Parry (D10), and adds Block (C5), Unarmed Block (C15) and Improved Unarmed Block (D15). No v.56 tree adds Deflect. |
| [Martial Artist design doc](https://docs.google.com/document/d/1LQ2P_v-eGXuk6WennBKSoyKr82HgwMvASB8EAeBlHSo/edit) | Martial Artist 1.5 (v.56); read at 1.51, whose only later change fixes Martial Grace | Block's and Unarmed Block's text. Improved Unarmed Block's text. |
| [Pit Fighter design doc](https://docs.google.com/document/d/105d704JSxnH17YEqRB-2F3MEbggM_otoNzZ_ezapFkc/edit) | Pit Fighter 1.11 in the v.56 notes (the document's own changelog numbers the same change 1.2) | The same Block, Unarmed Block and Improved Unarmed Block text. |
| [Arbiter design doc](https://docs.google.com/document/d/1yZDiDEPbT-sij4UsWK7p6VVnU5XSwEIBEb2-X3LXvUU/edit) | Arbiter 1.0, released in [v.58](https://forum.swrpgcommunity.com/t/respecialized-project-v-58-the-consular-career-update/1642) | Deflect's text, the earliest released tree that carries it. Block's text again. Parry and Reflect listed as removed, replaced by Block and Deflect. |

**Verified from the talent text:**

- **Block** (active incidental, no ranks): when a melee hit lands, after damage is calculated and before soak, the character suffers 3 strain and reduces that hit's damage by 4. Once per hit, while wielding a lightsaber, a Melee weapon or another suitable item, at the GM's discretion.
- **Deflect** (active incidental, no ranks; text read in the v.58 Arbiter document, assumed unchanged since v.56): the same for a ranged hit, 3 strain for 4 off. A lightsaber counts only if the character is Force-sensitive.
- **Unarmed Block** (passive): the character may Block while unarmed, and doing so costs 1 strain less, to a minimum of 1. This matches the unarmed cost modifier, so `Unarmed Block` joins `unarmedParryTalents`.
- **Improved Unarmed Block** (passive) disarms an engaged attacker whose combat check generates three threat or a despair. It changes neither the reduction nor the cost and is in no list.
- No Supreme Block, Supreme Deflect or unarmed Deflect appears in any source. The Supreme lists keep the vanilla names only.
- reSpecialized removes Parry and Reflect rather than redefining them, so in a reSpecialized world they are this system's compatibility aliases for Block and Deflect. Supreme Parry, Supreme Reflect and Unarmed Parry keep their vanilla effects there.
- Wording differs but the rules do not: the Martial Artist and Pit Fighter long texts say "melee combat check" where Arbiter says "melee attack", and Pit Fighter's long text calls the incidental "Guard".

**Not read.** The v.56 press release (two PNG images), the folios (PDF and JPG) and the Force & Destiny Primer are images or binary files that could not be read as text. The Primer folder linked from the v.56 notes now holds only the later Primer 3.0 PDF (v.58), which is over the reader's size limit. Deflect's text therefore comes from the v.58 Arbiter document, not from a v.56 document.

Vanilla's minion exclusion follows [Under a Black Sun, page 11](https://images-cdn.fantasyflightgames.com/filer_public/18/ff/18ff8afe-bf19-47a3-97e5-a313ded3d6b3/under_a_black_sun_lores.pdf#page=11): inflicted strain converts to wounds, but minions cannot voluntarily suffer strain. This feature adds no minion house-rule override.

---

### Task 1: The defensive-talent rules module

**Files:**
- Create: `modules/helpers/defensive-talents.js`
- Test: `tests/node/defensive-talents.test.mjs`

**Interfaces:**
- Consumes: `MELEE_DEFENCE_SKILLS`, `RANGED_DEFENCE_SKILLS` from `modules/helpers/defence-helpers.js`.
- Produces (all named exports):
  - `RULESET_VANILLA = "vanilla"`, `RULESET_RESPECIALIZED = "respecialized"`
  - `BASE_DEFENCE_COST = 3`, `MIN_DEFENCE_COST = 1`
  - `DEFENSIVE_TALENT_LISTS`: frozen array of `{ setting, field, label, default }`; `field` ∈ `melee | ranged | meleeSupreme | rangedSupreme | unarmed`
  - `parseTalentNames(text: string) → string[]` (lowercased)
  - `classifyAttack(skillValue: string) → "melee" | "ranged" | null`
  - `defenceCostPool(actorType: string) → { path, thresholdPath, unit } | null`
  - `readCostPool(actor) → { path, unit, current: number, threshold: number } | null`
  - `planDefensiveTalent({ actor, attack, ruleset, names }) → null | { kind, talentNames: string[], ranks, reduction, formula: { key, ranks }, hasSupreme, hasUnarmed, costPath, unit, toggleLabelKey, publicKey, current, threshold }`
  - `defenceCost({ supreme?, unarmed? }) → number`
  - `cheapestCost(plan) → number`
  - `wouldIncapacitate({ current, threshold }, cost) → boolean`
  - `planDefenceControls(plan, pool, selection) → { toggleDisabled, on, supreme, unarmed, cost, applyDisabled }`
  - `unitLabelKey(unit, count) → string`

- [ ] **Step 1: Write the failing test**

Create `tests/node/defensive-talents.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { MELEE_DEFENCE_SKILLS, RANGED_DEFENCE_SKILLS } from "../../modules/helpers/defence-helpers.js";
import {
  DEFENSIVE_TALENT_LISTS,
  RULESET_RESPECIALIZED,
  RULESET_VANILLA,
  cheapestCost,
  classifyAttack,
  defenceCost,
  defenceCostPool,
  parseTalentNames,
  planDefenceControls,
  planDefensiveTalent,
  readCostPool,
  unitLabelKey,
  wouldIncapacitate,
} from "../../modules/helpers/defensive-talents.js";

/**
 * Parry, Reflect and the GM-listed talents beside them. Everything the Apply Damage dialog and
 * the GM bridge's writer decide about them is decided here, without Foundry.
 */

/** The name lists exactly as the world defaults parse. */
const DEFAULT_NAMES = Object.fromEntries(DEFENSIVE_TALENT_LISTS.map((list) => [list.field, parseTalentNames(list.default)]));

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";

const talent = (name, rank = 1) => ({ name, rank });
const target = ({ type = "character", talents = [], strain = [0, 10], wounds = [0, 12] } = {}) => ({
  type,
  talentList: talents,
  system: { stats: { strain: { value: strain[0], max: strain[1] }, wounds: { value: wounds[0], max: wounds[1] } } },
});
const plan = (actor, { attack = "melee", ruleset = RULESET_VANILLA, names = DEFAULT_NAMES } = {}) =>
  planDefensiveTalent({ actor, attack, ruleset, names });

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

test("a name list is split on commas, trimmed, lowercased and deduplicated", () => {
  assert.deepEqual(parseTalentNames(" Parry ,BLOCK,, parry ,"), ["parry", "block"]);
  assert.deepEqual(parseTalentNames(""), []);
  assert.deepEqual(parseTalentNames("  ,  "), []);
  assert.deepEqual(parseTalentNames(undefined), []);
});

test("the world defaults cover the book, the OggDude and the reSpecialized v.56 names", () => {
  // reSpecialized v.56 adds Block, Deflect and Unarmed Block, and has no Supreme variant.
  assert.deepEqual(DEFAULT_NAMES, {
    melee: ["parry", "block"],
    ranged: ["reflect", "deflect"],
    meleeSupreme: ["parry (supreme)", "supreme parry"],
    rangedSupreme: ["reflect (supreme)", "supreme reflect"],
    unarmed: ["unarmed parry", "unarmed block"],
  });
});

test("names match whole: Improved, Supreme and Unarmed Parry are not Parry", () => {
  const actor = target({ talents: [talent("Parry (Improved)"), talent("Unarmed Parry"), talent("Parry (Supreme)")] });
  assert.equal(plan(actor), null);
});

test("names match regardless of case and surrounding spaces", () => {
  assert.equal(plan(target({ talents: [talent("  PARRY ")] })).reduction, 3);
});

test("an emptied list turns that row off", () => {
  const actor = target({ talents: [talent("Parry", 2)] });
  assert.equal(plan(actor, { names: { ...DEFAULT_NAMES, melee: [] } }), null);
});

// ---------------------------------------------------------------------------
// Which attack
// ---------------------------------------------------------------------------

test("the attacking skill decides melee or ranged, and nothing else qualifies", () => {
  for (const skill of MELEE_DEFENCE_SKILLS) assert.equal(classifyAttack(skill), "melee");
  for (const skill of RANGED_DEFENCE_SKILLS) assert.equal(classifyAttack(skill), "ranged");
  for (const skill of ["Astrogation", "melee", "", undefined, null]) assert.equal(classifyAttack(skill), null);
});

test("a melee talent is never offered against a ranged hit, nor the reverse", () => {
  assert.equal(plan(target({ talents: [talent("Parry", 2)] }), { attack: "ranged" }), null);
  assert.equal(plan(target({ talents: [talent("Reflect", 2)] }), { attack: "melee" }), null);
  assert.equal(plan(target({ talents: [talent("Parry", 2)] }), { attack: null }), null);
});

test("a target with no talent list, or a vehicle, offers nothing", () => {
  assert.equal(plan({ type: "character", system: { stats: {} } }), null);
  assert.equal(plan(target({ type: "vehicle", talents: [talent("Parry", 2)] })), null);
});

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

test("vanilla reduces by 2 plus ranks, summed over every matching entry", () => {
  assert.equal(plan(target({ talents: [talent("Parry", 1)] })).reduction, 3);
  assert.equal(plan(target({ talents: [talent("Parry", 3)] })).reduction, 5);
  // A tree's Parry and an attachment's innate Parry are two talentList entries.
  const summed = plan(target({ talents: [talent("Parry", 2), talent("Parry", 1)] }));
  assert.equal(summed.ranks, 3);
  assert.equal(summed.reduction, 5);
});

test("an unranked entry counts as one rank", () => {
  assert.equal(plan(target({ talents: [talent("Block", "N/A")] })).reduction, 3);
  assert.equal(plan(target({ talents: [talent("Block", "N/A"), talent("Parry", 2)] })).reduction, 5);
});

test("reSpecialized reduces by a flat 4 for every listed name, whatever the ranks", () => {
  // v.56 Block and Deflect: 3 strain, 4 off the hit before soak, no ranks (see Task 0's sources).
  const respec = { ruleset: RULESET_RESPECIALIZED };
  assert.equal(plan(target({ talents: [talent("Parry", 3)] }), respec).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Block", "N/A")] }), respec).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Block", "N/A"), talent("Parry", 2)] }), respec).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Reflect", 2)] }), { ...respec, attack: "ranged" }).reduction, 4);
  assert.equal(plan(target({ talents: [talent("Deflect", "N/A")] }), { ...respec, attack: "ranged" }).reduction, 4);
});

test("a reSpecialized v.56 character: Block and Deflect take 4 off, Unarmed Block cuts melee only", () => {
  // The names the v.56 Martial Artist and Pit Fighter trees and the Arbiter tree print.
  // Improved Unarmed Block disarms an attacker; it is neither Block nor Unarmed Block.
  const actor = target({
    talents: [talent("Block", "N/A"), talent("Unarmed Block", "N/A"), talent("Improved Unarmed Block", "N/A"), talent("Deflect", "N/A")],
  });
  const respec = { ruleset: RULESET_RESPECIALIZED };
  const pool = readCostPool(actor);

  const block = plan(actor, respec);
  assert.deepEqual(block.talentNames, ["Block"]);
  assert.equal(block.reduction, 4);
  assert.equal(block.formula.key, "SWFFG.ApplyDamage.Defence.FormulaRespec");
  assert.equal(block.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyBlock");
  assert.equal(block.hasUnarmed, true);
  assert.equal(block.hasSupreme, false); // reSpecialized has no Supreme Block
  assert.equal(cheapestCost(block), 2);
  assert.equal(planDefenceControls(block, pool, { on: true }).cost, 3);
  assert.equal(planDefenceControls(block, pool, { on: true, unarmed: true }).cost, 2);

  const deflect = plan(actor, { ...respec, attack: "ranged" });
  assert.deepEqual(deflect.talentNames, ["Deflect"]);
  assert.equal(deflect.reduction, 4);
  assert.equal(deflect.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyDeflect");
  assert.equal(deflect.hasUnarmed, false);
  assert.equal(deflect.hasSupreme, false);
  assert.equal(cheapestCost(deflect), 3);
  assert.equal(planDefenceControls(deflect, pool, { on: true, unarmed: true }).cost, 3);

  assert.equal(plan(target({ talents: [talent("Improved Unarmed Block", "N/A")] }), respec), null);
});

test("in a reSpecialized world Parry and Reflect, and their modifiers, stand in for Block and Deflect", () => {
  const actor = target({
    talents: [talent("Parry", 2), talent("Supreme Parry"), talent("Unarmed Parry"), talent("Reflect", 3), talent("Reflect (Supreme)")],
  });
  const respec = { ruleset: RULESET_RESPECIALIZED };

  const parry = plan(actor, respec);
  assert.equal(parry.reduction, 4);
  assert.equal(parry.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyBlock");
  assert.equal(parry.hasSupreme, true);
  assert.equal(parry.hasUnarmed, true);
  assert.equal(cheapestCost(parry), 1);

  const reflect = plan(actor, { ...respec, attack: "ranged" });
  assert.equal(reflect.reduction, 4);
  assert.equal(reflect.toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyDeflect");
  assert.equal(reflect.hasSupreme, true);
  assert.equal(reflect.hasUnarmed, false);
  assert.equal(cheapestCost(reflect), 1);

  // Unarmed Block is Unarmed Parry's effect under a new name, so it lowers an old Parry too.
  const mixed = plan(target({ talents: [talent("Parry", 1), talent("Unarmed Block", "N/A")] }), respec);
  assert.equal(mixed.hasUnarmed, true);
  assert.equal(cheapestCost(mixed), 2);
});

test("labels follow the ruleset and the attack", () => {
  const parry = target({ talents: [talent("Parry", 2)] });
  const reflect = target({ talents: [talent("Reflect", 1)] });
  const respec = { ruleset: RULESET_RESPECIALIZED };
  assert.equal(plan(parry).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyParry");
  assert.equal(plan(reflect, { attack: "ranged" }).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyReflect");
  assert.equal(plan(parry, respec).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyBlock");
  assert.equal(plan(reflect, { ...respec, attack: "ranged" }).toggleLabelKey, "SWFFG.ApplyDamage.Defence.ApplyDeflect");
  assert.equal(plan(parry).publicKey, "SWFFG.ApplyDamage.Defence.PublicMelee");
  assert.equal(plan(reflect, { attack: "ranged" }).publicKey, "SWFFG.ApplyDamage.Defence.PublicRanged");
});

test("the formula explains the reduction for the GM", () => {
  assert.deepEqual(plan(target({ talents: [talent("Parry", 2)] })).formula,
    { key: "SWFFG.ApplyDamage.Defence.FormulaVanilla", ranks: 2 });
  assert.deepEqual(plan(target({ talents: [talent("Parry", 1)] })).formula,
    { key: "SWFFG.ApplyDamage.Defence.FormulaVanillaOne", ranks: 1 });
  assert.equal(plan(target({ talents: [talent("Parry", 2)] }), { ruleset: RULESET_RESPECIALIZED }).formula.key,
    "SWFFG.ApplyDamage.Defence.FormulaRespec");
});

test("matched talent names are reported once each, as the target spells them", () => {
  assert.deepEqual(plan(target({ talents: [talent("Parry", 1), talent("parry", 1), talent("Block", "N/A")] })).talentNames,
    ["Parry", "Block"]);
});

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

test("the cost is 3, Supreme makes it 1, Unarmed takes 1 off but never below 1", () => {
  assert.equal(defenceCost(), 3);
  assert.equal(defenceCost({ supreme: true }), 1);
  assert.equal(defenceCost({ unarmed: true }), 2);
  assert.equal(defenceCost({ supreme: true, unarmed: true }), 1);
});

test("Supreme is per category, and Unarmed is melee only", () => {
  const melee = plan(target({ talents: [talent("Parry"), talent("Parry (Supreme)"), talent("Unarmed Parry")] }));
  assert.equal(melee.hasSupreme, true);
  assert.equal(melee.hasUnarmed, true);

  const ranged = plan(target({ talents: [talent("Reflect"), talent("Supreme Parry"), talent("Unarmed Parry")] }), { attack: "ranged" });
  assert.equal(ranged.hasSupreme, false);
  assert.equal(ranged.hasUnarmed, false);
  assert.equal(plan(target({ talents: [talent("Reflect"), talent("Supreme Reflect")] }), { attack: "ranged" }).hasSupreme, true);
});

test("the cheapest cost is what the target's own modifiers allow", () => {
  assert.equal(cheapestCost({ hasSupreme: false, hasUnarmed: false }), 3);
  assert.equal(cheapestCost({ hasSupreme: false, hasUnarmed: true }), 2);
  assert.equal(cheapestCost({ hasSupreme: true, hasUnarmed: false }), 1);
  assert.equal(cheapestCost({ hasSupreme: true, hasUnarmed: true }), 1);
});

test("characters and nemeses pay strain; rivals pay wounds; minions and vehicles cannot activate", () => {
  for (const type of ["character", "nemesis"]) {
    assert.equal(defenceCostPool(type).path, STRAIN);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).costPath, STRAIN);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).unit, "strain");
  }
  for (const type of ["rival"]) {
    assert.equal(defenceCostPool(type).path, WOUNDS);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).costPath, WOUNDS);
    assert.equal(plan(target({ type, talents: [talent("Parry")] })).unit, "wounds");
  }
  for (const type of ["minion", "vehicle"]) {
    assert.equal(defenceCostPool(type), null);
    assert.equal(readCostPool(target({ type })), null);
    for (const ruleset of [RULESET_VANILLA, RULESET_RESPECIALIZED]) {
      assert.equal(plan(target({ type, talents: [talent("Parry")] }), { ruleset }), null);
    }
  }
});

test("the cost pool is read from the actor as it stands", () => {
  assert.deepEqual(readCostPool(target({ strain: [7, 10] })), { path: STRAIN, unit: "strain", current: 7, threshold: 10 });
  assert.deepEqual(readCostPool(target({ type: "rival", wounds: [4, 9] })), { path: WOUNDS, unit: "wounds", current: 4, threshold: 9 });
});

// ---------------------------------------------------------------------------
// Incapacitation
// ---------------------------------------------------------------------------

test("only exceeding the threshold incapacitates", () => {
  assert.equal(wouldIncapacitate({ current: 6, threshold: 10 }, 3), false);
  assert.equal(wouldIncapacitate({ current: 7, threshold: 10 }, 3), false);
  assert.equal(wouldIncapacitate({ current: 8, threshold: 10 }, 3), true);
  assert.equal(wouldIncapacitate({ current: 11, threshold: 10 }, 1), true);
});

test("an unknown threshold never disables anything", () => {
  for (const threshold of [0, -2, NaN, undefined]) {
    assert.equal(wouldIncapacitate({ current: 50, threshold }, 3), false);
  }
});

test("the toggle is greyed out when even the cheapest cost incapacitates", () => {
  const parryOnly = plan(target({ talents: [talent("Parry")], strain: [8, 10] }));
  const controls = planDefenceControls(parryOnly, readCostPool(target({ strain: [8, 10] })), { on: false });
  assert.equal(controls.toggleDisabled, true);
  assert.equal(controls.on, false);
  assert.equal(controls.applyDisabled, false);
});

test("Apply is greyed out while the selected cost is too much but a cheaper one is not", () => {
  const actor = target({ talents: [talent("Parry"), talent("Supreme Parry")], strain: [8, 10] });
  const parry = plan(actor);
  const pool = readCostPool(actor);

  const full = planDefenceControls(parry, pool, { on: true });
  assert.deepEqual(full, { toggleDisabled: false, on: true, supreme: false, unarmed: false, cost: 3, applyDisabled: true });

  const supreme = planDefenceControls(parry, pool, { on: true, supreme: true });
  assert.deepEqual(supreme, { toggleDisabled: false, on: true, supreme: true, unarmed: false, cost: 1, applyDisabled: false });
});

test("a modifier the target lacks, or a toggle left off, changes nothing", () => {
  const actor = target({ talents: [talent("Parry")] });
  const parry = plan(actor);
  assert.equal(planDefenceControls(parry, readCostPool(actor), { on: true, supreme: true, unarmed: true }).cost, 3);
  assert.deepEqual(planDefenceControls(parry, readCostPool(actor), { supreme: true }),
    { toggleDisabled: false, on: false, supreme: false, unarmed: false, cost: 3, applyDisabled: false });
});

test("the controls fall back to the plan's numbers when no live pool is given", () => {
  const parry = plan(target({ talents: [talent("Parry")], strain: [8, 10] }));
  assert.equal(planDefenceControls(parry, null, { on: false }).toggleDisabled, true);
});

test("a selected defence stays selected after strain rises and a modifier refreshes", () => {
  const actor = target({ talents: [talent("Parry"), talent("Supreme Parry"), talent("Unarmed Parry")], strain: [7, 10] });
  const parry = plan(actor);
  const selection = { on: true, supreme: true, unarmed: false };
  assert.equal(planDefenceControls(parry, readCostPool(actor), selection).applyDisabled, false);

  actor.system.stats.strain.value = 10;
  selection.unarmed = true; // a visible modifier click triggers refresh
  const controls = planDefenceControls(parry, readCostPool(actor), selection);
  assert.equal(controls.on, true);
  assert.equal(controls.supreme, true);
  assert.equal(controls.unarmed, true);
  assert.equal(controls.applyDisabled, true);
  assert.equal(controls.toggleDisabled, false); // the user can explicitly turn it off
  assert.deepEqual(selection, { on: true, supreme: true, unarmed: true });

  selection.on = false;
  const off = planDefenceControls(parry, readCostPool(actor), selection);
  assert.equal(off.on, false);
  assert.equal(off.toggleDisabled, true);
  assert.equal(off.applyDisabled, false);
});

test("unit words follow the pool and the count", () => {
  assert.equal(unitLabelKey("strain", 1), "SWFFG.ApplyDamage.Defence.UnitStrain");
  assert.equal(unitLabelKey("strain", 3), "SWFFG.ApplyDamage.Defence.UnitStrain");
  assert.equal(unitLabelKey("wounds", 1), "SWFFG.ApplyDamage.Defence.UnitWound");
  assert.equal(unitLabelKey("wounds", 3), "SWFFG.ApplyDamage.Defence.UnitWounds");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/node/defensive-talents.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `modules/helpers/defensive-talents.js`.

- [ ] **Step 3: Write the module**

Create `modules/helpers/defensive-talents.js`:

```js
/**
 * Parry, Reflect and the talents a GM lists beside them: the target suffers strain (wounds, for
 * a rival) to shrink a hit before soak. Minions cannot voluntarily pay this cost.
 *
 * Every rule lives here, free of Foundry globals, so the Apply Damage dialog and the GM bridge's
 * writer share one implementation. The dialog reads the world settings and the target and passes
 * them in; the writer re-checks the cost against the live actor inside its queue. Labels come
 * back as i18n keys for the dialog to localize.
 *
 * @see docs/superpowers/specs/2026-10-04-parry-reflect-apply-damage-design.md
 */
import { MELEE_DEFENCE_SKILLS, RANGED_DEFENCE_SKILLS } from "./defence-helpers.js";

export const RULESET_VANILLA = "vanilla";
export const RULESET_RESPECIALIZED = "respecialized";

/** What using the talent costs before Supreme or Unarmed lowers it, and the floor they stop at. */
export const BASE_DEFENCE_COST = 3;
export const MIN_DEFENCE_COST = 1;

/**
 * Vanilla reduces by 2 plus ranks. reSpecialized v.56's Block and Deflect have no ranks and
 * take a flat 4 off the hit for the same 3 strain; Parry and Reflect stand in for them there.
 */
const VANILLA_BASE_REDUCTION = 2;
const RESPECIALIZED_REDUCTION = 4;

/**
 * The GM-editable name lists: the world setting each lives in, the field planDefensiveTalent
 * reads it from, its segment under `SWFFG.Settings.DefensiveTalents`, and its default. The
 * defaults carry the book names, the OggDude import names and the reSpecialized v.56 names.
 * Unarmed Block has Unarmed Parry's effect; reSpecialized has no Supreme variant.
 */
export const DEFENSIVE_TALENT_LISTS = Object.freeze([
  Object.freeze({ setting: "meleeDefenceTalents", field: "melee", label: "MeleeTalents", default: "Parry, Block" }),
  Object.freeze({ setting: "rangedDefenceTalents", field: "ranged", label: "RangedTalents", default: "Reflect, Deflect" }),
  Object.freeze({ setting: "meleeSupremeTalents", field: "meleeSupreme", label: "MeleeSupreme", default: "Parry (Supreme), Supreme Parry" }),
  Object.freeze({ setting: "rangedSupremeTalents", field: "rangedSupreme", label: "RangedSupreme", default: "Reflect (Supreme), Supreme Reflect" }),
  Object.freeze({ setting: "unarmedParryTalents", field: "unarmed", label: "Unarmed", default: "Unarmed Parry, Unarmed Block" }),
]);

const STRAIN_POOL = Object.freeze({ path: "system.stats.strain.value", thresholdPath: "system.stats.strain.max", unit: "strain" });
const WOUND_POOL = Object.freeze({ path: "system.stats.wounds.value", thresholdPath: "system.stats.wounds.max", unit: "wounds" });

/** Rivals pay wounds; minions cannot voluntarily suffer strain, and vehicles are out of scope. */
const COST_POOLS = Object.freeze({ character: STRAIN_POOL, nemesis: STRAIN_POOL, rival: WOUND_POOL });

const TOGGLE_LABEL_KEYS = Object.freeze({
  [RULESET_VANILLA]: Object.freeze({ melee: "SWFFG.ApplyDamage.Defence.ApplyParry", ranged: "SWFFG.ApplyDamage.Defence.ApplyReflect" }),
  [RULESET_RESPECIALIZED]: Object.freeze({ melee: "SWFFG.ApplyDamage.Defence.ApplyBlock", ranged: "SWFFG.ApplyDamage.Defence.ApplyDeflect" }),
});
const PUBLIC_KEYS = Object.freeze({ melee: "SWFFG.ApplyDamage.Defence.PublicMelee", ranged: "SWFFG.ApplyDamage.Defence.PublicRanged" });

/** `foundry.utils.getProperty`, without Foundry. */
function readPath(object, path) {
  return path.split(".").reduce((value, part) => (value == null ? undefined : value[part]), object);
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * A GM's comma-separated list, ready to match against talent names.
 * @param {string} text
 * @returns {string[]} trimmed, lowercased, deduplicated; blanks dropped
 */
export function parseTalentNames(text) {
  if (typeof text !== "string") return [];
  return [...new Set(text.split(",").map(normalizeName).filter(Boolean))];
}

/**
 * Which talents can answer an attack made with this skill.
 * @param {string} skillValue - the weapon's `system.skill.value`
 * @returns {"melee"|"ranged"|null}
 */
export function classifyAttack(skillValue) {
  if (MELEE_DEFENCE_SKILLS.includes(skillValue)) return "melee";
  if (RANGED_DEFENCE_SKILLS.includes(skillValue)) return "ranged";
  return null;
}

/**
 * The pool an actor type pays a defensive talent's cost from.
 * @param {string} actorType
 * @returns {{path: string, thresholdPath: string, unit: "strain"|"wounds"}|null}
 */
export function defenceCostPool(actorType) {
  return COST_POOLS[actorType] ?? null;
}

/**
 * The cost pool's current value and threshold, read from the actor as it stands now.
 * @param {object} actor
 * @returns {{path: string, unit: string, current: number, threshold: number}|null}
 */
export function readCostPool(actor) {
  const pool = defenceCostPool(actor?.type);
  if (!pool) return null;
  return {
    path: pool.path,
    unit: pool.unit,
    current: Number(readPath(actor, pool.path)) || 0,
    threshold: Number(readPath(actor, pool.thresholdPath)),
  };
}

/** Ranks one talentList entry contributes. An unranked ("N/A") or unreadable rank counts as 1. */
function entryRanks(entry) {
  const rank = Number(entry?.rank);
  return Number.isFinite(rank) && rank >= 1 ? Math.trunc(rank) : 1;
}

function matchingTalents(talentList, names) {
  const wanted = new Set(names ?? []);
  if (!wanted.size || !Array.isArray(talentList)) return [];
  return talentList.filter((entry) => wanted.has(normalizeName(entry?.name)));
}

/**
 * The talent the target can use against this attack, or null when it has none.
 *
 * Reads `actor.talentList`, which ActorFFG builds for characters, nemeses, rivals and minions
 * from specialization trees, standalone talents, species grants and attachment innate talents:
 * the same totals the sheet shows.
 *
 * @param {object} options
 * @param {object} options.actor
 * @param {"melee"|"ranged"|null} options.attack - from classifyAttack
 * @param {string} options.ruleset - RULESET_VANILLA or RULESET_RESPECIALIZED
 * @param {{melee: string[], ranged: string[], meleeSupreme: string[], rangedSupreme: string[], unarmed: string[]}} options.names
 *   - each list already through parseTalentNames
 * @returns {object|null}
 */
export function planDefensiveTalent({ actor, attack, ruleset, names } = {}) {
  if (attack !== "melee" && attack !== "ranged") return null;
  const pool = readCostPool(actor);
  if (!pool) return null;
  const talents = matchingTalents(actor.talentList, names?.[attack]);
  if (!talents.length) return null;

  const respecialized = ruleset === RULESET_RESPECIALIZED;
  const ranks = talents.reduce((sum, entry) => sum + entryRanks(entry), 0);
  const formula = respecialized
    ? { key: "SWFFG.ApplyDamage.Defence.FormulaRespec", ranks }
    : { key: ranks === 1 ? "SWFFG.ApplyDamage.Defence.FormulaVanillaOne" : "SWFFG.ApplyDamage.Defence.FormulaVanilla", ranks };
  // Each talent once, spelled as the target's first entry spells it.
  const talentNames = [];
  const seen = new Set();
  for (const entry of talents) {
    const key = normalizeName(entry.name);
    if (seen.has(key)) continue;
    seen.add(key);
    talentNames.push(String(entry.name).trim());
  }

  return {
    kind: attack,
    talentNames,
    ranks,
    reduction: respecialized ? RESPECIALIZED_REDUCTION : VANILLA_BASE_REDUCTION + ranks,
    formula,
    hasSupreme: matchingTalents(actor.talentList, attack === "melee" ? names?.meleeSupreme : names?.rangedSupreme).length > 0,
    hasUnarmed: attack === "melee" && matchingTalents(actor.talentList, names?.unarmed).length > 0,
    costPath: pool.path,
    unit: pool.unit,
    toggleLabelKey: TOGGLE_LABEL_KEYS[respecialized ? RULESET_RESPECIALIZED : RULESET_VANILLA][attack],
    publicKey: PUBLIC_KEYS[attack],
    current: pool.current,
    threshold: pool.threshold,
  };
}

/**
 * What using the talent costs with these modifiers selected.
 * @param {{supreme?: boolean, unarmed?: boolean}} [selected]
 * @returns {number}
 */
export function defenceCost({ supreme = false, unarmed = false } = {}) {
  const cost = supreme ? MIN_DEFENCE_COST : BASE_DEFENCE_COST;
  return unarmed ? Math.max(MIN_DEFENCE_COST, cost - 1) : cost;
}

/** The lowest cost this target's own modifiers allow. */
export function cheapestCost(plan) {
  return defenceCost({ supreme: !!plan?.hasSupreme, unarmed: !!plan?.hasUnarmed });
}

/**
 * Would paying `cost` take the target past its threshold? Exactly reaching it is allowed: the
 * rules incapacitate only when the threshold is exceeded. A threshold that is not a positive
 * number is unknown, and never refuses.
 * @param {{current: number, threshold: number}} pool
 * @param {number} cost
 * @returns {boolean}
 */
export function wouldIncapacitate(pool, cost) {
  const threshold = Number(pool?.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return (Number(pool?.current) || 0) + cost > threshold;
}

/**
 * The dialog's control state. Unsupported modifiers have no effect, but a selected defence is
 * preserved when its cost becomes unaffordable. Apply stays blocked and the user may explicitly
 * turn the main toggle off; a refresh never converts that choice into ordinary damage.
 * @param {object} plan - from planDefensiveTalent
 * @param {{current: number, threshold: number}|null} pool - readCostPool on the live actor
 * @param {{on?: boolean, supreme?: boolean, unarmed?: boolean}} [selection]
 * @returns {{toggleDisabled: boolean, on: boolean, supreme: boolean, unarmed: boolean, cost: number, applyDisabled: boolean}}
 */
export function planDefenceControls(plan, pool, selection = {}) {
  const live = pool ?? plan;
  const on = !!selection.on;
  const toggleDisabled = !on && wouldIncapacitate(live, cheapestCost(plan));
  const supreme = on && !!plan.hasSupreme && !!selection.supreme;
  const unarmed = on && !!plan.hasUnarmed && !!selection.unarmed;
  const cost = defenceCost({ supreme, unarmed });
  return { toggleDisabled, on, supreme, unarmed, cost, applyDisabled: on && wouldIncapacitate(live, cost) };
}

/** The i18n key for `count` of a cost pool's unit: "strain", "wound" or "wounds". */
export function unitLabelKey(unit, count) {
  if (unit === "strain") return "SWFFG.ApplyDamage.Defence.UnitStrain";
  return count === 1 ? "SWFFG.ApplyDamage.Defence.UnitWound" : "SWFFG.ApplyDamage.Defence.UnitWounds";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/node/defensive-talents.test.mjs`
Expected: PASS, every test.

- [ ] **Step 5: Run the whole Node tier and the import check**

Run: `npm test` then `npm run check:imports`
Expected: no failures, and `PASS — 0 unpinned finding(s)`.

- [ ] **Step 6: Commit**

```bash
git add modules/helpers/defensive-talents.js tests/node/defensive-talents.test.mjs
git commit -m "Add the Parry and Reflect rules module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The reduction and `changes` in the damage plan

**Files:**
- Modify: `modules/helpers/apply-damage-plan.js` (`planDamageApplication`, lines 128-164)
- Test: `tests/node/apply-damage.test.mjs` (append)

**Interfaces:**
- Consumes: nothing new. `defence.reduction` and `defence.cost` come from Task 1's plan and `planDefenceControls`.
- Produces: `planDamageApplication(actor, target, { damage, pierce, pool, defence? })`, where `defence = { reduction: number, cost: number, costPath: string }`. With `defence`, the result also has `reduced: number`, `reduction: number`, `changes: Array<{path, delta}>` (same-path entries merged) and `defenceCost: { path, delta }`, and `applied` is computed on the reduced damage. Without `defence`, the result is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/node/apply-damage.test.mjs`:

```js
// ---------------------------------------------------------------------------
// Parry and Reflect
// ---------------------------------------------------------------------------

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";

/** One hit on a soak-6 target with a defensive talent switched on. */
const defend = (input, type = "character") => {
  const actor = actorWith([], type);
  return planDamageApplication(actor, planDamageTarget(actor), input);
};

test("a defensive talent reduces the hit before soak and returns the hit and its cost together", () => {
  const hit = defend({ damage: 12, pierce: 0, pool: "wounds", defence: { reduction: 4, cost: 3, costPath: STRAIN } });

  assert.equal(hit.damage, 12); // the public line still shows the damage as dealt
  assert.equal(hit.reduction, 4);
  assert.equal(hit.reduced, 8);
  assert.equal(hit.applied, 2);
  assert.deepEqual(hit.changes, [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 3 }]);
  assert.deepEqual(hit.defenceCost, { path: STRAIN, delta: 3 });
});

test("a reduction larger than the damage leaves only the cost to pay", () => {
  const hit = defend({ damage: 3, pierce: 0, pool: "wounds", defence: { reduction: 5, cost: 3, costPath: STRAIN } });

  assert.equal(hit.reduced, 0);
  assert.equal(hit.applied, 0);
  assert.deepEqual(hit.changes, [{ path: WOUNDS, delta: 0 }, { path: STRAIN, delta: 3 }]);
});

test("Pierce works on the reduced damage", () => {
  const hit = defend({ damage: 12, pierce: 4, pool: "wounds", defence: { reduction: 4, cost: 3, costPath: STRAIN } });

  assert.equal(hit.effectiveSoak, 2);
  assert.equal(hit.applied, 6);
});

test("strain damage and a strain cost merge into one change, and the cost is kept on its own", () => {
  const hit = defend({ damage: 12, pierce: 0, pool: "strain", defence: { reduction: 4, cost: 1, costPath: STRAIN } });

  assert.deepEqual(hit.changes, [{ path: STRAIN, delta: 3 }]); // 2 from the hit, 1 from the cost
  assert.deepEqual(hit.defenceCost, { path: STRAIN, delta: 1 });
});

test("a rival pays in wounds, merged with the hit", () => {
  for (const type of ["rival"]) {
    const hit = defend({ damage: 12, pierce: 0, pool: "wounds", defence: { reduction: 4, cost: 3, costPath: WOUNDS } }, type);

    assert.deepEqual(hit.changes, [{ path: WOUNDS, delta: 5 }]);
    assert.deepEqual(hit.defenceCost, { path: WOUNDS, delta: 3 });
  }
});

test("without a defensive talent the result is exactly what it always was", () => {
  const actor = actorWith();
  const hit = planDamageApplication(actor, planDamageTarget(actor), { damage: 12, pierce: 2, pool: "wounds" });

  assert.deepEqual(Object.keys(hit).sort(),
    ["applied", "damage", "effectiveSoak", "path", "pierce", "poolLabelKey", "soak", "soakProtection", "soakWord"]);
  assert.equal(hit.applied, 8);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/node/apply-damage.test.mjs`
Expected: FAIL. The new tests report `hit.reduction` / `hit.changes` as `undefined`, and `applied` 6 instead of 2.

- [ ] **Step 3: Implement**

In `modules/helpers/apply-damage-plan.js`, replace the whole `planDamageApplication` block (its JSDoc through the closing brace) with:

```js
/**
 * Resolve one hit: where it is written and how much of it lands.
 *
 * With `defence` (a Parry, Reflect or equivalent the dialog switched on) the reduction comes off
 * the damage before soak, and the hit and the talent's cost come back together as `changes`, one
 * entry per pool, for the bridge to write in a single update. `defenceCost` keeps the cost on its
 * own even when it shares a pool with the hit, because the writer checks the cost alone against
 * the target's threshold.
 *
 * @param {object} actor - the target, for its worn protective qualities
 * @param {object} target - the result of planDamageTarget for that actor
 * @param {{damage: number, pierce: number, pool: string,
 *          defence?: {reduction: number, cost: number, costPath: string}}} input - what the dialog came back with
 * @returns {object|null} null when there is nothing to write to
 */
export function planDamageApplication(actor, target, { damage, pierce, pool, defence } = {}) {
  if (!target) return null;

  const soakProtection = getSoakProtectionQualities(actor);
  // Beskar and Cortosis do not reduce Pierce and Breach, they defeat them: the wearer keeps
  // their whole soak however many ranks the attack brought.
  const appliedPierce = soakProtection.length ? 0 : Math.max(0, parseInt(pierce, 10) || 0);
  const appliedDamage = Math.max(0, parseInt(damage, 10) || 0);

  // Without the radio there is only one pool on offer, whatever was asked for.
  const chosen = target.showRadio ? pool : "wounds";
  const wantsStrain = chosen === "strain" && target.strainPath;
  const path = wantsStrain ? target.strainPath : target.woundPath;
  if (!path) return null;

  const effectiveSoak = Math.max(0, target.soakValue - appliedPierce);

  const hit = {
    path,
    poolLabelKey: wantsStrain ? target.strainLabelKey : target.woundLabelKey,
    damage: appliedDamage,
    pierce: appliedPierce,
    soak: target.soakValue,
    soakWord: target.soakWord,
    effectiveSoak,
    applied: Math.max(0, appliedDamage - effectiveSoak),
    soakProtection,
  };
  if (!defence) return hit;

  const reduction = Math.max(0, parseInt(defence.reduction, 10) || 0);
  const reduced = Math.max(0, appliedDamage - reduction);
  const applied = Math.max(0, reduced - effectiveSoak);
  const changes = defence.costPath === path
    ? [{ path, delta: applied + defence.cost }]
    : [{ path, delta: applied }, { path: defence.costPath, delta: defence.cost }];
  return {
    ...hit,
    applied,
    reduced,
    reduction,
    changes,
    defenceCost: { path: defence.costPath, delta: defence.cost },
  };
}
```

Also extend the module's header comment (top of the file), after the sentence that ends "…whether worn Beskar or Cortosis stops them outright.", with:

```js
 * And, when the dialog has switched one on, how far Parry, Reflect or an equivalent shrinks the
 * hit before soak (see defensive-talents.js for which talent and what it costs).
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/node/apply-damage.test.mjs`
Expected: PASS, every test, including the existing ones.

- [ ] **Step 5: Commit**

```bash
git add modules/helpers/apply-damage-plan.js tests/node/apply-damage.test.mjs
git commit -m "Fold a defensive talent into the Apply Damage plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The bridge accepts the `changes` form and checks the cost inside the queue

**Files:**
- Modify: `modules/helpers/actor-apply-coordinator.js` (`ApplyRequestError`, lines 8-14; `receive`'s result branch, lines 119-127; `execute`, lines 176-206)
- Modify: `modules/helpers/gm-bridge.js` (imports at lines 17-20; `narrowApplyRequest`, lines 60-86; `performApply`, lines 100-109)
- Test: `tests/node/gm-bridge-apply.test.mjs` (append), `tests/node/actor-apply-coordinator.test.mjs` (harness edit, then append)

**Interfaces:**
- Consumes: `BASE_DEFENCE_COST`, `MIN_DEFENCE_COST`, `defenceCostPool`, `readCostPool`, `wouldIncapacitate` from Task 1.
- Produces:
  - `new ApplyRequestError(message, code?)`, with `error.code` set when a code is given
  - forwarded replies carry `code`, and the requester's rejection keeps it
  - from `gm-bridge.js`: `DEFENCE_UNAFFORDABLE = "defence-unaffordable"`; `narrowDamageChanges(data, actorType) → {ok: true, op: {type: "damage", changes, defenceCost?}} | {ok: false, reason}`, with reasons `shape | changes | path | delta | duplicate | defence-cost`; `planDamageWrite(actor, op) → Record<path, number>`, which throws `ApplyRequestError`

- [ ] **Step 1: Write the failing bridge tests**

In `tests/node/gm-bridge-apply.test.mjs`, extend the gm-bridge import to:

```js
import {
  narrowApplyRequest,
  narrowDamageChanges,
  isApplyRequestAuthorized,
  prepareForwardedApply,
  planDamageWrite,
  DAMAGE_PATHS,
  CRIT_ITEM_TYPES,
  DEFENCE_UNAFFORDABLE,
} from "../../modules/helpers/gm-bridge.js";
```

Then append:

```js
/* -------------------------------------------------------------------------- */
/*  Parry and Reflect: the two-pool form                                      */
/* -------------------------------------------------------------------------- */

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";

/** A 3-strain Parry on a character: 2 wounds after soak, 3 strain paid. */
const talentRequest = (overrides = {}) => ({
  type: "damage",
  changes: [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 3 }],
  defenceCost: { path: STRAIN, delta: 3 },
  ...overrides,
});
const refuse = (data, reason, actorType = "character") =>
  assert.deepEqual(narrowApplyRequest(data, actorType), { ok: false, reason });

test("a two-pool damage request and its cost are accepted and copied clean", () => {
  const result = narrowApplyRequest({ ...talentRequest(), event: "x", gmChat: { content: "x" }, ownership: { default: 3 } }, "character");
  assert.deepEqual(result, {
    ok: true,
    op: { type: "damage", changes: [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 3 }], defenceCost: { path: STRAIN, delta: 3 } },
  });
});

test("the two-pool form needs no talent cost", () => {
  assert.deepEqual(narrowDamageChanges({ type: "damage", changes: [{ path: WOUNDS, delta: 4 }] }, "nemesis"),
    { ok: true, op: { type: "damage", changes: [{ path: WOUNDS, delta: 4 }] } });
});

test("a malformed two-pool request is refused", () => {
  refuse({ type: "damage", changes: [] }, "changes");
  refuse({ type: "damage", changes: [{ path: WOUNDS, delta: 1 }, { path: STRAIN, delta: 1 }, { path: DAMAGE_PATHS[2], delta: 1 }] }, "changes");
  refuse({ type: "damage", changes: [null] }, "changes");
  refuse({ type: "damage", changes: "lots" }, "shape");
  refuse({ type: "damage", changes: [{ path: "system.custom.pool", delta: 1 }] }, "path");
  for (const delta of ["1", null, undefined, NaN, Infinity]) {
    refuse({ type: "damage", changes: [{ path: WOUNDS, delta }] }, "delta");
  }
  refuse({ type: "damage", changes: [{ path: WOUNDS, delta: 1 }, { path: WOUNDS, delta: 2 }] }, "duplicate");
  // The two forms never mix.
  refuse({ ...talentRequest(), path: WOUNDS, delta: 1 }, "shape");
  refuse({ type: "damage", path: WOUNDS, delta: 1, defenceCost: { path: STRAIN, delta: 3 } }, "shape");
});

test("a talent cost must be the target's own pool, 1 to 3, and covered by the changes", () => {
  refuse(talentRequest({ defenceCost: { path: WOUNDS, delta: 3 } }), "defence-cost"); // a character pays strain
  refuse(talentRequest(), "defence-cost", "rival"); // a rival pays wounds
  refuse(talentRequest(), "defence-cost", "vehicle"); // a vehicle pays nothing
  for (const delta of [0, 4, 1.5, "3", null]) {
    refuse(talentRequest({ defenceCost: { path: STRAIN, delta } }), "defence-cost");
  }
  refuse(talentRequest({ defenceCost: [STRAIN, 3] }), "defence-cost");
  refuse(talentRequest({ changes: [{ path: WOUNDS, delta: 2 }] }), "defence-cost"); // not paid at all
  refuse(talentRequest({ changes: [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 2 }] }), "defence-cost"); // short

  // A rival's hit and cost share the wounds entry.
  const merged = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }], defenceCost: { path: WOUNDS, delta: 3 } };
  assert.equal(narrowApplyRequest(merged, "rival").ok, true);
  assert.deepEqual(narrowApplyRequest(merged, "minion"), { ok: false, reason: "defence-cost" });
});

test("a non-owner's talent request reaches the writer narrowed, with its cost intact", () => {
  const requestor = { id: "p1", active: true, isGM: false };
  const actor = { type: "character", testUserPermission: () => false };
  assert.deepEqual(prepareForwardedApply(actor, { ...talentRequest(), event: "x" }, requestor, true), {
    type: "damage", changes: talentRequest().changes, defenceCost: talentRequest().defenceCost,
  });
});

/* -------------------------------------------------------------------------- */
/*  The write, computed inside the writer's queue                             */
/* -------------------------------------------------------------------------- */

const liveActor = ({ type = "character", strain = [7, 10], wounds = [0, 12] } = {}) => ({
  type,
  system: { stats: { strain: { value: strain[0], max: strain[1] }, wounds: { value: wounds[0], max: wounds[1] } } },
});

test("the single form still adds its delta to the live value, unvalidated as before", () => {
  assert.deepEqual(planDamageWrite(liveActor(), { type: "damage", path: WOUNDS, delta: 5 }), { [WOUNDS]: 5 });
  // Owners keep the direct writes they always had.
  assert.deepEqual(planDamageWrite(liveActor(), { type: "damage", path: "system.custom.pool", delta: -3 }), { "system.custom.pool": -3 });
});

test("a talent application writes both pools in one update", () => {
  assert.deepEqual(planDamageWrite(liveActor(), talentRequest()), { [WOUNDS]: 2, [STRAIN]: 10 });
});

test("a cost the target can no longer pay refuses the hit as well", () => {
  assert.throws(() => planDamageWrite(liveActor({ strain: [8, 10] }), talentRequest()),
    { name: "ApplyRequestError", code: DEFENCE_UNAFFORDABLE });
});

test("a merged hit is checked on its cost alone", () => {
  const op = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }], defenceCost: { path: WOUNDS, delta: 3 } };
  // 5 + 3 = 8 is within 10, so the hit may still carry the rival past it.
  assert.deepEqual(planDamageWrite(liveActor({ type: "rival", wounds: [5, 10] }), op), { [WOUNDS]: 12 });
  assert.throws(() => planDamageWrite(liveActor({ type: "rival", wounds: [8, 10] }), op), { code: DEFENCE_UNAFFORDABLE });
});

test("an unknown threshold never refuses", () => {
  assert.deepEqual(planDamageWrite(liveActor({ strain: [9, 0] }), talentRequest()), { [WOUNDS]: 2, [STRAIN]: 12 });
});

test("the writer validates the two-pool form itself, for owners who skip narrowing", () => {
  assert.throws(() => planDamageWrite(liveActor(), talentRequest({ defenceCost: { path: STRAIN, delta: 5 } })),
    { name: "ApplyRequestError", message: "Invalid apply request: defence-cost." });
  assert.throws(() => planDamageWrite(liveActor(), talentRequest({ changes: [{ path: "system.custom.pool", delta: 1 }] })),
    { name: "ApplyRequestError", message: "Invalid apply request: path." });
});
```

- [ ] **Step 2: Write the failing coordinator tests**

In `tests/node/actor-apply-coordinator.test.mjs`:

Change the coordinator import to also bring in `ApplyRequestError`:

```js
import {
  APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT,
  ApplyRequestError, createActorApplyCoordinator, selectApplyExecutor,
} from "../../modules/helpers/actor-apply-coordinator.js";
```

In the harness's `performApply`, add one line directly above `if (op.fail) throw new Error("write failed");`:

```js
        if (op.failCode) throw new ApplyRequestError("coded failure", op.failCode);
```

Append:

```js
test("a coded remote failure reaches its caller with the code intact", async () => {
  const c = clients();
  await assert.rejects(c.apply("owner", { ...damage(5), failCode: "some-code" }),
    { name: "ApplyRequestError", message: "coded failure", code: "some-code" });
  assert.equal(c.values.has("Actor.target"), false);
  assert.equal(c.chats.length, 0);
});

test("a coded local failure reaches its caller unchanged", async () => {
  const c = clients();
  await assert.rejects(c.apply("gm", { ...damage(5), failCode: "some-code" }), { name: "ApplyRequestError", code: "some-code" });
});

test("an uncoded failure carries no code", async () => {
  const c = clients();
  await assert.rejects(c.apply("owner", { ...damage(5), fail: true }), (err) => err.code === undefined);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/node/gm-bridge-apply.test.mjs tests/node/actor-apply-coordinator.test.mjs`
Expected: FAIL. `narrowDamageChanges` / `planDamageWrite` / `DEFENCE_UNAFFORDABLE` are not exported, and the coded failures lose their `code`.

- [ ] **Step 4: Give `ApplyRequestError` a code and carry it across the socket**

In `modules/helpers/actor-apply-coordinator.js`, replace the class:

```js
/**
 * An actionable failure which apply dialogs should show instead of "target gone".
 *
 * `code`, when present, is a stable identifier the requesting client turns into its own
 * localized warning, since the message may come from another client in another language.
 */
export class ApplyRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ApplyRequestError";
    if (code) this.code = code;
  }
}
```

In `receive`, inside the `APPLY_RESULT_EVENT` branch, replace:

```js
      else request.reject(new ApplyRequestError(data.error || "The apply request failed."));
```

with:

```js
      else request.reject(new ApplyRequestError(data.error || "The apply request failed.", typeof data.code === "string" ? data.code : undefined));
```

In `execute`, replace the tail from `let ok = false;` to the end of the function with:

```js
    let ok = false;
    let error;
    let code;
    try {
      const actor = await io.resolveActor(data.actorUuid);
      if (!actor) {
        // Only the addressed writer may answer an unresolved request. Legacy
        // requests without a writer/request ID have no acknowledgement to send.
        if (!data.executorId) return;
        throw new Error("The target actor is no longer available.");
      }
      if (selectApplyExecutor(actor, io.getUsers()) !== io.getUserId()) {
        if (!data.executorId) return;
        throw new Error("The apply executor changed. Check the target and try again.");
      }
      await run(data.actorUuid, data, senderId);
      ok = true;
      if (data.gmChat && io.getUsers().activeGM?.id === io.getUserId()) {
        try {
          await io.postChat(data.gmChat);
        } catch (err) {
          // The mutation succeeded. A chat failure must not tell the sender to
          // retry an already-applied hit.
          io.onChatError?.(err);
        }
      }
    } catch (err) {
      error = err.message;
      if (typeof err.code === "string") code = err.code;
    }
    return code ? { ok, error, code } : { ok, error };
```

- [ ] **Step 5: Narrow and write the two-pool form in the bridge**

In `modules/helpers/gm-bridge.js`, replace the coordinator import line with:

```js
import { createActorApplyCoordinator, ApplyRequestError, APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT } from "./actor-apply-coordinator.js";
import { BASE_DEFENCE_COST, MIN_DEFENCE_COST, defenceCostPool, readCostPool, wouldIncapacitate } from "./defensive-talents.js";
```

Directly after the `CRIT_ITEM_TYPES` export, add:

```js
/** The most entries one damage request may carry: the hit, and the cost of the talent that shrank it. */
const MAX_DAMAGE_CHANGES = 2;

/** ApplyRequestError code: the target can no longer pay the selected Parry/Reflect cost. */
export const DEFENCE_UNAFFORDABLE = "defence-unaffordable";
```

Directly above `narrowApplyRequest`, add:

```js
/**
 * Narrow the two-pool damage form: a hit and, for Parry, Reflect or an equivalent, the talent's
 * cost, written together in one update. See
 * docs/superpowers/specs/2026-10-04-parry-reflect-apply-damage-design.md.
 *
 * `defenceCost` restates the cost apart from a merged hit so the writer can check the cost alone.
 * It must name the target type's own cost pool, be an integer from 1 to 3, and be covered by the
 * `changes` entry for that pool. Nothing about the target's current value or threshold is taken
 * from the payload. Pure, so the rules are testable in Node.
 *
 * @param {object} data       the request
 * @param {string} actorType  the resolved target's `type`
 * @returns {{ok: true, op: object}|{ok: false, reason: string}}
 */
export function narrowDamageChanges(data, actorType) {
  if (data?.path !== undefined || data?.delta !== undefined || !Array.isArray(data?.changes)) {
    return { ok: false, reason: "shape" };
  }
  if (data.changes.length === 0 || data.changes.length > MAX_DAMAGE_CHANGES) return { ok: false, reason: "changes" };
  const changes = [];
  for (const change of data.changes) {
    if (!isPlainObject(change)) return { ok: false, reason: "changes" };
    if (!DAMAGE_PATHS.includes(change.path)) return { ok: false, reason: "path" };
    if (typeof change.delta !== "number" || !Number.isFinite(change.delta)) return { ok: false, reason: "delta" };
    if (changes.some((kept) => kept.path === change.path)) return { ok: false, reason: "duplicate" };
    changes.push({ path: change.path, delta: change.delta });
  }
  const op = { type: "damage", changes };
  if (data.defenceCost !== undefined) {
    const cost = data.defenceCost;
    const pool = defenceCostPool(actorType);
    const valid = isPlainObject(cost) && pool && cost.path === pool.path
      && Number.isInteger(cost.delta) && cost.delta >= MIN_DEFENCE_COST && cost.delta <= BASE_DEFENCE_COST;
    const covering = valid ? changes.find((change) => change.path === cost.path) : null;
    if (!covering || covering.delta < cost.delta) return { ok: false, reason: "defence-cost" };
    op.defenceCost = { path: cost.path, delta: cost.delta };
  }
  return { ok: true, op };
}
```

In `narrowApplyRequest`, make the `damage` case start with the two-pool branch:

```js
    case "damage": {
      if (data.changes !== undefined || data.defenceCost !== undefined) return narrowDamageChanges(data, actorType);
      if (!DAMAGE_PATHS.includes(data.path)) return { ok: false, reason: "path" };
```

(The rest of the case is unchanged.)

Directly above `performApply`, add:

```js
/**
 * The `actor.update` payload for a damage operation, computed from the live actor inside the
 * writer's queue.
 *
 * The single `{path, delta}` form is unchanged and unvalidated here: owners keep the direct
 * writes they always had, and unowned requests were already narrowed. The two-pool form is
 * validated on every path, because local and forwarded-owner requests never pass through
 * narrowApplyRequest. A talent's cost is checked against the pool as it stands before this write,
 * so of two applications opened at the same strain, the second is refused, hit and all.
 *
 * @param {object} actor  the resolved target
 * @param {object} op     a "damage" operation
 * @returns {Record<string, number>}
 * @throws {ApplyRequestError} a malformed request, or code DEFENCE_UNAFFORDABLE
 */
export function planDamageWrite(actor, op) {
  const read = (path) => Number(foundry.utils.getProperty(actor, path)) || 0;
  if (op.changes === undefined && op.defenceCost === undefined) {
    return { [op.path]: read(op.path) + op.delta };
  }
  const narrowed = narrowDamageChanges(op, actor?.type);
  if (!narrowed.ok) throw new ApplyRequestError(`Invalid apply request: ${narrowed.reason}.`);
  const { changes, defenceCost } = narrowed.op;
  if (defenceCost && wouldIncapacitate(readCostPool(actor), defenceCost.delta)) {
    throw new ApplyRequestError("The target can no longer pay the selected cost.", DEFENCE_UNAFFORDABLE);
  }
  return Object.fromEntries(changes.map(({ path, delta }) => [path, read(path) + delta]));
}
```

In `performApply`, replace the damage branch:

```js
  if (op.type === "damage") {
    await actor.update(planDamageWrite(actor, op));
  } else if (op.type === "crit") {
```

and extend `performApply`'s JSDoc `@param` list with:

```js
 * @param {Array<{path: string, delta: number}>} [op.changes]  For "damage": the two-pool form.
 * @param {{path: string, delta: number}} [op.defenceCost]      For "damage": the talent cost within `changes`.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/node/gm-bridge-apply.test.mjs tests/node/actor-apply-coordinator.test.mjs`
Expected: PASS, every test, including the existing ones.

- [ ] **Step 7: Run the Node tier and the import check**

Run: `npm test` then `npm run check:imports`
Expected: no failures; PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/helpers/actor-apply-coordinator.js modules/helpers/gm-bridge.js tests/node/gm-bridge-apply.test.mjs tests/node/actor-apply-coordinator.test.mjs
git commit -m "Write a hit and its talent cost in one guarded update" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Probe the elected writer before sending a talent application

**Files:**
- Modify: `modules/helpers/actor-apply-coordinator.js` (constants at the top; `createActorApplyCoordinator`'s JSDoc, state, `apply` and `receive`)
- Modify: `modules/helpers/gm-bridge.js` (imports, `applyToTargetActor`, the routing in `registerGMBridge`, re-exports)
- Test: `tests/node/actor-apply-coordinator.test.mjs` (harness edit, then append)

**Interfaces:**
- Consumes: `ApplyRequestError(message, code)` from Task 3.
- Produces:
  - from `actor-apply-coordinator.js`: `CAPABILITY_EVENT = "ffgApplyCapability"`, `CAPABILITY_RESULT_EVENT = "ffgApplyCapabilityResult"`, `DEFENSIVE_DAMAGE_CAPABILITY = "defensive-damage-v1"`, `WRITER_OUTDATED = "writer-outdated"`
  - `coordinator.apply(actor, op, { capability }?)`
  - io options `capabilityTimeoutMs` (default 5000) and `capabilities` (default `[DEFENSIVE_DAMAGE_CAPABILITY]`)
  - from `gm-bridge.js`: `applyToTargetActor(actor, op, options?)`, plus re-exports of `DEFENSIVE_DAMAGE_CAPABILITY` and `WRITER_OUTDATED`

- [ ] **Step 1: Extend the test harness**

In `tests/node/actor-apply-coordinator.test.mjs`:

Replace the coordinator import with:

```js
import {
  APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT, CAPABILITY_EVENT, CAPABILITY_RESULT_EVENT,
  DEFENSIVE_DAMAGE_CAPABILITY, WRITER_OUTDATED,
  ApplyRequestError, createActorApplyCoordinator, selectApplyExecutor,
} from "../../modules/helpers/actor-apply-coordinator.js";
```

Below the `damage` helper, add:

```js
/** A talent application in the two-pool form; the harness's fake writer only counts it. */
const talentHit = () => ({
  type: "damage",
  changes: [{ path: DAMAGE_PATHS[0], delta: 2 }, { path: DAMAGE_PATHS[1], delta: 3 }],
  defenceCost: { path: DAMAGE_PATHS[1], delta: 3 },
});
const gated = { capability: DEFENSIVE_DAMAGE_CAPABILITY };
```

Change the `clients` signature to accept two more options:

```js
function clients({ users = [user("gm", true), user("owner"), user("player")], owners = ["owner"], beforeWrite, chatFails = false, timeoutMs = 1000, onPending, dropFirstReply = false, oldWriters = [], capabilityTimeoutMs = 1000 } = {}) {
```

In the harness's `send`, replace the delivery loop with:

```js
        for (const [id, coordinator] of coordinators) {
          // A writer on older code has no handler for capability probes, so it stays silent.
          if (id === u.id || (oldWriters.includes(id) && data.event === CAPABILITY_EVENT)) continue;
          void coordinator.receive(structuredClone(data), u.id).catch((error) => transportErrors.push(error));
        }
```

Add `capabilityTimeoutMs,` to the io object, next to `timeoutMs,`. Then change the returned `apply` helper to pass options through:

```js
    apply: (id, op, uuid, options) => coordinators.get(id).apply(actor(id, uuid), op, options) };
```

- [ ] **Step 2: Write the failing tests**

Append:

```js
/* -------------------------------------------------------------------------- */
/*  The defensive-damage capability                                           */
/* -------------------------------------------------------------------------- */

test("a talent application asks the remote writer first, then goes to it", async () => {
  const c = clients();
  assert.equal(await c.apply("player", talentHit(), undefined, gated), "forwarded");
  const probe = c.sent.findIndex((d) => d.event === CAPABILITY_EVENT);
  const sentApply = c.sent.findIndex((d) => d.event === APPLY_EVENT);
  assert.ok(probe >= 0 && probe < sentApply);
  assert.equal(c.sent[probe].executorId, "gm");
  assert.equal(c.sent[probe].capability, DEFENSIVE_DAMAGE_CAPABILITY);
  assert.equal(c.values.get("Actor.target"), 1);
});

test("the elected writer checks itself, without a probe", async () => {
  const c = clients();
  assert.equal(await c.apply("gm", talentHit(), undefined, gated), "local");
  assert.equal(c.sent.some((d) => d.event === CAPABILITY_EVENT), false);
});

for (const applier of ["owner", "player"]) {
  test(`an old GM gets no talent application from ${applier === "owner" ? "an owner" : "a non-owner"}, but still applies ordinary damage`, async () => {
    const c = clients({ oldWriters: ["gm"], capabilityTimeoutMs: 5 });
    await assert.rejects(c.apply(applier, talentHit(), undefined, gated), { name: "ApplyRequestError", code: WRITER_OUTDATED });
    assert.equal(c.sent.some((d) => d.event === APPLY_EVENT), false);
    assert.equal(c.writes.length, 0);

    assert.equal(await c.apply(applier, damage(5)), "forwarded");
    assert.equal(c.values.get("Actor.target"), 5);
  });
}

test("an old elected owner without a GM is refused the same way", async () => {
  const c = clients({ users: [user("a"), user("z")], owners: ["a", "z"], oldWriters: ["a"], capabilityTimeoutMs: 5 });
  await assert.rejects(c.apply("z", talentHit(), undefined, gated), { code: WRITER_OUTDATED });
  assert.equal(c.writes.length, 0);
});

test("a negative reply refuses at once", async () => {
  const users = [user("gm", true), user("owner")];
  users.activeGM = users[0];
  const sent = [];
  const coordinator = createActorApplyCoordinator({
    getUserId: () => "owner", getUsers: () => users, makeRequestId: () => "probe",
    send: (data) => sent.push(data), capabilityTimeoutMs: 60000,
  });
  const applying = coordinator.apply({ uuid: "Actor.a", isOwner: true }, talentHit(), gated);
  await tick();
  await coordinator.receive({ event: CAPABILITY_RESULT_EVENT, requestId: "probe", recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: false }, "gm");
  await assert.rejects(applying, { code: WRITER_OUTDATED });
  assert.equal(sent.some((d) => d.event === APPLY_EVENT), false);
});

test("only the addressed writer's reply to that probe, for that capability, counts", async () => {
  const users = [user("gm", true), user("owner")];
  users.activeGM = users[0];
  const sent = [];
  let sequence = 0;
  const coordinator = createActorApplyCoordinator({
    getUserId: () => "owner", getUsers: () => users, makeRequestId: () => `r${++sequence}`,
    send: (data) => sent.push(data), timeoutMs: 1000, capabilityTimeoutMs: 1000,
  });
  const applying = coordinator.apply({ uuid: "Actor.a", isOwner: true }, talentHit(), gated);
  await tick();
  const reply = { event: CAPABILITY_RESULT_EVENT, requestId: "r1", recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: true };
  await coordinator.receive(reply, "someone-else");
  await coordinator.receive({ ...reply, recipientId: "someone-else" }, "gm");
  await coordinator.receive({ ...reply, requestId: "wrong" }, "gm");
  await coordinator.receive({ ...reply, capability: "something-else" }, "gm");
  await tick();
  assert.equal(sent.some((d) => d.event === APPLY_EVENT), false);

  await coordinator.receive(reply, "gm");
  await tick();
  const dispatched = sent.find((d) => d.event === APPLY_EVENT);
  assert.equal(dispatched.executorId, "gm");
  await coordinator.receive({ event: APPLY_RESULT_EVENT, requestId: dispatched.requestId, recipientId: "owner", ok: true }, "gm");
  assert.equal(await applying, "forwarded");
});

test("a writer change after the probe is verified again before anything is sent", async () => {
  const users = [user("gm", true), user("gm2", true), user("owner")];
  users.activeGM = users[0];
  const sent = [];
  let sequence = 0;
  const coordinator = createActorApplyCoordinator({
    getUserId: () => "owner", getUsers: () => users, makeRequestId: () => `r${++sequence}`,
    send: (data) => sent.push(data), timeoutMs: 1000, capabilityTimeoutMs: 1000,
  });
  const applying = coordinator.apply({ uuid: "Actor.a", isOwner: true }, talentHit(), gated);
  await tick();
  const first = sent.find((d) => d.event === CAPABILITY_EVENT);
  assert.equal(first.executorId, "gm");

  users.activeGM = users[1]; // the seat moves while gm is answering
  await coordinator.receive({ event: CAPABILITY_RESULT_EVENT, requestId: first.requestId, recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: true }, "gm");
  await tick();
  const second = sent.filter((d) => d.event === CAPABILITY_EVENT)[1];
  assert.equal(second.executorId, "gm2");
  assert.equal(sent.some((d) => d.event === APPLY_EVENT), false);

  await coordinator.receive({ event: CAPABILITY_RESULT_EVENT, requestId: second.requestId, recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: true }, "gm2");
  await tick();
  const dispatched = sent.find((d) => d.event === APPLY_EVENT);
  assert.equal(dispatched.executorId, "gm2");
  await coordinator.receive({ event: APPLY_RESULT_EVENT, requestId: dispatched.requestId, recipientId: "owner", ok: true }, "gm2");
  assert.equal(await applying, "forwarded");
});

test("an unverified replacement writer never receives the talent application", async () => {
  const users = [user("gm", true), user("gm2", true), user("owner")];
  users.activeGM = users[0];
  const sent = [];
  let sequence = 0;
  const coordinator = createActorApplyCoordinator({
    getUserId: () => "owner", getUsers: () => users, makeRequestId: () => `r${++sequence}`,
    // Long enough for gm's reply below to beat its own probe's timeout; gm2's then runs out.
    send: (data) => sent.push(data), timeoutMs: 1000, capabilityTimeoutMs: 50,
  });
  const applying = coordinator.apply({ uuid: "Actor.a", isOwner: true }, talentHit(), gated);
  await tick();
  users.activeGM = users[1];
  await coordinator.receive({ event: CAPABILITY_RESULT_EVENT, requestId: "r1", recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: true }, "gm");
  // gm2 never answers.
  await assert.rejects(applying, { code: WRITER_OUTDATED });
  assert.equal(sent.some((d) => d.event === APPLY_EVENT), false);
});

for (const result of ["timeout", "refusal"]) {
  test(`a writer change during a probe ${result} verifies the replacement`, async () => {
    const users = [user("gm", true), user("gm2", true), user("owner")];
    users.activeGM = users[0];
    const sent = [];
    let sequence = 0;
    const coordinator = createActorApplyCoordinator({
      getUserId: () => "owner", getUsers: () => users, makeRequestId: () => `r${++sequence}`,
      capabilityTimeoutMs: 10, timeoutMs: 1000,
      send(data) {
        sent.push(data);
        if (data.event === CAPABILITY_EVENT && data.executorId === "gm2") {
          queueMicrotask(() => coordinator.receive({ event: CAPABILITY_RESULT_EVENT,
            requestId: data.requestId, recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: true }, "gm2"));
        } else if (data.event === APPLY_EVENT) {
          queueMicrotask(() => coordinator.receive({ event: APPLY_RESULT_EVENT,
            requestId: data.requestId, recipientId: "owner", ok: true }, "gm2"));
        }
      },
    });
    const applying = coordinator.apply({ uuid: "Actor.a", isOwner: true }, talentHit(), gated);
    users.activeGM = users[1];
    if (result === "refusal") {
      const first = sent.find((data) => data.event === CAPABILITY_EVENT);
      await coordinator.receive({ event: CAPABILITY_RESULT_EVENT, requestId: first.requestId,
        recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: false }, "gm");
    } // In the timeout case, the first writer never answers.
    assert.equal(await applying, "forwarded");
    assert.deepEqual(sent.filter((data) => data.event === CAPABILITY_EVENT).map((data) => data.executorId), ["gm", "gm2"]);
    assert.deepEqual(sent.filter((data) => data.event === APPLY_EVENT).map((data) => data.executorId), ["gm2"]);
  });
}

test("a writer answers a probe read-only, and only one addressed to it from a known sender", async () => {
  const c = clients();
  const probe = { event: CAPABILITY_EVENT, requestId: "p", executorId: "gm", capability: DEFENSIVE_DAMAGE_CAPABILITY };
  await c.receive("gm", probe, "owner");
  assert.deepEqual(c.sent.filter((d) => d.event === CAPABILITY_RESULT_EVENT), [
    { sender: "gm", event: CAPABILITY_RESULT_EVENT, requestId: "p", recipientId: "owner", capability: DEFENSIVE_DAMAGE_CAPABILITY, ok: true },
  ]);

  await c.receive("gm", { ...probe, requestId: "q", capability: "teleport-v9" }, "owner");
  assert.equal(c.sent.find((d) => d.requestId === "q").ok, false);

  for (const [data, sender] of [[{ ...probe, requestId: "x1", executorId: "gm2" }, "owner"], [{ ...probe, requestId: "x2" }, undefined], [{ ...probe, requestId: undefined }, "owner"]]) {
    await c.receive("gm", data, sender);
  }
  assert.equal(c.sent.filter((d) => d.event === CAPABILITY_RESULT_EVENT).length, 2);
  assert.equal(c.writes.length, 0);
});

test("an unknown capability fails even on the local writer", async () => {
  const c = clients();
  await assert.rejects(c.apply("gm", talentHit(), undefined, { capability: "teleport-v9" }), { code: WRITER_OUTDATED });
  assert.equal(c.writes.length, 0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/node/actor-apply-coordinator.test.mjs`
Expected: FAIL. The new constants are `undefined`, the talent application goes out with no probe, and the old-writer tests apply instead of rejecting.

- [ ] **Step 4: Implement the probe in the coordinator**

In `modules/helpers/actor-apply-coordinator.js`, below the three existing `APPLY_*` constants, add:

```js
export const CAPABILITY_EVENT = "ffgApplyCapability";
export const CAPABILITY_RESULT_EVENT = "ffgApplyCapabilityResult";

/**
 * The writer understands the two-pool damage form and checks a Parry/Reflect cost inside its
 * queue. A writer on older code would apply an owner's forwarded talent request unchecked, or
 * refuse an unowned one, so a talent application goes only to a writer that has said yes.
 */
export const DEFENSIVE_DAMAGE_CAPABILITY = "defensive-damage-v1";
/** What this build can do on behalf of other clients. */
const SUPPORTED_CAPABILITIES = Object.freeze([DEFENSIVE_DAMAGE_CAPABILITY]);
/** ApplyRequestError code: the elected writer did not confirm a capability the request needs. */
export const WRITER_OUTDATED = "writer-outdated";
/** Elections a capability check follows before giving up on a seat that keeps moving. */
const MAX_CAPABILITY_ATTEMPTS = 3;
```

In the `createActorApplyCoordinator` JSDoc, add after the `io.receivedLimit` line:

```js
 * @param {number} [io.capabilityTimeoutMs=5000] How long a writer has to confirm a capability.
 * @param {string[]} [io.capabilities] What this client supports; this build's list by default.
```

At the top of the function body, next to `const received = new Map();`, add:

```js
  const probes = new Map();
  const capabilities = io.capabilities ?? SUPPORTED_CAPABILITIES;
```

Above `async function apply`, add:

```js
  /** Ask `executorId` whether it supports `capability`. Silence, refusal or a send failure is a no. */
  function probeCapability(executorId, capability) {
    const requestId = io.makeRequestId();
    return new Promise((resolve) => {
      const probe = { executorId, capability, timer: null, settle: null };
      probe.settle = (supported) => {
        if (probes.get(requestId) !== probe) return;
        clearTimeout(probe.timer);
        probes.delete(requestId);
        resolve(supported);
      };
      probe.timer = setTimeout(() => probe.settle(false), io.capabilityTimeoutMs ?? 5000);
      probes.set(requestId, probe);
      try {
        io.send({ event: CAPABILITY_EVENT, requestId, executorId, capability });
      } catch {
        probe.settle(false);
      }
    });
  }

  /**
   * The writer a capability-gated apply may go to, verified for this application only.
   *
   * A reply vouches for the client that sent it and nothing else, so the seat is re-elected after
   * every probe, including silence or refusal. If it moved while the writer was answering (or
   * not answering), the replacement is asked too. The request is never handed to an unverified
   * writer; an unchanged writer that does not confirm support gets the reload warning.
   *
   * @returns {Promise<string|null>} null when no writer is left
   */
  async function verifiedExecutor(actor, capability, executorId) {
    for (let attempt = 0; attempt < MAX_CAPABILITY_ATTEMPTS; attempt++) {
      const supported = executorId === io.getUserId()
        ? capabilities.includes(capability)
        : await probeCapability(executorId, capability);
      const current = selectApplyExecutor(actor, io.getUsers());
      if (!current) return null;
      if (current !== executorId) {
        executorId = current;
        continue;
      }
      if (!supported) {
        throw new ApplyRequestError("The client applying this runs an older version of the system. Reload every client and try again.", WRITER_OUTDATED);
      }
      return executorId;
    }
    throw new ApplyRequestError("The apply executor changed. Check the target and try again.");
  }
```

Replace the start of `apply`, up to and including the `if (!executorId) return false;` line, with:

```js
  /**
   * @param {object} actor
   * @param {object} op
   * @param {{capability?: string}} [options] Require the elected writer to support `capability`
   *   before anything is sent; it is asked afresh for every application.
   */
  async function apply(actor, op, { capability } = {}) {
    const users = io.getUsers();
    // Without a GM, owners retain their existing ability to apply locally; a
    // non-owner does not gain new permission merely because an owner is online.
    if (!actor || (!users.activeGM && !actor.isOwner)) return false;
    let executorId = selectApplyExecutor(actor, users);
    if (!executorId) return false;
    if (capability) {
      executorId = await verifiedExecutor(actor, capability, executorId);
      if (!executorId) return false;
    }
```

(The rest of `apply` is unchanged and keeps using `executorId`.)

At the top of `receive`, before the `APPLY_RESULT_EVENT` branch, add:

```js
    if (data?.event === CAPABILITY_RESULT_EVENT) {
      const probe = probes.get(data.requestId);
      if (!probe || data.recipientId !== io.getUserId() || probe.executorId !== senderId || probe.capability !== data.capability) return;
      probe.settle(data.ok === true);
      return;
    }
    if (data?.event === CAPABILITY_EVENT) {
      // Read-only: says what this client supports. It never touches an actor or the queue.
      if (data.executorId !== io.getUserId() || typeof senderId !== "string" || !senderId || !data.requestId) return;
      io.send({
        event: CAPABILITY_RESULT_EVENT,
        requestId: data.requestId,
        recipientId: senderId,
        capability: data.capability,
        ok: capabilities.includes(data.capability),
      });
      return;
    }
```

- [ ] **Step 5: Route the probe through the bridge**

In `modules/helpers/gm-bridge.js`, replace the coordinator import with:

```js
import {
  createActorApplyCoordinator, ApplyRequestError,
  APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT, CAPABILITY_EVENT, CAPABILITY_RESULT_EVENT,
} from "./actor-apply-coordinator.js";

export { DEFENSIVE_DAMAGE_CAPABILITY, WRITER_OUTDATED } from "./actor-apply-coordinator.js";
```

Below `const MESSAGE_EVENT = "ffgUpdateMessage";`, add:

```js
/** Socket events the apply coordinator answers on every client. */
const COORDINATOR_EVENTS = new Set([APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT, CAPABILITY_EVENT, CAPABILITY_RESULT_EVENT]);
```

Change `applyToTargetActor` to pass options through, and document them:

```js
 * @param {Actor} actor  The resolved target actor (synthetic token actor is fine).
 * @param {object} op     See {@link performApply}; may also carry `gmChat`.
 * @param {{capability?: string}} [options]  Require the elected writer to support a capability
 *   (DEFENSIVE_DAMAGE_CAPABILITY for Parry/Reflect); refusal rejects with code WRITER_OUTDATED.
```

```js
export async function applyToTargetActor(actor, op, options) {
  const result = await applyCoordinator.apply(actor, op, options);
```

In `registerGMBridge`, replace:

```js
      if (data?.event === APPLY_EVENT || data?.event === APPLY_RESULT_EVENT || data?.event === APPLY_STATUS_EVENT) {
```

with:

```js
      if (COORDINATOR_EVENTS.has(data?.event)) {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/node/actor-apply-coordinator.test.mjs tests/node/gm-bridge-apply.test.mjs`
Expected: PASS, every test.

- [ ] **Step 7: Run the Node tier and the import check**

Run: `npm test` then `npm run check:imports`
Expected: no failures; PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/helpers/actor-apply-coordinator.js modules/helpers/gm-bridge.js tests/node/actor-apply-coordinator.test.mjs
git commit -m "Send Parry and Reflect only to a writer that supports them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end writer tests

These pin the spec's queue scenarios against the real coordinator and the real writer check together. Tasks 3 and 4 already implement the behaviour, so the tests should pass on first run. If one fails, that is a bug in Task 3 or 4: fix it there, not in this test.

**Files:**
- Create: `tests/node/defensive-damage-apply.test.mjs`

**Interfaces:**
- Consumes: `createActorApplyCoordinator`, `DEFENSIVE_DAMAGE_CAPABILITY` (Task 4); `planDamageWrite`, `prepareForwardedApply`, `DEFENCE_UNAFFORDABLE` (Task 3).
- Produces: nothing.

- [ ] **Step 1: Write the tests**

Create `tests/node/defensive-damage-apply.test.mjs`:

```js
/**
 * A Parry or Reflect application end to end: the real apply coordinator delivering to the real
 * writer-side check (gm-bridge planDamageWrite), on the local, forwarded-owner and unowned paths.
 *
 * The target is a plain record rebuilt on every resolution, as Foundry rebuilds a synthetic
 * actor, so a check that trusted a snapshot from before the queue would let a second cost through.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./_stub/foundry-stub.mjs";

import { createActorApplyCoordinator, DEFENSIVE_DAMAGE_CAPABILITY } from "../../modules/helpers/actor-apply-coordinator.js";
import { DEFENCE_UNAFFORDABLE, planDamageWrite, prepareForwardedApply } from "../../modules/helpers/gm-bridge.js";

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const user = (id, isGM = false) => ({ id, isGM, active: true });

/** A GM, an owner and a non-owner around one target. */
function table({ type = "character", strain = { value: 7, max: 10 }, wounds = { value: 0, max: 12 } } = {}) {
  const users = [user("gm", true), user("owner"), user("player")];
  users.activeGM = users[0];
  const owns = (u) => !!u && (u.isGM || u.id === "owner");
  const state = { strain: { ...strain }, wounds: { ...wounds } };
  const updates = [];
  const chats = [];
  const coordinators = new Map();
  let sequence = 0;
  const actorFor = (id) => ({
    uuid: "Actor.target",
    type,
    isOwner: owns(users.find((u) => u.id === id)),
    testUserPermission: owns,
    system: { stats: structuredClone(state) },
  });
  for (const u of users) {
    coordinators.set(u.id, createActorApplyCoordinator({
      getUserId: () => u.id,
      getUsers: () => users,
      resolveActor: async () => actorFor(u.id),
      prepareForwarded: (a, op, sender) => prepareForwardedApply(a, op, users.find((v) => v.id === sender), true),
      async performApply(a, op) {
        const update = planDamageWrite(a, op);
        await tick(); // Real overlap between the check and the save.
        updates.push(update);
        for (const [path, value] of Object.entries(update)) {
          const [, , pool, field] = path.split(".");
          state[pool][field] = value;
        }
      },
      send(data) {
        for (const [id, coordinator] of coordinators) {
          if (id !== u.id) void coordinator.receive(structuredClone(data), u.id).catch(() => {});
        }
      },
      postChat: async (data) => { chats.push(data); },
      onChatError: () => {},
      makeRequestId: () => `${u.id}-${++sequence}`,
      timeoutMs: 1000,
      capabilityTimeoutMs: 1000,
    }));
  }
  return {
    state, updates, chats,
    apply: (id, op) => coordinators.get(id).apply(actorFor(id), op, { capability: DEFENSIVE_DAMAGE_CAPABILITY }),
  };
}

/** A 3-strain Parry that still lets 5 wounds through. */
const parry = () => ({
  type: "damage",
  changes: [{ path: WOUNDS, delta: 5 }, { path: STRAIN, delta: 3 }],
  defenceCost: { path: STRAIN, delta: 3 },
  gmChat: { content: "details" },
});

test("the hit and its cost land in one update", async () => {
  const t = table();
  assert.equal(await t.apply("player", parry()), "forwarded");
  assert.deepEqual(t.updates, [{ [WOUNDS]: 5, [STRAIN]: 10 }]);
  assert.equal(t.chats.length, 1);
});

test("two applications opened at 7/10 strain: only the first pays and lands", async () => {
  const t = table();
  const outcomes = await Promise.allSettled([t.apply("player", parry()), t.apply("owner", parry())]);

  assert.deepEqual(outcomes.map((o) => o.status).sort(), ["fulfilled", "rejected"]);
  const refusal = outcomes.find((o) => o.status === "rejected").reason;
  assert.equal(refusal.name, "ApplyRequestError");
  assert.equal(refusal.code, DEFENCE_UNAFFORDABLE);
  assert.deepEqual(t.state.strain, { value: 10, max: 10 });
  assert.equal(t.state.wounds.value, 5);
  assert.equal(t.updates.length, 1);
  assert.equal(t.chats.length, 1);
});

for (const [applier, route] of [["gm", "local"], ["owner", "forwarded owner"], ["player", "unowned"]]) {
  test(`a cost that stopped being affordable is refused on the ${route} path, with nothing written`, async () => {
    const t = table();
    t.state.strain.max = 9; // lowered after the dialog was opened at 7/10
    await assert.rejects(t.apply(applier, parry()), { name: "ApplyRequestError", code: DEFENCE_UNAFFORDABLE });
    assert.deepEqual(t.updates, []);
    assert.deepEqual(t.chats, []);
    assert.deepEqual(t.state.strain, { value: 7, max: 9 });
  });
}

test("a rival's merged hit is checked on its cost alone", async () => {
  const t = table({ type: "rival", strain: { value: 0, max: 0 }, wounds: { value: 5, max: 10 } });
  const op = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }], defenceCost: { path: WOUNDS, delta: 3 }, gmChat: { content: "x" } };
  assert.equal(await t.apply("player", op), "forwarded");
  assert.equal(t.state.wounds.value, 12);
});

test("an owner's malformed talent request is refused by the writer, although owners skip narrowing", async () => {
  const t = table();
  await assert.rejects(t.apply("owner", { ...parry(), defenceCost: { path: STRAIN, delta: 5 } }),
    { name: "ApplyRequestError", message: "Invalid apply request: defence-cost." });
  assert.deepEqual(t.updates, []);
});

for (const applier of ["gm", "owner", "player"]) {
  test(`a minion talent request from ${applier} is refused without a write or chat`, async () => {
    const t = table({ type: "minion" });
    const op = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }],
      defenceCost: { path: WOUNDS, delta: 3 }, gmChat: { content: "details" } };
    await assert.rejects(t.apply(applier, op), /Invalid apply request: defence-cost/);
    assert.deepEqual(t.updates, []);
    assert.deepEqual(t.chats, []);
  });
}
```

- [ ] **Step 2: Run the tests**

Run: `node --test tests/node/defensive-damage-apply.test.mjs`
Expected: PASS, every test. On a failure, fix the Task 3/4 code (`planDamageWrite`, `execute`'s code propagation, `verifiedExecutor`) and re-run. Don't loosen these assertions.

- [ ] **Step 3: Run the Node tier**

Run: `npm test`
Expected: no failures.

- [ ] **Step 4: Commit**

```bash
git add tests/node/defensive-damage-apply.test.mjs
git commit -m "Test Parry and Reflect through the writer's queue" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings, the Parry & Reflect menu, and the strings

**Files:**
- Modify: `modules/swffg-main.js` (import; registrations after `enableVehicleDefenceZones`, line ~742)
- Modify: `modules/settings/ui-settings.js` (import; new class after `combatSettings`)
- Modify: `modules/settings/settings-helpers.js` (import list; `registerMenu` after `combatSettings`)
- Modify: `lang/en.json` (after `SWFFG.ApplyDamage.SoakProtection`, line 51; after `SWFFG.Settings.combat.Label`, line 568)
- Test: `tests/node/defensive-talents-lang.test.mjs` (new)

**Interfaces:**
- Consumes: `DEFENSIVE_TALENT_LISTS`, `RULESET_VANILLA`, `RULESET_RESPECIALIZED`, `planDefensiveTalent`, `parseTalentNames`, `unitLabelKey` (Task 1).
- Produces: world settings `starwarsffg.defensiveTalentRuleset`, `starwarsffg.meleeDefenceTalents`, `starwarsffg.rangedDefenceTalents`, `starwarsffg.meleeSupremeTalents`, `starwarsffg.rangedSupremeTalents`, `starwarsffg.unarmedParryTalents`; menu `starwarsffg.defensiveTalentSettings`; every `SWFFG.ApplyDamage.Defence.*` key Task 7 uses.

- [ ] **Step 1: Write the failing test**

Create `tests/node/defensive-talents-lang.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  DEFENSIVE_TALENT_LISTS,
  RULESET_RESPECIALIZED,
  RULESET_VANILLA,
  parseTalentNames,
  planDefensiveTalent,
  unitLabelKey,
} from "../../modules/helpers/defensive-talents.js";

/**
 * Parry & Reflect shows only i18n keys the rules module hands back and the settings name. A key
 * missing from English would surface as a raw "SWFFG.ApplyDamage.Defence.ApplyParry" on the button.
 */
const english = JSON.parse(fs.readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
const names = Object.fromEntries(DEFENSIVE_TALENT_LISTS.map((list) => [list.field, parseTalentNames(list.default)]));

test("every label the rules hand back exists in English", () => {
  const keys = new Set();
  for (const ruleset of [RULESET_VANILLA, RULESET_RESPECIALIZED]) {
    for (const [attack, name] of [["melee", "Parry"], ["ranged", "Reflect"]]) {
      for (const rank of [1, 2]) {
        const actor = { type: "character", talentList: [{ name, rank }], system: { stats: { strain: { value: 0, max: 10 } } } };
        const plan = planDefensiveTalent({ actor, attack, ruleset, names });
        keys.add(plan.toggleLabelKey);
        keys.add(plan.publicKey);
        keys.add(plan.formula.key);
      }
    }
  }
  for (const [unit, count] of [["strain", 1], ["wounds", 1], ["wounds", 3]]) keys.add(unitLabelKey(unit, count));
  for (const suffix of ["Supreme", "Unarmed", "Cost", "SupremeName", "UnarmedName", "GMLine", "Unaffordable", "WriterOutdated"]) {
    keys.add(`SWFFG.ApplyDamage.Defence.${suffix}`);
  }
  for (const key of keys) assert.equal(typeof english[key], "string", key);
});

test("the Parry & Reflect menu and each of its settings are named in English", () => {
  const keys = [
    "Title", "Name", "Hint", "Label",
    "Ruleset.Name", "Ruleset.Hint", "Ruleset.Vanilla", "Ruleset.Respecialized",
    ...DEFENSIVE_TALENT_LISTS.flatMap((list) => [`${list.label}.Name`, `${list.label}.Hint`]),
  ];
  for (const key of keys) assert.equal(typeof english[`SWFFG.Settings.DefensiveTalents.${key}`], "string", key);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/node/defensive-talents-lang.test.mjs`
Expected: FAIL, naming `SWFFG.ApplyDamage.Defence.ApplyParry` as the first missing key.

- [ ] **Step 3: Add the strings**

In `lang/en.json`, directly after the `"SWFFG.ApplyDamage.SoakProtection": …` line, insert:

```json
  "SWFFG.ApplyDamage.Defence.ApplyParry": "Apply Parry",
  "SWFFG.ApplyDamage.Defence.ApplyReflect": "Apply Reflect",
  "SWFFG.ApplyDamage.Defence.ApplyBlock": "Apply Block",
  "SWFFG.ApplyDamage.Defence.ApplyDeflect": "Apply Deflect",
  "SWFFG.ApplyDamage.Defence.Supreme": "Supreme: 1 {unit}",
  "SWFFG.ApplyDamage.Defence.Unarmed": "Unarmed: −1 {unit}",
  "SWFFG.ApplyDamage.Defence.Cost": "Costs {cost} {unit}",
  "SWFFG.ApplyDamage.Defence.UnitStrain": "strain",
  "SWFFG.ApplyDamage.Defence.UnitWound": "wound",
  "SWFFG.ApplyDamage.Defence.UnitWounds": "wounds",
  "SWFFG.ApplyDamage.Defence.SupremeName": "Supreme",
  "SWFFG.ApplyDamage.Defence.UnarmedName": "Unarmed",
  "SWFFG.ApplyDamage.Defence.FormulaVanilla": "2 + {ranks} ranks",
  "SWFFG.ApplyDamage.Defence.FormulaVanillaOne": "2 + 1 rank",
  "SWFFG.ApplyDamage.Defence.FormulaRespec": "flat 4",
  "SWFFG.ApplyDamage.Defence.GMLine": "<strong>{talent}</strong>: −{reduction} damage ({formula}); {cost} {unit}{modifiers}.",
  "SWFFG.ApplyDamage.Defence.PublicMelee": "<strong>{actorName}</strong> parries.",
  "SWFFG.ApplyDamage.Defence.PublicRanged": "<strong>{actorName}</strong> deflects.",
  "SWFFG.ApplyDamage.Defence.Unaffordable": "{actorName} can no longer pay the selected cost. Reopen Apply Damage and choose again.",
  "SWFFG.ApplyDamage.Defence.WriterOutdated": "The client that applies damage runs an older version of the system. Ask everyone to reload Foundry, then try again.",
```

Directly after the `"SWFFG.Settings.combat.Label": "Configure Combat",` line, insert:

```json
  "SWFFG.Settings.DefensiveTalents.Title": "Parry & Reflect",
  "SWFFG.Settings.DefensiveTalents.Name": "Parry & Reflect",
  "SWFFG.Settings.DefensiveTalents.Hint": "Which talents Apply Damage offers to reduce a hit, and by which rules.",
  "SWFFG.Settings.DefensiveTalents.Label": "Configure Parry & Reflect",
  "SWFFG.Settings.DefensiveTalents.Ruleset.Name": "Rules",
  "SWFFG.Settings.DefensiveTalents.Ruleset.Hint": "Vanilla: the talent costs 3 strain and reduces the hit by 2 plus its ranks. reSpecialized (v.56): Block and Deflect, and Parry and Reflect with them, cost 3 strain and reduce the hit by 4, whatever the ranks.",
  "SWFFG.Settings.DefensiveTalents.Ruleset.Vanilla": "Vanilla",
  "SWFFG.Settings.DefensiveTalents.Ruleset.Respecialized": "reSpecialized",
  "SWFFG.Settings.DefensiveTalents.MeleeTalents.Name": "Melee talents",
  "SWFFG.Settings.DefensiveTalents.MeleeTalents.Hint": "Talents that reduce a hit from Melee, Brawl or Lightsaber. Separate names with commas; each must match the whole talent name, ignoring case. Leave empty to turn this off.",
  "SWFFG.Settings.DefensiveTalents.RangedTalents.Name": "Ranged talents",
  "SWFFG.Settings.DefensiveTalents.RangedTalents.Hint": "Talents that reduce a hit from Ranged (Light), Ranged (Heavy) or Gunnery. Separate names with commas; each must match the whole talent name, ignoring case. Leave empty to turn this off.",
  "SWFFG.Settings.DefensiveTalents.MeleeSupreme.Name": "Melee talents that cost 1 strain",
  "SWFFG.Settings.DefensiveTalents.MeleeSupreme.Hint": "Talents such as Supreme Parry that let the melee reduction cost 1 strain.",
  "SWFFG.Settings.DefensiveTalents.RangedSupreme.Name": "Ranged talents that cost 1 strain",
  "SWFFG.Settings.DefensiveTalents.RangedSupreme.Hint": "Talents such as Supreme Reflect that let the ranged reduction cost 1 strain.",
  "SWFFG.Settings.DefensiveTalents.Unarmed.Name": "Talents that cost 1 less strain",
  "SWFFG.Settings.DefensiveTalents.Unarmed.Hint": "Talents such as Unarmed Parry or Unarmed Block that cut the melee reduction's cost by 1, to a minimum of 1.",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/node/defensive-talents-lang.test.mjs tests/node/lang-expansion.test.mjs tests/node/constants.test.mjs`
Expected: PASS. `lang-expansion` confirms that no new key collides with an existing string key.

- [ ] **Step 5: Register the settings**

In `modules/swffg-main.js`, add to the imports (next to the other `./helpers/` imports):

```js
import { DEFENSIVE_TALENT_LISTS, RULESET_RESPECIALIZED, RULESET_VANILLA } from "./helpers/defensive-talents.js";
```

Directly after the closing `});` of the `enableVehicleDefenceZones` registration, insert:

```js
  // Parry & Reflect in Apply Damage: which rules shrink a hit, and which talent names count.
  // World-scoped and shown only in their own GM menu (settings-helpers.js), since they decide how
  // damage is resolved for the whole table. A name list is comma-separated and matched whole,
  // ignoring case; see helpers/defensive-talents.js.
  game.settings.register("starwarsffg", "defensiveTalentRuleset", {
    name: game.i18n.localize("SWFFG.Settings.DefensiveTalents.Ruleset.Name"),
    hint: game.i18n.localize("SWFFG.Settings.DefensiveTalents.Ruleset.Hint"),
    scope: "world",
    config: false,
    default: RULESET_VANILLA,
    type: String,
    choices: {
      [RULESET_VANILLA]: "SWFFG.Settings.DefensiveTalents.Ruleset.Vanilla",
      [RULESET_RESPECIALIZED]: "SWFFG.Settings.DefensiveTalents.Ruleset.Respecialized",
    },
  });
  for (const list of DEFENSIVE_TALENT_LISTS) {
    game.settings.register("starwarsffg", list.setting, {
      name: game.i18n.localize(`SWFFG.Settings.DefensiveTalents.${list.label}.Name`),
      hint: game.i18n.localize(`SWFFG.Settings.DefensiveTalents.${list.label}.Hint`),
      scope: "world",
      config: false,
      default: list.default,
      type: String,
    });
  }
```

- [ ] **Step 6: Add the menu**

In `modules/settings/ui-settings.js`, add below the existing import:

```js
import { DEFENSIVE_TALENT_LISTS } from "../helpers/defensive-talents.js";
```

Directly after the `combatSettings` class, add:

```js
/** Parry & Reflect in Apply Damage: the ruleset and the talent name lists (GM only, world-scoped). */
export class defensiveTalentSettings extends ffgSettings {
  static DEFAULT_OPTIONS = {
    id: "defensive-talent-settings",
    classes: ["starwarsffg", "defensive-talent-settings"],
    window: { title: "SWFFG.Settings.DefensiveTalents.Title" },
  };

  static PARTS = {
    content: { root: true, template: "systems/starwarsffg/templates/dialogs/ffg-ui-settings.html" },
  };

  async _prepareContext(_options) {
    return this._buildSettingsContext([
      "starwarsffg.defensiveTalentRuleset",
      ...DEFENSIVE_TALENT_LISTS.map((list) => `starwarsffg.${list.setting}`),
    ]);
  }
}
```

In `modules/settings/settings-helpers.js`, add `defensiveTalentSettings,` to the import list after `combatSettings,`. Then, directly after the `combatSettings` `registerMenu` call, add:

```js
    game.settings.registerMenu("starwarsffg", "defensiveTalentSettings", {
      name: game.i18n.localize("SWFFG.Settings.DefensiveTalents.Name"),
      hint: game.i18n.localize("SWFFG.Settings.DefensiveTalents.Hint"),
      label: game.i18n.localize("SWFFG.Settings.DefensiveTalents.Label"),
      icon: "fas fa-shield-halved",
      type: defensiveTalentSettings,
      restricted: true,
    });
```

- [ ] **Step 7: Run the Node tier and the import check**

Run: `npm test` then `npm run check:imports`
Expected: no failures; PASS.

- [ ] **Step 8: Commit**

```bash
git add lang/en.json modules/swffg-main.js modules/settings/ui-settings.js modules/settings/settings-helpers.js tests/node/defensive-talents-lang.test.mjs
git commit -m "Add the Parry & Reflect settings menu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Apply Damage dialog

`apply-damage.js` reaches for `DialogV2`, `ChatMessage` and `ui`, so it sits outside the Node tier (see `tests/node/stub-boundary.test.mjs`). Every decision it makes comes from the Node-tested modules. This task is wiring, verified in Foundry in Task 8.

**Files:**
- Modify: `modules/helpers/apply-damage.js` (whole file)
- Modify: `scss/components/_chat_actions.scss`, `styles/starwarsffg.css` (after the `.ffg-apply-crit[disabled]` block, ~line 3938), `styles/mandar.css` (after its `.ffg-apply-crit[disabled]` block, ~line 5390)

**Interfaces:**
- Consumes: `planDefensiveTalent`, `classifyAttack`, `parseTalentNames`, `planDefenceControls`, `readCostPool`, `unitLabelKey`, `DEFENSIVE_TALENT_LISTS` (Task 1); `planDamageApplication(..., { defence })` (Task 2); `applyToTargetActor(actor, op, options)`, `DEFENCE_UNAFFORDABLE`, `DEFENSIVE_DAMAGE_CAPABILITY`, `WRITER_OUTDATED` (Tasks 3-4); the settings and strings (Task 6).
- Produces: nothing for later tasks.

- [ ] **Step 1: Replace `modules/helpers/apply-damage.js`**

```js
/**
 * Apply Damage chat button — opens a dialog seeded from the weapon item and the
 * roll's successes, applies the resulting damage to the user's targeted token,
 * and posts a short public chat message plus a detailed GM whisper.
 *
 * When the target holds Parry, Reflect or a GM-listed equivalent that fits the
 * attack, the dialog also offers it: the talent shrinks the hit before soak and
 * its cost is written in the same update.
 *
 * See docs/superpowers/specs/2026-05-24-apply-damage-chat-button-design.md and
 * docs/superpowers/specs/2026-10-04-parry-reflect-apply-damage-design.md
 */
import {
  applyToTargetActor,
  DEFENCE_UNAFFORDABLE,
  DEFENSIVE_DAMAGE_CAPABILITY,
  WRITER_OUTDATED,
} from "./gm-bridge.js";
import {
  planDamageApplication,
  planDamageSeed,
  planDamageTarget,
} from "./apply-damage-plan.js";
import {
  DEFENSIVE_TALENT_LISTS,
  classifyAttack,
  parseTalentNames,
  planDefenceControls,
  planDefensiveTalent,
  readCostPool,
  unitLabelKey,
} from "./defensive-talents.js";

const { DialogV2 } = foundry.applications.api;

/** The world's Parry & Reflect settings, in the shape planDefensiveTalent takes. */
function readDefensiveTalentSettings() {
  const names = {};
  for (const list of DEFENSIVE_TALENT_LISTS) {
    names[list.field] = parseTalentNames(game.settings.get("starwarsffg", list.setting));
  }
  return { ruleset: game.settings.get("starwarsffg", "defensiveTalentRuleset"), names };
}

/** "strain", "wound" or "wounds" for `count` of the plan's cost pool. */
function unitLabel(plan, count) {
  return game.i18n.localize(unitLabelKey(plan.unit, count));
}

/**
 * The talent toggle and its cost options; empty when the target has nothing to offer. The ranks
 * and the size of the reduction are deliberately absent: the GM reads them in the whisper.
 */
function defenceHtml(plan) {
  if (!plan) return "";
  const option = (name, key) =>
    `<button type="button" class="ffg-defence-option" data-option="${name}" aria-pressed="false">${game.i18n.format(key, { unit: unitLabel(plan, 1) })}</button>`;
  return `
    <div class="ffg-defence">
      <button type="button" class="ffg-defence-toggle" aria-pressed="false">
        <i class="fas fa-shield-halved"></i> ${game.i18n.localize(plan.toggleLabelKey)}
      </button>
      <div class="ffg-defence-options" style="display:none;">
        ${plan.hasSupreme ? option("supreme", "SWFFG.ApplyDamage.Defence.Supreme") : ""}
        ${plan.hasUnarmed ? option("unarmed", "SWFFG.ApplyDamage.Defence.Unarmed") : ""}
        <span class="ffg-defence-cost"></span>
      </div>
    </div>`;
}

/** Freeze the talent controls once Apply is under way; the dialog closes when the callback ends. */
function lockDefenceControls(root) {
  for (const control of root.querySelectorAll(".ffg-defence-toggle, .ffg-defence-option")) control.disabled = true;
}

/** The warning for a failed apply. The refusals this dialog knows get their own localized text. */
function applyFailureMessage(err, actor) {
  if (err?.code === DEFENCE_UNAFFORDABLE) return game.i18n.format("SWFFG.ApplyDamage.Defence.Unaffordable", { actorName: actor.name });
  if (err?.code === WRITER_OUTDATED) return game.i18n.localize("SWFFG.ApplyDamage.Defence.WriterOutdated");
  return err?.name === "ApplyRequestError" ? err.message : game.i18n.localize("SWFFG.ApplyDamage.TargetGone");
}

export class ApplyDamage {
  /**
   * Called from the renderChatMessageHTML hook. Enforces visibility (button is
   * removed for users who are neither GM nor the message author) and binds
   * the click handler.
   * @param {ChatMessage} message — the live ChatMessage instance.
   * @param {jQuery} html — the rendered chat-message element wrapped in jQuery.
   */
  static bindChatMessage(message, html) {
    const button = html.find(".ffg-apply-damage")[0];
    if (!button) return;

    const authorId = message.author?.id ?? message.user;
    if (game.user.id !== authorId && !game.user.isGM) {
      button.remove();
      return;
    }

    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      ApplyDamage.show(message);
    });
  }

  /**
   * Resolve the weapon and the targeted token, open the dialog, perform the
   * damage math on Apply, and post the chat messages.
   * @param {ChatMessage} message
   */
  static async show(message) {
    // The weapon attack chat message embeds the rendered/adjusted weapon data
    // directly on the roll (see modules/dice/roll.js render() — it assigns
    // item.toObject + computed details onto roll.data). That copy already has
    // doNotSubmit.qualities with totalRanks and damage.adjusted, so we don't
    // need to re-resolve the live item via fromUuid — which can fail when the
    // item lived on an unlinked-token actor or was deleted.
    const itemData = message.rolls?.[0]?.data;
    if (!itemData) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.ItemMissing"));
      return;
    }

    const targets = [...game.user.targets];
    if (targets.length === 0) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.NoTarget"));
      return;
    }
    const target = targets[0];
    const a = target.actor;

    const plan = planDamageTarget(a);
    if (!plan) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.UnsupportedActor"));
      return;
    }
    const { showRadio, soakWord, soakValue } = plan;
    const woundLabel = game.i18n.localize(plan.woundLabelKey);
    const strainLabel = plan.strainLabelKey ? game.i18n.localize(plan.strainLabelKey) : null;

    // Damage and qualities are read straight from the chat-embedded item data.
    const { autoDamage, autoPierce, weaponName } = planDamageSeed(itemData, message.rolls?.[0]?.ffg?.success);

    // Parry, Reflect or an equivalent the target can use against this attack. Which talent, and
    // how far it reduces the hit, is fixed when the dialog opens; the cost pool is read from the
    // live actor again on every toggle and on Apply.
    const defencePlan = planDefensiveTalent({
      actor: a,
      attack: classifyAttack(itemData.system?.skill?.value),
      ...readDefensiveTalentSettings(),
    });
    const liveActor = () => target.actor ?? a;
    const selection = { on: false, supreme: false, unarmed: false };
    // DialogV2 greys out its own footer buttons while Apply runs, but not the controls in the
    // content. Once true, refresh() keeps Apply disabled and the callback refuses to run again, so
    // no click on a talent control can unlock a second submit of the same hit.
    let submitting = false;
    const defenceControls = () => planDefenceControls(defencePlan, readCostPool(liveActor()), selection);

    const damageLabel = game.i18n.localize("SWFFG.ApplyDamage.Damage");
    const pierceLabel = game.i18n.localize("SWFFG.Pierce");
    const applyLabel = game.i18n.localize("SWFFG.ApplyDamage.Apply");
    const cancelLabel = game.i18n.localize("SWFFG.ApplyDamage.Cancel");
    const radioHtml = showRadio
      ? `<div class="form-group" style="margin-bottom:10px;">
           <label><input type="radio" name="pool" value="wounds" checked> ${woundLabel}</label>
           <label style="margin-left:16px;"><input type="radio" name="pool" value="strain"> ${strainLabel}</label>
         </div>`
      : `<div class="form-group" style="margin-bottom:10px;"><strong>${woundLabel}</strong></div>`;

    const content = `
      ${radioHtml}
      <div style="display:grid; grid-template-columns: 90px 1fr; gap:6px 10px; align-items:center;">
        <label>${damageLabel}:</label>
        <input type="number" name="damage" value="${autoDamage}" min="0" style="width:100%;"/>
        <label>${pierceLabel}:</label>
        <input type="number" name="pierce" value="${autoPierce}" min="0" style="width:100%;"/>
      </div>
      ${defenceHtml(defencePlan)}
    `;

    const title = game.i18n.format("SWFFG.ApplyDamage.DialogTitle", { name: a.name });

    DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "apply",
          icon: "fas fa-burst",
          label: applyLabel,
          default: true,
          callback: async (event, button, dialog) => {
            if (submitting) return;
            submitting = true;
            const root = dialog.element;
            lockDefenceControls(root);
            // Check the pool once more at submit time: the target's pool may have changed since the
            // last refresh (another client's write, a sheet edit). A talent that was chosen and can
            // no longer be paid stops the whole application rather than landing the hit without it.
            const controls = defencePlan ? defenceControls() : null;
            if (selection.on && (!controls?.on || controls.applyDisabled)) {
              ui.notifications.warn(game.i18n.format("SWFFG.ApplyDamage.Defence.Unaffordable", { actorName: a.name }));
              return;
            }
            const defence = controls?.on
              ? { reduction: defencePlan.reduction, cost: controls.cost, costPath: defencePlan.costPath }
              : undefined;

            const hit = planDamageApplication(a, plan, {
              damage: root.querySelector('input[name="damage"]')?.value,
              pierce: root.querySelector('input[name="pierce"]')?.value,
              pool: root.querySelector('input[name="pool"]:checked')?.value,
              defence,
            });
            if (!hit) {
              ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.UnsupportedActor"));
              return;
            }
            const { path, damage, pierce, effectiveSoak, applied, soakProtection } = hit;
            const poolLabel = game.i18n.localize(hit.poolLabelKey);

            const speaker = ChatMessage.getSpeaker({ token: target.document });
            const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

            // Detailed breakdown for the GM only. It must be authored by a GM:
            // a chat message's author always sees it regardless of whisper, so if
            // the attacking (non-owning) player posted this, they would see the
            // target's soak/pierce math. The GM writer posts it; without a GM
            // connected, only the public announcement below is posted.
            const protectionNote = soakProtection.length
              ? `<p>${game.i18n.format("SWFFG.ApplyDamage.SoakProtection", { qualities: soakProtection.join(", ") })}</p>`
              : "";
            const defenceNote = defence
              ? `<p>${game.i18n.format("SWFFG.ApplyDamage.Defence.GMLine", {
                talent: defencePlan.talentNames.join(" / "),
                reduction: hit.reduction,
                formula: game.i18n.format(defencePlan.formula.key, { ranks: defencePlan.formula.ranks }),
                cost: controls.cost,
                unit: unitLabel(defencePlan, controls.cost),
                // Only the modifiers chosen for this hit, not every one the target holds.
                modifiers: [
                  controls.supreme ? game.i18n.localize("SWFFG.ApplyDamage.Defence.SupremeName") : null,
                  controls.unarmed ? game.i18n.localize("SWFFG.ApplyDamage.Defence.UnarmedName") : null,
                ].filter(Boolean).map((name) => `, ${name}`).join(""),
              })}</p>`
              : "";
            const gmChat = {
              speaker,
              whisper: gmIds,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.GMDetails", {
                actorName: a.name,
                applied,
                poolLabel,
                damage: hit.reduced ?? damage,
                effectiveSoak,
                soakWord,
                pierce,
                soak: soakValue,
              })}</p>${defenceNote}${protectionNote}`,
            };

            // A talent goes as one guarded write of the hit and its cost, and only to a writer
            // that confirms it can check that cost. Anything else keeps the single form an older
            // writer still understands.
            const op = defence
              ? { type: "damage", changes: hit.changes, defenceCost: hit.defenceCost, gmChat }
              : { type: "damage", path, delta: applied, gmChat };

            let result;
            try {
              // All clients share the elected writer's queue, including owners.
              // Forwarded calls wait for that writer to confirm completion.
              result = await applyToTargetActor(a, op, defence ? { capability: DEFENSIVE_DAMAGE_CAPABILITY } : undefined);
              if (!result) return;
            } catch (err) {
              CONFIG.logger?.warn?.("ApplyDamage: actor.update failed", err);
              ui.notifications.warn(applyFailureMessage(err, a));
              return;
            }

            // Public line for everyone (intentionally omits soak, pierce, ranks and the reduction).
            const defenceLine = defence
              ? `<p>${game.i18n.format(defencePlan.publicKey, { actorName: a.name })}</p>`
              : "";
            await ChatMessage.create({
              speaker,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.PublicMessage", {
                actorName: a.name,
                damage,
                poolLabel,
                weaponName,
              })}</p>${defenceLine}`,
            });

            // On the forwarded path the GM already posted the whisper.
            if (result === "local" && game.user.isGM) {
              await ChatMessage.create(gmChat);
            }
          },
        },
        {
          action: "cancel",
          icon: "fas fa-times",
          label: cancelLabel,
        },
      ],
      render: (event, dialog) => {
        if (!defencePlan) return;
        const root = dialog.element;
        const toggle = root.querySelector(".ffg-defence-toggle");
        const options = root.querySelector(".ffg-defence-options");
        const costLine = root.querySelector(".ffg-defence-cost");
        const applyButton = root.querySelector('button[data-action="apply"]');
        const optionButtons = [...root.querySelectorAll(".ffg-defence-option")];

        // Greyed out, never explained: the attacker learns no more about the target than that.
        const refresh = () => {
          const controls = defenceControls();
          // Render the user's choice without changing it. If paying becomes impossible,
          // Apply is blocked; the user must explicitly turn the main toggle off.
          toggle.disabled = controls.toggleDisabled;
          toggle.setAttribute("aria-pressed", String(controls.on));
          options.style.display = controls.on ? "flex" : "none";
          for (const optionButton of optionButtons) {
            optionButton.setAttribute("aria-pressed", String(controls[optionButton.dataset.option]));
          }
          costLine.textContent = game.i18n.format("SWFFG.ApplyDamage.Defence.Cost", {
            cost: controls.cost,
            unit: unitLabel(defencePlan, controls.cost),
          });
          if (applyButton) applyButton.disabled = submitting || controls.applyDisabled;
        };

        toggle.addEventListener("click", (ev) => {
          ev.preventDefault();
          selection.on = !selection.on;
          if (!selection.on) {
            selection.supreme = false;
            selection.unarmed = false;
          }
          refresh();
        });
        for (const optionButton of optionButtons) {
          optionButton.addEventListener("click", (ev) => {
            ev.preventDefault();
            selection[optionButton.dataset.option] = !selection[optionButton.dataset.option];
            refresh();
          });
        }
        refresh();
      },
      rejectClose: false,
    });
  }
}
```

- [ ] **Step 2: Style the toggle**

Append to `scss/components/_chat_actions.scss`, after the `.ffg-apply-crit[disabled]` block:

```scss
/* Parry & Reflect in the Apply Damage dialog. Pressed reads as a ring rather than a colour, so it
   works on the dialog under either Foundry theme; disabled is greyed out with no explanation. */
.ffg-defence {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ffg-defence-options {
  flex-direction: column;
  gap: 4px;
  padding-left: 16px;
}

.ffg-defence-toggle[aria-pressed="true"],
.ffg-defence-option[aria-pressed="true"] {
  box-shadow: inset 0 0 0 2px var(--color-border-highlight, #ff6400);
  font-weight: bold;
}

.ffg-defence-toggle[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

Then hand-copy the same five rules (identical text; the SCSS above uses no nesting) into `styles/starwarsffg.css`, directly after its `.ffg-apply-crit[disabled] { … }` block, and into `styles/mandar.css`, directly after its `.ffg-apply-crit[disabled] { … }` block. **Do not** run `npm run compile` and commit its output.

- [ ] **Step 3: Static checks**

Run: `npx eslint modules/helpers/apply-damage.js modules/helpers/defensive-talents.js modules/helpers/gm-bridge.js modules/helpers/actor-apply-coordinator.js`
Expected: no errors in the lines this branch touched. If a warning predates this branch, `git stash` and re-run against `main` to confirm, then leave it alone.

Run: `npm test` then `npm run check:imports`
Expected: no failures; PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/helpers/apply-damage.js scss/components/_chat_actions.scss styles/starwarsffg.css styles/mandar.css
git commit -m "Offer Parry and Reflect in the Apply Damage dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verify in Foundry, then the changelog and the wiki

**Files:**
- Modify: `CHANGELOG.md` (the `Unreleased` block at the top)
- Wiki (a separate repo): `Tutorial-12-Apply-Damage-and-Apply-Crit.md`, `Tutorial-16-More-worth-knowing.md`, and a new image under `images/`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Manual checks in Foundry**

Launch the world with this branch checked out (use the `run` skill, or start Foundry yourself). Give a test character Parry 2 and a strain threshold of 10, a rival Parry, and a second character Reflect. Check each item below and note what you saw:

1. A character with Parry 2 is hit in melee (vanilla). The toggle shows with no numbers. Apply reduces the hit by 4 and adds 3 strain. The public line ends "…parries." and the GM whisper shows the math.
2. The same character is hit by a blaster: no toggle. The Reflect character shows **Apply Reflect**.
3. Switch to reSpecialized in **Configure Settings → Star Wars FFG → Parry & Reflect**. A character with Parry 3 gets a reduction of 4, not 5, and the toggle reads **Apply Block**.
4. The rival with Parry pays 3 wounds, written in the same update as the hit.
5. A character at 8/10 strain: the toggle is greyed out. Add Supreme Parry: the toggle is enabled, and Apply is greyed out until Supreme is selected.
6. Strain damage (the Strain radio) plus Parry: one write to strain covers both.
7. A player applies to an NPC they don't own. It goes through the bridge, and the GM whisper is still posted.
8. Add a custom name to Melee talents and it is recognized. Clear the list and the toggle goes away.
9. Open two dialogs for a character at 7/10 strain and select a 3-strain Parry in both. Apply the first, then the second. Only the first writes damage and cost and posts chat; the second warns that the selected cost is no longer affordable.
10. Mixed versions. With the GM's browser open on `main` code, check out this branch on disk and reload **only** the player's browser. A talent application to an owned or an unowned target sends nothing and shows the reload warning after about 5 seconds, while ordinary damage still applies. Repeat with no GM, where the elected owner is the stale client. Then reload everyone and confirm talent applications work.
11. Give a character Parry, Supreme Parry and Unarmed Parry. At 7/10 strain, select Parry and Supreme. Change its strain to 10 on the sheet, then click the visible Unarmed option. Parry stays selected, Apply is disabled, and pressing Enter writes nothing and shows the affordability warning. Explicitly turn Parry off: ordinary damage can now be applied.
12. A minion with Parry or Reflect gets no talent toggle in either ruleset. Ordinary damage still works. The writer tests must also refuse forced talent requests to minions on every route.
13. During a capability probe to an old writer, switch the elected writer to an updated client. After the old probe times out or refuses, the replacement is probed and receives the application only after confirming support. Also verify that an unverified replacement gets no mutation.
14. In reSpecialized mode, give a character the v.56 talents Block, Deflect, Unarmed Block and Improved Unarmed Block (Task 0's sources). A melee hit offers **Apply Block**: 4 off the hit for 3 strain, or 2 strain with Unarmed selected. A ranged hit offers **Apply Deflect**: 4 off for 3 strain, with no Unarmed or Supreme option. Then replace them with Parry, Reflect, Supreme Parry and Unarmed Parry and check they behave as Block and Deflect, with Supreme at 1 strain. Note the revision tested (v.56) with the results.

If any item fails, stop and fix it in the task that owns that code (re-run that task's tests), then repeat the checks.

- [ ] **Step 2: Write the changelog entry**

In `CHANGELOG.md`, under the `` `Unreleased` `` heading, add this as the first bullet:

```markdown
* Added — **Apply Damage offers Parry and Reflect.** When the target has one that fits the attack, a toggle reduces the hit before soak and charges the strain in the same update, without showing the target's ranks; it is greyed out when the strain would incapacitate them. A GM-only **Parry & Reflect** settings menu edits which talents count and switches to the reSpecialized Block and Deflect rules.
  * Reload Foundry on every connected client. Parry and Reflect can only be applied once the GM (or, with no GM, the owner who applies the damage) runs this version; ordinary damage keeps working meanwhile.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "Describe Parry and Reflect in the changelog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Update the wiki**

Clone the wiki outside this repo, at `<wiki-clone>`, with `git clone https://github.com/YeNov/StarWarsFFG.wiki.git <wiki-clone>`. Set the YeNov `user.name` and `user.email` in that clone before committing.

In `Tutorial-12-Apply-Damage-and-Apply-Crit.md`, after the "Things to know" bullets of the **Apply Damage** section (before `## Apply Crit`), add the following. Its reSpecialized text matches Task 0's sources:

```markdown
### Parry and Reflect

If the target has **Parry** and the attack was Melee, Brawl or Lightsaber, the dialog shows
**Apply Parry**. If it has **Reflect** and the attack was Ranged or Gunnery, it shows **Apply
Reflect**. Click it to have the target use the talent: the hit is reduced before soak, and the
target suffers 3 strain in the same step (rivals suffer 3 wounds instead). Minions cannot
voluntarily pay this cost and get no talent toggle.

- The dialog never shows the target's ranks or how much is taken off; the GM's breakdown does.
  Everyone else just sees "… parries." or "… deflects." under the damage line.
- **Supreme Parry / Supreme Reflect** add a **Supreme: 1 strain** option, for a target that made
  no combat check last turn. **Unarmed Parry** (or reSpecialized's **Unarmed Block**) adds
  **Unarmed: −1 strain** against melee hits. Pick them yourself; the system can't tell which
  applies.
- The button is greyed out when paying the strain would incapacitate the target, and **Apply** is
  greyed out while the cost you picked would. A talent already selected stays selected if strain
  changes; turn it off yourself if you want to apply the hit without it.
- If Foundry says the client that applies damage runs an older version, ask everyone to reload.

The GM chooses the rules under **Configure Settings → Star Wars FFG → Parry & Reflect → Configure
Parry & Reflect**: **Vanilla** (2 + ranks) or **reSpecialized**, and which talent names count
for each. The reSpecialized option follows the fan ruleset's v.56: Block and Deflect cost 3
strain and take a flat 4 off the hit, whatever the ranks, and the toggle reads **Apply Block** or
**Apply Deflect**. Parry and Reflect, from characters built before reSpecialized replaced them,
are treated the same way.
```

Capture `docs/tutorial-shots/12-06-apply-parry.png`: the Apply Damage dialog for the Parry 2 character from Step 1, with the toggle on and Supreme visible. Record its numbered marks in `docs/tutorial-shots/12-06-apply-parry.boxes.json`, the same format as `12-02-apply-damage.boxes.json`. Both tutorial scripts live in the wiki repo's root, not in this repo. `annotate-tutorial-shots.py` only draws the shots listed in its `SPECS` table, so first add a `12-06-apply-parry` entry there, modelled on the `12-02-apply-damage` one. Then run `TUTORIAL_SHOTS=<repo>/docs/tutorial-shots python <wiki-clone>/annotate-tutorial-shots.py <wiki-clone> 12-06-apply-parry` to write `images/12-06-apply-parry.webp`. Add it under the new section:

```markdown
![Apply Parry in the Apply Damage dialog](https://raw.githubusercontent.com/wiki/YeNov/StarWarsFFG/images/12-06-apply-parry.webp)
```

The existing `12-02-apply-damage` shot shows a target without the talent, and that dialog has not changed, so it stays.

In `Tutorial-16-More-worth-knowing.md`, add to the settings list:

```markdown
- **Parry & Reflect → Configure Parry & Reflect**: the Vanilla or reSpecialized rules for Parry and
  Reflect in Apply Damage, and which talent names count as them (see [chapter 12](Tutorial-12-Apply-Damage-and-Apply-Crit)).
```

Run `python <wiki-clone>/build-tutorial-preview.py <wiki-clone>` and read chapters 12 and 16 in the preview. Commit in the wiki clone. **Push the wiki only when the user approves pushing the branch.**

- [ ] **Step 5: Final verification**

Run: `npm test` then `npm run check:imports`
Expected: no failures; PASS.

Run: `git diff main --stat`, then read the full diff for private information. It must contain no absolute paths (`D:\`, `C:\Users\`, `/home/`), no email addresses, no LAN addresses or hostnames, and no secrets.
Expected: none.

Then hand off with the superpowers:finishing-a-development-branch skill. Push and open the PR only against `YeNov/StarWarsFFG`, and only when the user asks.
