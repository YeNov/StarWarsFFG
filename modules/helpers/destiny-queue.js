/**
 * The Destiny pool's serialized request queue.
 *
 * Every change to the light/dark pool is a read-modify-write on two world
 * settings, and they all land on ONE client -- the active GM. The tracker used
 * to start a fresh processor for every incoming socket message (`isRunningQueue`
 * was initialised to false, reset to false at the end, and never set to true),
 * so two requests overlapped: both read the same total, both wrote an absolute
 * value, and one of them was lost. GM flips and GM rolls bypassed the queue
 * entirely and raced it.
 *
 * This module owns the whole protocol, with no Foundry dependency: settings
 * access is injected, so the interleavings can be reproduced in Node.
 *
 * Requests
 * --------
 *   { type: "destiny-roll",   light, dark, roller? }   add a rolled result
 *   { type: "destiny-flip",   from, to, requestedBy? } move ONE point across
 *   { type: "destiny-adjust", pool, delta }            GM add/remove
 *   { type: "destiny-reset",  requestedBy? }           GM: empty both pools
 *
 * A flip is an INTENTION, not a pair of totals. The client used to compute the
 * replacement totals from what it could see and send those; the GM turned them
 * back into a delta against its own reading, which is wrong the moment anything
 * else has moved in between. The processor now validates `from` against the
 * pool as it stands when the request is actually handled, and refuses a flip
 * out of an empty pool.
 */

export const DESTINY_LIGHT = "dPoolLight";
export const DESTINY_DARK = "dPoolDark";

/** The two world settings that hold the pool. Nothing else may be written. */
export const DESTINY_POOLS = Object.freeze([DESTINY_LIGHT, DESTINY_DARK]);

const REQUEST_TYPES = Object.freeze(["destiny-roll", "destiny-flip", "destiny-adjust", "destiny-reset"]);

/** A number, or 0 for anything that is not one. */
function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class DestinyQueue {
  /**
   * @param {object} io
   * @param {function(string): (number|Promise<number>)} io.get   Read a world setting.
   * @param {function(string, *): Promise<*>} io.set              Write a world setting.
   * @param {object} [io.logger]  CONFIG.logger, or any {debug,warn,error} sink.
   * @param {function(object): Promise<void>} [io.onResult] Called once per processed
   *   request, including refusals/errors, regardless of which caller drains it.
   */
  constructor({ get, set, logger, onResult } = {}) {
    this.requests = [];
    this.isRunningQueue = false;
    this._get = get;
    this._set = set;
    this._logger = logger ?? { debug() {}, warn() {}, error() {} };
    this._onResult = onResult;
  }

  /** How many requests are waiting. */
  get length() {
    return this.requests.length;
  }

  /**
   * Queue one request.
   *
   * The only de-duplication is the original one worth keeping: a player may have
   * exactly one un-processed initial destiny roll in flight. (The old flip
   * de-duplication matched `args[0].destiny`, which is undefined for a flip, so
   * it never matched anything -- and two players each flipping a point are two
   * legitimate requests anyway.)
   * @param {object} request
   * @returns {boolean} whether it was accepted.
   */
  enqueue(request) {
    if (!request || !REQUEST_TYPES.includes(request.type)) {
      this._logger.warn?.("Destiny queue: refused an unknown request", request);
      return false;
    }
    if (request.type === "destiny-roll" && request.roller) {
      if (this.requests.some((q) => q.type === "destiny-roll" && q.roller === request.roller)) return false;
    }
    this.requests.push(request);
    return true;
  }

  /**
   * Process everything queued, one request at a time, and keep going for
   * anything that arrives while we are working.
   *
   * The lock is taken synchronously, BEFORE the first await, so a second caller
   * in the same tick cannot start a parallel processor; it is released in a
   * `finally` so a thrown request can never wedge the queue shut.
   * @returns {Promise<object[]>} one result per request processed
   *   (`{request, applied, reason?}`), or [] if another drain is already running.
   */
  async drain() {
    if (this.isRunningQueue) return [];
    this.isRunningQueue = true;
    const results = [];
    try {
      while (this.requests.length > 0) {
        const request = this.requests.shift();
        this._logger.debug?.(`Processing Destiny Request (${request.type})`, request);
        let result;
        try {
          result = await this._process(request);
        } catch (err) {
          this._logger.error?.("Destiny queue: a request failed and was dropped", { request, err });
          result = { request, applied: false, reason: "error", error: err };
        }
        results.push(result);
        try {
          await this._onResult?.(result);
        } catch (err) {
          // Announcement failure must not retry a persisted mutation, turn it
          // into a failed write, or prevent later results from being delivered.
          this._logger.error?.("Destiny queue: could not announce a result", { request, err });
        }
      }
    } finally {
      this.isRunningQueue = false;
    }
    return results;
  }

  /** Queue a request and process the backlog. */
  async submit(request) {
    if (!this.enqueue(request)) return [];
    return this.drain();
  }

  /** Read a pool as a number. */
  async _read(pool) {
    return count(await this._get(pool));
  }

  /**
   * Apply one request. Every read happens at processing time and every write is
   * awaited, so consecutive requests compose instead of clobbering each other.
   */
  async _process(request) {
    switch (request.type) {
      case "destiny-roll": {
        // The per-player "has rolled" marker is a client-scoped setting registered
        // on demand elsewhere; a failure to stamp it must not cost the pool its
        // points, so it is logged and stepped over.
        if (request.roller) {
          try {
            await this._set(`destinyrollers${request.roller}`, true);
          } catch (err) {
            this._logger.warn?.(`Destiny queue: could not mark ${request.roller} as having rolled`, err);
          }
        }
        const light = await this._read(DESTINY_LIGHT);
        await this._set(DESTINY_LIGHT, light + count(request.light));
        const dark = await this._read(DESTINY_DARK);
        await this._set(DESTINY_DARK, dark + count(request.dark));
        return { request, applied: true, pool: { light: light + count(request.light), dark: dark + count(request.dark) } };
      }

      case "destiny-flip": {
        const { from, to } = request;
        if (!DESTINY_POOLS.includes(from) || !DESTINY_POOLS.includes(to) || from === to) {
          this._logger.warn?.("Destiny queue: refused a flip between unknown pools", request);
          return { request, applied: false, reason: "invalid" };
        }
        const available = await this._read(from);
        if (available <= 0) {
          this._logger.warn?.(`Destiny queue: refused a flip from ${from}; the pool is empty`, request);
          return { request, applied: false, reason: "empty" };
        }
        await this._set(from, available - 1);
        const target = await this._read(to);
        await this._set(to, target + 1);
        return { request, applied: true, pool: await this._pools() };
      }

      case "destiny-adjust": {
        const { pool, delta } = request;
        if (!DESTINY_POOLS.includes(pool) || !Number.isFinite(Number(delta))) {
          this._logger.warn?.("Destiny queue: refused an adjustment", request);
          return { request, applied: false, reason: "invalid" };
        }
        const current = await this._read(pool);
        await this._set(pool, current + Number(delta));
        return { request, applied: true, pool: await this._pools() };
      }

      case "destiny-reset": {
        // Absolute, and applied in queue order: whatever was queued ahead of the reset is
        // cleared with it, whatever arrives behind it adds to an empty pool.
        await this._set(DESTINY_LIGHT, 0);
        await this._set(DESTINY_DARK, 0);
        return { request, applied: true, pool: { light: 0, dark: 0 } };
      }

      default:
        return { request, applied: false, reason: "invalid" };
    }
  }

  /** Both pools, after the write. */
  async _pools() {
    return { light: await this._read(DESTINY_LIGHT), dark: await this._read(DESTINY_DARK) };
  }
}
