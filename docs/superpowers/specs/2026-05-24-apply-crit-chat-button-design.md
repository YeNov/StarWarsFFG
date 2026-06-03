# Apply Crit chat button — design

**Date:** 2026-05-24
**Branch:** `feature/apply-crit-chat-button`
**Scope:** Local fork only; no upstream PR.

## Problem

Rolling critical injuries/damage from an attack currently requires running a macro that prompts for the modifier, durable rank, vicious rank, and table. Most of those values are knowable from the chat message (Vicious from the weapon's qualities; existing-crits modifier and Durable from the target's actor; the right table from the target's actor type). The button on the attack chat card can do the lookup so the user only confirms or tweaks.

## Goal

Add an **Apply Crit** button to the weapon attack chat card. Clicking it opens a dialog with Modifier, Durable, Vicious, and Table pre-filled from the weapon's qualities and the target's actor. The user can edit Modifier and adjust Vicious with `±` buttons; Durable is read-only. Pressing Roll runs the macro's roll formula against the selected critical table, embeds the resulting item on the target, and posts the item description to public chat. The button is disabled when the FFG crit-eligibility condition is not met (advantages < critical rating AND no triumph).

## Non-goals

- Auto-applying multiple crits when advantages cover more than one trigger.
- Persisting "already applied" state. The button stays clickable.
- Detecting custom critical tables beyond the simple `name.includes("Critical")` filter.
- Healing or removing existing crits.
- Automated tests. Manual smoke-testing only.

## Approach summary

Mirror the Apply Damage pattern from the same feature family. Inject the button into `templates/chat/roll-weapon-card.html` next to the existing Apply Damage button, both inside the `{{#if ffg.success}}` branch and wrapped in a shared left-aligned actions row (`.ffg-chat-actions`, generalised from the existing `.ffg-apply-damage-wrap`). Implement the click logic in a new helper module `modules/helpers/apply-crit.js`. Wire it from the existing `renderChatMessage` hook in `modules/swffg-main.js` next to the Apply Damage binding. The eligibility check is performed in JS (the project's `iff` Handlebars helper supports only `==`, `>`, `<`, `!=`, `contains` — no `>=` or `or`, so a template-side check would require ugly nested branches and duplicated button HTML). When ineligible, the binder sets the button's `disabled` attribute and adds a tooltip.

## Files touched

- **New:** `modules/helpers/apply-crit.js`
- **Edit:** `templates/chat/roll-weapon-card.html` — replace the single Apply Damage wrapper with `.ffg-chat-actions` holding both buttons.
- **Edit:** `modules/swffg-main.js` — import `ApplyCrit`; call its binder from the existing `renderChatMessage` hook.
- **Edit:** `lang/en.json` — new localization keys (see below).
- **Edit:** `styles/starwarsffg.css` — rename `.ffg-apply-damage-wrap` to `.ffg-chat-actions`, add `gap`, and add `.ffg-apply-crit[disabled]` styling.

## Localization keys

New keys:
- `SWFFG.ApplyCrit.Button` — `"Apply Crit"`.
- `SWFFG.ApplyCrit.DialogTitle` — `"Critical Roll — {name}"`.
- `SWFFG.ApplyCrit.Modifier` — `"Modifier"`.
- `SWFFG.ApplyCrit.Durable` — `"Durable"`.
- `SWFFG.ApplyCrit.Vicious` — `"Vicious"`.
- `SWFFG.ApplyCrit.Table` — `"Table"`.
- `SWFFG.ApplyCrit.NoTarget` — `"Target a token before applying a crit."`.
- `SWFFG.ApplyCrit.UnsupportedActor` — `"This actor type is not supported by Apply Crit."`.
- `SWFFG.ApplyCrit.NoTable` — `"No critical table found in this world."`.
- `SWFFG.ApplyCrit.ItemMissing` — `"Could not resolve the weapon from this chat message."`.
- `SWFFG.ApplyCrit.TargetGone` — `"The target is no longer available."`.
- `SWFFG.ApplyCrit.NotEligibleTooltip` — `"Need advantages ≥ critical rating, or a triumph."`.

Reused existing keys:
- `SWFFG.ButtonRoll` (`"Roll"`) — for the dialog's primary button.
- `SWFFG.ApplyDamage.Cancel` (`"Cancel"`) — for the dialog's cancel button.

## Behavior

### Button placement and visibility

- Rendered inside `{{#if ffg.success}}` in `roll-weapon-card.html`, beside the Apply Damage button in a shared `.ffg-chat-actions` wrapper.
- Visible to the message **author (roller) and GMs only**, matching Apply Damage: the `renderChatMessage` hook removes the button when `game.user.id !== message.author?.id && !game.user.isGM`. (Originally specced as visible to everyone; unified to the Apply Damage gate on 2026-06-03 for UI consistency. Non-owning clicks still forward to the active GM via gm-bridge, so the gate is UI-only, not a permission boundary.)
- The `renderChatMessage` hook computes eligibility from the chat data; when ineligible, the binder sets `button.disabled = true` and `button.title = localize("SWFFG.ApplyCrit.NotEligibleTooltip")`.
- Eligibility: `(advantages >= critRating) || (triumphs > 0)`, where `critRating = system.crit.adjusted if non-zero else system.crit.value`, all read from `message.rolls[0].data`.

### Click handler — pre-dialog resolution

1. If the button is disabled (state already applied at render), the click handler returns immediately.
2. Read `itemData = message.rolls?.[0]?.data`. If missing → warn `SWFFG.ApplyCrit.ItemMissing`, abort.
3. Read `targets = [...game.user.targets]`. If empty → warn `SWFFG.ApplyCrit.NoTarget`, abort. Otherwise use `targets[0]`.
4. Reject unsupported actor types (not in `{character, nemesis, minion, rival, vehicle}`) → warn `SWFFG.ApplyCrit.UnsupportedActor`, abort.
5. Filter `game.tables` to entries whose `name` includes `"Critical"`. If none → warn `SWFFG.ApplyCrit.NoTable`, abort.

### Auto-fill values

- **Modifier (editable):** `existingCrits × 10`, where `existingCrits = realActor.items.filter(i => i.type === "criticalinjury" || i.type === "criticaldamage").length`.
- **Durable (display-only):** `durableRanks × 10`. Resolution per macro:
  - If `target.document.actorLink === true` → `realActor = game.actors.get(target.actor.id)`; ranks from `realActor.talentList?.find(t => t.name.toLowerCase() === "durable")?.rank`.
  - Otherwise → `realActor = target.actor` (the unlinked token actor); ranks from `realActor.items.find(i => i.name.toLowerCase() === "durable")?.system.ranks.current`.
- **Vicious ranks (± editable):** sum of `Number(q.totalRanks)` over `itemData.system.doNotSubmit?.qualities` whose `name.toLowerCase().includes("vicious")`. Same substring-match pattern Apply Damage uses for Pierce/Breach.
- **Table preselect:** target `actor.type === "vehicle"` → exact match `"Critical Damage"`; otherwise → exact match `"Critical Injuries"`. If no exact match exists in the filtered list, the first option is selected.

### Dialog

```
Critical Roll — {actorName}

Modifier:  [ N ]            Durable: M      Vicious:  K  [−] [+]            Table: [ Critical Injuries ▾ ]

   [ Roll ]   [ Cancel ]
```

- Modifier: editable `<input type="number">`, pre-filled with `autoModifier` (already ×10).
- Durable: read-only display of `autoDurable` (already ×10).
- Vicious: span showing current rank (NOT ×10) with `−` / `+` buttons. Pre-filled with `autoViciousRanks`. Clamped at 0 on the low side. Roll-time multiplier is ×10.
- Table: `<select>` populated with all `game.tables` entries whose name contains `"Critical"`. Pre-selected per the rule above.
- Roll button (`SWFFG.ButtonRoll`, icon `fa-check`); Cancel button (`SWFFG.ApplyDamage.Cancel`, icon `fa-times`).

### Roll action — math and side effects

On Roll:

1. Read inputs:
   - `modifier = parseInt(modifierInput, 10) || 0` (no clamping — matches macro; negatives allowed).
   - `viciousRanks = parseInt(viciousRankSpan.text(), 10) || 0`.
   - `viciousMod = viciousRanks × 10`.
   - `durableMod = autoDurable` (locked from auto-fill; not user-editable).
   - `tableId = select.value`.
2. Resolve `table = game.tables.get(tableId)`. If null → warn `SWFFG.ApplyCrit.NoTable`, abort.
3. Build roll: `new Roll(\`max(1d100 + ${modifier} - ${durableMod} + ${viciousMod}, 1)\`)` — exact macro formula.
4. `const draw = await table.draw({ roll: critRoll, displayChat: true })` — the rolltable posts its own draw message automatically.
5. Post-draw:
   - If `draw.results.length === 0` → no further action.
   - Otherwise: `const firstResult = draw.results[0]; const item = game.items.get(firstResult.documentId);`
   - If `item` resolves: `try { await realActor.createEmbeddedDocuments("Item", [item.toObject()]); await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ token: target.document }), content: item.system.description }); } catch (err) { ui.notifications.warn(localize("SWFFG.ApplyCrit.TargetGone")); }` — uses Foundry's canonical speaker resolver, matching the Apply Damage helper.
   - If `item` doesn't resolve → no embed, no description message. The rolltable's draw message stands.

On Cancel: dialog closes, no side effects.

### Error handling summary

- Invalid Modifier input → coerced to 0 via `parseInt(..., 10) || 0`.
- Vicious rank span clamped at 0 by the `−` handler.
- Selected table no longer exists at Roll time → warn `SWFFG.ApplyCrit.NoTable`, abort.
- Target deleted between dialog-open and Roll → `createEmbeddedDocuments` throws; warn `SWFFG.ApplyCrit.TargetGone`. The rolltable draw message has already posted.
- Permission shortfall → Foundry's built-in GM-request socket forwarding. If it still fails, the catch above shows `SWFFG.ApplyCrit.TargetGone`.

## Module shape

`modules/helpers/apply-crit.js` exports a class `ApplyCrit` with two static methods:

- `ApplyCrit.bindChatMessage(message, html)` — called from the `renderChatMessage` hook. Computes eligibility from `message.rolls[0]`. Always attaches the click handler; sets `disabled` + `title` when ineligible. The click handler is a no-op when the button is disabled.
- `ApplyCrit.show(message)` — runs the pre-dialog resolution, opens the dialog, performs the roll on Roll, embeds the item and posts the description message.

The math is internal to `show` (no separate exported pure function — out of scope per the testing decision).

## Test plan (manual smoke)

15 scenarios — see Section 5 of the brainstorming discussion. Summary:

1. Character target, crit triggers via advantages → full happy path.
2. Crit triggers via triumph (advantages alone insufficient).
3. Crit ineligible → button disabled with tooltip.
4. Vehicle target → Critical Damage pre-selected.
5. Cross-type (shipweapon vs character) → table by **target** actor type, not weapon type.
6. Vicious auto-fill from a quality with rank 2; `+`/`−` adjust.
7. Vicious substring match — quality named "Vicious Quality" still detected.
8. Modifier auto-fill from existing crits on target.
9. Durable display read from talent ranks.
10. Unlinked token actor — talents/crits read from token's local actor.
11. No targets → warning, no dialog.
12. No critical tables in world → warning, no dialog.
13. Visibility — button visible to the roller and GM only; a third (non-author, non-GM) player does not see it. Public chat output still visible to all.
14. Re-apply — works repeatedly.
15. Miss (0 successes) — neither button renders.
