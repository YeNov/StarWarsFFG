/**
 * Apply Damage chat button — opens a dialog seeded from the weapon item and the
 * roll's successes, applies the resulting damage to the user's targeted token,
 * and posts a short public chat message plus a detailed GM whisper.
 *
 * See docs/superpowers/specs/2026-05-24-apply-damage-chat-button-design.md
 */
import { applyToTargetActor } from "./gm-bridge.js";
import {
  planDamageApplication,
  planDamageSeed,
  planDamageTarget,
} from "./apply-damage-plan.js";

const { DialogV2 } = foundry.applications.api;

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
            const root = dialog.element;
            const hit = planDamageApplication(a, plan, {
              damage: root.querySelector('input[name="damage"]')?.value,
              pierce: root.querySelector('input[name="pierce"]')?.value,
              pool: root.querySelector('input[name="pool"]:checked')?.value,
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
            const gmChat = {
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
              })}</p>${protectionNote}`,
            };

            let result;
            try {
              // All clients share the elected writer's queue, including owners.
              // Forwarded calls wait for that writer to confirm completion.
              result = await applyToTargetActor(a, { type: "damage", path, delta: applied, gmChat });
              if (!result) return;
            } catch (err) {
              CONFIG.logger?.warn?.("ApplyDamage: actor.update failed", err);
              ui.notifications.warn(err.name === "ApplyRequestError" ? err.message : game.i18n.localize("SWFFG.ApplyDamage.TargetGone"));
              return;
            }

            // Public line for everyone (intentionally omits soak/pierce).
            await ChatMessage.create({
              speaker,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.PublicMessage", {
                actorName: a.name,
                damage,
                poolLabel,
                weaponName,
              })}</p>`,
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
      rejectClose: false,
    });
  }
}
