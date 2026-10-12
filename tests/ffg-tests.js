/**
 * Star Wars FFG functional tests: Mocha suites that run inside Foundry, in a dedicated test world.
 *
 * Normally Playwright runs them (`npm run test:foundry`, see tests/README.md). By hand, from the
 * browser console of a GM session in the test world:
 *
 *   const tests = await import("/systems/starwarsffg/tests/ffg-tests.js");
 *   const result = await tests.runFunctionalTests({ grep: "Talent Tree" });  // the JSON result
 *   new tests.default({ grep: "Talent Tree" }).render(true);                  // or a results window
 *
 * runFunctionalTests(options) -> Promise<FunctionalTestResult>
 *   options.grep           Mocha grep over full test titles: a string (a regular expression source,
 *                          or "/source/flags") or a RegExp. Default: every test.
 *   options.invert         Run the tests that do NOT match grep.
 *   options.allowedWorlds  Worlds the run may touch. Default ["test"]. Any other world is refused,
 *                          as is a non-GM user.
 *   options.runId          Id used in fixture names. Default: random.
 *   options.timeout        Per-test timeout in milliseconds. Default 60000.
 *
 * FunctionalTestResult, JSON-serialisable:
 *   ok                    True only when at least one test ran, none failed, and there is no
 *                         registration error, leak or problem. Pending tests do not fail a run.
 *   meta                  runId, startedAt, finishedAt, durationMs, system {id, version},
 *                         foundry {version, generation, build}, world {id, title}, user {id, name,
 *                         isGM}, browser (user agent), modules [{id, version}] (active ones),
 *                         packageSuites [{id, registered, error?}], selection {grep, invert},
 *                         allowedWorlds, fixturePrefix, staleFixtures [{documentName, id, name}]
 *                         (fixture-named documents left by an earlier, aborted run).
 *   stats                 Counts: tests, passes, failures, pending, registrationErrors, leaks, problems.
 *   tests[]               {title, path[], type: "test"|"hook", state: "passed"|"failed"|"pending",
 *                         durationMs, error: {message, stack}|null, pendingReason: string|null}.
 *                         A failing hook is listed as a failed entry of type "hook".
 *   registrationErrors[]  {source: "system:<export>"|"package:<id>", message, stack}: a suite module
 *                         that failed to load, or a register function that threw.
 *   leaks[]               {kind, message, ...}: what the run left behind after fixture cleanup.
 *                         Kinds: document-created, document-deleted, document-modified (a document
 *                         that existed before the run), setting-changed (a world-stored setting),
 *                         window-open (windows are closed once reported).
 *   problems[]            {kind, message}: guard (refused: wrong world, not a GM, a run already in
 *                         progress), environment (Foundry reports the browser unsupported),
 *                         selection (no test ran), cleanup (a fixture could not be removed), runner.
 *
 * A suite is a register function, listed in SYSTEM_SUITES below or added by a package through the
 * "starwarsffg.functionalTests" hook (push `{id, register}` onto the array it passes), and called as
 *
 *   register(rootSuite, Mocha.Suite, Mocha.Test, chai, harness)
 *
 * harness = { runId, fixtures, waitFor, waitForHook, skip }
 *   fixtures            The run's FixtureTracker (harness/fixtures.js). Create every world document
 *                       through it: create(documentName, data), track(doc), setting(ns, key, value),
 *                       name(label), prefix. A test's fixtures are removed right after it, pass or
 *                       fail.
 *   waitFor(predicate, {timeout, interval, message})   Poll until truthy (harness/wait.js).
 *   waitForHook(hook, filter, {timeout})                The next matching hook call (harness/wait.js).
 *   skip(this, reason)  Skip the current test, or a hook's tests, and report why. Use it when
 *                       required setup is missing: a test must never pass without its setup.
 */

import { runSuites } from "./harness/runner.js";

/** [export name, module loader] of every system suite. A loader that fails is a registration error. */
const SYSTEM_SUITES = [
  ["HelpersTests", () => import("./common.test.js")],
  ["ModifiersTests", () => import("./modifiers.test.js")],
  ["ReplaceDieTests", () => import("./replace-die.test.js")],
  ["TalentTreeTests", () => import("./talent-tree.test.js")],
  ["SheetTabCacheTests", () => import("./v2-migration/sheet-tab-cache.test.js")],
  ["FormSubmitCoalesceTests", () => import("./v2-migration/form-submit-coalesce.test.js")],
  ["SheetInitialSizeTests", () => import("./v2-migration/sheet-initial-size.test.js")],
  ["SheetSkillDataTests", () => import("./v2-migration/sheet-skill-data.test.js")],
  ["MinimizedCloseTests", () => import("./v2-migration/minimized-close.test.js")],
  ["CritTraumaCounterTests", () => import("./crit-trauma-counter.test.js")],
];

/**
 * Runs the functional suites and returns the JSON result described above.
 * @param {object} [options]
 */
export function runFunctionalTests(options = {}) {
  return runSuites(SYSTEM_SUITES, options);
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A window for a manual run: it runs the suites once when first rendered and shows the result.
 * Constructor options `grep`, `invert` and `allowedWorlds` are passed to runFunctionalTests.
 */
export default class FFGFunctionalTests extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "ffg-functional-tests"],
    window: { title: "Functional Tests", resizable: true },
    position: { width: 720, height: 640 },
  };

  static PARTS = {
    main: { template: "systems/starwarsffg/templates/ffg-tester.html", scrollable: [""] },
  };

  /** @type {Promise<object>|null} */
  #run = null;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { grep, invert, allowedWorlds } = this.options;
    this.#run ??= runFunctionalTests({ grep, invert, allowedWorlds });
    const result = await this.#run;
    return {
      ...context,
      result,
      failed: result.tests.filter((test) => test.state === "failed"),
      pending: result.tests.filter((test) => test.state === "pending"),
    };
  }
}
