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

test("saving an attachment keeps its modifications' links (final review, Important 1)", () => {
  // The attachment popup (item-editor.js) and the attachment sheet (item-sheet-ffg.js) rebuild the
  // modifications from the form; both must put back what the form does not carry.
  const editor = read("modules/items/item-editor.js");
  const attachmentBranch = editor.slice(editor.indexOf('if (this.data.clickedObject.type === "itemattachment") {'), editor.indexOf('if (this.data.clickedObject.type === "itemmodifier") {'));
  assert.match(attachmentBranch, /keepCopyFields\(attachment\.system\?\.itemmodifier, formData\.system\.itemmodifier\)/);
  const sheet = read("modules/items/item-sheet-ffg.js");
  const standalone = sheet.slice(sheet.indexOf("// For standalone itemattachments"), sheet.indexOf("const itemUpdate = ItemHelpers.itemUpdate.bind(this);"));
  assert.match(standalone, /keepCopyFields\(this\.object\.system\?\.itemmodifier, expanded\.system\.itemmodifier\)/);
});

test("every reason the planner gives is put in words by the dialog (talent review batch)", () => {
  const planner = read("modules/helpers/roll-option-costs.js");
  const dialog = read("modules/dice/roll-builder.js");
  const en = JSON.parse(read("lang/en.json"));
  const codes = [...new Set([...planner.matchAll(/reasonFor\("(\w+)"/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 11, `found ${codes.length} reason codes`);
  for (const code of codes) assert.match(dialog, new RegExp(`case "${code}"`), `the dialog handles ${code}`);
  for (const key of ["NeedsDifficulty", "ZeroForce", "ZeroDestinyLight", "ZeroDestinyDark", "ForceTaken", "SwapTaken", "NoBoost", "CannotSwap"]) {
    assert.ok(`SWFFG.RollOptions.Reason.${key}` in en, `lang/en.json has Reason.${key}`);
  }
});

test("the card shows a switch for a row with choices and leaves an uncapped amount without a max", () => {
  const panel = read("templates/dice/parts/roll-options-panel.html");
  assert.match(panel, /data-option-choice="\{\{branch\.id\}\}"/);
  assert.match(panel, /\{\{#if option\.amount\.max\}\}max="\{\{option\.amount\.max\}\}"\{\{\/if\}\}/);
});
