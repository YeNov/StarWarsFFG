import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const actorSheetSource = read("modules/actors/codex-sheets.js");
const itemSheetSource = read("modules/items/codex-item-sheet.js");
const sharedItemSheetSource = read("modules/items/item-sheet-ffg.js");
const vehicleTemplate = read("templates/actors/codex/codex-vehicle.html");
const weaponTemplate = read("templates/items/codex/codex-weapon.html");
const shipWeaponTemplate = read("templates/items/codex/codex-shipweapon.html");

test("Codex prepares and renders ammo counters for vehicle weapons", () => {
  assert.match(actorSheetSource, /\["weapon", "shipweapon"\]\.includes\(item\.type\)/);
  assert.match(vehicleTemplate, /lookup \.\.\/cdxAmmo item\._id/);
  assert.match(vehicleTemplate, /class="cdx-ammo" data-weapon-id="\{\{item\._id\}\}"/);
  assert.match(vehicleTemplate, /class="cdx-ammo-step" data-dir="-1"/);
  assert.match(vehicleTemplate, /class="cdx-ammo-step" data-dir="1"/);
});

test("Codex item ammo steppers clamp and persist the current magazine", () => {
  assert.match(itemSheetSource, /querySelectorAll\?\.\("\.cdx-item-ammo-step"\)/);
  assert.match(itemSheetSource, /const max = getAmmoMax\(this\.item\)/);
  assert.match(itemSheetSource, /Number\.isFinite\(displayed\) \? displayed : getAmmoValue\(this\.item\)/);
  assert.match(itemSheetSource, /if \(value\) value\.textContent = String\(current\)/);
  assert.match(itemSheetSource, /const write = previousWrite\.then/);
  assert.match(itemSheetSource, /this\._cdxAmmoUpdate = write/);
  assert.match(itemSheetSource, /"system\.ammo\.value": current/);
});

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

for (const [name, template] of [["weapon", weaponTemplate], ["vehicle weapon", shipWeaponTemplate]]) {
  test(`Codex ${name} configuration uses one stepped Ammo ratio chip`, () => {
    assert.match(template, /#if ammoDisplay\.tracked/);
    assert.match(template, /class="cdx-istat cdx-item-ammo"/);
    assert.match(template, /localize "SWFFG\.Ammo"/);
    assert.match(template, /class="cdx-item-ammo-cur">\{\{ammoDisplay\.value\}\}/);
    assert.match(template, /name="data\.ammo\.max" value="\{\{ammoDisplay\.max\}\}"/);
    assert.match(template, /#if ammoDisplay\.qualityMode\}\}<span class="cdx-item-ammo-max">/);
    assert.match(template, /class="cdx-step cdx-item-ammo-step" data-dir="-1"/);
    assert.match(template, /class="cdx-step cdx-item-ammo-step" data-dir="1"/);
    assert.doesNotMatch(template, /localize "SWFFG\.(Current|Threshold)"/);
  });
}

test("Codex actor ammo steppers queue each click from the last queued count", () => {
  assert.match(actorSheetSource, /let cur = \(this\._cdxAmmoTargets\.get\(w\.id\) \?\? getAmmoValue\(w\)\) \+ dir/);
  assert.match(actorSheetSource, /const previous = this\._cdxAmmoWrites\.get\(w\.id\)\?\.catch\(\(\) => undefined\) \?\? Promise\.resolve\(\)/);
  assert.match(actorSheetSource, /w\.update\(\{ "system\.ammo\.value": cur \}, \{ render: false, ffgAmmoStep: true \}\)/);
  assert.match(itemSheetSource, /this\.item\.update\(\{ "system\.ammo\.value": current \}, \{ render: false, ffgAmmoStep: true \}\)/);
});

test("Codex sheets can show another client's ammo step without re-rendering", () => {
  assert.match(actorSheetSource, /_ffgPaintAmmo\(item\) \{/);
  assert.match(itemSheetSource, /_ffgPaintAmmo\(item\) \{/);
});
