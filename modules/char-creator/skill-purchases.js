/**
 * XP skill-purchase normalization for the PC wizard.
 *
 * Paid skill ranks store both the resulting rank value and the XP cost so the UI can
 * refund the current top purchased rank. When career-skill status or free ranks change,
 * those stored values must be rebuilt against the new baseline.
 */

import { getSpeciesSkillRankGrants } from "./species-skill-choices.js";

const CREATION_SKILL_CAP = 2;

function skillLookup(stockSkills = {}) {
  const lookup = new Map();
  for (const [key, skill] of Object.entries(stockSkills)) {
    lookup.set(key, key);
    lookup.set(key.toLowerCase(), key);
    if (skill?.label) {
      lookup.set(skill.label, key);
      lookup.set(String(skill.label).toLowerCase(), key);
    }
  }
  return lookup;
}

function canonicalSkillKey(value, lookup) {
  if (!value) return null;
  return lookup.get(value) ?? lookup.get(String(value).toLowerCase()) ?? String(value);
}

function careerSkillNames(ref) {
  return Object.values(ref?.snapshot?.system?.careerSkills ?? {}).filter(Boolean);
}

function selectedCareerSkillKeys(data, lookup) {
  const keys = new Set();
  const add = (name) => {
    const key = canonicalSkillKey(name, lookup);
    if (key) keys.add(key);
  };
  careerSkillNames(data.selected?.career).forEach(add);
  careerSkillNames(data.selected?.specialization).forEach(add);
  for (const purchase of data.purchases?.xp?.specializations ?? []) {
    careerSkillNames(purchase.ref).forEach(add);
  }
  return keys;
}

function freeRankCounts(data, lookup) {
  const counts = new Map();
  const add = (skill) => {
    const key = canonicalSkillKey(skill, lookup);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  getSpeciesSkillRankGrants(data).forEach(add);
  (data.selected?.careerCareerSkillRanks ?? []).forEach(add);
  (data.selected?.specializationCareerSkillRanks ?? []).forEach(add);
  return counts;
}

function paidRankCounts(purchases = []) {
  const counts = new Map();
  for (const purchase of purchases) {
    if (!purchase?.key) continue;
    counts.set(purchase.key, (counts.get(purchase.key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Rebuild stored XP skill purchases after career/free-rank status changes.
 *
 * @param {object} data
 * @param {object} stockSkills creation-default skill dictionary
 * @returns {object} data
 */
export function normalizeXpSkillPurchases(data, stockSkills = {}) {
  const purchases = data.purchases?.xp?.skills;
  if (!Array.isArray(purchases) || !purchases.length) return data;

  const lookup = skillLookup(stockSkills);
  const careerKeys = selectedCareerSkillKeys(data, lookup);
  const freeRanks = freeRankCounts(data, lookup);
  const paidRanks = paidRankCounts(purchases);
  const normalized = [];

  for (const [key, count] of paidRanks.entries()) {
    const stockSkill = stockSkills[key];
    if (!stockSkill) continue;
    const baseRank = (Number(stockSkill.rank) || 0) + (freeRanks.get(key) ?? 0);
    const paidCount = Math.min(count, Math.max(0, CREATION_SKILL_CAP - baseRank));
    const isCareer = careerKeys.has(key) || Boolean(stockSkill.careerskill);
    for (let step = 1; step <= paidCount; step += 1) {
      const value = baseRank + step;
      normalized.push({
        key,
        value,
        cost: isCareer ? value * 5 : value * 5 + 5,
      });
    }
  }

  data.purchases.xp.skills = normalized;
  return data;
}
