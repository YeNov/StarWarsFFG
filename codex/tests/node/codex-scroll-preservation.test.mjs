import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const codexCss = read("styles/cdx.css");

test("Codex containers opt out of scroll anchoring", () => {
  assert.match(codexCss, /\.cdx > form\.window-content,[\s\S]*?\.cdx \.cdx-xp-log \{ overflow-anchor:none; \}/);
});
