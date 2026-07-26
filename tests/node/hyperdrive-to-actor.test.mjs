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
        characteristics: CHARS(0),
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
      for (const [key, value] of Object.entries(deltas)) result.characteristics[key].value += value;
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
    preparePreview: async () => ({ characteristics: CHARS(3), skills: {} }),
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
  base.deps.prepareFinal = async () => ({
    characteristics: CHARS(4),
    wounds: 17,
    strain: 13,
    soak: 4,
  });
  const { actorData, report } = await hyperdriveToActorData(parsed, base.deps);
  assert.equal(base.buildCalls.includes("CYLEGII"), false);
  const cyber = actorData.items.find((item) => item.name === "Cybernetic Leg");
  assert.deepEqual(cyber.effects[0], brawnEffect);
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
    prepared: 17,
  });
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
