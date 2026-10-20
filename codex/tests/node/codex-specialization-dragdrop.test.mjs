import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const CODEX_TEMPLATE = read("templates/items/codex-specialization.html");

test("Codex specialization slots preserve the vanilla drop contract", () => {
  assert.match(CODEX_TEMPLATE, /class="cdx-ft-node specialization-talent /);
  assert.match(CODEX_TEMPLATE, /id="\{\{key\}\}"/);
  assert.match(CODEX_TEMPLATE, /name="data\.talents\.\{\{key\}\}\.itemId"/);
});
