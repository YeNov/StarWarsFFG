/**
 * Every path Codex II serves or includes resolves: its own files under CODEX_ROOT, and the system
 * files it borrows (shared partials, dice images, the Elektra font). The system is the parent
 * folder while Codex ships inside it, or SWFFG_SYSTEM_DIR for the module (its CI checks the
 * system out); with neither, the borrowed paths are skipped.
 *
 * codex-main.js builds the paths it loads from its CODEX_TEMPLATES and CODEX_STYLESHEETS lists, so
 * those lists are checked against the package, and so is the English file every language falls
 * back to. Its template preload is also what registers each Codex partial, so every Codex partial
 * a template includes must be in CODEX_TEMPLATES.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = fileURLToPath(new URL("../../", import.meta.url));
const CODEX_ROOT = fs.readFileSync(path.join(PACKAGE, "scripts", "codex-paths.js"), "utf8")
  .match(/export const CODEX_ROOT = "([^"]+)";/)?.[1];
const SYSTEM = fs.existsSync(path.join(PACKAGE, "..", "system.json"))
  ? path.join(PACKAGE, "..")
  : process.env.SWFFG_SYSTEM_DIR ?? null;

function walk(dir, keep, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

/** A served path as a file on disk; undefined for a system file when no system is at hand. */
function fileFor(served) {
  const clean = decodeURI(served.replace(/^\//, "").replace(/[?#].*$/, ""));
  if (clean.startsWith(`${CODEX_ROOT}/`)) return path.join(PACKAGE, clean.slice(CODEX_ROOT.length + 1));
  if (clean.startsWith("systems/starwarsffg/")) return SYSTEM ? path.join(SYSTEM, clean.slice("systems/starwarsffg/".length)) : undefined;
  return null;
}

function assertServed(served, where) {
  const file = fileFor(served);
  if (file === undefined) return;
  assert.ok(file, `${where}: ${served} is neither Codex's nor the system's`);
  assert.ok(fs.existsSync(file), `${where}: ${served} does not exist`);
}

const MAIN = fs.readFileSync(path.join(PACKAGE, "scripts", "codex-main.js"), "utf8");

/** The entries of codex-main.js's `const <name> = [ … ];`, which must hold only plain strings. */
function mainList(name) {
  const body = MAIN.match(new RegExp(`\\bconst ${name} = \\[([^\\]]*)\\];`))?.[1];
  assert.ok(body, `codex-main.js no longer declares ${name} as a list`);
  assert.equal(body.replace(/"[^"]*"/g, "").replace(/[\s,]/g, ""), "", `${name} holds more than plain strings; this test cannot read it`);
  const entries = [...body.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  assert.ok(entries.length > 0, `${name} lists nothing`);
  return entries;
}

test("CODEX_ROOT is declared", () => {
  assert.ok(CODEX_ROOT, "codex-paths.js does not export CODEX_ROOT");
});

test("every template include resolves", () => {
  for (const file of walk(path.join(PACKAGE, "templates"), (name) => name.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/\{\{#?>\s*"([^"]+)"/g)) assertServed(match[1], path.relative(PACKAGE, file));
  }
});

test("every stylesheet url resolves", () => {
  for (const file of walk(path.join(PACKAGE, "styles"), (name) => name.endsWith(".css"))) {
    const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const url = match[1];
      if (url.startsWith("data:")) continue;
      // Resolve the way the browser does: against the stylesheet's own served URL.
      const served = new URL(url, `https://foundry.invalid/${CODEX_ROOT}/styles/${path.basename(file)}`).pathname;
      assertServed(served, path.relative(PACKAGE, file));
    }
  }
});

test("every image a script loads resolves", () => {
  for (const file of walk(path.join(PACKAGE, "scripts"), (name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/`\/?\$\{CODEX_ROOT\}\/([^`]+)`/g)) {
      if (match[1].includes("${")) continue;
      assertServed(`${CODEX_ROOT}/${match[1]}`, path.relative(PACKAGE, file));
    }
  }
});

test("every template codex-main.js preloads exists", () => {
  for (const template of mainList("CODEX_TEMPLATES")) {
    assert.ok(fs.existsSync(path.join(PACKAGE, template)), `CODEX_TEMPLATES lists ${template}, which does not exist`);
  }
});

test("every stylesheet codex-main.js links exists", () => {
  for (const name of mainList("CODEX_STYLESHEETS")) {
    assert.ok(fs.existsSync(path.join(PACKAGE, "styles", `${name}.css`)), `CODEX_STYLESHEETS lists ${name}, but styles/${name}.css does not exist`);
  }
});

test("the English strings every language falls back to exist", () => {
  assert.ok(fs.existsSync(path.join(PACKAGE, "lang", "en.json")), "lang/en.json does not exist");
});

test("every Codex partial a template includes is preloaded, which registers it", () => {
  // Handlebars finds a partial only under the exact name it was registered with: the served path
  // codex-main.js hands to loadTemplates.
  const registered = new Set(mainList("CODEX_TEMPLATES").map((template) => `${CODEX_ROOT}/${template}`));
  let codexIncludes = 0;
  for (const file of walk(path.join(PACKAGE, "templates"), (name) => name.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/\{\{#?>\s*"([^"]+)"/g)) {
      if (!match[1].replace(/^\//, "").startsWith(`${CODEX_ROOT}/`)) continue;
      codexIncludes++;
      assert.ok(registered.has(match[1]), `${path.relative(PACKAGE, file)}: ${match[1]} is not in CODEX_TEMPLATES, so no partial is registered under that name`);
    }
  }
  assert.ok(codexIncludes > 0, "no template includes a Codex partial; the include scan is broken");
});
