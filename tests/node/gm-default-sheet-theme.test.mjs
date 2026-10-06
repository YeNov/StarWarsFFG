/**
 * The GM can set the table's default sheet theme. Each browser's own Default
 * Sheet Theme starts on "Use the GM's default" and follows the world setting;
 * a player who picks a theme of their own keeps it.
 */
import { setSetting, resetSettings } from "./_stub/foundry-stub.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { effectiveSheetTheme, FOLLOW_GM_SHEET_THEME } = await import("../../modules/helpers/sheet-theme.js");

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Seed this browser's choice and the GM's world default, then resolve. */
function themeFor(client, world) {
  resetSettings();
  if (client !== undefined) setSetting("starwarsffg", "defaultSheetTheme", client);
  if (world !== undefined) setSetting("starwarsffg", "gmDefaultSheetTheme", world);
  return effectiveSheetTheme();
}

test("a browser on Use the GM's default gets the GM's theme", () => {
  assert.equal(themeFor(FOLLOW_GM_SHEET_THEME, "codex-empire"), "codex-empire");
  assert.equal(themeFor(FOLLOW_GM_SHEET_THEME, "default"), "default");
});

test("a theme the player picked wins over the GM's", () => {
  assert.equal(themeFor("default", "codex-empire"), "default");
  assert.equal(themeFor("codex-dark", "default"), "codex-dark");
  assert.equal(themeFor("codex", "default"), "codex", "the legacy bare value still reads as Codex");
});

test("with nothing set anywhere the system sheets are used", () => {
  assert.equal(themeFor(FOLLOW_GM_SHEET_THEME, undefined), "default");
  assert.equal(themeFor(undefined, undefined), "default");
});

test("every reader of the theme goes through the resolver", () => {
  for (const path of ["modules/actors/actor-ffg.js", "modules/items/item-ffg.js", "modules/actors/codex-sheets.js"]) {
    const source = read(path);
    assert.match(source, /effectiveSheetTheme\(\)/, path);
    assert.doesNotMatch(source, /game\.settings\.get\("starwarsffg", "defaultSheetTheme"\)/, path);
  }
});

test("each browser starts on Use the GM's default, and the GM's setting is world-wide", () => {
  const source = read("modules/settings/settings-helpers.js");
  const gm = source.indexOf('game.settings.register("starwarsffg", "gmDefaultSheetTheme"');
  const client = source.indexOf('game.settings.register("starwarsffg", "defaultSheetTheme"');
  assert.ok(gm >= 0 && client > gm, "the GM's setting is registered first, so Configure Codex lists it first");
  const gmBlock = source.slice(gm, client);
  assert.match(gmBlock, /scope: "world"/);
  assert.match(gmBlock, /default: "default"/, "nothing changes until the GM picks a theme");
  const clientBlock = source.slice(client, source.indexOf("});", client));
  assert.match(clientBlock, /scope: "client"/);
  assert.match(clientBlock, /default: FOLLOW_GM_SHEET_THEME/);
  assert.match(clientBlock, /\[FOLLOW_GM_SHEET_THEME\]: /, "the follow choice is offered, so the startup self-heal keeps it");
});

test("a GM change reloads only the browsers that follow it", () => {
  const source = read("modules/settings/settings-helpers.js");
  const gm = source.indexOf('game.settings.register("starwarsffg", "gmDefaultSheetTheme"');
  const gmBlock = source.slice(gm, source.indexOf('game.settings.register("starwarsffg", "defaultSheetTheme"'));
  assert.match(gmBlock, /if \(game\.settings\.get\("starwarsffg", "defaultSheetTheme"\) === FOLLOW_GM_SHEET_THEME\) this\.debouncedReload\(\);/);
});

test("Configure Codex shows the GM's setting", () => {
  const source = read("modules/settings/ui-settings.js");
  const start = source.indexOf('"starwarsffg.defaultSheetTheme"');
  assert.ok(source.lastIndexOf('"starwarsffg.gmDefaultSheetTheme"', start) > source.lastIndexOf("includeSettingsNames", start));
});

test("a legacy theme value is reset to follow the GM, not to an explicit pick", () => {
  // An explicit "default" would stop that browser following the GM for good.
  assert.match(read("modules/swffg-main.js"), /game\.settings\.set\("starwarsffg", "defaultSheetTheme", cfg\.default\)/);
});

test("the settings module still parses", () => {
  // No Node test imports it (it needs Foundry), so a syntax slip there would
  // only show up as a broken world load.
  const file = fileURLToPath(new URL("../../modules/settings/settings-helpers.js", import.meta.url));
  execFileSync(process.execPath, ["--check", file]);
});
