/**
 * Sheet Options normally persists each option as a `flags.starwarsffg.config.*`
 * flag. An option registered with a `path` is document data that other code reads
 * -- the vehicle defence-zone override lives in `system.stats.defenceZones`, where
 * the roll dialog finds it on the targeted vehicle -- so it must be read from and
 * written to that path instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// actor-ffg-options.js destructures foundry.applications.api at module load.
globalThis.foundry ??= {};
foundry.applications ??= { api: { DialogV2: class {} } };
foundry.utils ??= {};
foundry.utils.getProperty ??= (object, key) => key.split(".").reduce((node, part) => node?.[part], object);

const { default: ActorOptions } = await import("../../modules/actors/actor-ffg-options.js");

/** An ActorOptions whose header injection is skipped, bound to a stand-in actor. */
function optionsFor(object) {
  const options = Object.create(ActorOptions.prototype);
  options.data = { object };
  options.options = {};
  return options;
}

const zoneOption = { type: "Array", default: "auto", path: "system.stats.defenceZones" };

test("a path option reads its value from the document, not from a config flag", async () => {
  const object = {
    system: { stats: { defenceZones: "two" } },
    flags: { starwarsffg: { config: { defenceZones: "four" } } },
    setFlag: () => assert.fail("a path option must not create the config flag"),
  };
  const options = optionsFor(object);
  await options.register("defenceZones", zoneOption);
  assert.equal(options.options.defenceZones.value, "two");
});

test("a path option with nothing stored falls back to its default", async () => {
  const options = optionsFor({ system: { stats: {} }, flags: {}, setFlag: () => assert.fail() });
  await options.register("defenceZones", zoneOption);
  assert.equal(options.options.defenceZones.value, "auto");
});

test("a flag option still reads its config flag", async () => {
  const options = optionsFor({ flags: { starwarsffg: { config: { enableSensors: false } } } });
  await options.register("enableSensors", { type: "Boolean", default: true });
  assert.equal(options.options.enableSensors.value, false);
});

test("Accept writes a path option to its path and every other option to its flag", () => {
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg-options.js", import.meta.url), "utf8");
  assert.match(source, /updateObject\[option\.path \?\? `flags\.starwarsffg\.\$\{control\.name\}`\] = value/);
});

test("neither vehicle sheet carries its own zone picker any more", () => {
  // The in-sheet select submitted with render:false, so the zones never redrew until
  // a reload. The override now lives only in Sheet Options, which re-renders on save.
  for (const template of ["ffg-vehicle-sheet.html", "codex/codex-vehicle.html"]) {
    const markup = fs.readFileSync(new URL(`../../templates/actors/${template}`, import.meta.url), "utf8");
    assert.doesNotMatch(markup, /name="data\.stats\.defenceZones"/, template);
  }
  const sheet = fs.readFileSync(new URL("../../modules/actors/actor-sheet-ffg.js", import.meta.url), "utf8");
  assert.match(sheet, /register\("defenceZones",[\s\S]{0,400}path: "system\.stats\.defenceZones"/);
});
