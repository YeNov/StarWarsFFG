import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../modules/items/codex-item-sheet.js", import.meta.url), "utf8");

test("Codex base-stat edits redraw their prepared adjusted values", () => {
  for (const path of ["damage", "crit", "encumbrance", "hardpoints", "soak", "defence"]) {
    assert.match(source, new RegExp(`"data\\.${path}\\.value"`));
  }
  assert.match(source, /querySelectorAll\?\.\(adjustedSelector\)/);
  assert.match(source, /ev\.stopPropagation\(\)/);
  assert.match(source, /await this\._onSubmit\(ev, \{ render: false \}\)/);
  assert.match(source, /await this\.render\(true\)/);
});
