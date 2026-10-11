import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const itemSheetSource = read("modules/items/item-sheet-ffg.js");

test("changing an Obligation entry's type redraws the sheet", () => {
  assert.match(
    itemSheetSource,
    /if \(this\.object\.type === "obligation"\) \{\s*html\.find\('select\[name="data\.type"\]'\)\.on\("change", async \(ev\) => \{\s*await this\._onSubmit\(ev, \{ render: true \}\);/,
  );
});
