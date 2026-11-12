import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { closedEditorFields, omitClosedEditorFields } from "../../modules/helpers/closed-editor-fields.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// A closed {{editor}} block shows the ENRICHED field (dice codes turned into
// `<span class="dietype …">` glyphs). Foundry's FormDataExtended reads the
// innerHTML of every [data-edit] node it has no editor entry for, so without
// this filter any submit-on-change wrote the glyph HTML over the stored
// `[CH][DI]` codes — and ProseMirror then extended the last glyph's span over
// whatever the user typed after it.

/** Minimal stand-in for a form: only querySelectorAll on the editor selector. */
function fakeForm(names) {
  const nodes = names.map((edit) => ({ dataset: { edit } }));
  return {
    querySelectorAll(selector) {
      assert.equal(selector, ".editor-content[data-edit]");
      return nodes;
    },
  };
}

test("an editor block with no editor entry counts as closed", () => {
  const closed = closedEditorFields(fakeForm(["system.description", "system.longDesc"]), {});
  assert.deepEqual([...closed].sort(), ["system.description", "system.longDesc"]);
});

test("an open editor (live instance) is not closed", () => {
  const editors = { "system.description": { instance: { view: {} } } };
  const closed = closedEditorFields(fakeForm(["system.description", "system.longDesc"]), editors);
  assert.deepEqual([...closed], ["system.longDesc"]);
});

test("an editor still mounting (entry without instance) counts as closed", () => {
  const editors = { "system.description": { instance: null } };
  const closed = closedEditorFields(fakeForm(["system.description"]), editors);
  assert.deepEqual([...closed], ["system.description"]);
});

test("closed editor fields are dropped from the submitted data, other fields kept", () => {
  const data = {
    "system.description": "<p>Roll <span class=\"dietype starwars challenge\">c</span></p>",
    "system.longDesc": "<p>open editor value</p>",
    "system.quantity.value": 2,
  };
  const editors = { "system.longDesc": { instance: { view: {} } } };
  const out = omitClosedEditorFields(data, fakeForm(["system.description", "system.longDesc"]), editors);
  assert.equal(out, data);
  assert.deepEqual(out, {
    "system.longDesc": "<p>open editor value</p>",
    "system.quantity.value": 2,
  });
});

test("a missing form or editors record is harmless", () => {
  assert.deepEqual([...closedEditorFields(null, {})], []);
  assert.deepEqual(omitClosedEditorFields({ a: 1 }, null, undefined), { a: 1 });
});

test("every sheet base that builds FormDataExtended drops closed editor fields", () => {
  for (const rel of ["modules/apps/ffg-document-sheet.js", "modules/apps/ffg-form-application.js", "modules/items/item-editor.js"]) {
    const src = read(rel);
    const body = src.slice(src.indexOf("_getSubmitData(updateData = {}) {"));
    assert.match(body, /^_getSubmitData\(updateData = \{\}\) \{[\s\S]*?omitClosedEditorFields\(fd\.object, this\.form, this\.editors\)[\s\S]*?\n  \}/, rel);
  }
});
