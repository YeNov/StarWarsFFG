/**
 * The Destiny pool queue must never lose an update.
 *
 * The tracker used to start a new processor for every socket message
 * (`isRunningQueue` was never set to true), and GM flips/rolls wrote the pool
 * directly, outside the queue entirely. Each processor read the pool, then wrote
 * an absolute total, so two overlapping requests both read the same number and
 * one increment vanished. These tests reproduce that interleaving.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DestinyQueue, DESTINY_LIGHT, DESTINY_DARK } from "../../modules/helpers/destiny-queue.js";

/**
 * A settings store whose reads and writes each take a turn of the event loop —
 * the shape that let two processors interleave. `delay` controls how many turns,
 * so a test can force the worst case.
 */
function store(initial = {}, { delay = 1 } = {}) {
  const values = { [DESTINY_LIGHT]: 0, [DESTINY_DARK]: 0, ...initial };
  const tick = async () => { for (let i = 0; i < delay; i++) await Promise.resolve(); };
  const log = [];
  return {
    values,
    log,
    get: async (key) => { await tick(); return values[key]; },
    set: async (key, value) => { await tick(); values[key] = value; log.push([key, value]); return value; },
  };
}

const silent = { debug() {}, warn() {}, error() {} };
const recording = () => {
  const warnings = [];
  const errors = [];
  return { warnings, errors, debug() {}, warn: (...a) => warnings.push(a), error: (...a) => errors.push(a) };
};

const queueOn = (io, logger = silent) => new DestinyQueue({ get: io.get, set: io.set, logger });

test("two concurrent +1 light rolls add up to +2", async () => {
  const io = store({ [DESTINY_LIGHT]: 0 });
  const queue = queueOn(io);

  // Both socket messages land before either processor has finished: each calls
  // submit() without awaiting the other, exactly as the socket handler did.
  await Promise.all([
    queue.submit({ type: "destiny-roll", light: 1, dark: 0, roller: "playerA" }),
    queue.submit({ type: "destiny-roll", light: 1, dark: 0, roller: "playerB" }),
  ]);

  assert.equal(io.values[DESTINY_LIGHT], 2);
  assert.equal(queue.isRunningQueue, false);
  assert.equal(queue.length, 0);
});

test("a flip and a roll that overlap both take effect", async () => {
  const io = store({ [DESTINY_LIGHT]: 1, [DESTINY_DARK]: 1 });
  const queue = queueOn(io);

  await Promise.all([
    queue.submit({ type: "destiny-flip", from: DESTINY_LIGHT, to: DESTINY_DARK, requestedBy: "playerA" }),
    queue.submit({ type: "destiny-roll", light: 2, dark: 0, roller: "playerB" }),
  ]);

  // Flip: light 1 -> 0, dark 1 -> 2. Roll: light +2.
  assert.equal(io.values[DESTINY_LIGHT], 2);
  assert.equal(io.values[DESTINY_DARK], 2);
});

test("a GM adjustment queued while the processor is draining is still applied", async () => {
  const io = store({ [DESTINY_LIGHT]: 0 }, { delay: 2 });
  const queue = queueOn(io);

  const draining = queue.submit({ type: "destiny-roll", light: 1, dark: 0, roller: "playerA" });
  // Arrives mid-drain; the running loop must pick it up rather than start a second one.
  queue.enqueue({ type: "destiny-adjust", pool: DESTINY_LIGHT, delta: 3 });
  const results = await draining;

  assert.equal(io.values[DESTINY_LIGHT], 4);
  assert.equal(results.length, 2);
  assert.equal(queue.length, 0);
});

test("a flip out of an empty pool is refused and changes nothing", async () => {
  const io = store({ [DESTINY_LIGHT]: 0, [DESTINY_DARK]: 3 });
  const logger = recording();
  const queue = queueOn(io, logger);

  const [result] = await queue.submit({ type: "destiny-flip", from: DESTINY_LIGHT, to: DESTINY_DARK });

  assert.equal(result.applied, false);
  assert.equal(result.reason, "empty");
  assert.deepEqual(io.log, []);
  assert.equal(io.values[DESTINY_DARK], 3);
  assert.equal(logger.warnings.length, 1);
});

test("a flip is validated against the pool as it stands when it is processed", async () => {
  // Two players both flip the world's last light point. The first wins; the
  // second is refused instead of driving the pool negative.
  const io = store({ [DESTINY_LIGHT]: 1, [DESTINY_DARK]: 0 });
  const queue = queueOn(io, recording());

  const [first, second] = await Promise.all([
    queue.submit({ type: "destiny-flip", from: DESTINY_LIGHT, to: DESTINY_DARK, requestedBy: "a" }),
    queue.submit({ type: "destiny-flip", from: DESTINY_LIGHT, to: DESTINY_DARK, requestedBy: "b" }),
  ]);

  // The second submit() found a drain already running, so its result comes back
  // on the first one's list.
  const results = [...first, ...second];
  assert.equal(results.filter((r) => r.applied).length, 1);
  assert.equal(results.filter((r) => r.reason === "empty").length, 1);
  assert.equal(io.values[DESTINY_LIGHT], 0);
  assert.equal(io.values[DESTINY_DARK], 1);
});

test("a flip between unknown pools is refused, so no other setting can be written", async () => {
  const io = store();
  const logger = recording();
  const queue = queueOn(io, logger);

  const [result] = await queue.submit({ type: "destiny-flip", from: "campaignDay", to: DESTINY_DARK });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "invalid");
  assert.deepEqual(io.log, []);

  const [same] = await queue.submit({ type: "destiny-flip", from: DESTINY_DARK, to: DESTINY_DARK });
  assert.equal(same.reason, "invalid");
  assert.equal(logger.warnings.length, 2);
});

test("an adjustment is refused for an unknown pool or a non-numeric delta", async () => {
  const io = store();
  const queue = queueOn(io, recording());

  assert.equal((await queue.submit({ type: "destiny-adjust", pool: "dPoolPurple", delta: 1 }))[0].reason, "invalid");
  assert.equal((await queue.submit({ type: "destiny-adjust", pool: DESTINY_LIGHT, delta: "lots" }))[0].reason, "invalid");
  assert.deepEqual(io.log, []);
});

test("an unknown request type is never queued", () => {
  const queue = queueOn(store(), recording());
  assert.equal(queue.enqueue({ type: "destiny-explode" }), false);
  assert.equal(queue.enqueue(null), false);
  assert.equal(queue.length, 0);
});

test("a player may have only one initial destiny roll queued", () => {
  const queue = queueOn(store());
  assert.equal(queue.enqueue({ type: "destiny-roll", light: 1, dark: 0, roller: "playerA" }), true);
  assert.equal(queue.enqueue({ type: "destiny-roll", light: 1, dark: 0, roller: "playerA" }), false);
  assert.equal(queue.enqueue({ type: "destiny-roll", light: 1, dark: 0, roller: "playerB" }), true);
  // A GM's own roll carries no roller and is never de-duplicated against another.
  assert.equal(queue.enqueue({ type: "destiny-roll", light: 1, dark: 0 }), true);
  assert.equal(queue.enqueue({ type: "destiny-roll", light: 1, dark: 0 }), true);
  assert.equal(queue.length, 4);
});

test("a roll marks the roller, and a GM roll marks nobody", async () => {
  const io = store();
  const queue = queueOn(io);
  await queue.submit({ type: "destiny-roll", light: 1, dark: 1, roller: "playerA" });
  assert.equal(io.values["destinyrollersplayerA"], true);

  const gm = store();
  await queueOn(gm).submit({ type: "destiny-roll", light: 1, dark: 0 });
  assert.deepEqual(gm.log.map(([key]) => key), [DESTINY_LIGHT, DESTINY_DARK]);
});

test("a failure to mark the roller does not cost the pool its points", async () => {
  const io = store();
  const failing = {
    get: io.get,
    set: async (key, value) => {
      if (key.startsWith("destinyrollers")) throw new Error("setting not registered");
      return io.set(key, value);
    },
  };
  const logger = recording();
  const queue = new DestinyQueue({ ...failing, logger });

  const [result] = await queue.submit({ type: "destiny-roll", light: 2, dark: 1, roller: "playerA" });
  assert.equal(result.applied, true);
  assert.equal(io.values[DESTINY_LIGHT], 2);
  assert.equal(io.values[DESTINY_DARK], 1);
  assert.equal(logger.warnings.length, 1);
});

test("a failed write is logged and the queue keeps going", async () => {
  const io = store();
  let fail = true;
  const logger = recording();
  const queue = new DestinyQueue({
    get: io.get,
    set: async (key, value) => {
      if (fail) { fail = false; throw new Error("no GM connection"); }
      return io.set(key, value);
    },
    logger,
  });

  queue.enqueue({ type: "destiny-adjust", pool: DESTINY_LIGHT, delta: 1 });
  queue.enqueue({ type: "destiny-adjust", pool: DESTINY_LIGHT, delta: 5 });
  const results = await queue.drain();

  assert.equal(results[0].reason, "error");
  assert.equal(results[1].applied, true);
  assert.equal(io.values[DESTINY_LIGHT], 5);
  assert.equal(logger.errors.length, 1);
  assert.equal(queue.isRunningQueue, false);
});
