import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  buildAttachmentEffects,
  buildItemEffects,
  buildModifierEffects,
  effectsFromAttributes,
  makeNamer,
  normalizeMods,
} from "../../modules/importer/hyperdrive/effect-builders.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const flat = (effects) => effects.flatMap((effect) => effect.changes ?? []);
const project = (effects) => flat(effects)
  .map(({ key, mode, value }) => ({ key, mode, value }))
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const IDX = {
  SOAKSET: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } },
  SOAKADD: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } },
  },
  DEFADD: { system: { attributes: { a: { modtype: "Stat", mod: "Defence", value: 1 } } } },
};
const META = [
  { skill: "Brawl", characteristic: "Brawn", type: "Combat" },
  { skill: "Discipline", characteristic: "Willpower", type: "General" },
  { skill: "Melee", characteristic: "Brawn", type: "Combat" },
];

test("buildItemEffects emits exact inherent species, armour, gear, and career changes", () => {
  const species = {
    type: "species",
    system: {
      attributes: {
        Brawn: { modtype: "Characteristic", mod: "Brawn", value: 2 },
        Willpower: { modtype: "Characteristic", mod: "Willpower", value: 2 },
        WoundThreshold: { modtype: "Threshold", mod: "Wounds", value: 11 },
        StrainThreshold: { modtype: "Threshold", mod: "Strain", value: 10 },
      },
    },
  };
  const changes = flat(buildItemEffects(species));
  assert.ok(changes.some((change) => change.key === "system.characteristics.Brawn.value" && change.value === 2));
  assert.ok(changes.some((change) => change.key === "system.stats.soak.value" && change.value === 2));
  assert.ok(changes.some((change) => change.key === "system.stats.wounds.max" && change.value === 13));
  assert.ok(changes.some((change) => change.key === "system.stats.strain.max" && change.value === 12));

  const armour = flat(buildItemEffects({
    type: "armour",
    system: { encumbrance: { value: 1 }, soak: { value: 2 }, defence: { value: 1 } },
  }));
  assert.ok(armour.some((change) => change.key === "system.stats.soak.value" && change.value === 2));
  assert.ok(armour.some((change) => change.key === "system.stats.defence.melee" && change.value === 1));
  assert.ok(armour.some((change) => change.key === "system.stats.defence.ranged" && change.value === 1));
  assert.deepEqual(flat(buildItemEffects({ type: "gear", system: { encumbrance: { value: 2 } } })), [
    { key: "system.stats.encumbrance.value", mode: AE_MODES.ADD, value: 2 },
  ]);
  assert.deepEqual(buildItemEffects({ type: "shipattachment", system: {} }), []);
});

test("normalizes characteristic, counted, keyed-skill, SkillChar, and SkillType modifiers", () => {
  const parsed = parseHyperdrive(RAW);
  assert.ok(flat(buildModifierEffects(parsed.cybernetics[0]))
    .some((change) => change.key === "system.characteristics.Brawn.value" && change.value === 1));
  assert.deepEqual(flat(buildModifierEffects(
    { BaseMods: [{ Key: "SOAKADD", Count: "2" }] },
    { itemmodifierIndex: IDX },
  )).find((change) => change.key === "system.stats.soak.value"), {
    key: "system.stats.soak.value",
    mode: AE_MODES.ADD,
    value: 2,
  });
  assert.deepEqual(flat(effectsFromAttributes(normalizeMods(
    [{ Key: "DISC", BoostCount: "1" }],
    { skillMap: { DISC: "Discipline" } },
  ))), [{ key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 }]);
  assert.deepEqual(flat(effectsFromAttributes(normalizeMods(
    [{ DieModifiers: [{ SkillChar: "BR", SetbackCount: "1" }] }],
    { skillMeta: META },
  ))).map((change) => change.key).sort(), [
    "system.skills.Brawl.remsetback",
    "system.skills.Melee.remsetback",
  ]);
  assert.deepEqual(flat(effectsFromAttributes(normalizeMods(
    [{ DieModifiers: [{ SkillType: "Combat", BoostCount: "1" }] }],
    { skillMeta: META },
  ))).map((change) => change.key).sort(), [
    "system.skills.Brawl.boost",
    "system.skills.Melee.boost",
  ]);
});

test("shared namer remains unique across calls and owner mods exclude FromAttachment entries", () => {
  const namer = makeNamer();
  const first = normalizeMods([{ Key: "SOAKADD" }], { itemmodifierIndex: IDX, namer });
  const second = normalizeMods([{ Key: "SOAKADD" }], { itemmodifierIndex: IDX, namer });
  assert.deepEqual([...Object.keys(first), ...Object.keys(second)], ["attr0", "attr1"]);
  assert.deepEqual(buildModifierEffects({
    Qualities: [{ Key: "SOAKADD", FromAttachment: true }],
  }, { itemmodifierIndex: IDX }), []);
});

test("ARMINS emits the exact six-entry base+installed multiset", () => {
  const parsed = parseHyperdrive(RAW);
  assert.deepEqual(project(buildAttachmentEffects(parsed.armour[0], { itemmodifierIndex: IDX })), project([
    { changes: [
      { key: "system.stats.defence.melee", mode: AE_MODES.ADD, value: 1 },
      { key: "system.stats.defence.melee", mode: AE_MODES.ADD, value: 1 },
      { key: "system.stats.defence.ranged", mode: AE_MODES.ADD, value: 1 },
      { key: "system.stats.defence.ranged", mode: AE_MODES.ADD, value: 1 },
      { key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 1 },
      { key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 1 },
    ] },
  ]));
});

test("attachment installation handles keyless, failed, counted, and matched-dedup cases", () => {
  const keyless = {
    inventoryID: "X",
    Attachments: [{
      Key: "A",
      BaseMods: [],
      AddedMods: [{ DieModifiers: [{ SkillKey: "DISC", BoostCount: "1" }] }],
    }],
    ModStates: { "X-A-undefined": { installed: [true], failed: [false] } },
  };
  assert.deepEqual(flat(buildAttachmentEffects(keyless, { skillMap: { DISC: "Discipline" } })), [
    { key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 },
  ]);
  const failed = {
    inventoryID: "X",
    Attachments: [{ Key: "A", BaseMods: [], AddedMods: [{ Key: "DEFADD" }] }],
    ModStates: { "X-A-DEFADD": { installed: [true], failed: [true] } },
  };
  assert.deepEqual(buildAttachmentEffects(failed, { itemmodifierIndex: IDX }), []);
  const counted = {
    inventoryID: "X",
    Attachments: [{ Key: "A", BaseMods: [], AddedMods: [{ Key: "SOAKADD", Count: "2" }] }],
    ModStates: { "X-A-SOAKADD": { installed: [true], failed: [false] } },
  };
  assert.equal(flat(buildAttachmentEffects(counted, { itemmodifierIndex: IDX }))[0].value, 2);
  const matched = {
    inventoryID: "X",
    Attachments: [{ Key: "A", BaseMods: [{ Key: "SOAKADD" }] }],
  };
  const effects = [{ name: "pre", changes: [{ key: "system.skills.Discipline.boost", mode: AE_MODES.ADD, value: 1 }] }];
  assert.deepEqual(buildAttachmentEffects(matched, {
    itemmodifierIndex: IDX,
    attachmentIndex: { A: { effects } },
  }), effects);
});
