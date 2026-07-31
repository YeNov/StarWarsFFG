import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import { assignWizardIdentity } from "../../modules/char-creator/build-item-schema.js";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  buildArmourSource,
  buildAttachmentSnapshot,
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

test("in-place careers store canonical Foundry skill keys", () => {
  const career = buildCareerSource({
    Name: "Explorer",
    CareerSkills: ["Outer Rim", "Xenology", "Ranged (Heavy)"],
  }).source;
  assert.deepEqual(career.system.careerSkills, {
    careerSkill0: "Knowledge: Outer Rim",
    careerSkill1: "Knowledge: Xenology",
    careerSkill2: "Ranged: Heavy",
  });
  assert.ok(flat(career).some((change) =>
    change.key === "system.skills.Knowledge: Outer Rim.careerskill"));
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

test("in-place equipment and matched overlays preserve Hyperdrive image links", () => {
  const linked = {
    Name: "Linked weapon",
    SkillKey: "BRAWL",
    imageUrl: "https://example.test/linked-weapon.webp",
  };
  const built = buildWeaponSource(linked, { skillMap: { BRAWL: "Brawl" } }).source;
  assert.equal(built.img, "https://example.test/linked-weapon.webp");

  const matched = {
    name: "Compendium weapon",
    type: "weapon",
    img: "compendium.webp",
    system: { itemattachment: [] },
    effects: [],
  };
  overlayInstance(matched, linked);
  assert.equal(matched.img, "https://example.test/linked-weapon.webp");
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

test("matched armour does not duplicate an equivalent exported base modifier", () => {
  const compendiumEffect = {
    name: "configured-vigilance",
    changes: [{
      key: "system.skills.Vigilance.advantage",
      mode: AE_MODES.ADD,
      value: "1",
    }],
  };
  const matched = {
    name: "Cresh \"Luck\" Armor",
    type: "armour",
    system: { itemattachment: [] },
    effects: [compendiumEffect],
  };
  overlayInstance(matched, {
    BaseMods: {
      DieModifiers: [{
        SkillKey: "VIGIL",
        AdvantageCount: "1",
      }],
    },
  }, {
    skillMap: { VIGIL: "Vigilance" },
  });
  assert.equal(
    flat(matched).filter((change) => change.key === "system.skills.Vigilance.advantage").length,
    1,
  );
  assert.deepEqual(matched.effects[0], compendiumEffect);
});

test("configured compendium attachments preserve documents and Hyperdrive mod states", () => {
  const modifier = (key, name, attributes = {}) => ({
    name,
    type: "itemmodifier",
    flags: { starwarsffg: { ffgimportid: key } },
    system: { rank: 1, attributes },
  });
  const itemmodifierIndex = {
    SETBACKSUB: modifier("SETBACKSUB", "Remove Setback", {
      a: { modtype: "Roll Modifiers", mod: "Remove Setback", value: 1 },
    }),
    ACCURATE: modifier("ACCURATE", "Accurate Quality", {
      a: { modtype: "Roll Modifiers", mod: "Add Boost", value: 1 },
    }),
    DAMADD: modifier("DAMADD", "Additional Damage Mod", {
      a: { modtype: "Weapon Stat", mod: "damage", value: 1 },
    }),
    CONCUSSIVE: modifier("CONCUSSIVE", "Concussive Quality"),
  };
  const attachmentModifier = (name, active, attributes = {}, description = name) => ({
    name,
    system: {
      description,
      active,
      broken: false,
      rank: 1,
      attributes,
    },
  });
  const attachmentIndex = {
    "name:custom grip": {
      name: "Custom Grip",
      type: "itemattachment",
      system: {
        description: "Configured Custom Grip",
        itemmodifier: [
          attachmentModifier("Accurate Quality", false, {
            accurate: { modtype: "Roll Modifiers", mod: "Add Boost", value: 1 },
          }),
          attachmentModifier("Remove setback mod (base)", true, {
            setback: { modtype: "Roll Modifiers", mod: "Remove Setback", value: 1 },
          }),
        ],
      },
      effects: [],
    },
    "name:weighted head": {
      name: "Weighted Head",
      type: "itemattachment",
      system: {
        description: "Configured Weighted Head",
        itemmodifier: [
          attachmentModifier("Additional Damage Mod (Base)", true, {
            damage: { modtype: "Weapon Stat", mod: "damage", value: 1 },
          }),
          attachmentModifier("Additional Damage Mod", false, {
            damage: { modtype: "Weapon Stat", mod: "damage", value: 1 },
          }),
          attachmentModifier("Concussive Quality", false),
        ],
      },
      effects: [],
    },
    "name:passive foliage suit": {
      name: "Passive Foliage Suit",
      type: "itemattachment",
      system: {
        description: "Configured Passive Foliage Suit",
        itemmodifier: [
          attachmentModifier(
            "Passive Foliage Suit (base)",
            true,
            {},
            "Adds a setback to checks made to detect the wearer.",
          ),
        ],
      },
      effects: [],
    },
  };
  const weapon = {
    inventoryID: "RYYK_1",
    ModStates: {
      "RYYK_1-CUSTGRIP-ACCURATE": { installed: [true], failed: [false] },
      "RYYK_1-WEIGHTHEAD-DAMADD": { installed: [true], failed: [false] },
    },
  };
  const custom = buildAttachmentSnapshot({
    Key: "CUSTGRIP",
    Name: "Custom Grip",
    BaseMods: [
      { Key: "SETBACKSUB", Count: 1 },
      { MiscDesc: "Anyone other than the owner adds [SE][SE] to combat checks." },
    ],
    AddedMods: [{ Key: "ACCURATE", Count: 1 }],
  }, weapon, { attachmentIndex, itemmodifierIndex });
  assert.equal(custom.system.description, "Configured Custom Grip");
  assert.equal(custom.system.itemmodifier.length, 2);
  assert.equal(custom.system.itemmodifier.find((mod) => mod.name === "Remove setback mod (base)").system.active, true);
  assert.equal(custom.system.itemmodifier.find((mod) => mod.name === "Accurate Quality").system.active, true);

  const weighted = buildAttachmentSnapshot({
    Key: "WEIGHTHEAD",
    Name: "Weighted Head",
    BaseMods: [{ Key: "DAMADD", Count: 1 }],
    AddedMods: [
      { Key: "DAMADD", Count: 1 },
      { Key: "CONCUSSIVE", Count: 1 },
    ],
  }, weapon, { attachmentIndex, itemmodifierIndex });
  assert.equal(weighted.system.description, "Configured Weighted Head");
  assert.deepEqual(
    weighted.system.itemmodifier.map((mod) => [mod.name, mod.system.active]),
    [
      ["Additional Damage Mod (Base)", true],
      ["Additional Damage Mod", true],
      ["Concussive Quality", false],
    ],
  );

  const foliage = buildAttachmentSnapshot({
    Key: "PASSFOLSUIT",
    Name: "Passive Foliage Suit",
    BaseMods: [{
      MiscDesc: "Add [SE] to Perception or Vigilance checks made to detect this character.",
    }],
  }, { inventoryID: "CRESH_1" }, {
    attachmentIndex,
    itemmodifierIndex,
    skillMeta: [
      { skill: "Perception" },
      { skill: "Vigilance" },
    ],
    ownerType: "armour",
  });
  assert.equal(foliage.system.description, "Configured Passive Foliage Suit");
  assert.equal(foliage.system.itemmodifier[0].system.active, true);
  assert.deepEqual(foliage.system.itemmodifier[0].system.attributes, {});
  assert.equal(foliage.system.itemmodifier[0].flags.starwarsffg.targetRelative, true);
});

test("matched equipment overlays configured qualities and attachment documents", () => {
  const modifier = (key, name, attributes = {}) => ({
    name,
    type: "itemmodifier",
    flags: { starwarsffg: { ffgimportid: key } },
    system: { rank: 1, attributes },
  });
  const itemmodifierIndex = {
    CUMBERSOME: modifier("CUMBERSOME", "Cumbersome Quality"),
    SUPERIOR: modifier("SUPERIOR", "Superior Quality", {
      advantage: { modtype: "Result Modifiers", mod: "Add Advantage", value: 1 },
      damage: { modtype: "Weapon Stat", mod: "damage", value: 1 },
      soak: { modtype: "Armor Stat", mod: "soak", value: 1 },
    }),
    DEFENSIVE: modifier("DEFENSIVE", "Defensive Quality", {
      defence: { modtype: "Stat", mod: "Defence-Melee", value: 99 },
    }),
    ACCURATE: modifier("ACCURATE", "Accurate Quality", {
      boost: { modtype: "Roll Modifiers", mod: "Add Boost", value: 1 },
    }),
    SETBACKSUB: modifier("SETBACKSUB", "Remove Setback"),
    DAMADD: modifier("DAMADD", "Additional Damage Mod", {
      damage: { modtype: "Weapon Stat", mod: "damage", value: 1 },
    }),
  };
  const attachmentIndex = {
    CUSTGRIP: {
      name: "Custom Grip",
      type: "itemattachment",
      system: {
        description: "Configured Custom Grip",
        itemmodifier: [{
          name: "Accurate Quality",
          system: { active: false, rank: 1, attributes: {} },
        }, {
          name: "Remove setback mod (base)",
          system: { active: true, rank: 1, attributes: {} },
        }],
      },
      effects: [],
    },
    "name:weighted head": {
      name: "Weighted Head",
      type: "itemattachment",
      system: {
        description: "Configured Weighted Head",
        itemmodifier: [{
          name: "Additional Damage Mod (Base)",
          system: { active: true, rank: 1, attributes: {} },
        }, {
          name: "Additional Damage Mod",
          system: { active: false, rank: 1, attributes: {} },
        }, {
          name: "Concussive Quality",
          system: { active: false, rank: 1, attributes: {} },
        }],
      },
      effects: [],
    },
  };
  const raw = {
    inventoryID: "RYYK_1",
    Qualities: [
      { Key: "CUMBERSOME", Count: 3 },
      { Key: "DEFENSIVE", Count: 1 },
      { Key: "SUPERIOR" },
      { Key: "ACCURATE", Count: 1 },
    ],
    Attachments: [{
      Key: "CUSTGRIP",
      Name: "Custom Grip",
      BaseMods: [{ Key: "SETBACKSUB", Count: 1 }],
      AddedMods: [{ Key: "ACCURATE", Count: 1 }],
    }, {
      Key: "WEIGHTHEAD",
      Name: "Weighted Head",
      BaseMods: [{ Key: "DAMADD", Count: 1 }],
      AddedMods: [
        { Key: "DAMADD", Count: 1 },
        { Key: "CONCUSSIVE", Count: 1 },
      ],
    }],
    ModStates: {
      "RYYK_1-CUSTGRIP-ACCURATE": { installed: [true], failed: [false] },
      "RYYK_1-WEIGHTHEAD-DAMADD": { installed: [true], failed: [false] },
    },
  };
  const matched = {
    name: "Ryyk Blade",
    type: "weapon",
    system: {
      description: "Configured Ryyk Blade",
      damage: { value: 2 },
      characteristic: { value: "Brawn" },
      itemmodifier: [
        {
          ...modifier("CUMBERSOME", "Cumbersome Quality"),
          system: {
            description: "Weapon-configured Cumbersome",
            rank: 3,
            attributes: { configured: { modtype: "Weapon Stat", mod: "damage", value: 17 } },
          },
        },
        {
          ...modifier("DEFENSIVE", "Defensive Quality"),
          system: {
            description: "Weapon-configured Defensive",
            rank: 1,
            attributes: {
              configuredDefence: {
                modtype: "Stat",
                mod: "Defence-Melee",
                value: 1,
              },
            },
          },
        },
        {
          ...modifier("SUPERIOR", "Superior Quality"),
          system: {
            description: "Weapon-configured Superior",
            rank: 1,
            attributes: {},
          },
        },
      ],
      itemattachment: [],
    },
    effects: [],
  };
  const itemmodifierReads = [];
  const guardedItemmodifierIndex = new Proxy(itemmodifierIndex, {
    get(target, key, receiver) {
      if (typeof key === "string") itemmodifierReads.push(key);
      return Reflect.get(target, key, receiver);
    },
  });
  overlayInstance(matched, raw, {
    attachmentIndex,
    itemmodifierIndex: guardedItemmodifierIndex,
  });

  assert.deepEqual(
    matched.system.itemmodifier.map((mod) => mod.name),
    ["Cumbersome Quality", "Defensive Quality", "Superior Quality"],
  );
  assert.deepEqual(
    itemmodifierReads.filter((key) =>
      ["CUMBERSOME", "DEFENSIVE", "SUPERIOR"].includes(key)),
    [],
  );
  assert.equal(
    matched.system.itemmodifier[0].system.description,
    "Weapon-configured Cumbersome",
  );
  assert.equal(matched.system.itemmodifier[0].system.rank, 3);
  assert.deepEqual(matched.system.itemmodifier[0].system.attributes, {
    configured: { modtype: "Weapon Stat", mod: "damage", value: 17 },
  });
  assert.equal(
    matched.system.itemmodifier[1].system.description,
    "Weapon-configured Defensive",
  );
  assert.equal(
    matched.system.itemmodifier[1].system.attributes.configuredDefence.value,
    1,
  );
  assert.equal(
    matched.system.itemmodifier[2].system.description,
    "Weapon-configured Superior",
  );
  assert.equal(matched.system.description, "Configured Ryyk Blade");
  assert.equal(matched.system.damage.value, 2);
  assert.equal(matched.system.characteristic.value, "Brawn");
  assert.equal(matched.system.itemattachment[0].system.description, "Configured Custom Grip");
  assert.equal(matched.system.itemattachment[1].system.description, "Configured Weighted Head");
  assert.deepEqual(
    matched.system.itemattachment.flatMap((attachment) => attachment.system.itemmodifier)
      .filter((mod) => mod.system.active)
      .map((mod) => mod.name),
    [
      "Accurate Quality",
      "Remove setback mod (base)",
      "Additional Damage Mod (Base)",
      "Additional Damage Mod",
    ],
  );
  assert.equal(
    matched.system.itemattachment[1].system.itemmodifier
      .find((mod) => mod.name === "Concussive Quality").system.active,
    false,
  );
  assert.equal(
    flat(matched)
      .filter((change) => change.key === "system.stats.defence.melee")
      .reduce((total, change) => total + Number(change.value), 0),
    1,
  );
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
  assert.deepEqual(matched.system.itemattachment[0].system.attributes, {});
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
