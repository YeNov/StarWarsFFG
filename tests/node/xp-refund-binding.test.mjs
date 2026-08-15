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

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const sheetSource = read("modules/actors/actor-sheet-ffg.js");
const sharedTemplate = read("templates/parts/shared/ffg-block.html");
const codexTemplate = read("templates/actors/codex/codex-character.html");

test("the refund handler is bound to the refund anchor itself", () => {
  assert.match(sheetSource, /html\.find\("a\.xp\.refund"\)/);
  // The old wrapper-based bindings must be gone, or the Codex sheet stays broken
  // and the shared sheet fires the dialog twice for one click.
  assert.doesNotMatch(sheetSource, /html\.find\("\.xp\.(purchase|adjusted)"\)/);
});

test("both XP-log templates render an anchor the handler can match", () => {
  for (const [name, template] of [
    ["shared ffg-block", sharedTemplate],
    ["codex character", codexTemplate],
  ]) {
    assert.match(template, /<a class="xp refund"[^>]*data-id="/, name);
  }
});

test("both XP-log templates mark adjustment entries with the `adjusted` class", () => {
  // How _refundPurchase's mode is derived, so it must survive template edits.
  assert.match(sharedTemplate, /class="xp adjusted"/);
  assert.match(codexTemplate, /cdx-xp-entry \{\{entry\.action\}\}/);
});
