import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const actorSheetSource = read("modules/actors/actor-sheet-ffg.js");

test("the actor sheet rebuilds an item card's details from the current item", () => {
  assert.match(actorSheetSource, /async _itemDetailsElement\(item\) \{/);
  assert.match(actorSheetSource, /const div = await this\._itemDetailsElement\(item\);\s*li\.append\(div\.hide\(\)\);/);
});
