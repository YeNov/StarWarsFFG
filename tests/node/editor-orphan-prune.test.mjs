import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sheetSource = fs.readFileSync(path.join(root, "modules/apps/ffg-document-sheet.js"), "utf8");

// A re-render that lands while a ProseMirror editor is open detaches the mounted
// `.editor-content` node (ProseMirror mounts with `{mount: target}`), so the editor
// can never be saved or closed and its `this.editors` entry is orphaned. If the
// open-guard only tests `instance.view`, that orphan bricks the Edit pencil for the
// rest of the sheet's life -- the "Codex biography can only be edited once" bug.

test("editor liveness is judged by whether the mounted view is still in the document", () => {
  assert.match(sheetSource, /_isEditorLive\(state\) \{\s*const dom = state\?\.instance\?\.view\?\.dom;\s*return !!dom && dom\.isConnected;/);
});

test("the open-guard rejects an orphaned editor so the Edit pencil still mounts", () => {
  assert.match(sheetSource, /if \(this\._isEditorLive\(this\.editors\[name\]\)\) return;/);
  assert.doesNotMatch(sheetSource, /if \(this\.editors\[name\]\?\.instance\?\.view\) return;/);
});

test("every render prunes editors orphaned by the previous one", () => {
  assert.match(sheetSource, /_activateEditors\(\) \{[\s\S]{0,200}?this\._pruneDetachedEditors\(\);/);
  assert.match(sheetSource, /_pruneDetachedEditors\(\) \{[\s\S]*?if \(state\?\.instance && !this\._isEditorLive\(state\)\) this\._destroyEditor\(name\);/);
});

test("an editor still mounting (instance not yet assigned) is not pruned", () => {
  assert.match(sheetSource, /if \(state\?\.instance && !this\._isEditorLive\(state\)\)/);
});
