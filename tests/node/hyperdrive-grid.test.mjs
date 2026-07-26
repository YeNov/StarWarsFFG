import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  careerSkillGrantsForItems,
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
