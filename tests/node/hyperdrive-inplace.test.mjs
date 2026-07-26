import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import { assignWizardIdentity } from "../../modules/char-creator/build-item-schema.js";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  buildArmourSource,
  buildCareerSource,
  buildGearSource,
  buildInPlace,
  buildQualityModifiers,
  buildSpeciesSource,
  buildWeaponSource,
  overlayInstance,
} from "../../modules/importer/hyperdrive/in-place.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const parsed = parseHyperdrive(RAW);
const flat = (source) => source.effects.flatMap((effect) => effect.changes ?? []);
const IDX = {
  SOAKSET: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } },
  SOAKADD: { system: { attributes: { a: { modtype: "Stat", mod: "Soak", value: 1 } } } },
  DEFADD: { system: { attributes: { a: { modtype: "Stat", mod: "Defence", value: 1 } } } },
};

test("species and career in-place builders synthesize real item-owned effects", () => {
  const species = buildSpeciesSource(parsed.species, { rankGrants: ["Brawl"] }).source;
  assert.ok(flat(species).some((change) => change.key === "system.characteristics.Brawn.value" && change.value === 2));
  assert.ok(flat(species).some((change) => change.key === "system.stats.wounds.max" && change.value === 13));
  assert.ok(flat(species).some((change) => change.key === "system.skills.Brawl.rank" && change.value === 1));
  const career = buildCareerSource(parsed.career, { careerSkillGrants: ["Survival"] }).source;
  assert.ok(flat(career).some((change) => change.key === "system.skills.Athletics.careerskill" && change.value === true));
  assert.ok(flat(career).some((change) => change.key === "system.skills.Survival.careerskill" && change.value === true));
});

test("full 12 Defender has one Discipline boost and unique effect names", () => {
  const weapon = parsed.weapons.find((item) => item.inventoryID === "12DEFEND_1785054958137");
  const source = buildWeaponSource(weapon, {
    skillMap: { DISC: "Discipline", RANGLT: "Ranged (Light)" },
    itemmodifierIndex: {},
  }).source;
  assert.equal(flat(source).filter((change) =>
    change.key === "system.skills.Discipline.boost"
    && change.mode === AE_MODES.ADD
    && change.value === 1).length, 1);
  const names = source.effects.map((effect) => effect.name);
  assert.equal(new Set(names).size, names.length);
});

test("cybernetic gear applies Brawn and quality snapshots preserve ranks/freeform data", () => {
  const source = buildGearSource(parsed.cybernetics[0]).source;
  assert.ok(flat(source).some((change) =>
    change.key === "system.characteristics.Brawn.value" && change.value === 1));
  assert.ok(flat(source).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 1));
  const modifiers = buildQualityModifiers([
    { Key: "MATCH", Count: "3" },
    { MiscDesc: "Custom quality", Count: "2" },
  ], {
    MATCH: { name: "Matched", type: "itemmodifier", _id: "source", system: { rank: 1 } },
  });
  assert.equal(modifiers[0]._id, undefined);
  assert.equal(modifiers[0].system.rank, 3);
  assert.equal(modifiers[1].system.rank, 2);
  assert.equal(modifiers[1].system.description, "Custom quality");
});

test("matched armour overlay preserves compendium effects and applies installed ARMINS once", () => {
  const compendiumEffect = {
    name: "(inherent)",
    changes: [{ key: "system.stats.soak.value", mode: AE_MODES.ADD, value: 2 }],
  };
  const matched = {
    name: "Heavy Clothing",
    type: "armour",
    system: { itemattachment: [] },
    effects: [compendiumEffect],
  };
  overlayInstance(matched, parsed.armour[0], { itemmodifierIndex: IDX });
  assert.deepEqual(matched.effects[0], compendiumEffect);
  assert.equal(flat(matched).filter((change) => change.key === "system.stats.soak.value" && change.value === 1).length, 2);
  assert.equal(flat(matched).filter((change) => change.key === "system.stats.defence.melee" && change.value === 1).length, 2);
});

test("overlay seeds effect names and identity stamping reaches nested attachments", async () => {
  const weapon = parsed.weapons.find((item) => item.inventoryID === "12DEFEND_1785054958137");
  const matched = {
    name: "12 Defender",
    type: "weapon",
    system: { itemattachment: [] },
    effects: [{ name: "attr0", changes: [] }],
  };
  overlayInstance(matched, weapon, { skillMap: { DISC: "Discipline" } });
  const names = matched.effects.map((effect) => effect.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(matched.system.quantity.value, 1);
  assert.equal(matched.flags.starwarsffg.inventoryID, "12DEFEND_1785054958137");
  const actorData = { items: [matched] };
  await assignWizardIdentity(actorData, { userId: "u", commitId: "COMMIT0000000001" });
  assert.match(matched.system.itemattachment[0]._id, /^[0-9A-Za-z]{16}$/);
});

test("dispatch builds equipment/content and stubs unmatched trees with an explicit warning", () => {
  assert.equal(buildArmourSource(parsed.armour[0]).source.type, "armour");
  assert.equal(buildInPlace("species", parsed.species).source.type, "species");
  assert.match(buildInPlace("specialization", { Key: "HOME", Name: "Homebrew" }).warnings[0], /tree node effects are not in the export/);
  assert.equal(buildInPlace("shipattachment", {}).source.type, "shipattachment");
});
