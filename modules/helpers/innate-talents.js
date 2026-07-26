const INNATE_TALENT_MODTYPE = "Innate Talent";
const INNATE_TALENT_ATTR = "innateTalent";

function clone(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof foundry !== "undefined" && foundry.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isActiveParentItem(item) {
  if (!item?.system) return false;
  if (item.system.equippable && item.system.equippable.equipped !== true) return false;
  return true;
}

function isInnateTalentAttribute(attribute) {
  const modtype = String(attribute?.modtype ?? "").replace(/\s+/g, "").toLowerCase();
  return modtype === INNATE_TALENT_MODTYPE.replace(/\s+/g, "").toLowerCase();
}

function innateTalentName(attribute) {
  const mod = String(attribute?.mod ?? "").trim();
  if (mod) return mod;
  return String(attribute?.value ?? "").trim();
}

function innateTalentRank(attribute) {
  const rank = Number(attribute?.value);
  if (Number.isFinite(rank) && rank > 0) return rank;
  return 1;
}

function pushInnateTalentGrant(grants, attribute, source) {
  if (!isInnateTalentAttribute(attribute)) return;

  const name = innateTalentName(attribute);
  if (!name) return;

  grants.push({
    name,
    itemId: source.id,
    description: source.description,
    activation: "Passive",
    activationLabel: "SWFFG.TalentActivationsPassive",
    isRanked: true,
    rank: source.rank ?? innateTalentRank(attribute),
    source: [{
      type: "itemattachment",
      typeLabel: "TYPES.Item.itemattachment",
      name: source.name,
      id: source.parentItemId,
    }],
  });
}

function collectAttachmentAttributes(grants, parentItem, attachment, attachmentIndex) {
  const attachmentId = attachment?._id || attachment?.id || `attachment${attachmentIndex}`;
  const parentItemId = parentItem?._id || parentItem?.id;
  const parentName = parentItem?.name || "";
  const attachmentName = attachment?.name || "";
  const sourceName = parentName && attachmentName ? `${parentName}: ${attachmentName}` : attachmentName || parentName;

  for (const [attributeKey, attribute] of Object.entries(attachment?.system?.attributes ?? {})) {
    pushInnateTalentGrant(grants, attribute, {
      id: `innate-talent-${parentItemId}-${attachmentId}-${attributeKey}`,
      parentItemId,
      name: sourceName,
      description: attachment?.system?.description,
    });
  }

  for (const [modifierIndex, modifier] of asArray(attachment?.system?.itemmodifier).entries()) {
    if (!modifier?.system?.active || modifier?.system?.broken) continue;

    const modifierName = modifier?.name || "";
    const modifierSourceName = modifierName ? `${sourceName} (${modifierName})` : sourceName;
    for (const [attributeKey, attribute] of Object.entries(modifier?.system?.attributes ?? {})) {
      pushInnateTalentGrant(grants, attribute, {
        id: `innate-talent-${parentItemId}-${attachmentId}-mod${modifierIndex}-${attributeKey}`,
        parentItemId,
        name: modifierSourceName,
        description: modifier?.system?.description || attachment?.system?.description,
        rank: Number(modifier?.system?.rank) > 0 ? Number(modifier.system.rank) : 1,
      });
    }
  }
}

export function collectInnateTalentGrants(items) {
  const grants = [];

  for (const item of items ?? []) {
    if (!isActiveParentItem(item)) continue;
    for (const [attachmentIndex, attachment] of asArray(item?.system?.itemattachment).entries()) {
      collectAttachmentAttributes(grants, item, attachment, attachmentIndex);
    }
  }

  return grants;
}

export function addTalentListEntry(talentList, item) {
  const index = talentList.findIndex((obj) => obj.name === item.name);

  if (index < 0 || !item.isRanked || !talentList[index].isRanked) {
    talentList.push(item);
    return;
  }

  talentList[index].source.push(...(item.source ?? []));
  talentList[index].rank = (Number(talentList[index].rank) || 0) + (Number(item.rank) || 0);
}

export function buildInnateTalentModification() {
  return {
    name: "New Talent Modification",
    type: "itemmodifier",
    img: "icons/svg/aura.svg",
    system: {
      description: "Drop a talent item here.",
      active: false,
      broken: false,
      rank: 1,
      innateTalent: true,
      attributes: {},
    },
  };
}

export function applyTalentToInnateModification(modification, talent) {
  const updated = clone(modification);
  const name = talent?.name ?? "Talent";
  updated.name = name;
  updated.img = talent?.img ?? updated.img;
  updated.system ??= {};
  updated.system.description = talent?.system?.longDesc || talent?.system?.description || updated.system.description || "";
  updated.system.rank = Number(updated.system.rank) > 0 ? Number(updated.system.rank) : 1;
  updated.system.innateTalent = true;
  updated.system.attributes = {
    [INNATE_TALENT_ATTR]: {
      modtype: INNATE_TALENT_MODTYPE,
      mod: name,
      value: 1,
    },
  };
  return updated;
}
