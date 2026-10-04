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
  narrowDamageChanges,
  isApplyRequestAuthorized,
  prepareForwardedApply,
  planDamageWrite,
  DAMAGE_PATHS,
  CRIT_ITEM_TYPES,
  DEFENCE_UNAFFORDABLE,
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

test("a minion vehicle group may lose a vehicle to a forwarded request; a plain vehicle may not", () => {
  assert.deepEqual(
    narrowApplyRequest({ type: "kill-minion" }, "vehicle", { minionGroup: true }),
    { ok: true, op: { type: "kill-minion" } },
  );
  assert.equal(narrowApplyRequest({ type: "kill-minion" }, "vehicle", { minionGroup: false }).reason, "not-a-minion");
  assert.equal(narrowApplyRequest({ type: "kill-minion" }, "character", { minionGroup: true }).reason, "not-a-minion");
});

test("the minion vehicle check is made on the resolved target, not the payload", () => {
  const requestor = { id: "p1", active: true, isGM: false };
  const squadron = {
    type: "vehicle",
    flags: { starwarsffg: { config: { minionVehicle: true } } },
    testUserPermission: () => false,
  };
  assert.deepEqual(
    prepareForwardedApply(squadron, { type: "kill-minion", minionGroup: true, path: "x" }, requestor, true),
    { type: "kill-minion" },
  );
  const plain = { ...squadron, flags: {} };
  assert.throws(
    () => prepareForwardedApply(plain, { type: "kill-minion", minionGroup: true }, requestor, true),
    /not-a-minion/,
  );
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

/* -------------------------------------------------------------------------- */
/*  Parry and Reflect: the two-pool form                                      */
/* -------------------------------------------------------------------------- */

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";

/** A 3-strain Parry on a character: 2 wounds after soak, 3 strain paid. */
const talentRequest = (overrides = {}) => ({
  type: "damage",
  changes: [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 3 }],
  defenceCost: { path: STRAIN, delta: 3 },
  ...overrides,
});
const refuse = (data, reason, actorType = "character") =>
  assert.deepEqual(narrowApplyRequest(data, actorType), { ok: false, reason });

test("a two-pool damage request and its cost are accepted and copied clean", () => {
  const result = narrowApplyRequest({ ...talentRequest(), event: "x", gmChat: { content: "x" }, ownership: { default: 3 } }, "character");
  assert.deepEqual(result, {
    ok: true,
    op: { type: "damage", changes: [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 3 }], defenceCost: { path: STRAIN, delta: 3 } },
  });
});

test("the two-pool form needs no talent cost", () => {
  assert.deepEqual(narrowDamageChanges({ type: "damage", changes: [{ path: WOUNDS, delta: 4 }] }, "nemesis"),
    { ok: true, op: { type: "damage", changes: [{ path: WOUNDS, delta: 4 }] } });
});

test("a malformed two-pool request is refused", () => {
  refuse({ type: "damage", changes: [] }, "changes");
  refuse({ type: "damage", changes: [{ path: WOUNDS, delta: 1 }, { path: STRAIN, delta: 1 }, { path: DAMAGE_PATHS[2], delta: 1 }] }, "changes");
  refuse({ type: "damage", changes: [null] }, "changes");
  refuse({ type: "damage", changes: "lots" }, "shape");
  refuse({ type: "damage", changes: [{ path: "system.custom.pool", delta: 1 }] }, "path");
  for (const delta of ["1", null, undefined, NaN, Infinity]) {
    refuse({ type: "damage", changes: [{ path: WOUNDS, delta }] }, "delta");
  }
  refuse({ type: "damage", changes: [{ path: WOUNDS, delta: 1 }, { path: WOUNDS, delta: 2 }] }, "duplicate");
  // The two forms never mix.
  refuse({ ...talentRequest(), path: WOUNDS, delta: 1 }, "shape");
  refuse({ type: "damage", path: WOUNDS, delta: 1, defenceCost: { path: STRAIN, delta: 3 } }, "shape");
});

test("a talent cost must be the target's own pool, 1 to 3, and covered by the changes", () => {
  refuse(talentRequest({ defenceCost: { path: WOUNDS, delta: 3 } }), "defence-cost"); // a character pays strain
  refuse(talentRequest(), "defence-cost", "rival"); // a rival pays wounds
  refuse(talentRequest(), "defence-cost", "vehicle"); // a vehicle pays nothing
  for (const delta of [0, 4, 1.5, "3", null]) {
    refuse(talentRequest({ defenceCost: { path: STRAIN, delta } }), "defence-cost");
  }
  refuse(talentRequest({ defenceCost: [STRAIN, 3] }), "defence-cost");
  refuse(talentRequest({ changes: [{ path: WOUNDS, delta: 2 }] }), "defence-cost"); // not paid at all
  refuse(talentRequest({ changes: [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 2 }] }), "defence-cost"); // short

  // A rival's hit and cost share the wounds entry.
  const merged = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }], defenceCost: { path: WOUNDS, delta: 3 } };
  assert.equal(narrowApplyRequest(merged, "rival").ok, true);
  assert.deepEqual(narrowApplyRequest(merged, "minion"), { ok: false, reason: "defence-cost" });
});

test("a non-owner's talent request reaches the writer narrowed, with its cost intact", () => {
  const requestor = { id: "p1", active: true, isGM: false };
  const actor = { type: "character", testUserPermission: () => false };
  assert.deepEqual(prepareForwardedApply(actor, { ...talentRequest(), event: "x" }, requestor, true), {
    type: "damage", changes: talentRequest().changes, defenceCost: talentRequest().defenceCost,
  });
});

/* -------------------------------------------------------------------------- */
/*  The write, computed inside the writer's queue                             */
/* -------------------------------------------------------------------------- */

const liveActor = ({ type = "character", strain = [7, 10], wounds = [0, 12] } = {}) => ({
  type,
  system: { stats: { strain: { value: strain[0], max: strain[1] }, wounds: { value: wounds[0], max: wounds[1] } } },
});

test("the single form still adds its delta to the live value, unvalidated as before", () => {
  assert.deepEqual(planDamageWrite(liveActor(), { type: "damage", path: WOUNDS, delta: 5 }), { [WOUNDS]: 5 });
  // Owners keep the direct writes they always had.
  assert.deepEqual(planDamageWrite(liveActor(), { type: "damage", path: "system.custom.pool", delta: -3 }), { "system.custom.pool": -3 });
});

test("a talent application writes both pools in one update", () => {
  assert.deepEqual(planDamageWrite(liveActor(), talentRequest()), { [WOUNDS]: 2, [STRAIN]: 10 });
});

test("a cost the target can no longer pay refuses the hit as well", () => {
  assert.throws(() => planDamageWrite(liveActor({ strain: [8, 10] }), talentRequest()),
    { name: "ApplyRequestError", code: DEFENCE_UNAFFORDABLE });
});

test("a merged hit is checked on its cost alone", () => {
  const op = { type: "damage", changes: [{ path: WOUNDS, delta: 7 }], defenceCost: { path: WOUNDS, delta: 3 } };
  // 5 + 3 = 8 is within 10, so the hit may still carry the rival past it.
  assert.deepEqual(planDamageWrite(liveActor({ type: "rival", wounds: [5, 10] }), op), { [WOUNDS]: 12 });
  assert.throws(() => planDamageWrite(liveActor({ type: "rival", wounds: [8, 10] }), op), { code: DEFENCE_UNAFFORDABLE });
});

test("an unknown threshold never refuses", () => {
  assert.deepEqual(planDamageWrite(liveActor({ strain: [9, 0] }), talentRequest()), { [WOUNDS]: 2, [STRAIN]: 12 });
});

test("the writer validates the two-pool form itself, for owners who skip narrowing", () => {
  assert.throws(() => planDamageWrite(liveActor(), talentRequest({ defenceCost: { path: STRAIN, delta: 5 } })),
    { name: "ApplyRequestError", message: "Invalid apply request: defence-cost." });
  assert.throws(() => planDamageWrite(liveActor(), talentRequest({ changes: [{ path: "system.custom.pool", delta: 1 }] })),
    { name: "ApplyRequestError", message: "Invalid apply request: path." });
});
