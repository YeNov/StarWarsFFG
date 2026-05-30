/**
 * Apply Crit chat button — opens a dialog seeded from the weapon's Vicious
 * quality and the target's existing crits / Durable talent, rolls the macro's
 * crit formula against a chosen critical table, embeds the resulting crit item
 * on the target, and posts the item description to public chat.
 *
 * See docs/superpowers/specs/2026-05-24-apply-crit-chat-button-design.md
 */
import { applyToTargetActor } from "./gm-bridge.js";

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

    if (type === "minion") {
      try {
        const ok = await applyToTargetActor(realActor, { type: "kill-minion" });
        if (!ok) return;
      } catch (err) {
        CONFIG.logger?.warn?.("ApplyCrit: kill minion failed", err);
        ui.notifications.warn(game.i18n.localize("SWFFG.ApplyCrit.TargetGone"));
      }
      return;
    }

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
              // Embeds the crit item on the target actor; when the clicking
              // player does not own the target, this forwards to the active GM
              // (see gm-bridge.js).
              const ok = await applyToTargetActor(realActor, { type: "crit", items: [item.toObject()] });
              if (!ok) return;
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
