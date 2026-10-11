/**
 * Every path Codex II serves or includes resolves: its own files under CODEX_ROOT, and the system
 * files it borrows (shared partials, dice images, the Elektra font). The system is the parent
 * folder while Codex ships inside it, or SWFFG_SYSTEM_DIR for the module (its CI checks the
 * system out); with neither, the borrowed paths are skipped.
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
