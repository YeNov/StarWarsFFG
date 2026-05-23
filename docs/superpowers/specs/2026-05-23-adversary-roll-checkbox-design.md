# Adversary checkbox in roll dialog — design

**Date:** 2026-05-23
**Branch:** `feature/adversary-roll-checkbox`
**Scope:** Local fork only; no upstream PR.

## Problem

In Star Wars FFG, an NPC with the **Adversary** talent forces attacks against it to upgrade their difficulty pool a number of times equal to the talent's ranks. Upgrading converts a difficulty die (purple) into a challenge die (red); per RAW, if there are no difficulty dice to upgrade, one is added. The current roll dialog (`RollBuilderFFG`) does not account for this — a GM or player has to upgrade manually before every attack against an Adversary, which is tedious and easy to forget.

## Goal

Add a checkbox to the roll dialog labeled "Roll with Adversary" that, when checked and a targeted token has Adversary, upgrades the difficulty pool by the Adversary ranks at roll time.

## Behavior

### Source of Adversary ranks

- On dialog open, read `game.user.targets` (the user's currently targeted tokens).
- For each targeted token, find Adversary items on its actor using the same logic as [token.js:117-122](../../../modules/helpers/token.js):
  - Filter `actor.items` by `name === game.settings.get("starwarsffg", "adversaryItemName")` (default `"Adversary"`).
  - Sum each matching item's `system.ranks.current`.
- The dialog's `adversaryRanks` is the **maximum** sum across all targeted tokens. No targets, or no Adversary items, → 0.
- This is a one-time snapshot at dialog open. If the user re-targets after opening the dialog, the value is not refreshed.

### Checkbox

- Placed just above the Roll button.
- Label:
  - `Roll with Adversary (×N)` when `adversaryRanks > 0`
  - `Roll with Adversary` when `adversaryRanks == 0`
- Default state: **checked**.
- Always rendered, even when `adversaryRanks == 0` (inert in that case — toggling has no effect on the roll).

### Upgraded-pool preview

- A `<details>` block sits between the checkbox and the Roll button.
- `<summary>` text: "Adversary-upgraded pool" (localized).
- The body renders the dice pool **after** applying `upgradeDifficulty(adversaryRanks)` to a clone.
- The preview re-renders on any of:
  - Base pool change (existing `_updatePreview` hook in `RollBuilderFFG`)
  - Checkbox toggle
- Gating: the preview body only renders upgraded dice when **all** of these are true:
  - Checkbox is checked
  - `adversaryRanks > 0`
  - Current `dicePool.difficulty > 0`
- When any gate fails, the container is cleared (empty body). The `<details>` element's open/closed state is left to the user — we don't force-collapse it.

### Roll application

In the existing `.btn` click handler, immediately before constructing `new game.ffg.RollFFG(...)`:

```js
if (checkboxChecked && adversaryRanks > 0 && this.dicePool.difficulty > 0) {
  this.dicePool.upgradeDifficulty(adversaryRanks);
}
```

The rest of the roll path is unchanged. The mutation happens on the real `this.dicePool` (not the clone) so the rolled expression reflects the upgrade.

## Edge cases

| Case | Result |
|------|--------|
| No actor / no targets | `adversaryRanks = 0`, checkbox inert |
| Targeted token has no Adversary item | `adversaryRanks = 0`, checkbox inert |
| Adversary item with missing or zero `system.ranks.current` | Contributes 0 |
| Multiple targeted tokens | Use the maximum Adversary sum |
| Pool has 0 difficulty dice when Roll is clicked | Skip the upgrade entirely (no purple added, no challenge added) |
| User re-targets after opening dialog | Not re-detected; snapshot taken at open |
| GM uses "Send to Player" instead of rolling locally | Upgrade is **not** applied — the sent dice pool is the unmodified one, and the receiving player gets the same pool to roll. (Adversary applies on the actual roll path only.) |

The 0-difficulty skip rule is a **deliberate deviation from RAW** in this fork. Per RAW the upgrade would add a difficulty die; this fork instead skips so that non-attack rolls (which may have no difficulty pool) are not accidentally affected.

## Code changes

### `templates/dice/roll-options-ffg.html`

Add, immediately above the existing `<div class="roll-button flexrow">` (around line 146):

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

`adversaryLabel` is rendered server-side in `getData()` to include the rank count when present.

### `modules/dice/roll-builder.js`

**Constructor:** compute and store `this.adversaryRanks`:

```js
this.adversaryRanks = RollBuilderFFG._computeAdversaryRanks();
```

**New static helper** `_computeAdversaryRanks()`:
- Reads the setting and the user's targets, returns the max sum (or 0).
- Wraps in a try/catch so a missing setting or a target without an actor doesn't break the dialog.

**`getData()`:** add to the returned object:
```js
adversaryRanks: this.adversaryRanks,
adversaryLabel: this.adversaryRanks > 0
  ? game.i18n.format("SWFFG.Adversary.RollWithRanks", { ranks: this.adversaryRanks })
  : game.i18n.localize("SWFFG.Adversary.RollWith"),
```

**`activateListeners()`:**
- Bind `change` on `.adversary-toggle` → call `this._updateAdversaryPreview(html)`.
- Initial call to `this._updateAdversaryPreview(html)` after `_initializeInputs`.

**`_updatePreview(html)`:** add a call to `this._updateAdversaryPreview(html)` at the end so the upgraded preview stays in sync when the user changes the base pool.

**New method** `_updateAdversaryPreview(html)`:
- Find the preview container and the details element.
- Determine gating (`checked`, `adversaryRanks > 0`, `this.dicePool.difficulty > 0`).
- If any gate fails: clear the container, leave the details collapsed/empty.
- Otherwise: build a clone with only the raw dice counts (avoids re-processing `this.dicePool.source`, which expects raw arrays as constructor input and would silently drop already-processed string arrays):

  ```js
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
  ```

**Roll handler (`.btn` click):** insert the upgrade-mutation right before `new game.ffg.RollFFG(...)`:

```js
const adversaryChecked = html.find(".adversary-toggle").is(":checked");
if (adversaryChecked && this.adversaryRanks > 0 && this.dicePool.difficulty > 0) {
  this.dicePool.upgradeDifficulty(this.adversaryRanks);
}
```

This must be inside the `else` branch (the local-roll branch) — **not** in the `sentToPlayer` branch.

### `lang/en.json`

Add:
- `"SWFFG.Adversary.RollWith": "Roll with Adversary"`
- `"SWFFG.Adversary.RollWithRanks": "Roll with Adversary (×{ranks})"`
- `"SWFFG.Adversary.UpgradedPool": "Adversary-upgraded pool"`

Other language files are out of scope (they currently lack many keys already and fall back to English).

### `modules/dice/pool.js`

**No changes.** `upgradeDifficulty(n)` already does exactly what's needed.

## Verification

This is a Foundry VTT system module — there is no unit-test harness for the dialog/UI flow. Verification is manual, by loading the system in a Foundry world:

1. **Adversary present:** Target a token with an Adversary item (ranks 2). Open a combat roll dialog. Confirm:
   - Checkbox label shows "Roll with Adversary (×2)".
   - Checkbox is checked by default.
   - "Adversary-upgraded pool" details, when expanded, shows the difficulty/challenge mix produced by 2 upgrades.
   - Clicking Roll produces a chat roll whose dice expression reflects the upgrades.
2. **Checkbox unchecked:** Same setup, uncheck the box, Roll. Confirm no upgrades applied to the chat roll.
3. **No target / no Adversary:** Untarget all tokens (or target a token with no Adversary). Open dialog. Confirm checkbox is present but inert; rolling produces an unmodified pool.
4. **Zero base difficulty:** Open a dialog with 0 difficulty dice, with Adversary target. Roll. Confirm no difficulty/challenge dice are added.
5. **Manual difficulty change while checkbox checked:** With Adversary 2, increase base difficulty from 1 to 3 via the dialog. Confirm the upgraded-pool preview updates to reflect 3 base difficulty → upgraded.
6. **Multiple targets:** Target two adversary tokens (ranks 1 and 3). Confirm the dialog uses 3 (the max).

If I (Claude) cannot run Foundry to verify these myself, I'll say so explicitly and leave the verification to the user.

## Out of scope

- Localization beyond English.
- Re-detecting target changes after the dialog is opened.
- Applying Adversary to the GM's "Send to Player" path.
- Any other talent or modifier (e.g., Dodge, Force Rating).
- Changes to compatible upstream behavior (this is a local-fork-only feature).
