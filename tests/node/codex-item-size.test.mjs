import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../modules/items/codex-item-sheet.js", import.meta.url), "utf8");

test("dense Codex equipment sheets use wider defaults and resize floors", () => {
  for (const [type, defaultWidth, minWidth] of [
    ["weapon", 650, 600],
    ["shipweapon", 650, 600],
    ["armour", 550, 500],
    ["gear", 550, 500],
  ]) {
    assert.match(source, new RegExp(`${type}: \\{ default: ${defaultWidth}, min: ${minWidth} \\}`));
  }
  assert.match(source, /const setCodexInitialSize = !this\._cdxSizeInitialized/);
  assert.match(source, /CODEX_EQUIPMENT_WIDTHS\[this\.item\?\.type\]\?\.default/);
  assert.match(source, /Math\.max\(dimensions\.width, width\)/);
});
