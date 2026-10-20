/**
 * Codex II reaches into system windows through hooks instead of the system reaching into Codex:
 * open Codex sheets redraw when a setting they show changes, the embedded item editor takes the
 * Codex skin, and the roll dialog gets the dark dice marker for an actor on a Codex sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the system's windows no longer know about Codex", () => {
  assert.doesNotMatch(read("modules/items/item-editor.js"), /codex|cdx/i);
  assert.doesNotMatch(read("modules/dice/roll-builder.js"), /codex|cdx-dice/i);
  assert.doesNotMatch(read("modules/settings/settings-helpers.js"), /refreshOpenCodexSheets|codex-sheets\.js/);
});
