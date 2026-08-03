/**
 * Node tests for PC wizard XP skill-purchase normalization.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { normalizeXpSkillPurchases } from "../../modules/char-creator/skill-purchases.js";

const STOCK_SKILLS = {
  Astrogation: { rank: 0, label: "Astrogation", careerskill: false },
  Brawl: { rank: 0, label: "Brawl", careerskill: false },
  KnowledgeLore: { rank: 0, label: "Knowledge: Lore", careerskill: false },
};

function ref({ careerSkills = {} } = {}) {
  return { snapshot: { system: { careerSkills } } };
}

function draft(overrides = {}) {
  return {
    selected: {
      species: null,
      speciesSkillRankChoices: {},
      speciesSkillRankChoiceBranches: {},
      career: null,
      careerCareerSkillRanks: [],
      specialization: null,
      specializationCareerSkillRanks: [],
      ...overrides.selected,
    },
    purchases: {
      xp: {
        skills: [],
        specializations: [],
        ...overrides.purchases?.xp,
      },
    },
  };
}

test("recalculates paid skill costs when a skill becomes career", () => {
  const data = draft({
    selected: {
      career: ref({ careerSkills: { careerSkill0: "Astrogation" } }),
    },
    purchases: {
      xp: {
        skills: [
          { key: "Astrogation", value: 1, cost: 10 },
          { key: "Astrogation", value: 2, cost: 15 },
        ],
      },
    },
  });

  normalizeXpSkillPurchases(data, STOCK_SKILLS);

  assert.deepEqual(data.purchases.xp.skills, [
    { key: "Astrogation", value: 1, cost: 5 },
    { key: "Astrogation", value: 2, cost: 10 },
  ]);
});

test("shifts paid rank values after a free rank and drops purchases above creation cap", () => {
  const data = draft({
    selected: {
      career: ref({ careerSkills: { careerSkill0: "Brawl" } }),
      careerCareerSkillRanks: ["Brawl"],
    },
    purchases: {
      xp: {
        skills: [
          { key: "Brawl", value: 1, cost: 10 },
          { key: "Brawl", value: 2, cost: 15 },
        ],
      },
    },
  });

  normalizeXpSkillPurchases(data, STOCK_SKILLS);

  assert.deepEqual(data.purchases.xp.skills, [
    { key: "Brawl", value: 2, cost: 10 },
  ]);
});

test("matches career skills stored by display label", () => {
  const data = draft({
    selected: {
      specialization: ref({ careerSkills: { careerSkill0: "Knowledge: Lore" } }),
    },
    purchases: {
      xp: {
        skills: [{ key: "KnowledgeLore", value: 1, cost: 10 }],
      },
    },
  });

  normalizeXpSkillPurchases(data, STOCK_SKILLS);

  assert.deepEqual(data.purchases.xp.skills, [
    { key: "KnowledgeLore", value: 1, cost: 5 },
  ]);
});

test("keeps paid ranks above two when the starting-rank cap is removed", () => {
  const data = draft({
    purchases: {
      xp: {
        skills: [
          { key: "Brawl", value: 1, cost: 10 },
          { key: "Brawl", value: 2, cost: 15 },
          { key: "Brawl", value: 3, cost: 20 },
          { key: "Brawl", value: 4, cost: 25 },
        ],
      },
    },
  });
  data.options = { removeStartingSkillRankCap: true };

  normalizeXpSkillPurchases(data, STOCK_SKILLS);

  assert.deepEqual(data.purchases.xp.skills.map(({ value, cost }) => ({ value, cost })), [
    { value: 1, cost: 10 },
    { value: 2, cost: 15 },
    { value: 3, cost: 20 },
    { value: 4, cost: 25 },
  ]);
});
