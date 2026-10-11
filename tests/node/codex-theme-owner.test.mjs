/**
 * The sheet-theme settings, the Codex house rules and the Configure Codex menu belong to Codex II,
 * which registers them itself. The system must never register, read or write them: a player whose
 * browser stored a Codex theme must still have it when the Codex II module comes back after a load
 * without it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CODEX_FILE = /^(codex|cdx)-/;

function systemScripts(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) systemScripts(full, out);
    else if (entry.name.endsWith(".js") && !CODEX_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

test("no system script registers, reads or writes the Codex theme settings", () => {
  // Reading the raw stored value (game.settings.storage…getItem) stays allowed: the Part 3
  // hand-off notice does that to tell a player their theme needs the module.
  for (const file of systemScripts(path.join(ROOT, "modules"))) {
    const source = fs.readFileSync(file, "utf8");
    const where = path.relative(ROOT, file);
    assert.doesNotMatch(source, /game\.settings\.(register|get|set)\(\s*"starwarsffg",\s*"(gmD|d)efaultSheetTheme"/, where);
    assert.doesNotMatch(source, /settings\.settings\.get\("starwarsffg\.(gmD|d)efaultSheetTheme"\)/, where);
  }
});

test("no system script registers the Configure Codex menu or the Codex house rules", () => {
  for (const file of systemScripts(path.join(ROOT, "modules"))) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /"codexSettings"|"codexAdvantageHealsStrain"|"codexTalentTierSorting"/, path.relative(ROOT, file));
  }
});
