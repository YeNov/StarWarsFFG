/**
 * Apply Damage chat button — opens a dialog seeded from the weapon item and the
 * roll's successes, applies the resulting damage to the user's targeted token,
 * and posts a short public chat message plus a detailed GM whisper.
 *
 * When the target holds Parry, Reflect or a GM-listed equivalent that fits the
 * attack, the dialog also offers it: the talent shrinks the hit before soak and
 * its cost is written in the same update.
 *
 * See docs/superpowers/specs/2026-05-24-apply-damage-chat-button-design.md and
 * docs/superpowers/specs/2026-10-04-parry-reflect-apply-damage-design.md
 */
import {
  applyToTargetActor,
  DEFENCE_UNAFFORDABLE,
  DEFENSIVE_DAMAGE_CAPABILITY,
  WRITER_OUTDATED,
} from "./gm-bridge.js";
import {
  planDamageApplication,
  planDamageSeed,
  planDamageTarget,
} from "./apply-damage-plan.js";
import {
  DEFENSIVE_TALENT_LISTS,
  classifyAttack,
  parseTalentNames,
  planDefenceControls,
  planDefensiveTalent,
  readCostPool,
  unitLabelKey,
} from "./defensive-talents.js";

const { DialogV2 } = foundry.applications.api;

/** The world's Parry & Reflect settings, in the shape planDefensiveTalent takes. */
function readDefensiveTalentSettings() {
  const names = {};
  for (const list of DEFENSIVE_TALENT_LISTS) {
    names[list.field] = parseTalentNames(game.settings.get("starwarsffg", list.setting));
  }
  return { ruleset: game.settings.get("starwarsffg", "defensiveTalentRuleset"), names };
}

/** "strain", "wound" or "wounds" for `count` of the plan's cost pool. */
function unitLabel(plan, count) {
  return game.i18n.localize(unitLabelKey(plan.unit, count));
}

/**
 * The talent toggle and its cost options; empty when the target has nothing to offer. The ranks
 * and the size of the reduction are deliberately absent: the GM reads them in the whisper.
 */
function defenceHtml(plan) {
  if (!plan) return "";
  const option = (name, key) =>
    `<button type="button" class="ffg-defence-option" data-option="${name}" aria-pressed="false">${game.i18n.format(key, { unit: unitLabel(plan, 1) })}</button>`;
  return `
    <div class="ffg-defence">
      <button type="button" class="ffg-defence-toggle" aria-pressed="false">
        <i class="fas fa-shield-halved"></i> ${game.i18n.localize(plan.toggleLabelKey)}
      </button>
      <div class="ffg-defence-options" style="display:none;">
        ${plan.hasSupreme ? option("supreme", "SWFFG.ApplyDamage.Defence.Supreme") : ""}
        ${plan.hasUnarmed ? option("unarmed", "SWFFG.ApplyDamage.Defence.Unarmed") : ""}
        <span class="ffg-defence-cost"></span>
      </div>
    </div>`;
}

/** Freeze the talent controls once Apply is under way; the dialog closes when the callback ends. */
function lockDefenceControls(root) {
  for (const control of root.querySelectorAll(".ffg-defence-toggle, .ffg-defence-option")) control.disabled = true;
}

/** The warning for a failed apply. The refusals this dialog knows get their own localized text. */
function applyFailureMessage(err, actor) {
  if (err?.code === DEFENCE_UNAFFORDABLE) return game.i18n.format("SWFFG.ApplyDamage.Defence.Unaffordable", { actorName: actor.name });
  if (err?.code === WRITER_OUTDATED) return game.i18n.localize("SWFFG.ApplyDamage.Defence.WriterOutdated");
  return err?.name === "ApplyRequestError" ? err.message : game.i18n.localize("SWFFG.ApplyDamage.TargetGone");
}

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

    // Parry, Reflect or an equivalent the target can use against this attack. Which talent, and
    // how far it reduces the hit, is fixed when the dialog opens; the cost pool is read from the
    // live actor again on every toggle and on Apply.
    const defencePlan = planDefensiveTalent({
      actor: a,
      attack: classifyAttack(itemData.system?.skill?.value),
      ...readDefensiveTalentSettings(),
    });
    const liveActor = () => target.actor ?? a;
    const selection = { on: false, supreme: false, unarmed: false };
    // DialogV2 greys out its own footer buttons while Apply runs, but not the controls in the
    // content. Once true, refresh() keeps Apply disabled and the callback refuses to run again, so
    // no click on a talent control can unlock a second submit of the same hit.
    let submitting = false;
    const defenceControls = () => planDefenceControls(defencePlan, readCostPool(liveActor()), selection);

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
      ${defenceHtml(defencePlan)}
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
            if (submitting) return;
            submitting = true;
            const root = dialog.element;
            lockDefenceControls(root);
            // Check the pool once more: Enter can submit past a greyed-out Apply, and strain may
            // have moved since the dialog opened. A talent that was chosen and can no longer be
            // paid stops the whole application rather than letting the hit land without it.
            const controls = defencePlan ? defenceControls() : null;
            if (selection.on && (!controls?.on || controls.applyDisabled)) {
              ui.notifications.warn(game.i18n.format("SWFFG.ApplyDamage.Defence.Unaffordable", { actorName: a.name }));
              return;
            }
            const defence = controls?.on
              ? { reduction: defencePlan.reduction, cost: controls.cost, costPath: defencePlan.costPath }
              : undefined;

            const hit = planDamageApplication(a, plan, {
              damage: root.querySelector('input[name="damage"]')?.value,
              pierce: root.querySelector('input[name="pierce"]')?.value,
              pool: root.querySelector('input[name="pool"]:checked')?.value,
              defence,
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
            const defenceNote = defence
              ? `<p>${game.i18n.format("SWFFG.ApplyDamage.Defence.GMLine", {
                talent: defencePlan.talentNames.join(" / "),
                reduction: hit.reduction,
                formula: game.i18n.format(defencePlan.formula.key, { ranks: defencePlan.formula.ranks }),
                cost: controls.cost,
                unit: unitLabel(defencePlan, controls.cost),
                // Only the modifiers chosen for this hit, not every one the target holds.
                modifiers: [
                  controls.supreme ? game.i18n.localize("SWFFG.ApplyDamage.Defence.SupremeName") : null,
                  controls.unarmed ? game.i18n.localize("SWFFG.ApplyDamage.Defence.UnarmedName") : null,
                ].filter(Boolean).map((name) => `, ${name}`).join(""),
              })}</p>`
              : "";
            const gmChat = {
              speaker,
              whisper: gmIds,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.GMDetails", {
                actorName: a.name,
                applied,
                poolLabel,
                damage: hit.reduced ?? damage,
                effectiveSoak,
                soakWord,
                pierce,
                soak: soakValue,
              })}</p>${defenceNote}${protectionNote}`,
            };

            // A talent goes as one guarded write of the hit and its cost, and only to a writer
            // that confirms it can check that cost. Anything else keeps the single form an older
            // writer still understands.
            const op = defence
              ? { type: "damage", changes: hit.changes, defenceCost: hit.defenceCost, gmChat }
              : { type: "damage", path, delta: applied, gmChat };

            let result;
            try {
              // All clients share the elected writer's queue, including owners.
              // Forwarded calls wait for that writer to confirm completion.
              result = await applyToTargetActor(a, op, defence ? { capability: DEFENSIVE_DAMAGE_CAPABILITY } : undefined);
              if (!result) return;
            } catch (err) {
              CONFIG.logger?.warn?.("ApplyDamage: actor.update failed", err);
              ui.notifications.warn(applyFailureMessage(err, a));
              return;
            }

            // Public line for everyone (intentionally omits soak, pierce, ranks and the reduction).
            const defenceLine = defence
              ? `<p>${game.i18n.format(defencePlan.publicKey, { actorName: a.name })}</p>`
              : "";
            await ChatMessage.create({
              speaker,
              content: `<p>${game.i18n.format("SWFFG.ApplyDamage.PublicMessage", {
                actorName: a.name,
                damage,
                poolLabel,
                weaponName,
              })}</p>${defenceLine}`,
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
      render: (event, dialog) => {
        if (!defencePlan) return;
        const root = dialog.element;
        const toggle = root.querySelector(".ffg-defence-toggle");
        const options = root.querySelector(".ffg-defence-options");
        const costLine = root.querySelector(".ffg-defence-cost");
        const applyButton = root.querySelector('button[data-action="apply"]');
        const optionButtons = [...root.querySelectorAll(".ffg-defence-option")];

        // Greyed out, never explained: the attacker learns no more about the target than that.
        const refresh = () => {
          const controls = defenceControls();
          // Render the user's choice without changing it. If paying becomes impossible,
          // Apply is blocked; the user must explicitly turn the main toggle off.
          toggle.disabled = controls.toggleDisabled;
          toggle.setAttribute("aria-pressed", String(controls.on));
          options.style.display = controls.on ? "flex" : "none";
          for (const optionButton of optionButtons) {
            optionButton.setAttribute("aria-pressed", String(controls[optionButton.dataset.option]));
          }
          costLine.textContent = game.i18n.format("SWFFG.ApplyDamage.Defence.Cost", {
            cost: controls.cost,
            unit: unitLabel(defencePlan, controls.cost),
          });
          if (applyButton) applyButton.disabled = submitting || controls.applyDisabled;
        };

        toggle.addEventListener("click", (ev) => {
          ev.preventDefault();
          selection.on = !selection.on;
          if (!selection.on) {
            selection.supreme = false;
            selection.unarmed = false;
          }
          refresh();
        });
        for (const optionButton of optionButtons) {
          optionButton.addEventListener("click", (ev) => {
            ev.preventDefault();
            selection[optionButton.dataset.option] = !selection[optionButton.dataset.option];
            refresh();
          });
        }
        refresh();
      },
      rejectClose: false,
    });
  }
}
