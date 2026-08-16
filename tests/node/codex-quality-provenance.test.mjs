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

test("Codex styles all provenance as the same dim secondary line", () => {
  assert.match(codexCss, /\.quality-source-breakdown\s*\{/);
  assert.match(codexCss, /\.quality-source\s*\{[^}]*color:var\(--cdx-dim\)/s);
  assert.doesNotMatch(codexCss, /\.quality-source-(?:own|attachment)\s*\{[^}]*color:/s);
});

test("own-quality provenance is localized in the maintained English and Ukrainian catalogs", () => {
  const key = "SWFFG.Items.Sheets.Qualities.Own";
  assert.equal(english[key], "(own)");
  assert.equal(ukrainian[key], "(власна)");
});
