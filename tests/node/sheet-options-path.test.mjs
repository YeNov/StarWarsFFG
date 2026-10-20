/**
 * Sheet Options normally persists each option as a `flags.starwarsffg.config.*`
 * flag. An option registered with a `path` is document data that other code reads
 * -- the vehicle defence-zone override lives in `system.stats.defenceZones`, where
 * the roll dialog finds it on the targeted vehicle -- so it must be read from and
 * written to that path instead.
 *
 * The rules for where an option is read from and written to are pure, so they are tested
 * here (`modules/helpers/sheet-option-storage.js`). The dialog, the document update and the
 * sheet redraw need Foundry and are checked there; the two source checks at the end only
 * stand in for that until the Foundry cases replace them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";

import { readSheetOptionValue, sheetOptionWritePath } from "../../modules/helpers/sheet-option-storage.js";

const { getProperty, setProperty } = foundry.utils;

const read = (document, name, option) => readSheetOptionValue(document, name, option, getProperty);

const zoneOption = { type: "Array", default: "auto", path: "system.stats.defenceZones" };
const flagOption = { type: "Boolean", default: true };

test("a path option reads its value from the document, not from a config flag", () => {
  const document = {
    system: { stats: { defenceZones: "two" } },
    flags: { starwarsffg: { config: { defenceZones: "four" } } },
  };
  assert.equal(read(document, "defenceZones", zoneOption), "two");
});

test("a path option with nothing stored falls back to its default", () => {
  assert.equal(read({ system: { stats: {} }, flags: {} }, "defenceZones", zoneOption), "auto");
});

test("a flag option still reads its config flag", () => {
  const document = { flags: { starwarsffg: { config: { enableSensors: false } } } };
  assert.equal(read(document, "enableSensors", flagOption), false);
});

test("a flag option with nothing stored falls back to its default", () => {
  assert.equal(read({}, "enableSensors", flagOption), true);
  assert.equal(read({ flags: { starwarsffg: {} } }, "enableSensors", flagOption), true);
});

test("a stored value that is falsy is kept, not replaced by the default", () => {
  assert.equal(read({ system: { stats: { defenceZones: "" } } }, "defenceZones", zoneOption), "");
  assert.equal(read({ flags: { starwarsffg: { config: { medicalItemName: "" } } } }, "medicalItemName",
    { type: "String", default: "Medpac" }), "");
});

test("reading an option never writes to the document", () => {
  // Frozen all the way down: a read that seeded the default into the document would throw.
  const deepFreeze = (value) => {
    if (value && typeof value === "object") Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };
  const document = deepFreeze({ system: { stats: {} }, flags: { starwarsffg: { config: {} } } });
  assert.equal(read(document, "defenceZones", zoneOption), "auto");
  assert.equal(read(document, "enableSensors", flagOption), true);
});

test("Accept writes a path option to its path", () => {
  assert.equal(sheetOptionWritePath(zoneOption, "config.defenceZones"), "system.stats.defenceZones");
});

test("Accept writes every other option to a flag named after its control", () => {
  assert.equal(sheetOptionWritePath(flagOption, "config.enableSensors"), "flags.starwarsffg.config.enableSensors");
});

test("what Accept writes is what the next read returns, for a path option and a flag option", () => {
  const document = { system: { stats: {} }, flags: {} };
  setProperty(document, sheetOptionWritePath(zoneOption, "config.defenceZones"), "four");
  setProperty(document, sheetOptionWritePath(flagOption, "config.enableSensors"), false);
  assert.equal(read(document, "defenceZones", zoneOption), "four");
  assert.equal(read(document, "enableSensors", flagOption), false);
  // and the path option did not leave a flag behind
  assert.equal(document.flags.starwarsffg?.config?.defenceZones, undefined);
});

// Source checks, awaiting their Foundry replacements (Sheet Options opened on a vehicle, Accept,
// the stored values read back, the sheet redrawn).

test("Accept writes a path option to its path and every other option to its flag", () => {
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg-options.js", import.meta.url), "utf8");
  assert.match(source, /updateObject\[sheetOptionWritePath\(option, control\.name\)\] = value/);
});

test("the stock vehicle sheet carries no zone picker; Sheet Options sets the override", () => {
  // The in-sheet select submitted with render:false, so the zones never redrew until
  // a reload. The override now lives only in Sheet Options, which re-renders on save.
  const markup = fs.readFileSync(new URL("../../templates/actors/ffg-vehicle-sheet.html", import.meta.url), "utf8");
  assert.doesNotMatch(markup, /name="data\.stats\.defenceZones"/);
  const sheet = fs.readFileSync(new URL("../../modules/actors/actor-sheet-ffg.js", import.meta.url), "utf8");
  assert.match(sheet, /register\("defenceZones",[\s\S]{0,400}path: "system\.stats\.defenceZones"/);
});
