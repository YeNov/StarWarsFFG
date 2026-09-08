import { createKeyedSerializer } from "./keyed-serializer.js";

export const APPLY_EVENT = "ffgApplyToTarget";
export const APPLY_RESULT_EVENT = "ffgApplyToTargetResult";
export const APPLY_STATUS_EVENT = "ffgApplyToTargetStatus";
const LOCAL_REQUEST = Symbol("local apply");

/** An actionable failure which apply dialogs should show instead of "target gone". */
export class ApplyRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApplyRequestError";
  }
}

/** Every client elects the same writer, regardless of collection iteration order. */
export function selectApplyExecutor(actor, users) {
  if (users.activeGM) return users.activeGM.id;
  return Array.from(users)
    .filter((user) => user.active && actor.testUserPermission(user, "OWNER"))
    .map((user) => user.id)
    .sort()[0] ?? null;
}

/**
 * One coordinator per client. All applies for an actor reach its elected writer's
 * queue, including that writer's own clicks. I/O is injected so routing across
 * clients can be tested without installing Foundry globals.
 *
 * Slow requests remain pending. Status queries never replay mutations, including
 * after a writer reload or election change. Replies and duplicate suppression
 * are retained for this writer's session; they are not a durable transaction log.
 *
 * @param {object} io
 * @param {function(): string} io.getUserId
 * @param {function(): object} io.getUsers - Iterable users with an activeGM property.
 * @param {function(string): Promise<object>} io.resolveActor
 * @param {function(object, object): Promise<void>} io.performApply
 * @param {function(object, object, string): object} io.prepareForwarded - Existing authorization/validation policy.
 * @param {function(object): void} io.send
 * @param {function(object): Promise<void>} io.postChat
 * @param {function(): string} io.makeRequestId
 * @param {function(Error): void} io.onChatError
 * @param {function(object): void} [io.onPending] Warn once while confirmation is overdue.
 * @param {number} [io.timeoutMs=15000]
 */
export function createActorApplyCoordinator(io) {
  const queue = createKeyedSerializer();
  const pending = new Map();
  const received = new Map();

  function run(actorUuid, op, requestorId) {
    return queue.run(actorUuid, async () => {
      // Synthetic actors may have been rebuilt by the preceding write. Resolve
      // inside the queue instead of retaining the actor seen when it was enqueued.
      const actor = await io.resolveActor(actorUuid);
      if (!actor) throw new Error("The target actor is no longer available.");
      if (selectApplyExecutor(actor, io.getUsers()) !== io.getUserId()) {
        throw new ApplyRequestError("The apply executor changed. Check the target and try again.");
      }
      const operation = requestorId === LOCAL_REQUEST ? op : io.prepareForwarded(actor, op, requestorId);
      await io.performApply(actor, operation);
    });
  }

  async function apply(actor, op) {
    const users = io.getUsers();
    // Without a GM, owners retain their existing ability to apply locally; a
    // non-owner does not gain new permission merely because an owner is online.
    if (!actor || (!users.activeGM && !actor.isOwner)) return false;
    const executorId = selectApplyExecutor(actor, users);
    if (!executorId) return false;
    if (executorId === io.getUserId()) {
      await run(actor.uuid, op, LOCAL_REQUEST);
      return "local";
    }

    const requestId = io.makeRequestId();
    await new Promise((resolve, reject) => {
      const request = { executorId, resolve, reject, timer: null, warned: false };
      const checkStatus = () => {
        if (!pending.has(requestId)) return;
        // Losing a reply does not cancel the queued write. Keep its caller and
        // identity alive; a status query can recover the reply without another hit.
        request.timer = setTimeout(checkStatus, io.timeoutMs ?? 15000);
        if (!request.warned) {
          request.warned = true;
          io.onPending?.({ requestId, actorUuid: actor.uuid });
        }
        try {
          io.send({ event: APPLY_STATUS_EVENT, requestId, executorId });
        } catch { /* Remain pending while transport is unavailable. */ }
      };
      request.timer = setTimeout(checkStatus, io.timeoutMs ?? 15000);
      pending.set(requestId, request);
      try {
        io.send({ ...op, event: APPLY_EVENT, actorUuid: actor.uuid, executorId, requestId });
      } catch (err) {
        clearTimeout(request.timer);
        pending.delete(requestId);
        reject(err);
      }
    });
    return "forwarded";
  }

  async function receive(data, senderId) {
    if (data?.event === APPLY_RESULT_EVENT) {
      const request = pending.get(data.requestId);
      if (data.recipientId !== io.getUserId() || !request || request.executorId !== senderId) return;
      clearTimeout(request.timer);
      pending.delete(data.requestId);
      if (data.ok) request.resolve();
      else request.reject(new ApplyRequestError(data.error || "The apply request failed."));
      return;
    }
    if (data?.event !== APPLY_EVENT && data?.event !== APPLY_STATUS_EVENT) return;
    if (data.executorId && data.executorId !== io.getUserId()) return;
    // A missing transport identity must never be mistaken for a local call.
    if (typeof senderId !== "string" || !senderId) return;
    const key = data.requestId ? JSON.stringify([senderId, data.requestId]) : null;
    let entry = key ? received.get(key) : null;
    if (data.event === APPLY_STATUS_EVENT) {
      // Unknown means uncertain (possibly a reload or delayed original message).
      // A query cannot create or replay a write on this or a newly elected GM.
      // In-flight work will send its original reply. Do not accumulate an await
      // per poll on a stalled writer; only replay a completed result here.
      if (!entry?.result) return;
    } else if (!entry) {
      entry = { result: null, processing: null };
      entry.processing = execute(data, senderId).then((result) => {
        entry.result = result;
        return result;
      });
      if (key) received.set(key, entry);
    }
    const result = entry.result ?? await entry.processing;
    if (data.requestId && result) {
      io.send({ event: APPLY_RESULT_EVENT, requestId: data.requestId, recipientId: senderId, ...result });
    }
  }

  async function execute(data, senderId) {
    let ok = false;
    let error;
    try {
      const actor = await io.resolveActor(data.actorUuid);
      if (!actor) {
        // Only the addressed writer may answer an unresolved request. Legacy
        // requests without a writer/request ID have no acknowledgement to send.
        if (!data.executorId) return;
        throw new Error("The target actor is no longer available.");
      }
      if (selectApplyExecutor(actor, io.getUsers()) !== io.getUserId()) {
        if (!data.executorId) return;
        throw new Error("The apply executor changed. Check the target and try again.");
      }
      await run(data.actorUuid, data, senderId);
      ok = true;
      if (data.gmChat && io.getUsers().activeGM?.id === io.getUserId()) {
        try {
          await io.postChat(data.gmChat);
        } catch (err) {
          // The mutation succeeded. A chat failure must not tell the sender to
          // retry an already-applied hit.
          io.onChatError?.(err);
        }
      }
    } catch (err) {
      error = err.message;
    }
    return { ok, error };
  }

  return { apply, receive };
}
