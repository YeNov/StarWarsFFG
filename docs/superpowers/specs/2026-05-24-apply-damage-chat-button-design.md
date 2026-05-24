# Apply Damage chat button — design

**Date:** 2026-05-24
**Branch:** `feature/apply-damage-chat-button`
**Scope:** Local fork only; no upstream PR.

## Problem

Applying damage from an attack currently requires running the user's `apply-damage` macro, which prompts for damage, pierce, and soak by hand. Damage and pierce are knowable from the weapon item and the attack roll; soak is knowable from the target. Re-typing them is tedious and error-prone.

## Goal

Add an **Apply Damage** button to the weapon attack chat card. Clicking it opens a dialog with damage and pierce pre-filled from the weapon and the roll, lets the user override them, applies the resulting damage to the targeted token's Wounds / Strain / Hull Trauma / System Strain, and posts a chat message — short for everyone, detailed for the GM.

## Non-goals

- Critical injuries / vehicle critical hits.
- Healing (negative damage).
- Auto-fire / Blast / Linked extra-hit automation. User edits the Damage input manually if needed.
- Persisting an "already applied" state. The button stays clickable.
- Automated tests. Manual smoke-testing only for this feature.

## Approach summary

Add the button to the existing weapon-card template (`templates/chat/roll-weapon-card.html`) inside the `{{#if ffg.success}}` block, so it is automatically hidden on misses. Implement the click logic in a new helper module `modules/helpers/apply-damage.js`. Wire the click handler from the existing `renderChatMessage` hook in `modules/swffg-main.js`. The hook also enforces button visibility: hidden for non-GM, non-author users.

## Files touched

- **New:** `modules/helpers/apply-damage.js`
- **Edit:** `templates/chat/roll-weapon-card.html` — add the button.
- **Edit:** `modules/swffg-main.js` — import `ApplyDamage` and call its binder from the existing `renderChatMessage` hook (around line 1081).
- **Edit:** `lang/en.json` — new localization keys (see below).
- **Edit:** `styles/starwarsffg.css` — minor button styling.

## Localization keys

New keys:
- `SWFFG.Pierce` — `"Pierce"` (top-level reusable; no existing equivalent in `en.json`).
- `SWFFG.ApplyDamage.Button` — button label.
- `SWFFG.ApplyDamage.DialogTitle` — dialog title (template includes `{name}`).
- `SWFFG.ApplyDamage.Damage` — `"Damage"` input label.
- `SWFFG.ApplyDamage.Apply`, `SWFFG.ApplyDamage.Cancel`.
- `SWFFG.ApplyDamage.NoTarget` — warning shown when no token is targeted.
- `SWFFG.ApplyDamage.UnsupportedActor` — warning for actor types outside `{character, nemesis, minion, rival, vehicle}`.
- `SWFFG.ApplyDamage.ItemMissing` — warning when the weapon item cannot be resolved from the message.
- `SWFFG.ApplyDamage.TargetGone` — warning when the target actor is no longer available at Apply time.
- `SWFFG.ApplyDamage.PublicMessage` — short chat template.
- `SWFFG.ApplyDamage.GMDetails` — detailed GM whisper template.

Reused existing keys:
- `SWFFG.Wounds` (`"Wounds"`).
- `SWFFG.Strain` (`"Strain"`).
- `SWFFG.VehicleHullTrauma` (`"Hull Trauma"`).
- `SWFFG.VehicleHullStrain` (`"Sys Strain"`).

## Behavior

### Button placement and visibility

- Rendered inside `{{#if ffg.success}}` in `roll-weapon-card.html`, after the qualities/specials section. This auto-hides the button on misses (zero successes).
- The `renderChatMessage` hook fills `data-message-id` on the button and removes the button entirely if `game.user.id !== message.user && !game.user.isGM`.
- Applies to both `weapon` and `shipweapon` item types (the same partial is used for both via `templates/dice/roll-ffg.html:19`).

### Click handler — pre-dialog resolution

When the button is clicked:

1. **Resolve weapon item** via `fromUuid(message.flags.starwarsffg.ffgUuid)` (matches the pattern in `modules/dice/roll.js:264-275`). If not resolvable, warn `SWFFG.ApplyDamage.ItemMissing`, abort.
2. **Resolve target:** `targets = [...game.user.targets]`. If empty, warn `SWFFG.ApplyDamage.NoTarget`, abort. Otherwise use `targets[0]` (multi-target unsupported by the system).
3. **Reject unsupported actor types:** if `target.actor.type` is not in `{character, nemesis, minion, rival, vehicle}`, warn `SWFFG.ApplyDamage.UnsupportedActor`, abort.

### Auto-fill values

- **Damage:** `baseDamage + message.rolls[0].ffg.success`, where `baseDamage = item.system.damage.adjusted` if it is non-zero, else `item.system.damage.value`. (Matches the conditional in `roll-weapon-card.html` lines 7-10.)
- **Pierce:** `pierceRanks + 10 × breachRanks`, where ranks are summed from `item.system.itemmodifier` entries whose `name` matches `"Pierce"` or `"Breach"` (case-insensitive), using each entry's `totalRanks`.
- **Soak (hidden):**
  - `vehicle` → `target.actor.system.stats.armour.value`.
  - others → `target.actor.system.stats.soak.value`.
  - Coerced via `Number(...) || 0`.

### Dialog

Layout:

```
[ ⦿ <woundLabel>   ○ <strainLabel> ]   (radio only when both pools exist)

Damage:  [  9 ]
Pierce:  [  2 ]

   [ Apply ]   [ Cancel ]
```

- Radio:
  - `character` / `nemesis` → Wounds (default) / Strain. Paths `system.stats.wounds.value` and `system.stats.strain.value`.
  - `vehicle` → Hull Trauma (default) / Sys Strain. Paths `system.stats.hullTrauma.value` and `system.stats.systemStrain.value`.
  - `minion` / `rival` → no radio; header shows `<strong>Wounds</strong>`. Path `system.stats.wounds.value`.
- Damage and Pierce inputs are editable. Soak is not displayed.
- Dialog title: localized template with the target actor name interpolated.

### Apply action — math and side effects

On Apply:

1. Read editable inputs:
   - `damage = max(0, parseInt(damageInput, 10) || 0)`.
   - `pierce = max(0, parseInt(pierceInput, 10) || 0)`.
2. Compute:
   - `effectiveSoak = max(0, soak - pierce)`.
   - `applied = max(0, damage - effectiveSoak)`.
3. Determine `path` from the selected radio (or fixed wounds path for minion/rival).
4. `current = Number(foundry.utils.getProperty(target.actor, path)) || 0`.
5. `await target.actor.update({ [path]: current + applied })`.
6. Post **two** chat messages, both with `speaker = ChatMessage.getSpeaker({ token: target.document })`:
   - **Public** (no `whisper`), short:
     `"{actorName} takes {damage} {poolLabel} from {weaponName}."`
     — `actorName` from the target (`target.actor.name`), `weaponName` from the resolved item (`item.name`). Uses the dialog's `damage` value (raw), never `applied` or `soak`, so non-GM players cannot infer defenses.
   - **GM whisper** (`whisper = game.users.filter(u => u.isGM).map(u => u.id)`), detailed:
     `"{actorName} takes {applied} {poolLabel} ({damage} dmg − {effectiveSoak} effective {soakWord}; pierce {pierce} vs {soakWord} {soak})."`
     — `soakWord` is `"armour"` for vehicles, `"soak"` otherwise.

On Cancel: dialog closes, no side effects.

### Error handling

- Non-numeric / negative inputs: clamped to 0 (same `Math.max(0, parseInt(...) || 0)` defense as the macro).
- Target deleted between dialog-open and Apply: `actor.update` throws; catch, warn `SWFFG.ApplyDamage.TargetGone`, no chat output.
- Permissions: a non-owning player clicking Apply on a target they don't own will rely on Foundry's built-in GM-request socket forwarding. No custom GM bridge. If forwarding still fails, the caught error is shown via `SWFFG.ApplyDamage.TargetGone`.
- Strain pool selected but target has no strain field (rare/legacy data): abort with the unsupported-actor warning, no update.

## Module shape

`modules/helpers/apply-damage.js` exports a class `ApplyDamage` with two static methods:

- `ApplyDamage.bindChatMessage(message, html)` — called from the `renderChatMessage` hook. Fills `data-message-id`, removes the button if the viewer is neither GM nor the message author, attaches the click handler.
- `ApplyDamage.show(message)` — runs the pre-dialog resolution, opens the dialog, performs the math on Apply, posts the two chat messages.

The math is internal to `show` (no separate exported pure function — explicitly out of scope per the testing decision).

## Test plan (manual smoke)

Run in a live Foundry world with the system loaded.

1. **Character target, Wounds path:** character attacks character → button visible to attacker and GM, hidden from a third player. Apply with Wounds → target's Wounds increase by `max(0, (base+successes) − max(0, soak − autoPierce))`. Public chat shows short line; GM whisper shows detailed line.
2. **Strain pool:** same as 1, switch radio to Strain → updates `strain.value`.
3. **Minion/rival target:** no radio, label says Wounds, applies to `wounds.value`.
4. **Vehicle attack on vehicle:** `shipweapon` chat, vehicle target → Hull Trauma / Sys Strain radio, soak source = `armour.value`.
5. **Cross-type (shipweapon → character, weapon → vehicle):** uses target's actor-type rules without crashing.
6. **Breach math:** weapon with Breach 1, Pierce 1 → Pierce field auto-fills to 11.
7. **Miss:** no-success attack → button not rendered.
8. **No target:** click with no targeted token → `SWFFG.ApplyDamage.NoTarget` warning, no dialog.
9. **Permission visibility:**
   - Attacker sees the button on their own attack message.
   - GM sees the button on every weapon attack.
   - Third player (not attacker, not GM) does not see the button.
   - After Apply: attacker and other non-GM players see only the public short line; GM additionally sees the detailed whisper.
10. **Re-apply:** click again on the same message → dialog reopens, works again.
11. **Edited inputs:** override Damage and Pierce in the dialog → math uses the edited values; public line shows the edited Damage.
