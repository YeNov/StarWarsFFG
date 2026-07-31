import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../modules/actors/codex-sheets.js", import.meta.url), "utf8");

test("Codex actor renders preserve unchanged decoded portrait nodes", () => {
  assert.match(source, /this\._cdxPreviousPortrait = portrait/);
  assert.match(source, /this\._cdxPreviousPortraitSrc = portrait\?\.getAttribute\("src"\)/);
  assert.match(source, /this\._cdxPreviousPortraitSrc === currentSrc/);
  assert.match(source, /current\.replaceWith\(previous\)/);
});
