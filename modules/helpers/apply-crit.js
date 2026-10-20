/**
 * Apply Crit chat button — opens a dialog seeded from the weapon's Vicious
 * quality, the attacker's Lethal Blows and the target's existing crits / Durable
 * talent, rolls the crit formula against a chosen critical table, embeds the
 * resulting crit item (from the world or a compendium) on the target, and posts
 * the draw and the item description to whoever saw the attack.
 *
 * The decisions live in apply-crit-plan.js, which Node covers.
 * See docs/superpowers/specs/2026-05-24-apply-crit-chat-button-design.md
 */
import { applyToTargetActor } from "./gm-bridge.js";
import { isMinionVehicle } from "./minion-group.js";
import { critFormula, critResultItemUuid, pickCritResult, planCritSeed, visibilityOf } from "./apply-crit-plan.js";

const { DialogV2 } = foundry.applications.api;

export class ApplyCrit {
  /**
   * Called from the renderChatMessageHTML hook. Enforces visibility (button is
   * removed for users who are neither GM nor the message author, matching Apply
   * Damage), computes crit eligibility from the roll's advantages/triumphs vs the
   * weapon's critical rating, sets the disabled attribute and tooltip when
   * ineligible, and binds the click handler.
   * @param {ChatMessage} message — the live ChatMessage instance.
   * @param {jQuery} html — the rendered chat-message element wrapped in jQuery.
   */
  static bindChatMessage(message, html) {
    const button = html.find(".ffg-apply-crit")[0];
    if (!button) return;

    // Visible to the attack's roller (message author) and GMs only. Non-owning
    // clicks still forward to the active GM via gm-bridge, so this is a UI
    // consistency gate (matching Apply Damage), not a permission boundary.
    const authorId = message.author?.id ?? message.user;
    if (game.user.id !== authorId && !game.user.isGM) {
      button.remove();
      return;
    }

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

    // A crit on a minion group takes out one member instead of rolling on a table: one minion,
    // or one vehicle of a minion vehicle group.
    if (type === "minion" || isMinionVehicle(realActor)) {
      try {
        const ok = await applyToTargetActor(realActor, { type: "kill-minion" });
        if (!ok) return;
      } catch (err) {
        CONFIG.logger?.warn?.("ApplyCrit: kill minion failed", err);
        ui.notifications.warn(err.name === "ApplyRequestError" ? err.message : game.i18n.localize("SWFFG.ApplyCrit.TargetGone"));
      }
      return;
    }

    // What the dialog opens with: the target's crits (× 10 into the modifier) and Durable, the
    // weapon's Vicious, and the attacker's Lethal Blows (none against a vehicle).
    const seed = planCritSeed({
      attacker: message.speakerActor,
      target: realActor,
      qualities: itemSystem.doNotSubmit?.qualities || [],
    });
    const autoModifier = seed.existingCrits * 10;
    const autoDurable = seed.durableRanks * 10;
    const autoViciousRanks = seed.viciousRanks;

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
    const lethalLabel = game.i18n.localize("SWFFG.ApplyCrit.LethalBlows");
    const tableLabel = game.i18n.localize("SWFFG.ApplyCrit.Table");
    const rollLabel = game.i18n.localize("SWFFG.ButtonRoll");
    const cancelLabel = game.i18n.localize("SWFFG.ApplyDamage.Cancel");
    const title = game.i18n.format("SWFFG.ApplyCrit.DialogTitle", { name: a.name });

    const content = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="padding:4px 8px; display:flex; align-items:center; gap:8px;">
          <label style="white-space:nowrap;">${modifierLabel}:</label>
          <input name="modifier" class="modifier" style="flex:1 1 auto; min-width:0;" type="text"
                 value="${autoModifier}" data-dtype="String" />
        </div>
        <div style="padding:4px 8px; display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
          <span>${durableLabel}: ${autoDurable}</span>
          <span style="display:inline-block; width:1px; height:20px; background:#888;"></span>
          <span style="display:flex; align-items:center; gap:6px;">
            ${viciousLabel}: <span class="vicious-rank">${autoViciousRanks}</span>
            <button type="button" class="vicious-minus" style="width:24px; height:22px; line-height:1; padding:0;">−</button>
            <button type="button" class="vicious-plus" style="width:24px; height:22px; line-height:1; padding:0;">+</button>
          </span>
          ${type === "vehicle" ? "" : `
          <span style="display:inline-block; width:1px; height:20px; background:#888;"></span>
          <span style="display:flex; align-items:center; gap:6px;">
            ${lethalLabel}: <span class="lethal-rank">${seed.lethalRanks}</span>
            <button type="button" class="lethal-minus" style="width:24px; height:22px; line-height:1; padding:0;">−</button>
            <button type="button" class="lethal-plus" style="width:24px; height:22px; line-height:1; padding:0;">+</button>
          </span>`}
        </div>
        <div style="padding:4px 8px; display:flex; align-items:center; gap:8px;">
          <label style="white-space:nowrap;">${tableLabel}:</label>
          <select class="crittable" style="flex:1 1 auto; min-width:0;">${tableOptions}</select>
        </div>
      </div>
    `;

    DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "roll",
          icon: "fas fa-check",
          label: rollLabel,
          default: true,
          callback: async (event, button, dialog) => {
            const root = dialog.element;
            const modifier = parseInt(root.querySelector(".modifier")?.value, 10) || 0;
            const viciousRank = parseInt(root.querySelector(".vicious-rank")?.textContent, 10) || 0;
            const lethalRank = parseInt(root.querySelector(".lethal-rank")?.textContent, 10) || 0;
            const tableId = root.querySelector(".crittable")?.value;

            const table = game.tables.get(tableId);
            if (!table) {
              ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.NoTable"));
              return;
            }

            const critRoll = await new Roll(critFormula({
              modifier,
              durableRanks: seed.durableRanks,
              viciousRanks: viciousRank,
              lethalRanks: lethalRank,
            })).evaluate();

            // Pick the row here instead of letting the table roll: for a total outside every
            // range, Foundry's draw quietly rolls the d100 again until it lands on a row.
            const result = pickCritResult(table.results.contents, critRoll.total);
            if (!result) {
              ui.notifications.warn(game.i18n.format("SWFFG.ApplyCrit.NoResult", { total: critRoll.total, table: table.name }));
              return;
            }
            await table.draw({ results: [result], displayChat: false });

            // The crit is seen by whoever saw the attack. Each message gets its own copies:
            // Foundry's ChatMessage.applyMode edits the whisper list it is given.
            const visibility = visibilityOf(message);
            const seenBy = () => ({ whisper: [...visibility.whisper], blind: visibility.blind });
            const mode = () => ({ messageMode: visibility.messageMode });
            await table.toMessage([result], { roll: critRoll, messageData: seenBy(), messageOptions: mode() });

            // The row's item may sit in the world or in a compendium.
            const itemUuid = critResultItemUuid(result);
            const item = itemUuid ? await foundry.utils.fromUuid(itemUuid) : null;
            if (!item) {
              ui.notifications.warn(game.i18n.format("SWFFG.ApplyCrit.NoLinkedItem", { name: realActor.name }));
              return;
            }

            try {
              // Embeds the crit item on the target actor; when the clicking
              // player does not own the target, this forwards to the active GM
              // (see gm-bridge.js).
              const ok = await applyToTargetActor(realActor, { type: "crit", items: [item.toObject()] });
              if (!ok) return;
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ token: target.document }),
                content: item.system?.description ?? "",
                ...seenBy(),
              }, mode());
            } catch (err) {
              CONFIG.logger?.warn?.("ApplyCrit: createEmbeddedDocuments failed", err);
              ui.notifications.warn(err.name === "ApplyRequestError" ? err.message : game.i18n.localize("SWFFG.ApplyCrit.TargetGone"));
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
        const root = dialog.element;
        const rankEl = root.querySelector(".vicious-rank");
        root.querySelector(".vicious-plus")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          const cur = parseInt(rankEl.textContent, 10) || 0;
          rankEl.textContent = String(cur + 1);
        });
        root.querySelector(".vicious-minus")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          const cur = parseInt(rankEl.textContent, 10) || 0;
          rankEl.textContent = String(Math.max(0, cur - 1));
        });
        const lethalEl = root.querySelector(".lethal-rank");
        root.querySelector(".lethal-plus")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          lethalEl.textContent = String((parseInt(lethalEl.textContent, 10) || 0) + 1);
        });
        root.querySelector(".lethal-minus")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          lethalEl.textContent = String(Math.max(0, (parseInt(lethalEl.textContent, 10) || 0) - 1));
        });
      },
      rejectClose: false,
    });
  }
}
