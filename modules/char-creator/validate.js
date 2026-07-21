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

const WIZARD = "SWFFG.CharacterCreator.Wizard";
const VALIDATE = "SWFFG.CharacterCreator.Validate";

/** Free skill-rank counts the rules expect (review copy en.json:967,969). */
export const EXPECTED_CAREER_RANKS = 4;
export const EXPECTED_SPECIALIZATION_RANKS = 2;

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

  const steps = [
    { id: "rules", labelKey: `${WIZARD}.Rules.Label`, status: status(isSet(sel.rules)) },
    { id: "obligation", labelKey: `${WIZARD}.Obligation.Label`, status: status(sel.obligations.length > 0) },
    { id: "species", labelKey: `${WIZARD}.Species.Label`, status: status(isSet(sel.species)) },
    { id: "career", labelKey: `${WIZARD}.Career.Label`, status: status(isSet(sel.career)) },
    { id: "careerRanks", labelKey: `${WIZARD}.CareerRanks.Label`, status: status(sel.careerCareerSkillRanks.length === EXPECTED_CAREER_RANKS) },
    { id: "specialization", labelKey: `${WIZARD}.Specialization.Label`, status: status(isSet(sel.specialization)) },
    { id: "specializationRanks", labelKey: `${WIZARD}.SpecializationRanks.Label`, status: status(sel.specializationCareerSkillRanks.length === EXPECTED_SPECIALIZATION_RANKS) },
    { id: "xp", labelKey: `${WIZARD}.XP.Label`, status: "complete" }, // spending is optional
    { id: "credits", labelKey: `${WIZARD}.Credits.Label`, status: "complete" },
    { id: "motivation", labelKey: `${WIZARD}.Motivation.Label`, status: status(sel.motivations.length > 0) },
    { id: "review", labelKey: `${WIZARD}.Review.Label`, status: "complete" },
  ];

  const warnings = [];
  if (sel.careerCareerSkillRanks.length !== EXPECTED_CAREER_RANKS) warnings.push(`${VALIDATE}.CareerRanks`);
  if (sel.specializationCareerSkillRanks.length !== EXPECTED_SPECIALIZATION_RANKS) warnings.push(`${VALIDATE}.SpecRanks`);

  const xp = calcXp(data);
  const credits = calcCredits(data);
  if (xp.available < 0) warnings.push(`${VALIDATE}.XpOverspent`);
  if (credits.available < 0) warnings.push(`${VALIDATE}.CreditsOverspent`);
  if (xp.available > 0) warnings.push(`${VALIDATE}.UnspentXp`);

  return { steps, totals: { xp, credits }, warnings };
}
