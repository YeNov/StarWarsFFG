import test from "node:test";
import assert from "node:assert/strict";

import { placeCodexPopup } from "../../scripts/codex-popup-position.js";

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

test("Codex popup stays inside the viewport on all four sides", () => {
  const viewport = { width: 300, height: 400 };
  const place = (anchor, popup) => placeCodexPopup(anchor, popup, viewport);

  // Left: an anchor past the left edge would centre the popup at -95; it stops at the 8px padding.
  assert.deepEqual(
    place({ left: -30, top: 50, bottom: 70, width: 10 }, { width: 140, height: 60 }),
    { left: 8, top: 76 },
    "left edge",
  );
  // Right: centred on this anchor the popup would end at 355; it stops 8px short of the 300px edge.
  assert.deepEqual(
    place({ left: 280, top: 50, bottom: 70, width: 10 }, { width: 140, height: 60 }),
    { left: 152, top: 76 },
    "right edge",
  );
  // Top: too tall to fit below or above, so it sits at the top padding.
  assert.deepEqual(
    place({ left: 100, top: 4, bottom: 14, width: 10 }, { width: 140, height: 390 }),
    { left: 35, top: 8 },
    "top edge",
  );
  // Bottom: an anchor below the viewport flips the popup above it, which is still past the bottom
  // edge; it stops 8px short of the 400px edge.
  assert.deepEqual(
    place({ left: 100, top: 450, bottom: 470, width: 10 }, { width: 140, height: 80 }),
    { left: 35, top: 312 },
    "bottom edge",
  );
  // A corner: the first original case, clamped on the left and the top at once.
  assert.deepEqual(
    place({ left: -30, top: 4, bottom: 14, width: 10 }, { width: 140, height: 390 }),
    { left: 8, top: 8 },
    "top-left corner",
  );
});
