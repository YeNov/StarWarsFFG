import test from "node:test";
import assert from "node:assert/strict";
import "./_stub/foundry-stub.mjs";
import {
  APPLY_EVENT, APPLY_RESULT_EVENT, APPLY_STATUS_EVENT,
  createActorApplyCoordinator, selectApplyExecutor,
} from "../../modules/helpers/actor-apply-coordinator.js";
import { prepareForwardedApply, DAMAGE_PATHS } from "../../modules/helpers/gm-bridge.js";

const damage = (delta) => ({ type: "damage", path: DAMAGE_PATHS[0], delta });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const user = (id, isGM = false) => ({ id, isGM, active: true });

/** Inject transport and persistence, without installing any Foundry globals. */
function clients({ users = [user("gm", true), user("owner"), user("player")], owners = ["owner"], beforeWrite, chatFails = false, timeoutMs = 1000, onPending, dropFirstReply = false } = {}) {
  users.activeGM = users.find((u) => u.isGM && u.active);
  const coordinators = new Map();
  const values = new Map();
  const writes = [];
  const sent = [];
  const chats = [];
  const chatErrors = [];
  const transportErrors = [];
  let sequence = 0;
  let shouldDropReply = dropFirstReply;
  const owns = (u) => !!u && (u.isGM || owners.includes(u.id));
  // A new record on every resolution catches retaining a synthetic actor
  // across an awaited write: its old numeric snapshot would lose the next hit.
  function actor(id, uuid = "Actor.target") {
    return { uuid, type: "nemesis", isOwner: owns(users.find((u) => u.id === id)),
      value: values.get(uuid) ?? 0, testUserPermission: owns };
  }
  for (const u of users) {
    coordinators.set(u.id, createActorApplyCoordinator({
      getUserId: () => u.id,
      getUsers: () => users,
      resolveActor: async (uuid) => actor(u.id, uuid),
      prepareForwarded: (a, op, sender) => prepareForwardedApply(a, op, users.find((v) => v.id === sender), !!users.activeGM),
      async performApply(a, op) {
        writes.push({ writer: u.id, uuid: a.uuid, type: op.type });
        await beforeWrite?.(a, op);
        await tick(); // Real overlap between reading the snapshot and saving it.
        if (op.fail) throw new Error("write failed");
        values.set(a.uuid, a.value + (op.delta ?? 1));
      },
      send(data) {
        sent.push({ sender: u.id, ...data });
        if (data.event === APPLY_RESULT_EVENT && shouldDropReply) { shouldDropReply = false; return; }
        for (const [id, coordinator] of coordinators) {
          if (id !== u.id) {
            void coordinator.receive(structuredClone(data), u.id).catch((error) => transportErrors.push(error));
          }
        }
      },
      async postChat(data) {
        chats.push(data);
        if (chatFails) throw new Error("chat failed");
      },
      onChatError: (error) => chatErrors.push(error),
      makeRequestId: () => `${u.id}-${++sequence}`,
      timeoutMs,
      onPending,
    }));
  }
  return { users, actor, values, writes, sent, chats, chatErrors, transportErrors,
    receive: (id, data, sender) => coordinators.get(id).receive(data, sender),
    apply: (id, op, uuid) => coordinators.get(id).apply(actor(id, uuid), op) };
}

test("owners, nonowners and two GMs apply through the same GM queue", async () => {
  const c = clients({ users: [user("gm", true), user("gm2", true), user("owner"), user("player")] });
  const outcomes = await Promise.all([
    c.apply("owner", damage(5)), c.apply("gm", damage(7)),
    c.apply("gm2", damage(3)), c.apply("player", damage(2)),
  ]);
  assert.equal(c.values.get("Actor.target"), 17);
  assert.deepEqual(outcomes, ["forwarded", "local", "forwarded", "forwarded"]);
  assert.ok(c.writes.every((w) => w.writer === "gm"));
  assert.equal(c.sent.filter((d) => d.event === APPLY_EVENT).length, 3);
  assert.deepEqual(c.transportErrors, []);
});

test("without a GM two owners share one queue; a nonowner still cannot apply", async () => {
  const c = clients({ users: [user("z"), user("a"), user("player")], owners: ["z", "a"] });
  const outcomes = await Promise.all([c.apply("z", damage(5)), c.apply("a", damage(7)), c.apply("player", damage(99))]);
  assert.deepEqual(outcomes, ["forwarded", "local", false]);
  assert.equal(c.values.get("Actor.target"), 12);
  assert.ok(c.writes.every((w) => w.writer === "a"));
});

test("owner election ignores iteration order and disconnected owners", () => {
  const users = [user("z"), { ...user("0"), active: false }, user("a")];
  const actor = { testUserPermission: () => true };
  assert.equal(selectApplyExecutor(actor, users), "a");
  assert.equal(selectApplyExecutor(actor, users.reverse()), "a");
});

test("a lone owner applies locally without relying on socket echo", async () => {
  const c = clients({ users: [user("owner")] });
  assert.equal(await c.apply("owner", damage(5)), "local");
  assert.equal(c.values.get("Actor.target"), 5);
  assert.equal(c.sent.length, 0);
});

test("unlinked token records are resolved again inside the queue", async () => {
  const c = clients();
  const uuid = "Scene.scene.Token.token.Actor.base";
  await Promise.all([c.apply("owner", damage(5), uuid), c.apply("gm", damage(7), uuid)]);
  assert.equal(c.values.get(uuid), 12);
  assert.equal(c.values.has("Actor.base"), false);
});

test("different token UUIDs can progress independently", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slowUuid = "Scene.s.Token.slow.Actor.base";
  const fastUuid = "Scene.s.Token.fast.Actor.base";
  const c = clients({ beforeWrite: (a) => a.uuid === slowUuid ? gate : undefined });
  const slow = c.apply("owner", damage(5), slowUuid);
  try {
    await c.apply("owner", damage(7), fastUuid);
    assert.equal(c.values.get(fastUuid), 7);
    assert.equal(c.values.has(slowUuid), false);
  } finally { release(); }
  await slow;
});

test("a forwarded call waits for persistence and posts its chat once", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const c = clients({ beforeWrite: () => gate });
  let settled = false;
  const applying = c.apply("owner", { ...damage(5), gmChat: { content: "hit" } }).then((result) => { settled = true; return result; });
  try {
    await tick();
    assert.equal(settled, false);
    assert.equal(c.chats.length, 0);
  } finally { release(); }
  assert.equal(await applying, "forwarded");
  assert.equal(c.values.get("Actor.target"), 5);
  assert.deepEqual(c.chats, [{ content: "hit" }]);
});

test("a remote write failure rejects its caller but does not poison the queue", async () => {
  const c = clients();
  const failed = assert.rejects(c.apply("owner", { ...damage(5), fail: true }), { name: "ApplyRequestError", message: "write failed" });
  const succeeded = c.apply("owner", damage(7));
  await Promise.all([failed, succeeded]);
  assert.equal(c.values.get("Actor.target"), 7);
});

test("a failed chat does not report an already-persisted hit as failed", async () => {
  const c = clients({ chatFails: true });
  assert.equal(await c.apply("owner", { ...damage(5), gmChat: { content: "hit" } }), "forwarded");
  assert.equal(c.values.get("Actor.target"), 5);
  assert.equal(c.chatErrors.length, 1);
});

test("damage, crits and minion kills all enter the same queue", async () => {
  const c = clients();
  await Promise.all([c.apply("owner", damage(5)), c.apply("owner", { type: "crit", items: [] }), c.apply("gm", { type: "kill-minion" })]);
  assert.equal(c.values.get("Actor.target"), 7);
  assert.deepEqual(c.writes.map((w) => w.type).sort(), ["crit", "damage", "kill-minion"]);
});

test("queued work is refused if the elected writer changes before it starts", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const c = clients({ users: [user("gm", true), user("gm2", true), user("owner")], beforeWrite: () => gate });
  const first = c.apply("owner", damage(5));
  await tick();
  const second = assert.rejects(c.apply("owner", damage(7)), /executor changed/);
  await tick();
  c.users.activeGM = c.users[1];
  release();
  await Promise.all([first, second]);
  assert.equal(c.values.get("Actor.target"), 5);
});

test("only a matching reply from the addressed executor completes a request", async () => {
  const users = [user("gm", true), user("owner")];
  users.activeGM = users[0];
  const sent = [];
  const coordinator = createActorApplyCoordinator({
    getUserId: () => "owner", getUsers: () => users, makeRequestId: () => "request",
    send: (data) => sent.push(data), timeoutMs: 1000,
  });
  let settled = false;
  const pending = coordinator.apply({ uuid: "Actor.a", isOwner: true }, damage(5)).then(() => { settled = true; });
  const reply = { event: APPLY_RESULT_EVENT, requestId: "request", recipientId: "owner", ok: true };
  await coordinator.receive(reply, "someone-else");
  await coordinator.receive({ ...reply, recipientId: "someone-else" }, "gm");
  await coordinator.receive({ ...reply, requestId: "wrong" }, "gm");
  assert.equal(settled, false);
  await coordinator.receive(reply, "gm");
  await pending;
  assert.equal(sent.length, 1);
});

test("an overdue request remains pending and accepts a late acknowledgement", async () => {
  const users = [user("gm", true)];
  users.activeGM = users[0];
  const sent = [];
  let warn;
  const warned = new Promise((resolve) => { warn = resolve; });
  const coordinator = createActorApplyCoordinator({
    getUserId: () => "owner", getUsers: () => users, makeRequestId: () => "request",
    send: (data) => sent.push(data), timeoutMs: 5, onPending: warn,
  });
  let settled = false;
  const applying = coordinator.apply({ uuid: "Actor.a", isOwner: true }, damage(5)).then((result) => { settled = true; return result; });
  await warned;
  assert.equal(settled, false);
  assert.equal(sent.filter((d) => d.event === APPLY_EVENT).length, 1);
  assert.equal(sent[1].event, APPLY_STATUS_EVENT);
  assert.equal(sent[1].requestId, "request");
  await coordinator.receive({ event: APPLY_RESULT_EVENT, requestId: "request", recipientId: "owner", ok: true }, "gm");
  assert.equal(await applying, "forwarded");
});

test("a write queued beyond the deadline reports pending and later applies only once", async () => {
  let release, warn;
  const gate = new Promise((resolve) => { release = resolve; });
  const warned = new Promise((resolve) => { warn = resolve; });
  const c = clients({ timeoutMs: 5, onPending: warn, beforeWrite: () => gate });
  const blocker = c.apply("gm", damage(1));
  let settled = false;
  const applying = c.apply("owner", damage(5)).then((result) => { settled = true; return result; });
  try {
    await warned;
    assert.equal(settled, false);
    assert.equal(c.values.has("Actor.target"), false);
    assert.equal(c.sent.filter((d) => d.event === APPLY_EVENT).length, 1);
  } finally { release(); }
  await Promise.all([blocker, applying]);
  assert.equal(c.values.get("Actor.target"), 6);
  assert.equal(c.writes.length, 2);
});

test("status queries recover a lost reply without replaying damage or chat", async () => {
  const c = clients({ timeoutMs: 5, dropFirstReply: true });
  assert.equal(await c.apply("owner", { ...damage(5), gmChat: { content: "hit" } }), "forwarded");
  assert.equal(c.values.get("Actor.target"), 5);
  assert.equal(c.writes.length, 1);
  assert.equal(c.chats.length, 1);
  assert.ok(c.sent.some((d) => d.event === APPLY_STATUS_EVENT));
});

test("duplicate request IDs share the original write and its completed result", async () => {
  const c = clients();
  const data = { ...damage(5), event: APPLY_EVENT, executorId: "gm", requestId: "repeat", actorUuid: "Actor.target", gmChat: { content: "hit" } };
  await Promise.all([c.receive("gm", data, "owner"), c.receive("gm", data, "owner")]);
  await c.receive("gm", data, "owner");
  assert.equal(c.values.get("Actor.target"), 5);
  assert.equal(c.writes.length, 1);
  assert.equal(c.chats.length, 1);
  // The same ID from another sender is a distinct request.
  await c.receive("gm", data, "player");
  assert.equal(c.values.get("Actor.target"), 10);
});

test("missing socket sender never executes a raw request", async () => {
  const c = clients();
  for (const sender of [undefined, null, ""]) {
    await c.receive("gm", { ...damage(5), path: "system.custom", event: APPLY_EVENT, executorId: "gm", requestId: "missing", actorUuid: "Actor.target" }, sender);
  }
  assert.equal(c.writes.length, 0);
});

test("unknown status queries cannot replay a write after a writer reload", async () => {
  const c = clients();
  await c.receive("gm", { ...damage(5), event: APPLY_STATUS_EVENT, executorId: "gm", requestId: "old", actorUuid: "Actor.target" }, "owner");
  assert.equal(c.writes.length, 0);
  assert.equal(c.sent.length, 0);
});

test("an owner acting as writer without a GM does not author the detailed whisper", async () => {
  const c = clients({ users: [user("a"), user("z")], owners: ["a", "z"] });
  assert.equal(await c.apply("z", { ...damage(5), gmChat: { content: "GM details" } }), "forwarded");
  assert.equal(c.values.get("Actor.target"), 5);
  assert.equal(c.chats.length, 0);
});

test("forwarded owners retain direct-write capabilities; nonowners retain existing validation", () => {
  const owner = user("owner");
  const other = user("other");
  const actor = { type: "nemesis", testUserPermission: (u) => u.id === owner.id };
  const custom = { type: "damage", path: "system.custom.pool", delta: -3 };
  assert.equal(prepareForwardedApply(actor, custom, owner, true), custom);
  assert.equal(prepareForwardedApply(actor, custom, owner, false), custom);
  assert.throws(() => prepareForwardedApply(actor, custom, other, true), /Invalid apply request/);
  assert.deepEqual(prepareForwardedApply(actor, damage(5), other, true), damage(5));
  assert.throws(() => prepareForwardedApply(actor, damage(5), other, false), /GM must be connected/);
  assert.throws(() => prepareForwardedApply(actor, custom, { ...owner, active: false }, true), /no longer connected/);
});
