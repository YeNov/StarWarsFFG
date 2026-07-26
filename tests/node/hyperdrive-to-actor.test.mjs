import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import { assembleCharacterSource } from "../../modules/char-creator/assemble-character-source.js";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import { driftReport, hyperdriveToActorData } from "../../modules/importer/hyperdrive/to-actor.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const CHARS = (brawn) => ({
  Brawn: { value: brawn },
  Agility: { value: 4 },
  Intellect: { value: 4 },
  Cunning: { value: 3 },
  Willpower: { value: 2 },
  Presence: { value: 2 },
});

function assemblerDeps() {
  const skills = Object.fromEntries(RAW.Skills.map((skill) => [
    skill.skill,
    { rank: 0, label: skill.skill, careerskill: false },
  ]));
  return {
    creationDefaults: {
      img: "default.png",
      prototypeToken: { actorLink: true },
      system: {
        // A freshly created actor starts every characteristic at 0 (character.js:173);
        // the species and other items supply the rest via their effects.
        characteristics: Object.fromEntries(
          Object.keys(CHARS(0)).map((characteristic) => [characteristic, { value: 0 }]),
        ),
        skills,
        stats: {
          wounds: { max: 0 },
          strain: { max: 0 },
          soak: { value: 0 },
          encumbrance: { max: 0 },
          credits: { value: 0 },
        },
        experience: {},
      },
    },
    applyCharacteristicDeltas: (system, deltas) => {
      const result = structuredClone(system);
      for (const [key, value] of Object.entries(deltas)) {
        result.characteristics[key].value += value;
        if (key === "Brawn") {
          result.stats.wounds.max += value;
          result.stats.soak.value += value;
          result.stats.encumbrance.max += value;
        }
        if (key === "Willpower") result.stats.strain.max += value;
      }
      return result;
    },
  };
}

function basicDeps(overrides = {}) {
  const buildCalls = [];
  const resolve = {
    getByKey: (type, key) => ({
      itemType: type,
      ref: {
        uuid: `${type}:${key}`,
        name: key,
        type,
        snapshot: {
          name: key,
          type,
          system: type === "specialization"
            ? { talents: { talent18: { name: "Dedication" } } }
            : {},
          effects: [],
        },
      },
    }),
    getByName: () => null,
    ambiguities: [],
  };
  const deps = {
    resolve,
    skillMap: {},
    skillMeta: [],
    itemmodifierIndex: {},
    attachmentIndex: {},
    toItemData: (ref, options = {}) => ({
      ...structuredClone(ref.snapshot),
      importOptions: structuredClone(options),
    }),
    buildInPlace: (kind, entry) => {
      buildCalls.push(entry.Key ?? entry.key);
      return {
        source: {
          name: entry.Name ?? entry.name ?? kind,
          type: kind,
          flags: { starwarsffg: { ffgimportid: entry.Key ?? entry.key } },
          system: {},
          effects: [],
        },
        warnings: [],
      };
    },
    // What the BUILD ITEMS alone prepare, measured from an unsaved preview actor: the
    // species supplies 2 in every characteristic and the Steel Hand Dedication adds +1
    // Brawn; Brawl collects three free ranks (species + career + specialization), while
    // Athletics/Cool come from the career and Coordination from the specialization.
    // Equipment is excluded on purpose — an item carries its own modifiers.
    preparePreview: async () => ({
      characteristics: {
        Brawn: { value: 3 },
        Agility: { value: 2 },
        Intellect: { value: 2 },
        Cunning: { value: 2 },
        Willpower: { value: 2 },
        Presence: { value: 2 },
      },
      skills: {
        Brawl: { rank: 3 },
        Athletics: { rank: 1 },
        Cool: { rank: 1 },
        Coordination: { rank: 1 },
      },
    }),
    prepareFinal: async () => ({
      characteristics: CHARS(3),
      wounds: 18,
      strain: 13,
      soak: 4,
    }),
    assemble: (args) => assembleCharacterSource(assemblerDeps(), args),
    ...overrides,
  };
  return { deps, buildCalls };
}

test("matched cybernetic is routed to compendium and its Brawn effect is preserved", async () => {
  const parsed = parseHyperdrive(RAW);
  const brawnEffect = {
    name: "(inherent)",
    changes: [{
      key: "system.characteristics.Brawn.value",
      mode: AE_MODES.ADD,
      value: 1,
    }],
  };
  const base = basicDeps();
  const originalGet = base.deps.resolve.getByKey;
  base.deps.resolve.getByKey = (type, key) => key === "CYLEGII"
    ? {
      ref: {
        uuid: "gear:CYLEGII",
        name: "Cybernetic Leg",
        type: "gear",
        snapshot: { name: "Cybernetic Leg", type: "gear", system: {}, effects: [brawnEffect] },
      },
    }
    : originalGet(type, key);
  // Base Brawn is the residual 0; species (2) + Dedication (1) + the cybernetic's own
  // +1 prepare to 4. Hyperdrive's export omits the cybernetic's bonus, so the extra
  // point is legitimate drift for the report rather than an importer error.
  base.deps.prepareFinal = async () => ({
    characteristics: CHARS(4),
    wounds: 19,
    strain: 13,
    soak: 4,
  });
  const { actorData, report } = await hyperdriveToActorData(parsed, base.deps);
  assert.equal(base.buildCalls.includes("CYLEGII"), false);
  const cyber = actorData.items.find((item) => item.name === "Cybernetic Leg");
  assert.deepEqual(cyber.effects[0], brawnEffect);
  assert.ok(cyber.effects.flatMap((effect) => effect.changes).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 1));
  assert.deepEqual(report.drift.find((row) => row.stat === "Brawn"), {
    kind: "characteristic",
    stat: "Brawn",
    exported: 3,
    prepared: 4,
  });
  assert.deepEqual(report.drift.find((row) => row.stat === "wounds"), {
    kind: "threshold",
    stat: "wounds",
    exported: 18,
    prepared: 19,
  });
});

test("golden export stores only the residual the build items do not already supply", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const originalGet = deps.resolve.getByKey;
  deps.resolve.getByKey = (type, key) =>
    type === "specialization" && key === "DEATHWCOTR" ? null : originalGet(type, key);
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);

  // Brawn 3 = species 2 + Dedication 1, so nothing is left to persist; writing the
  // exported 3 here would double-count against the very items that supply it.
  assert.equal(actorData.system.characteristics.Brawn.value, 0);
  assert.equal(actorData.system.stats.wounds.max, 0);
  assert.equal(actorData.system.stats.encumbrance.max, 0);
  // Characteristics no item supplies stay on the actor: Agility/Intellect 4 - 2, Cunning 3 - 2.
  assert.equal(actorData.system.characteristics.Agility.value, 2);
  assert.equal(actorData.system.characteristics.Intellect.value, 2);
  assert.equal(actorData.system.characteristics.Cunning.value, 1);

  // Athletics' single rank is the career's free rank; Brawl's three free ranks already
  // exceed the exported 2, which is capped at 0 and reported rather than silently kept.
  assert.equal(actorData.system.skills.Athletics.rank, 0);
  assert.equal(actorData.system.skills.Brawl.rank, 0);
  assert.ok(report.warnings.some((warning) =>
    /Skill Brawl: imported items grant 3 free rank\(s\) but the export lists 2/.test(warning)));
  // Ranks with no item behind them are genuinely purchased and must persist.
  assert.equal(actorData.system.skills.Charm.rank, 1);
  assert.equal(actorData.system.skills.Vigilance.rank, 1);

  const career = actorData.items.find((item) => item.type === "career");
  const steel = actorData.items.find((item) => item.name === "STEELHAND");
  const deathWatch = actorData.items.find((item) =>
    item.flags?.starwarsffg?.ffgimportid === "DEATHWCOTR");
  const species = actorData.items.find((item) => item.type === "species");
  assert.deepEqual(species.importOptions.rankGrants, ["Brawl"]);
  assert.deepEqual(career.importOptions.rankGrants, ["Athletics", "Brawl", "Cool"]);
  assert.deepEqual(steel.importOptions.rankGrants, ["Brawl", "Coordination"]);
  assert.ok(deathWatch.effects.flatMap((effect) => effect.changes).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 2));

  const cyber = actorData.items.find((item) => item.flags?.starwarsffg?.inventoryID === "CYLEGII_1785055142357");
  assert.ok(cyber.effects.flatMap((effect) => effect.changes).some((change) =>
    change.key === "system.stats.wounds.max" && change.value === 1));

  // The base plus what the build items supply reconstructs the exported sheet rather
  // than exceeding it: Brawn 0 + species 2 + Dedication 1 === the exported 3, and
  // Athletics 0 + the career's free rank === the exported 1. The cybernetic's own +1
  // sits on the item and surfaces as reported drift, not as a larger base.
  assert.equal(
    actorData.system.characteristics.Brawn.value + 2 + 1,
    parsed.characteristics.Brawn,
  );
  assert.equal(
    actorData.system.skills.Athletics.rank + 1,
    parsed.skills.find((skill) => skill.skill === "Athletics").rank,
  );
});

test("Morality Strength/Weakness are preserved in flags and reported", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);

  // CharacterDataModel declares morality as {value, type, label} only (character.js:50),
  // so the pair is kept in flags rather than written to a path the model would drop.
  assert.deepEqual(actorData.flags.starwarsffg.hyperdriveImport.morality, {
    strength: "Camaraderie",
    weakness: "Closed-mindedness",
  });
  assert.deepEqual(report.metadata.morality, {
    strength: "Camaraderie",
    weakness: "Closed-mindedness",
  });
  assert.ok(report.warnings.some((warning) => /Morality Strength \(Camaraderie\)/.test(warning)));
  // The numeric score still lands on the declared field.
  assert.equal(actorData.system.morality.value, 50);
});

test("unmatched equipment builds in-place and is included in the report", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  deps.resolve.getByKey = (type, key) =>
    type === "weapon" && key === "12DEFEND"
      ? {
        ref: {
          uuid: "weapon:12DEFEND",
          name: "12 Defender",
          type: "weapon",
          snapshot: {
            name: "12 Defender",
            type: "weapon",
            system: { itemattachment: [] },
            effects: [],
          },
        },
      }
      : null;
  const { actorData, report } = await hyperdriveToActorData(parsed, deps);
  assert.equal(actorData.items.find((item) => item.type === "weapon").system.quantity.value, 1);
  assert.ok(report.unmatched.some((item) => item.kind === "armour" && item.key === "HC"));
  assert.ok(report.unmatched.some((item) => item.kind === "gear"));
});

test("a present but unmatched key never falls back to name matching", async () => {
  const parsed = parseHyperdrive({
    ...RAW,
    Species: { ...RAW.Species, Key: "HOMEBREWSP" },
  });
  let nameLookups = 0;
  const { deps } = basicDeps();
  deps.resolve = {
    getByKey: () => null,
    getByName: () => {
      nameLookups += 1;
      return { ref: { uuid: "wrong", type: "species", snapshot: {} } };
    },
    ambiguities: [],
  };
  const { actorData } = await hyperdriveToActorData(parsed, deps);
  assert.equal(nameLookups, 1); // culture has no key; keyed entries do not use name fallback
  assert.ok(actorData.items.some((item) => item.flags?.starwarsffg?.ffgimportid === "HOMEBREWSP"));
});

test("matched career receives extra career-skill effects", async () => {
  const parsed = parseHyperdrive(RAW);
  parsed.extraCareerSkills = ["Deception"];
  const { deps } = basicDeps();
  const { actorData } = await hyperdriveToActorData(parsed, deps);
  const career = actorData.items.find((item) => item.type === "career");
  assert.deepEqual(career.effects.flatMap((effect) => effect.changes).find((change) =>
    change.key === "system.skills.Deception.careerskill"), {
    key: "system.skills.Deception.careerskill",
    mode: AE_MODES.ADD,
    value: true,
  });
});

test("Dedication grants are routed to the owning specialization materialization", async () => {
  const parsed = parseHyperdrive(RAW);
  const { deps } = basicDeps();
  const { actorData } = await hyperdriveToActorData(parsed, deps);
  const steel = actorData.items.find((item) => item.name === "STEELHAND");
  assert.deepEqual(steel.importOptions.nodeAttributeGrants.talent18.pcwDedication, {
    modtype: "Characteristic",
    mod: "Brawn",
    value: 1,
  });
});

test("driftReport skips absent prepared characteristic entries", () => {
  assert.deepEqual(driftReport({
    characteristics: { Brawn: 3, Agility: 4 },
    derived: { wounds: 18, strain: 13, soak: 4 },
  }, {
    characteristics: {},
    wounds: 18,
    strain: 13,
    soak: 4,
  }), []);
});
