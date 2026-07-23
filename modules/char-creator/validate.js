/**
 * Advisory draft validation (D4, issue G).
 *
 * Covered. Imports calculators.js only (a subset of its calculators+constants closure).
 *
 * BINDING CONSTRAINT: this returns i18n KEYS, never localized strings — the caller
 * localizes. And per D4, creation is NEVER blocked: there is no "error" status. Warnings
 * are advisory; the UI turns any non-empty `warnings` into ONE confirm dialog whose
 * default is "Create anyway".
 */

import { calcXp, calcCredits } from "./calculators.js";
import { getSpeciesSkillRankChoices, getSpeciesSkillRankChoiceStatus } from "./species-skill-choices.js";

const WIZARD = "SWFFG.CharacterCreator.Wizard";
const REVIEW = "SWFFG.CharacterCreator.review";
const VALIDATE = "SWFFG.CharacterCreator.Validate";

export const DEFAULT_CAREER_RANK_CHOICES = 4;
export const DEFAULT_SPECIALIZATION_RANK_CHOICES = 2;

function creationOf(ref) {
  return ref?.snapshot?.system?.creation ?? ref?.system?.creation ?? {};
}

function integerOr(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

/**
 * Starting free skill-rank choice counts. The fields are optional so existing
 * packs keep the original 4/2 behavior until source items opt in.
 *
 * @param {object} data wizard state
 * @returns {{career: number, specialization: number}}
 */
export function getFreeRankCaps(data) {
  const selected = data?.selected ?? {};
  const careerCreation = creationOf(selected.career);
  const speciesCreation = creationOf(selected.species);
  const specializationCreation = creationOf(selected.specialization);

  const careerBase = integerOr(careerCreation.skillRankChoices, DEFAULT_CAREER_RANK_CHOICES);
  const specializationBase = integerOr(
    specializationCreation.skillRankChoices,
    DEFAULT_SPECIALIZATION_RANK_CHOICES,
  );
  const careerBonus = integerOr(speciesCreation.careerSkillRankChoicesBonus, 0);
  const specializationBonus = integerOr(speciesCreation.specializationSkillRankChoicesBonus, 0);

  return {
    career: Math.max(0, careerBase + careerBonus),
    specialization: Math.max(0, specializationBase + specializationBonus),
  };
}

/** True when a single-select SelectionRef (or scalar) is set. */
function isSet(value) {
  if (value == null) return false;
  if (typeof value === "object") return Boolean(value.uuid);
  return true;
}

/**
 * Validate a draft into per-step completeness, running totals, and advisory warnings.
 * @param {object} data  the wizard state
 * @returns {{steps: Array<{id, labelKey, status}>, totals: {xp, credits}, warnings: string[]}}
 */
export function validateDraft(data) {
  const sel = data.selected;
  const status = (complete) => (complete ? "complete" : "incomplete");
  const step = (id, labelKey, complete) => {
    const statusValue = typeof complete === "string" ? complete : status(complete);
    return { id, labelKey, status: statusValue, statusKey: `${VALIDATE}.Status.${statusValue}` };
  };
  const freeRankCaps = getFreeRankCaps(data);
  const speciesRankChoices = getSpeciesSkillRankChoiceStatus(data);
  const hasSpeciesRankChoices = getSpeciesSkillRankChoices(data).length > 0;

  const steps = [
    step("rules", `${REVIEW}.rules`, isSet(sel.rules)),
    step("obligation", `${REVIEW}.morality_duty_obligation`, sel.obligations.length > 0),
    step("species", `${REVIEW}.species`, isSet(sel.species)),
    ...(hasSpeciesRankChoices ? [step("speciesRanks", `${REVIEW}.speciesRanks`, speciesRankChoices.complete)] : []),
    step("career", `${REVIEW}.career`, isSet(sel.career)),
    step("careerRanks", `${REVIEW}.careerRanks`, sel.careerCareerSkillRanks.length === freeRankCaps.career),
    step("specialization", `${REVIEW}.specialization`, isSet(sel.specialization)),
    step("specializationRanks", `${REVIEW}.specializationRanks`, sel.specializationCareerSkillRanks.length === freeRankCaps.specialization),
    step("xp", `${REVIEW}.purchases.xp`, "complete"), // spending is optional
    step("credits", `${REVIEW}.purchases.credits`, "complete"),
    step("motivation", `${REVIEW}.motivation`, sel.motivations.length > 0),
    step("review", `${REVIEW}.Confirm`, "complete"),
  ];

  const warnings = [];
  if (sel.careerCareerSkillRanks.length !== freeRankCaps.career) warnings.push(`${VALIDATE}.CareerRanks`);
  if (sel.specializationCareerSkillRanks.length !== freeRankCaps.specialization) warnings.push(`${VALIDATE}.SpecRanks`);
  if (hasSpeciesRankChoices && !speciesRankChoices.complete) warnings.push(`${VALIDATE}.SpeciesRanks`);

  const xp = calcXp(data);
  const credits = calcCredits(data);
  if (xp.available < 0) warnings.push(`${VALIDATE}.XpOverspent`);
  if (credits.available < 0) warnings.push(`${VALIDATE}.CreditsOverspent`);
  if (xp.available > 0) warnings.push(`${VALIDATE}.UnspentXp`);

  return { steps, totals: { xp, credits }, warnings };
}
