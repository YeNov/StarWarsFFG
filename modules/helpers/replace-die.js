/**
 * Replace-Die chat interactions. Two context menus drive four operations on a
 * posted FFG roll:
 *   - Right-click a die glyph  -> die menu:  Reroll die / Add a die / Remove die.
 *   - Right-click the message  -> core menu gains:  Add result / Add a die.
 * Reroll and Add-a-die open the die window (pick one of the 7 FFG dice); Add
 * result opens the result window (pick a symbol + quantity); Remove die confirms
 * first. Every edit recomputes the roll, records an audit entry, and persists the
 * ChatMessage for all clients (Dice So Nice animates a freshly-rolled die).
 *
 * See docs/superpowers/specs/2026-07-18-dice-replacement-design.md.
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
const { ContextMenu } = foundry.applications.ux;

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

// Shared picker-window styles. Icons are recoloured for the dark dialog by the
// shared `.cdx-dice .dice-pool` rules in cdx.css (added via the `.cdx-dice` marker
// in render + the `.dice-pool` panel class) — no per-window recolour here.
const BTN_STYLE = "position:relative; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:6px; padding:6px 4px; width:70px; height:72px; box-sizing:border-box; background:none; border:1px solid #888; border-radius:4px; cursor:pointer;";
const ICON_BOX = "height:36px; display:flex; align-items:center; justify-content:center;";
const LABEL_STYLE = "font-size:11px; line-height:1.1; text-align:center; word-break:break-word;";
const BADGE_STYLE = "position:absolute; top:2px; right:4px; font-size:12px; font-weight:bold; color:var(--color-border-highlight, #ff6400); display:none;";

// Die tiles carry a hidden count badge; Add mode wires LMB/RMB counters onto it
// (see wireCounters), while Reroll mode leaves it hidden and single-selects.
function diceButtonsHtml() {
  return DICE_ORDER.map(
    (d) => `
      <button type="button" class="rd-dice-btn" data-denom="${d}" data-count="0" style="${BTN_STYLE}">
        <span class="rd-badge" style="${BADGE_STYLE}"></span>
        <span style="${ICON_BOX}"><img src="${CONFIG.FFG[DIE_ICON[d]]}" alt="" style="width:32px; height:32px;" /></span>
        <span style="${LABEL_STYLE}">${game.i18n.localize(DIE_NAME[d])}</span>
      </button>`
  ).join("");
}

function resultButtonsHtml() {
  return RESULT_TYPES.map(
    ({ type, icon, label }) => `
      <button type="button" class="rd-result-btn" data-type="${type}" data-count="0" style="${BTN_STYLE}">
        <span class="rd-badge" style="${BADGE_STYLE}"></span>
        <span style="${ICON_BOX}"><img src="${CONFIG.FFG[icon]}" alt="" style="width:26px; height:26px;" /></span>
        <span style="${LABEL_STYLE}">${game.i18n.localize(label)}</span>
      </button>`
  ).join("");
}

// Single-select highlight for a group of picker tiles (Reroll / Add result).
function wireSelection(root, selector) {
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
}

// Counter tiles: LMB increments a tile's count, RMB decrements it. The signed
// count shows as a "+N" / "-N" badge; 0 hides the badge and outline. Dice-add
// counts floor at 0 (allowNegative false); result counts may go negative.
function wireCounters(root, selector, { allowNegative = false } = {}) {
  root.querySelectorAll(selector).forEach((btn) => {
    const badge = btn.querySelector(".rd-badge");
    const update = () => {
      const n = Number(btn.dataset.count) || 0;
      badge.textContent = n > 0 ? `+${n}` : n < 0 ? String(n) : "";
      badge.style.display = n !== 0 ? "" : "none";
      btn.style.outline = n !== 0 ? "2px solid var(--color-border-highlight, #ff6400)" : "";
    };
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      btn.dataset.count = String((Number(btn.dataset.count) || 0) + 1);
      update();
    });
    btn.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const next = (Number(btn.dataset.count) || 0) - 1;
      btn.dataset.count = String(allowNegative ? next : Math.max(0, next));
      update();
    });
    update();
  });
}

// A throwaway Roll wrapping already-evaluated dice (with additive operators between
// them), used only to hand a batch of freshly-rolled dice to Dice So Nice at once.
function animRollFromDice(dice) {
  const terms = [];
  dice.forEach((d, i) => {
    if (i) terms.push(new foundry.dice.terms.OperatorTerm({ operator: "+" }));
    terms.push(d);
  });
  return Roll.fromTerms(terms);
}

export class ReplaceDie {
  /* ---------------------------------------------------------------- wiring */

  /**
   * Called from renderChatMessageHTML. Gate to GM-or-author on an FFG roll, then
   * attach the per-die context menu (Reroll / Add a die / Remove die). Foundry's
   * ContextMenu calls `stopImmediatePropagation` when its selector matches, and
   * this menu's listener sits inside the message (ahead of core's on the chat-log
   * root), so right-clicking a die opens THIS menu and suppresses the core message
   * menu; right-clicking elsewhere on the message falls through to core (whose menu
   * gains the message-level options — see addMessageContextOptions).
   * @param {ChatMessage} message
   * @param {jQuery|HTMLElement} html
   */
  static bindChatMessage(message, html) {
    if (!ReplaceDie._canModify(message)) return;
    const root = html?.[0] ?? html;
    if (!root?.querySelector || root.dataset?.rdMenuBound) return;
    // Only worth a menu if the card actually has FFG die glyphs to click.
    if (!root.querySelector("li.roll.ffg-die[data-die-index]")) return;
    root.dataset.rdMenuBound = "1";

    new ContextMenu(
      root,
      "li.roll.ffg-die[data-die-index]",
      [
        {
          name: game.i18n.localize("SWFFG.ReplaceDie.Menu.Reroll"),
          icon: '<i class="fas fa-rotate"></i>',
          callback: (li) => ReplaceDie.showDieWindow(message, { mode: "reroll", coords: ReplaceDie._coords(li) }),
        },
        {
          name: game.i18n.localize("SWFFG.ReplaceDie.Menu.AddDie"),
          icon: '<i class="fas fa-plus"></i>',
          callback: () => ReplaceDie.showDieWindow(message, { mode: "add" }),
        },
        {
          name: game.i18n.localize("SWFFG.ReplaceDie.Menu.RemoveDie"),
          icon: '<i class="fas fa-trash"></i>',
          callback: (li) => ReplaceDie.confirmRemove(message, ReplaceDie._coords(li)),
        },
      ],
      { jQuery: false, fixed: true }
    );
  }

  /**
   * Append the message-level options (Add result / Add a die) to the core chat
   * context menu. Registered on the getChatMessageContextOptions hook; the caller
   * passes the menu-items array. Each entry gates to an FFG roll owned-or-GM.
   * @param {ContextMenuEntry[]} options
   */
  static addMessageContextOptions(options) {
    const gate = (li) => ReplaceDie._canModify(game.messages.get(li?.dataset?.messageId));
    const msg = (li) => game.messages.get(li?.dataset?.messageId);
    options.push(
      {
        name: "SWFFG.ReplaceDie.Menu.AddResult",
        icon: '<i class="fas fa-plus-circle"></i>',
        condition: gate,
        callback: (li) => ReplaceDie.showResultWindow(msg(li)),
      },
      {
        name: "SWFFG.ReplaceDie.Menu.AddDie",
        icon: '<i class="fas fa-dice-d6"></i>',
        condition: gate,
        callback: (li) => ReplaceDie.showDieWindow(msg(li), { mode: "add" }),
      }
    );
  }

  /** GM or the message's own author may modify, and it must be an FFG roll. */
  static _canModify(message) {
    const roll = message?.rolls?.[0];
    if (!roll?.hasFFG) return false;
    const authorId = message.author?.id ?? message.user;
    return game.user.id === authorId || game.user.isGM;
  }

  static _coords(li) {
    return {
      dieIndex: Number(li.dataset.dieIndex),
      resultIndex: Number(li.dataset.resultIndex),
      sourceDenom: li.dataset.denom,
    };
  }

  /* -------------------------------------------------------------- windows */

  /**
   * Die picker window (pick one of the 7 FFG dice, then confirm). Shared by
   * Reroll (replaces the clicked die in place) and Add (appends a new die).
   * @param {ChatMessage} message
   * @param {{mode:"reroll"|"add", coords?:object}} opts
   */
  static async showDieWindow(message, { mode, coords }) {
    if (!ReplaceDie._canModify(message)) return;
    if (mode === "reroll" && !ReplaceDie._validCoords(message, coords)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.Stale"));
      return;
    }
    const title =
      mode === "reroll"
        ? game.i18n.format("SWFFG.ReplaceDie.RerollTitle", { die: ReplaceDie._coordLabel(message, coords) })
        : game.i18n.localize("SWFFG.ReplaceDie.AddDieTitle");

    const content = `
      <div class="rd-dice-panel dice-pool" style="display:flex; flex-wrap:wrap; gap:8px; padding:4px 8px;">
        ${diceButtonsHtml()}
      </div>`;

    DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "confirm",
          icon: "fas fa-check",
          label: game.i18n.localize("SWFFG.ReplaceDie.Confirm"),
          default: true,
          callback: (event, button, dialog) => {
            let op;
            if (mode === "reroll") {
              const picked = dialog.element.querySelector(".rd-dice-btn.selected");
              if (!picked) {
                ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
                return;
              }
              op = ReplaceDie.applyReroll(message, coords, picked.dataset.denom);
            } else {
              // Add mode: collect the per-die pending-add counts built by LMB/RMB.
              const counts = {};
              dialog.element.querySelectorAll(".rd-dice-btn").forEach((btn) => {
                const n = Number(btn.dataset.count) || 0;
                if (n > 0) counts[btn.dataset.denom] = n;
              });
              if (!Object.keys(counts).length) {
                ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
                return;
              }
              op = ReplaceDie.applyAddDice(message, counts);
            }
            // Fire-and-forget so the window closes immediately; animation + persist run after.
            op.catch((err) => CONFIG.logger?.warn?.("ReplaceDie: apply failed", err));
          },
        },
        { action: "cancel", icon: "fas fa-times", label: game.i18n.localize("SWFFG.ReplaceDie.Cancel") },
      ],
      render: (event, dialog) => {
        dialog.element.classList.add("cdx-dice");
        if (mode === "reroll") wireSelection(dialog.element, ".rd-dice-btn");
        else wireCounters(dialog.element, ".rd-dice-btn");
      },
      rejectClose: false,
    });
  }

  /**
   * Result picker window (pick a symbol + quantity, then confirm) → Add result.
   * @param {ChatMessage} message
   */
  static async showResultWindow(message) {
    if (!ReplaceDie._canModify(message)) return;
    const content = `
      <div class="rd-result-panel dice-pool" style="display:flex; flex-wrap:wrap; gap:8px; padding:4px 8px;">
        ${resultButtonsHtml()}
      </div>`;

    DialogV2.wait({
      window: { title: game.i18n.localize("SWFFG.ReplaceDie.AddResultTitle") },
      content,
      buttons: [
        {
          action: "confirm",
          icon: "fas fa-check",
          label: game.i18n.localize("SWFFG.ReplaceDie.Confirm"),
          default: true,
          callback: (event, button, dialog) => {
            // Collect the per-result signed counts built by LMB/RMB (may be negative).
            const counts = {};
            dialog.element.querySelectorAll(".rd-result-btn").forEach((btn) => {
              const n = Number(btn.dataset.count) || 0;
              if (n !== 0) counts[btn.dataset.type] = n;
            });
            if (!Object.keys(counts).length) {
              ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
              return;
            }
            ReplaceDie.applyAddResults(message, counts).catch((err) => CONFIG.logger?.warn?.("ReplaceDie: apply failed", err));
          },
        },
        { action: "cancel", icon: "fas fa-times", label: game.i18n.localize("SWFFG.ReplaceDie.Cancel") },
      ],
      render: (event, dialog) => {
        dialog.element.classList.add("cdx-dice");
        wireCounters(dialog.element, ".rd-result-btn", { allowNegative: true });
      },
      rejectClose: false,
    });
  }

  /**
   * Confirm, then remove the clicked die's result entirely.
   * @param {ChatMessage} message
   * @param {object} coords
   */
  static async confirmRemove(message, coords) {
    if (!ReplaceDie._canModify(message) || !ReplaceDie._validCoords(message, coords)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.Stale"));
      return;
    }
    const ok = await DialogV2.confirm({
      window: { title: game.i18n.localize("SWFFG.ReplaceDie.RemoveTitle") },
      content: `<p>${game.i18n.format("SWFFG.ReplaceDie.RemoveConfirm", { die: ReplaceDie._coordLabel(message, coords) })}</p>`,
      rejectClose: false,
    });
    if (ok) ReplaceDie.applyRemove(message, coords).catch((err) => CONFIG.logger?.warn?.("ReplaceDie: apply failed", err));
  }

  /* ----------------------------------------------------------- operations */

  /** Reroll: replace the clicked die in place with a fresh die of `denom`. */
  static async applyReroll(message, coords, denom) {
    const rolls = message.rolls;
    const roll = rolls?.[0];
    if (!roll || !ReplaceDie._validCoords(message, coords)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.Stale"));
      return;
    }
    const { dieIndex, resultIndex, sourceDenom } = coords;
    const term = roll.dice[dieIndex];
    const ti = roll.terms.indexOf(term);
    if (ti === -1) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
      return;
    }
    const original = ReplaceDie._original(term, term.results[resultIndex], sourceDenom);

    const D = await ReplaceDie._rollAndAnimate(denom);
    roll.terms = spliceReplacement(roll.terms, ti, resultIndex, D, {
      getDenom: (t) => t?.constructor?.DENOMINATION,
      makeOperator: () => new foundry.dice.terms.OperatorTerm({ operator: "+" }),
      makeTerm: (src, res) => cloneEvaluatedTerm(src.constructor, res),
    });
    await ReplaceDie._finalize(message, rolls, roll, {
      ...ReplaceDie._meta("reroll"),
      original,
      replacement: { kind: "die", denom, label: game.i18n.localize(DIE_NAME[denom]) },
    });
  }

  /**
   * Add dice: roll fresh dice per the chosen per-type counts and append them all
   * to the pool in one edit. `counts` maps denomination -> how many to add.
   */
  static async applyAddDice(message, counts) {
    const rolls = message.rolls;
    const roll = rolls?.[0];
    if (!roll) return;

    const newDice = [];
    for (const denom of DICE_ORDER) {
      for (let i = 0; i < (counts[denom] || 0); i++) {
        const D = new CONFIG.Dice.terms[denom](1);
        await D.evaluate();
        newDice.push(D);
      }
    }
    if (!newDice.length) return;

    // Animate the whole batch of freshly-rolled dice together.
    if (game.dice3d?.showForRoll) {
      try {
        await game.dice3d.showForRoll(animRollFromDice(newDice), game.user, true);
      } catch (err) {
        CONFIG.logger?.warn?.("ReplaceDie: dice animation failed", err);
      }
    }

    for (const D of newDice) {
      if (roll.terms.length) roll.terms.push(new foundry.dice.terms.OperatorTerm({ operator: "+" }));
      roll.terms.push(D);
    }

    // One audit entry per die type (with its count).
    const audit = DICE_ORDER.filter((d) => counts[d] > 0).map((denom) => ({
      ...ReplaceDie._meta("add-die"),
      replacement: { kind: "die", denom, count: counts[denom], label: game.i18n.localize(DIE_NAME[denom]) },
    }));
    await ReplaceDie._finalize(message, rolls, roll, audit);
  }

  /** Remove: drop the clicked die's result from the roll. */
  static async applyRemove(message, coords) {
    const rolls = message.rolls;
    const roll = rolls?.[0];
    if (!roll || !ReplaceDie._validCoords(message, coords)) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.Stale"));
      return;
    }
    const { dieIndex, resultIndex, sourceDenom } = coords;
    const term = roll.dice[dieIndex];
    const ti = roll.terms.indexOf(term);
    if (ti === -1) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
      return;
    }
    const original = ReplaceDie._original(term, term.results[resultIndex], sourceDenom);

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
    await ReplaceDie._finalize(message, rolls, roll, { ...ReplaceDie._meta("remove"), original });
  }

  /**
   * Add results: append the chosen per-type signed counts to the roll's totals.
   * `counts` maps result type -> signed integer; negatives subtract (including
   * Triumph/Despair, whose success/failure coupling the pure core applies to
   * negative added results too).
   */
  static async applyAddResults(message, counts) {
    const rolls = message.rolls;
    const roll = rolls?.[0];
    if (!roll) return;
    const entries = Object.entries(counts).filter(([type, n]) => TOKEN[type] && Number.isSafeInteger(n) && n !== 0);
    if (!entries.length) {
      ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoSelection"));
      return;
    }
    const audit = [];
    for (const [type, n] of entries) {
      roll.addedResults.push({ type, symbol: TOKEN[type], value: Math.abs(n), negative: n < 0 });
      audit.push({
        ...ReplaceDie._meta("add-result"),
        replacement: { kind: "result", type, symbol: TOKEN[type], value: Math.abs(n), negative: n < 0 },
      });
    }
    await ReplaceDie._finalize(message, rolls, roll, audit);
  }

  /* -------------------------------------------------------------- helpers */

  static _meta(mode) {
    return { by: game.user.id, byName: game.user.name, at: new Date().toISOString(), mode };
  }

  /**
   * Recount the fixed-results (`addedResults`) block: fold every entry of the same
   * type into a single net entry (first-occurrence order preserved, net-zero types
   * dropped) so e.g. +2 Success then -1 Success renders as one +1 Success. Also
   * re-normalises each symbol to its `[XX]` token (undoing render-time enrichment)
   * before persistence — so this replaces the plain symbol pass.
   */
  static _foldAddedResults(roll) {
    const order = [];
    const net = new Map();
    for (const r of roll.addedResults ?? []) {
      const signed = (r.negative ? -1 : 1) * (Number(r.value) || 0);
      if (!net.has(r.type)) order.push(r.type);
      net.set(r.type, (net.get(r.type) || 0) + signed);
    }
    roll.addedResults = order
      .map((type) => ({ type, symbol: TOKEN[type], value: Math.abs(net.get(type)), negative: net.get(type) < 0 }))
      .filter((r) => r.value !== 0);
  }

  /** Capture a removed face defensively (same path recompute uses), for the audit. */
  static _original(term, removed, sourceDenom) {
    return {
      denom: sourceDenom,
      face: removed?.result,
      label: localizeFaceLabel(term, removed),
      ffg: foundry.utils.deepClone(faceTally(term, removed) ?? zeroTally()),
    };
  }

  static _validCoords(message, coords) {
    const term = message.rolls?.[0]?.dice?.[coords?.dieIndex];
    return !!term && term.constructor?.DENOMINATION === coords?.sourceDenom && !!term.results?.[coords?.resultIndex];
  }

  static _coordLabel(message, coords) {
    const term = message.rolls?.[0]?.dice?.[coords?.dieIndex];
    return term ? localizeFaceLabel(term, term.results[coords.resultIndex]) : "";
  }

  /** Roll a fresh die of `denom` and play its 3D animation (Dice So Nice, broadcast). */
  static async _rollAndAnimate(denom) {
    const D = new CONFIG.Dice.terms[denom](1);
    await D.evaluate();
    if (game.dice3d?.showForRoll) {
      try {
        await game.dice3d.showForRoll(Roll.fromTerms([D]), game.user, true);
      } catch (err) {
        CONFIG.logger?.warn?.("ReplaceDie: dice animation failed", err);
      }
    }
    return D;
  }

  /**
   * Normalise symbols, recompute totals, tidy the formula, record audit, persist.
   * `audit` is a single entry or an array (batch add records one entry per type).
   */
  static async _finalize(message, rolls, roll, audit) {
    ReplaceDie._foldAddedResults(roll);
    recomputeRollFFG(roll);
    if (typeof roll.resetFormula === "function") roll.resetFormula();
    else if (typeof Roll.getFormula === "function") roll._formula = Roll.getFormula(roll.terms);
    roll.modifications.push(...(Array.isArray(audit) ? audit : [audit]));

    const update = {
      rolls: rolls.map((r, i) => (i === 0 ? JSON.stringify(roll) : JSON.stringify(r))),
      flags: { starwarsffg: { diceModified: true, modifiedBy: game.user.id } },
    };
    // Author and GM are OWNER on V13 and V14, so they update directly; a non-owner
    // falls back to the requestor-validated gm-bridge forward.
    const canDirect =
      typeof message.canUserModify === "function" ? message.canUserModify(game.user, "update") : message.isOwner || game.user.isGM;
    if (canDirect) await message.update(update);
    else await forwardMessageUpdateToGM(message, update);
  }
}
