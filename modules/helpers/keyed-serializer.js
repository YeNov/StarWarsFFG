/**
 * Run async tasks one at a time per key.
 *
 * The GM bridge applies damage as a read-modify-write: read the actor's current
 * wounds, write current + delta. Two requests for the same actor that overlap
 * both read the same starting value and the second write erases the first (5 and
 * 7 against 0 gave 7, not 12). Chaining every task for a key onto the previous
 * one for that key makes the pair compose; different keys still run in parallel.
 *
 * No Foundry dependency -- this is plain promise plumbing, so the interleaving
 * can be reproduced in Node.
 */

/**
 * @returns {{run: function(string, function(): Promise<*>): Promise<*>, pending: function(): number}}
 */
export function createKeyedSerializer() {
  /** key -> a promise that settles when everything queued for that key is done. */
  const tails = new Map();

  /**
   * Queue `task` behind anything already running for `key`.
   * @param {string} key
   * @param {function(): Promise<*>} task
   * @returns {Promise<*>} the task's own result -- a task that throws rejects
   *   only its own caller; the chain carries on.
   */
  function run(key, task) {
    // `.catch` on the predecessor, not `.then`: one task failing must not cancel
    // everything queued behind it.
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(() => task());
    const tail = result.catch(() => {});
    tails.set(key, tail);
    // Drop the key once this task is the last one out, so the map cannot grow
    // without bound over a long session.
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  }

  /** How many keys currently have work queued. Diagnostics and tests. */
  function pending() {
    return tails.size;
  }

  return { run, pending };
}
