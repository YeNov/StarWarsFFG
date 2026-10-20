/**
 * Per-user default sheets. Foundry's own default sheet is per world; a sheet package (the Codex II
 * module) registers a resolver that picks a sheet from the user's own choice, and ActorFFG/ItemFFG
 * ask the resolvers whenever a document has no explicit ⚙ Sheet choice.
 */
import "./_stub/foundry-stub.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { registerSheetResolver, hasSheetResolver, resolveSheetClass } = await import("../../modules/helpers/sheet-resolvers.js");
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

class CharacterSheet {}
class OtherSheet {}
const character = { documentName: "Actor", type: "character" };
const vehicle = { documentName: "Actor", type: "vehicle" };

// The registry is module state shared by the cases below, so they build on each other in order.
test("with no resolver registered, no document gets a package sheet", () => {
  assert.equal(resolveSheetClass(character), null);
  assert.equal(hasSheetResolver("pkg-a"), false);
});

test("a package's resolver picks the sheet for the documents it claims", () => {
  registerSheetResolver("pkg-a", (document) => (document.type === "character" ? CharacterSheet : null));
  assert.equal(hasSheetResolver("pkg-a"), true);
  assert.equal(resolveSheetClass(character), CharacterSheet);
  assert.equal(resolveSheetClass(vehicle), null);
});

test("a resolver that throws is skipped instead of breaking every sheet", () => {
  registerSheetResolver("pkg-broken", () => { throw new Error("boom"); });
  assert.equal(resolveSheetClass(character), CharacterSheet);
  assert.equal(resolveSheetClass(vehicle), null);
});

test("registering a package again replaces its resolver", () => {
  registerSheetResolver("pkg-a", () => OtherSheet);
  assert.equal(resolveSheetClass(vehicle), OtherSheet);
});

test("a resolver needs a package id and a function", () => {
  assert.throws(() => registerSheetResolver("", () => null), TypeError);
  assert.throws(() => registerSheetResolver("pkg-c", null), TypeError);
});

test("actors and items ask the resolvers only when no sheet was picked for the document", () => {
  for (const path of ["modules/actors/actor-ffg.js", "modules/items/item-ffg.js"]) {
    const source = read(path);
    const method = source.slice(source.indexOf("_getSheetClass() {"), source.indexOf("super._getSheetClass()"));
    assert.match(method, /if \(!this\.getFlag\("core", "sheetClass"\)\)/, path);
    assert.match(method, /resolveSheetClass\(this\)/, path);
    assert.doesNotMatch(source, /codexSheets|effectiveSheetTheme/, path);
  }
});
