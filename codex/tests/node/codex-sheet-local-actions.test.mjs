import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const actorCodexSource = read("scripts/codex-sheets.js");
const itemCodexSource = read("scripts/codex-item-sheet.js");

test("Codex-specific actor and item sheets do not fetch compendiums for UI interactions", () => {
  for (const [name, source] of [
    ["actor", actorCodexSource],
    ["item", itemCodexSource],
  ]) {
    assert.doesNotMatch(source, /findCompendium|game\.packs|getDocument\(|getDocuments\(/, name);
  }
});
