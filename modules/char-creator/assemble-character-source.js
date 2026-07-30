/**
 * Shared, import-clean actor-source assembler used by the character creator and
 * external character importers. All Foundry-sensitive collaborators are injected.
 */

const DEFAULT_NAME = "New Character";

function armorSoakValue(item) {
  const adjusted = Number(item?.system?.soak?.adjusted);
  if (Number.isFinite(adjusted)) return adjusted;
  const value = Number(item?.system?.soak?.value);
  return Number.isFinite(value) ? value : 0;
}

function suspendUnequippedEquipmentEffects(items = []) {
  const equippableTypes = new Set(["armour", "weapon", "shipweapon"]);
  for (const item of items) {
    if (!equippableTypes.has(item?.type)) continue;
    item.system ??= {};
    item.system.equippable ??= {};
    item.system.equippable.equipped = item.system.equippable.equipped === true;
    if (item.system.equippable.equipped) continue;
    for (const effect of item.effects ?? []) effect.disabled = true;
  }
}

export function equipBestPurchasedArmor(items = []) {
  const armor = items.filter((item) => item?.type === "armour");
  if (!armor.length) return;
  armor.forEach((item) => {
    item.system ??= {};
    item.system.equippable ??= {};
    item.system.equippable.equipped = false;
  });
  armor.sort((a, b) => armorSoakValue(b) - armorSoakValue(a));
  armor[0].system.equippable.equipped = true;
}

function skillLookup(skills = {}) {
  const lookup = new Map();
  for (const [key, skill] of Object.entries(skills)) {
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
  const name = String(value ?? "").trim();
  if (!name || name.toLowerCase() === "(none)") return null;
  return lookup.get(name) ?? lookup.get(name.toLowerCase()) ?? name;
}

function applySystemPatch(target, patch) {
  if (!patch || typeof patch !== "object") return target;
  return foundry.utils.mergeObject(target, foundry.utils.deepClone(patch), {
    insertKeys: true,
    overwrite: true,
  });
}

export function assembleCharacterSource(
  { creationDefaults, applyCharacteristicDeltas },
  {
    name,
    img,
    characteristicDeltas = {},
    skillDeltas = {},
    careerSkills = [],
    experience = { total: 0, available: 0 },
    credits = 0,
    track = null,
    biography = "",
    systemPatch = {},
    flags = {},
    buildItems = [],
    equipmentItems = [],
  } = {},
) {
  const warnings = [];
  const actorName = String(name ?? "").trim() || DEFAULT_NAME;
  const actorData = {
    name: actorName,
    type: "character",
    img: img || creationDefaults.img,
    system: foundry.utils.deepClone(creationDefaults.system),
    prototypeToken: {
      ...foundry.utils.deepClone(creationDefaults.prototypeToken),
      name: actorName,
    },
    flags: foundry.utils.deepClone(flags),
    items: [],
  };

  actorData.system = applyCharacteristicDeltas(actorData.system, characteristicDeltas);
  const lookup = skillLookup(actorData.system?.skills);
  for (const [nameOrKey, delta] of Object.entries(skillDeltas ?? {})) {
    const key = canonicalSkillKey(nameOrKey, lookup);
    if (!key || !actorData.system?.skills?.[key]) {
      warnings.push(`Skill '${nameOrKey}' is not present in the active skill list; its rank was not imported.`);
      continue;
    }
    actorData.system.skills[key].rank = Number(actorData.system.skills[key].rank ?? 0) + Number(delta ?? 0);
  }
  for (const nameOrKey of careerSkills ?? []) {
    const key = canonicalSkillKey(nameOrKey, lookup);
    if (key && actorData.system?.skills?.[key]) actorData.system.skills[key].careerskill = true;
  }

  actorData.system.experience = {
    total: Number(experience?.total ?? 0),
    available: Number(experience?.available ?? 0),
  };
  actorData.system.stats.credits.value = Number(credits ?? 0);
  if (track?.key) {
    actorData.system[track.key] = {
      ...(actorData.system[track.key] ?? {}),
      value: Number(track.value ?? 0),
    };
  }
  if (biography) actorData.system.biography = biography;
  actorData.system = applySystemPatch(actorData.system, systemPatch);

  const equipment = foundry.utils.deepClone(equipmentItems ?? []);
  equipBestPurchasedArmor(equipment);
  suspendUnequippedEquipmentEffects(equipment);
  actorData.items.push(...foundry.utils.deepClone(buildItems ?? []), ...equipment);
  return { actorData, warnings };
}
