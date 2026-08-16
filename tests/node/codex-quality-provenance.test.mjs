import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const template = read("templates/parts/ffg-mods.html");
const itemSheet = read("modules/items/item-sheet-ffg.js");
const codexCss = read("styles/cdx.css");
const parseJson = (rel) => JSON.parse(read(rel).replace(/^\uFEFF/, ""));
const english = parseJson("lang/en.json");
const ukrainian = parseJson("lang/ua.json");
const catalogs = fs.readdirSync(path.join(root, "lang"))
  .filter(file => file.endsWith(".json"))
  .map(file => [file, parseJson(`lang/${file}`)]);

test("quality summaries retain separate own-item and attachment rank sources", () => {
  assert.match(itemSheet, /summarizedRanks:\s*\{\s*mods:\s*0/);
  assert.match(itemSheet, /summarizedRanks:\s*\{\s*\[source\]:\s*0/);
});

test("quality rows visibly render both own and attachment provenance", () => {
  assert.match(template, /class="quality-source-breakdown"/);
  assert.match(template, /each item\.summarizedRanks as \|rankIndex rankSource\|/);
  assert.match(template, /eq rankSource "mods"/);
  assert.match(template, /quality-source-own">\{\{#if \(ne rankIndex 0\)\}\}/);
  assert.match(template, /SWFFG\.Items\.Sheets\.Qualities\.Own/);
  assert.match(template, /quality-source-attachment">\{\{#if \(ne rankIndex 0\)\}\}/);
  assert.match(template, /SWFFG\.Items\.Sheets\.Qualities\.FromAttachment/);
});

test("attachment-only rows do not repeat the legacy provenance label in the controls column", () => {
  const controls = template.match(/<div class="item-controls">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.doesNotMatch(controls, /FromAttachment/);
});

test("Codex styles all provenance as the same dim secondary line", () => {
  assert.match(codexCss, /\.quality-source-breakdown\s*\{/);
  assert.match(codexCss, /\.quality-source\s*\{[^}]*color:var\(--cdx-dim\)/s);
  assert.doesNotMatch(codexCss, /\.quality-source-(?:own|attachment)\s*\{[^}]*color:/s);
});

test("active quality provenance is localized in the maintained English and Ukrainian catalogs", () => {
  const ownKey = "SWFFG.Items.Sheets.Qualities.Own";
  const attachmentKey = "SWFFG.Items.Sheets.Qualities.FromAttachment";
  assert.equal(english[ownKey], "(own)");
  assert.equal(ukrainian[ownKey], "(власна)");
  assert.equal(english[attachmentKey], "(from attachment)");
  assert.equal(ukrainian[attachmentKey], "(від обвісу)");
});

test("removed attachment provenance localization keys are not orphaned in any catalog", () => {
  const removedKeys = ["SWFFG.FromAttachment", "SWFFG.Items.Sheets.Qualities.Ranks"];
  for (const [file, catalog] of catalogs) {
    for (const key of removedKeys) {
      assert.equal(catalog[key], undefined, `${key} remains in ${file}`);
    }
  }
});
