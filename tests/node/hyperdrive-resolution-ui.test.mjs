import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP_SOURCE = fs.readFileSync(
  new URL("../../modules/importer/hyperdrive/importer-app.js", import.meta.url),
  "utf8",
);
const TEMPLATE = fs.readFileSync(
  new URL("../../templates/importer/hyperdrive-importer.html", import.meta.url),
  "utf8",
);

test("Hyperdrive finding slots accept Foundry Item drops", () => {
  assert.match(APP_SOURCE, /dropSelector:\s*"\.hyperdrive-resolution-drop"/);
  assert.match(APP_SOURCE, /Item\.implementation\.fromDropData\(data\)/);
  assert.match(APP_SOURCE, /dragDrop\.bind\(this\.element\)/);
  assert.match(TEMPLATE, /class="hyperdrive-resolution-drop/);
  assert.match(TEMPLATE, /data-finding-id="\{\{slotId\}\}"/);
});

test("Hyperdrive finding resolution is optional and removable", () => {
  assert.match(TEMPLATE, /Empty slots keep the importer's normal fallback/);
  assert.match(TEMPLATE, /data-action="clearResolution"/);
  assert.match(APP_SOURCE, /overrides:\s*reviewing \? this\._resolutionOverrides\(\) : new Map\(\)/);
});
