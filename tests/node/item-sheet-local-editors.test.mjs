import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const itemSheetSource = read("modules/items/item-sheet-ffg.js");

test("shared item-sheet Codex editors use their live Item instead of resolving their own UUID", () => {
  assert.doesNotMatch(itemSheetSource, /await fromUuid\(this\.object\.uuid\)/);

  const upgradeEditorStart = itemSheetSource.indexOf("async _onClickUpgradeEdit(");
  const upgradeEditorEnd = itemSheetSource.indexOf("async _onClickTalentControl(", upgradeEditorStart);
  const upgradeEditor = itemSheetSource.slice(upgradeEditorStart, upgradeEditorEnd);
  assert.match(upgradeEditor, /const parentObject = this\.object/);
});
