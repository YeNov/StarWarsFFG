import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const actorCodexSource = read("modules/actors/codex-sheets.js");
const itemCodexSource = read("modules/items/codex-item-sheet.js");
const itemSheetSource = read("modules/items/item-sheet-ffg.js");

test("Codex-specific actor and item sheets do not fetch compendiums for UI interactions", () => {
  for (const [name, source] of [
    ["actor", actorCodexSource],
    ["item", itemCodexSource],
  ]) {
    assert.doesNotMatch(source, /findCompendium|game\.packs|getDocument\(|getDocuments\(/, name);
  }
});

test("shared item-sheet Codex editors use their live Item instead of resolving their own UUID", () => {
  assert.doesNotMatch(itemSheetSource, /await fromUuid\(this\.object\.uuid\)/);

  const upgradeEditorStart = itemSheetSource.indexOf("async _onClickUpgradeEdit(");
  const upgradeEditorEnd = itemSheetSource.indexOf("async _onClickTalentControl(", upgradeEditorStart);
  const upgradeEditor = itemSheetSource.slice(upgradeEditorStart, upgradeEditorEnd);
  assert.match(upgradeEditor, /const parentObject = this\.object/);
});
