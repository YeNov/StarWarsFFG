import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the Codex vehicle fallback reads the stored hull rating", () => {
  const sheet = read("scripts/codex-sheets.js");
  assert.match(sheet, /cdxVehHpMax = vehicleHardpointSourceRating\(this\.actor\)/);
});

test("the Codex vehicle sheet shows used-of-rating and edits the rating", () => {
  const sheet = read("scripts/codex-sheets.js");
  const template = read("templates/actors/codex-vehicle.html");
  assert.match(sheet, /vehicleHardpoints/);
  // The rating -- not the prepared value -- is what the readout and the edit
  // field use, so submitting the sheet cannot bake an attachment's spend in.
  assert.match(template, /\{\{cdxVehHpUsed\}\} \/ \{\{cdxVehHpMax\}\}/);
  assert.doesNotMatch(template, /name="data\.stats\.customizationHardPoints\.value" value="\{\{data\.stats/);
});
