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

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** The selector string a Codex class assigns to VIEWER_CONTROLS. */
function viewerControls(source, anchor) {
  const at = source.indexOf(anchor);
  assert.ok(at >= 0, `missing ${anchor}`);
  const match = source.slice(at).match(/static VIEWER_CONTROLS = "([^"]*)"/);
  assert.ok(match, `no VIEWER_CONTROLS after ${anchor}`);
  return match[1].split(",").map((part) => part.trim());
}

test("Codex actor sheets let viewers use tabs and the header toggle", () => {
  const source = read("scripts/codex-sheets.js");
  assert.deepEqual(viewerControls(source, "export const CodexSchemeMixin"), [".cdx-tab", ".cdx-hcollapse-btn"]);
  // Resilience rolls for the character, so it stays with the owner.
  assert.doesNotMatch(source, /VIEWER_CONTROLS[^;]*cdx-inj-resilience/);
});

test("the crit-failure markers stay usable only where the click can be forwarded to the GM", () => {
  // A non-owner's mark is forwarded to the GM. An owner on a read-only sheet (a
  // locked compendium) has no way to save it, and nor does anyone on a locked pack.
  const source = read("scripts/codex-sheets.js");
  const start = source.indexOf("  get viewerControls() {", source.indexOf("export const CodexSchemeMixin"));
  assert.ok(start >= 0, "the Codex mixin varies its viewer controls");
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  assert.match(body, /const forwardable = !this\.actor\?\.isOwner && !this\.actor\?\.compendium\?\.locked;/);
  assert.match(body, /forwardable \? `\$\{super\.viewerControls\}, \.cdx-inj-medfail, \.cdx-inj-mechfail` : super\.viewerControls/);
});

test("Codex item sheets let viewers switch tabs", () => {
  assert.deepEqual(viewerControls(read("scripts/codex-item-sheet.js"), "export class CodexItemSheet"), [".cdx-tab"]);
});

test("a viewer's header collapse is kept on the sheet, not saved to the actor", () => {
  const source = read("scripts/codex-sheets.js");
  assert.match(source, /if \(this\.isEditable\) await this\.actor\.update\(\{ "flags\.starwarsffg\.codexHeaderCollapsed": collapsed \}/);
  // Only while the sheet is read-only: once it is editable the saved flag rules,
  // or a viewer's earlier choice would keep overriding what the owner saves.
  assert.match(source, /const viewerCollapsed = this\.isEditable \? undefined : this\._cdxViewerHeaderCollapsed;\s*ctx\.cdxHeaderCollapsed = viewerCollapsed \?\? !!this\.actor\?\.getFlag\?\.\("starwarsffg", "codexHeaderCollapsed"\)/);
});
