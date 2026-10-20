import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const sharedItemSheetSource = read("modules/items/item-sheet-ffg.js");

test("quality-driven ammo mode shows the manual Enable Ammo option disabled, with a note", () => {
  assert.match(sharedItemSheetSource, /const qualityMode = isQualityAmmoMode\(\);\s*this\.sheetoptions\.register\("enableAmmo"/);
  assert.match(sharedItemSheetSource, /qualityMode \? "SWFFG\.SheetOptions2\.enableAmmo\.QualityModeHint" : "SWFFG\.SheetOptions2\.enableAmmo\.Hint"/);
  assert.match(sharedItemSheetSource, /disabled: qualityMode,/);
  assert.match(read("lang/en.json"), /"SWFFG\.SheetOptions2\.enableAmmo\.QualityModeHint":/);
  const dialog = read("templates/dialogs/ffg-sheet-options.html");
  assert.match(dialog, /class="form-group\{\{#if option\.disabled\}\} disabled\{\{\/if\}\}"/);
  assert.match(dialog, /\{\{#if option\.disabled\}\}disabled\{\{\/if\}\} \/>/);
  // Accepting the dialog must not write a flag the user could not change.
  assert.match(read("modules/items/item-ffg-options.js"), /if \(control\.disabled\) continue;/);
});
