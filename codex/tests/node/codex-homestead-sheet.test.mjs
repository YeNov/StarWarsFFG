/**
 * The Codex homestead sheet. A homestead stores its cost and consumables at
 * system.cost / system.consumables (no `stats` block, unlike a vehicle), its
 * upgrades are homesteadupgrade items and everything else it holds is storage.
 * The sheet relies on the stock listeners for edit, delete, quantity and the
 * card-click details, so the hook classes they look for must stay in the markup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const TEMPLATE = "templates/actors/codex-homestead.html";

test("homestead actors are offered the Codex sheet and its template is preloaded", () => {
  const main = read("scripts/codex-main.js");
  const types = main.match(/export const CODEX_ACTOR_TYPES = \[([^\]]*)\]/);
  assert.ok(types, "CODEX_ACTOR_TYPES is declared");
  assert.match(types[1], /"homestead"/);
  assert.match(main, new RegExp(`"${TEMPLATE}"`));
  assert.ok(fs.existsSync(new URL(`../../${TEMPLATE}`, import.meta.url)));
});

test("the sheet's template getter resolves a homestead to codex-homestead.html", () => {
  const source = read("scripts/codex-sheets.js");
  const start = source.indexOf("export class CodexActorSheet");
  const body = source.slice(start, source.indexOf("\n}\n", start));
  // Every type outside the character family maps to codex-<type>.html.
  assert.match(body, /\["character", "rival", "nemesis"\]\.includes\(t\) \? "character" : t/);
  assert.match(body, /`\$\{CDX_TEMPLATES\}\/codex-\$\{name\}\.html`/);
});

test("cost and consumables bind the homestead's own fields, not a vehicle's stats block", () => {
  const html = read(TEMPLATE);
  for (const name of ["data.cost.value", "data.consumables.value", "data.consumables.duration"]) {
    assert.match(html, new RegExp(`name="${name.replace(/\./g, "\\.")}"`), `${name} is bound`);
  }
  assert.doesNotMatch(html, /data\.stats\./);
  assert.match(html, /\{\{editor cdxHomeBio target="system\.biography"/);
});

test("the upgrade and storage cards keep the stock listener hooks", () => {
  const html = read(TEMPLATE);
  // The stock card-click details toggle binds `.items .item`.
  assert.match(html, /class="cdx-pane items" data-tab="upgrades"/);
  assert.match(html, /class="cdx-gear items cdx-home-storage"/);
  for (const hook of ["item-edit", "item-delete", "item-quantity", "quantity decrease", "quantity increase"]) {
    assert.ok(html.includes(hook), `${hook} is present`);
  }
  // Upgrades get their own add button (the stock .item-add would name one "Gear").
  assert.match(html, /class="cdx-home-add-upgrade"/);
  assert.match(read("scripts/codex-sheets.js"), /\.cdx-home-add-upgrade"[\s\S]{0,400}type: "homesteadupgrade"/);
});

test("storage is every item that is not an upgrade", () => {
  const source = read("scripts/codex-sheets.js");
  assert.match(source, /ctx\.cdxHomeUpgrades = ctx\.cdxItems\.filter\(\(i\) => i\.type === "homesteadupgrade"\)/);
  assert.match(source, /ctx\.cdxHomeStorage = ctx\.cdxItems\.filter\(\(i\) => i\.type !== "homesteadupgrade"\)/);
});

test("a limited viewer sees only the header", () => {
  const html = read(TEMPLATE);
  const unless = html.indexOf("{{#unless limited}}");
  assert.ok(unless > html.indexOf("</header>"), "the limited gate follows the header");
  assert.ok(unless < html.indexOf('<nav class="cdx-tabstrip">'), "the tabs are behind the limited gate");
});

test("the Codex strings the homestead sheet uses exist", () => {
  const lang = JSON.parse(read("lang/en.json"));
  for (const key of new Set(read(TEMPLATE).match(/SWFFG\.Codex\.[A-Za-z.]+/g))) {
    assert.ok(key in lang, `${key} is in codex/lang/en.json`);
  }
});
