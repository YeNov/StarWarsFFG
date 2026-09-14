import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const codexSource = read("modules/actors/codex-sheets.js");
const actorSheetSource = read("modules/actors/actor-sheet-ffg.js");

test("Codex actor renders remember which cards were expanded", () => {
  assert.match(codexSource, /this\._cdxExpandedCards = this\._cdxCaptureExpandedCards\(\);\s*await super\._preRender/);
  assert.match(codexSource, /form\.querySelectorAll\("\[data-item-id\]\.expanded"\)/);
  assert.match(codexSource, /details: card\.querySelector\(":scope > \.item-details"\)/);
});

test("expanded cards reopen before listeners and the scroll restore run", () => {
  assert.match(codexSource, /activateListeners\(html\) \{[\s\S]{0,300}this\._cdxRestoreExpandedCards\(html\?\.\[0\] \?\? this\.form\);\s*super\.activateListeners\(html\);/);
  assert.match(codexSource, /card\.classList\.add\("expanded"\);[\s\S]*card\.append\(details\);/);
});

test("a reopened item card rebuilds its details from the current item", () => {
  assert.match(codexSource, /this\._itemDetailsElement\(item\)\.then\(\(fresh\) => \{/);
  assert.match(actorSheetSource, /async _itemDetailsElement\(item\) \{/);
  assert.match(actorSheetSource, /const div = await this\._itemDetailsElement\(item\);\s*li\.append\(div\.hide\(\)\);/);
});
