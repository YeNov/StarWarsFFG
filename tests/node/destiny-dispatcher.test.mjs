import test from "node:test";
import assert from "node:assert/strict";
import { createDestinyDispatcher } from "../../modules/helpers/destiny-dispatcher.js";
import { DestinyQueue, DESTINY_LIGHT, DESTINY_DARK } from "../../modules/helpers/destiny-queue.js";

const flip = { type: "destiny-flip", from: DESTINY_LIGHT, to: DESTINY_DARK };
const adjust = (delta) => ({ type: "destiny-adjust", pool: DESTINY_LIGHT, delta });
const roll = { type: "destiny-roll", light: 2, dark: 1 };

/** Exercise real dispatchers/queues with injected settings and transport. */
function table(initialLight = 1) {
  const users = [{ id: "gmA", isGM: true }, { id: "gmB", isGM: true }, { id: "player", isGM: false }];
  let activeGM = users[0];
  const values = { [DESTINY_LIGHT]: initialLight, [DESTINY_DARK]: 0 };
  const writes = [];
  const results = [];
  const sent = [];
  const deliveries = [];
  const warnings = [];
  const dispatchers = new Map();
  for (const user of users) {
    const queue = new DestinyQueue({
      get: async (key) => { await Promise.resolve(); return values[key]; },
      set: async (key, value) => { await Promise.resolve(); writes.push({ writer: user.id, key, value }); values[key] = value; },
      onResult: async (result) => { results.push({ writer: user.id, ...result }); },
    });
    dispatchers.set(user.id, createDestinyDispatcher({
      getUser: () => user, getActiveGM: () => activeGM,
      findUser: (id) => users.find((u) => u.id === id), queue,
      onNoGM: () => warnings.push(user.id),
      send(data) {
        sent.push({ sender: user.id, data });
        for (const [id, dispatcher] of dispatchers) {
          if (id !== user.id) deliveries.push(dispatcher.receive(structuredClone(data), user.id));
        }
      },
    }));
  }
  return { values, writes, results, sent, warnings,
    submit: (id, request) => dispatchers.get(id).submit(request),
    receive: (id, data, sender) => dispatchers.get(id).receive(data, sender),
    delivered: () => Promise.all(deliveries),
    setActiveGM: (id) => { activeGM = users.find((u) => u.id === id); },
  };
}

for (const [name, request, expectedLight, expectedDark] of [
  ["flip", flip, 0, 2],
  ["add", adjust(1), 2, 0],
  ["remove", adjust(-1), 0, 0],
  ["roll", roll, 4, 2],
]) {
  test(`two GMs' simultaneous ${name} actions share the active GM's writer`, async () => {
    const initial = name === "flip" || name === "remove" ? 2 : 0;
    const t = table(initial);
    await Promise.all([t.submit("gmA", request), t.submit("gmB", request)]);
    await t.delivered();
    assert.equal(t.values[DESTINY_LIGHT], expectedLight);
    assert.equal(t.values[DESTINY_DARK], expectedDark);
    assert.ok(t.writes.every((w) => w.writer === "gmA"));
    assert.deepEqual(t.results.map((r) => r.request.requestedBy).sort(), ["gmA", "gmB"]);
    assert.equal(t.sent.length, 1); // The active GM does not depend on socket echo.
    assert.equal(Object.keys(t.values).some((key) => key.startsWith("destinyrollers")), false);
  });
}

test("overlapping player flip, active-GM roll and second-GM adjustment all compose", async () => {
  const t = table();
  await Promise.all([t.submit("player", flip), t.submit("gmA", roll), t.submit("gmB", adjust(1))]);
  await t.delivered();
  assert.equal(t.values[DESTINY_LIGHT], 3);
  assert.equal(t.values[DESTINY_DARK], 2);
  assert.equal(t.results.length, 3);
  assert.ok(t.results.every((r) => r.applied && r.writer === "gmA"));
});

test("a player cannot use the new forwarding path for GM adjustments or GM rolls", async () => {
  const t = table();
  assert.equal(await t.submit("player", adjust(1)), false);
  assert.equal(await t.submit("player", roll), false);
  await t.receive("gmA", { destinyRequest: adjust(1) }, "player");
  await t.receive("gmA", { destinyRequest: roll }, "player");
  await t.receive("gmA", { destinyRequest: flip }, "unknown");
  assert.equal(t.writes.length, 0);
  assert.equal(t.sent.length, 0);
});

test("forwarded attribution comes from the sender and flips still need no chat card", async () => {
  const t = table();
  await t.receive("gmA", { destinyRequest: { ...flip, requestedBy: "gmB" } }, "player");
  assert.equal(t.results[0].request.requestedBy, "player");
  assert.equal(t.results[0].applied, true);
});

test("legacy flips use the dispatcher policy, authenticated attribution and queue validation", async () => {
  const t = table();
  const data = { destinyFlip: { from: DESTINY_LIGHT, to: DESTINY_DARK, requestedBy: "gmB" } };
  await t.receive("gmA", data, undefined);
  assert.equal(t.writes.length, 0);
  await t.receive("gmA", data, "player");
  assert.equal(t.results[0].request.requestedBy, "player");
  assert.equal(t.results[0].applied, true);
  await t.receive("gmA", data, "player");
  assert.equal(t.results[1].reason, "empty");
  await t.receive("gmA", { destinyFlip: { from: "campaignDay", to: DESTINY_DARK } }, "player");
  assert.equal(t.results[2].reason, "invalid");
  assert.equal(t.values[DESTINY_DARK], 1);
});

test("no active GM warns without writing; subsequent actions use the new active GM", async () => {
  const t = table();
  t.setActiveGM(undefined);
  assert.equal(await t.submit("player", flip), false);
  assert.deepEqual(t.warnings, ["player"]);
  assert.equal(t.writes.length, 0);
  t.setActiveGM("gmB");
  await t.submit("gmA", flip);
  await t.delivered();
  assert.ok(t.writes.every((w) => w.writer === "gmB"));
  assert.equal(t.values[DESTINY_LIGHT], 0);
  assert.equal(t.values[DESTINY_DARK], 1);
});
