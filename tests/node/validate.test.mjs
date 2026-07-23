/**
 * Node tests for advisory validation (Stage 12, D4).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { validateDraft } from "../../modules/char-creator/validate.js";

/** A minimal empty-ish draft (no selections, no purchases). */
function emptyDraft() {
  return {
    selected: {
      rules: "fad",
      background: { culture: null, hook: null, forceAttitude: null },
      startingBonus: null,
      obligations: [],
      species: null,
      speciesSkillRankChoices: {},
      speciesSkillRankChoiceBranches: {},
      career: null,
      careerCareerSkillRanks: [],
      specialization: null,
      specializationCareerSkillRanks: [],
      motivations: [],
    },
    grants: { gm: { credits: 0 }, bonus: { xp: 0, credits: 0 } },
    initial: { morality: 0, obligation: 0, duty: 0 },
    purchases: {
      xp: { characteristics: [], skills: [], talents: [], specializations: [], forcePowers: [] },
      credits: [],
    },
    spendingCredits: 0,
  };
}

test("empty draft: selection steps are incomplete and NOTHING blocks (no error status)", () => {
  const { steps } = validateDraft(emptyDraft());
  const byId = Object.fromEntries(steps.map((s) => [s.id, s.status]));
  for (const id of ["obligation", "species", "career", "specialization", "motivation"]) {
    assert.equal(byId[id], "incomplete", `${id} should be incomplete`);
  }
  // D4: create is never blocked — no step is ever an "error"
  assert.ok(steps.every((s) => s.status === "complete" || s.status === "incomplete"));
});

test("overspent draft: warning key present, never an error/blocking status", () => {
  const draft = emptyDraft();
  draft.grants.bonus.xp = 10; // total XP = 10
  draft.purchases.xp.talents = [{ cost: 25 }]; // overspend
  const { warnings, steps } = validateDraft(draft);
  assert.ok(warnings.includes("SWFFG.CharacterCreator.Validate.XpOverspent"));
  assert.ok(steps.every((s) => s.status !== "error"));
});

test("unspent XP produces an advisory notice (not overspent)", () => {
  const draft = emptyDraft();
  draft.grants.bonus.xp = 15; // 15 available, nothing spent
  const { warnings } = validateDraft(draft);
  assert.ok(warnings.includes("SWFFG.CharacterCreator.Validate.UnspentXp"));
  assert.ok(!warnings.includes("SWFFG.CharacterCreator.Validate.XpOverspent"));
});

test("statuses flip to complete as selections are made", () => {
  const draft = emptyDraft();
  draft.selected.species = { uuid: "sp1", name: "Human" };
  draft.selected.obligations = [{ uuid: "o1" }];
  draft.selected.motivations = [{ uuid: "m1" }];
  draft.selected.careerCareerSkillRanks = ["a", "b", "c", "d"]; // exactly 4
  draft.selected.specializationCareerSkillRanks = ["x", "y"]; // exactly 2
  const { steps, warnings } = validateDraft(draft);
  const byId = Object.fromEntries(steps.map((s) => [s.id, s.status]));
  assert.equal(byId.species, "complete");
  assert.equal(byId.obligation, "complete");
  assert.equal(byId.motivation, "complete");
  assert.equal(byId.careerRanks, "complete");
  assert.equal(byId.specializationRanks, "complete");
  // exact rank counts → no rank warnings
  assert.ok(!warnings.includes("SWFFG.CharacterCreator.Validate.CareerRanks"));
  assert.ok(!warnings.includes("SWFFG.CharacterCreator.Validate.SpecRanks"));
});

test("wrong free-rank counts produce advisory warnings", () => {
  const draft = emptyDraft();
  draft.selected.careerCareerSkillRanks = ["a", "b"]; // 2, expected 4
  draft.selected.specializationCareerSkillRanks = ["x"]; // 1, expected 2
  const { warnings } = validateDraft(draft);
  assert.ok(warnings.includes("SWFFG.CharacterCreator.Validate.CareerRanks"));
  assert.ok(warnings.includes("SWFFG.CharacterCreator.Validate.SpecRanks"));
});

test("free-rank validation follows selected item creation caps", () => {
  const draft = emptyDraft();
  draft.selected.career = { uuid: "c1", snapshot: { system: { creation: { skillRankChoices: 3 } } } };
  draft.selected.species = {
    uuid: "s1",
    snapshot: {
      system: {
        creation: {
          careerSkillRankChoicesBonus: 2,
          specializationSkillRankChoicesBonus: 1,
        },
      },
    },
  };
  draft.selected.specialization = { uuid: "sp1", snapshot: { system: { creation: { skillRankChoices: 2 } } } };
  draft.selected.careerCareerSkillRanks = ["a", "b", "c", "d", "e"];
  draft.selected.specializationCareerSkillRanks = ["x", "y", "z"];
  const { steps, warnings } = validateDraft(draft);
  const byId = Object.fromEntries(steps.map((s) => [s.id, s.status]));
  assert.equal(byId.careerRanks, "complete");
  assert.equal(byId.specializationRanks, "complete");
  assert.ok(!warnings.includes("SWFFG.CharacterCreator.Validate.CareerRanks"));
  assert.ok(!warnings.includes("SWFFG.CharacterCreator.Validate.SpecRanks"));
});

test("species skill-rank choices are validated against exact selected counts", () => {
  const draft = emptyDraft();
  draft.selected.species = {
    uuid: "s1",
    snapshot: {
      system: {
        creation: {
          skillRankChoices: [{ id: "human-additional-non-career-skills", label: "Additional Non-Career Skills", count: 2 }],
        },
      },
    },
  };
  draft.selected.speciesSkillRankChoices = { "human-additional-non-career-skills": ["Charm"] };

  let result = validateDraft(draft);
  let byId = Object.fromEntries(result.steps.map((s) => [s.id, s.status]));
  assert.equal(byId.speciesRanks, "incomplete");
  assert.ok(result.warnings.includes("SWFFG.CharacterCreator.Validate.SpeciesRanks"));

  draft.selected.speciesSkillRankChoices["human-additional-non-career-skills"].push("Brawl");
  result = validateDraft(draft);
  byId = Object.fromEntries(result.steps.map((s) => [s.id, s.status]));
  assert.equal(byId.speciesRanks, "complete");
  assert.ok(!result.warnings.includes("SWFFG.CharacterCreator.Validate.SpeciesRanks"));
});

test("species skill-rank review step appears only when the species provides choices", () => {
  const plain = emptyDraft();
  plain.selected.species = { uuid: "s1", snapshot: { system: { creation: {} } } };
  let byId = Object.fromEntries(validateDraft(plain).steps.map((s) => [s.id, s.status]));
  assert.equal(byId.speciesRanks, undefined);

  const withChoices = emptyDraft();
  withChoices.selected.species = {
    uuid: "s2",
    snapshot: {
      system: {
        creation: {
          skillRankChoices: [{ id: "choice-1", label: "Choice 1", count: 1 }],
        },
      },
    },
  };
  byId = Object.fromEntries(validateDraft(withChoices).steps.map((s) => [s.id, s.status]));
  assert.equal(byId.speciesRanks, "incomplete");
});

test("BINDING: every returned label and warning is an i18n KEY (SWFFG. prefix), never localized text", () => {
  const { steps, warnings } = validateDraft(emptyDraft());
  for (const step of steps) assert.match(step.labelKey, /^SWFFG\./);
  for (const warning of warnings) assert.match(warning, /^SWFFG\./);
});

test("totals expose the running XP and credit calculations", () => {
  const draft = emptyDraft();
  draft.grants.gm.credits = 500;
  const { totals } = validateDraft(draft);
  assert.equal(totals.credits.total, 500);
  assert.equal(typeof totals.xp.available, "number");
});
