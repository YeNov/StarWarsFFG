/**
 * Node tests for starting free skill-rank caps.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { getFreeRankCaps } from "../../modules/char-creator/validate.js";

function draft({ careerCreation, specCreation, speciesCreation } = {}) {
  return {
    selected: {
      career: careerCreation ? { snapshot: { system: { creation: careerCreation } } } : null,
      specialization: specCreation ? { snapshot: { system: { creation: specCreation } } } : null,
      species: speciesCreation ? { snapshot: { system: { creation: speciesCreation } } } : null,
    },
  };
}

test("defaults preserve legacy 4 career / 2 specialization choices", () => {
  assert.deepEqual(getFreeRankCaps(draft()), { career: 4, specialization: 2 });
});

test("career and specialization item data can override base caps", () => {
  assert.deepEqual(
    getFreeRankCaps(draft({
      careerCreation: { skillRankChoices: 3 },
      specCreation: { skillRankChoices: 1 },
    })),
    { career: 3, specialization: 1 },
  );
});

test("species data can add Droid-style bonus caps", () => {
  assert.deepEqual(
    getFreeRankCaps(draft({
      speciesCreation: {
        careerSkillRankChoicesBonus: 2,
        specializationSkillRankChoicesBonus: 1,
      },
    })),
    { career: 6, specialization: 3 },
  );
});

test("invalid and negative data is bounded", () => {
  assert.deepEqual(
    getFreeRankCaps(draft({
      careerCreation: { skillRankChoices: "x" },
      specCreation: { skillRankChoices: -5 },
      speciesCreation: {
        careerSkillRankChoicesBonus: -99,
        specializationSkillRankChoicesBonus: "x",
      },
    })),
    { career: 4, specialization: 0 },
  );
});
