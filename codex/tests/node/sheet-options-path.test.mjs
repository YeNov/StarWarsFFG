/**
 * Sheet Options normally persists each option as a `flags.starwarsffg.config.*`
 * flag. An option registered with a `path` is document data that other code reads
 * -- the vehicle defence-zone override lives in `system.stats.defenceZones`, where
 * the roll dialog finds it on the targeted vehicle -- so it must be read from and
 * written to that path instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the Codex vehicle sheet carries no zone picker", () => {
  // The in-sheet select submitted with render:false, so the zones never redrew until
  // a reload. The override now lives only in Sheet Options, which re-renders on save.
  assert.doesNotMatch(read("templates/actors/codex-vehicle.html"), /name="data\.stats\.defenceZones"/);
});
