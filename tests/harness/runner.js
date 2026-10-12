/**
 * The functional-test runner: registers the in-Foundry Mocha suites, runs them in a dedicated
 * test world, cleans up the run's fixtures, checks the world for leaks, and returns one
 * JSON-serialisable result. Its interface is documented in tests/ffg-tests.js, which calls it.
 */

import "../../node_modules/mocha/mocha.js";
import "../../node_modules/chai/chai.js";
import { FixtureTracker } from "./fixtures.js";
import { waitFor, waitForHook } from "./wait.js";
import { captureWorldState, closeWindows, findLeaks, findStaleFixtures } from "./world-state.js";

/** Packages add their suites by pushing onto the array this hook passes. */
export const PACKAGE_SUITES_HOOK = "starwarsffg.functionalTests";

const { Mocha, chai } = globalThis;
const SKIP_REASON = Symbol("ffgSkipReason");
let running = false;

/**
 * Skips the current test with a reason that the result reports. Inside a hook, it skips the
 * hook's tests and the reason applies to all of them.
 * @param {object} context  `this` of the test or hook function.
 * @param {string} reason
 */
function skip(context, reason) {
  const runnable = context.test;
  if (runnable?.type === "hook") runnable.parent[SKIP_REASON] = reason;
  else if (runnable) runnable[SKIP_REASON] = reason;
  context.skip();
}

function skipReason(test) {
  if (test[SKIP_REASON]) return test[SKIP_REASON];
  for (let suite = test.parent; suite; suite = suite.parent) {
    if (suite[SKIP_REASON]) return suite[SKIP_REASON];
  }
  return test.fn ? "skipped without a reason" : "declared without a test function";
}

const errorRecord = (error) => ({ message: String(error?.message ?? error), stack: error?.stack ?? null });

function describeRunnable(runnable, state, error = null) {
  return {
    title: runnable.fullTitle(),
    path: runnable.titlePath(),
    type: runnable.type,
    state,
    durationMs: runnable.duration ?? null,
    error: error ? errorRecord(error) : null,
    pendingReason: state === "pending" ? skipReason(runnable) : null,
  };
}

function describeRun({ runId, grep, invert, allowedWorlds, fixtures }) {
  return {
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    system: { id: game.system?.id ?? null, version: game.system?.version ?? null },
    foundry: { version: game.release?.version ?? null, generation: game.release?.generation ?? null, build: game.release?.build ?? null },
    world: { id: game.world?.id ?? null, title: game.world?.title ?? null },
    user: { id: game.user?.id ?? null, name: game.user?.name ?? null, isGM: Boolean(game.user?.isGM) },
    browser: navigator.userAgent,
    modules: (game.modules?.filter((module) => module.active) ?? []).map((module) => ({ id: module.id, version: module.version })),
    packageSuites: [],
    selection: { grep: grep ? String(grep) : null, invert: Boolean(invert) },
    allowedWorlds,
    fixturePrefix: fixtures.prefix,
    staleFixtures: game.ready ? findStaleFixtures() : [],
  };
}

/** Why this page must not run the suites, or null. */
function refusal(allowedWorlds) {
  if (running) return "another functional run is in progress in this page";
  if (!game.ready) return "the game is not ready";
  if (!game.user?.isGM) return `user "${game.user?.name}" is not a GM; the functional tests need a GM session`;
  if (!allowedWorlds.includes(game.world.id)) {
    return `world "${game.world.id}" is not in the test-world allowlist (${allowedWorlds.join(", ") || "empty"}); `
      + "the functional tests run only in a dedicated test world";
  }
  return null;
}

/** Setup problems that make a result untrustworthy, as Foundry itself reports them. */
function environmentProblems() {
  const issue = game.issues?.usabilityIssues?.browserVersionIncompatible;
  if (!issue) return [];
  const { browser, version, minimum } = issue.params ?? {};
  return [{
    kind: "environment",
    message: `Foundry ${game.release.version} does not support ${browser} ${version} (it needs ${minimum} or newer); `
      + "see tests/README.md, \"Browser\"",
  }];
}

async function registerSystemSuites(systemSuites, root, harness, result) {
  for (const [exportName, load] of systemSuites) {
    try {
      const register = (await load())[exportName];
      if (typeof register !== "function") throw new Error(`the suite module does not export ${exportName}`);
      await register(root, Mocha.Suite, Mocha.Test, chai, harness);
    } catch (error) {
      result.registrationErrors.push({ source: `system:${exportName}`, ...errorRecord(error) });
    }
  }
}

/**
 * Collects package suites through the hook. An entry is `{id, register}` or a bare register
 * function. A hook callback that throws, and a register function that throws, are both
 * registration errors.
 */
async function registerPackageSuites(root, harness, result) {
  const entries = [];
  const hookErrors = [];
  const errorHook = Hooks.on("error", (location, error, data) => {
    if (data?.hook === PACKAGE_SUITES_HOOK) hookErrors.push(error);
  });
  try {
    Hooks.callAll(PACKAGE_SUITES_HOOK, entries);
  } finally {
    Hooks.off("error", errorHook);
  }
  for (const error of hookErrors) result.registrationErrors.push({ source: `package:${PACKAGE_SUITES_HOOK}`, ...errorRecord(error) });

  for (const [index, entry] of entries.entries()) {
    const id = (typeof entry === "function" ? null : entry?.id) ?? `package-entry-${index + 1}`;
    const register = typeof entry === "function" ? entry : entry?.register;
    const record = { id, registered: false };
    result.meta.packageSuites.push(record);
    try {
      if (typeof register !== "function") throw new Error("the hook entry has no register function");
      await register(root, Mocha.Suite, Mocha.Test, chai, harness);
      record.registered = true;
    } catch (error) {
      record.error = String(error?.message ?? error);
      result.registrationErrors.push({ source: `package:${id}`, ...errorRecord(error) });
    }
  }
}

function runMocha(mocha, tests) {
  return new Promise((resolve) => {
    const runner = mocha.run(() => resolve());
    runner.on("pass", (test) => tests.push(describeRunnable(test, "passed")));
    runner.on("fail", (runnable, error) => tests.push(describeRunnable(runnable, "failed", error)));
    runner.on("pending", (test) => tests.push(describeRunnable(test, "pending")));
  });
}

function finish(result, startedAt) {
  const count = (state) => result.tests.filter((test) => test.state === state).length;
  result.stats = {
    tests: result.tests.length,
    passes: count("passed"),
    failures: count("failed"),
    pending: count("pending"),
    registrationErrors: result.registrationErrors.length,
    leaks: result.leaks.length,
    problems: result.problems.length,
  };
  result.ok = result.stats.tests > 0 && result.stats.failures === 0 && result.stats.registrationErrors === 0
    && result.stats.leaks === 0 && result.stats.problems === 0;
  result.meta.finishedAt = new Date().toISOString();
  result.meta.durationMs = Math.round(performance.now() - startedAt);
  return result;
}

/**
 * Runs the suites. See tests/ffg-tests.js for the options and the result shape.
 * @param {Array<[string, () => Promise<object>]>} systemSuites  [export name, module loader] pairs.
 * @param {object} [options]
 */
export async function runSuites(systemSuites, options = {}) {
  const startedAt = performance.now();
  const { grep = null, invert = false, timeout = 60_000 } = options;
  const allowedWorlds = [].concat(options.allowedWorlds ?? ["test"]).map(String);
  const runId = String(options.runId ?? foundry.utils.randomID(8));
  const fixtures = new FixtureTracker(runId);
  const result = {
    ok: false,
    meta: describeRun({ runId, grep, invert, allowedWorlds, fixtures }),
    stats: null,
    tests: [],
    registrationErrors: [],
    leaks: [],
    problems: [],
  };

  const refused = refusal(allowedWorlds);
  if (refused) {
    result.problems.push({ kind: "guard", message: refused });
    return finish(result, startedAt);
  }

  running = true;
  const before = captureWorldState();
  try {
    result.problems.push(...environmentProblems());
    const mocha = new Mocha({ reporter: Mocha.reporters.Base, timeout });
    if (grep) mocha.grep(grep);
    if (grep && invert) mocha.invert();
    const root = mocha.suite;
    root.beforeEach("open the test's fixture scope", () => fixtures.beginTest());
    root.afterEach("clean up the test's fixtures", () => fixtures.endTest());
    const harness = Object.freeze({ runId, fixtures, waitFor, waitForHook, skip });

    await registerSystemSuites(systemSuites, root, harness, result);
    await registerPackageSuites(root, harness, result);
    await runMocha(mocha, result.tests);
    if (!result.tests.length) {
      result.problems.push({ kind: "selection", message: grep ? `no test matched grep ${grep}` : "no test was registered" });
    }
  } catch (error) {
    result.problems.push({ kind: "runner", ...errorRecord(error) });
  } finally {
    await fixtures.cleanup();
    for (const error of fixtures.errors) result.problems.push({ kind: "cleanup", ...error });
    const { leaks, windows } = findLeaks(before, fixtures);
    result.leaks.push(...leaks);
    await closeWindows(windows);
    running = false;
  }
  return finish(result, startedAt);
}
