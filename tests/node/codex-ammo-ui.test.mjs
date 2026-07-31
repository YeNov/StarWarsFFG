import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const actorSheetSource = read("modules/actors/codex-sheets.js");
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

for (const [name, template] of [["weapon", weaponTemplate], ["vehicle weapon", shipWeaponTemplate]]) {
  test(`Codex ${name} configuration uses shared ammo context and Codex field order`, () => {
    assert.match(template, /#if ammoDisplay\.tracked/);
    assert.match(template, /name="data\.ammo\.value" value="\{\{ammoDisplay\.value\}\}"/);
    assert.match(template, /name="data\.ammo\.max" value="\{\{ammoDisplay\.max\}\}"/);
    assert.match(template, /#if ammoDisplay\.qualityMode\}\}disabled/);

    const current = template.indexOf('{{localize "SWFFG.Current"}}');
    const threshold = template.indexOf('{{localize "SWFFG.Threshold"}}');
    assert.ok(current >= 0 && threshold > current, "Current must appear before Threshold");
  });
}
