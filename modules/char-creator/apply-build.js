/**
 * applyBuild — THE single actor-source builder (issue A, D2).
 *
 * Covered. Imports calculators.js only (Covered→Covered); creation defaults, the
 * characteristic-delta applier and toItemData all arrive INJECTED (DEV-15/DEV-16), so
 * this module never reaches a poisoned import. Pure and synchronous.
 *
 * Both legacy successors — showCharacterStatus (character-creator.js:1083-1205) and
 * createActor (:1697-1845) — collapse to this one function.
 *
 * Data-shape conventions this builder relies on (see wizard-state.js):
 *  - selected.species/career/specialization/background.* are SelectionRefs (or null).
 *  - characteristic XP purchases are {key, value, cost}; one entry == one +1 step.
 *  - skill XP purchases are {key, cost}; one entry == one +1 rank.
 *  - specialization/forcePower XP purchases and credit purchases carry a `ref`
 *    SelectionRef; tree items may carry `learnedKeys` (purchased node keys).
 */

import { calcXp, calcCredits, calcObligation } from "./calculators.js";
import { getSpeciesSkillRankGrants } from "./species-skill-choices.js";

/** Placeholder name so a not-yet-named draft still constructs/validates (core fills the
 *  prototypeToken name from this — actor.mjs:95 only derives it from a truthy name). */
const DEFAULT_NAME = "New Character";

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

function armorSoakValue(item) {
  const adjusted = Number(item?.system?.soak?.adjusted);
  if (Number.isFinite(adjusted)) return adjusted;
  const value = Number(item?.system?.soak?.value);
  return Number.isFinite(value) ? value : 0;
}

function equipBestPurchasedArmor(items) {
  const armor = items.filter((item) => item?.type === "armour");
  if (!armor.length) return;

  armor.forEach((item) => foundry.utils.setProperty(item, "system.equippable.equipped", false));
  armor.sort((a, b) => armorSoakValue(b) - armorSoakValue(a))[0].system.equippable.equipped = true;
}

/**
 * Build the actor source from a wizard draft.
 * @param {object} data  the wizard state
 * @param {{creationDefaults: object, applyCharacteristicDeltas: Function, toItemData: Function}} deps
 * @returns {{actorData: object, warnings: string[]}}
 */
export function applyBuild(data, { creationDefaults, applyCharacteristicDeltas, toItemData }) {
  const warnings = [];
  const actorName = data.identity.name || DEFAULT_NAME;

  // 1. Base + identity. A complete source containing `system` bypasses
  //    ActorFFG.create's token block, so the partial prototypeToken (NO name /
  //    texture.src) and the default image must be set here explicitly.
  const actorData = {
    name: actorName,
    type: "character",
    img: data.identity.img || creationDefaults.img,
    system: foundry.utils.deepClone(creationDefaults.system),
    prototypeToken: { ...foundry.utils.deepClone(creationDefaults.prototypeToken), name: actorName },
    items: [],
  };

  // 2. Characteristic purchases → aggregate deltas, applied via the injected function
  //    (which also raises the Brawn/Willpower-derived stats). Skill purchases add ranks.
  const deltas = {};
  for (const purchase of data.purchases.xp.characteristics) {
    deltas[purchase.key] = (deltas[purchase.key] ?? 0) + 1;
  }
  actorData.system = applyCharacteristicDeltas(actorData.system, deltas);

  // Skill purchases → +1 rank each, applied to the CLEAN full skills dict from
  // getActorCreationDefaults (which now seeds from the throwaway's _source system). Keep the
  // FULL dict, not a partial override: a skill's characteristic / groupskill / careerskill /
  // type / max come from the STOCK skills (_source), NOT from CONFIG.FFG.skills — so a partial
  // dict would strip those and break the sheet's dice pools. Clean _source skills preserve the
  // incremented rank through Actor construction (the prepared system did not — hence _source).
  for (const purchase of data.purchases.xp.skills) {
    actorData.system.skills[purchase.key].rank += 1;
  }

  // 3. Other system fields, from the shared calculators.
  const xp = calcXp(data);
  actorData.system.experience = { total: xp.total, available: xp.available };

  const credits = calcCredits(data);
  actorData.system.stats.credits.value = credits.available + data.spendingCredits;

  const obligation = calcObligation(data);
  if (obligation.key) {
    actorData.system[obligation.key] = { ...(actorData.system[obligation.key] ?? {}), value: obligation.available };
  }

  // 4. Items via the injected toItemData, one category at a time.
  const addItem = (ref, options = {}) => {
    if (ref?.uuid) actorData.items.push(toItemData(ref, options));
  };

  // backgrounds
  addItem(data.selected.background.culture);
  addItem(data.selected.background.hook);
  if (data.selected.rules === "fad") addItem(data.selected.background.forceAttitude);

  // obligations (their snapshots carry the user's edits)
  for (const obligation of data.selected.obligations) addItem(obligation);

  // species + species-granted free skill ranks
  addItem(data.selected.species, { rankGrants: getSpeciesSkillRankGrants(data) });

  // career + free career skill ranks
  addItem(data.selected.career, { rankGrants: data.selected.careerCareerSkillRanks ?? [] });

  // selected specialization + free spec skill ranks + purchased talent nodes
  addItem(data.selected.specialization, {
    rankGrants: data.selected.specializationCareerSkillRanks ?? [],
    learnedKeys: data.purchases.xp.talents.map((purchase) => purchase.key),
  });

  // purchased extra specializations and Force powers (N-5)
  for (const purchase of data.purchases.xp.specializations) {
    addItem(purchase.ref, { learnedKeys: purchase.ref?.learnedKeys ?? purchase.learnedKeys ?? [] });
  }
  for (const purchase of data.purchases.xp.forcePowers) {
    addItem(purchase.ref, { learnedKeys: purchase.ref?.learnedKeys ?? purchase.learnedKeys ?? [] });
  }

  // motivations — plain SelectionRefs through the same toItemData (BUG-1)
  for (const motivation of data.selected.motivations) addItem(motivation);

  // credit-purchased gear (N-6). Attachment purchases are nested into their target
  // item via system.itemattachment[], matching the item sheet's drag-drop shape.
  const attachmentsByTarget = attachmentPurchasesByTarget(data);
  const purchasedItems = [];
  for (const purchase of data.purchases.credits) {
    if (isAttachmentPurchase(purchase)) continue;
    if (!purchase.ref?.uuid) continue;
    const item = toItemData(purchase.ref);
    for (const attachment of attachmentsByTarget.get(purchase.id) ?? []) {
      const attachmentItem = toItemData(attachment.ref);
      item.system ??= {};
      item.system.itemattachment ??= [];
      item.system.itemattachment.push(attachmentItem);
      if (attachmentItem.effects?.length) item.effects = [...(item.effects ?? []), ...attachmentItem.effects];
    }
    purchasedItems.push(item);
  }
  equipBestPurchasedArmor(purchasedItems);
  actorData.items.push(...purchasedItems);

  return { actorData, warnings };
}
