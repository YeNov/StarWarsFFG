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

const FFG_SOCKET = "system.starwarsffg";
const APPLY_EVENT = "ffgApplyToTarget";

/**
 * Perform the actual privileged operation against an actor the current client
 * is allowed to modify.
 * @param {Actor} actor
 * @param {object} op
 * @param {"damage"|"crit"} op.type
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
  }
}

/**
 * Apply a privileged write to a (possibly unowned) target actor. Writes locally
 * when the current user can modify the actor, otherwise forwards the request to
 * the active GM over the system socket.
 *
 * @param {Actor} actor  The resolved target actor (synthetic token actor is fine).
 * @param {object} op     See {@link performApply}.
 * @returns {Promise<boolean>} true if the write was applied locally or forwarded
 *   to an active GM; false if it could not be applied (no GM connected).
 */
export async function applyToTargetActor(actor, op) {
  if (actor?.isOwner) {
    await performApply(actor, op);
    return true;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM"));
    return false;
  }
  game.socket.emit(FFG_SOCKET, { event: APPLY_EVENT, actorUuid: actor.uuid, ...op });
  return true;
}

/**
 * Register the GM-side listener. Safe to call on every client; only the single
 * active GM acts on a forwarded request.
 */
export function registerGMBridge() {
  game.socket.on(FFG_SOCKET, async (data) => {
    if (data?.event !== APPLY_EVENT) return;
    if (game.user.id !== game.users.activeGM?.id) return;
    try {
      const actor = await fromUuid(data.actorUuid);
      if (!actor) return;
      await performApply(actor, data);
    } catch (err) {
      CONFIG.logger?.warn?.("FFG GM bridge: failed to apply forwarded request", err);
    }
  });
}
