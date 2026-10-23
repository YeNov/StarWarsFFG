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

test("every reason the planner gives is put in words by the card (talent review batch)", () => {
  const planner = read("modules/helpers/roll-option-costs.js");
  // optionReasonText, shared by the dice dialog and the initiative dialog.
  const dialog = read("modules/helpers/roll-option-card.js");
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

test("item Upgrade and Downgrade Ability modifiers are recorded on the pool (implementation review)", () => {
  const modifiers = read("modules/helpers/modifiers.js");
  assert.match(modifiers, /dicePool\.modUpgrades \+= /);
  assert.match(modifiers, /dicePool\.modDowngrades \+= /);
});

test("the dialog fills in a missing skill key, characteristic and rank before it reads them (Token Action HUD)", () => {
  const dialog = read("modules/dice/roll-builder.js");
  const collect = dialog.slice(dialog.indexOf("_collectOptionalBuffs() {"), dialog.indexOf("_tickedBuffs() {"));
  assert.ok(collect.indexOf("rollSkillContext(") > 0, "_collectOptionalBuffs calls rollSkillContext");
  assert.ok(collect.indexOf("rollSkillContext(") < collect.indexOf("collectOfferedBuffs("), "before the buffs read the skill key");
  assert.ok(dialog.indexOf("this._optionalBuffs = this._collectOptionalBuffs()") < dialog.indexOf("this._optionInputs = rollOptionInputs("), "before the roll options read it");
});

test("the roll options card starts folded, its tab saying so", () => {
  const dialog = read("templates/dice/roll-options-ffg.html");
  assert.match(dialog, /<aside class="ffg-roll-options-panel ffg-ro-collapsed"/);
  const toggle = dialog.slice(dialog.indexOf('class="ffg-roll-options-toggle"'));
  assert.match(toggle.slice(0, 80), /aria-expanded="false"/);
});

test("hovering an option row shows its source's description", () => {
  const panel = read("templates/dice/parts/roll-options-panel.html");
  assert.ok(panel.includes('{{#if option.tooltip}} data-tooltip-html="{{option.tooltip}}" data-tooltip-class="ffg-ro-tooltip"{{/if}}'));
  const dialog = read("modules/dice/roll-builder.js");
  assert.ok(dialog.includes("PopoutEditor.renderDiceImages(option.description, this._rollActor)"));
  assert.ok(dialog.includes("tooltips: this._optionTooltips"), "the dialog hands the card its tooltips");
  assert.ok(read("modules/helpers/roll-option-card.js").includes("tooltip: tooltips?.get?.(option.key) ?? null"));
  assert.ok(read("styles/mandar.css").includes("#tooltip.ffg-ro-tooltip {"));
});
