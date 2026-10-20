/**
 * The XP-log refund button is rendered by two different templates (the shared
 * ffg-block partial and the Codex character sheet). Both are wired by the single
 * jQuery binding in ActorSheetFFG#activateListeners, so the selector it binds has
 * to match the button in BOTH templates -- binding the surrounding log entry
 * silently dropped the Codex sheet, where the wrapper carries `cdx-xp-entry`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const codexTemplate = read("templates/actors/codex-character.html");

test("the Codex XP log renders a refund anchor the handler can match", () => {
  assert.match(codexTemplate, /<a class="xp refund"[^>]*data-id="/);
});

test("the Codex XP log marks adjustment entries", () => {
  // How _refundPurchase's mode is derived, so it must survive template edits.
  assert.match(codexTemplate, /cdx-xp-entry \{\{entry\.action\}\}/);
});
