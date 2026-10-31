/**
 * The public API (modules/api/public-api.js) is the only door optional packages -- the Codex II
 * module first -- use into the system. Its shape is fixed by PUBLIC_API_SHAPE and versioned.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PUBLIC_API_SHAPE, PUBLIC_API_VERSION, buildPublicApi } from "../../modules/api/public-api.js";

const fullParts = () => Object.fromEntries(Object.entries(PUBLIC_API_SHAPE).map(
  ([group, names]) => [group, Object.fromEntries(names.map((name) => [name, () => name]))],
));

test("the API carries its version and every listed name", () => {
  const api = buildPublicApi(fullParts());
  assert.equal(api.apiVersion, PUBLIC_API_VERSION);
  for (const [group, names] of Object.entries(PUBLIC_API_SHAPE)) {
    assert.deepEqual(Object.keys(api[group]).sort(), [...names].sort(), group);
  }
});

test("a missing name is refused", () => {
  const parts = fullParts();
  delete parts.helpers.availFor;
  assert.throws(() => buildPublicApi(parts), /helpers\.availFor is missing/);
});

test("an unlisted name is refused", () => {
  const parts = fullParts();
  parts.sheets.SomethingElse = class {};
  assert.throws(() => buildPublicApi(parts), /sheets has unlisted SomethingElse/);
});

test("the API and its groups are frozen", () => {
  const api = buildPublicApi(fullParts());
  assert.ok(Object.isFrozen(api));
  for (const group of Object.keys(PUBLIC_API_SHAPE)) assert.ok(Object.isFrozen(api[group]), group);
});

test("swffg-main.js publishes the API before any hook, with every listed name", () => {
  const source = fs.readFileSync(new URL("../../modules/swffg-main.js", import.meta.url), "utf8");
  const at = source.indexOf("globalThis.starwarsffg = buildPublicApi({");
  assert.ok(at > 0, "the API is not published");
  assert.ok(at < source.indexOf('Hooks.on("setup"') && at < source.indexOf('Hooks.once("init"'));
  const call = source.slice(at, source.indexOf("});", at));
  for (const [group, names] of Object.entries(PUBLIC_API_SHAPE)) {
    for (const name of names) {
      const given = group === "sheetResolvers" ? new RegExp(`\\b${name}:`) : new RegExp(`\\b${name}\\b`);
      assert.match(call, given, `${group}.${name} is not handed to buildPublicApi`);
    }
  }
});

test("apiVersion 4 lists the homestead skill roll", () => {
  assert.equal(PUBLIC_API_VERSION, 4);
  assert.ok(PUBLIC_API_SHAPE.helpers.includes("rollFromHomestead"));
});
