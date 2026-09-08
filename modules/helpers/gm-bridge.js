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
 * All applies share one writer's per-actor queue, including clicks by owners
 * and other GMs. Without a GM, one active owner handles owner requests. Only
 * the elected writer executes locally because socket emits do not echo back.
 */

import { killMinion } from "./minions.js";
import { availFor } from "./crit-availability.js";
import { createActorApplyCoordinator, APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT } from "./actor-apply-coordinator.js";

const FFG_SOCKET = "system.starwarsffg";
const MESSAGE_EVENT = "ffgUpdateMessage";

/**
 * The numeric pools an "Apply Damage" may bump. Taken from apply-damage.js, which
 * is the only producer: vehicles use hull trauma / system strain, everyone else
 * wounds / strain. A forwarded request naming anything else is refused, so the
 * bridge can never be talked into writing an arbitrary path on an actor the
 * requesting player does not own.
 */
export const DAMAGE_PATHS = Object.freeze([
  "system.stats.wounds.value",
  "system.stats.strain.value",
  "system.stats.hullTrauma.value",
  "system.stats.systemStrain.value",
]);

/** The item types "Apply Critical" may embed (apply-crit.js draws them from a crit table). */
export const CRIT_ITEM_TYPES = Object.freeze(["criticalinjury", "criticaldamage"]);

/** True for a value that is an object literal (not null, not an array). */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrow a forwarded request down to an operation this bridge is willing to
 * perform, discarding everything else the sender put in the payload.
 *
 * Pure by design (no `game`, no `CONFIG`) so the rules are testable in Node; the
 * caller supplies the resolved target's type for the minion check.
 *
 * @param {object} data       The raw socket payload.
 * @param {string} actorType  The resolved target actor's `type`.
 * @returns {{ok: true, op: object}|{ok: false, reason: string}}
 */
export function narrowApplyRequest(data, actorType) {
  switch (data?.type) {
    case "damage": {
      if (!DAMAGE_PATHS.includes(data.path)) return { ok: false, reason: "path" };
      // A real, finite number -- not a coercible one. `Number(null)` is 0 and
      // `Number("5")` is 5, and neither is anything apply-damage.js sends.
      if (typeof data.delta !== "number" || !Number.isFinite(data.delta)) return { ok: false, reason: "delta" };
      return { ok: true, op: { type: "damage", path: data.path, delta: data.delta } };
    }
    case "crit": {
      const items = data.items;
      if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: "items" };
      if (!items.every((i) => isPlainObject(i) && CRIT_ITEM_TYPES.includes(i.type))) {
        return { ok: false, reason: "items" };
      }
      return { ok: true, op: { type: "crit", items } };
    }
    case "kill-minion": {
      if (actorType !== "minion") return { ok: false, reason: "not-a-minion" };
      return { ok: true, op: { type: "kill-minion" } };
    }
    default:
      return { ok: false, reason: "type" };
  }
}

/**
 * Perform the actual privileged operation against an actor the current client
 * is allowed to modify. Always reached through the apply coordinator, never
 * called directly, so the read-modify-write below cannot interleave.
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

/** A ChatMessage's author id, across the V13 rename. */
function messageAuthorId(message) {
  return message?.author?.id ?? message?.user?.id ?? message?.user;
}

/**
 * May this requestor have a privileged apply performed on their behalf?
 *
 * A connected user, and nothing more. NOT ownership of the target -- the whole
 * point of the bridge is that the attacking player does not own the NPC they are
 * shooting at -- and deliberately NOT the originating chat card either: a table
 * is a trusted room, and requiring a card the player authored would break any
 * macro or module that applies damage without one. What still holds is
 * {@link narrowApplyRequest}: requests against unowned targets can only do one
 * of the three things this bridge exists to do. Owners retain their existing
 * direct-write capabilities when their operations are forwarded for ordering.
 *
 * Pure, so the rule is testable in Node.
 *
 * @param {User|undefined} requestor  `game.users.get(requestorId)` -- Foundry's own sender id.
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function isApplyRequestAuthorized(requestor) {
  if (!requestor?.active) return { ok: false, reason: "requestor" };
  return { ok: true };
}

/** Preserve the existing owner path and the existing unowned-target policy. */
export function prepareForwardedApply(actor, data, requestor, hasGM) {
  if (!isApplyRequestAuthorized(requestor).ok) throw new Error("The requesting user is no longer connected.");
  // Owners previously executed directly, without narrowing. Routing their
  // writes through another client must not remove any of those capabilities.
  if (actor.testUserPermission(requestor, "OWNER")) return data;
  if (!hasGM) throw new Error("A GM must be connected to apply to an unowned target.");
  const narrowed = narrowApplyRequest(data, actor.type);
  if (!narrowed.ok) throw new Error(`Invalid apply request: ${narrowed.reason}.`);
  return narrowed.op;
}

const applyCoordinator = createActorApplyCoordinator({
  getUserId: () => game.user.id,
  getUsers: () => game.users,
  resolveActor: (uuid) => fromUuid(uuid),
  performApply,
  prepareForwarded: (actor, data, senderId) => prepareForwardedApply(
    actor, data, game.users.get(senderId), !!game.users.activeGM,
  ),
  send: (data) => game.socket.emit(FFG_SOCKET, data),
  postChat: (data) => ChatMessage.create(data),
  makeRequestId: () => foundry.utils.randomID(),
  onChatError: (err) => CONFIG.logger?.warn?.("FFG GM bridge: apply succeeded but its chat message failed", err),
  onPending: () => ui.notifications.warn("Still waiting for apply confirmation. The action may be queued or already applied. Do not apply it again; confirmation will be accepted when it arrives."),
});

/**
 * Apply through the active GM's queue, or an elected owner's queue if no GM is
 * connected. Only that writer executes locally; other callers await its reply.
 *
 * An optional `op.gmChat` (a ChatMessage.create payload) is posted by the GM
 * writer. Without a GM, omit that detail whisper so another owner cannot become
 * its author and see it. The caller still posts the public damage announcement.
 *
 * Callable from a macro without a chat card. Existing owner permissions and
 * the validation for requests against unowned targets remain unchanged.
 *
 * @param {Actor} actor  The resolved target actor (synthetic token actor is fine).
 * @param {object} op     See {@link performApply}; may also carry `gmChat`.
 * @returns {Promise<"local"|"forwarded"|false>} "local" if applied on this
 *   client, "forwarded" after the elected writer confirms completion, false
 *   if there is no permitted writer. Confirmed remote failures reject; overdue
 *   calls remain pending. The GM posts `gmChat` on the appropriate local or
 *   forwarded path; owner-only fallback omits it.
 */
export async function applyToTargetActor(actor, op) {
  const result = await applyCoordinator.apply(actor, op);
  if (!result) {
    ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM"));
  }
  return result;
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
 * Register on every client. Applies and their replies use the elected writer;
 * message edits and critical-recovery stamps remain active-GM-only.
 */
export function registerGMBridge() {
  // requestorId: Foundry appends the authenticated sender's user id as the
  // socket callback's second argument (verified in-repo: the emit at
  // character-creator.js:1076-1079 passes only one payload object, and the
  // existing PC-wizard GM handler at swffg-main.js:2026-2030 reads args[1] as
  // the requestor) — so it is trusted and not spoofable by the emitting client.
  game.socket.on(FFG_SOCKET, async (data, requestorId) => {
    try {
      if (data?.event === APPLY_EVENT || data?.event === APPLY_RESULT_EVENT || data?.event === APPLY_STATUS_EVENT) {
        await applyCoordinator.receive(data, requestorId);
        return;
      }
      if (game.user.id !== game.users.activeGM?.id) return;
      if (data?.event === MESSAGE_EVENT) {
        const message = await fromUuid(data.messageUuid);
        if (!message) return;
        // AUTHORIZE: requestor must be a GM or the message's own author (mirrors
        // the client-side gate and the locked GM-or-owner rule).
        const authorId = messageAuthorId(message);
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
