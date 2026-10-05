/**
 * A player with Observer access (including every player browsing a compendium)
 * gets a read-only sheet. Read-only must still let them look at everything:
 * switch Codex tabs, expand item cards, open the specializations a career lists.
 *
 * Two things stood in the way. Foundry's read-only pass disables every element
 * of the form, and the Codex tabs are <button>s; and several purely visual click
 * handlers were bound after the sheets' "editable only" early return.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// Disabling form controls is DOM work, so the behaviour itself is checked in
// Foundry; here we pin the shape of the exemption.
test("a read-only sheet leaves its viewer controls enabled", () => {
  const source = read("modules/apps/ffg-document-sheet.js");
  assert.match(source, /static VIEWER_CONTROLS = "";/, "the base sheet exempts nothing");
  const start = source.indexOf("  _toggleDisabled(disabled) {");
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  assert.match(body, /const viewerControls = this\.viewerControls;\s*for \(const element of form\.elements\) \{\s*if \(viewerControls && element\.matches\(viewerControls\)\) continue;/);
  assert.match(source, /get viewerControls\(\) \{\s*return this\.constructor\.VIEWER_CONTROLS;\s*\}/, "by default a sheet exempts its class list");
});

/** The selector string a Codex class assigns to VIEWER_CONTROLS. */
function viewerControls(source, anchor) {
  const at = source.indexOf(anchor);
  assert.ok(at >= 0, `missing ${anchor}`);
  const match = source.slice(at).match(/static VIEWER_CONTROLS = "([^"]*)"/);
  assert.ok(match, `no VIEWER_CONTROLS after ${anchor}`);
  return match[1].split(",").map((part) => part.trim());
}

test("Codex actor sheets let viewers use tabs and the header toggle", () => {
  const source = read("modules/actors/codex-sheets.js");
  assert.deepEqual(viewerControls(source, "export const CodexSchemeMixin"), [".cdx-tab", ".cdx-hcollapse-btn"]);
  // Resilience rolls for the character, so it stays with the owner.
  assert.doesNotMatch(source, /VIEWER_CONTROLS[^;]*cdx-inj-resilience/);
});

test("the crit-failure markers stay usable only where the click can be forwarded to the GM", () => {
  // A non-owner's mark is forwarded to the GM. An owner on a read-only sheet (a
  // locked compendium) has no way to save it, and nor does anyone on a locked pack.
  const source = read("modules/actors/codex-sheets.js");
  const start = source.indexOf("  get viewerControls() {", source.indexOf("export const CodexSchemeMixin"));
  assert.ok(start >= 0, "the Codex mixin varies its viewer controls");
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  assert.match(body, /const forwardable = !this\.actor\?\.isOwner && !this\.actor\?\.compendium\?\.locked;/);
  assert.match(body, /forwardable \? `\$\{super\.viewerControls\}, \.cdx-inj-medfail, \.cdx-inj-mechfail` : super\.viewerControls/);
});

test("Codex item sheets let viewers switch tabs", () => {
  assert.deepEqual(viewerControls(read("modules/items/codex-item-sheet.js"), "export class CodexItemSheet"), [".cdx-tab"]);
});

test("a viewer's header collapse is kept on the sheet, not saved to the actor", () => {
  const source = read("modules/actors/codex-sheets.js");
  assert.match(source, /if \(this\.isEditable\) await this\.actor\.update\(\{ "flags\.starwarsffg\.codexHeaderCollapsed": collapsed \}/);
  // Only while the sheet is read-only: once it is editable the saved flag rules,
  // or a viewer's earlier choice would keep overriding what the owner saves.
  assert.match(source, /const viewerCollapsed = this\.isEditable \? undefined : this\._cdxViewerHeaderCollapsed;\s*ctx\.cdxHeaderCollapsed = viewerCollapsed \?\? !!this\.actor\?\.getFlag\?\.\("starwarsffg", "codexHeaderCollapsed"\)/);
});

/** Source of `activateListeners` up to its editable-only early return. */
function beforeEditableGate(source) {
  const start = source.indexOf("  activateListeners(html) {");
  const gate = source.indexOf("if (!this.isEditable) return;", start);
  assert.ok(start >= 0 && gate > start);
  return { before: source.slice(start, gate), after: source.slice(gate) };
}

test("actor sheets let viewers expand item cards and force power / signature ability details", () => {
  const { before, after } = beforeEditableGate(read("modules/actors/actor-sheet-ffg.js"));
  for (const selector of ['".items .item, .header-description-block .item, .injuries .item"', '".force-power"', '".signature-ability"']) {
    assert.ok(before.includes(`html.find(${selector})`), `${selector} is bound for viewers`);
    assert.ok(!after.includes(`html.find(${selector})`), `${selector} is bound once`);
  }
});

test("item sheets let viewers open a career's pills and an attachment's innate talent", () => {
  const { before, after } = beforeEditableGate(read("modules/items/item-sheet-ffg.js"));
  // Only the career sheet renders .item-pill2; a species lists its talents as
  // .items .item rows, which were always bound for viewers.
  assert.equal(before.split('html.find(".item-pill2")').length - 1, 1, "career pills are bound for viewers, once");
  assert.ok(before.includes('html.find(".innate-talent-card")'), "innate talent cards are bound for viewers");
  assert.ok(!after.includes('html.find(".item-pill2")'));
  assert.ok(!after.includes('html.find(".innate-talent-card")'));
  // Removing a pill edits the item, so it stays behind the gate.
  assert.ok(!before.includes('html.find(".item-delete").on("click"'));
});
