// @ts-check
/**
 * Runs the in-Foundry functional suites (tests/ffg-tests.js) in the test world and turns their
 * structured result into one Playwright test. The full JSON result is written to
 * test-results/ and attached to the report. See tests/README.md.
 *
 * FFG_TEST_GREP selects suites or tests by Mocha grep over their full titles.
 *
 * If the run does not return (the page crashed, or the test timed out), the afterEach hook closes
 * that page and deletes the documents named with this run's own fixture prefix.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { deleteDocumentsNamed, openGame, testWorlds } from "../playwright/foundry.js";

/** The run of the current test: its id, and whether runFunctionalTests returned. */
let currentRun = null;

test.afterEach(async ({ browser, page, baseURL }, testInfo) => {
  if (!currentRun || currentRun.returned) return;
  const prefix = `ffgtest-${currentRun.runId}-`;
  currentRun = null;
  await page.close().catch(() => {}); // stops a run that may still be going
  const context = await browser.newContext({ baseURL, storageState: testInfo.project.use.storageState, viewport: { width: 1440, height: 900 } });
  try {
    const gm = await context.newPage();
    await openGame(gm);
    const deleted = await deleteDocumentsNamed(gm, prefix);
    console.log(`The functional run did not return; deleted its ${deleted.length} remaining fixture(s)`
      + `${deleted.length ? `: ${deleted.join(", ")}` : ""}`);
  } finally {
    await context.close();
  }
});

test("Foundry functional suites pass in the test world", async ({ page }, testInfo) => {
  test.setTimeout(20 * 60_000);
  currentRun = { runId: randomBytes(4).toString("hex"), returned: false };

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push({ message: error.message, stack: error.stack ?? null }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openGame(page);
  const options = { grep: process.env.FFG_TEST_GREP || null, allowedWorlds: testWorlds(), runId: currentRun.runId };
  const result = await page.evaluate(async (runOptions) => {
    const { runFunctionalTests } = await import(foundry.utils.getRoute("systems/starwarsffg/tests/ffg-tests.js"));
    return runFunctionalTests(runOptions);
  }, options);
  currentRun.returned = true;
  // Console errors are recorded for diagnosis; Foundry and the system log handled errors there too,
  // so they do not fail the run by themselves. Uncaught page errors do.
  result.browser = { pageErrors, consoleErrors };

  const body = JSON.stringify(result, null, 2);
  fs.writeFileSync(testInfo.outputPath("functional-result.json"), body);
  await testInfo.attach("functional-result.json", { body, contentType: "application/json" });

  const { meta, stats } = result;
  console.log([
    `Functional run ${meta.runId}: ${meta.system.id} ${meta.system.version}, Foundry ${meta.foundry.version}, `
      + `world ${meta.world.id}, grep ${meta.selection.grep ?? "(all)"}`,
    `  packages: ${meta.packageSuites.map((p) => `${p.id}${p.registered ? "" : " (not registered)"}`).join(", ") || "none"}; `
      + `active modules: ${meta.modules.map((m) => `${m.id}@${m.version}`).join(", ") || "none"}`,
    `  ${stats.passes} passed, ${stats.failures} failed, ${stats.pending} pending, `
      + `${stats.registrationErrors} registration errors, ${stats.leaks} leaks, ${stats.problems} problems, `
      + `${pageErrors.length} page errors, ${consoleErrors.length} console errors`,
    ...result.tests.filter((t) => t.state === "pending").map((t) => `  pending: ${t.title} (${t.pendingReason})`),
    ...meta.staleFixtures.map((d) => `  stale fixture from an earlier run: ${d.documentName} "${d.name}" (${d.id})`),
  ].join("\n"));

  for (const skipped of result.tests.filter((t) => t.state === "pending")) {
    testInfo.annotations.push({ type: "skipped functional test", description: `${skipped.title}: ${skipped.pendingReason}` });
  }

  const failures = [
    ...result.problems.map((p) => `${p.kind}: ${p.message}`),
    ...result.registrationErrors.map((e) => `registration error in ${e.source}: ${e.message}`),
    ...result.tests.filter((t) => t.state === "failed").map((t) => `failed: ${t.title}: ${t.error?.message}`),
    ...result.leaks.map((l) => `leak (${l.kind}): ${l.message}`),
    ...pageErrors.map((e) => `page error: ${e.message}`),
  ];
  if (!result.ok && failures.length === 0) failures.push("the run reported ok: false without a reason");
  expect(failures, "functional run failures (full result attached as functional-result.json)").toEqual([]);
});
