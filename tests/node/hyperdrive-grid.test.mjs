import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  careerSkillGrantsForItems,
  careerSkillsForActor,
  dedicationGrantsForSpec,
  invertDedications,
  learnedKeysForPower,
  learnedKeysForSpec,
  rankGrantsForItems,
} from "../../modules/importer/hyperdrive/to-actor.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const parsed = parseHyperdrive(RAW);

test("maps specialization and Force grids to Foundry tree node keys", () => {
  assert.deepEqual(learnedKeysForSpec(parsed.specializations[0]), [
    "talent2", "talent3", "talent7", "talent10", "talent11", "talent14", "talent18",
  ]);
  assert.deepEqual(learnedKeysForSpec(parsed.specializations[1]), ["talent0", "talent4", "talent5"]);
  assert.deepEqual(learnedKeysForPower(parsed.forcePowers.find((power) => power.key === "CONJURE")), ["upgrade0"]);
  assert.deepEqual(learnedKeysForPower(parsed.forcePowers.find((power) => power.key === "ALTER")), ["upgrade2"]);
});

test("Force upgrade rows are padded to four columns, not packed by row length", () => {
  // Alter's row 1 holds THREE cells. Foundry still starts row 2 at upgrade4
  // (`upgrade${(row-1)*4+column}`), so a purchase at row 2 column 0 is upgrade4 — a
  // running offset would pack it to upgrade3 and flag the wrong node as learned.
  const power = {
    grid: {
      0: [true],
      1: [false, false, true],
      2: [true, false, false, false],
      3: [false, false, false, true],
    },
  };
  assert.deepEqual(learnedKeysForPower(power), ["upgrade2", "upgrade4", "upgrade11"]);
});

test("routes Dedication only to a learned Dedication node on its owning specialization", () => {
  const bySpec = invertDedications(parsed.dedications);
  const steel = parsed.specializations[0];
  const talents = { talent18: { name: "Dedication" } };
  assert.deepEqual(dedicationGrantsForSpec(steel, talents, bySpec), {
    talent18: {
      pcwDedication: { modtype: "Characteristic", mod: "Brawn", value: 1 },
    },
  });
  assert.deepEqual(dedicationGrantsForSpec(
    { key: "MARSHAL", grid: [] },
    { talent0: { name: "Dedication" } },
    bySpec,
  ), {});
});

test("routes free-rank and extra-career-skill grants to their owning items", () => {
  assert.deepEqual(rankGrantsForItems(parsed), {
    species: ["Brawl"],
    career: ["Athletics", "Brawl", "Cool"],
    spec: ["Brawl", "Coordination"],
  });
  assert.deepEqual(careerSkillGrantsForItems(parsed), { career: [] });
});

test("canonicalizes Hyperdrive free-rank and career-skill names", () => {
  const jack = {
    skills: [
      { key: "RANGHVY", skill: "Ranged (Heavy)", rank: 1 },
      { key: "OUT", skill: "Outer Rim", rank: 0 },
      { key: "XEN", skill: "Xenology", rank: 0 },
    ],
    species: { selectedSkills: [] },
    careerRanks: ["Outer Rim", "Xenology"],
    specRanks: ["Ranged (Heavy)"],
    careerSkills: ["Outer Rim", "Xenology"],
    specSkills: ["Ranged (Heavy)"],
    extraCareerSkills: [],
    specializations: [],
  };
  assert.deepEqual(rankGrantsForItems(jack), {
    species: [],
    career: ["Knowledge: Outer Rim", "Knowledge: Xenology"],
    spec: ["Ranged: Heavy"],
  });
  assert.deepEqual(careerSkillsForActor(jack), [
    "Knowledge: Outer Rim",
    "Knowledge: Xenology",
    "Ranged: Heavy",
  ]);
});

test("collects all exported career and specialization skills for the actor", () => {
  const careerSkills = new Set(careerSkillsForActor(parsed));
  for (const skill of [
    "Athletics",
    "Brawl",
    "Cool",
    "Melee",
    "Perception",
    "Survival",
    "Coordination",
    "Discipline",
    "Vigilance",
    "Coercion",
    "Mechanics",
    "Piloting: Planetary",
    "Ranged: Light",
  ]) {
    assert.equal(careerSkills.has(skill), true, `${skill} should be a career skill`);
  }
  assert.equal(careerSkills.size, 13);
});
