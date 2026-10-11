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

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** The body of the named method, up to its closing brace at class-member depth. */
function method(source, signature) {
  const start = source.indexOf(`  ${signature} {`);
  assert.ok(start >= 0, `missing ${signature}`);
  return source.slice(start, source.indexOf("\n  }\n", start));
}

test("a read-only Codex sheet offers no Scheme picker, which saves to the document", () => {
  for (const path of ["scripts/codex-item-sheet.js", "scripts/codex-sheets.js"]) {
    const body = method(read(path), "_getHeaderControls()");
    assert.match(body, /if \(!this\.isEditable\) return controls;[\s\S]*action: "cdxScheme"/, path);
  }
});
