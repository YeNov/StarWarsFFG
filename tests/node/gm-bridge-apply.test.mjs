/**
 * The GM bridge's forwarded "apply to target" path.
 *
 * Two bugs are pinned here:
 *   1. `performApply` for damage reads the actor's current pool and writes
 *      `current + delta`. Two overlapping requests both read the same starting
 *      value, so 5 and 7 against 0 produced 7 instead of 12. Every operation now
 *      runs through a per-actor promise chain.
 *   2. The GM-side branch performed whatever the payload said: any `path`, any
 *      `delta`, any item. It is now narrowed to the three operations the bridge
 *      exists for, and the sender must at least be a connected user. Who that
 *      user is, and whether a chat card sits behind the request, is deliberately
 *      NOT checked -- see isApplyRequestAuthorized.
 */
import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";

import { createKeyedSerializer } from "../../modules/helpers/keyed-serializer.js";
import {
  narrowApplyRequest,
  isApplyRequestAuthorized,
  DAMAGE_PATHS,
  CRIT_ITEM_TYPES,
} from "../../modules/helpers/gm-bridge.js";

/* -------------------------------------------------------------------------- */
/*  The serializer                                                            */
/* -------------------------------------------------------------------------- */

/** A stand-in for the read-modify-write in performApply, with a real await between the two. */
function pool(initial = 0) {
  const state = { value: initial };
  return {
    state,
    async add(delta) {
      const current = state.value;
      await new Promise((resolve) => setTimeout(resolve, 1));
      state.value = current + delta;
    },
  };
}

test("two overlapping damage applications against the same actor compose (5 and 7 -> 12)", async () => {
  const wounds = pool(0);
  const queue = createKeyedSerializer();

  await Promise.all([
    queue.run("Actor.abc", () => wounds.add(5)),
    queue.run("Actor.abc", () => wounds.add(7)),
  ]);

  assert.equal(wounds.state.value, 12);
  // The key is dropped by a follow-up microtask, so give it a turn.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queue.pending(), 0);
});

test("without the serializer the same pair loses an update (the bug this fixes)", async () => {
  const wounds = pool(0);
  await Promise.all([wounds.add(5), wounds.add(7)]);
  assert.equal(wounds.state.value, 7);
});

test("different actors are not made to wait for each other", async () => {
  const queue = createKeyedSerializer();
  const order = [];
  const slow = queue.run("Actor.slow", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("slow");
  });
  const fast = queue.run("Actor.fast", async () => {
    order.push("fast");
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ["fast", "slow"]);
});

test("a failing task rejects only its own caller; the queue keeps running", async () => {
  const wounds = pool(0);
  const queue = createKeyedSerializer();

  const failed = queue.run("Actor.abc", async () => { throw new Error("target gone"); });
  const after = queue.run("Actor.abc", () => wounds.add(3));

  await assert.rejects(failed, /target gone/);
  await after;
  assert.equal(wounds.state.value, 3);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queue.pending(), 0);
});

/* -------------------------------------------------------------------------- */
/*  Narrowing                                                                 */
/* -------------------------------------------------------------------------- */

const crit = (type = "criticalinjury") => ({ name: "Minor Nick", type, system: { severity: 1 } });

test("a damage request is accepted only for a known pool path and a finite delta", () => {
  for (const path of DAMAGE_PATHS) {
    const result = narrowApplyRequest({ type: "damage", path, delta: 7 }, "nemesis");
    assert.equal(result.ok, true);
    assert.deepEqual(result.op, { type: "damage", path, delta: 7 });
  }

  assert.deepEqual(narrowApplyRequest({ type: "damage", path: "system.attributes.hp", delta: 1 }, "nemesis"),
    { ok: false, reason: "path" });
  assert.deepEqual(narrowApplyRequest({ type: "damage", path: "name", delta: 1 }, "nemesis"),
    { ok: false, reason: "path" });
  assert.deepEqual(narrowApplyRequest({ type: "damage", delta: 1 }, "nemesis"),
    { ok: false, reason: "path" });

  for (const delta of ["lots", null, undefined, NaN, Infinity, {}]) {
    assert.equal(narrowApplyRequest({ type: "damage", path: DAMAGE_PATHS[0], delta }, "nemesis").reason, "delta");
  }
});

test("a damage request keeps nothing the sender added beyond the operation", () => {
  const result = narrowApplyRequest(
    { type: "damage", path: DAMAGE_PATHS[0], delta: 3, ownership: { default: 3 }, name: "pwned" },
    "nemesis",
  );
  assert.deepEqual(Object.keys(result.op).sort(), ["delta", "path", "type"]);
});

test("a crit request is accepted only for plain crit items", () => {
  for (const type of CRIT_ITEM_TYPES) {
    assert.equal(narrowApplyRequest({ type: "crit", items: [crit(type)] }, "vehicle").ok, true);
  }

  assert.equal(narrowApplyRequest({ type: "crit", items: [crit("talent")] }, "nemesis").reason, "items");
  assert.equal(narrowApplyRequest({ type: "crit", items: [crit(), crit("weapon")] }, "nemesis").reason, "items");
  assert.equal(narrowApplyRequest({ type: "crit", items: [] }, "nemesis").reason, "items");
  assert.equal(narrowApplyRequest({ type: "crit", items: crit() }, "nemesis").reason, "items");
  assert.equal(narrowApplyRequest({ type: "crit", items: [null] }, "nemesis").reason, "items");
  assert.equal(narrowApplyRequest({ type: "crit", items: [["criticalinjury"]] }, "nemesis").reason, "items");
  assert.equal(narrowApplyRequest({ type: "crit" }, "nemesis").reason, "items");
});

test("only a minion may be killed by a forwarded request", () => {
  assert.deepEqual(narrowApplyRequest({ type: "kill-minion" }, "minion"), { ok: true, op: { type: "kill-minion" } });
  for (const actorType of ["character", "nemesis", "rival", "vehicle", undefined]) {
    assert.equal(narrowApplyRequest({ type: "kill-minion" }, actorType).reason, "not-a-minion");
  }
});

test("an unknown operation is refused outright", () => {
  for (const payload of [{ type: "delete" }, { type: "update" }, {}, null, "damage"]) {
    assert.deepEqual(narrowApplyRequest(payload, "nemesis"), { ok: false, reason: "type" });
  }
});

/* -------------------------------------------------------------------------- */
/*  Authorization                                                             */
/* -------------------------------------------------------------------------- */

test("a request from an unknown or disconnected user is refused", () => {
  assert.deepEqual(isApplyRequestAuthorized(undefined), { ok: false, reason: "requestor" });
  assert.deepEqual(isApplyRequestAuthorized(null), { ok: false, reason: "requestor" });
  assert.deepEqual(isApplyRequestAuthorized({ id: "p1", active: false, isGM: false }), { ok: false, reason: "requestor" });
});

test("any connected user may forward, with or without a chat card behind it", () => {
  // Deliberate: a table is a trusted room, and requiring a card the player
  // authored would break a macro that applies damage without one. What a
  // forwarded request may DO is still narrowed, above.
  assert.deepEqual(isApplyRequestAuthorized({ id: "p1", active: true, isGM: false }), { ok: true });
  assert.deepEqual(isApplyRequestAuthorized({ id: "gm", active: true, isGM: true }), { ok: true });
});
