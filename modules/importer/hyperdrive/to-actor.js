import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
import { careerSkillFlagEffect, explodeChanges } from "./effect-builders.js";
import { applyHyperdriveImage, overlayInstance } from "./in-place.js";
import { resolutionAliases } from "./resolve.js";

function keyOf(entry) {
  return entry?.key ?? entry?.Key ?? null;
}

function nameOf(entry) {
  return entry?.name ?? entry?.Name ?? "";
}

function hasContentIdentity(entry) {
  return Boolean(
    String(keyOf(entry) ?? "").trim()
    || String(nameOf(entry) ?? "").trim(),
  );
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

export function careerSkillsForActor(parsed) {
  const skills = [
    ...(parsed?.careerSkills ?? []),
    ...(parsed?.extraCareerSkills ?? []),
    ...(parsed?.specSkills ?? []),
    ...(parsed?.specializations ?? []).flatMap((spec) => spec?.careerSkills ?? []),
  ];
  return [...new Set(skills
    .map((skill) => String(skill ?? "").trim())
    .filter((skill) => skill && skill.toLowerCase() !== "(none)"))];
}

/**
 * Dedication advances, counted from PURCHASED nodes rather than the `Dedications` map.
 * That map is keyed by characteristic and can name specializations the character no
 * longer owns — the golden fixture still lists a MARSHAL entry under Intellect — so
 * trusting it directly would credit a free +1 that never happened and under-charge the
 * characteristic ladder by a full step.
 */
export function dedicationAdvances(parsed) {
  const byCharacteristic = {};
  const dedicationBySpec = invertDedications(parsed?.dedications);
  for (const spec of parsed?.specializations ?? []) {
    const characteristic = dedicationBySpec[keyOf(spec)];
    if (!characteristic) continue;
    let purchased = 0;
    for (let row = 0; row < (spec?.grid ?? []).length; row += 1) {
      for (let column = 0; column < (spec.grid[row] ?? []).length; column += 1) {
        if (!spec.grid[row][column]) continue;
        if (String(talentKeyAt(spec, row, column) ?? "").toUpperCase() === "DEDI") purchased += 1;
      }
    }
    if (purchased) byCharacteristic[characteristic] = (byCharacteristic[characteristic] ?? 0) + purchased;
  }
  return byCharacteristic;
}

/**
 * Spend derived from the purchases themselves, so the exported remaining XP can be
 * CHECKED rather than trusted. Deriving `spent` as `total - exportedRemaining` would be
 * circular: it would agree with the export by construction and could never surface a
 * costing defect (design §10).
 */
export function deriveXpSpend(parsed) {
  const dedications = dedicationAdvances(parsed);

  let talents = 0;
  let specializations = 0;
  (parsed?.specializations ?? []).forEach((spec, index) => {
    (spec?.grid ?? []).forEach((row, rowIndex) => {
      const cost = Number(spec?.TalentRows?.[rowIndex]?.Cost ?? spec?.talentRows?.[rowIndex]?.cost ?? 0);
      row.forEach((bought) => { if (bought) talents += cost; });
    });
    // The starting specialization is free; a universal one is a flat 10, otherwise the
    // nth specialization costs 10 x n.
    if (index > 0) specializations += spec?.universal ? 10 : 10 * (index + 1);
  });

  let forcePowers = 0;
  for (const power of parsed?.forcePowers ?? []) {
    for (const cost of Object.values(power?.paidCosts ?? {})) forcePowers += Number(cost ?? 0);
  }

  let characteristics = 0;
  for (const [characteristic, final] of Object.entries(parsed?.characteristics ?? {})) {
    const starting = Number(parsed?.species?.startingChars?.[characteristic] ?? 0);
    const steps = Number(final) - starting - Number(dedications[characteristic] ?? 0);
    for (let step = 1; step <= steps; step += 1) characteristics += 10 * (starting + step);
  }

  const careerSkills = new Set([
    ...(parsed?.careerSkills ?? []),
    ...(parsed?.specializations ?? []).flatMap((spec) => spec?.careerSkills ?? []),
  ]);
  const freeRanks = {};
  for (const skill of [
    ...(parsed?.species?.selectedSkills ?? []),
    ...(parsed?.careerRanks ?? []),
    ...(parsed?.specRanks ?? []),
  ]) freeRanks[skill] = (freeRanks[skill] ?? 0) + 1;

  let skills = 0;
  for (const skill of parsed?.skills ?? []) {
    const free = Number(freeRanks[skill.skill] ?? 0);
    // Hyperdrive stores purchased/manual ranks here. Free ranks are tracked in
    // Species.SelectedSkills, CareerRanks, and SpecRanks.
    const paid = Number(skill.rank ?? 0);
    for (let step = 1; step <= paid; step += 1) {
      skills += (5 * (free + step)) + (careerSkills.has(skill.skill) ? 0 : 5);
    }
  }

  const total = talents + forcePowers + characteristics + specializations + skills;
  return { talents, forcePowers, characteristics, specializations, skills, total };
}

export function deriveXp(parsed) {
  const bonus = [
    ...(parsed?.obligations ?? []),
    ...(parsed?.duties ?? []),
  ].reduce((sum, item) => sum + (item.xp5 ? 5 : 0) + (item.xp10 ? 10 : 0), 0)
    + (parsed?.morality?.xpc ? 5 : 0)
    + (parsed?.morality?.xp10 ? 10 : 0);
  const total = Number(parsed?.species?.startingXP ?? 0)
    + bonus
    + Number(parsed?.xp?.earned ?? 0);
  // The exported remaining XP is authoritative for the actor (design §14.4): Hyperdrive
  // permits deliberate overspend and we preserve it rather than clamping.
  const available = Number(parsed?.xp?.source ?? 0);
  const breakdown = deriveXpSpend(parsed);
  const spent = breakdown.total;
  const warnings = [];
  if (available < 0) {
    warnings.push(`Character is over budget by ${Math.abs(available)} XP; the exported available XP was preserved.`);
  }
  const reconciled = total - spent;
  if (reconciled !== available) {
    warnings.push(`Derived spend (${spent} XP) does not reconcile with the exported remaining XP (${available}); the export implies ${total - available} XP spent, a difference of ${Math.abs(reconciled - available)} XP. The exported value was kept.`);
  }
  return { total, spent, available, breakdown, warnings };
}

/**
 * Hyperdrive characteristics are final values, while imported species and Dedication
 * items add their own characteristic effects. Persist only the residual that those
 * build items do not already supply, measured from an unsaved build-item-only preview.
 *
 * Equipment is deliberately excluded: a cybernetic's modifier belongs to the item, so
 * it must not reduce the character's base. Hyperdrive skill values have different
 * semantics and are handled separately below.
 */
export function residualCharacteristicDeltas(characteristics, preview) {
  const deltas = {};
  const warnings = [];
  for (const [characteristic, value] of Object.entries(characteristics ?? {})) {
    const supplied = Number(preview?.characteristics?.[characteristic]?.value ?? 0);
    const delta = Number(value) - supplied;
    if (delta < 0) {
      warnings.push(`${characteristic}: imported items already supply ${supplied} but the export lists ${value}; leaving the base at 0.`);
    }
    deltas[characteristic] = Math.max(0, delta);
  }
  return { deltas, warnings };
}

/**
 * Hyperdrive's Skills[].value contains purchased/manual ranks only. Free ranks are
 * imported separately as species, career, and specialization item effects, so the
 * actor base must preserve the exported value directly.
 */
export function residualSkillDeltas(parsedSkills) {
  const deltas = {};
  const warnings = [];
  for (const skill of parsedSkills ?? []) {
    const rank = Number(skill.rank ?? 0);
    if (!Number.isFinite(rank) || rank < 0) {
      warnings.push(`Skill ${skill.skill}: exported purchased rank ${skill.rank} is invalid; leaving the base at 0.`);
      continue;
    }
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

/**
 * The Strength/Weakness pair a Force and Destiny character carries alongside their
 * Morality score. `CharacterDataModel` declares morality as `{value, type, label}` only
 * (character.js:50) — there is no field for either half of the pair, and an undeclared
 * path is dropped from the prepared view — so they are preserved in the import flags and
 * surfaced in the report instead of being written somewhere they would silently vanish.
 */
export function moralityPair(parsed) {
  const pairs = parsed?.morality?.strengthWeakness ?? [];
  if (!pairs.length) return null;
  // Keep the canonical Key, not just the display Name: keys are what later matching runs
  // on (display names are localised and vary between packs), so dropping them would make
  // the preserved pair unmatchable.
  const side = (entry) => (entry ? { key: entry.Key ?? null, name: entry.Name ?? null } : null);
  const strength = side(pairs[0]?.Strength);
  const weakness = side(pairs[0]?.Weakness);
  if (!strength?.key && !strength?.name && !weakness?.key && !weakness?.name) return null;
  return {
    strength,
    weakness,
    // Every pair verbatim — WeakKey, Source, Description and any further pairs included —
    // so nothing the export carried is lost on the way in.
    pairs,
  };
}

function moralityLabel(side) {
  return side?.name ?? side?.key ?? "none";
}

function trackFor(parsed) {
  if (parsed.rules === "fad") return { key: "morality", value: parsed.morality?.score ?? 50 };
  if (parsed.rules === "aor") {
    return { key: "duty", value: (parsed.duties ?? []).reduce((sum, item) => sum + Number(item.Total ?? item.total ?? 0), 0) };
  }
  return { key: "obligation", value: (parsed.obligations ?? []).reduce((sum, item) => sum + Number(item.Total ?? item.total ?? 0), 0) };
}

function contentDescriptors(parsed) {
  const raw = parsed.raw ?? {};
  const descriptors = [];
  const pushProperty = (rawParent, property, kind, entry, sourcePath) => {
    if (rawParent && Object.prototype.hasOwnProperty.call(rawParent, property)) {
      descriptors.push({ kind, entry, sourcePath });
    }
  };
  const pushArray = (property, kind, entries) => {
    if (!Object.prototype.hasOwnProperty.call(raw, property)) return;
    if (raw[property] == null) {
      descriptors.push({ kind, entry: null, sourcePath: property });
      return;
    }
    (entries ?? []).forEach((entry, index) => {
      descriptors.push({ kind, entry, sourcePath: `${property}[${index}]` });
    });
  };

  pushProperty(raw.Background, "Culture", "background", parsed.background?.culture, "Background.Culture");
  pushProperty(raw.Background, "Adventure", "background", parsed.background?.hook, "Background.Adventure");
  if (parsed.rules === "fad") {
    pushProperty(raw.Background, "Force", "background", parsed.background?.force, "Background.Force");
  }
  pushArray("Obligations", "obligation", parsed.obligations);
  pushArray("Duties", "obligation", parsed.duties);
  pushArray("Motivations", "motivation", parsed.motivations);
  return descriptors;
}

function addResolutionFinding(report, {
  kind,
  entry,
  ownerType = null,
  reason,
  count,
  candidates = [],
  candidateRefs = [],
  sourcePath = null,
}) {
  const aliases = resolutionAliases(kind, entry, { ownerType });
  if (!aliases.length) return;
  const existing = report.findings.find((finding) =>
    finding.aliases.some((alias) => aliases.includes(alias)));
  if (existing) {
    existing.aliases = [...new Set([...existing.aliases, ...aliases])];
    if (reason === "ambiguous") existing.reason = reason;
    existing.count = Math.max(Number(existing.count ?? 0), Number(count ?? 0)) || undefined;
    existing.candidates = [...new Set([...existing.candidates, ...candidates])];
    const knownRefs = new Set(existing.candidateRefs.map((ref) => ref.uuid));
    existing.candidateRefs.push(...candidateRefs.filter((ref) =>
      ref?.uuid && !knownRefs.has(ref.uuid)));
    return;
  }
  report.findings.push({
    id: aliases[0],
    aliases,
    kind,
    key: keyOf(entry),
    name: nameOf(entry),
    ownerType,
    reason,
    count,
    candidates: [...new Set(candidates)],
    candidateRefs: candidateRefs.filter(Boolean),
    sourcePath,
  });
}

function resolveMatch(deps, kind, entry) {
  const override = deps.resolveFinding?.(kind, entry);
  if (override) return { itemType: override.type, ref: override };
  const { resolve } = deps;
  const key = keyOf(entry);
  if (key) {
    const keyed = resolve.getByKey(kind, key);
    if (keyed) return keyed;
  }
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
    findings: [],
    drift: [],
    cybernetics: (parsed.cybernetics ?? [])
      .filter(Boolean)
      .map((item) => item.Name ?? item.Key),
    skippedVehicles: (parsed.vehicles ?? [])
      .filter(Boolean)
      .map((item) => item.Name ?? item.Key),
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
    .map((spec) => resolveMatch(deps, "specialization", spec));
  const rankedTalentResidual = rankedTalentResidualEffects(parsed, {
    materializedSpecializationKeys: (parsed.specializations ?? [])
      .filter((spec, index) => specializationMatches[index])
      .map(keyOf),
  });
  report.warnings.push(...rankedTalentResidual.warnings);

  const addContent = (kind, entry, options = {}) => {
    const { sourcePath, ...itemOptions } = options;
    if (!hasContentIdentity(entry)) {
      report.warnings.push(
        `Skipped empty Hyperdrive ${sourcePath ?? kind}; no key or name was supplied.`,
      );
      return;
    }
    const match = resolveMatch(deps, kind, entry);
    if (match) {
      const source = deps.toItemData(match.ref, itemOptions);
      applyHyperdriveImage(source, entry);
      if (kind === "career" && careerGrants.career.length) {
        appendCareerSkillEffect(source, careerGrants.career);
      }
      buildItems.push(source);
      return;
    }
    const result = deps.buildInPlace(kind, entry, itemOptions);
    applyHyperdriveImage(result.source, entry);
    buildItems.push(result.source);
    report.warnings.push(...(result.warnings ?? []));
    report.unmatched.push({
      kind,
      key: keyOf(entry) ?? nameOf(entry),
      name: nameOf(entry),
      sourcePath,
    });
    addResolutionFinding(report, {
      kind,
      entry,
      reason: "not-found",
      sourcePath,
    });
  };

  for (const descriptor of contentDescriptors(parsed)) {
    addContent(descriptor.kind, descriptor.entry, { sourcePath: descriptor.sourcePath });
  }
  addContent("species", parsed.species, { rankGrants: ranks.species });
  addContent("career", parsed.career, {
    rankGrants: ranks.career,
    careerSkillGrants: careerGrants.career,
  });

  for (let index = 0; index < (parsed.specializations ?? []).length; index += 1) {
    const spec = parsed.specializations[index];
    if (!hasContentIdentity(spec)) {
      report.warnings.push(`Skipped empty Hyperdrive Specializations[${index}]; no key or name was supplied.`);
      continue;
    }
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
      addResolutionFinding(report, {
        kind: "specialization",
        entry: spec,
        reason: "not-found",
        sourcePath: `Specializations[${index}]`,
      });
    }
    applyHyperdriveImage(source, spec);
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
    skillMap: {
      ...Object.fromEntries((parsed.skills ?? [])
        .filter((skill) => keyOf(skill) && String(skill?.skill ?? "").trim())
        .map((skill) => [keyOf(skill), skill.skill])),
      ...(deps.skillMap ?? {}),
    },
    skillMeta: deps.skillMeta ?? [],
    itemmodifierIndex: deps.itemmodifierIndex ?? {},
    attachmentIndex: deps.attachmentIndex ?? {},
    resolveFinding: deps.resolveFinding,
    onResolutionFinding: (finding) => addResolutionFinding(report, finding),
  };
  for (const [kind, list, sourcePath] of [
    ["weapon", parsed.weapons, "Weapons"],
    ["armour", parsed.armour, "Armor"],
    ["gear", parsed.gear, "Gear"],
    ["gear", parsed.cybernetics, "Gear"],
  ]) {
    for (let index = 0; index < (list ?? []).length; index += 1) {
      const item = list[index];
      if (!hasContentIdentity(item)) {
        report.warnings.push(
          `Skipped empty Hyperdrive ${sourcePath}[${index}]; no key or name was supplied.`,
        );
        continue;
      }
      const match = resolveMatch(deps, kind, item);
      if (match) {
        const source = deps.toItemData(match.ref);
        overlayInstance(source, item, eqOpts);
        equipmentItems.push(source);
      } else {
        const result = deps.buildInPlace(kind, item, eqOpts);
        equipmentItems.push(result.source);
        report.warnings.push(...(result.warnings ?? []));
        const itemPath = `${sourcePath}[${index}]`;
        report.unmatched.push({
          kind,
          key: item.Key ?? item.Name,
          name: item.Name ?? "",
          sourcePath: itemPath,
        });
        addResolutionFinding(report, {
          kind,
          entry: item,
          reason: "not-found",
          sourcePath: itemPath,
        });
      }
    }
  }

  // Build items are complete here; equipment is deliberately NOT part of the preview
  // (an item carries its own modifiers, so it must not depress the character's base).
  const preview = await deps.preparePreview(buildItems);
  const characteristicBase = residualCharacteristicDeltas(parsed.characteristics, preview);
  const purchasedSkills = residualSkillDeltas(parsed.skills);
  report.warnings.push(...characteristicBase.warnings, ...purchasedSkills.warnings);
  const xp = deriveXp(parsed);
  report.warnings.push(...xp.warnings);
  if (parsed.notes) report.warnings.push("Hyperdrive notes have no native actor field and were preserved in import flags.");
  const morality = moralityPair(parsed);
  if (morality) {
    report.metadata.morality = morality;
    report.warnings.push(`Morality Strength (${moralityLabel(morality.strength)}) and Weakness (${moralityLabel(morality.weakness)}) have no native actor field and were preserved in import flags.`);
  }
  if (parsed.vehicles?.length) report.warnings.push(`${parsed.vehicles.length} vehicle entry or entries were skipped.`);
  if (!parsed.signatureAbilities?.length) report.warnings.push("The export contains no signature abilities.");

  const assembled = deps.assemble({
    name: parsed.name,
    img: parsed.img,
    tokenImg: parsed.tokenImg,
    characteristicDeltas: characteristicBase.deltas,
    skillDeltas: purchasedSkills.deltas,
    careerSkills: careerSkillsForActor(parsed),
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
          morality: morality ?? undefined,
        },
      },
    },
    buildItems,
    equipmentItems,
  });
  report.warnings.push(...(assembled.warnings ?? []));
  report.ambiguities = [...(deps.resolve.ambiguities ?? [])];
  for (const ambiguity of report.ambiguities) {
    addResolutionFinding(report, {
      kind: ambiguity.itemType,
      entry: {
        ...(ambiguity.key ? { Key: ambiguity.key } : {}),
        ...(ambiguity.name ? { Name: ambiguity.name } : {}),
      },
      reason: "ambiguous",
      count: ambiguity.count,
      candidateRefs: ambiguity.candidateRefs ?? [],
    });
  }
  report.xp = { total: xp.total, spent: xp.spent, available: xp.available, breakdown: xp.breakdown };
  const prepared = await deps.prepareFinal(assembled.actorData);
  report.drift = driftReport(parsed, prepared);
  return { actorData: assembled.actorData, report };
}

export { AE_MODES };
