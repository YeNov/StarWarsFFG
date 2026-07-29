import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SHEET_SOURCE = fs.readFileSync(
  new URL("../../modules/items/item-sheet-ffg.js", import.meta.url),
  "utf8",
);
const CODEX_TEMPLATE = fs.readFileSync(
  new URL("../../templates/items/codex/codex-specialization.html", import.meta.url),
  "utf8",
);

test("specialization talent drops bind to the currently rendered sheet", () => {
  const specializationListeners = SHEET_SOURCE.match(
    /if \(this\.object\.type === "specialization"\)([\s\S]*?)else if \(this\.object\.type === "career"\)/,
  )?.[1] ?? "";

  assert.match(specializationListeners, /dropSelector:\s*"\.specialization-talent"/);
  assert.match(specializationListeners, /dragDrop\.bind\(html\[0\]\)/);
  assert.doesNotMatch(
    specializationListeners,
    /dragDrop\.bind\(\$\(`form\.editable\.item-sheet-/,
  );
});

test("Codex specialization slots preserve the vanilla drop contract", () => {
  assert.match(CODEX_TEMPLATE, /class="cdx-ft-node specialization-talent /);
  assert.match(CODEX_TEMPLATE, /id="\{\{key\}\}"/);
  assert.match(CODEX_TEMPLATE, /name="data\.talents\.\{\{key\}\}\.itemId"/);
});
