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
