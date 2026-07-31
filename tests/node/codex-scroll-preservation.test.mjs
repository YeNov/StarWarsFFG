import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sheetSource = fs.readFileSync(path.join(root, "modules/apps/ffg-document-sheet.js"), "utf8");
const codexCss = fs.readFileSync(path.join(root, "styles/cdx.css"), "utf8");

test("sheet renders preserve outer and Codex container scroll positions", () => {
  assert.match(sheetSource, /form:\s*\{ top: form\.scrollTop, left: form\.scrollLeft \}/);
  for (const selector of [".cdx-item-body", ".cdx-pane.active", ".cdx-idesc", ".editor-content", ".cdx-xp-log"]) {
    assert.ok(sheetSource.includes(`"${selector}"`), `missing Codex scroll selector ${selector}`);
  }
  assert.match(sheetSource, /positions\.containers\.push\(\{ selector, index, top: element\.scrollTop, left: element\.scrollLeft \}\)/);
  assert.match(sheetSource, /this\._restoreScrollPositions\(this\._ffgScrollPositions\)/);
  assert.doesNotMatch(sheetSource, /if \(this\._ffgScrollTop/);
});

test("restoration changes a position only when the new content requires clamping", () => {
  assert.match(sheetSource, /const maxTop = Math\.max\(0, element\.scrollHeight - element\.clientHeight\)/);
  assert.match(sheetSource, /element\.scrollTop = Math\.min\(Math\.max\(0, position\.top\), maxTop\)/);
  assert.match(sheetSource, /element\.scrollLeft = Math\.min\(Math\.max\(0, position\.left\), maxLeft\)/);
  assert.match(codexCss, /\.cdx > form\.window-content,[\s\S]*?\.cdx \.cdx-xp-log \{ overflow-anchor:none; \}/);
});

test("the final restore runs after ApplicationV2's post-render positioning", () => {
  assert.match(sheetSource, /this\._ffgScrollRestoreFrame = requestAnimationFrame\(\(\) => \{/);
  assert.match(sheetSource, /this\._restoreScrollPositions\(this\._ffgScrollPositions\);\s*this\._queueFinalScrollRestore\(this\._ffgScrollPositions\)/);
  assert.match(sheetSource, /cancelAnimationFrame\(this\._ffgScrollRestoreFrame\)/);
});
