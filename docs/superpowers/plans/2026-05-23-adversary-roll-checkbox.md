# Adversary Roll Checkbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Roll with Adversary" checkbox to the dice roll dialog that auto-upgrades difficulty by the targeted token's Adversary talent ranks, with a live `<details>` preview of the upgraded pool.

**Architecture:** Pure UI/dialog change in `RollBuilderFFG`. On dialog open, snapshot the user's targeted tokens to compute `adversaryRanks` (max Adversary-item rank sum across targets). The template gets a checkbox + `<details>`/preview block above the Roll button. A new `_updateAdversaryPreview()` method clones the dice pool, applies `upgradeDifficulty(N)` on the clone, and re-renders the preview on both base-pool changes and checkbox toggles. On Roll, the same upgrade is applied to the real `dicePool` immediately before the roll is constructed.

**Tech Stack:** Foundry VTT v12+ system module. Vanilla JS, Handlebars templates, jQuery (Foundry-bundled). No bundler — files are loaded as-is. No unit test harness applicable to the dialog flow; verification is `npx eslint modules` plus manual in-Foundry checks.

**Spec:** [docs/superpowers/specs/2026-05-23-adversary-roll-checkbox-design.md](../specs/2026-05-23-adversary-roll-checkbox-design.md)

**Branch:** `feature/adversary-roll-checkbox` (already checked out).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `modules/dice/roll-builder.js` | Modify | Compute Adversary ranks; render label & preview; apply upgrade at roll time |
| `templates/dice/roll-options-ffg.html` | Modify | Checkbox + `<details>` preview block above Roll button |
| `lang/en.json` | Modify | Add 3 localization keys |

No new files. No changes to `pool.js`, `dice-helpers.js`, or any other dispatch site.

---

## Task 1: Add localization strings

**Files:**
- Modify: `lang/en.json` (insert near existing dice-dialog keys around line 328)

- [ ] **Step 1: Add the three new keys**

Open [lang/en.json](../../../lang/en.json), find the line containing `"SWFFG.UpgradeDifficulty": "Upgrade Difficulty",` (currently line 328). Immediately after it, insert:

```json
  "SWFFG.Adversary.RollWith": "Roll with Adversary",
  "SWFFG.Adversary.RollWithRanks": "Roll with Adversary (×{ranks})",
  "SWFFG.Adversary.UpgradedPool": "Adversary-upgraded pool",
```

Keep the trailing comma on the previous line and ensure JSON remains valid (the next line should also keep its comma if it isn't the last entry — which it isn't, it's `"SWFFG.ButtonRoll": "Roll",`).

- [ ] **Step 2: Validate JSON parses**

Run from the repo root:

```powershell
node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('ok')"
```

Expected output: `ok`. If it errors, fix the trailing-comma or quoting issue and re-run.

- [ ] **Step 3: Commit**

```powershell
git add lang/en.json
git commit -m @'
i18n: add Adversary roll dialog keys

Add SWFFG.Adversary.RollWith, RollWithRanks, and UpgradedPool for the
new Adversary checkbox in the roll dialog.
'@
```

---

## Task 2: Add checkbox + preview block to the roll template

**Files:**
- Modify: `templates/dice/roll-options-ffg.html` (insert immediately before line 146, the `<div class="roll-button flexrow">`)

- [ ] **Step 1: Insert the markup**

In [templates/dice/roll-options-ffg.html](../../../templates/dice/roll-options-ffg.html), find the block:

```html
    </details>
    <div class="roll-button flexrow">
      <button class="btn">{{localize "SWFFG.SkillsRoll"}}</button>
    </div>
```

(The `</details>` is the close of the `Options` details block at line 145.) Insert between `</details>` and `<div class="roll-button flexrow">`:

```html
    <div class="adversary-controls">
      <label>
        <input type="checkbox" class="adversary-toggle" checked />
        {{adversaryLabel}}
      </label>
    </div>
    <details class="adversary-preview-details">
      <summary>{{localize "SWFFG.Adversary.UpgradedPool"}}</summary>
      <div class="adversary-preview"></div>
    </details>
```

`adversaryLabel` is supplied by `getData()` in Task 3 and will be either `"Roll with Adversary"` or `"Roll with Adversary (×N)"`.

- [ ] **Step 2: Commit**

```powershell
git add templates/dice/roll-options-ffg.html
git commit -m @'
template: add Adversary checkbox and upgraded-pool preview

Insert a checked-by-default "Roll with Adversary" checkbox and a
<details> block for the upgraded-pool preview just above the Roll
button in the dice dialog. Wiring lands in the next commit.
'@
```

(The template references `{{adversaryLabel}}` which is not yet provided by `getData()`; this is intentional — Handlebars renders missing values as empty strings, so the dialog still opens without errors, just with an unlabeled checkbox. Task 3 supplies the label and behavior.)

---

## Task 3: Wire Adversary detection, preview, and roll-time upgrade

**Files:**
- Modify: `modules/dice/roll-builder.js`

This task delivers the entire JS side in one commit because the pieces (constructor, getData, listeners, roll handler) only make sense together — splitting would leave the build in a broken state mid-task.

- [ ] **Step 1: Add the constructor field and the detection helper**

Open [modules/dice/roll-builder.js](../../../modules/dice/roll-builder.js).

At the end of the constructor (after line 14, the closing `}` of `this.roll = {...}` is at line 12; `this.dicePool = ...` is line 13, `this.description = ...` is line 14), add:

```js
    this.adversaryRanks = RollBuilderFFG._computeAdversaryRanks();
```

So the constructor becomes:

```js
  constructor(rollData, rollDicePool, rollDescription, rollSkillName, rollItem, rollAdditionalFlavor, rollSound) {
    super();
    this.roll = {
      data: rollData,
      skillName: rollSkillName,
      item: rollItem,
      sound: rollSound,
      flavor: rollAdditionalFlavor,
    };
    this.dicePool = rollDicePool;
    this.description = rollDescription;
    this.adversaryRanks = RollBuilderFFG._computeAdversaryRanks();
  }
```

Then, immediately above the `static get defaultOptions()` block (currently line 18), add the static helper:

```js
  /**
   * Snapshot the max Adversary rank sum across the user's targeted tokens.
   * Mirrors the rank-counting logic in modules/helpers/token.js drawAdversaryCount.
   * Returns 0 if no targets, no actors, or no Adversary items.
   */
  static _computeAdversaryRanks() {
    try {
      const itemName = game.settings.get("starwarsffg", "adversaryItemName");
      const targets = Array.from(game.user?.targets ?? []);
      if (!targets.length) return 0;
      let max = 0;
      for (const token of targets) {
        const items = token?.actor?.items?.filter((i) => i.name === itemName) ?? [];
        let sum = 0;
        for (const item of items) {
          sum += item?.system?.ranks?.current || 0;
        }
        if (sum > max) max = sum;
      }
      return max;
    } catch (err) {
      CONFIG.logger?.warn?.("Adversary rank detection failed", err);
      return 0;
    }
  }
```

- [ ] **Step 2: Surface the label in `getData()`**

In `getData()` (the `return { ... }` is at lines 102-113), add two fields. Change:

```js
    return {
      sounds,
      isGM: game.user.isGM,
      canUserAddAudio,
      flavor: this.roll.flavor,
      users,
      enableForceDie,
      labels,
      diceSymbols,
      simDisplay: display,
      simCount: game.settings.get("starwarsffg", "rollSimulation")
    };
```

to:

```js
    return {
      sounds,
      isGM: game.user.isGM,
      canUserAddAudio,
      flavor: this.roll.flavor,
      users,
      enableForceDie,
      labels,
      diceSymbols,
      simDisplay: display,
      simCount: game.settings.get("starwarsffg", "rollSimulation"),
      adversaryRanks: this.adversaryRanks,
      adversaryLabel: this.adversaryRanks > 0
        ? game.i18n.format("SWFFG.Adversary.RollWithRanks", { ranks: this.adversaryRanks })
        : game.i18n.localize("SWFFG.Adversary.RollWith"),
    };
```

- [ ] **Step 3: Add the `_updateAdversaryPreview` method**

Immediately below the existing `_updatePreview(html)` method (which spans lines 276-281), add:

```js
  _updateAdversaryPreview(html) {
    const container = html.find(".adversary-preview")[0];
    if (!container) return;
    container.innerHTML = "";

    const toggle = html.find(".adversary-toggle")[0];
    const checked = toggle ? toggle.checked : true;
    const gate = checked && this.adversaryRanks > 0 && this.dicePool.difficulty > 0;
    if (!gate) return;

    const clone = new game.ffg.DicePoolFFG({
      proficiency: this.dicePool.proficiency,
      ability:     this.dicePool.ability,
      challenge:   this.dicePool.challenge,
      difficulty:  this.dicePool.difficulty,
      boost:       this.dicePool.boost,
      setback:     this.dicePool.setback,
      force:       this.dicePool.force,
      advantage:   this.dicePool.advantage,
      success:     this.dicePool.success,
      threat:      this.dicePool.threat,
      failure:     this.dicePool.failure,
      light:       this.dicePool.light,
      dark:        this.dicePool.dark,
      triumph:     this.dicePool.triumph,
      despair:     this.dicePool.despair,
    });
    clone.upgradeDifficulty(this.adversaryRanks);
    clone.renderPreview(container);
  }
```

- [ ] **Step 4: Call the new method from `_updatePreview` and on checkbox toggle**

Change `_updatePreview(html)` (lines 276-281) from:

```js
  _updatePreview(html) {
    const poolDiv = html.find(".dice-pool-dialog .dice-pool")[0];
    poolDiv.innerHTML = "";
    this.dicePool.renderPreview(poolDiv);
    this._updateSimulationPreview();
  }
```

to:

```js
  _updatePreview(html) {
    const poolDiv = html.find(".dice-pool-dialog .dice-pool")[0];
    poolDiv.innerHTML = "";
    this.dicePool.renderPreview(poolDiv);
    this._updateSimulationPreview();
    this._updateAdversaryPreview(html);
  }
```

Then in `activateListeners(html)`, immediately after the `this._activateInputs(html);` call (line 121), add the checkbox change handler:

```js
    html.find(".adversary-toggle").on("change", () => {
      this._updateAdversaryPreview(html);
    });
```

The first paint of the upgraded preview already happens for free: `_initializeInputs(html)` (line 120) calls `_updatePreview(html)` at its end (line 295), which now also calls `_updateAdversaryPreview(html)`.

- [ ] **Step 5: Apply the upgrade at Roll time**

In the `.btn` click handler, find the local-roll `else` branch (line 234). Inside it, immediately above the line that constructs the roll:

```js
        const roll = new game.ffg.RollFFG(this.dicePool.renderDiceExpression(), this.roll.item, this.dicePool, this.roll.flavor);
```

Insert:

```js
        const adversaryChecked = html.find(".adversary-toggle").is(":checked");
        if (adversaryChecked && this.adversaryRanks > 0 && this.dicePool.difficulty > 0) {
          this.dicePool.upgradeDifficulty(this.adversaryRanks);
        }
```

So the surrounding block reads:

```js
      } else {
        if (this.roll.crew) {
          this.roll.item['crew'] = this.roll.crew
        }
        const adversaryChecked = html.find(".adversary-toggle").is(":checked");
        if (adversaryChecked && this.adversaryRanks > 0 && this.dicePool.difficulty > 0) {
          this.dicePool.upgradeDifficulty(this.adversaryRanks);
        }
        const roll = new game.ffg.RollFFG(this.dicePool.renderDiceExpression(), this.roll.item, this.dicePool, this.roll.flavor);
```

This intentionally lives only in the local-roll branch. The `sentToPlayer` branch above (line 206) sends the pool to another player to roll; per the spec, Adversary is not applied to that path.

- [ ] **Step 6: Lint**

Run from the repo root:

```powershell
npx eslint modules/dice/roll-builder.js
```

Expected: no errors. If eslint reports unused vars or formatting issues, fix them.

- [ ] **Step 7: Commit**

```powershell
git add modules/dice/roll-builder.js
git commit -m @'
feat(dice): wire Adversary checkbox in roll dialog

- Snapshot max Adversary rank across user targets at dialog open
- Label the checkbox with the rank count when > 0
- Live "Adversary-upgraded pool" preview re-renders on pool changes
  and checkbox toggles, gated on (checked && ranks > 0 && difficulty > 0)
- On Roll click, upgrade dicePool.upgradeDifficulty(ranks) right before
  building the RollFFG. Not applied on the "send to player" path.
'@
```

---

## Task 4: Manual verification in Foundry

This task can only be performed by the user (or by Claude with a running Foundry instance the user opens). The plan executor should request the user perform these checks rather than claim success.

- [ ] **Step 1: Reload the world / system in Foundry**

Foundry caches templates and JS. Either restart Foundry or use the "Return to Setup" → relaunch flow so the new template and JS are loaded.

- [ ] **Step 2: Walk the verification matrix from the spec**

Run through each scenario in [the spec's Verification section](../specs/2026-05-23-adversary-roll-checkbox-design.md#verification):

1. Adversary present (ranks 2) → checkbox label `(×2)`, preview shows upgraded pool, rolled chat reflects upgrades.
2. Checkbox unchecked → no upgrade in rolled chat.
3. No target / no Adversary → checkbox visible & inert; roll unmodified.
4. Zero base difficulty → no upgrade applied.
5. Change base difficulty after opening dialog → preview re-renders.
6. Multiple targets (ranks 1 and 3) → uses 3.

Record any deviations and fix them before considering the task complete.

- [ ] **Step 3: If everything passes, the work is done**

No further commits needed. The branch sits with three commits (i18n, template, JS) ready for the user to merge to `main` locally or keep as a feature branch — per their standing rule, no PR to the upstream repository.

---

## Self-review notes

- **Spec coverage:** Every spec section maps to a task — strings (T1), template (T2), constructor/getData/preview/roll-handler (T3), verification (T4).
- **No placeholders:** All code blocks contain literal final code; no "TODO"/"similar to" steps.
- **Type consistency:** `_computeAdversaryRanks` (static), `_updateAdversaryPreview` (instance), `adversaryRanks` (instance field), `.adversary-toggle` / `.adversary-preview` (CSS selectors), `adversaryLabel` (template var). Used identically across tasks.
- **Deviation from the spec's `_updatePreview` description:** the spec said "add the call at the end of `_updatePreview`" — Task 3 step 4 implements exactly that. Step 4 also handles the "initial paint" concern by relying on the existing `_initializeInputs → _updatePreview` chain, so no separate init call is needed (cleaner than the spec's "Initial call to `this._updateAdversaryPreview(html)` after `_initializeInputs`" suggestion, which would have been redundant).
