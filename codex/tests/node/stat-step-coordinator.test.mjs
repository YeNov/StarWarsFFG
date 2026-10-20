import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("predicted current inputs cannot leak into whole-form submissions", () => {
  const template = read("templates/parts/cdx-ratio-chip.html");
  const input = template.match(/<input class="cdx-ratio-c"[^>]*>/)?.[0];
  assert.ok(input);
  assert.doesNotMatch(input, /\bname=/);
  assert.match(input, /data-cdx-edit-path=/);
});
