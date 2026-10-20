import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const codexCss = read("styles/cdx.css");

test("Codex styles all provenance as the same dim secondary line", () => {
  assert.match(codexCss, /\.quality-source-breakdown\s*\{/);
  assert.match(codexCss, /\.quality-source\s*\{[^}]*color:var\(--cdx-dim\)/s);
  assert.doesNotMatch(codexCss, /\.quality-source-(?:own|attachment)\s*\{[^}]*color:/s);
});
