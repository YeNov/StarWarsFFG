/**
 * Waiting helpers for the in-Foundry functional suites: observe completion instead of sleeping.
 *
 * For a race that a test must control (hold one write open while others queue), use a plain
 * `Promise.withResolvers()` and release it from the test.
 */

/**
 * Polls `predicate` until it returns a truthy value, and resolves with that value.
 * A predicate that throws counts as "not yet"; its last error becomes the timeout error's cause.
 * @param {() => any} predicate               May be async.
 * @param {object} [options]
 * @param {number} [options.timeout=5000]     Milliseconds before giving up.
 * @param {number} [options.interval=20]      Milliseconds between polls.
 * @param {string} [options.message]          What is awaited, for the timeout message.
 * @returns {Promise<any>}
 */
export async function waitFor(predicate, { timeout = 5000, interval = 20, message = "condition" } = {}) {
  const deadline = performance.now() + timeout;
  let lastError;
  for (;;) {
    try {
      const value = await predicate();
      if (value) return value;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (performance.now() >= deadline) {
      throw new Error(`waitFor timed out after ${timeout} ms: ${message}`, { cause: lastError });
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Resolves with the arguments of the next `hook` call that `filter` accepts. Call it BEFORE the
 * action that fires the hook:
 *
 *   const updated = waitForHook("updateActor", (actor) => actor.id === hero.id);
 *   await sheet.submit();
 *   const [, changes] = await updated;
 *
 * @param {string} hook
 * @param {(...args: any[]) => boolean} [filter]
 * @param {object} [options]
 * @param {number} [options.timeout=5000]
 * @returns {Promise<any[]>}
 */
export function waitForHook(hook, filter = () => true, { timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      Hooks.off(hook, id);
      reject(new Error(`waitForHook timed out after ${timeout} ms: ${hook}`));
    }, timeout);
    const id = Hooks.on(hook, (...args) => {
      let matched = false;
      try {
        matched = filter(...args);
      } catch {
        matched = false;
      }
      if (!matched) return;
      clearTimeout(timer);
      Hooks.off(hook, id);
      resolve(args);
    });
  });
}
