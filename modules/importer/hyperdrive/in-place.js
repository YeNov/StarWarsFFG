import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
import {
  buildAttachmentEffects,
  buildCyberneticWoundEffects,
  buildItemEffects,
  buildModifierEffects,
  careerSkillFlagEffect,
  makeNamer,
  toModArray,
} from "./effect-builders.js";

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotOf(value) {
  return value?.ref?.snapshot ?? value?.snapshot ?? value;
}

function stripIdentity(source) {
  if (!source || typeof source !== "object") return source;
  delete source._id;
  delete source.uuid;
  delete source.folder;
  delete source.ownership;
  delete source._stats;
  return source;
}

function rankGrantEffects(rankGrants = []) {
  return rankGrants.map((skill, index) => ({
    name: `hyperdriveRank${index}_${String(skill).replace(/[^a-zA-Z0-9]/g, "")}`,
    changes: [{ key: `system.skills.${skill}.rank`, mode: AE_MODES.ADD, value: 1 }],
  }));
}

export function buildSpeciesSource(species, { rankGrants = [] } = {}) {
  const attributes = {};
  for (const [characteristic, value] of Object.entries(species?.startingChars ?? species?.StartingChars ?? {})) {
    attributes[characteristic] = {
      modtype: "Characteristic",
      mod: characteristic,
      value: number(value),
    };
  }
  const attrs = species?.startingAttrs ?? {};
  attributes.WoundThreshold = {
    modtype: "Threshold",
    mod: "Wounds",
    value: number(attrs.woundThreshold ?? species?.StartingAttrs?.WoundThreshold),
  };
  attributes.StrainThreshold = {
    modtype: "Threshold",
    mod: "Strain",
    value: number(attrs.strainThreshold ?? species?.StartingAttrs?.StrainThreshold),
  };
  const source = {
    name: species?.Name ?? species?.name ?? "Species",
    type: "species",
    img: species?.imageUrl ?? species?.img,
    flags: { starwarsffg: { ffgimportid: species?.Key ?? species?.key } },
    system: {
      description: species?.Description ?? "",
      startingXP: number(species?.startingXP ?? species?.StartingAttrs?.Experience),
      attributes,
    },
  };
  source.effects = [...buildItemEffects(source), ...rankGrantEffects(rankGrants)];
  return { source, warnings: [] };
}

export function buildCareerSource(career, { careerSkillGrants = [] } = {}) {
  const skills = career?.CareerSkills ?? career?.careerSkills ?? [];
  const careerSkills = {};
  skills.slice(0, 8).forEach((skill, index) => {
    careerSkills[`careerSkill${index}`] = skill;
  });
  const source = {
    name: career?.Name ?? career?.name ?? "Career",
    type: "career",
    flags: { starwarsffg: { ffgimportid: career?.Key ?? career?.key } },
    system: {
      description: career?.Description ?? "",
      careerSkills,
    },
  };
  source.effects = buildItemEffects(source);
  const extra = careerSkillFlagEffect(careerSkillGrants, source.img);
  if (extra) source.effects.push(extra);
  return { source, warnings: [] };
}

export function buildQualityModifiers(qualities, itemmodifierIndex = {}) {
  return toModArray(qualities).map((quality) => {
    const matched = snapshotOf(itemmodifierIndex[quality?.Key]);
    let source;
    if (matched) {
      source = stripIdentity(clone(matched));
    } else {
      source = {
        name: quality?.Name ?? quality?.MiscDesc ?? quality?.Key ?? "Custom modifier",
        type: "itemmodifier",
        flags: { starwarsffg: { ffgimportid: quality?.Key } },
        system: {
          description: quality?.MiscDesc ?? quality?.Description ?? "",
          type: "all",
          rank: 1,
          attributes: {},
        },
      };
    }
    source.system ??= {};
    source.system.rank = number(quality?.Count, 1);
    return source;
  }).filter(Boolean);
}

export function buildAttachmentSnapshot(attachment, rawItem, itemmodifierIndex = {}) {
  return {
    name: attachment?.Name ?? attachment?.Key ?? "Attachment",
    type: "itemattachment",
    flags: {
      starwarsffg: {
        ffgimportid: attachment?.Key,
        inventoryID: rawItem?.inventoryID,
        modStates: clone(rawItem?.ModStates ?? {}),
      },
    },
    system: {
      description: attachment?.Description ?? "",
      type: String(attachment?.Type ?? "all").toLowerCase(),
      hardpoints: { value: number(attachment?.HP ?? attachment?.HardPoints) },
      itemmodifier: buildQualityModifiers(
        [...toModArray(attachment?.BaseMods), ...toModArray(attachment?.AddedMods)],
        itemmodifierIndex,
      ),
    },
  };
}

function commonSystem(item) {
  return {
    description: item?.Description ?? "",
    encumbrance: { value: number(item?.Encumbrance) },
    price: { value: number(item?.Price) },
    rarity: { value: number(item?.Rarity) },
    quantity: { value: number(item?.Quantity, 1) },
    itemmodifier: [],
    itemattachment: [],
  };
}

function buildEquipmentEffects(source, rawItem, opts) {
  const namer = makeNamer(source.effects?.map((effect) => effect.name));
  const effectOpts = { ...opts, namer };
  source.effects = [
    ...buildItemEffects(source),
    ...buildModifierEffects(rawItem, effectOpts),
    ...buildAttachmentEffects(rawItem, effectOpts),
    ...buildCyberneticWoundEffects(rawItem, effectOpts),
  ];
}

export function buildWeaponSource(weapon, opts = {}) {
  const source = {
    name: weapon?.Name ?? "Weapon",
    type: "weapon",
    flags: {
      starwarsffg: {
        ffgimportid: weapon?.Key,
        inventoryID: weapon?.inventoryID,
      },
    },
    system: {
      ...commonSystem(weapon),
      skill: { value: opts.skillMap?.[weapon?.SkillKey] ?? weapon?.SkillKey ?? "" },
      damage: { value: number(weapon?.Damage ?? weapon?.DamageAdd) },
      crit: { value: number(weapon?.Crit) },
      range: { value: weapon?.Range ?? "Engaged" },
      itemmodifier: buildQualityModifiers(weapon?.Qualities, opts.itemmodifierIndex),
      itemattachment: (weapon?.Attachments ?? [])
        .map((attachment) => buildAttachmentSnapshot(attachment, weapon, opts.itemmodifierIndex)),
    },
  };
  buildEquipmentEffects(source, weapon, opts);
  return { source, warnings: [] };
}

export function buildArmourSource(armour, opts = {}) {
  const source = {
    name: armour?.Name ?? "Armour",
    type: "armour",
    flags: {
      starwarsffg: {
        ffgimportid: armour?.Key,
        inventoryID: armour?.inventoryID,
      },
    },
    system: {
      ...commonSystem(armour),
      soak: { value: number(armour?.Soak) },
      defence: { value: number(armour?.Defense ?? armour?.Defence) },
      equippable: { equipped: false },
      itemmodifier: buildQualityModifiers(armour?.Qualities, opts.itemmodifierIndex),
      itemattachment: (armour?.Attachments ?? [])
        .map((attachment) => buildAttachmentSnapshot(attachment, armour, opts.itemmodifierIndex)),
    },
  };
  buildEquipmentEffects(source, armour, opts);
  return { source, warnings: [] };
}

export function buildGearSource(gear, opts = {}) {
  const source = {
    name: gear?.Name ?? "Gear",
    type: "gear",
    flags: {
      starwarsffg: {
        ffgimportid: gear?.Key,
        inventoryID: gear?.inventoryID,
      },
    },
    system: {
      ...commonSystem(gear),
      itemmodifier: buildQualityModifiers(gear?.Qualities, opts.itemmodifierIndex),
      itemattachment: (gear?.Attachments ?? [])
        .map((attachment) => buildAttachmentSnapshot(attachment, gear, opts.itemmodifierIndex)),
    },
  };
  buildEquipmentEffects(source, gear, opts);
  return { source, warnings: [] };
}

export function overlayInstance(source, rawItem, opts = {}) {
  source.system ??= {};
  source.system.quantity = {
    ...(source.system.quantity ?? {}),
    value: number(rawItem?.Quantity, 1),
  };
  source.flags = {
    ...(source.flags ?? {}),
    starwarsffg: {
      ...(source.flags?.starwarsffg ?? {}),
      inventoryID: rawItem?.inventoryID,
    },
  };
  source.system.itemattachment = [
    ...(source.system.itemattachment ?? []),
    ...(rawItem?.Attachments ?? [])
      .map((attachment) => buildAttachmentSnapshot(attachment, rawItem, opts.itemmodifierIndex)),
  ];
  const existing = source.effects ?? [];
  const namer = makeNamer(existing.map((effect) => effect.name));
  source.effects = [
    ...existing,
    ...buildAttachmentEffects(rawItem, { ...opts, namer }),
    ...buildCyberneticWoundEffects(rawItem, {
      ...opts,
      namer,
      existingEffects: existing,
    }),
  ];
  return source;
}

export function buildStubSource(kind, entry) {
  const name = entry?.Name ?? entry?.name ?? entry?.Key ?? entry?.key ?? kind;
  return {
    source: {
      name,
      type: kind,
      flags: { starwarsffg: { ffgimportid: entry?.Key ?? entry?.key } },
      system: { description: entry?.Description ?? "" },
    },
    warnings: [
      `Unmatched ${kind} '${name}' imported as a stub; install the compendium and import again for full fidelity (tree node effects are not in the export).`,
    ],
  };
}

export function buildInPlace(kind, entry, options = {}) {
  switch (kind) {
    case "species": return buildSpeciesSource(entry, options);
    case "career": return buildCareerSource(entry, options);
    case "weapon": return buildWeaponSource(entry, options);
    case "armour": return buildArmourSource(entry, options);
    case "gear": return buildGearSource(entry, options);
    default: return buildStubSource(kind, entry);
  }
}
