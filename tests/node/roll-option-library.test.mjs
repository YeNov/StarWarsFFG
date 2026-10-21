import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { ROLL_OPTION_LIBRARY, libraryEntryFor } from "../../modules/config/roll-option-library.js";
import { normalizeName, validateOptions } from "../../modules/helpers/roll-options.js";

/**
 * The first roll option library (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "The library").
 */

test("every library entry validates", () => {
  for (const entry of ROLL_OPTION_LIBRARY) assert.equal(validateOptions(entry.options).ok, true, entry.id);
});

test("the first iteration has exactly the eight entries", () => {
  assert.deepEqual(ROLL_OPTION_LIBRARY.map((e) => e.id).sort(),
    ["auto-fire", "frenzied-attack", "guns-blazing", "intense-focus", "point-blank", "saber-swarm", "sniper-shot", "true-aim"]);
});

test("names match across case, spacing and punctuation, within their kind", () => {
  for (const name of ["Auto-Fire", "auto fire ", "AUTOFIRE"]) assert.equal(libraryEntryFor("quality", name)?.id, "auto-fire");
  assert.equal(libraryEntryFor("talent", "Auto-fire"), null);
  assert.equal(libraryEntryFor("talent", "Point Blank (Improved)"), null);
  assert.equal(libraryEntryFor("talent", "point blank")?.id, "point-blank");
});

test("no two entries of a kind share a normalized name", () => {
  for (const kind of ["talent", "quality"]) {
    const names = ROLL_OPTION_LIBRARY.filter((e) => e.kind === kind).flatMap((e) => e.names.map(normalizeName));
    assert.equal(new Set(names).size, names.length, kind);
  }
});

test("Guns Blazing cancels exactly one Two weapons die", () => {
  assert.deepEqual(libraryEntryFor("talent", "Guns Blazing").options[0].dice, { difficulty: -1 });
});

test("each macro is named after the entry's first name", () => {
  for (const entry of ROLL_OPTION_LIBRARY) assert.equal(entry.macroName, `Roll option: ${entry.names[0]}`);
});
