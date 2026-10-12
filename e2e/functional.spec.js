// @ts-check
/**
 * Runs the in-Foundry functional suites (tests/ffg-tests.js) in the test world and turns their
 * structured result into one Playwright test. The full JSON result is written to
 * test-results/ and attached to the report. See tests/README.md.
 *
 * FFG_TEST_GREP selects suites or tests by Mocha grep over their full titles.
 */

import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { openGame, testWorlds } from "../playwright/foundry.js";

test("Foundry functional suites pass in the test world", async ({ page }, testInfo) => {
  test.setTimeout(20 * 60_000);

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push({ message: error.message, stack: error.stack ?? null }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openGame(page);
  const options = { grep: process.env.FFG_TEST_GREP || null, allowedWorlds: testWorlds() };
  const result = await page.evaluate(async (runOptions) => {
    const { runFunctionalTests } = await import(foundry.utils.getRoute("systems/starwarsffg/tests/ffg-tests.js"));
    return runFunctionalTests(runOptions);
  }, options);
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
  // A run in which every selected test was skipped verified nothing: report it as skipped, not passed.
  test.skip(stats.passes === 0, `all ${stats.pending} selected functional tests were skipped`);
});
