import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const itemSheetSource = read("modules/items/item-sheet-ffg.js");
const codexTemplate = read("templates/items/codex/codex-item.html");

test("changing an Obligation entry's type redraws the sheet", () => {
  assert.match(
    itemSheetSource,
    /if \(this\.object\.type === "obligation"\) \{\s*html\.find\('select\[name="data\.type"\]'\)\.on\("change", async \(ev\) => \{\s*await this\._onSubmit\(ev, \{ render: true \}\);/,
  );
});

test("the Codex Obligation card swaps Magnitude for Subtype on the type", () => {
  assert.match(codexTemplate, /\{\{#if \(eq data\.type "morality"\)\}\}[\s\S]*name="data\.subtype"[\s\S]*\{\{else\}\}[\s\S]*name="data\.magnitude"/);
});
