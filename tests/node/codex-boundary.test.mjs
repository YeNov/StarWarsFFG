/**
 * Until Codex II leaves for its own module it ships inside the system under codex/, and the two
 * sides meet only through the public API (modules/api/public-api.js): no system script imports a
 * Codex script, and Codex scripts import only files under codex/.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");

function walk(dir, keep, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

/** Every import / export-from / dynamic import specifier in a script. */
function specifiers(source) {
  const found = [];
  for (const match of source.matchAll(/(?:^|[;\s])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of source.matchAll(/(?:^|[;\s])import\s*["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) found.push(match[1]);
  return found;
}

test("no system script imports a Codex script", () => {
  for (const file of walk(path.join(ROOT, "modules"), (name) => name.endsWith(".js"))) {
    for (const spec of specifiers(fs.readFileSync(file, "utf8"))) {
      assert.doesNotMatch(spec, /(^|\/)codex\//, `${rel(file)} imports ${spec}`);
    }
  }
});

test("Codex scripts import only Codex files", () => {
  const scripts = walk(path.join(ROOT, "codex", "scripts"), (name) => name.endsWith(".js"));
  assert.ok(scripts.length > 0, "codex/scripts holds no scripts");
  const codexRoot = path.join(ROOT, "codex") + path.sep;
  for (const file of scripts) {
    for (const spec of specifiers(fs.readFileSync(file, "utf8"))) {
      assert.match(spec, /^\.\.?\//, `${rel(file)} imports ${spec}, which is not a relative path`);
      assert.ok(path.resolve(path.dirname(file), spec).startsWith(codexRoot), `${rel(file)} imports ${spec}, outside codex/`);
    }
  }
});

test("the system loads Codex as its own script, after its own", () => {
  const { esmodules } = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
  const system = esmodules.indexOf("modules/swffg-main.js");
  const codex = esmodules.indexOf("codex/scripts/codex-main.js");
  assert.ok(system >= 0, "system.json does not load modules/swffg-main.js");
  assert.ok(codex >= 0, "system.json does not load codex/scripts/codex-main.js");
  assert.ok(codex > system, "codex/scripts/codex-main.js must load after modules/swffg-main.js");
});

test("no system script, template or stylesheet names a Codex file or uses the Codex campaign-day keys", () => {
  const files = [
    ...walk(path.join(ROOT, "modules"), (name) => name.endsWith(".js")),
    ...walk(path.join(ROOT, "templates"), (name) => name.endsWith(".html")),
    ...walk(path.join(ROOT, "styles"), (name) => name.endsWith(".css")),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    // The campaign-day strings moved to the system catalog (campaign-day-strings.test.mjs); a system
    // file that went back to the Codex keys would show nothing in a world without Codex II.
    assert.doesNotMatch(source, /systems\/starwarsffg\/codex\/|templates\/(actors|items|parts)\/codex\/|styles\/cdx[\w-]*\.css|lang\/codex\/|SWFFG\.Codex\.CritTrauma\.(Day|EditDay)/, rel(file));
  }
  assert.equal(fs.existsSync(path.join(ROOT, "lang", "codex")), false, "lang/codex still exists");
});
