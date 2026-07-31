import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const actorSheetSource = read("modules/actors/codex-sheets.js");
const itemSheetSource = read("modules/items/codex-item-sheet.js");
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
  assert.match(itemSheetSource, /getAmmoValue\(this\.item\) \+ dir/);
  assert.match(itemSheetSource, /"system\.ammo\.value": current/);
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
