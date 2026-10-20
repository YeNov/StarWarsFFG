/**
 * Worlds store a sheet picked in ⚙ Sheet as flags.core.sheetClass ("ffg.CodexActorSheet",
 * "ffg.CodexAdversarySheet", "ffg.CodexItemSheet"). Foundry builds that id as
 * `${scope}.${class name}` and opens the default sheet for an id nobody registered, so the "ffg"
 * scope and these class names can never change: every document set to a Codex sheet would
 * silently fall back to the default sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** The collection each stored id is registered on, and its class. */
const STORED = [
  ["Actors", "CodexActorSheet"],
  ["Actors", "CodexAdversarySheet"],
  ["Items", "CodexItemSheet"],
];

// A class rename also breaks the registration below, but an import alias would hide it there: the
// registration would still use the old name while Foundry reads the class's own name. So both are checked.
test("each Codex sheet class is declared and registered under the scope and name worlds have stored", () => {
  const main = read("scripts/codex-main.js");
  const scripts = fs.readdirSync(new URL("../../scripts/", import.meta.url))
    .filter((name) => name.endsWith(".js"))
    .map((name) => read(`scripts/${name}`))
    .join("\n");
  for (const [collection, cls] of STORED) {
    assert.match(main, new RegExp(`\\b${collection}\\.registerSheet\\(\\s*(["'])ffg\\1,\\s*${cls}\\s*,`),
      `${collection}.registerSheet must keep scope "ffg" for ${cls}, or "ffg.${cls}" stops resolving`);
    assert.match(scripts, new RegExp(`\\bclass ${cls}\\b`), `no class named ${cls} in codex/scripts`);
  }
});
