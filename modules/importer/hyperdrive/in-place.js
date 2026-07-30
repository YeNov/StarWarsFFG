import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
import {
  buildAttachmentEffects,
  buildCyberneticWoundEffects,
  buildItemEffects,
  buildModifierEffects,
  careerSkillFlagEffect,
  isTargetRelativeModifier,
  makeNamer,
  normalizeMods,
  ownerQualityMods,
  toModArray,
} from "./effect-builders.js";
import { hyperdriveImage } from "./parse.js";
import { normalizeName } from "./resolve.js";

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

function indexedSnapshot(index, entry) {
  const key = entry?.Key ?? entry?.key;
  if (key && index?.[key]) return snapshotOf(index[key]);
  const name = normalizeName(entry?.Name ?? entry?.name);
  return name ? snapshotOf(index?.[`name:${name}`]) : null;
}

export function applyHyperdriveImage(source, raw) {
  const img = hyperdriveImage(raw);
  if (img) source.img = img;
  return source;
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
    img: hyperdriveImage(species),
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
    img: hyperdriveImage(career),
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

export function buildQualityModifiers(qualities, itemmodifierIndex = {}, opts = {}) {
  return toModArray(qualities).map((quality) => {
    const matched = indexedSnapshot(itemmodifierIndex, quality);
    const targetRelative = isTargetRelativeModifier(quality);
    let source;
    if (matched) {
      source = stripIdentity(clone(matched));
    } else {
      source = {
        name: quality?.Name ?? quality?.MiscDesc ?? quality?.Key ?? "Custom modifier",
        type: "itemmodifier",
        img: hyperdriveImage(quality),
        flags: { starwarsffg: { ffgimportid: quality?.Key } },
        system: {
          description: quality?.MiscDesc ?? quality?.Description ?? "",
          type: "all",
          rank: 1,
          attributes: normalizeMods([quality], opts),
        },
      };
    }
    applyHyperdriveImage(source, quality);
    source.system ??= {};
    source.system.rank = number(quality?.Count, 1);
    if (targetRelative) {
      source.system.attributes = {};
      source.flags = {
        ...(source.flags ?? {}),
        starwarsffg: {
          ...(source.flags?.starwarsffg ?? {}),
          targetRelative: true,
        },
      };
    }
    if (opts.active != null) source.system.active = Boolean(opts.active);
    return source;
  }).filter(Boolean);
}

function installedModState(rawItem, attachment, mod) {
  const key = mod?.Key ?? "undefined";
  const state = rawItem?.ModStates?.[`${rawItem?.inventoryID}-${attachment?.Key}-${key}`];
  const installed = (state?.installed ?? []).reduce(
    (count, value, index) => count + (value === true && state?.failed?.[index] !== true ? 1 : 0),
    0,
  );
  const failed = (state?.failed ?? []).some(Boolean);
  return { installed, failed };
}

function setModifierState(source, { active, broken = false, rank = null }) {
  source.system ??= {};
  source.system.active = Boolean(active);
  source.system.broken = Boolean(broken);
  if (rank != null) source.system.rank = number(rank, 1);
  return source;
}

function modifierMatchesRaw(source, rawMod, opts = {}) {
  const rawKey = normalizeName(rawMod?.Key ?? rawMod?.key);
  const sourceKey = normalizeName(source?.flags?.starwarsffg?.ffgimportid);
  if (rawKey && sourceKey === rawKey) return true;

  const sourceName = normalizeName(source?.name);
  const rawName = normalizeName(rawMod?.Name ?? rawMod?.name);
  if (rawName && (sourceName === rawName || sourceName.includes(rawName))) return true;
  if (rawKey && sourceName.includes(rawKey)) return true;

  const matched = indexedSnapshot(opts.itemmodifierIndex, rawMod);
  const matchedName = normalizeName(matched?.name);
  return Boolean(matchedName && (sourceName === matchedName || sourceName.includes(matchedName)));
}

function applyRawModifierMetadata(source, rawMod) {
  const key = rawMod?.Key ?? rawMod?.key;
  if (key) {
    source.flags = {
      ...(source.flags ?? {}),
      starwarsffg: {
        ...(source.flags?.starwarsffg ?? {}),
        ffgimportid: key,
      },
    };
  }
  if (isTargetRelativeModifier(rawMod)) {
    source.system ??= {};
    source.system.attributes = {};
    source.flags = {
      ...(source.flags ?? {}),
      starwarsffg: {
        ...(source.flags?.starwarsffg ?? {}),
        targetRelative: true,
      },
    };
  }
  return source;
}

function reconcileConfiguredAttachmentModifiers(source, attachment, rawItem, opts) {
  const configured = clone(source?.system?.itemmodifier ?? []);
  if (!configured.length) return null;

  const claimed = new Set();
  const claim = (rawMod, expectedActive) => {
    const available = configured
      .map((modifier, index) => ({ modifier, index }))
      .filter(({ index }) => !claimed.has(index));
    let candidate = available.find(({ modifier }) => modifierMatchesRaw(modifier, rawMod, opts));
    candidate ??= available.find(
      ({ modifier }) => Boolean(modifier?.system?.active) === expectedActive,
    );
    if (!candidate) return null;
    claimed.add(candidate.index);
    return candidate.modifier;
  };

  // Claim optional mods first. Some configured attachments list their options before
  // their base mods, and freeform base-rule text may have no modifier row at all.
  for (const rawMod of toModArray(attachment?.AddedMods)) {
    const modifier = claim(rawMod, false);
    if (!modifier) continue;
    const state = installedModState(rawItem, attachment, rawMod);
    applyRawModifierMetadata(modifier, rawMod);
    setModifierState(modifier, {
      active: state.installed > 0,
      broken: state.failed && state.installed === 0,
      rank: rawMod?.Count,
    });
  }
  for (const rawMod of toModArray(attachment?.BaseMods)) {
    const modifier = claim(rawMod, true);
    if (!modifier) continue;
    applyRawModifierMetadata(modifier, rawMod);
    setModifierState(modifier, { active: true, rank: rawMod?.Count });
  }
  return configured;
}

export function buildAttachmentSnapshot(attachment, rawItem, opts = {}) {
  const matched = indexedSnapshot(opts.attachmentIndex, attachment);
  const source = matched
    ? stripIdentity(clone(matched))
    : {
      name: attachment?.Name ?? attachment?.Key ?? "Attachment",
      type: "itemattachment",
      img: hyperdriveImage(attachment),
      system: {
        description: attachment?.Description ?? "",
        type: String(attachment?.Type ?? "all").toLowerCase(),
        hardpoints: { value: number(attachment?.HP ?? attachment?.HardPoints) },
        attributes: {},
      },
    };
  applyHyperdriveImage(source, attachment);
  source.flags = {
    ...(source.flags ?? {}),
    starwarsffg: {
      ...(source.flags?.starwarsffg ?? {}),
      ffgimportid: attachment?.Key ?? source.flags?.starwarsffg?.ffgimportid,
      inventoryID: rawItem?.inventoryID,
      modStates: clone(rawItem?.ModStates ?? {}),
    },
  };
  source.system ??= {};
  source.system.itemmodifier = reconcileConfiguredAttachmentModifiers(
    source,
    attachment,
    rawItem,
    opts,
  ) ?? [
    ...buildQualityModifiers(attachment?.BaseMods, opts.itemmodifierIndex, opts)
      .map((modifier) => setModifierState(modifier, { active: true })),
    ...buildQualityModifiers(attachment?.AddedMods, opts.itemmodifierIndex, opts)
      .map((modifier, index) => {
        const rawMod = toModArray(attachment?.AddedMods)[index];
        const state = installedModState(rawItem, attachment, rawMod);
        return setModifierState(modifier, {
          active: state.installed > 0,
          broken: state.failed && state.installed === 0,
          rank: rawMod?.Count,
        });
      }),
  ];
  return source;
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
  const effectOpts = { ...opts, ownerType: source.type, namer };
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
    img: hyperdriveImage(weapon),
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
      itemmodifier: buildQualityModifiers(ownerQualityMods(weapon), opts.itemmodifierIndex, {
        ...opts,
        active: true,
        ownerType: "weapon",
      }),
      itemattachment: (weapon?.Attachments ?? [])
        .map((attachment) => buildAttachmentSnapshot(attachment, weapon, {
          ...opts,
          ownerType: "weapon",
        })),
    },
  };
  buildEquipmentEffects(source, weapon, opts);
  return { source, warnings: [] };
}

export function buildArmourSource(armour, opts = {}) {
  const source = {
    name: armour?.Name ?? "Armour",
    type: "armour",
    img: hyperdriveImage(armour),
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
      itemmodifier: buildQualityModifiers(ownerQualityMods(armour), opts.itemmodifierIndex, {
        ...opts,
        active: true,
        ownerType: "armour",
      }),
      itemattachment: (armour?.Attachments ?? [])
        .map((attachment) => buildAttachmentSnapshot(attachment, armour, {
          ...opts,
          ownerType: "armour",
        })),
    },
  };
  buildEquipmentEffects(source, armour, opts);
  return { source, warnings: [] };
}

export function buildGearSource(gear, opts = {}) {
  const source = {
    name: gear?.Name ?? "Gear",
    type: "gear",
    img: hyperdriveImage(gear),
    flags: {
      starwarsffg: {
        ffgimportid: gear?.Key,
        inventoryID: gear?.inventoryID,
      },
    },
    system: {
      ...commonSystem(gear),
      itemmodifier: buildQualityModifiers(ownerQualityMods(gear), opts.itemmodifierIndex, {
        ...opts,
        active: true,
        ownerType: "gear",
      }),
      itemattachment: (gear?.Attachments ?? [])
        .map((attachment) => buildAttachmentSnapshot(attachment, gear, {
          ...opts,
          ownerType: "gear",
        })),
    },
  };
  buildEquipmentEffects(source, gear, opts);
  return { source, warnings: [] };
}

function embeddedIdentity(source) {
  const key = source?.flags?.starwarsffg?.ffgimportid;
  if (key) return `key:${key}`;
  const name = normalizeName(source?.name);
  return name ? `name:${name}` : null;
}

function mergeEmbedded(existing, imported) {
  const output = [...(existing ?? [])];
  const positions = new Map(output
    .map((source, index) => [embeddedIdentity(source), index])
    .filter(([identity]) => identity));
  for (const source of imported ?? []) {
    const identity = embeddedIdentity(source);
    const index = identity ? positions.get(identity) : undefined;
    if (index == null) {
      output.push(source);
      if (identity) positions.set(identity, output.length - 1);
    } else {
      output[index] = {
        ...output[index],
        ...source,
        system: {
          ...(output[index].system ?? {}),
          ...(source.system ?? {}),
        },
      };
    }
  }
  return output;
}

function changeIdentity(change) {
  return JSON.stringify([change?.key, change?.mode, change?.value]);
}

function mergeEffects(existing, imported) {
  const output = [...(existing ?? [])];
  const existingChanges = new Set(output.flatMap((effect) => effect?.changes ?? []).map(changeIdentity));
  for (const effect of imported ?? []) {
    const changes = (effect?.changes ?? [])
      .filter((change) => !existingChanges.has(changeIdentity(change)));
    if (changes.length) output.push({ ...effect, changes });
  }
  return output;
}

export function overlayInstance(source, rawItem, opts = {}) {
  applyHyperdriveImage(source, rawItem);
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
  const ownerType = source.type;
  const importedQualities = buildQualityModifiers(
    ownerQualityMods(rawItem),
    opts.itemmodifierIndex,
    { ...opts, active: true, ownerType },
  );
  source.system.itemmodifier = mergeEmbedded(source.system.itemmodifier, importedQualities);
  const importedAttachments = (rawItem?.Attachments ?? [])
    .map((attachment) => buildAttachmentSnapshot(attachment, rawItem, {
      ...opts,
      ownerType,
    }));
  source.system.itemattachment = mergeEmbedded(source.system.itemattachment, importedAttachments);
  const existing = source.effects ?? [];
  const namer = makeNamer(existing.map((effect) => effect.name));
  const instanceEffects = [
    ...buildModifierEffects(rawItem, { ...opts, ownerType, namer }),
    ...buildAttachmentEffects(rawItem, { ...opts, ownerType, namer }),
    ...buildCyberneticWoundEffects(rawItem, {
      ...opts,
      ownerType,
      namer,
      existingEffects: existing,
    }),
  ];
  source.effects = mergeEffects(existing, instanceEffects);
  return source;
}

export function buildStubSource(kind, entry) {
  const name = [
    entry?.Name,
    entry?.name,
    entry?.Key,
    entry?.key,
  ].find((value) => String(value ?? "").trim()) ?? `Unnamed ${kind}`;
  return {
    source: {
      name,
      type: kind,
      img: hyperdriveImage(entry),
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
