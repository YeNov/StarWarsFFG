import { AE_MODES } from "../../config/ffg-active-effect-modes.js";
import { careerSkillFlagEffect } from "./effect-builders.js";
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

export function learnedKeysForPower(power) {
  const learned = [];
  let offset = 0;
  const grid = power?.grid ?? {};
  const rows = Object.keys(grid)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b);
  for (const row of rows) {
    const cells = Array.isArray(grid[row]) ? grid[row] : [];
    if (row === 0) continue;
    cells.forEach((bought, column) => {
      if (bought) learned.push(`upgrade${offset + column}`);
    });
    offset += cells.length;
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

export function residualCharacteristicDeltas(finals, previewChars) {
  const deltas = {};
  const warnings = [];
  for (const [characteristic, final] of Object.entries(finals ?? {})) {
    const prepared = Number(previewChars?.[characteristic]?.value ?? 0);
    const delta = Number(final) - prepared;
    if (delta < 0) {
      warnings.push(`${characteristic}: export final ${final} below build-item-supplied ${prepared}; not baking negative residual.`);
    }
    deltas[characteristic] = Math.max(0, delta);
  }
  return { deltas, warnings };
}

export function residualSkillDeltas(parsedSkills, previewSkills) {
  const deltas = {};
  const warnings = [];
  for (const skill of parsedSkills ?? []) {
    const prepared = Number(previewSkills?.[skill.skill]?.rank ?? 0);
    const delta = Number(skill.rank ?? 0) - prepared;
    if (delta < 0) {
      warnings.push(`Skill ${skill.skill}: export rank ${skill.rank} below item-supplied ${prepared}; capping at 0.`);
    }
    if (delta > 0) deltas[skill.skill] = delta;
  }
  return { deltas, warnings };
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
    const match = resolveMatch(deps.resolve, "specialization", spec);
    if (match) {
      const talents = match.ref?.snapshot?.system?.talents ?? {};
      buildItems.push(deps.toItemData(match.ref, {
        rankGrants: index === 0 ? ranks.spec : [],
        learnedKeys,
        nodeAttributeGrants: dedicationGrantsForSpec(spec, talents, dedicationBySpec, learnedKeys),
      }));
    } else {
      const result = deps.buildInPlace("specialization", spec, {
        rankGrants: index === 0 ? ranks.spec : [],
        learnedKeys,
      });
      buildItems.push(result.source);
      report.warnings.push(...(result.warnings ?? []));
      report.unmatched.push({ kind: "specialization", key: keyOf(spec) ?? nameOf(spec) });
    }
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

  const preview = await deps.preparePreview(buildItems);
  const characteristicResidual = residualCharacteristicDeltas(parsed.characteristics, preview.characteristics);
  const skillResidual = residualSkillDeltas(parsed.skills, preview.skills);
  report.warnings.push(...characteristicResidual.warnings, ...skillResidual.warnings);
  const xp = deriveXp(parsed, characteristicResidual.deltas);
  report.warnings.push(...xp.warnings);
  if (parsed.notes) report.warnings.push("Hyperdrive notes have no native actor field and were preserved in import flags.");
  if (parsed.vehicles?.length) report.warnings.push(`${parsed.vehicles.length} vehicle entry or entries were skipped.`);
  if (!parsed.signatureAbilities?.length) report.warnings.push("The export contains no signature abilities.");

  const assembled = deps.assemble({
    name: parsed.name,
    characteristicDeltas: characteristicResidual.deltas,
    skillDeltas: skillResidual.deltas,
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
