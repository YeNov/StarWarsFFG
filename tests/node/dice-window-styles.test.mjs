/**
 * `.cdx-dice` marks the dice windows drawn on the dark dialog: the Replace Die dialogs always, and
 * the roll builder when the rolling actor uses a Codex II sheet. Their styling is the system's --
 * every user sees the Replace Die dialogs -- so it lives in the system stylesheets (mandar.css for
 * the default theme, starwarsffg.css and its SCSS for the retired Default theme), not in cdx.css.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SELECTORS = [
  ".cdx-dice .dice-pool { background:transparent !important; }",
  ".cdx-dice .dice-pool .ffg-die-icon {",
  ".cdx-dice .dice-pool .ffg-die-icon img {",
  ".cdx-dice .dice-pool-dialog span.dietype.setback, .cdx-dice .dice-pool-dialog span.dietype.dark {",
  ".cdx-dice .dice-pool-dialog span.dietype:is(",
  ".cdx-dice .pool-additional-container {",
  ".cdx-dice .pool-additional-container td:nth-child(3n+1) {",
  ".cdx-dice .pool-additional-container td:nth-child(3n+2) {",
  ".cdx-dice .pool-additional-container td:nth-child(3n) {",
  '.cdx-dice .pool-additional-container input[type="button"] {',
  '.cdx-dice .dice-pool img[src*="black.png"], .cdx-dice .dice-pool img[src*="black-minus"], .cdx-dice .dice-pool img[src*="darkpip"] {',
  ".cdx-dice .dice-pool img:is(",
  '.cdx-dice .pool-dice-pool img[src*="black.png"] {',
];

for (const path of ["styles/mandar.css", "styles/starwarsffg.css", "scss/global/_v2_layout.scss"]) {
  test(`${path} styles the dice windows`, () => {
    const css = read(path);
    for (const selector of SELECTORS) assert.ok(css.includes(selector), `${path} lacks ${selector}`);
  });
}
