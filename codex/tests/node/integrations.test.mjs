/**
 * Codex II reaches into system windows through hooks instead of the system reaching into Codex:
 * open Codex sheets redraw when a setting they show changes, the embedded item editor takes the
 * Codex skin, and the roll dialog gets the dark dice marker for an actor on a Codex sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const INTEGRATIONS = "scripts/integrations.js";

test("Codex hooks the setting changes, the item editor and the roll dialog", () => {
  const source = read(INTEGRATIONS);
  for (const hook of ["createSetting", "updateSetting", "renderitemEditor", "renderRollBuilderFFG"]) {
    assert.match(source, new RegExp(`Hooks\\.on\\("${hook}"`), hook);
  }
  for (const key of ["starwarsffg.campaignDay", "starwarsffg.vehicleCritWeeklyLimit", "starwarsffg.codexTalentTierSorting"]) {
    assert.ok(source.includes(`"${key}"`), key);
  }
});
