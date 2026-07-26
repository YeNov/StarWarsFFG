import ModifierHelpers from "../../helpers/modifiers.js";
import { AE_MODES } from "../../config/ffg-active-effect-modes.js";

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

export function normalizeMods(
  mods,
  { itemmodifierIndex = {}, skillMap = {}, skillMeta = [], namer = makeNamer() } = {},
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
    } else if (mod?.Key && itemmodifierIndex[mod.Key]) {
      const snapshot = snapshotOf(itemmodifierIndex[mod.Key]);
      const count = Number(mod.Count ?? 1);
      for (const attribute of Object.values(snapshot?.system?.attributes ?? {})) {
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
    ...toModArray(rawItem?.Qualities),
  ].filter((mod) => !mod?.FromAttachment);
  return effectsFromAttributes(normalizeMods(mods, { ...opts, namer }));
}

export function buildAttachmentEffects(rawItem, opts = {}) {
  const {
    attachmentIndex = {},
    itemmodifierIndex = {},
    skillMap = {},
    skillMeta = [],
  } = opts;
  const namer = opts.namer ?? makeNamer();
  const output = [];
  const inventoryId = rawItem?.inventoryID;
  for (const attachment of rawItem?.Attachments ?? []) {
    const matched = snapshotOf(attachmentIndex[attachment.Key]);
    if (matched?.effects?.length) {
      output.push(...structuredClone(matched.effects));
      continue;
    }
    const active = [...toModArray(attachment.BaseMods)];
    for (const mod of toModArray(attachment.AddedMods)) {
      const key = mod?.Key ?? "undefined";
      const state = rawItem.ModStates?.[`${inventoryId}-${attachment.Key}-${key}`];
      if (state?.installed?.[0] === true && state?.failed?.[0] !== true) active.push(mod);
    }
    output.push(...effectsFromAttributes(normalizeMods(active, {
      itemmodifierIndex,
      skillMap,
      skillMeta,
      namer,
    })));
  }
  return output;
}
