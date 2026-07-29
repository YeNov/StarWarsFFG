/**
 * Convert a character-creator draft into a complete actor source. The reusable
 * source assembly is delegated to assembleCharacterSource; this adapter retains
 * the wizard-specific purchase history and item ordering.
 */

import { calcXp, calcCredits, calcObligation } from "./calculators.js";
import { getSpeciesSkillRankGrants } from "./species-skill-choices.js";
import { assembleCharacterSource } from "./assemble-character-source.js";

const DEDICATION_ATTRIBUTE_KEY = "pcwDedication";

function isDedicationTalent(talent) {
  return String(talent?.name ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase() === "dedication";
}

function dedicationNodeAttributeGrants(talents = {}, purchases = [], characteristics = {}) {
  const grants = {};
  for (const purchase of purchases ?? []) {
    const node = talents[purchase?.key];
    const characteristic = purchase?.characteristic;
    if (!isDedicationTalent(node) || !characteristic || !characteristics[characteristic]) continue;
    grants[purchase.key] = {
      ...(grants[purchase.key] ?? {}),
      [DEDICATION_ATTRIBUTE_KEY]: { modtype: "Characteristic", mod: characteristic, value: 1 },
    };
  }
  return grants;
}

function isAttachmentPurchase(purchase) {
  return purchase?.ref?.type === "itemattachment" && Boolean(purchase.attachTo);
}

function attachmentPurchasesByTarget(data) {
  const map = new Map();
  for (const purchase of data.purchases?.credits ?? []) {
    if (!isAttachmentPurchase(purchase)) continue;
    if (!map.has(purchase.attachTo)) map.set(purchase.attachTo, []);
    map.get(purchase.attachTo).push(purchase);
  }
  return map;
}

function careerSkillNames(ref) {
  return Object.values(ref?.snapshot?.system?.careerSkills ?? {});
}

function allCareerSkillNames(data) {
  return [
    ...careerSkillNames(data.selected?.career),
    ...careerSkillNames(data.selected?.specialization),
    ...(data.purchases?.xp?.specializations ?? []).flatMap((purchase) => careerSkillNames(purchase.ref)),
  ];
}

/**
 * @param {object} data
 * @param {{creationDefaults: object, applyCharacteristicDeltas: Function, toItemData: Function}} deps
 * @returns {{actorData: object, warnings: string[]}}
 */
export function applyBuild(data, { creationDefaults, applyCharacteristicDeltas, toItemData }) {
  const characteristicDeltas = {};
  for (const purchase of data.purchases.xp.characteristics) {
    characteristicDeltas[purchase.key] = (characteristicDeltas[purchase.key] ?? 0) + 1;
  }
  const skillDeltas = {};
  for (const purchase of data.purchases.xp.skills) {
    skillDeltas[purchase.key] = (skillDeltas[purchase.key] ?? 0) + 1;
  }

  const buildItems = [];
  const addItem = (ref, options = {}) => {
    if (ref?.uuid) buildItems.push(toItemData(ref, options));
  };

  addItem(data.selected.background.culture);
  addItem(data.selected.background.hook);
  if (data.selected.rules === "fad") addItem(data.selected.background.forceAttitude);
  for (const obligation of data.selected.obligations) addItem(obligation);

  addItem(data.selected.species, { rankGrants: getSpeciesSkillRankGrants(data) });
  addItem(data.selected.career, { rankGrants: data.selected.careerCareerSkillRanks ?? [] });
  addItem(data.selected.specialization, {
    rankGrants: data.selected.specializationCareerSkillRanks ?? [],
    learnedKeys: data.purchases.xp.talents.map((purchase) => purchase.key),
    nodeAttributeGrants: dedicationNodeAttributeGrants(
      data.selected.specialization?.snapshot?.system?.talents,
      data.purchases.xp.talents,
      creationDefaults.system.characteristics,
    ),
  });

  for (const purchase of data.purchases.xp.specializations) {
    addItem(purchase.ref, { learnedKeys: purchase.ref?.learnedKeys ?? purchase.learnedKeys ?? [] });
  }
  for (const purchase of data.purchases.xp.forcePowers) {
    addItem(purchase.ref, { learnedKeys: purchase.ref?.learnedKeys ?? purchase.learnedKeys ?? [] });
  }
  for (const motivation of data.selected.motivations) addItem(motivation);

  const attachmentsByTarget = attachmentPurchasesByTarget(data);
  const equipmentItems = [];
  for (const purchase of data.purchases.credits) {
    if (isAttachmentPurchase(purchase) || !purchase.ref?.uuid) continue;
    const item = toItemData(purchase.ref);
    for (const attachment of attachmentsByTarget.get(purchase.id) ?? []) {
      const attachmentItem = toItemData(attachment.ref);
      item.system ??= {};
      item.system.itemattachment ??= [];
      item.system.itemattachment.push(attachmentItem);
      if (attachmentItem.effects?.length) {
        item.effects = [...(item.effects ?? []), ...attachmentItem.effects];
      }
    }
    equipmentItems.push(item);
  }

  const xp = calcXp(data);
  const credits = calcCredits(data);
  const obligation = calcObligation(data);
  return assembleCharacterSource(
    { creationDefaults, applyCharacteristicDeltas },
    {
      name: data.identity.name,
      img: data.identity.img,
      characteristicDeltas,
      skillDeltas,
      careerSkills: allCareerSkillNames(data),
      experience: xp,
      credits: credits.available + data.spendingCredits,
      track: obligation.key ? { key: obligation.key, value: obligation.available } : null,
      buildItems,
      equipmentItems,
    },
  );
}
