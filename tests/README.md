# Tests

The project has two test tiers.

| Tier | What it runs | Where | Command |
| --- | --- | --- | --- |
| Node | `tests/node/**/*.test.mjs`, `codex/tests/node/**/*.test.mjs`, and the import gate | CI on every push, or locally | `npm test` and `npm run check:imports` |
| Foundry | The in-Foundry Mocha suites (`tests/ffg-tests.js`) and the Playwright specs in `e2e/` | Locally, against a dedicated Foundry test world | `npm run test:foundry` |

## Node tier

Plain `node --test` against a small Foundry stub. It needs `node_modules` on disk (`npm ci`) and
nothing else. A test that needs real documents, sheets, sockets or the DOM belongs in the Foundry
tier.

## Foundry tier

Playwright starts Foundry on a test world, joins it as the GM, runs the specs in `e2e/`, and stops
Foundry again. `e2e/functional.spec.js` runs every in-Foundry Mocha suite as one Playwright test
and fails on any failed case, registration error, leak or uncaught page error.

### Setup

Set these environment variables. Never commit their values.

| Variable | Meaning | Default |
| --- | --- | --- |
| `FVTT_APP` | Foundry's application folder, the one holding `main.js` (`<fvtt-install>/resources/app`) | required to start Foundry |
| `FVTT_DATA` | Foundry's user data folder, the one holding `Data/` and `Config/` | required to start Foundry |
| `FVTT_WORLD` | World to start | `test` |
| `FVTT_TEST_WORLDS` | Comma-separated allowlist of worlds the tests may touch | `test` |
| `FVTT_PORT` | Port Foundry serves on | `30000` |
| `PLAYWRIGHT_BASE_URL` | Address of the Foundry to test | `http://127.0.0.1:<FVTT_PORT>` |
| `PLAYWRIGHT_CHANNEL` | Browser channel, e.g. `chrome` for the installed Google Chrome (see "Browser") | Playwright's Chromium |
| `FFG_TEST_GREP` | Mocha grep (a regular expression over full test titles) selecting functional tests | every test |

The test world needs a GM user named `Gamemaster` without a password. Create it once as a world
of its own; never point the tests at a campaign world.

### Running

```sh
npm run test:foundry                          # every spec
npm run test:foundry -- functional            # only the in-Foundry suites
FFG_TEST_GREP="Talent Tree" npm run test:foundry -- functional
```

The terminal shows each spec's result and a summary of the functional run. The HTML report
(`npx playwright show-report`) holds the full functional result as the attachment
`functional-result.json`, which is also written under `test-results/`.

`tools/foundry-test-server.mjs` starts Foundry (Playwright runs it as its `webServer`). When the
port already serves the test world, Playwright reuses that server, so to keep one Foundry across
several runs start it yourself and stop it with Ctrl+C:

```sh
node tools/foundry-test-server.mjs
```

The launcher:

- refuses a world outside `FVTT_TEST_WORLDS`, and a port that already serves another world or a
  Foundry without an active world;
- always passes `--noupnp`, so Foundry never asks the router to open ports;
- removes `Config/options.json.lock` only when it is an empty directory that no running Foundry
  refreshes and the port is free. Playwright stops its server with a forced kill on Windows, which
  leaves that empty directory behind; the next start clears it after about 15 seconds;
- stops only the Foundry it started.

### Safety: the world allowlist

The allowlist is checked three times: by the launcher, by Playwright's global setup before it joins
(also when it reuses a running server), and by the in-Foundry runner, which refuses (`guard`
problem) a world outside `allowedWorlds` or a user who is not a GM.

### Browser

Foundry V14 needs Chromium 146 or newer. Playwright 1.56's own Chromium is 141: Foundry then warns
that the browser is unsupported, and the functional run reports an `environment` problem and fails.
Use the installed Google Chrome with `PLAYWRIGHT_CHANNEL=chrome`, or a Playwright release with a
newer Chromium.

## The functional runner

`tests/ffg-tests.js` is the entry point. Its header documents the interface in full:

```js
const { runFunctionalTests } = await import("/systems/starwarsffg/tests/ffg-tests.js");
const result = await runFunctionalTests({ grep, invert, allowedWorlds, runId, timeout });
```

From the console of a GM session in the test world, `new (await import(...)).default().render(true)`
opens a window that runs the suites and shows the result.

The result is JSON:

- `ok`: true only when at least one test ran, none failed, and there was no registration error,
  leak or problem.
- `meta`: system id and version, Foundry version and build, world, user, browser, active modules,
  the package suites collected through the `starwarsffg.functionalTests` hook (Codex II), the grep
  selection, the run id, timestamps, and any fixture-named documents left by an earlier aborted run.
- `stats`: counts of tests, passes, failures, pending, registration errors, leaks and problems.
- `tests[]`: each case with its full title, `state` (`passed`, `failed`, `pending`), duration, error
  message and stack, and the skip reason of a pending case. A failing hook is a failed entry.
- `registrationErrors[]`: a suite module that failed to load, or a register function that threw.
- `leaks[]`: what the run left behind after its fixtures were cleaned up.
- `problems[]`: `guard`, `environment`, `selection` (no test ran), `cleanup`, `runner`.

After the run, the runner compares the world with a snapshot taken before it. A document that
appeared or disappeared, a document that existed before and was modified, a changed world-stored
setting, or a window still open is a leak, and a leak fails the run. Windows are closed once they
are reported; documents and settings are not touched, because only the run's own fixtures are its
to remove.

## Writing a functional suite

A suite is a register function, listed in `SYSTEM_SUITES` in `tests/ffg-tests.js` (a package pushes
`{ id, register }` onto the array that the `starwarsffg.functionalTests` hook passes):

```js
export const ExampleTests = (suite, suiteInstance, Test, chai, harness) => {
  const _suite = suiteInstance.create(suite, "Example");
  _suite.addTest(new Test("a new character's sheet opens", async function () {
    const hero = await harness.fixtures.create("Actor", { name: "hero", type: "character" });
    await hero.sheet.render({ force: true });
    await harness.waitFor(() => hero.sheet.rendered, { message: "the sheet renders" });
    chai.expect(hero.sheet.document).to.equal(hero);
  }));   // the actor and its open sheet are removed after the test
};
```

`harness` holds:

| Member | Use |
| --- | --- |
| `fixtures.create(documentName, data, options)` | Create a world document (Actor, Item, User, ChatMessage, JournalEntry, Scene, Macro, Folder, ...). Its name becomes `ffgtest-<runId>-<name>`. |
| `fixtures.track(doc)` | Track a world document that the code under test created, so it is removed too. |
| `fixtures.setting(namespace, key, value)` | Change a setting; the old value, and whether it was stored at all, is restored. |
| `fixtures.name(label)`, `fixtures.prefix` | Run-unique names for anything else. |
| `waitFor(predicate, { timeout, interval, message })` | Poll until a condition holds, instead of sleeping. |
| `waitForHook(hook, filter, { timeout })` | The next matching hook call; start waiting before the action that fires it. |
| `skip(this, reason)` | Skip the current test (or, in a hook, its tests) with a reason the result reports. Use it when required setup is missing: a test must never pass without its setup. |
| `runId` | The run id. |

What a test or its `beforeEach` hooks create is removed right after the test, pass or fail; what a
`before` hook creates is removed at the end of the run. Removal closes the documents' windows
first. For a race that the test must control, hold the operation with `Promise.withResolvers()` and
release it from the test.

## Multi-user Playwright tests

`playwright/foundry.js` exports a `test` with a `sessions` fixture for specs that need several
users at once, such as GM, owner, observer and non-owner:

```js
import { test, expect, CONST_OWNERSHIP } from "../playwright/foundry.js";

test("an observer sees the actor but does not own it", async ({ sessions }) => {
  const observer = await sessions.player();            // { user: {id, name}, context, page }
  const actor = await sessions.create("Actor", {
    name: "hero", type: "character",
    ownership: { default: CONST_OWNERSHIP.NONE, [observer.user.id]: CONST_OWNERSHIP.OBSERVER },
  });
  expect(await observer.page.evaluate((id) => game.actors.get(id).isOwner, actor.id)).toBe(false);
});
```

- `sessions.gm` is the test's `page`, logged in as the GM by the global setup.
- `sessions.player({ name, role })` creates a throwaway user with a random password generated for
  this run, logs it in through its own browser context, waits for `game.ready`, and adds a minute to
  the test's timeout.
- `sessions.create(documentName, data)` creates a document as the GM and tracks it.
- When the test ends, the player contexts are closed and everything created through `sessions`,
  users included, is deleted, pass or fail. The fixture fails the test if anything is left.

Player sessions live only in memory. The GM session is saved to `state.json`, which is ignored by
git, as are `test-results/` and `playwright-report/`.
