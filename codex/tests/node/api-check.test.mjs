/**
 * Codex II starts only on a system that publishes the public API version it was written for, and
 * only once: a second copy (the module next to a system that still ships Codex) stands down.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { REQUIRED_API_VERSION, apiProblemMessage, checkSystemApi } from "../../scripts/api-check.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const api = { apiVersion: REQUIRED_API_VERSION };

test("a system with the expected API version is accepted", () => {
  assert.deepEqual(checkSystemApi(api, undefined), { ok: true });
});

test("a system without the public API is refused", () => {
  // Star Wars FFG 2.1.6 and earlier: Codex built in, no globalThis.starwarsffg.
  const result = checkSystemApi(undefined, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing");
  assert.match(apiProblemMessage(result), /needs Star Wars FFG 2\.2\.0 or later/);
});

test("a system with a newer API is refused, and the module is the one to update", () => {
  const result = checkSystemApi({ apiVersion: REQUIRED_API_VERSION + 1 }, undefined);
  assert.equal(result.reason, "version");
  assert.match(apiProblemMessage(result), /Update the Codex II module/);
});

test("a system with an older API is refused, and the system is the one to update", () => {
  const result = checkSystemApi({ apiVersion: REQUIRED_API_VERSION - 1 }, undefined);
  assert.equal(result.reason, "version");
  assert.match(apiProblemMessage(result), /Update the system/);
  assert.doesNotMatch(apiProblemMessage(result), /Update the Codex II module/);
});

test("an API object without a version counts as no API", () => {
  assert.equal(checkSystemApi({}, undefined).reason, "missing");
});

test("a second copy stands down", () => {
  const result = checkSystemApi(api, "https://example.invalid/systems/starwarsffg/codex/scripts/system-api.js");
  assert.equal(result.reason, "duplicate");
  assert.match(apiProblemMessage(result), /loaded twice/);
});

/**
 * The specifier of the first static import declaration in `source`, whatever its form:
 * `import … from "…"` or a bare `import "…"`, in either quote style. Comments are dropped first,
 * strings kept; a dynamic `import(…)` and `import.meta` are not declarations.
 */
function firstStaticImport(source) {
  const code = source.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, literal) => literal ?? "",
  );
  return code.match(/(?:^|[;}])\s*import(?![\w$])(?!\s*[(.])\s*(?:[\w$*{][^;"'`]*?\bfrom\s*)?(["'])([^"'\n]+)\1/m)?.[2];
}

test("the check runs before any other Codex script, and a failure stops them all", () => {
  // codex-main.js imports system-api.js first; system-api.js throws when the check fails, which
  // stops every later import from being evaluated, so nothing gets registered.
  assert.equal(firstStaticImport(read("scripts/codex-main.js")), "./system-api.js");
  assert.match(read("scripts/system-api.js"), /if \(!result\.ok\) \{[\s\S]*throw new Error\(/);
});
