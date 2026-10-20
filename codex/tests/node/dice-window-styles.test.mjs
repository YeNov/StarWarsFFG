/**
 * `.cdx-dice` marks the dice windows drawn on the dark dialog: the Replace Die dialogs always, and
 * the roll builder when the rolling actor uses a Codex II sheet. Their styling is the system's --
 * every user sees the Replace Die dialogs -- so it lives in the system stylesheets (mandar.css for
 * the default theme, starwarsffg.css and its SCSS for the retired Default theme), not in cdx.css.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Paths are relative to the Codex package root (codex/ here, the module repository later).
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the Codex stylesheet no longer carries the dice-window rules", () => {
  assert.doesNotMatch(read("styles/cdx.css"), /^\.cdx-dice /m);
});
