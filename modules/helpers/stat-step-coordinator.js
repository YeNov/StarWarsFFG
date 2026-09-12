import { createKeyedSerializer } from "./keyed-serializer.js";
import { selectApplyExecutor } from "./actor-apply-coordinator.js";

export const STEP_EVENT = "ffgStatStep";
export const STEP_RESULT = "ffgStatStepResult";
export const STEP_FLAG = "flags.starwarsffg.statSteps";
const SPEED = "system.stats.speed.value";
const FORCE = "system.stats.forcePool.value";
const SHIELDS = ["fore", "aft", "port", "starboard"];
const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const number = (value) => Number(value) || 0;

/** Server-side allowlist and bounds: never trust a button's DOM or socket payload. */
export function statStepState(actor, path) {
  let fallback = 0;
  let max = null;
  if (path === SPEED && actor.type === "vehicle") { /* Speed has no upper cap. */ }
  else if (path === FORCE && ["character", "nemesis", "rival"].includes(actor.type)) {
    max = Math.max(0, number(actor.system.stats.forcePool.max));
  } else if (actor.type === "vehicle" && SHIELDS.some((zone) => path === `flags.starwarsffg.codexShields.${zone}`)) {
    fallback = number(actor.system.stats.shields[path.split(".").at(-1)]);
  } else throw new Error("This stat cannot be adjusted with a Codex button.");
  const value = number(get(actor, path) ?? fallback);
  const source = number(get(actor._source, path) ?? fallback);
  return { value, source, max };
}

export function stepValue(value, delta, max) {
  return Math.max(0, max === null ? value + delta : Math.min(max, value + delta));
}

export function statStepSnapshot(actor) {
  const paths = actor.type === "vehicle"
    ? [SPEED, ...SHIELDS.map((zone) => `flags.starwarsffg.codexShields.${zone}`)]
    : ["character", "nemesis", "rival"].includes(actor.type) && actor.system?.stats?.forcePool ? [FORCE] : [];
  const stamp = get(actor._source, STEP_FLAG);
  return {
    revision: stamp?.revision ?? 0,
    receipts: stamp?.receipts ?? [],
    stats: Object.fromEntries(paths.map((path) => [path, statStepState(actor, path)])),
  };
}

/**
 * One per browser. Prediction is separate from document data. Both local and
 * remote requests enter the elected writer's actor queue. Each client sends
 * one request per actor at a time, while displaying all its queued clicks.
 * I/O is injected for deterministic multi-client tests without Foundry globals.
 */
export function createStatStepCoordinator(io) {
  const writes = createKeyedSerializer();
  const sends = createKeyedSerializer();
  const pending = new Map();
  const confirmed = new Map();
  const waiting = new Map();
  // In-flight duplicate requests share a promise; recent replies can be replayed.
  // Mutations are never automatically retransmitted, including after timeout.
  const received = new Map();
  const keyOf = (sender, id) => `${sender}:${id}`;

  function observe(uuid, snapshot) {
    const previous = confirmed.get(uuid);
    if (previous && snapshot.revision < previous.revision) return;
    confirmed.set(uuid, snapshot);
    for (const receipt of snapshot.receipts) pending.delete(receipt);
    // The document receipt is confirmation too. A missing socket reply must
    // not stall later clicks or report an already-confirmed write as uncertain.
    for (const [requestId, request] of waiting) {
      if (request.actorUuid !== uuid || !snapshot.receipts.includes(keyOf(io.getUserId(), requestId))) continue;
      waiting.delete(requestId);
      clearTimeout(request.timer);
      request.resolve(snapshot);
    }
    io.onChange?.(uuid);
  }

  function value(actor, path) {
    const live = io.snapshot(actor);
    const saved = confirmed.get(actor.uuid);
    const ahead = saved && saved.revision > live.revision;
    const snapshot = ahead ? saved : live;
    const stat = snapshot.stats[path];
    if (!stat) return undefined;
    // A GM reply describes the GM's prepared data. Edit Mode can suppress
    // effects only for the requester, so reapply THIS client's effect bonus.
    const local = live.stats[path] ?? stat;
    let result = ahead ? stat.source + (local.value - local.source) : stat.value;
    for (const [key, request] of pending) {
      if (request.actorUuid === actor.uuid && request.path === path && !snapshot.receipts.includes(key)) {
        result = stepValue(result, request.delta, local.max);
      }
    }
    return result;
  }

  async function execute(data, sender) {
    return writes.run(data.actorUuid, async () => {
      // Re-resolve synthetic actors after every preceding write.
      const actor = await io.resolveActor(data.actorUuid);
      if (!actor || selectApplyExecutor(actor, io.getUsers()) !== io.getUserId()) {
        throw new Error("The stat's authority changed. Check the value before trying again.");
      }
      const user = Array.from(io.getUsers()).find((entry) => entry.id === sender);
      if (!user?.active || !actor.testUserPermission(user, "OWNER")) throw new Error("You do not own this actor.");
      if (!Number.isSafeInteger(data.delta) || data.delta === 0) throw new Error("Invalid stat adjustment.");
      const stat = io.state ? io.state(actor, data.path, sender) : statStepState(actor, data.path);
      const snapshot = io.snapshot(actor);
      const receipt = keyOf(sender, data.requestId);
      if (snapshot.receipts.includes(receipt)) return snapshot;
      const next = stepValue(stat.value, data.delta, stat.max);
      // Keep effects out of source values. A receipt is saved even for a
      // clamped/no-op click so every prediction can be acknowledged atomically.
      await io.write(actor, {
        [data.path]: next - (stat.value - stat.source),
        [STEP_FLAG]: {
          revision: snapshot.revision + 1,
          receipts: [...snapshot.receipts, receipt].slice(-256),
        },
      });
      return io.snapshot(await io.resolveActor(data.actorUuid));
    });
  }

  async function receive(data, sender) {
    if (data?.event === STEP_RESULT) {
      const request = waiting.get(data.requestId);
      if (!request || data.recipientId !== io.getUserId() || sender !== request.executorId) return;
      waiting.delete(data.requestId);
      clearTimeout(request.timer);
      if (data.ok) request.resolve(data.snapshot);
      else request.reject(new Error(data.error || "The stat adjustment failed."));
      return;
    }
    if (data?.event !== STEP_EVENT || data.executorId !== io.getUserId()) return;
    if (typeof sender !== "string" || typeof data.requestId !== "string" || !data.requestId || data.requestId.length > 100) return;
    const key = keyOf(sender, data.requestId);
    if (!received.has(key)) {
      const processing = execute(data, sender).then(
        (snapshot) => ({ ok: true, snapshot }),
        (error) => ({ ok: false, error: error.message }),
      );
      const entry = { processing, done: false };
      received.set(key, entry);
      processing.then(() => {
        entry.done = true;
        for (const [oldKey, oldEntry] of received) {
          if (received.size <= 256) break;
          if (oldEntry.done) received.delete(oldKey);
        }
      });
    }
    const result = await received.get(key).processing;
    io.send({ event: STEP_RESULT, requestId: data.requestId, recipientId: sender, ...result });
  }

  function forward(data) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(data.requestId);
        // Never replay an uncertain mutation on a newly elected authority.
        reject(new Error("Stat confirmation was not received. Check the value before trying again; the change may already have been saved."));
      }, io.timeoutMs ?? 15000);
      waiting.set(data.requestId, { actorUuid: data.actorUuid, executorId: data.executorId, resolve, reject, timer });
      try { io.send(data); }
      catch (error) {
        clearTimeout(timer);
        waiting.delete(data.requestId);
        reject(error);
      }
    });
  }

  function adjust(actor, path, delta) {
    if (!Number.isSafeInteger(delta) || delta === 0) return Promise.reject(new Error("Invalid stat adjustment."));
    statStepState(actor, path);
    const user = Array.from(io.getUsers()).find((entry) => entry.id === io.getUserId());
    if (!user?.active || !actor.testUserPermission(user, "OWNER")) return Promise.reject(new Error("You do not own this actor."));
    const requestId = io.makeRequestId();
    const key = keyOf(io.getUserId(), requestId);
    const data = { event: STEP_EVENT, requestId, actorUuid: actor.uuid, path, delta };
    pending.set(key, data);
    io.onChange?.(actor.uuid);
    return sends.run(actor.uuid, async () => {
      const current = await io.resolveActor(actor.uuid);
      const executorId = current && selectApplyExecutor(current, io.getUsers());
      if (!executorId) throw new Error("No owner or GM is connected to save this stat.");
      const snapshot = executorId === io.getUserId()
        ? await execute(data, io.getUserId())
        : await forward({ ...data, executorId });
      observe(actor.uuid, snapshot);
    }).finally(() => {
      pending.delete(key);
      io.onChange?.(actor.uuid);
    });
  }

  return { adjust, value, observe, receive };
}
