/**
 * Per-user default sheets. Foundry's own default sheet is per world; a sheet package (the Codex II
 * module) registers a resolver that picks a sheet from the user's own choice, and ActorFFG/ItemFFG
 * ask the resolvers whenever a document has no explicit ⚙ Sheet choice.
 *
 * The registry is module state, so every case loads the module again under a URL of its own and
 * gets an empty registry. No case depends on another, or on the order they run in: each one passes
 * with `--test-name-pattern` alone.
 */
import "./_stub/foundry-stub.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const RESOLVERS = new URL("../../modules/helpers/sheet-resolvers.js", import.meta.url);
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * The sheet-resolver module with a registry of its own. A query string makes the URL new, so Node
 * evaluates the file again instead of handing back the instance an earlier case registered into.
 */
function loadRegistry() {
  const url = new URL(RESOLVERS);
  url.searchParams.set("registry", randomUUID());
  return import(url.href);
}

class CharacterSheet {}
class OtherSheet {}
const character = { documentName: "Actor", type: "character" };
const vehicle = { documentName: "Actor", type: "vehicle" };
const claimsCharacters = (document) => (document.type === "character" ? CharacterSheet : null);

test("with no resolver registered, no document gets a package sheet", async () => {
  const { hasSheetResolver, resolveSheetClass } = await loadRegistry();
  assert.equal(resolveSheetClass(character), null);
  assert.equal(resolveSheetClass(vehicle), null);
  assert.equal(hasSheetResolver("pkg-a"), false);
});

test("a freshly loaded registry shares nothing with another one", async () => {
  const first = await loadRegistry();
  first.registerSheetResolver("pkg-a", claimsCharacters);

  const second = await loadRegistry();
  assert.equal(second.hasSheetResolver("pkg-a"), false);
  assert.equal(second.resolveSheetClass(character), null);
  assert.equal(first.resolveSheetClass(character), CharacterSheet, "the first registry kept its resolver");
});

test("a package's resolver picks the sheet for the documents it claims", async (t) => {
  const { registerSheetResolver, hasSheetResolver, resolveSheetClass } = await loadRegistry();
  const resolver = t.mock.fn(claimsCharacters);
  registerSheetResolver("pkg-a", resolver);

  assert.equal(hasSheetResolver("pkg-a"), true);
  assert.equal(resolveSheetClass(character), CharacterSheet);
  assert.ok(resolver.mock.calls.some((call) => call.arguments[0] === character), "the resolver is asked about the document being opened");
});

test("a document the package's resolver does not claim gets no package sheet", async () => {
  const { registerSheetResolver, hasSheetResolver, resolveSheetClass } = await loadRegistry();
  registerSheetResolver("pkg-a", claimsCharacters);

  assert.equal(resolveSheetClass(vehicle), null);
  assert.equal(hasSheetResolver("pkg-a"), true, "declining a document does not unregister the package");
});

test("when two packages claim the same document, the one registered first supplies the sheet", async () => {
  const { registerSheetResolver, resolveSheetClass } = await loadRegistry();
  registerSheetResolver("pkg-a", () => CharacterSheet);
  registerSheetResolver("pkg-b", () => OtherSheet);

  assert.equal(resolveSheetClass(character), CharacterSheet);
});

test("a package that does not claim a document leaves it to the next package", async () => {
  const { registerSheetResolver, resolveSheetClass } = await loadRegistry();
  registerSheetResolver("pkg-a", () => null);
  registerSheetResolver("pkg-b", () => OtherSheet);

  assert.equal(resolveSheetClass(character), OtherSheet);
});

test("a resolver that throws is skipped instead of breaking every sheet", async () => {
  const { registerSheetResolver, resolveSheetClass } = await loadRegistry();
  // The broken package is asked first: the working one must still be reached after it.
  registerSheetResolver("pkg-broken", () => { throw new Error("boom"); });
  registerSheetResolver("pkg-a", claimsCharacters);

  assert.equal(resolveSheetClass(character), CharacterSheet);
  assert.equal(resolveSheetClass(vehicle), null);
});

test("when the only resolver throws, the document gets no package sheet", async () => {
  const { registerSheetResolver, resolveSheetClass } = await loadRegistry();
  registerSheetResolver("pkg-broken", () => { throw new Error("boom"); });

  assert.equal(resolveSheetClass(character), null);
});

test("registering a package again replaces its resolver", async (t) => {
  const { registerSheetResolver, resolveSheetClass } = await loadRegistry();
  const original = t.mock.fn(claimsCharacters);
  registerSheetResolver("pkg-a", original);
  registerSheetResolver("pkg-a", () => OtherSheet);

  assert.equal(resolveSheetClass(character), OtherSheet, "the new resolver answers for what the old one claimed");
  assert.equal(resolveSheetClass(vehicle), OtherSheet);
  assert.equal(original.mock.callCount(), 0, "the old resolver is not asked any more");
});

test("a package id must be a non-empty string", async () => {
  const { registerSheetResolver, hasSheetResolver, resolveSheetClass } = await loadRegistry();
  for (const packageId of ["", undefined, null, 42, {}]) {
    assert.throws(() => registerSheetResolver(packageId, claimsCharacters), TypeError, `package id ${JSON.stringify(packageId)}`);
  }

  assert.equal(hasSheetResolver(""), false);
  assert.equal(resolveSheetClass(character), null, "a rejected registration registers nothing");
});

test("a resolver must be a function", async () => {
  const { registerSheetResolver, hasSheetResolver, resolveSheetClass } = await loadRegistry();
  for (const resolver of [null, undefined, "pkg", 42, {}]) {
    assert.throws(() => registerSheetResolver("pkg-c", resolver), TypeError, `resolver ${JSON.stringify(resolver)}`);
  }

  assert.equal(hasSheetResolver("pkg-c"), false);
  assert.equal(resolveSheetClass(character), null, "a rejected registration registers nothing");
});

test("a rejected registration leaves the package's current resolver in place", async () => {
  const { registerSheetResolver, resolveSheetClass } = await loadRegistry();
  registerSheetResolver("pkg-a", claimsCharacters);

  assert.throws(() => registerSheetResolver("pkg-a", null), TypeError);

  assert.equal(resolveSheetClass(character), CharacterSheet);
});

// Source-text stand-in until the Foundry suite checks the sheet an actor and an item actually open:
// an explicit ⚙ Sheet choice wins, a matching resolver supplies the default, no match falls back to
// Foundry's own default.
test("actors and items ask the resolvers only when no sheet was picked for the document", () => {
  for (const path of ["modules/actors/actor-ffg.js", "modules/items/item-ffg.js"]) {
    const source = read(path);
    const method = source.slice(source.indexOf("_getSheetClass() {"), source.indexOf("super._getSheetClass()"));
    assert.match(method, /if \(!this\.getFlag\("core", "sheetClass"\)\)/, path);
    assert.match(method, /resolveSheetClass\(this\)/, path);
  }
});

// Package boundary, which stays when the Foundry cases replace the one above: the system classes
// know the registry and nothing about a particular sheet package.
test("actors and items reach a sheet package only through the resolver registry", () => {
  for (const path of ["modules/actors/actor-ffg.js", "modules/items/item-ffg.js"]) {
    assert.doesNotMatch(read(path), /codexSheets|effectiveSheetTheme/, path);
  }
});
