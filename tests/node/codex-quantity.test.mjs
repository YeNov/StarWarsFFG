import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { codexQuantityLabel } from "../../modules/actors/codex-quantity.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("counts of up to four digits show in full", () => {
  for (const value of [0, 7, 42, 150, 9999]) assert.equal(codexQuantityLabel(value), String(value));
});

test("longer counts show their first three digits and ..", () => {
  assert.equal(codexQuantityLabel(10000), "100..");
  assert.equal(codexQuantityLabel("0000000000000000"), "000..");
});

test("Codex gear and cargo cards use the shortened count with the full one as a tooltip", () => {
  assert.match(read("modules/swffg-main.js"), /Handlebars\.registerHelper\("codexQuantity", codexQuantityLabel\)/);
  for (const path of ["templates/parts/codex/cdx-gear.html", "templates/actors/codex/codex-vehicle.html"]) {
    assert.match(read(path), /<span class="cdx-qty-v" title="\{\{item\.system\.quantity\.value\}\}">\{\{codexQuantity item\.system\.quantity\.value\}\}<\/span>/);
  }
});
