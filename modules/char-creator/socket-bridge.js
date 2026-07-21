/**
 * PC Wizard socket transport (D3, issue F/N-2/N-3). Replaces swffg-main.js:2052-2126.
 *
 * NOT Covered and outside the rule-7 closure — pure transport over game.socket.
 *
 * Coexistence (§0.9): a SEPARATE registration on the shared channel that filters
 * `eventType === "pcWizard"` FIRST, so it never fights the GM bridge's own listener.
 * Lifecycle (issue F, N-3): registered ONCE at ready on every client; a GM client only
 * processes requests where game.user === game.users.activeGM. Sender authentication
 * (N-2): the requester id comes EXCLUSIVELY from the socket layer's trailing argument.
 */

import { SOCKET_CHANNEL, SOCKET_EVENT_TYPE, SOCKET_EVENTS } from "./constants.js";
import { sanitizeCommitRequest } from "./commit-normalize.js";
import { commitBuild } from "./commit-service.js";
import { handleStartNotice, handleStartNoticeAck, postFinishRecord } from "./notify.js";

let registered = false;
const seenStarts = new Set();
const seenFinishes = new Set();

/**
 * Register the wizard's socket listener once.
 * @param {{pending?: Map, onCommitResponse?: Function}} [hooks]
 */
export function registerSocketBridge({ pending, onCommitResponse } = {}) {
  if (registered) return;
  registered = true;

  game.socket.on(SOCKET_CHANNEL, async (data, sender) => {
    if (data?.eventType !== SOCKET_EVENT_TYPE) return; // filter first — coexistence with the GM bridge

    switch (data.event) {
      case SOCKET_EVENTS.startNotice:
        await handleStartNotice(data, sender, seenStarts);
        break;
      case SOCKET_EVENTS.startNoticeAck:
        if (pending) handleStartNoticeAck(data, sender, pending);
        break;
      case SOCKET_EVENTS.commitRequest:
        if (game.user.id === game.users.activeGM?.id) await processCommitRequest(data, sender);
        break;
      case SOCKET_EVENTS.commitResponse:
        onCommitResponse?.(data);
        break;
      default:
        break;
    }
  });
}

/** GM: sanitize an untrusted request, build the actor, whisper the finish record, respond. */
async function processCommitRequest(data, sender) {
  let response;
  try {
    const { source, commit } = sanitizeCommitRequest(data, sender);
    const actor = await commitBuild(source, commit);
    response = { ok: true, actorId: actor.id, actorName: actor.name, commitId: commit.commitId };
    await postFinishRecord(
      { actorId: actor.id, actorName: actor.name, requesterId: sender, commitId: commit.commitId, warnings: data.warnings ?? [] },
      sender,
      seenFinishes,
    );
  } catch (err) {
    response = { ok: false, commitId: data?.commit?.commitId, error: err.message };
  }

  game.socket.emit(SOCKET_CHANNEL, {
    eventType: SOCKET_EVENT_TYPE,
    event: SOCKET_EVENTS.commitResponse,
    requesterId: sender,
    ...response,
  });
}

/** Client: broadcast a commit request. */
export function emitCommitRequest(source, commit, warnings = []) {
  game.socket.emit(SOCKET_CHANNEL, {
    eventType: SOCKET_EVENT_TYPE,
    event: SOCKET_EVENTS.commitRequest,
    source,
    commit,
    warnings,
  });
}
