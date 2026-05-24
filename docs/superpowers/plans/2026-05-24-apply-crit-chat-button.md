# Apply Crit chat button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Apply Crit" button to weapon attack chat cards that opens a dialog pre-filled with Modifier (from existing crits on the target), Durable (from the target's talent), Vicious (from the weapon's qualities), and a pre-selected critical table; rolls the macro's formula on Apply and embeds the resulting crit item on the target.

**Architecture:** Add a button to the existing weapon-card chat partial next to the Apply Damage button in a shared left-aligned wrapper. Implement the click logic in a new helper module mirroring `apply-damage.js`. Wire from the existing `renderChatMessage` hook. The button is rendered always; the JS binder sets `disabled` + tooltip when the FFG crit-eligibility condition (advantages ≥ critical rating, or any triumph) is not met.

**Tech Stack:** Foundry VTT v13, vanilla JS modules, Handlebars templates, jQuery (provided by Foundry), starwarsffg system.

**Spec:** [docs/superpowers/specs/2026-05-24-apply-crit-chat-button-design.md](../specs/2026-05-24-apply-crit-chat-button-design.md)

---

## File map

- **Create:** `modules/helpers/apply-crit.js` — `ApplyCrit` class with `bindChatMessage(message, html)` and `show(message)` static methods.
- **Modify:** `templates/chat/roll-weapon-card.html` — generalize the existing single-button wrapper (lines 11–15) to a `.ffg-chat-actions` wrapper holding both Apply Crit and Apply Damage buttons.
- **Modify:** `modules/swffg-main.js` — import `ApplyCrit`; call `ApplyCrit.bindChatMessage(...)` next to the existing `ApplyDamage.bindChatMessage(...)` call.
- **Modify:** `lang/en.json` — add new localization keys.
- **Modify:** `styles/starwarsffg.css` — rename `.ffg-apply-damage-wrap` selectors to `.ffg-chat-actions`, add `gap`, add disabled-state styles.

No automated tests in this plan (per spec). Manual smoke test is Task 7.

---

### Task 1: Add localization keys

**Files:**
- Modify: `lang/en.json`

- [ ] **Step 1: Add the keys near the existing `SWFFG.ApplyDamage.*` block.**

Open `lang/en.json`. Find the `SWFFG.ApplyDamage.GMDetails` line. Immediately after the line containing `"SWFFG.ApplyDamage.GMDetails": ...,` insert:

```json
  "SWFFG.ApplyCrit.Button": "Apply Crit",
  "SWFFG.ApplyCrit.DialogTitle": "Critical Roll — {name}",
  "SWFFG.ApplyCrit.Modifier": "Modifier",
  "SWFFG.ApplyCrit.Durable": "Durable",
  "SWFFG.ApplyCrit.Vicious": "Vicious",
  "SWFFG.ApplyCrit.Table": "Table",
  "SWFFG.ApplyCrit.NoTarget": "Target a token before applying a crit.",
  "SWFFG.ApplyCrit.UnsupportedActor": "This actor type is not supported by Apply Crit.",
  "SWFFG.ApplyCrit.NoTable": "No critical table found in this world.",
  "SWFFG.ApplyCrit.ItemMissing": "Could not resolve the weapon from this chat message.",
  "SWFFG.ApplyCrit.TargetGone": "The target is no longer available.",
  "SWFFG.ApplyCrit.NotEligibleTooltip": "Need advantages ≥ critical rating, or a triumph.",
```

Make sure the comma after the previous `SWFFG.ApplyDamage.GMDetails` entry remains, and each new line ends with a comma (since more keys follow in the file).

- [ ] **Step 2: Verify JSON is valid.**

Run:
```
node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit.**

```
git add lang/en.json
git commit -m "i18n: add Apply Crit chat button keys"
```

---

### Task 2: Restructure the weapon-card template to host both buttons

**Files:**
- Modify: `templates/chat/roll-weapon-card.html`

- [ ] **Step 1: Replace the existing single Apply Damage wrapper with a shared actions row.**

The file currently has, at lines 11–15:

```html
  <div class="ffg-apply-damage-wrap">
    <button type="button" class="ffg-apply-damage">
      <i class="fas fa-burst"></i> {{localize "SWFFG.ApplyDamage.Button"}}
    </button>
  </div>
```

Replace those five lines with:

```html
  <div class="ffg-chat-actions">
    <button type="button" class="ffg-apply-crit">
      <i class="fas fa-skull-crossbones"></i> {{localize "SWFFG.ApplyCrit.Button"}}
    </button>
    <button type="button" class="ffg-apply-damage">
      <i class="fas fa-burst"></i> {{localize "SWFFG.ApplyDamage.Button"}}
    </button>
  </div>
```

The Apply Crit button comes first (left of Apply Damage).

- [ ] **Step 2: Sanity-check placement.**

Re-read the file. Verify:
- The new `.ffg-chat-actions` block is inside `{{#if ffg.success}}` and outside both `{{#iff …}}` sub-blocks.
- `{{else}}` (currently around line 17) and `<h4 class="item-miss">Miss!</h4>` are still present and untouched.

- [ ] **Step 3: Commit.**

```
git add templates/chat/roll-weapon-card.html
git commit -m "feat(chat): wrap weapon-card actions row to host Apply Crit + Apply Damage"
```

---

### Task 3: Create the `ApplyCrit` helper module

**Files:**
- Create: `modules/helpers/apply-crit.js`

- [ ] **Step 1: Create the file with the full implementation.**

Create `modules/helpers/apply-crit.js` with this exact content:

```javascript
/**
 * Apply Crit chat button — opens a dialog seeded from the weapon's Vicious
 * quality and the target's existing crits / Durable talent, rolls the macro's
 * crit formula against a chosen critical table, embeds the resulting crit item
 * on the target, and posts the item description to public chat.
 *
 * See docs/superpowers/specs/2026-05-24-apply-crit-chat-button-design.md
 */
export class ApplyCrit {
  /**
   * Called from the renderChatMessage hook. Computes crit eligibility from the
   * roll's advantages/triumphs vs the weapon's critical rating, sets the
   * disabled attribute and tooltip when ineligible, and binds the click handler.
   * @param {ChatMessage} message — the live ChatMessage instance.
   * @param {jQuery} html — the rendered chat-message element wrapped in jQuery.
   */
  static bindChatMessage(message, html) {
    const button = html.find(".ffg-apply-crit")[0];
    if (!button) return;

    const roll = message.rolls?.[0];
    const itemSystem = roll?.data?.system;
    const critAdjusted = Number(itemSystem?.crit?.adjusted) || 0;
    const critValue = Number(itemSystem?.crit?.value) || 0;
    const critRating = critAdjusted !== 0 ? critAdjusted : critValue;
    const advantages = Number(roll?.ffg?.advantage) || 0;
    const triumphs = Number(roll?.ffg?.triumph) || 0;
    const eligible = critRating > 0 && (advantages >= critRating || triumphs > 0);

    if (!eligible) {
      button.disabled = true;
      button.title = game.i18n.localize("SWFFG.ApplyCrit.NotEligibleTooltip");
    }

    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (button.disabled) return;
      ApplyCrit.show(message);
    });
  }

  /**
   * Resolve the target, gather auto-fill values, open the dialog, run the crit
   * roll on Roll, embed the result item, and post the description.
   * @param {ChatMessage} message
   */
  static async show(message) {
    const itemData = message.rolls?.[0]?.data;
    if (!itemData) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.ItemMissing"));
      return;
    }
    const itemSystem = itemData.system || {};

    const targets = [...game.user.targets];
    if (targets.length === 0) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.NoTarget"));
      return;
    }
    const target = targets[0];
    const a = target.actor;
    const type = a?.type;
    if (!["character", "nemesis", "minion", "rival", "vehicle"].includes(type)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.UnsupportedActor"));
      return;
    }

    // Linked vs unlinked actor resolution (mirrors the macro).
    const isLinked = target.document.actorLink === true;
    const realActor = isLinked ? game.actors.get(a.id) : a;

    // Modifier: count existing crit items × 10.
    const existingCrits = realActor.items.filter(
      (i) => i.type === "criticalinjury" || i.type === "criticaldamage"
    ).length;
    const autoModifier = existingCrits * 10;

    // Durable: ranks × 10. Lookup differs for linked (talentList) vs unlinked (items).
    let durableRanks = 0;
    if (isLinked) {
      const durable = realActor.talentList?.find(
        (t) => (t.name || "").toLowerCase() === "durable"
      );
      durableRanks = Number(durable?.rank) || 0;
    } else {
      const durableItem = realActor.items.find(
        (i) => (i.name || "").toLowerCase() === "durable"
      );
      durableRanks = Number(durableItem?.system?.ranks?.current) || 0;
    }
    const autoDurable = durableRanks * 10;

    // Vicious: substring match on chat-embedded qualities; sum totalRanks.
    const qualities = itemSystem.doNotSubmit?.qualities || [];
    let autoViciousRanks = 0;
    for (const q of qualities) {
      const name = (q?.name || "").toLowerCase();
      if (name.includes("vicious")) {
        autoViciousRanks += Number(q?.totalRanks) || 0;
      }
    }

    // Critical tables in this world.
    const critTables = game.tables.filter((t) => (t.name || "").includes("Critical"));
    if (critTables.length === 0) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.NoTable"));
      return;
    }
    const preferredTableName = type === "vehicle" ? "Critical Damage" : "Critical Injuries";
    const tableOptions = critTables
      .map((t) => {
        const selected = t.name === preferredTableName ? " selected" : "";
        return `<option value="${t.id}"${selected}>${t.name}</option>`;
      })
      .join("");

    const modifierLabel = game.i18n.localize("SWFFG.ApplyCrit.Modifier");
    const durableLabel = game.i18n.localize("SWFFG.ApplyCrit.Durable");
    const viciousLabel = game.i18n.localize("SWFFG.ApplyCrit.Vicious");
    const tableLabel = game.i18n.localize("SWFFG.ApplyCrit.Table");
    const rollLabel = game.i18n.localize("SWFFG.ButtonRoll");
    const cancelLabel = game.i18n.localize("SWFFG.ApplyDamage.Cancel");
    const title = game.i18n.format("SWFFG.ApplyCrit.DialogTitle", { name: a.name });

    const content = `
      <div class="grid grid-3col" style="gap:16px;">
        <div style="padding:4px 8px;">${modifierLabel}:
          <input name="modifier" class="modifier" style="width:50%" type="text"
                 value="${autoModifier}" data-dtype="String" />
        </div>
        <div style="padding:4px 8px; display:flex; align-items:center; gap:12px;">
          <span>${durableLabel}: ${autoDurable}</span>
          <span style="display:inline-block; width:1px; height:20px; background:#888;"></span>
          <span style="display:flex; align-items:center; gap:6px;">
            ${viciousLabel}: <span class="vicious-rank">${autoViciousRanks}</span>
            <button type="button" class="vicious-minus" style="width:24px; height:22px; line-height:1; padding:0;">−</button>
            <button type="button" class="vicious-plus" style="width:24px; height:22px; line-height:1; padding:0;">+</button>
          </span>
        </div>
        <div style="padding:4px 8px;">
          ${tableLabel}: <select class="crittable">${tableOptions}</select>
        </div>
      </div>
    `;

    new Dialog({
      title,
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-check"></i>',
          label: rollLabel,
          callback: async (html) => {
            const modifier = parseInt(html.find(".modifier").val(), 10) || 0;
            const viciousRank = parseInt(html.find(".vicious-rank").text(), 10) || 0;
            const viciousMod = viciousRank * 10;
            const tableId = html.find(".crittable").val();

            const table = game.tables.get(tableId);
            if (!table) {
              ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.NoTable"));
              return;
            }

            const formula = `max(1d100 + ${modifier} - ${autoDurable} + ${viciousMod}, 1)`;
            const critRoll = new Roll(formula);
            const draw = await table.draw({ roll: critRoll, displayChat: true });

            const firstResult = draw?.results?.[0];
            if (!firstResult) return;
            const item = game.items.get(firstResult.documentId);
            if (!item) return;

            try {
              await realActor.createEmbeddedDocuments("Item", [item.toObject()]);
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ token: target.document }),
                content: item.system?.description ?? "",
              });
            } catch (err) {
              CONFIG.logger?.warn?.("ApplyCrit: createEmbeddedDocuments failed", err);
              ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.TargetGone"));
            }
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: cancelLabel,
        },
      },
      default: "roll",
      render: (html) => {
        const rankEl = html.find(".vicious-rank");
        html.find(".vicious-plus").on("click", (ev) => {
          ev.preventDefault();
          const cur = parseInt(rankEl.text(), 10) || 0;
          rankEl.text(cur + 1);
        });
        html.find(".vicious-minus").on("click", (ev) => {
          ev.preventDefault();
          const cur = parseInt(rankEl.text(), 10) || 0;
          rankEl.text(Math.max(0, cur - 1));
        });
      },
    }).render(true);
  }
}
```

- [ ] **Step 2: Syntax check.**

Run:
```
node --check modules/helpers/apply-crit.js
```
Expected: no output (zero exit code).

- [ ] **Step 3: Commit.**

```
git add modules/helpers/apply-crit.js
git commit -m "feat(chat): add ApplyCrit helper module"
```

---

### Task 4: Wire `ApplyCrit` into the renderChatMessage hook

**Files:**
- Modify: `modules/swffg-main.js`

- [ ] **Step 1: Add the import alongside the existing `ApplyDamage` import.**

Find the line:
```javascript
import { ApplyDamage } from "./helpers/apply-damage.js";
```

Add immediately after it:
```javascript
import { ApplyCrit } from "./helpers/apply-crit.js";
```

- [ ] **Step 2: Call the binder from the existing renderChatMessage hook.**

Find the existing line in `swffg-main.js`:
```javascript
  ApplyDamage.bindChatMessage(app, html);
```

Add immediately after it:
```javascript
  ApplyCrit.bindChatMessage(app, html);
```

- [ ] **Step 3: Syntax check.**

```
node --check modules/swffg-main.js
```
Expected: no output.

- [ ] **Step 4: Commit.**

```
git add modules/swffg-main.js
git commit -m "feat(chat): wire Apply Crit button into renderChatMessage hook"
```

---

### Task 5: Update CSS — actions row + disabled state

**Files:**
- Modify: `styles/starwarsffg.css`

- [ ] **Step 1: Replace the existing `.ffg-apply-damage-wrap` block with a generalized actions row.**

Find the existing block at the end of the file (around line 2920, added in the Apply Damage feature):

```css
/* Apply Damage chat button */
.ffg-apply-damage-wrap {
  margin-top: 6px;
  display: flex;
  justify-content: flex-start;
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

Replace it with:

```css
/* Weapon-card chat actions (Apply Crit + Apply Damage) */
.ffg-chat-actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-start;
  gap: 6px;
}
.ffg-apply-crit,
.ffg-apply-damage {
  font-size: 0.85em;
  padding: 2px 8px;
  cursor: pointer;
}
.ffg-apply-crit i.fas,
.ffg-apply-damage i.fas {
  margin-right: 4px;
}
.ffg-apply-crit[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Commit.**

```
git add styles/starwarsffg.css
git commit -m "style(chat): share weapon-card actions row + disabled style for Apply Crit"
```

---

### Task 6: Cross-file consistency check (no edits, verification only)

**Files:** none (read-only verification).

- [ ] **Step 1: Verify the localization keys are referenced exactly as declared.**

Run:
```
grep -rEn "SWFFG\\.ApplyCrit\\.[A-Za-z]+" lang/en.json modules/helpers/apply-crit.js
```

Expected: every key referenced in `apply-crit.js` appears as a definition in `lang/en.json`. Specifically, the following keys should appear in both files:
- `SWFFG.ApplyCrit.Button`
- `SWFFG.ApplyCrit.DialogTitle`
- `SWFFG.ApplyCrit.Modifier`
- `SWFFG.ApplyCrit.Durable`
- `SWFFG.ApplyCrit.Vicious`
- `SWFFG.ApplyCrit.Table`
- `SWFFG.ApplyCrit.NoTarget`
- `SWFFG.ApplyCrit.UnsupportedActor`
- `SWFFG.ApplyCrit.NoTable`
- `SWFFG.ApplyCrit.ItemMissing`
- `SWFFG.ApplyCrit.TargetGone`
- `SWFFG.ApplyCrit.NotEligibleTooltip`

(The `Button` key is referenced from the template, not the module — that's expected.)

- [ ] **Step 2: Verify the template button uses the same class name as the JS selector.**

Run:
```
grep -n "ffg-apply-crit" templates/chat/roll-weapon-card.html modules/helpers/apply-crit.js styles/starwarsffg.css
```

Expected: the class `ffg-apply-crit` appears in all three files.

- [ ] **Step 3: Verify the hook wiring.**

Run:
```
grep -n "ApplyCrit" modules/swffg-main.js
```

Expected: at least two matches — the `import` line and the `bindChatMessage` call.

If any of the above checks fail, stop and report.

---

### Task 7: Manual smoke test pass

**Files:** none (verification only).

Run Foundry, load a world that uses the local fork of the starwarsffg system. Run each scenario; do not mark the step complete until the observed behavior matches the expected behavior.

- [ ] **Step 1: Golden path — character target, crit triggers via advantages.**

Setup: character attacker, character target (linked token), weapon with crit rating 2 and no Vicious. Roll an attack producing ≥1 success and ≥2 advantages, 0 triumphs.
- Verify the chat card shows both `Apply Crit` and `Apply Damage` buttons in a left-aligned row.
- Verify `Apply Crit` is enabled.
- Click → dialog opens with Modifier = (existingCrits × 10), Durable: (durableRanks × 10), Vicious rank = 0, Table = "Critical Injuries".
- Click Roll → the table draws and posts its result message. A second public chat message posts with the crit item's description. The crit item appears on the target's actor.

- [ ] **Step 2: Crit triggers via triumph alone.**

Same as Step 1 but with crit rating 4, advantages = 1, triumph = 1. Verify `Apply Crit` is enabled.

- [ ] **Step 3: Crit ineligible.**

Same as Step 1 but with crit rating 4, advantages = 2, triumph = 0. Verify `Apply Crit` is **disabled** (greyed out, not clickable). Hover → tooltip reads "Need advantages ≥ critical rating, or a triumph."

- [ ] **Step 4: Vehicle target.**

Vehicle attacking vehicle with crit rating 1, ≥1 advantage. Verify dialog pre-selects `Critical Damage` table.

- [ ] **Step 5: Cross-type (shipweapon → character).**

Vehicle weapon (`shipweapon` chat) attacking a character target. Verify dialog pre-selects `Critical Injuries` (table is chosen by **target** actor type, not weapon type).

- [ ] **Step 6: Vicious auto-fill.**

Weapon with Vicious 2 quality. Roll, click Apply Crit. Verify Vicious rank reads `2`. Click `+` → reads `3`. Click `−` twice → reads `1`. Click `−` once more → reads `0` (clamps).

- [ ] **Step 7: Vicious substring match.**

Weapon with a quality named "Vicious Quality" (OggDude-imported form). Verify Vicious rank is detected and pre-filled the same as Step 6.

- [ ] **Step 8: Modifier auto-fill.**

Target a character that already has 2 crit injuries. Roll an eligible attack, click Apply Crit. Verify Modifier field reads `20`. Edit to `0`, click Roll → roll formula uses `0`.

- [ ] **Step 9: Durable.**

Target character with Durable 1 talent. Verify Durable displays `10`. Roll formula subtracts 10. Target with no Durable → displays `0`, no subtraction.

- [ ] **Step 10: Unlinked token actor.**

Drop a token of a character actor with crit items / Durable, then `Right-click → Configure → uncheck Linked Actor` (or use an unlinked token in the first place). Target the unlinked token. Verify Modifier and Durable are read from the token's local actor.

- [ ] **Step 11: No targets.**

Untarget everything (Esc), roll an eligible attack. Click `Apply Crit` → expect `SWFFG.ApplyCrit.NoTarget` warning, no dialog.

- [ ] **Step 12: No critical tables.**

In a test world, temporarily rename all rolltables to remove "Critical" from their names (or delete them). Click `Apply Crit` on an eligible attack → expect `SWFFG.ApplyCrit.NoTable` warning, no dialog. Restore the tables afterward.

- [ ] **Step 13: Visibility — three users.**

Log in three users (GM, attacker, third player). All three see the `Apply Crit` button on the same eligible chat message. Public chat output after the roll is visible to all three.

- [ ] **Step 14: Re-apply.**

Click `Apply Crit` twice on the same chat message. Dialog opens each time; each Roll posts independently.

- [ ] **Step 15: Miss (0 successes).**

Roll an attack with 0 successes. Verify the chat card shows "Miss!" and **neither** `Apply Crit` nor `Apply Damage` button renders.

- [ ] **Step 16: Final commit (optional).**

If the smoke test surfaced tweaks, fix and commit.

---

## Spec coverage summary

| Spec requirement | Task |
|---|---|
| Apply Crit button next to Apply Damage in shared actions row | T2 |
| Button visible to everyone | T2 (no JS visibility gate) |
| Button disabled when advantages < critRating AND triumphs == 0 | T3 |
| Tooltip on disabled state | T3 |
| Auto-fill Modifier from existing crits × 10 | T3 |
| Auto-fill Durable from talent (linked vs unlinked) × 10 | T3 |
| Auto-fill Vicious ranks from qualities (substring match) | T3 |
| Pre-select Critical Damage for vehicles, Critical Injuries otherwise | T3 |
| Editable Modifier; Vicious via ± buttons; Durable read-only | T3 |
| Roll button reuses `SWFFG.ButtonRoll`; Cancel reuses `SWFFG.ApplyDamage.Cancel` | T3 |
| Roll formula `max(1d100 + mod - durable*10 + vicious*10, 1)` | T3 |
| Embed crit item on target; post description chat | T3 |
| No crit-table warning; permission/TargetGone error handling | T3 |
| Hook wiring in renderChatMessage | T4 |
| CSS row layout + disabled state | T5 |
| Localization keys | T1 |
| Manual smoke test | T7 |
| Cross-file consistency | T6 |
