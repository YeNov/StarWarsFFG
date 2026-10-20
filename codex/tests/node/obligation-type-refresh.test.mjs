import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const codexTemplate = read("templates/items/codex-item.html");

test("the Codex Obligation card swaps Magnitude for Subtype on the type", () => {
  assert.match(codexTemplate, /\{\{#if \(eq data\.type "morality"\)\}\}[\s\S]*name="data\.subtype"[\s\S]*\{\{else\}\}[\s\S]*name="data\.magnitude"/);
  // The system's item sheet redraws on a change of this select (item-sheet-ffg.js).
  assert.match(codexTemplate, /<select[^>]*name="data\.type"/);
});
