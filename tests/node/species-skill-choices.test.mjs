/**
 * Node tests for species-granted skill rank choices.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  getSpeciesSkillRankChoiceStatus,
  getSpeciesSkillRankGrants,
  prepareSpeciesSkillRankChoiceSections,
  prepareSpeciesSkillRankChoices,
  selectSpeciesSkillRankChoiceBranch,
  toggleSpeciesSkillRankChoice,
} from "../../modules/char-creator/species-skill-choices.js";

function draft() {
  return {
    selected: {
      species: {
        snapshot: {
          system: {
            creation: {
              skillRankChoices: [
                {
                  id: "human-additional-non-career-skills",
                  label: "Additional Non-Career Skills",
                  count: 2,
                  rank: 1,
                  pool: "nonCareer",
                  unique: true,
                  maxRankAtCreation: 2,
                },
                {
                  id: "drabatan-charm-or-leadership",
                  label: "Rank in Charm or Leadership",
                  count: 1,
                  rank: 1,
                  pool: "list",
                  skills: ["Charm", "Leadership"],
                },
              ],
            },
          },
        },
      },
      speciesSkillRankChoices: {},
      speciesSkillRankChoiceBranches: {},
    },
  };
}

const skills = [
  { key: "Charm", label: "Charm", rank: 0, careerskill: false, type: "General" },
  { key: "Leadership", label: "Leadership", rank: 2, careerskill: false, type: "General" },
  { key: "Cool", label: "Cool", rank: 1, careerskill: true, type: "General" },
  { key: "Brawl", label: "Brawl", rank: 0, careerskill: false, type: "Combat" },
  { key: "Knowledge: Lore", label: "Knowledge: Lore", rank: 0, careerskill: false, type: "Knowledge" },
  { key: "Knowledge: Warfare", label: "Knowledge: Warfare", rank: 0, careerskill: false, type: "Knowledge" },
];

test("species choice rows filter by pool/list and respect creation rank caps", () => {
  const data = draft();
  const rows = prepareSpeciesSkillRankChoices(data, skills);
  const byId = Object.fromEntries(rows.map((choice) => [choice.id, choice]));

  assert.deepEqual(byId["human-additional-non-career-skills"].rows.map((skill) => skill.key), ["Brawl", "Charm", "Knowledge: Lore", "Knowledge: Warfare", "Leadership"]);
  assert.equal(byId["human-additional-non-career-skills"].rows.find((skill) => skill.key === "Leadership").canToggle, false);
  assert.deepEqual(byId["drabatan-charm-or-leadership"].rows.map((skill) => skill.key), ["Charm", "Leadership"]);
});

test("species choices track exact counts and produce rank grants", () => {
  const data = draft();
  toggleSpeciesSkillRankChoice(data, "human-additional-non-career-skills", "Charm");
  toggleSpeciesSkillRankChoice(data, "human-additional-non-career-skills", "Brawl");
  toggleSpeciesSkillRankChoice(data, "drabatan-charm-or-leadership", "Leadership");

  assert.deepEqual(getSpeciesSkillRankChoiceStatus(data).entries, [
    { id: "human-additional-non-career-skills", label: "Additional Non-Career Skills", used: 2, expected: 2 },
    { id: "drabatan-charm-or-leadership", label: "Rank in Charm or Leadership", used: 1, expected: 1 },
  ]);
  assert.deepEqual(getSpeciesSkillRankGrants(data), ["Charm", "Brawl", "Leadership"]);
});

test("alternative groups complete exactly one choice, not every row in the group", () => {
  const data = draft();
  data.selected.species.snapshot.system.creation.skillRankChoices = [
    {
      id: "mandalorian-human-combat-skill",
      label: "Combat Skill",
      count: 1,
      rank: 1,
      pool: "combat",
      choiceGroup: "mandalorian-human-training",
      choiceGroupLabel: "Mandalorian Training",
    },
    {
      id: "mandalorian-human-knowledge-skills",
      label: "Knowledge Skills",
      count: 2,
      rank: 1,
      pool: "knowledge",
      choiceGroup: "mandalorian-human-training",
      choiceGroupLabel: "Mandalorian Training",
    },
  ];

  toggleSpeciesSkillRankChoice(data, "mandalorian-human-combat-skill", "Brawl");
  assert.deepEqual(getSpeciesSkillRankChoiceStatus(data).entries, [
    { id: "group:mandalorian-human-training", label: "Mandalorian Training: Combat Skill", used: 1, expected: 1 },
  ]);
  assert.equal(getSpeciesSkillRankChoiceStatus(data).complete, true);
  assert.deepEqual(getSpeciesSkillRankGrants(data), ["Brawl"]);

  let prepared = Object.fromEntries(prepareSpeciesSkillRankChoices(data, skills).map((choice) => [choice.id, choice]));
  assert.ok(prepared["mandalorian-human-knowledge-skills"].rows.every((skill) => !skill.canToggle));

  toggleSpeciesSkillRankChoice(data, "mandalorian-human-knowledge-skills", "Knowledge: Lore");
  assert.deepEqual(data.selected.speciesSkillRankChoices["mandalorian-human-combat-skill"], []);
  assert.equal(getSpeciesSkillRankChoiceStatus(data).complete, false);

  toggleSpeciesSkillRankChoice(data, "mandalorian-human-knowledge-skills", "Knowledge: Warfare");
  assert.deepEqual(getSpeciesSkillRankChoiceStatus(data).entries, [
    { id: "group:mandalorian-human-training", label: "Mandalorian Training: Knowledge Skills", used: 2, expected: 2 },
  ]);
  assert.equal(getSpeciesSkillRankChoiceStatus(data).complete, true);
  assert.deepEqual(getSpeciesSkillRankGrants(data), ["Knowledge: Lore", "Knowledge: Warfare"]);

  prepared = Object.fromEntries(prepareSpeciesSkillRankChoices(data, skills).map((choice) => [choice.id, choice]));
  assert.ok(prepared["mandalorian-human-combat-skill"].rows.every((skill) => !skill.canToggle));
});

test("alternative groups prepare as branch sections and switching branches clears the old branch", () => {
  const data = draft();
  data.selected.species.snapshot.system.creation.skillRankChoices = [
    {
      id: "mandalorian-human-combat-skill",
      label: "Combat Skill",
      count: 1,
      rank: 1,
      pool: "combat",
      choiceGroup: "mandalorian-human-training",
      choiceGroupLabel: "Mandalorian Training",
    },
    {
      id: "mandalorian-human-knowledge-skills",
      label: "Knowledge Skills",
      count: 2,
      rank: 1,
      pool: "knowledge",
      choiceGroup: "mandalorian-human-training",
      choiceGroupLabel: "Mandalorian Training",
    },
  ];

  let sections = prepareSpeciesSkillRankChoiceSections(data, skills);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].type, "group");
  assert.equal(sections[0].activeChoiceId, "mandalorian-human-combat-skill");
  assert.deepEqual(sections[0].choices.map((choice) => [choice.id, choice.active]), [
    ["mandalorian-human-combat-skill", true],
    ["mandalorian-human-knowledge-skills", false],
  ]);

  toggleSpeciesSkillRankChoice(data, "mandalorian-human-combat-skill", "Brawl");
  selectSpeciesSkillRankChoiceBranch(data, "mandalorian-human-training", "mandalorian-human-knowledge-skills");
  assert.deepEqual(data.selected.speciesSkillRankChoices["mandalorian-human-combat-skill"], []);
  assert.equal(data.selected.speciesSkillRankChoiceBranches["mandalorian-human-training"], "mandalorian-human-knowledge-skills");

  sections = prepareSpeciesSkillRankChoiceSections(data, skills);
  assert.equal(sections[0].activeChoiceId, "mandalorian-human-knowledge-skills");
  assert.deepEqual(sections[0].choices.map((choice) => [choice.id, choice.active]), [
    ["mandalorian-human-combat-skill", false],
    ["mandalorian-human-knowledge-skills", true],
  ]);
  assert.equal(getSpeciesSkillRankChoiceStatus(data).complete, false);
  assert.deepEqual(getSpeciesSkillRankChoiceStatus(data).entries, [
    { id: "group:mandalorian-human-training", label: "Mandalorian Training: Knowledge Skills", used: 0, expected: 2 },
  ]);
});
