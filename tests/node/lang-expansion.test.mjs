/**
 * Every localization file must survive Foundry's expansion.
 *
 * `Localization#loadTranslationFile` runs `foundry.utils.expandObject` over the
 * parsed JSON, which walks each dotted key with `setProperty`. A key whose prefix is
 * already a STRING ("SWFFG.Talents" plus "SWFFG.Talents.Stacking.NotRanked") makes
 * that throw, and Foundry catches the failure by falling back to `{}` -- so ONE bad
 * key silently drops the whole file and every label in the system goes missing.
 *
 * This reproduces `expandObject`/`setProperty` exactly as core implements them
 * (App/resources/app/public/scripts/foundry.mjs) and asserts no file collides.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKIPPED_PROPERTIES = new Set(["__proto__", "prototype", "constructor"]);

/** Core's foundry.utils.setProperty, verbatim in behaviour. */
function setProperty(object, key, value) {
  if (!key || SKIPPED_PROPERTIES.has(key)) return false;
  let target = object;
  if (key.indexOf(".") !== -1) {
    const parts = key.split(".");
    if (parts.some((p) => SKIPPED_PROPERTIES.has(p))) return false;
    key = parts.pop();
    target = parts.reduce((t, p) => {
      if (!(p in t)) t[p] = {};
      return t[p];
    }, object);
  }
  if (!(key in target) || (target[key] !== value)) {
    target[key] = value;
    return true;
  }
  return false;
}

const root = new URL("../../", import.meta.url);
const langDirs = ["lang", "lang/codex"];
const files = langDirs.flatMap((dir) => {
  const full = new URL(`${dir}/`, root);
  return fs.readdirSync(full)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ label: path.posix.join(dir, name), url: new URL(name, full) }));
});

test("there is at least one localization file to check", () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  test(`${file.label} expands without a key collision`, () => {
    const json = JSON.parse(fs.readFileSync(file.url, "utf8").replace(/^﻿/, ""));
    const expanded = {};
    for (const [key, value] of Object.entries(json)) {
      assert.doesNotThrow(
        () => setProperty(expanded, key, value),
        `"${key}" collides with a key that is already a string - Foundry would drop all of ${file.label}`,
      );
    }
  });
}
