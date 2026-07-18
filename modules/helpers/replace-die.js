/**
 * Replace Die chat interaction — right-click a rendered FFG die glyph to
 * swap it for a fresh die of a chosen type (in place) or remove it and
 * append a chosen symbol, then persist the mutated roll for everyone.
 *
 * See docs/superpowers/specs/2026-07-18-dice-replacement-design_doc_v3.md §5.
 */
import {
  faceTally,
  zeroTally,
  TOKEN,
  DIE_NAME,
  cloneEvaluatedTerm,
  spliceReplacement,
  recomputeTermFFG,
  recomputeRollFFG,
  localizeFaceLabel,
} from "../dice/replace-die.js";
import { forwardMessageUpdateToGM } from "./gm-bridge.js";

const { DialogV2 } = foundry.applications.api;

const DIE_ICON = {
  p: "PROFICIENCY_ICON",
  a: "ABILITY_ICON",
  b: "BOOST_ICON",
  i: "DIFFICULTY_ICON",
  c: "CHALLENGE_ICON",
  s: "SETBACK_ICON",
  f: "FORCE_ICON",
};
const DICE_ORDER = ["p", "a", "b", "i", "c", "s", "f"];

const RESULT_TYPES = [
  { type: "Success", icon: "SUCCESS_ICON", label: "SWFFG.RollResultSuccess" },
  { type: "Failure", icon: "FAILURE_ICON", label: "SWFFG.RollResultFailure" },
  { type: "Advantage", icon: "ADVANTAGE_ICON", label: "SWFFG.RollResultAdvantage" },
  { type: "Threat", icon: "THREAT_ICON", label: "SWFFG.RollResultThreat" },
  { type: "Triumph", icon: "TRIUMPH_ICON", label: "SWFFG.RollResultTriumph" },
  { type: "Despair", icon: "DESPAIR_ICON", label: "SWFFG.RollResultDespair" },
  { type: "Light", icon: "LIGHT_ICON", label: "SWFFG.RollResultLight" },
  { type: "Dark", icon: "DARK_ICON", label: "SWFFG.RollResultDark" },
];

export class ReplaceDie {
  /**
   * Called from the renderChatMessageHTML hook. Gate exactly like ApplyCrit
   * (GM or the message's own author); delegate a contextmenu listener onto
   * every FFG die glyph so right-clicking one opens the replace modal.
   * @param {ChatMessage} message
   * @param {jQuery} html
   */
  static bindChatMessage(message, html) {
    const authorId = message.author?.id ?? message.user;
    if (game.user.id !== authorId && !game.user.isGM) return;

    html.on("contextmenu", ".ffgDiceArray li.roll.ffg-die[data-die-index]", (ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // block core ChatLog's own (delete-message) ContextMenu
      const target = ev.currentTarget;
      const dieIndex = Number(target.dataset.dieIndex);
      const resultIndex = Number(target.dataset.resultIndex);
      const denom = target.dataset.denom;
      ReplaceDie.show(message, { dieIndex, resultIndex, denom });
    });
  }

  /**
   * Open the two-mode replace modal for the clicked die/face.
   * @param {ChatMessage} message
   * @param {{dieIndex: number, resultIndex: number, denom: string}} coords
   */
  static async show(message, { dieIndex, resultIndex, denom }) {
    const roll = message.rolls?.[0];
    const term = roll?.dice?.[dieIndex];
    // Guard against a stale click target (e.g. the card re-rendered from a
    // concurrent edit while the context menu was open).
    if (!term || term.constructor?.DENOMINATION !== denom || !term.results?.[resultIndex]) return;
    const removed = term.results[resultIndex];
    const faceLabel = localizeFaceLabel(term, removed);
    const title = game.i18n.format("SWFFG.ReplaceDie.DialogTitle", { die: faceLabel });

    const modeDieLabel = game.i18n.localize("SWFFG.ReplaceDie.ModeDie");
    const modeResultLabel = game.i18n.localize("SWFFG.ReplaceDie.ModeResult");
    const quantityLabel = game.i18n.localize("SWFFG.ReplaceDie.Quantity");
    const replaceLabel = game.i18n.localize("SWFFG.ReplaceDie.Replace");
    const cancelLabel = game.i18n.localize("SWFFG.ReplaceDie.Cancel");

    // Fixed-size buttons with a fixed-height icon box so the glyph and the label
    // stay vertically centered and the boxes line up in an even grid.
    const btnStyle = "display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:6px; padding:6px 4px; width:70px; height:72px; box-sizing:border-box; background:none; border:1px solid #888; border-radius:4px; cursor:pointer;";
    const iconBox = "height:36px; display:flex; align-items:center; justify-content:center;";
    const labelStyle = "font-size:11px; line-height:1.1; text-align:center; word-break:break-word;";

    const diceButtons = DICE_ORDER.map(
      (d) => `
      <button type="button" class="rd-dice-btn" data-denom="${d}" style="${btnStyle}">
        <span style="${iconBox}"><img src="${CONFIG.FFG[DIE_ICON[d]]}" alt="" style="width:32px; height:32px;" /></span>
        <span style="${labelStyle}">${game.i18n.localize(DIE_NAME[d])}</span>
      </button>`
    ).join("");

    // Result symbols are solid-black glyphs (color:black in both stylesheets) and
    // vanish on the dark dialog background. Invert them to white so they read —
    // the same intent as the token-HUD status-icon whitening in the CSS.
    const resultButtons = RESULT_TYPES.map(
      ({ type, icon, label }) => `
      <button type="button" class="rd-result-btn" data-type="${type}" style="${btnStyle}">
        <span style="${iconBox}"><img src="${CONFIG.FFG[icon]}" alt="" style="width:26px; height:26px; filter:brightness(0) invert(1);" /></span>
        <span style="${labelStyle}">${game.i18n.localize(label)}</span>
      </button>`
    ).join("");

    const content = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; gap:16px; padding:4px 8px;">
          <label style="display:flex; align-items:center; gap:4px;">
            <input type="radio" name="rd-mode" value="dice" checked /> ${modeDieLabel}
          </label>
          <label style="display:flex; align-items:center; gap:4px;">
            <input type="radio" name="rd-mode" value="result" /> ${modeResultLabel}
          </label>
        </div>
        <div class="rd-dice-panel" style="display:flex; flex-wrap:wrap; gap:8px; padding:4px 8px;">
          ${diceButtons}
        </div>
        <div class="rd-result-panel" style="display:none; flex-direction:column; gap:8px; padding:4px 8px;">
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${resultButtons}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label>${quantityLabel}</label>
            <input type="number" class="rd-qty" min="1" value="1" style="width:60px;" />
          </div>
        </div>
      </div>
    `;

    DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "replace",
          icon: "fas fa-check",
          label: replaceLabel,
          default: true,
          callback: async (event, button, dialog) => {
            const root = dialog.element;
            const mode = root.querySelector('input[name="rd-mode"]:checked')?.value;
            if (mode === "dice") {
              const picked = root.querySelector(".rd-dice-btn.selected");
              if (!picked) {
                ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
                return;
              }
              await ReplaceDie.applyReplacement(message, { dieIndex, resultIndex, sourceDenom: denom }, { mode: "dice", denom: picked.dataset.denom });
            } else {
              const picked = root.querySelector(".rd-result-btn.selected");
              if (!picked) {
                ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
                return;
              }
              const qty = parseInt(root.querySelector(".rd-qty")?.value, 10);
              if (!Number.isSafeInteger(qty) || qty < 1) {
                ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.InvalidQuantity"));
                return;
              }
              await ReplaceDie.applyReplacement(message, { dieIndex, resultIndex, sourceDenom: denom }, { mode: "result", type: picked.dataset.type, qty });
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
        const dicePanel = root.querySelector(".rd-dice-panel");
        const resultPanel = root.querySelector(".rd-result-panel");
        const applyMode = () => {
          const mode = root.querySelector('input[name="rd-mode"]:checked')?.value;
          dicePanel.style.display = mode === "dice" ? "flex" : "none";
          resultPanel.style.display = mode === "result" ? "flex" : "none";
        };
        root.querySelectorAll('input[name="rd-mode"]').forEach((r) => r.addEventListener("change", applyMode));
        applyMode();

        const wireSelection = (selector) => {
          const buttons = Array.from(root.querySelectorAll(selector));
          buttons.forEach((b) =>
            b.addEventListener("click", (ev) => {
              ev.preventDefault();
              buttons.forEach((o) => {
                o.classList.remove("selected");
                o.style.outline = "";
              });
              b.classList.add("selected");
              b.style.outline = "2px solid var(--color-border-highlight, #ff6400)";
            })
          );
        };
        wireSelection(".rd-dice-btn");
        wireSelection(".rd-result-btn");
      },
      rejectClose: false,
    });
  }

  /**
   * Mutate the persisted roll in place (recompute + splice), record the
   * audit entry, and persist for every client. See design §5.2/§5.5/§5.7.
   * @param {ChatMessage} message
   * @param {{dieIndex: number, resultIndex: number, sourceDenom: string}} coords — `sourceDenom`
   *   is the clicked die's denomination, re-checked at mutation time against a possibly re-rendered card.
   * @param {{mode: "dice", denom: string}|{mode: "result", type: string, qty: number}} choice
   */
  static async applyReplacement(message, { dieIndex, resultIndex, sourceDenom }, choice) {
    // 1. Capture the rolls array ONCE — all mutation and the later serialize use this same rolls/roll.
    const rolls = message.rolls;
    const roll = rolls?.[0];
    if (!roll) return;

    // 2. Locate the term. `ti` indexes roll.terms (operators excluded from roll.dice).
    const term = roll.dice[dieIndex];

    // 2a. Revalidate at MUTATION time (not just when the dialog opened): a concurrent
    // edit may have re-rendered the card while this dialog was open, so the captured
    // indices could now point at a different die or a removed face. Bail if so.
    if (!term || term.constructor?.DENOMINATION !== sourceDenom || !term.results?.[resultIndex]) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.Stale"));
      return;
    }

    // 2b. Validate the Result-mode choice — the dialog's HTML min/allow-list is not
    // trustworthy inside a custom DialogV2 callback (a negative qty is truthy and
    // would recompute as the OPPOSITE symbol via cancellation; an unknown type would
    // persist an undefined token).
    if (choice.mode === "result") {
      if (!TOKEN[choice.type]) {
        ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
        return;
      }
      if (!Number.isSafeInteger(choice.qty) || choice.qty < 1) {
        ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.InvalidQuantity"));
        return;
      }
    }

    const ti = roll.terms.indexOf(term);
    if (ti === -1) {
      // Defensive-only: the clicked die lives inside a nested inner-RollFFG
      // pool, not a top-level term. Out of scope for this feature (design §7 risk 2).
      CONFIG.logger?.warn?.("ReplaceDie: clicked die is not a top-level roll term, aborting", { dieIndex });
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
      return;
    }

    // 3. Audit capture BEFORE mutating, through the same defensive path recompute uses.
    const removed = term.results[resultIndex];
    const originalTally = foundry.utils.deepClone(faceTally(term, removed) ?? zeroTally());
    const originalDenom = term.constructor?.DENOMINATION;
    const originalLabel = localizeFaceLabel(term, removed);

    if (choice.mode === "dice") {
      // 4. Dice mode: a fresh random die of the chosen type, spliced into the clicked slot.
      const D = new CONFIG.Dice.terms[choice.denom](1);
      await D.evaluate();
      roll.terms = spliceReplacement(roll.terms, ti, resultIndex, D, {
        getDenom: (t) => t?.constructor?.DENOMINATION,
        makeOperator: () => new foundry.dice.terms.OperatorTerm({ operator: "+" }),
        makeTerm: (src, res) => cloneEvaluatedTerm(src.constructor, res),
      });
    } else {
      // 5. Result mode: remove the clicked face and append the chosen symbol.
      term.results.splice(resultIndex, 1);
      term.number = Math.max(0, (term.number ?? term.results.length + 1) - 1);
      if (term.results.length === 0) {
        // Drop the now-empty term plus one flanking operator.
        roll.terms.splice(ti, 1);
        const op = roll.terms[ti] ?? roll.terms[ti - 1];
        if (op instanceof foundry.dice.terms.OperatorTerm) roll.terms.splice(roll.terms.indexOf(op), 1);
      } else {
        recomputeTermFFG(term);
      }
      roll.addedResults.push({ type: choice.type, symbol: TOKEN[choice.type], value: choice.qty, negative: false });
    }

    // 6. Finalize: normalize addedResults symbols (undo updateSymbols() HTML enrichment before persisting),
    // recompute the roll totals, keep the formula tidy, and record the audit entry.
    for (const entry of roll.addedResults) entry.symbol = TOKEN[entry.type];
    recomputeRollFFG(roll);
    if (typeof roll.resetFormula === "function") roll.resetFormula();
    else if (typeof Roll.getFormula === "function") roll._formula = Roll.getFormula(roll.terms);

    roll.modifications.push({
      by: game.user.id,
      byName: game.user.name,
      at: new Date().toISOString(),
      mode: choice.mode,
      original: { denom: originalDenom, face: removed?.result, label: originalLabel, ffg: originalTally },
      // `label` is precomputed/stored (not re-derived at render time) for the same reason
      // `original.label` is: a stable audit line even if CONFIG.FFG's theme/tables change later.
      replacement:
        choice.mode === "dice"
          ? { kind: "die", denom: choice.denom, label: game.i18n.localize(DIE_NAME[choice.denom]) }
          : { kind: "result", type: choice.type, symbol: TOKEN[choice.type], value: choice.qty },
    });

    // 7. Persist from the SAME rolls captured in step 1. A GM and the message's
    // own author are both OWNER on V13 AND V14 (BaseChatMessage#getUserLevel grants
    // the author OWNER, and updates require OWNER), so they write directly on either
    // generation. Only a non-owner falls back to the requestor-validated gm-bridge
    // forward (Stage 8) — gate on the actual update capability, not the generation.
    const update = {
      rolls: rolls.map((r, i) => (i === 0 ? JSON.stringify(roll) : JSON.stringify(r))),
      flags: { starwarsffg: { diceModified: true, modifiedBy: game.user.id } },
    };
    const canDirect =
      typeof message.canUserModify === "function"
        ? message.canUserModify(game.user, "update")
        : (message.isOwner || game.user.isGM);
    if (canDirect) await message.update(update);
    else await forwardMessageUpdateToGM(message, update);
  }
}
