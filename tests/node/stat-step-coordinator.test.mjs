import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createStatStepCoordinator, statStepSnapshot, statStepState,
  STEP_EVENT, STEP_RESULT, STEP_FLAG,
} from "../../modules/helpers/stat-step-coordinator.js";

const SPEED = "system.stats.speed.value";
const FORCE = "system.stats.forcePool.value";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const set = (object, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, key) => o[key] ??= {}, object);
  target[last] = structuredClone(value);
};
const user = (id, isGM = false) => ({ id, active: true, isGM });

/** Independent document replicas, injected persistence and authenticated transport. */
function clients({ users = [user("gm", true), user("gm2", true), user("a"), user("b")], initial = 0,
  beforeWrite, holdUpdates = false, holdReplies = false, timeoutMs = 1000, bonus = 0, type = "vehicle" } = {}) {
  users.activeGM = users.find((u) => u.isGM);
  const source = { system: { stats: { speed: { value: initial, max: 7 }, forcePool: { value: initial, max: 3 }, shields: { fore: 2, aft: 1, port: 0, starboard: 0 } } }, flags: {} };
  const records = new Map(users.map((u) => [u.id, structuredClone(source)]));
  const nodes = new Map();
  const messages = [], writes = [], errors = [], updates = [], replies = [];
  let sequence = 0;
  const owns = (u) => !!u && (u.isGM || u.id !== "stranger");
  function actor(id, uuid = "Actor.ship") {
    const data = structuredClone(records.get(id));
    const prepared = structuredClone(data);
    prepared.system.stats.speed.value += bonus;
    return { ...prepared, _source: data, type, uuid, testUserPermission: owns };
  }
  for (const u of users) {
    const node = createStatStepCoordinator({
      getUserId: () => u.id, getUsers: () => users,
      resolveActor: async (uuid) => actor(u.id, uuid),
      snapshot: statStepSnapshot,
      async write(a, changes) {
        await beforeWrite?.(changes);
        await tick();
        writes.push({ writer: u.id, changes, uuid: a.uuid });
        for (const [path, value] of Object.entries(changes)) set(source, path, value);
        for (const recipient of users) {
          const saved = structuredClone(source);
          const deliver = () => {
            records.set(recipient.id, saved);
            nodes.get(recipient.id).observe(a.uuid, statStepSnapshot(actor(recipient.id, a.uuid)));
          };
          // The writer's own actor.update resolves only after its source updates.
          if (holdUpdates && recipient.id !== u.id) updates.push(deliver);
          else deliver();
        }
      },
      makeRequestId: () => `request-${++sequence}`,
      send(data) {
        messages.push({ sender: u.id, ...structuredClone(data) });
        const deliver = () => {
          for (const [id, other] of nodes) if (id !== u.id) {
            void other.receive(structuredClone(data), u.id).catch((error) => errors.push(error));
          }
        };
        if (holdReplies && data.event === STEP_RESULT) replies.push(deliver);
        else deliver();
      },
      timeoutMs,
    });
    nodes.set(u.id, node);
  }
  return { nodes, actor, users, source, records, messages, writes, errors, updates, replies,
    adjust: (id, delta, path = SPEED, uuid) => nodes.get(id).adjust(actor(id, uuid), path, delta),
    value: (id, path = SPEED) => nodes.get(id).value(actor(id), path),
  };
}

test("seven rapid clicks predict 7 immediately and save every increment", async () => {
  const c = clients();
  const requests = Array.from({ length: 7 }, () => c.adjust("a", 1));
  assert.equal(c.value("a"), 7);
  assert.equal(c.source.system.stats.speed.value, 0, "prediction never mutates the document");
  await Promise.all(requests);
  assert.equal(c.source.system.stats.speed.value, 7);
  assert.equal(c.value("a"), 7);
  assert.deepEqual(c.writes.map((w) => w.changes[SPEED]), [1, 2, 3, 4, 5, 6, 7]);
});

test("two owners and two GMs compose changes through one writer", async () => {
  const c = clients({ initial: 7 });
  await Promise.all([c.adjust("gm", 1), c.adjust("gm2", -1), c.adjust("a", 1), c.adjust("b", 1)]);
  assert.equal(c.source.system.stats.speed.value, 9);
  assert.ok(c.writes.every((w) => w.writer === "gm"));
  assert.deepEqual(c.errors, []);
});

test("mixed directions preserve order and apply the lower bound per click", async () => {
  const c = clients();
  await Promise.all([c.adjust("a", -1), c.adjust("a", 1), c.adjust("a", -1), c.adjust("a", 1)]);
  assert.equal(c.source.system.stats.speed.value, 1);
});

test("a second client's update rebases local pending prediction", async () => {
  let release;
  let block = true;
  const gate = new Promise((resolve) => { release = resolve; });
  const c = clients({ initial: 7, beforeWrite: async () => { if (block) { block = false; await gate; } } });
  const remote = c.adjust("b", -1);
  await tick();
  const local = c.adjust("a", 1);
  assert.equal(c.value("a"), 8);
  release();
  await Promise.all([remote, local]);
  assert.equal(c.value("a"), 7);
  assert.equal(c.source.system.stats.speed.value, 7);
});

test("document update before reply removes only the acknowledged prediction", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const c = clients({ holdReplies: true, beforeWrite: async (changes) => {
    if (changes[STEP_FLAG].revision === 2) await gate;
  } });
  const first = c.adjust("a", 1);
  const second = c.adjust("a", 1);
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(c.source.system.stats.speed.value, 1);
  assert.equal(c.value("a"), 2, "first click must not be counted twice");
  await first;
  release();
  await second;
  assert.equal(c.value("a"), 2);
  c.replies.splice(0).forEach((deliver) => deliver());
  assert.equal(c.value("a"), 2, "late replies cannot count confirmed clicks again");
});

test("reply before document update and older revisions cannot roll prediction back", async () => {
  const c = clients({ holdUpdates: true });
  await c.adjust("a", 1);
  assert.equal(c.actor("a").system.stats.speed.value, 0);
  assert.equal(c.value("a"), 1);
  await c.adjust("a", 1);
  assert.equal(c.value("a"), 2);
  // Deliver the older revision while revision 2 is already confirmed by reply.
  c.updates.splice(0, 3).forEach((deliver) => deliver());
  assert.equal(c.value("a"), 2);
  c.updates.splice(0).forEach((deliver) => deliver());
  assert.equal(c.value("a"), 2);
});

test("a reply uses the requester's effect bonus, not the authority's prepared value", () => {
  const c = clients({ initial: 0 });
  const local = c.actor("a");
  const gmSnapshot = statStepSnapshot(local);
  gmSnapshot.revision = 1;
  gmSnapshot.stats[SPEED] = { value: 8, source: 1, max: null };
  c.nodes.get("a").observe(local.uuid, gmSnapshot);
  assert.equal(c.value("a"), 1, "editing client sees its raw 1, not the GM's +7 bonus");
  const boosted = clients({ bonus: 3 });
  boosted.nodes.get("a").observe(local.uuid, gmSnapshot);
  assert.equal(boosted.value("a"), 4, "client keeps its own prepared bonus until the document arrives");
});

test("a duplicate request is written only once", async () => {
  const c = clients();
  await c.adjust("a", 1);
  const request = c.messages.find((m) => m.event === STEP_EVENT);
  await c.nodes.get("gm").receive(request, "a");
  assert.equal(c.writes.length, 1);
  assert.equal(c.source.system.stats.speed.value, 1);
});

test("forged replies, missing transport identity and unauthorized paths cannot write", async () => {
  const c = clients({ users: [user("gm", true), user("a"), user("stranger")] });
  const message = { event: STEP_EVENT, executorId: "gm", requestId: "bad", actorUuid: "Actor.ship", path: SPEED, delta: 1 };
  await c.nodes.get("gm").receive(message, undefined);
  await c.nodes.get("gm").receive(message, "stranger");
  await c.nodes.get("gm").receive({ ...message, requestId: "path", path: "ownership.stranger" }, "a");
  await c.nodes.get("gm").receive({ ...message, requestId: "delta", delta: Infinity }, "a");
  await c.nodes.get("a").receive({ event: STEP_RESULT, requestId: "bad", recipientId: "a", ok: true }, "stranger");
  await assert.rejects(c.adjust("stranger", 1), /own/);
  assert.equal(c.writes.length, 0);
});

test("a failed write corrects prediction and does not poison later requests", async () => {
  let fail = true;
  const c = clients({ beforeWrite: () => { if (fail) { fail = false; throw new Error("write refused"); } } });
  const p = c.adjust("a", 1);
  assert.equal(c.value("a"), 1);
  await assert.rejects(p, /write refused/);
  assert.equal(c.value("a"), 0);
  await c.adjust("a", 1);
  assert.equal(c.value("a"), 1);
});

test("lost confirmation times out without replaying an uncertain write", async () => {
  const c = clients({ holdUpdates: true, holdReplies: true, timeoutMs: 30 });
  await assert.rejects(c.adjust("a", 1), /may already have been saved/);
  assert.equal(c.value("a"), 0);
  assert.equal(c.writes.length, 1);
  c.updates.splice(0).forEach((deliver) => deliver());
  c.replies.splice(0).forEach((deliver) => deliver());
  assert.equal(c.value("a"), 1, "late document update corrects the display");
  assert.equal(c.messages.filter((m) => m.event === STEP_EVENT).length, 1);
});

test("without a GM the elected owner also serializes its own clicks", async () => {
  const c = clients({ users: [user("b"), user("a")] });
  await Promise.all([c.adjust("a", 1), c.adjust("b", 1)]);
  assert.equal(c.source.system.stats.speed.value, 2);
  assert.ok(c.writes.every((w) => w.writer === "a"));
});

test("source and effective values stay separate for active effects", async () => {
  const c = clients({ bonus: 2 });
  await c.adjust("a", -1);
  assert.equal(c.source.system.stats.speed.value, -1);
  assert.equal(c.value("a"), 1);
  await c.adjust("a", -1);
  assert.equal(c.source.system.stats.speed.value, -2);
  assert.equal(c.value("a"), 0);
});

test("unset shield flags start at the live rating and speed has no maximum cap", async () => {
  const c = clients({ initial: 7 });
  await c.adjust("a", -1, "flags.starwarsffg.codexShields.fore");
  assert.equal(c.source.flags.starwarsffg.codexShields.fore, 1);
  await c.adjust("a", 1);
  assert.equal(c.value("a"), 8);
});

test("Force dice are capped at the authority's live rating", async () => {
  const actor = { type: "character", system: { stats: { forcePool: { value: 2, max: 3 } } }, _source: { system: { stats: { forcePool: { value: 1 } } } } };
  assert.deepEqual(statStepState(actor, FORCE), { value: 2, source: 1, max: 3 });
  assert.throws(() => statStepState(actor, SPEED), /cannot be adjusted/);
  const c = clients({ type: "character", initial: 2 });
  await Promise.all([c.adjust("a", 1, FORCE), c.adjust("a", 1, FORCE)]);
  assert.equal(c.source.system.stats.forcePool.value, 3);
  assert.equal(c.value("a", FORCE), 3);
  assert.equal(c.writes.length, 2, "clamped clicks still receive atomic acknowledgments");
});

test("a forged reply cannot settle a pending request", async () => {
  const c = clients({ holdReplies: true, holdUpdates: true });
  let settled = false;
  const p = c.adjust("a", 1).then(() => { settled = true; });
  for (let i = 0; i < 6; i++) await tick();
  const reply = c.messages.find((m) => m.event === STEP_RESULT);
  await c.nodes.get("a").receive(reply, "b");
  assert.equal(settled, false);
  c.replies.shift()();
  await p;
  assert.equal(settled, true);
});

test("an authority change refuses queued work instead of replaying it elsewhere", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let blocked = false;
  const c = clients({ beforeWrite: async () => { if (!blocked) { blocked = true; await gate; } } });
  const first = c.adjust("a", 1);
  await tick();
  const next = c.adjust("b", 1);
  const rejected = assert.rejects(next, /authority changed/);
  await tick();
  c.users.activeGM = c.users.find((u) => u.id === "gm2");
  release();
  await Promise.all([first, rejected]);
  assert.equal(c.writes.length, 1);
  assert.equal(c.value("b"), 1);
});

test("synthetic actor UUID is preserved and each write resolves a fresh source", async () => {
  const c = clients();
  const uuid = "Scene.scene.Token.token.Actor.ship";
  await Promise.all([c.adjust("a", 1, SPEED, uuid), c.adjust("b", 1, SPEED, uuid)]);
  assert.equal(c.source.system.stats.speed.value, 2);
  assert.ok(c.writes.every((w) => w.uuid === uuid));
  assert.equal(c.writes[1].changes[STEP_FLAG].revision, 2);
});

test("predicted current inputs cannot leak into whole-form submissions", () => {
  const template = readFileSync(new URL("../../templates/parts/codex/cdx-ratio-chip.html", import.meta.url), "utf8");
  const input = template.match(/<input class="cdx-ratio-c"[^>]*>/)?.[0];
  assert.ok(input);
  assert.doesNotMatch(input, /\bname=/);
  assert.match(input, /data-cdx-edit-path=/);
});
