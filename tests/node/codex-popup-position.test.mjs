import test from "node:test";
import assert from "node:assert/strict";

import { placeCodexPopup } from "../../modules/actors/codex-popup-position.js";

test("Codex popup prefers below its anchor and stays horizontally centered", () => {
  assert.deepEqual(
    placeCodexPopup(
      { left: 100, top: 50, bottom: 70, width: 40 },
      { width: 120, height: 60 },
      { width: 500, height: 400 },
    ),
    { left: 60, top: 76 },
  );
});

test("Codex popup flips above instead of crossing the viewport bottom", () => {
  assert.deepEqual(
    placeCodexPopup(
      { left: 200, top: 330, bottom: 350, width: 40 },
      { width: 150, height: 80 },
      { width: 500, height: 400 },
    ),
    { left: 145, top: 244 },
  );
});

test("Codex popup clamps against every viewport edge", () => {
  assert.deepEqual(
    placeCodexPopup(
      { left: -30, top: 4, bottom: 14, width: 10 },
      { width: 140, height: 390 },
      { width: 300, height: 400 },
    ),
    { left: 8, top: 8 },
  );
});
