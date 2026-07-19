/**
 * GM bridge for privileged writes to targets a player does not own.
 *
 * Applying damage or a critical injury from an attack chat card writes to the
 * TARGET actor (wounds/strain, or an embedded crit item). That write runs on
 * the attacking player's client, but players are not owners of the NPC/vehicle
 * they are shooting at, so Foundry rejects it ("lacks permission to update
 * ActorDelta ... in parent Token ..."). Foundry has NO built-in forwarding that
 * retries the write as a GM, so we forward it ourselves over the system socket
 * and let the active GM apply it.
 *
 * Note that `game.socket.emit` does not deliver back to the sender, so anyone
 * who CAN modify the target (the GM, or a player who happens to own it) must
 * still perform the write locally -- otherwise a GM clicking the button would
 * emit an event no one processes.
 */

import { killMinion } from "./minions.js";
import { availFor } from "./crit-availability.js";

const FFG_SOCKET = "system.starwarsffg";
const APPLY_EVENT = "ffgApplyToTarget";
const MESSAGE_EVENT = "ffgUpdateMessage";

/**
 * Perform the actual privileged operation against an actor the current client
 * is allowed to modify.
 * @param {Actor} actor
 * @param {object} op
 * @param {"damage"|"crit"|"kill-minion"} op.type
 * @param {string} [op.path]    For "damage": the numeric system path to bump.
 * @param {number} [op.delta]   For "damage": the amount to add to the current value.
 * @param {object[]} [op.items] For "crit": item data objects to embed.
 * @returns {Promise<void>}
 */
async function performApply(actor, op) {
  if (op.type === "damage") {
    const current = Number(foundry.utils.getProperty(actor, op.path)) || 0;
    await actor.update({ [op.path]: current + op.delta });
  } else if (op.type === "crit") {
    await actor.createEmbeddedDocuments("Item", op.items);
  } else if (op.type === "kill-minion") {
    await killMinion(actor);
  }
}

/**
 * Apply a privileged write to a (possibly unowned) target actor. Writes locally
 * when the current user can modify the actor, otherwise forwards the request to
 * the active GM over the system socket.
 *
 * An optional `op.gmChat` (a ChatMessage.create payload) is posted by whoever
 * performs the write -- so a GM-only whisper is authored by the GM rather than
 * by a non-owning player, who would otherwise be able to see their own whisper.
 *
 * @param {Actor} actor  The resolved target actor (synthetic token actor is fine).
 * @param {object} op     See {@link performApply}; may also carry `gmChat`.
 * @returns {Promise<"local"|"forwarded"|false>} "local" if applied on this
 *   client, "forwarded" if handed to the active GM, false if it could not be
 *   applied (no GM connected). The caller uses this to avoid double-posting
 *   `gmChat` (the GM posts it on the forwarded path).
 */
export async function applyToTargetActor(actor, op) {
  if (actor?.isOwner) {
    await performApply(actor, op);
    return "local";
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM"));
    return false;
  }
  game.socket.emit(FFG_SOCKET, { event: APPLY_EVENT, actorUuid: actor.uuid, ...op });
  return "forwarded";
}

/**
 * Forward a ChatMessage update to the active GM — the V14 fallback for the
 * Replace Die feature (see docs/superpowers/specs/2026-07-18-dice-replacement-
 * design_doc_v3.md §5.6/§8), used only when a non-GM message author cannot
 * write to their own message directly. No auth data is sent: the GM-side
 * listener authorizes against the Foundry-injected sender id (see
 * {@link registerGMBridge}), not anything the client claims.
 * @param {ChatMessage} message
 * @param {object} update — a `ChatMessage#update` payload; narrowed GM-side to
 *   this feature's shape (`rolls` / `flags.starwarsffg` only).
 * @returns {Promise<"forwarded"|false>}
 */
export async function forwardMessageUpdateToGM(message, update) {
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("SWFFG.ReplaceDie.NoGM"));
    return false;
  }
  game.socket.emit(FFG_SOCKET, { event: MESSAGE_EVENT, messageUuid: message.uuid, update });
  return "forwarded";
}

/**
 * Forward a crit-recovery weekly-cooldown stamp to the active GM. Used by the
 * Codex crit-card Medicine/Mechanics markers when the clicking user is NOT the
 * owner of the crit's actor (an ally with ≥OBSERVER). The GM-side branch in
 * {@link registerGMBridge} re-authorizes (OBSERVER) and re-checks availability
 * before writing — no auth data is sent; the sender id comes from Foundry's
 * socket transport. Mirrors {@link applyToTargetActor}'s forward contract.
 * @param {Actor} actor  The crit's parent actor.
 * @param {string} itemId  The crit item id.
 * @param {"medicine"|"mechanics"} path  Which weekly stamp to set.
 * @returns {Promise<"forwarded"|false>}
 */
export async function applyCritRecoveryAttempt(actor, itemId, path) {
  if (!game.users.activeGM) { ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM")); return false; }
  game.socket.emit(FFG_SOCKET, { event: "ffgCritRecovery", actorUuid: actor.uuid, itemId, path });
  return "forwarded";
}

/**
 * Register the GM-side listener. Safe to call on every client; only the single
 * active GM acts on a forwarded request.
 */
export function registerGMBridge() {
  // requestorId: Foundry appends the authenticated sender's user id as the
  // socket callback's second argument (verified in-repo: the emit at
  // character-creator.js:1076-1079 passes only one payload object, and the
  // existing PC-wizard GM handler at swffg-main.js:2026-2030 reads args[1] as
  // the requestor) — so it is trusted and not spoofable by the emitting client.
  game.socket.on(FFG_SOCKET, async (data, requestorId) => {
    if (game.user.id !== game.users.activeGM?.id) return; // only the active GM acts
    try {
      if (data?.event === MESSAGE_EVENT) {
        const message = await fromUuid(data.messageUuid);
        if (!message) return;
        // AUTHORIZE: requestor must be a GM or the message's own author (mirrors
        // the client-side gate and the locked GM-or-owner rule).
        const authorId = message.author?.id ?? message.user?.id ?? message.user;
        const requestor = game.users.get(requestorId);
        if (!(requestor?.isGM || requestorId === authorId)) {
          CONFIG.logger?.warn?.("FFG GM bridge: refused unauthorized message update", { requestorId, messageUuid: data.messageUuid });
          return;
        }
        // NARROW: only this feature's payload shape is permitted (no author/whisper/etc. escalation).
        const upd = data.update ?? {};
        const topOk = Object.keys(upd).every((k) => k === "rolls" || k === "flags");
        const flagsOk = !upd.flags || Object.keys(upd.flags).every((k) => k === "starwarsffg");
        if (!topOk || !flagsOk) {
          CONFIG.logger?.warn?.("FFG GM bridge: refused out-of-scope message update", { keys: Object.keys(upd) });
          return;
        }
        await message.update(upd);
        return;
      }
      if (data?.event === APPLY_EVENT) {
        const actor = await fromUuid(data.actorUuid);
        if (!actor) return;
        await performApply(actor, data);
        // Posted GM-side so a GM-only whisper is authored by the GM, not the
        // forwarding player (who would otherwise see their own whisper).
        if (data.gmChat) {
          await ChatMessage.create(data.gmChat);
        }
        return;
      }
      if (data?.event === "ffgCritRecovery") {
        const actor = await fromUuid(data.actorUuid);
        const item = actor?.items.get(data.itemId);
        if (!actor || !item) return;
        const requestor = game.users.get(requestorId);
        if (!actor.testUserPermission(requestor, "OBSERVER")) {           // OBSERVER, not LIMITED (crit card hidden from limited)
          CONFIG.logger?.warn?.("FFG GM bridge: refused unauthorized crit-recovery", { requestorId }); return;
        }
        const map = { medicine: { type: "criticalinjury", field: "medicineLastAttemptDay" },
                      mechanics: { type: "criticaldamage", field: "mechanicsLastAttemptDay" } };
        const m = map[data.path];
        if (!m || item.type !== m.type) return;
        if (data.path === "mechanics" && !game.settings.get("starwarsffg", "vehicleCritWeeklyLimit")) return;
        const day = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
        const stamp = item.system?.[m.field] ?? null;                     // live stamp
        if (!availFor(stamp, day).attemptable) return;                    // SHARED module — one implementation of the null/rewind/>=7 math
        await item.update({ [`system.${m.field}`]: day });
        return;
      }
    } catch (err) {
      CONFIG.logger?.warn?.("FFG GM bridge: failed to apply forwarded request", err);
    }
  });
}
