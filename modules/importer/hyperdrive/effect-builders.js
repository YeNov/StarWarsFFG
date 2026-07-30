import ModifierHelpers from "../../helpers/modifiers.js";
import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
import { normalizeName } from "./resolve.js";

export const OG_CHARACTERISTIC = {
  BR: "Brawn",
  AG: "Agility",
  INT: "Intellect",
  CUN: "Cunning",
  WIL: "Willpower",
  PR: "Presence",
};

export function toModArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value.Mod || value.Quality) return toModArray(value.Mod ?? value.Quality);
  return [value];
}

export function makeNamer(existingNames = []) {
  const reserved = new Set(existingNames ?? []);
  let n = 0;
  return () => {
    while (reserved.has(`attr${n}`)) n += 1;
    const name = `attr${n++}`;
    reserved.add(name);
    return name;
  };
}

export function explodeChanges(modtype, mod, value) {
  if (!mod) return [];
  if (["Weapon Stat", "Result Modifiers", "Roll Modifiers"].includes(modtype)) return [];
  if (modtype === "Armor Stat" && !["encumbrance", "soak"].includes(mod)) return [];
  const out = [];
  for (const current of ModifierHelpers.explodeMod(modtype, mod)) {
    const key = ModifierHelpers.getModKeyPath(current.modType, current.mod);
    if (key) out.push({ key, mode: AE_MODES.ADD, value });
  }
  return out;
}

export function careerSkillFlagEffect(skillKeys, img) {
  const changes = [];
  for (const skill of skillKeys ?? []) {
    if (skill && skill !== "(none)") changes.push(...explodeChanges("Career Skill", skill, true));
  }
  return changes.length ? { name: "(career-skills)", img, changes } : null;
}

export function buildItemEffects(itemSource) {
  const { type, img } = itemSource;
  const system = itemSource.system ?? {};
  const effects = [];
  const inherent = [];
  if (type === "species") {
    for (const [key, attribute] of Object.entries(system.attributes ?? {})) {
      if (!key.startsWith("attr")) {
        inherent.push(...explodeChanges(attribute.modtype, attribute.mod ?? key, attribute.value));
      }
    }
    const brawn = Number(system.attributes?.Brawn?.value ?? 0);
    const willpower = Number(system.attributes?.Willpower?.value ?? 0);
    for (const change of inherent) {
      if (change.key === "system.stats.wounds.max") change.value = Number(change.value) + brawn;
      else if (change.key === "system.stats.strain.max") change.value = Number(change.value) + willpower;
      else if (change.key === "system.stats.encumbrance.max") change.value = Number(change.value) + 5;
    }
  } else if (type === "gear" || type === "weapon") {
    inherent.push(...explodeChanges("Stat", "Encumbrance", Number(system.encumbrance?.value ?? 0)));
  } else if (type === "armour") {
    inherent.push(
      ...explodeChanges("Stat", "Encumbrance", Number(system.encumbrance?.value ?? 0)),
      ...explodeChanges("Stat", "Defence", Number(system.defence?.value ?? 0)),
      ...explodeChanges("Stat", "Soak", Number(system.soak?.value ?? 0)),
    );
  } else if (type === "career") {
    for (let i = 0; i < 8; i += 1) {
      inherent.push(...(careerSkillFlagEffect([system.careerSkills?.[`careerSkill${i}`]], img)?.changes ?? []));
    }
  } else if (type === "specialization") {
    for (let i = 0; i < 5; i += 1) {
      inherent.push(...(careerSkillFlagEffect([system.careerSkills?.[`careerSkill${i}`]], img)?.changes ?? []));
    }
  }
  if (inherent.length) effects.push({ name: "(inherent)", img, changes: inherent });
  for (const [key, attribute] of Object.entries(system.attributes ?? {})) {
    if (!key.startsWith("attr")) continue;
    const changes = explodeChanges(attribute.modtype, attribute.mod, attribute.value);
    if (changes.length) effects.push({ name: key, img, changes });
  }
  return effects;
}

const DIE_MODTYPE = {
  BoostCount: "Skill Boost",
  SetbackCount: "Skill Remove Setback",
  AddSetbackCount: "Skill Setback",
  AdvantageCount: "Skill Add Advantage",
  ThreatCount: "Skill Add Threat",
  SuccessCount: "Skill Add Success",
  FailureCount: "Skill Add Failure",
  ForceCount: "Force Boost",
};

function snapshotOf(value) {
  return value?.ref?.snapshot ?? value?.snapshot ?? value;
}

function indexedSnapshot(index, entry) {
  const key = entry?.Key ?? entry?.key;
  if (key && index?.[key]) return snapshotOf(index[key]);
  const name = normalizeName(entry?.Name ?? entry?.name);
  return name ? snapshotOf(index?.[`name:${name}`]) : null;
}

function modifierIdentity(mod) {
  const key = String(mod?.Key ?? mod?.key ?? "").trim();
  if (key) return `key:${key}`;
  const description = normalizeName(mod?.MiscDesc ?? mod?.Description ?? mod?.Name ?? mod?.name);
  return description ? `description:${description}` : null;
}

function isTargetRelativeModifier(mod) {
  const description = normalizeName(mod?.MiscDesc ?? mod?.Description);
  return description.includes("checks made to detect")
    || description.includes("checks against the character")
    || description.includes("checks against this character");
}

export function ownerQualityMods(rawItem) {
  const attachmentCounts = new Map();
  for (const attachment of rawItem?.Attachments ?? []) {
    for (const mod of [
      ...toModArray(attachment?.BaseMods),
      ...toModArray(attachment?.AddedMods),
    ]) {
      const identity = modifierIdentity(mod);
      if (identity) attachmentCounts.set(identity, (attachmentCounts.get(identity) ?? 0) + 1);
    }
  }
  return toModArray(rawItem?.Qualities).filter((quality) => {
    if (quality?.FromAttachment) return false;
    const identity = modifierIdentity(quality);
    const remaining = identity ? Number(attachmentCounts.get(identity) ?? 0) : 0;
    if (!remaining) return true;
    attachmentCounts.set(identity, remaining - 1);
    return false;
  });
}

function attributeAppliesToOwner(attribute, ownerType) {
  const type = String(ownerType ?? "").toLowerCase();
  const modtype = String(attribute?.modtype ?? "").toLowerCase();
  if (modtype.startsWith("weapon ")) return type === "weapon";
  if (modtype.startsWith("armor ") || modtype.startsWith("armour ")) return type === "armour";
  return true;
}

export function normalizeMods(
  mods,
  {
    itemmodifierIndex = {},
    skillMap = {},
    skillMeta = [],
    ownerType = null,
    namer = makeNamer(),
  } = {},
) {
  const attributes = {};
  const put = (attribute) => { attributes[namer()] = attribute; };
  const skillCounts = (mod, skill) => {
    let matched = false;
    for (const [countKey, modtype] of Object.entries(DIE_MODTYPE)) {
      if (mod?.[countKey] == null) continue;
      put({
        modtype,
        mod: skill,
        value: modtype === "Force Boost" ? true : Number(mod[countKey]),
      });
      matched = true;
    }
    return matched;
  };

  for (const mod of toModArray(mods)) {
    if (mod?.Key && OG_CHARACTERISTIC[mod.Key]) {
      put({ modtype: "Characteristic", mod: OG_CHARACTERISTIC[mod.Key], value: Number(mod.Count ?? 1) });
    } else if (indexedSnapshot(itemmodifierIndex, mod)) {
      const snapshot = indexedSnapshot(itemmodifierIndex, mod);
      const count = Number(mod.Count ?? 1);
      for (const attribute of Object.values(snapshot?.system?.attributes ?? {})) {
        if (!attributeAppliesToOwner(attribute, ownerType)) continue;
        put({
          modtype: attribute.modtype,
          mod: attribute.mod,
          value: Number(attribute.value) * count,
        });
      }
    } else if (mod?.Key && skillMap[mod.Key]) {
      const skill = skillMap[mod.Key];
      if (!skillCounts(mod, skill) && mod.Count != null) {
        put({ modtype: "Skill Rank", mod: skill, value: Number(mod.Count) });
      }
    }
    for (const dieMod of toModArray(mod?.DieModifiers)) {
      let skills = [];
      if (dieMod.SkillKey) skills = [skillMap[dieMod.SkillKey] ?? dieMod.SkillKey];
      else if (dieMod.SkillChar) {
        skills = skillMeta
          .filter((skill) => skill.characteristic === OG_CHARACTERISTIC[dieMod.SkillChar])
          .map((skill) => skill.skill);
      } else if (dieMod.SkillType) {
        skills = skillMeta
          .filter((skill) => String(skill.type ?? "").toLowerCase() === String(dieMod.SkillType).toLowerCase())
          .map((skill) => skill.skill);
      }
      for (const skill of skills) skillCounts(dieMod, skill);
    }
    if (!mod?.Key) {
      const description = String(mod?.MiscDesc ?? mod?.Description ?? "");
      const setbackCount = (description.match(/\[SE\]/gi) ?? []).length;
      if (setbackCount > 0) {
        for (const skill of skillMeta) {
          if (description.toLowerCase().includes(String(skill.skill).toLowerCase())) {
            skillCounts({ AddSetbackCount: setbackCount }, skill.skill);
          }
        }
      }
    }
  }
  return attributes;
}

export function effectsFromAttributes(attributes) {
  return Object.entries(attributes)
    .map(([name, attribute]) => ({
      name,
      changes: explodeChanges(attribute.modtype, attribute.mod, attribute.value),
    }))
    .filter((effect) => effect.changes.length);
}

export function buildModifierEffects(rawItem, opts = {}) {
  const namer = opts.namer ?? makeNamer();
  const mods = [
    ...toModArray(rawItem?.BaseMods),
    ...ownerQualityMods(rawItem),
  ];
  return effectsFromAttributes(normalizeMods(mods, { ...opts, namer }));
}

export function buildCyberneticWoundEffects(rawItem, opts = {}) {
  if (String(rawItem?.Type ?? "").toLowerCase() !== "cybernetics") return [];
  const brawn = toModArray(rawItem?.BaseMods)
    .filter((mod) => mod?.Key === "BR")
    .reduce((sum, mod) => sum + Number(mod.Count ?? 1), 0);
  if (!brawn) return [];

  const existingMirrors = (opts.existingEffects ?? []).reduce((sum, effect) => {
    const changes = effect?.changes ?? [];
    const hasBrawn = changes.some((change) => change.key === "system.characteristics.Brawn.value");
    if (!hasBrawn) return sum;
    return sum + changes
      .filter((change) => change.key === "system.stats.wounds.max")
      .reduce((total, change) => total + Number(change.value ?? 0), 0);
  }, 0);
  const missing = Math.max(0, brawn - existingMirrors);
  if (!missing) return [];
  const namer = opts.namer ?? makeNamer((opts.existingEffects ?? []).map((effect) => effect.name));
  return [{
    name: namer(),
    changes: [{ key: "system.stats.wounds.max", mode: AE_MODES.ADD, value: missing }],
  }];
}

export function buildAttachmentEffects(rawItem, opts = {}) {
  const {
    itemmodifierIndex = {},
    skillMap = {},
    skillMeta = [],
  } = opts;
  const namer = opts.namer ?? makeNamer();
  const output = [];
  const inventoryId = rawItem?.inventoryID;
  for (const attachment of rawItem?.Attachments ?? []) {
    const active = [...toModArray(attachment.BaseMods)];
    for (const mod of toModArray(attachment.AddedMods)) {
      const key = mod?.Key ?? "undefined";
      const state = rawItem.ModStates?.[`${inventoryId}-${attachment.Key}-${key}`];
      const installed = (state?.installed ?? []).reduce(
        (count, value, index) => count + (value === true && state?.failed?.[index] !== true ? 1 : 0),
        0,
      );
      if (installed > 0) active.push(mod);
    }
    output.push(...effectsFromAttributes(normalizeMods(
      active.filter((mod) => !isTargetRelativeModifier(mod)),
      {
      itemmodifierIndex,
      skillMap,
      skillMeta,
      namer,
      },
    )));
  }
  return output;
}
