/**
 * Foundry runs every module's `init` hook as soon as the system's async `init` handler reaches
 * its first `await` -- it does not wait for it. Anything the system registers after that await is
 * missing for modules, and a sheet registered after Foundry has processed its sheet queue is
 * dropped. So the system registers its settings, its theme stylesheet and its sheets first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../modules/swffg-main.js", import.meta.url), "utf8");
const start = source.indexOf('Hooks.once("init", async function () {');
const end = source.indexOf('Hooks.on("canvasInit"', start);
const init = source.slice(start, end);
// Statements directly in the init body are indented two spaces; nested functions sit deeper.
// This is a heuristic: it finds only a statement that begins with `await`. An `await` written as
// `const x = await ...` or nested in a top-level block (if, try, for) is not seen, so a real first
// await could come earlier than the one found here. A new early await of either kind needs this
// search widened, or the checks below stop meaning what they say.
const firstAwait = init.search(/\n  await /);

test("the init hook was found and still awaits something", () => {
  assert.ok(start >= 0 && end > start, "init hook not found");
  assert.ok(firstAwait > 0, "no top-level await in init");
});

test("system settings are registered before the first await", () => {
  const at = init.indexOf("SettingsHelpers.initLevelSettings();");
  assert.ok(at >= 0 && at < firstAwait);
});

test("the theme stylesheet is added before the first await", () => {
  const at = init.indexOf("styles/mandar.css");
  assert.ok(at >= 0 && at < firstAwait);
});

test("the system's sheets are registered before the first await", () => {
  for (const call of ['registerSheet("ffg", ActorSheetFFG', 'registerSheet("ffg", ItemSheetFFG']) {
    const at = init.indexOf(call);
    assert.ok(at >= 0 && at < firstAwait, call);
  }
});

test("the template preload does not hold up init", () => {
  assert.doesNotMatch(init, /await foundry\.applications\.handlebars\.loadTemplates/);
});
