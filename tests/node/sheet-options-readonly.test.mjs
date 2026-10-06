/**
 * Opening a sheet must not write to its document. Sheet Options used to seed an
 * empty `flags.starwarsffg.config` on first render, which a player cannot do to a
 * compendium item (or anything they only observe), so merely opening one during
 * character creation threw a permission error. A read-only item sheet also
 * offers no Sheet Options button, and no read-only Codex sheet offers the Scheme
 * picker, since both save to the document.
 *
 * The option classes build DialogV2 dialogs and the Codex sheets are Foundry
 * applications, so these are source checks; the behaviour is checked in Foundry.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** The body of the named method, up to its closing brace at class-member depth. */
function method(source, signature) {
  const start = source.indexOf(`  ${signature} {`);
  assert.ok(start >= 0, `missing ${signature}`);
  return source.slice(start, source.indexOf("\n  }\n", start));
}

for (const path of ["modules/items/item-ffg-options.js", "modules/actors/actor-ffg-options.js"]) {
  test(`${path}: registering an option reads it without writing`, () => {
    const register = method(read(path), "async register(optionName, options)");
    assert.doesNotMatch(register, /setFlag|\.update\(/, "registering runs on every render");
    assert.match(register, /this\.options\[optionName\]\.value = this\.data\.object\.flags\?\.starwarsffg\?\.config\?\.\[optionName\] \?\? this\.options\[optionName\]\.default;/);
  });
}

test("a read-only item sheet gets no Sheet Options button", () => {
  // Actor sheets build their options only past the editable gate, so they need no guard.
  const init = method(read("modules/items/item-ffg-options.js"), "init(html)");
  assert.match(init, /^\s*init\(html\) \{[^]*?if \(this\.data\.isEditable === false\) return;\s*const root = this\._findSheetRoot\(html\);/);
});

test("a read-only Codex sheet offers no Scheme picker, which saves to the document", () => {
  for (const path of ["modules/items/codex-item-sheet.js", "modules/actors/codex-sheets.js"]) {
    const body = method(read(path), "_getHeaderControls()");
    assert.match(body, /if \(!this\.isEditable\) return controls;[\s\S]*action: "cdxScheme"/, path);
  }
});
