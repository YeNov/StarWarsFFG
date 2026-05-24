# Apply Damage chat button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Apply Damage" button to weapon attack chat cards that opens a dialog pre-filled with auto-computed damage and pierce, applies the result to the targeted token, and posts a short public chat line plus a detailed GM whisper.

**Architecture:** Inline a button into the existing weapon-card chat partial; bind it from the existing `renderChatMessage` hook via a new helper module that handles target/item resolution, the dialog, the math, and the chat output.

**Tech Stack:** Foundry VTT v13, vanilla JS modules, Handlebars templates, jQuery (provided by Foundry), starwarsffg system.

**Spec:** [docs/superpowers/specs/2026-05-24-apply-damage-chat-button-design.md](../specs/2026-05-24-apply-damage-chat-button-design.md)

---

## File map

- **Create:** `modules/helpers/apply-damage.js` — `ApplyDamage` class with `bindChatMessage(message, html)` and `show(message)` static methods. Owns the dialog, math, and chat-message creation.
- **Modify:** `templates/chat/roll-weapon-card.html` — add the button inside the existing `{{#if ffg.success}}` block.
- **Modify:** `modules/swffg-main.js` — import `ApplyDamage`; call `ApplyDamage.bindChatMessage(...)` from the existing `renderChatMessage` hook around line 1081.
- **Modify:** `lang/en.json` — add new localization keys.
- **Modify:** `styles/starwarsffg.css` — small button styling.

No automated tests in this plan (per spec). Each task ends with a manual verification step where applicable; the final task is the smoke-test pass.

---

### Task 1: Add localization keys

**Files:**
- Modify: `lang/en.json`

- [ ] **Step 1: Open `lang/en.json` and add the new keys.**

The file is a flat JSON object. Add the following keys. Place them near the top, after the `TYPES.*` block (before line containing `"SWFFG.Wounds": "Wounds"` is a fine spot — keep alphabetical-ish ordering with neighbours).

```json
  "SWFFG.Pierce": "Pierce",
  "SWFFG.ApplyDamage.Button": "Apply Damage",
  "SWFFG.ApplyDamage.DialogTitle": "Apply Damage — {name}",
  "SWFFG.ApplyDamage.Damage": "Damage",
  "SWFFG.ApplyDamage.Apply": "Apply",
  "SWFFG.ApplyDamage.Cancel": "Cancel",
  "SWFFG.ApplyDamage.NoTarget": "Target a token before applying damage.",
  "SWFFG.ApplyDamage.UnsupportedActor": "This actor type is not supported by Apply Damage.",
  "SWFFG.ApplyDamage.ItemMissing": "Could not resolve the weapon from this chat message.",
  "SWFFG.ApplyDamage.TargetGone": "The target is no longer available.",
  "SWFFG.ApplyDamage.PublicMessage": "<strong>{actorName}</strong> takes <strong>{damage}</strong> {poolLabel} from <em>{weaponName}</em>.",
  "SWFFG.ApplyDamage.GMDetails": "<strong>{actorName}</strong> takes <strong>{applied}</strong> {poolLabel} ({damage} dmg − {effectiveSoak} effective {soakWord}; pierce {pierce} vs {soakWord} {soak}).",
```

Make sure the comma at the end of the previous existing key remains, and the last new line keeps its trailing comma (since you'll be inserting before more keys, not at the end of the object).

- [ ] **Step 2: Verify JSON is valid.**

Run:
```
node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit.**

```
git add lang/en.json
git commit -m "i18n: add Apply Damage chat button keys"
```

---

### Task 2: Add the button to the weapon-card template

**Files:**
- Modify: `templates/chat/roll-weapon-card.html`

- [ ] **Step 1: Open the file and locate the success branch.**

The file currently looks like (excerpt):
```html
  {{#if ffg.success}}
  {{#iff system.system.damage.adjusted '!=' 0 }}<h4 class="item-damage">…</h4>
  <h4 class="item-critical">…</h4>{{/iff}}
  {{#iff system.system.damage.adjusted '==' 0 }}<h4 class="item-damage">…</h4>
  <h4 class="item-critical">…</h4>{{/iff}}
  {{else}}
  <h4 class="item-miss">Miss!</h4>
  {{/if}}
```

- [ ] **Step 2: Add the button immediately before `{{else}}`.**

Find this line (line 11 in the current file):
```html
  {{else}}
```

Replace it with:
```html
  <div class="ffg-apply-damage-wrap">
    <button type="button" class="ffg-apply-damage">
      <i class="fas fa-burst"></i> {{localize "SWFFG.ApplyDamage.Button"}}
    </button>
  </div>
  {{else}}
```

The button sits inside the `{{#if ffg.success}}` branch so it is automatically hidden on misses.

- [ ] **Step 3: Manual sanity check (no Foundry needed yet).**

Re-read the file. The button must be:
- Inside `{{#if ffg.success}}` (so misses hide it).
- After the damage/critical `<h4>` lines (so it sits visually below them).
- Outside the `{{#iff …}}` sub-blocks (so it doesn't get rendered twice).

- [ ] **Step 4: Commit.**

```
git add templates/chat/roll-weapon-card.html
git commit -m "feat(chat): add Apply Damage button to weapon-card template"
```

---

### Task 3: Create the `ApplyDamage` helper module

**Files:**
- Create: `modules/helpers/apply-damage.js`

- [ ] **Step 1: Create the file with the full implementation.**

Create `modules/helpers/apply-damage.js` with this exact content:

```javascript
/**
 * Apply Damage chat button — opens a dialog seeded from the weapon item and the
 * roll's successes, applies the resulting damage to the user's targeted token,
 * and posts a short public chat message plus a detailed GM whisper.
 *
 * See docs/superpowers/specs/2026-05-24-apply-damage-chat-button-design.md
 */
export class ApplyDamage {
  /**
   * Called from the renderChatMessage hook. Enforces visibility (button is
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
    const ffgUuid = message.flags?.starwarsffg?.ffgUuid;
    const item = ffgUuid ? await fromUuid(ffgUuid) : null;
    if (!item) {
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
    const type = a?.type;

    let woundLabel, strainLabel, soakValue, soakWord, woundPath, strainPath, showRadio;
    if (type === "vehicle") {
      showRadio = true;
      woundLabel = game.i18n.localize("SWFFG.VehicleHullTrauma");
      strainLabel = game.i18n.localize("SWFFG.VehicleHullStrain");
      soakWord = "armour";
      soakValue = Number(a.system.stats?.armour?.value) || 0;
      woundPath = "system.stats.hullTrauma.value";
      strainPath = "system.stats.systemStrain.value";
    } else if (type === "minion" || type === "rival") {
      showRadio = false;
      woundLabel = game.i18n.localize("SWFFG.Wounds");
      strainLabel = null;
      soakWord = "soak";
      soakValue = Number(a.system.stats?.soak?.value) || 0;
      woundPath = "system.stats.wounds.value";
      strainPath = null;
    } else if (type === "character" || type === "nemesis") {
      showRadio = true;
      woundLabel = game.i18n.localize("SWFFG.Wounds");
      strainLabel = game.i18n.localize("SWFFG.Strain");
      soakWord = "soak";
      soakValue = Number(a.system.stats?.soak?.value) || 0;
      woundPath = "system.stats.wounds.value";
      strainPath = "system.stats.strain.value";
    } else {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.UnsupportedActor"));
      return;
    }

    // Use getItemDetails() to pick up attachment-provided adjustments
    // to both damage and the qualities list.
    const details = await item.getItemDetails();
    const adjusted = Number(details?.damage?.adjusted) || 0;
    const baseValue = Number(details?.damage?.value ?? item.system?.damage?.value) || 0;
    const baseDamage = adjusted !== 0 ? adjusted : baseValue;
    const successes = Number(message.rolls?.[0]?.ffg?.success) || 0;
    const autoDamage = baseDamage + successes;

    const qualities = details?.adjusteditemmodifier || item.system?.itemmodifier || [];
    let pierceRanks = 0;
    let breachRanks = 0;
    for (const q of qualities) {
      const name = (q?.name || "").toLowerCase();
      const ranks = Number(q?.totalRanks ?? q?.system?.rank ?? 0) || 0;
      if (name === "pierce") pierceRanks += ranks;
      else if (name === "breach") breachRanks += ranks;
    }
    const autoPierce = pierceRanks + 10 * breachRanks;

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
    `;

    const weaponName = item.name;
    const title = game.i18n.format("SWFFG.ApplyDamage.DialogTitle", { name: a.name });

    new Dialog({
      title,
      content,
      buttons: {
        apply: {
          icon: '<i class="fas fa-burst"></i>',
          label: applyLabel,
          callback: async (html) => {
            const damage = Math.max(0, parseInt(html.find('input[name="damage"]').val(), 10) || 0);
            const pierce = Math.max(0, parseInt(html.find('input[name="pierce"]').val(), 10) || 0);
            const pool = showRadio ? html.find('input[name="pool"]:checked').val() : "wounds";
            const path = pool === "strain" ? strainPath : woundPath;
            const poolLabel = pool === "strain" ? strainLabel : woundLabel;
            if (!path) {
              ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.UnsupportedActor"));
              return;
            }

            const effectiveSoak = Math.max(0, soakValue - pierce);
            const applied = Math.max(0, damage - effectiveSoak);

            try {
              const current = Number(foundry.utils.getProperty(a, path)) || 0;
              await a.update({ [path]: current + applied });
            } catch (err) {
              CONFIG.logger?.warn?.("ApplyDamage: actor.update failed", err);
              ui.notifications.warn(game.i18n.localize("SWFFG.ApplyDamage.TargetGone"));
              return;
            }

            const speaker = ChatMessage.getSpeaker({ token: target.document });
            const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

            await ChatMessage.create({
              speaker,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.PublicMessage", {
                actorName: a.name,
                damage,
                poolLabel,
                weaponName,
              })}</p>`,
            });

            await ChatMessage.create({
              speaker,
              whisper: gmIds,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.GMDetails", {
                actorName: a.name,
                applied,
                poolLabel,
                damage,
                effectiveSoak,
                soakWord,
                pierce,
                soak: soakValue,
              })}</p>`,
            });
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: cancelLabel,
        },
      },
      default: "apply",
    }).render(true);
  }
}
```

- [ ] **Step 2: Syntax check.**

Run:
```
node --check modules/helpers/apply-damage.js
```
Expected: no output (zero exit code).

- [ ] **Step 3: Commit.**

```
git add modules/helpers/apply-damage.js
git commit -m "feat(chat): add ApplyDamage helper module"
```

---

### Task 4: Wire `ApplyDamage` into the renderChatMessage hook

**Files:**
- Modify: `modules/swffg-main.js`

- [ ] **Step 1: Add the import alongside the existing helper imports.**

Near line 42 (where `EmbeddedItemHelpers` and other helpers are imported), add this line:

```javascript
import { ApplyDamage } from "./helpers/apply-damage.js";
```

Place it grouped with other `./helpers/*` imports.

- [ ] **Step 2: Call the binder from the existing renderChatMessage hook.**

Find this block (around line 1081):

```javascript
Hooks.on("renderChatMessage", async (app, html, messageData) => {
  const content = html.find(".message-content");
  content[0].innerHTML = await PopoutEditor.renderDiceImages(content[0].innerHTML);

  html.on("click", ".ffg-pool-to-player", () => {
```

Immediately after the line `content[0].innerHTML = await PopoutEditor.renderDiceImages(content[0].innerHTML);` (and before the `html.on("click", ".ffg-pool-to-player", …` block), insert:

```javascript

  ApplyDamage.bindChatMessage(app, html);
```

(`app` is the live ChatMessage instance in Foundry v13's `renderChatMessage` signature; the existing code at line 1086 demonstrates that `messageData.message` holds the serialized data, but `app` is what we need for `.id`, `.author`, `.rolls`, etc.)

- [ ] **Step 3: Syntax check.**

```
node --check modules/swffg-main.js
```
Expected: no output.

- [ ] **Step 4: Commit.**

```
git add modules/swffg-main.js
git commit -m "feat(chat): wire Apply Damage button into renderChatMessage hook"
```

---

### Task 5: Style the button

**Files:**
- Modify: `styles/starwarsffg.css`

- [ ] **Step 1: Append a small block at the end of the file.**

Open `styles/starwarsffg.css`, scroll to the end, append:

```css

/* Apply Damage chat button */
.ffg-apply-damage-wrap {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}
.ffg-apply-damage {
  font-size: 0.85em;
  padding: 2px 8px;
  cursor: pointer;
}
.ffg-apply-damage i.fas {
  margin-right: 4px;
}
```

- [ ] **Step 2: Commit.**

```
git add styles/starwarsffg.css
git commit -m "style(chat): style Apply Damage button"
```

---

### Task 6: Manual smoke test pass

**Files:** none (verification only).

Run Foundry, load a world that uses the local fork of the starwarsffg system. Run each scenario; do not mark the step complete until the observed behavior matches the expected behavior.

- [ ] **Step 1: Character target, Wounds path.**

Setup: a character actor with a ranged weapon, another character actor controlling a token, a character token targeted (T key).
- Roll an attack with at least 1 success.
- Verify the chat card shows the `Apply Damage` button below the damage/critical lines.
- Click `Apply Damage`. Verify the dialog opens with Wounds (default) / Strain radio.
- Verify the Damage field is pre-filled with `baseDamage + successes`.
- Verify the Pierce field is pre-filled with the weapon's Pierce ranks (Breach × 10 if applicable).
- Click `Apply`. Verify the target's Wounds increase by `max(0, damage - max(0, soak - pierce))`.
- Verify a short chat line is posted: `"{name} takes {damage} Wounds from {weapon}."`
- Verify a separate GM-whisper chat line is posted with the full breakdown.

- [ ] **Step 2: Strain pool.**

Same setup as Step 1; switch the dialog radio to Strain before Apply.
- Verify `strain.value` increased on the target (not `wounds.value`).
- Verify the public message says "Strain", not "Wounds".

- [ ] **Step 3: Minion/rival target.**

Target a minion (or rival) token, attack it.
- Verify the dialog shows **no radio**, with the bold header `Wounds`.
- Apply → verify `wounds.value` increases.

- [ ] **Step 4: Vehicle attack on vehicle.**

Use a `shipweapon` to attack a vehicle token.
- Verify the dialog shows `Hull Trauma` (default) / `Sys Strain` radio.
- Verify the auto-soak (hidden) uses `armour.value`. Quickest check: temporarily set the target's armour to a known value (e.g. 5) and verify the GM whisper line says `soak 5` (the word "armour" should appear via `{soakWord}`).
- Apply Hull Trauma → verify `system.stats.hullTrauma.value` increased.

- [ ] **Step 5: Cross-type (shipweapon → character, weapon → vehicle).**

Attack a character with a `shipweapon` chat card, and a vehicle with a `weapon` chat card.
- Neither should crash.
- The dialog uses the **target's** actor-type rules (character → Wounds/Strain + soak; vehicle → Hull Trauma/Sys Strain + armour).

- [ ] **Step 6: Breach math.**

On a weapon, ensure it has the Pierce 1 and Breach 1 qualities (use OggDude-imported data or add manually).
- Roll, click Apply Damage.
- Verify the dialog's Pierce field reads `11`.

- [ ] **Step 7: Miss handling.**

Roll an attack that produces zero successes.
- Verify the chat card shows "Miss!" and the `Apply Damage` button does NOT appear.

- [ ] **Step 8: No target.**

Untarget everything (Esc). Roll a successful attack.
- Click `Apply Damage` → expect a `SWFFG.ApplyDamage.NoTarget` warning notification ("Target a token before applying damage."). No dialog should open.

- [ ] **Step 9: Permission visibility.**

Log in as the attacker player. Then log in another non-GM, non-attacker player in a second browser tab.
- The attacker player sees the button on their own attack message.
- The other non-GM player does NOT see the button on the same message.
- The GM sees the button.
- After Apply: attacker and other non-GM players see only the public short line; the GM additionally sees the detailed whisper line.

- [ ] **Step 10: Re-apply.**

After a successful Apply, click the same message's `Apply Damage` button again.
- Dialog reopens; values are recomputed fresh (target may have changed). Apply works again.

- [ ] **Step 11: Edited inputs.**

Roll an attack. Click `Apply Damage`. Manually change Damage to a clearly different number (e.g. 99) and Pierce to 0.
- Apply.
- Verify the math uses the edited Damage (99) and edited Pierce (0).
- Verify the public chat line shows the edited Damage value (`99 Wounds from …`), not the auto-computed value.

- [ ] **Step 12: Final commit (optional).**

If the smoke test surfaced any necessary tweaks, fix them and commit. Otherwise nothing to commit.

---

## Spec coverage summary

| Spec requirement | Task |
|---|---|
| Add button to weapon-card template inside `{{#if ffg.success}}` | T2 |
| New helper module `modules/helpers/apply-damage.js` | T3 |
| Resolve weapon via `fromUuid(message.flags.starwarsffg.ffgUuid)` | T3 |
| Single-target only via `[...game.user.targets][0]` | T3 |
| Actor-type branching (character/nemesis/minion/rival/vehicle) | T3 |
| Hidden soak from `soak.value` / `armour.value` | T3 |
| Auto damage = base + successes | T3 |
| Auto pierce = Pierce + 10×Breach | T3 |
| Editable Damage / Pierce inputs; soak hidden | T3 |
| Apply math: effectiveSoak = max(0, soak - pierce); applied = max(0, damage - effectiveSoak) | T3 |
| Public short chat line uses dialog's `damage` | T3 |
| GM whisper detailed line | T3 |
| Visibility: GM + message author only | T3 + T4 |
| Wire into `renderChatMessage` hook in `swffg-main.js` | T4 |
| Localization keys (new + reused) | T1 |
| Manual smoke test | T6 |
