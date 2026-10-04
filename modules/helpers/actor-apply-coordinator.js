import { createKeyedSerializer } from "./keyed-serializer.js";

export const APPLY_EVENT = "ffgApplyToTarget";
export const APPLY_RESULT_EVENT = "ffgApplyToTargetResult";
export const APPLY_STATUS_EVENT = "ffgApplyToTargetStatus";
export const CAPABILITY_EVENT = "ffgApplyCapability";
export const CAPABILITY_RESULT_EVENT = "ffgApplyCapabilityResult";

/**
 * The writer understands the two-pool damage form and checks a Parry/Reflect cost inside its
 * queue. A writer on older code would apply an owner's forwarded talent request unchecked, or
 * refuse an unowned one, so a talent application goes only to a writer that has said yes.
 */
export const DEFENSIVE_DAMAGE_CAPABILITY = "defensive-damage-v1";
/** What this build can do on behalf of other clients. */
const SUPPORTED_CAPABILITIES = Object.freeze([DEFENSIVE_DAMAGE_CAPABILITY]);
/** ApplyRequestError code: the elected writer did not confirm a capability the request needs. */
export const WRITER_OUTDATED = "writer-outdated";
/** Elections a capability check follows before giving up on a seat that keeps moving. */
const MAX_CAPABILITY_ATTEMPTS = 3;
const LOCAL_REQUEST = Symbol("local apply");

/**
 * An actionable failure which apply dialogs should show instead of "target gone".
 *
 * `code`, when present, is a stable identifier the requesting client turns into its own
 * localized warning, since the message may come from another client in another language.
 */
export class ApplyRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ApplyRequestError";
    if (code) this.code = code;
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
 * @param {number} [io.receivedLimit=200] Completed requests kept for duplicate suppression.
 * @param {number} [io.capabilityTimeoutMs=5000] How long a writer has to confirm a capability.
 * @param {string[]} [io.capabilities] What this client supports; this build's list by default.
 */
export function createActorApplyCoordinator(io) {
  const queue = createKeyedSerializer();
  const pending = new Map();
  const received = new Map();
  const probes = new Map();
  const capabilities = io.capabilities ?? SUPPORTED_CAPABILITIES;

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

  /** Ask `executorId` whether it supports `capability`. Silence, refusal or a send failure is a no. */
  function probeCapability(executorId, capability) {
    const requestId = io.makeRequestId();
    return new Promise((resolve) => {
      const probe = { executorId, capability, timer: null, settle: null };
      probe.settle = (supported) => {
        if (probes.get(requestId) !== probe) return;
        clearTimeout(probe.timer);
        probes.delete(requestId);
        resolve(supported);
      };
      probe.timer = setTimeout(() => probe.settle(false), io.capabilityTimeoutMs ?? 5000);
      probes.set(requestId, probe);
      try {
        io.send({ event: CAPABILITY_EVENT, requestId, executorId, capability });
      } catch {
        probe.settle(false);
      }
    });
  }

  /**
   * The writer a capability-gated apply may go to, verified for this application only.
   *
   * A reply vouches for the client that sent it and nothing else, so the seat is re-elected after
   * every probe, including silence or refusal. If it moved while the writer was answering (or
   * not answering), the replacement is asked too. The request is never handed to an unverified
   * writer; an unchanged writer that does not confirm support gets the reload warning.
   *
   * @returns {Promise<string|null>} null when no writer is left
   */
  async function verifiedExecutor(actor, capability, executorId) {
    for (let attempt = 0; attempt < MAX_CAPABILITY_ATTEMPTS; attempt++) {
      const supported = executorId === io.getUserId()
        ? capabilities.includes(capability)
        : await probeCapability(executorId, capability);
      const current = selectApplyExecutor(actor, io.getUsers());
      if (!current) return null;
      if (current !== executorId) {
        executorId = current;
        continue;
      }
      if (!supported) {
        throw new ApplyRequestError("The client applying this runs an older version of the system. Reload every client and try again.", WRITER_OUTDATED);
      }
      return executorId;
    }
    throw new ApplyRequestError("The apply executor changed. Check the target and try again.");
  }

  /**
   * @param {object} actor
   * @param {object} op
   * @param {{capability?: string}} [options] Require the elected writer to support `capability`
   *   before anything is sent; it is asked afresh for every application.
   */
  async function apply(actor, op, { capability } = {}) {
    const users = io.getUsers();
    // Without a GM, owners retain their existing ability to apply locally; a
    // non-owner does not gain new permission merely because an owner is online.
    if (!actor || (!users.activeGM && !actor.isOwner)) return false;
    let executorId = selectApplyExecutor(actor, users);
    if (!executorId) return false;
    if (capability) {
      executorId = await verifiedExecutor(actor, capability, executorId);
      if (!executorId) return false;
    }
    if (executorId === io.getUserId()) {
      await run(actor.uuid, op, LOCAL_REQUEST);
      return "local";
    }

    const requestId = io.makeRequestId();
    await new Promise((resolve, reject) => {
      const request = { executorId, resolve, reject, timer: null, warned: false };
      const checkStatus = () => {
        if (!pending.has(requestId)) return;
        // Once the addressed writer is gone, nothing will ever answer: its reply
        // and its record of this request went with it, and a newly elected writer
        // must not be asked to replay a write that may already have happened.
        // Settle instead of polling an empty seat forever, and say plainly that
        // the outcome is unknown rather than implying the hit was lost.
        if (!Array.from(io.getUsers()).some((user) => user.id === executorId && user.active)) {
          pending.delete(requestId);
          reject(new ApplyRequestError("The client applying this disconnected before confirming it. Check the target before applying it again."));
          return;
        }
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
    if (data?.event === CAPABILITY_RESULT_EVENT) {
      const probe = probes.get(data.requestId);
      if (!probe || data.recipientId !== io.getUserId() || probe.executorId !== senderId || probe.capability !== data.capability) return;
      probe.settle(data.ok === true);
      return;
    }
    if (data?.event === CAPABILITY_EVENT) {
      // Read-only: says what this client supports. It never touches an actor or the queue.
      if (data.executorId !== io.getUserId() || typeof senderId !== "string" || !senderId || !data.requestId) return;
      io.send({
        event: CAPABILITY_RESULT_EVENT,
        requestId: data.requestId,
        recipientId: senderId,
        capability: data.capability,
        ok: capabilities.includes(data.capability),
      });
      return;
    }
    if (data?.event === APPLY_RESULT_EVENT) {
      const request = pending.get(data.requestId);
      if (data.recipientId !== io.getUserId() || !request || request.executorId !== senderId) return;
      clearTimeout(request.timer);
      pending.delete(data.requestId);
      if (data.ok) request.resolve();
      else request.reject(new ApplyRequestError(data.error || "The apply request failed.", typeof data.code === "string" ? data.code : undefined));
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
      if (key) {
        received.set(key, entry);
        pruneReceived();
      }
    }
    const result = entry.result ?? await entry.processing;
    if (data.requestId && result) {
      io.send({ event: APPLY_RESULT_EVENT, requestId: data.requestId, recipientId: senderId, ...result });
    }
  }

  /**
   * Keep the duplicate-suppression cache from growing for the life of a session.
   *
   * It answers "have I already done this exact request?", so it only has to
   * outlive the sender's own polling, not the campaign. The oldest COMPLETED
   * entry goes first: dropping one that is still processing would let its own
   * resend start a second write of the same hit, which is the thing this cache
   * exists to prevent. Map iterates in insertion order, so the first match is
   * the oldest.
   */
  function pruneReceived() {
    if (received.size <= (io.receivedLimit ?? 200)) return;
    for (const [candidate, value] of received) {
      if (!value.result) continue;
      received.delete(candidate);
      return;
    }
  }

  async function execute(data, senderId) {
    let ok = false;
    let error;
    let code;
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
      if (typeof err.code === "string") code = err.code;
    }
    return code ? { ok, error, code } : { ok, error };
  }

  return { apply, receive };
}
