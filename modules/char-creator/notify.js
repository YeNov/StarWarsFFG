/**
 * D9 observability I/O shell (R7-2).
 *
 * NOT Covered and outside the rule-7 closure — it emits sockets, posts ChatMessages,
 * registers a ready-time hook and raises toasts. The pure accept/emit/dedup decisions
 * live in notify-policy.js. Verified live at Stage 23 (incl. R7-2 case 6, the GM-connect-
 * with-no-render path, and the replay attack executed for real).
 */

import { SOCKET_CHANNEL, SOCKET_EVENT_TYPE, SOCKET_EVENTS } from "./constants.js";
import { startDedupKey, finishDedupKey, claimOnce, shouldAcceptAck, clearPending } from "./notify-policy.js";

/** Mint a transient per-open session id — NOT persisted, NOT derived from commitId. */
export function mintSessionNoticeId() {
  return foundry.utils.randomID(16);
}

/** Emit a start notice on the shared channel (delivery is only confirmed by an accepted ACK). */
export function emitStartNotice(sessionNoticeId, commitId) {
  game.socket.emit(SOCKET_CHANNEL, {
    eventType: SOCKET_EVENT_TYPE,
    event: SOCKET_EVENTS.startNotice,
    sessionNoticeId,
    commitId,
  });
}

/**
 * GM-side start-notice handler: derive the requester from the AUTHENTICATED sender,
 * de-dup per (sender, sessionNoticeId), whisper the GMs + log, then broadcast an ACK
 * bound to the requester.
 * @param {object} data
 * @param {string} sender  the socket layer's trailing sender id (authoritative)
 * @param {Set<string>} seen
 */
export async function handleStartNotice(data, sender, seen) {
  if (game.user.id !== game.users.activeGM?.id) return;
  if (!claimOnce(seen, startDedupKey(sender, data.sessionNoticeId))) return;

  const playerName = game.users.get(sender)?.name ?? sender;
  await ChatMessage.create({
    content: game.i18n.format("SWFFG.CharacterCreator.Notify.StartedGM", { name: playerName }),
    whisper: ChatMessage.getWhisperRecipients("GM"),
  });
  CONFIG.logger?.debug?.(`PC wizard start notice from ${playerName} (${sender})`);

  game.socket.emit(SOCKET_CHANNEL, {
    eventType: SOCKET_EVENT_TYPE,
    event: SOCKET_EVENTS.startNoticeAck,
    requesterId: sender, // derived from the sender, never from the payload
    sessionNoticeId: data.sessionNoticeId,
  });
}

/**
 * Client-side ACK handler: accept only a requester-bound ACK from a GM for a pending
 * session (R7-2), then clear the pending entry.
 * @returns {boolean} whether the ACK was accepted
 */
export function handleStartNoticeAck(data, sender, pending) {
  const senderIsGM = Boolean(game.users.get(sender)?.isGM);
  const accepted = shouldAcceptAck({
    requesterId: data.requesterId,
    sessionNoticeId: data.sessionNoticeId,
    senderIsGM,
    currentUserId: game.user.id,
    pending,
  });
  if (accepted) clearPending(pending, data.sessionNoticeId);
  return accepted;
}

/**
 * Processing-client finish record: whisper the GMs and the requesting player a
 * clickable actor link plus any warnings, de-duped per (sender, commitId).
 */
export async function postFinishRecord({ actorId, actorName, requesterId, commitId, warnings = [] }, sender, seen) {
  if (!claimOnce(seen, finishDedupKey(sender, commitId))) return;

  const recipients = [...ChatMessage.getWhisperRecipients("GM"), requesterId];
  const warningText = warnings.length ? `\n${warnings.map((key) => game.i18n.localize(key)).join("\n")}` : "";
  await ChatMessage.create({
    content: `@UUID[Actor.${actorId}]{${actorName}}${warningText}`,
    whisper: recipients,
  });
}

/** Player toast: green only on an authenticated success, otherwise an honest pending state. */
export function showSubmitToast(ok) {
  if (ok) {
    ui.notifications.info(game.i18n.localize("SWFFG.CharacterCreator.Notify.FinishedPlayer"));
  } else {
    ui.notifications.warn(game.i18n.localize("SWFFG.CharacterCreator.Notify.SubmitPending"));
  }
}

/** Register the ready-time userConnected hook ONCE; returns the hook id. */
export function registerUserConnected(onUserConnected) {
  return Hooks.on("userConnected", onUserConnected);
}
