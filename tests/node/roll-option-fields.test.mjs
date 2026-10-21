/**
 * The roll option link list must be declared on every item type that carries it, or Foundry strips
 * it on save, and a talent dropped into a specialization tree must carry its links into the node
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Data" and "Constraints").
 *
 * The data models and the sheet need Foundry to load, so this reads their source, in the style of
 * public-api-surface.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the link list is a declared array of uuids", () => {
  const templates = read("modules/data/item-templates.js");
  assert.match(templates, /export const RollOptionLinksTemplate\b/);
  assert.match(templates, /rollOptions: new f\.ArrayField\(new f\.StringField\(\{ blank: false \}\)\)/);
});

for (const type of ["talent", "weapon", "armour", "gear", "itemattachment", "itemmodifier"]) {
  test(`the ${type} model mixes in the link list`, () => {
    const source = read(`modules/data/models/item/${type}.js`);
    assert.match(source, /RollOptionLinksTemplate,?\s*[\n)]/, `${type}.js imports and mixes RollOptionLinksTemplate`);
    assert.equal(source.match(/RollOptionLinksTemplate/g)?.length >= 2, true, `${type}.js both imports and mixes it`);
  });
}

test("a talent dropped into a tree carries its links into the node", () => {
  const sheet = read("modules/items/item-sheet-ffg.js");
  const drop = sheet.slice(sheet.indexOf("async _onDropTalentToSpecialization("), sheet.indexOf("async _onDropItem("));
  assert.match(drop, /rollOptions: \[\.\.\.\(itemObject\.system\.rollOptions \?\? \[\]\)\]/);
});
