/**
 * A Parry or Reflect application end to end: the real apply coordinator delivering to the real
 * writer-side check (gm-bridge planDamageWrite), on the local, forwarded-owner and unowned paths.
 *
 * The target is a plain record rebuilt on every resolution, as Foundry rebuilds a synthetic
 * actor, so a check that trusted a snapshot from before the queue would let a second cost through.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./_stub/foundry-stub.mjs";

import { createActorApplyCoordinator, DEFENSIVE_DAMAGE_CAPABILITY } from "../../modules/helpers/actor-apply-coordinator.js";
import { DEFENCE_UNAFFORDABLE, planDamageWrite, prepareForwardedApply } from "../../modules/helpers/gm-bridge.js";

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const user = (id, isGM = false) => ({ id, isGM, active: true });

/** A GM, an owner and a non-owner around one target. */
function table({ type = "character", strain = { value: 7, max: 10 }, wounds = { value: 0, max: 12 } } = {}) {
  const users = [user("gm", true), user("owner"), user("player")];
  users.activeGM = users[0];
  const owns = (u) => !!u && (u.isGM || u.id === "owner");
  const state = { strain: { ...strain }, wounds: { ...wounds } };
  const updates = [];
  const chats = [];
  const coordinators = new Map();
  let sequence = 0;
  const actorFor = (id) => ({
    uuid: "Actor.target",
    type,
    isOwner: owns(users.find((u) => u.id === id)),
    testUserPermission: owns,
    system: { stats: structuredClone(state) },
  });
  for (const u of users) {
    coordinators.set(u.id, createActorApplyCoordinator({
      getUserId: () => u.id,
      getUsers: () => users,
      resolveActor: async () => actorFor(u.id),
      prepareForwarded: (a, op, sender) => prepareForwardedApply(a, op, users.find((v) => v.id === sender), true),
      async performApply(a, op) {
        const update = planDamageWrite(a, op);
        await tick(); // Real overlap between the check and the save.
        updates.push(update);
        for (const [path, value] of Object.entries(update)) {
          const [, , pool, field] = path.split(".");
          state[pool][field] = value;
        }
      },
      send(data) {
        for (const [id, coordinator] of coordinators) {
          if (id !== u.id) void coordinator.receive(structuredClone(data), u.id).catch(() => {});
        }
      },
      postChat: async (data) => { chats.push(data); },
      onChatError: () => {},
      makeRequestId: () => `${u.id}-${++sequence}`,
      timeoutMs: 1000,
      capabilityTimeoutMs: 1000,
    }));
  }
  return {
    state, updates, chats,
    apply: (id, op) => coordinators.get(id).apply(actorFor(id), op, { capability: DEFENSIVE_DAMAGE_CAPABILITY }),
  };
}

/** A 3-strain Parry that still lets 5 wounds through. */
const parry = () => ({
  type: "damage",
  changes: [{ path: WOUNDS, delta: 5 }, { path: STRAIN, delta: 3 }],
  defenceCost: { path: STRAIN, delta: 3 },
  gmChat: { content: "details" },
});

test("the hit and its cost land in one update", async () => {
  const t = table();
  assert.equal(await t.apply("player", parry()), "forwarded");
  assert.deepEqual(t.updates, [{ [WOUNDS]: 5, [STRAIN]: 10 }]);
  assert.equal(t.chats.length, 1);
});

test("two applications opened at 7/10 strain: only the first pays and lands", async () => {
  const t = table();
  const outcomes = await Promise.allSettled([t.apply("player", parry()), t.apply("owner", parry())]);

  assert.deepEqual(outcomes.map((o) => o.status).sort(), ["fulfilled", "rejected"]);
  const refusal = outcomes.find((o) => o.status === "rejected").reason;
  assert.equal(refusal.name, "ApplyRequestError");
  assert.equal(refusal.code, DEFENCE_UNAFFORDABLE);
  assert.deepEqual(t.state.strain, { value: 10, max: 10 });
  assert.equal(t.state.wounds.value, 5);
  assert.equal(t.updates.length, 1);
  assert.equal(t.chats.length, 1);
});

for (const [applier, route] of [["gm", "local"], ["owner", "forwarded owner"], ["player", "unowned"]]) {
  test(`a cost that stopped being affordable is refused on the ${route} path, with nothing written`, async () => {
    const t = table();
    t.state.strain.max = 9; // lowered after the dialog was opened at 7/10
    await assert.rejects(t.apply(applier, parry()), { name: "ApplyRequestError", code: DEFENCE_UNAFFORDABLE });
    assert.deepEqual(t.updates, []);
    assert.deepEqual(t.chats, []);
    assert.deepEqual(t.state.strain, { value: 7, max: 9 });
  });
}

test("a rival's merged hit is checked on its cost alone", async () => {
  const t = table({ type: "rival", strain: { value: 0, max: 0 }, wounds: { value: 5, max: 10 } });
  const op = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }], defenceCost: { path: WOUNDS, delta: 3 }, gmChat: { content: "x" } };
  assert.equal(await t.apply("player", op), "forwarded");
  assert.equal(t.state.wounds.value, 12);
});

test("an owner's malformed talent request is refused by the writer, although owners skip narrowing", async () => {
  const t = table();
  await assert.rejects(t.apply("owner", { ...parry(), defenceCost: { path: STRAIN, delta: 5 } }),
    { name: "ApplyRequestError", message: "Invalid apply request: defence-cost." });
  assert.deepEqual(t.updates, []);
});

for (const applier of ["gm", "owner", "player"]) {
  test(`a minion talent request from ${applier} is refused without a write or chat`, async () => {
    const t = table({ type: "minion" });
    const op = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }],
      defenceCost: { path: WOUNDS, delta: 3 }, gmChat: { content: "details" } };
    await assert.rejects(t.apply(applier, op), /Invalid apply request: defence-cost/);
    assert.deepEqual(t.updates, []);
    assert.deepEqual(t.chats, []);
  });
}
