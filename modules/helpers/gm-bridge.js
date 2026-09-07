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
import { createKeyedSerializer } from "./keyed-serializer.js";

const FFG_SOCKET = "system.starwarsffg";
const APPLY_EVENT = "ffgApplyToTarget";
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

/** Damage/crit/kill writes are chained per target actor -- see keyed-serializer.js. */
const applyQueue = createKeyedSerializer();

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
 * is allowed to modify. Always reached through {@link serializedApply}, never
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

/**
 * Queue an operation behind anything already running against the same actor.
 * Two "Apply Damage" clicks resolved a moment apart used to read the same
 * starting wounds and the second write erased the first.
 * @param {Actor} actor
 * @param {object} op
 * @returns {Promise<void>}
 */
function serializedApply(actor, op) {
  return applyQueue.run(actor.uuid ?? actor.id ?? "unknown-actor", () => performApply(actor, op));
}

/** A ChatMessage's author id, across the V13 rename. */
function messageAuthorId(message) {
  return message?.author?.id ?? message?.user?.id ?? message?.user;
}

/**
 * May this requestor have a privileged apply performed on their behalf?
 *
 * Deliberately NOT ownership of the target: the whole point of the bridge is
 * that the attacking player does not own the NPC they are shooting at. What is
 * checked instead is the originating context -- the attack chat card. The
 * requestor must be a GM, or the card's own author, which is exactly the rule
 * apply-damage.js:24-28 already uses to decide who even sees the Apply button.
 * The card's uuid is in hand at every call site, so this costs one local lookup
 * and nothing else. Without it, any connected player could apply arbitrary
 * damage to any actor in the world.
 *
 * Pure, so the rules are testable in Node.
 *
 * @param {User|undefined} requestor  `game.users.get(requestorId)` -- Foundry's own sender id.
 * @param {ChatMessage|null} origin   The resolved originating chat card, if any.
 * @param {string} requestorId
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function isApplyRequestAuthorized(requestor, origin, requestorId) {
  if (!requestor?.active) return { ok: false, reason: "requestor" };
  if (requestor.isGM) return { ok: true };
  if (!origin || messageAuthorId(origin) !== requestorId) return { ok: false, reason: "origin" };
  return { ok: true };
}

/**
 * Apply a privileged write to a (possibly unowned) target actor. Writes locally
 * when the current user can modify the actor, otherwise forwards the request to
 * the active GM over the system socket.
 *
 * An optional `op.gmChat` (`{content}`) is posted by whoever performs the write
 * -- so a GM-only whisper is authored by the GM rather than by a non-owning
 * player, who would otherwise be able to see their own whisper. On the forwarded
 * path only the content survives; the GM rebuilds the speaker and the whisper
 * list itself.
 *
 * `op.originUuid` must be the uuid of the chat card the request came from. The
 * GM authorizes against it (see {@link registerGMBridge}), so a forward without
 * one is refused.
 *
 * @param {Actor} actor  The resolved target actor (synthetic token actor is fine).
 * @param {object} op     See {@link performApply}; also carries `originUuid` and
 *   optionally `gmChat`.
 * @returns {Promise<"local"|"forwarded"|false>} "local" if applied on this
 *   client, "forwarded" if handed to the active GM, false if it could not be
 *   applied (no GM connected). The caller uses this to avoid double-posting
 *   `gmChat` (the GM posts it on the forwarded path).
 */
export async function applyToTargetActor(actor, op) {
  if (actor?.isOwner) {
    await serializedApply(actor, op);
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
      if (data?.event === APPLY_EVENT) {
        const actor = await fromUuid(data.actorUuid);
        if (!actor) return;

        // AUTHORIZE against the sender id Foundry supplies and the chat card the
        // request came from -- see {@link isApplyRequestAuthorized} for why that,
        // and not ownership of the target.
        const requestor = game.users.get(requestorId);
        // A malformed uuid throws rather than resolving to null; either way the
        // request is unauthorized, not an internal failure.
        const origin = data.originUuid ? await fromUuid(data.originUuid).catch(() => null) : null;
        const auth = isApplyRequestAuthorized(requestor, origin, requestorId);
        if (!auth.ok) {
          CONFIG.logger?.warn?.("FFG GM bridge: refused an unauthorized apply", { reason: auth.reason, requestorId, originUuid: data.originUuid });
          return;
        }

        // NARROW: only the three known operations, with their own fields checked.
        const narrowed = narrowApplyRequest(data, actor.type);
        if (!narrowed.ok) {
          CONFIG.logger?.warn?.("FFG GM bridge: refused an out-of-scope apply", { reason: narrowed.reason, type: data.type, path: data.path });
          return;
        }

        await serializedApply(actor, narrowed.op);

        // Posted GM-side so a GM-only whisper is authored by the GM, not the
        // forwarding player (who would otherwise see their own whisper). The
        // client supplies the breakdown text and nothing else: the speaker and the
        // recipient list are rebuilt here, so a forwarded payload cannot pick its
        // own audience, author or flags.
        if (typeof data.gmChat?.content === "string") {
          await ChatMessage.create({
            content: data.gmChat.content,
            speaker: actor.token ? ChatMessage.getSpeaker({ token: actor.token }) : ChatMessage.getSpeaker({ actor }),
            whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
          });
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
