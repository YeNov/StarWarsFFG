import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
import { careerSkillFlagEffect, explodeChanges } from "./effect-builders.js";
import { overlayInstance } from "./in-place.js";

function keyOf(entry) {
  return entry?.key ?? entry?.Key ?? null;
}

function nameOf(entry) {
  return entry?.name ?? entry?.Name ?? "";
}

export function learnedKeysForSpec(spec) {
  const learned = [];
  for (let row = 0; row < (spec?.grid ?? []).length; row += 1) {
    for (let column = 0; column < (spec.grid[row] ?? []).length; column += 1) {
      if (spec.grid[row][column]) learned.push(`talent${(row * 4) + column}`);
    }
  }
  return learned;
}

/**
 * Force-power / signature-ability upgrade nodes live on a grid that is PADDED to four
 * columns per row: the OggDude importer writes `upgrade${(row - 1) * 4 + column}`
 * (forcepowers.js:146, signature-abilities.js:133), so every row starts at a multiple of
 * four no matter how many abilities it actually holds. Row 0 is the basic power — owning
 * the item — and is not an upgrade node.
 *
 * A running offset (`offset += cells.length`) would drift as soon as a row carries fewer
 * than four cells, e.g. Alter's first row has three, which would map row 2 to `upgrade3`
 * instead of `upgrade4` and silently flag the wrong node as learned.
 */
export function learnedKeysForPower(power) {
  const learned = [];
  const grid = power?.grid ?? {};
  const rows = Object.keys(grid)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b);
  for (const row of rows) {
    if (row === 0) continue;
    const cells = Array.isArray(grid[row]) ? grid[row] : [];
    cells.forEach((bought, column) => {
      if (bought) learned.push(`upgrade${((row - 1) * 4) + column}`);
    });
  }
  return learned;
}

export function invertDedications(dedications = {}) {
  const result = {};
  for (const [characteristic, specs] of Object.entries(dedications ?? {})) {
    for (const specKey of specs ?? []) result[specKey] = characteristic;
  }
  return result;
}

function isDedication(node) {
  return String(node?.name ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase() === "dedication";
}

export function dedicationGrantsForSpec(spec, talents = {}, dedicationBySpec = invertDedications(), learnedKeys = learnedKeysForSpec(spec)) {
  const characteristic = dedicationBySpec[keyOf(spec)];
  if (!characteristic) return {};
  for (const nodeKey of learnedKeys) {
    if (!isDedication(talents?.[nodeKey])) continue;
    return {
      [nodeKey]: {
        pcwDedication: { modtype: "Characteristic", mod: characteristic, value: 1 },
      },
    };
  }
  return {};
}

export function rankGrantsForItems(parsed) {
  return {
    species: [...(parsed?.species?.selectedSkills ?? [])],
    career: [...(parsed?.careerRanks ?? [])],
    spec: [...(parsed?.specRanks ?? [])],
  };
}

export function careerSkillGrantsForItems(parsed) {
  return { career: [...(parsed?.extraCareerSkills ?? [])] };
}

export function deriveXp(parsed) {
  const bonus = [
    ...(parsed?.obligations ?? []),
    ...(parsed?.duties ?? []),
  ].reduce((sum, item) => sum + (item.xp5 ? 5 : 0) + (item.xp10 ? 10 : 0), 0)
    + (parsed?.morality?.xpc ? 5 : 0)
    + (parsed?.morality?.xp10 ? 10 : 0);
  const total = Number(parsed?.species?.startingXP ?? 0) + bonus;
  const available = Number(parsed?.xp?.source ?? 0);
  const spent = total - available;
  const warnings = available < 0
    ? [`Character is over budget by ${Math.abs(available)} XP; the exported available XP was preserved.`]
    : [];
  return { total, spent, available, warnings };
}

export function baseCharacteristicDeltas(characteristics, startingCharacteristics) {
  const deltas = {};
  const warnings = [];
  for (const [characteristic, value] of Object.entries(characteristics ?? {})) {
    const starting = Number(startingCharacteristics?.[characteristic] ?? 0);
    const delta = Number(value) - starting;
    if (delta < 0) {
      warnings.push(`${characteristic}: export value ${value} below species starting value ${starting}; not baking a negative base advance.`);
    }
    deltas[characteristic] = Math.max(0, delta);
  }
  return { deltas, warnings };
}

export function purchasedSkillDeltas(parsedSkills) {
  const deltas = {};
  const warnings = [];
  for (const skill of parsedSkills ?? []) {
    const rank = Number(skill.rank ?? 0);
    if (rank < 0) warnings.push(`Skill ${skill.skill}: export contains a negative purchased rank; capping at 0.`);
    if (rank > 0) deltas[skill.skill] = rank;
  }
  return { deltas, warnings };
}

const TALENT_ATTRIBUTE_MODS = {
  SoakValue: ["Stat", "Soak"],
  ForceRating: ["Stat", "ForcePool"],
  StrainThreshold: ["Stat", "Strain"],
  DefenseRanged: ["Stat", "Defence-Ranged"],
  DefenseMelee: ["Stat", "Defence-Melee"],
  WoundThreshold: ["Stat", "Wounds"],
};

function talentKeyAt(spec, row, column) {
  const talent = spec?.TalentRows?.[row]?.Talents?.[column]
    ?? spec?.talentRows?.[row]?.talents?.[column];
  return typeof talent === "string" ? talent : talent?.Key ?? talent?.key ?? null;
}

export function rankedTalentResidualEffects(parsed, { materializedSpecializationKeys = [] } = {}) {
  const materialized = new Set(materializedSpecializationKeys);
  const materializedCounts = new Map();
  const owners = new Map();
  for (const spec of parsed?.specializations ?? []) {
    const specKey = keyOf(spec);
    for (let row = 0; row < (spec?.grid ?? []).length; row += 1) {
      for (let column = 0; column < (spec.grid[row] ?? []).length; column += 1) {
        const talentKey = talentKeyAt(spec, row, column);
        if (!talentKey) continue;
        if (spec.grid[row][column]) {
          owners.set(talentKey, [...(owners.get(talentKey) ?? []), specKey]);
          if (materialized.has(specKey)) {
            materializedCounts.set(talentKey, (materializedCounts.get(talentKey) ?? 0) + 1);
          }
        }
      }
    }
  }

  const effectsBySpecialization = {};
  const warnings = [];
  for (const talent of parsed?.boughtTalents ?? []) {
    const talentKey = keyOf(talent);
    const isRanked = talent?.ranked === true
      || String(talent?.Ranked ?? talent?.data?.Ranked).toLowerCase() === "true";
    if (!isRanked) continue;
    const missingRanks = Math.max(0, Number(talent.count ?? 0) - (materializedCounts.get(talentKey) ?? 0));
    const talentOwners = owners.get(talentKey) ?? [];
    const specKey = talentOwners.find((owner) => !materialized.has(owner)) ?? talentOwners[0];
    if (!talentKey || !specKey || !missingRanks) continue;
    const changes = [];
    for (const [attributeKey, value] of Object.entries(talent.attributes ?? {})) {
      const mapping = TALENT_ATTRIBUTE_MODS[attributeKey];
      if (!mapping) continue;
      changes.push(...explodeChanges(mapping[0], mapping[1], Number(value ?? 0) * missingRanks));
    }
    if (!changes.length) continue;
    effectsBySpecialization[specKey] ??= [];
    effectsBySpecialization[specKey].push({
      name: `hyperdriveRank_${talentKey}`,
      changes,
    });
    warnings.push(`Recovered ${missingRanks} additional rank(s) of ${talent.name || talentKey} from Hyperdrive's ranked-talent summary.`);
  }
  return { effectsBySpecialization, warnings };
}

export function driftReport(parsed, prepared) {
  const drift = [];
  for (const [characteristic, exported] of Object.entries(parsed?.characteristics ?? {})) {
    const value = prepared?.characteristics?.[characteristic]?.value;
    if (value == null) continue;
    if (Number(value) !== Number(exported)) {
      drift.push({
        kind: "characteristic",
        stat: characteristic,
        exported: Number(exported),
        prepared: Number(value),
      });
    }
  }
  for (const stat of ["wounds", "strain", "soak"]) {
    const value = prepared?.[stat];
    const exported = parsed?.derived?.[stat];
    if (value == null || exported == null) continue;
    if (Number(value) !== Number(exported)) {
      drift.push({
        kind: "threshold",
        stat,
        exported: Number(exported),
        prepared: Number(value),
      });
    }
  }
  return drift;
}

function trackFor(parsed) {
  if (parsed.rules === "fad") return { key: "morality", value: parsed.morality?.score ?? 50 };
  if (parsed.rules === "aor") {
    return { key: "duty", value: (parsed.duties ?? []).reduce((sum, item) => sum + Number(item.Total ?? item.total ?? 0), 0) };
  }
  return { key: "obligation", value: (parsed.obligations ?? []).reduce((sum, item) => sum + Number(item.Total ?? item.total ?? 0), 0) };
}

function contentDescriptors(parsed) {
  const backgrounds = [
    parsed.background?.culture,
    parsed.background?.hook,
    parsed.rules === "fad" ? parsed.background?.force : null,
  ].filter(Boolean).map((entry) => ({ kind: "background", entry }));
  return [
    ...backgrounds,
    ...(parsed.obligations ?? []).map((entry) => ({ kind: "obligation", entry })),
    ...(parsed.duties ?? []).map((entry) => ({ kind: "obligation", entry })),
    ...(parsed.motivations ?? []).map((entry) => ({ kind: "motivation", entry })),
  ];
}

function resolveMatch(resolve, kind, entry) {
  const key = keyOf(entry);
  if (key) return resolve.getByKey(kind, key);
  const name = nameOf(entry);
  return name ? resolve.getByName(kind, name) : null;
}

function appendCareerSkillEffect(source, skills) {
  const effect = careerSkillFlagEffect(skills, source.img);
  if (effect) {
    source.effects ??= [];
    source.effects.push(effect);
  }
}

export async function hyperdriveToActorData(parsed, deps) {
  const report = {
    warnings: [],
    unmatched: [],
    ambiguities: [],
    drift: [],
    cybernetics: (parsed.cybernetics ?? []).map((item) => item.Name ?? item.Key),
    skippedVehicles: (parsed.vehicles ?? []).map((item) => item.Name ?? item.Key),
    metadata: {
      notes: parsed.notes,
      title: parsed.title,
      source: parsed.source,
    },
  };
  const buildItems = [];
  const equipmentItems = [];
  const ranks = rankGrantsForItems(parsed);
  const careerGrants = careerSkillGrantsForItems(parsed);
  const dedicationBySpec = invertDedications(parsed.dedications);
  const specializationMatches = (parsed.specializations ?? [])
    .map((spec) => resolveMatch(deps.resolve, "specialization", spec));
  const rankedTalentResidual = rankedTalentResidualEffects(parsed, {
    materializedSpecializationKeys: (parsed.specializations ?? [])
      .filter((spec, index) => specializationMatches[index])
      .map(keyOf),
  });
  report.warnings.push(...rankedTalentResidual.warnings);

  const addContent = (kind, entry, options = {}) => {
    if (!entry) return;
    const match = resolveMatch(deps.resolve, kind, entry);
    if (match) {
      const source = deps.toItemData(match.ref, options);
      if (kind === "career" && careerGrants.career.length) {
        appendCareerSkillEffect(source, careerGrants.career);
      }
      buildItems.push(source);
      return;
    }
    const result = deps.buildInPlace(kind, entry, options);
    buildItems.push(result.source);
    report.warnings.push(...(result.warnings ?? []));
    report.unmatched.push({ kind, key: keyOf(entry) ?? nameOf(entry) });
  };

  for (const descriptor of contentDescriptors(parsed)) {
    addContent(descriptor.kind, descriptor.entry);
  }
  addContent("species", parsed.species, { rankGrants: ranks.species });
  addContent("career", parsed.career, {
    rankGrants: ranks.career,
    careerSkillGrants: careerGrants.career,
  });

  for (let index = 0; index < (parsed.specializations ?? []).length; index += 1) {
    const spec = parsed.specializations[index];
    const learnedKeys = learnedKeysForSpec(spec);
    const match = specializationMatches[index];
    let source;
    if (match) {
      const talents = match.ref?.snapshot?.system?.talents ?? {};
      source = deps.toItemData(match.ref, {
        rankGrants: index === 0 ? ranks.spec : [],
        learnedKeys,
        nodeAttributeGrants: dedicationGrantsForSpec(spec, talents, dedicationBySpec, learnedKeys),
      });
    } else {
      const result = deps.buildInPlace("specialization", spec, {
        rankGrants: index === 0 ? ranks.spec : [],
        learnedKeys,
      });
      source = result.source;
      report.warnings.push(...(result.warnings ?? []));
      report.unmatched.push({ kind: "specialization", key: keyOf(spec) ?? nameOf(spec) });
    }
    const residualEffects = rankedTalentResidual.effectsBySpecialization[keyOf(spec)] ?? [];
    if (residualEffects.length) {
      source.effects = [...(source.effects ?? []), ...residualEffects];
    }
    buildItems.push(source);
  }
  for (const power of parsed.forcePowers ?? []) {
    addContent("forcepower", power, { learnedKeys: learnedKeysForPower(power) });
  }
  for (const ability of parsed.signatureAbilities ?? []) {
    addContent("signatureability", ability, {
      learnedKeys: learnedKeysForPower({
        grid: ability.grid ?? ability.BoughtUpgrades ?? ability.BoughtPowers ?? {},
      }),
    });
  }

  const eqOpts = {
    skillMap: deps.skillMap ?? {},
    skillMeta: deps.skillMeta ?? [],
    itemmodifierIndex: deps.itemmodifierIndex ?? {},
    attachmentIndex: deps.attachmentIndex ?? {},
  };
  for (const [kind, list] of [
    ["weapon", parsed.weapons],
    ["armour", parsed.armour],
    ["gear", parsed.gear],
    ["gear", parsed.cybernetics],
  ]) {
    for (const item of list ?? []) {
      const match = deps.resolve.getByKey(kind, item.Key);
      if (match) {
        const source = deps.toItemData(match.ref);
        overlayInstance(source, item, eqOpts);
        equipmentItems.push(source);
      } else {
        const result = deps.buildInPlace(kind, item, eqOpts);
        equipmentItems.push(result.source);
        report.warnings.push(...(result.warnings ?? []));
        report.unmatched.push({ kind, key: item.Key ?? item.Name });
      }
    }
  }

  const characteristicBase = baseCharacteristicDeltas(
    parsed.characteristics,
    parsed.species?.startingChars,
  );
  const purchasedSkills = purchasedSkillDeltas(parsed.skills);
  report.warnings.push(...characteristicBase.warnings, ...purchasedSkills.warnings);
  const xp = deriveXp(parsed, characteristicBase.deltas);
  report.warnings.push(...xp.warnings);
  if (parsed.notes) report.warnings.push("Hyperdrive notes have no native actor field and were preserved in import flags.");
  if (parsed.vehicles?.length) report.warnings.push(`${parsed.vehicles.length} vehicle entry or entries were skipped.`);
  if (!parsed.signatureAbilities?.length) report.warnings.push("The export contains no signature abilities.");

  const assembled = deps.assemble({
    name: parsed.name,
    characteristicDeltas: characteristicBase.deltas,
    skillDeltas: purchasedSkills.deltas,
    experience: { total: xp.total, available: xp.available },
    credits: parsed.credits,
    track: trackFor(parsed),
    biography: parsed.biography,
    flags: {
      starwarsffg: {
        hyperdriveImport: {
          title: parsed.title,
          source: parsed.source,
          notes: parsed.notes,
          modifiers: parsed.modifiers,
        },
      },
    },
    buildItems,
    equipmentItems,
  });
  report.warnings.push(...(assembled.warnings ?? []));
  report.ambiguities = [...(deps.resolve.ambiguities ?? [])];
  report.xp = { total: xp.total, spent: xp.spent, available: xp.available };
  const prepared = await deps.prepareFinal(assembled.actorData);
  report.drift = driftReport(parsed, prepared);
  return { actorData: assembled.actorData, report };
}

export { AE_MODES };
