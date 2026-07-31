const CHARS = ["Brawn", "Agility", "Intellect", "Cunning", "Willpower", "Presence"];

function clone(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function array(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function hyperdriveImage(value) {
  for (const candidate of [
    value?.imageUrl,
    value?.ImageUrl,
    value?.imageURL,
    value?.ImageURL,
    value?.img,
    value?.Img,
    value?.image,
    value?.Image,
    value?.thumbnailUrl,
    value?.ThumbnailUrl,
    value?.thumbnailURL,
    value?.ThumbnailURL,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

export function hyperdriveThumbnail(value) {
  for (const candidate of [
    value?.thumbnailUrl,
    value?.ThumbnailUrl,
    value?.thumbnailURL,
    value?.ThumbnailURL,
    value?.tokenUrl,
    value?.TokenUrl,
    value?.tokenURL,
    value?.TokenURL,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function normalizeTreeGrid(grid) {
  return array(grid).map((row) => array(row?.value ?? row).map(Boolean));
}

function normalizeTrack(entry) {
  return {
    ...clone(entry),
    key: entry?.Key ?? null,
    name: entry?.Name ?? "",
    text: entry?.Text ?? "",
    xp5: Boolean(entry?.XP5 ?? entry?.XPC),
    xp10: Boolean(entry?.XP10),
  };
}

function normalizeBackground(raw = {}) {
  const one = (value) => value ? {
    ...clone(value),
    key: value.Key ?? null,
    name: value.Name ?? "",
    description: value.Description ?? "",
  } : null;
  return {
    text: raw.Text ?? "",
    culture: one(raw.Culture),
    hook: one(raw.Adventure),
    force: one(raw.Force),
  };
}

function normalizeForcePowers(value) {
  if (Array.isArray(value)) {
    return value.map((power) => ({
      ...clone(power),
      key: power?.Key ?? power?.key,
      name: power?.Name ?? power?.name ?? power?.Key ?? power?.key,
      grid: clone(power?.grid ?? power?.BoughtPowers ?? {}),
      paidCosts: clone(power?.PaidCosts ?? power?.paidCosts ?? {}),
    }));
  }
  return Object.entries(value ?? {}).map(([key, power]) => ({
    ...clone(power),
    key,
    name: power?.Name ?? key,
    grid: Object.fromEntries(Object.entries(power ?? {}).filter(([k]) => k !== "PaidCosts")),
    paidCosts: clone(power?.PaidCosts ?? {}),
  }));
}

export function parseHyperdrive(rawInput = {}) {
  const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
  const speciesRaw = raw.Species ?? {};
  const startingChars = Object.fromEntries(CHARS.map((key) => [key, number(speciesRaw.StartingChars?.[key])]));
  const characteristics = Object.fromEntries(CHARS.map((key) => [key, number(raw.Characteristics?.[key])]));
  const gearAll = array(raw.Gear).map(clone);
  const cybernetics = gearAll.filter((item) => String(item?.Type ?? "").toLowerCase() === "cybernetics");
  const gear = gearAll.filter((item) => String(item?.Type ?? "").toLowerCase() !== "cybernetics");
  const background = normalizeBackground(raw.Background);

  const specializations = array(raw.Specializations).map((spec, index) => ({
    ...clone(spec),
    key: spec?.Key ?? spec?.key,
    name: spec?.Name ?? spec?.name ?? "",
    grid: normalizeTreeGrid(spec?.BoughtTalents),
    paidCosts: clone(spec?.PaidCosts ?? {}),
    careerSkills: array(spec?.CareerSkills),
    universal: spec?.Universal === true || String(spec?.Universal).toLowerCase() === "true",
    owns: index === 0 || normalizeTreeGrid(spec?.BoughtTalents).some((row) => row.some(Boolean)),
  }));

  const forcePowers = normalizeForcePowers(raw.ForcePowers);
  const obligations = array(raw.Obligations).map(normalizeTrack);
  const duties = array(raw.Duties).map(normalizeTrack);
  const moralityRaw = raw.Morality ?? null;
  const img = hyperdriveImage(raw) ?? hyperdriveImage(speciesRaw);
  const tokenImg = hyperdriveThumbnail(raw) ?? hyperdriveThumbnail(speciesRaw) ?? img;

  return {
    name: String(raw.Name ?? "").trim(),
    img,
    tokenImg,
    credits: number(raw.Credits),
    biography: String(raw.Background?.Text ?? ""),
    characteristics,
    xp: {
      source: number(raw.XP),
      earned: number(raw.EarnedXP),
    },
    derived: {
      wounds: number(raw.Wounds ?? raw.WoundThreshold),
      strain: number(raw.Strain ?? raw.StrainThreshold),
      soak: number(raw.Soak),
    },
    species: {
      ...clone(speciesRaw),
      key: speciesRaw.Key ?? speciesRaw.Species ?? null,
      name: speciesRaw.Name ?? "",
      startingChars,
      startingXP: number(speciesRaw.StartingAttrs?.Experience) + number(speciesRaw.StartingXPAdjust),
      startingAttrs: {
        woundThreshold: number(speciesRaw.StartingAttrs?.WoundThreshold),
        strainThreshold: number(speciesRaw.StartingAttrs?.StrainThreshold),
      },
      selectedSkills: array(speciesRaw.SelectedSkills),
    },
    career: {
      ...clone(raw.Career ?? {}),
      key: raw.Career?.Key ?? null,
      name: raw.Career?.Name ?? "",
      careerSkills: array(raw.Career?.CareerSkills ?? raw.CareerSkills),
    },
    specializations,
    forcePowers,
    signatureAbilities: array(raw.SignatureAbilities).map(clone),
    skills: array(raw.Skills).map((skill) => ({
      ...clone(skill),
      key: skill?.Key ?? null,
      skill: skill?.skill ?? skill?.Name ?? skill?.Key ?? "",
      characteristic: skill?.characteristic ?? null,
      type: skill?.type ?? null,
      rank: number(skill?.value),
    })),
    careerRanks: array(raw.CareerRanks),
    specRanks: array(raw.SpecRanks),
    careerSkills: array(raw.CareerSkills ?? raw.Career?.CareerSkills),
    extraCareerSkills: array(raw.ExtraCareerSkills),
    specSkills: array(raw.SpecSkills),
    weapons: array(raw.Weapons).map(clone),
    armour: array(raw.Armor ?? raw.Armour).map(clone),
    gear,
    cybernetics,
    obligations,
    duties,
    morality: moralityRaw ? {
      ...clone(moralityRaw),
      score: number(moralityRaw.Score, 50),
      xpc: Boolean(moralityRaw.XPC),
      xp10: Boolean(moralityRaw.XP10),
      strengthWeakness: array(moralityRaw.StrengthWeakness).map(clone),
    } : null,
    motivations: array(raw.Motivations).map((motivation) => ({
      ...clone(motivation),
      key: motivation?.SpecificMotivation?.Key ?? motivation?.Motivation?.Key ?? null,
      name: motivation?.SpecificMotivation?.Name ?? motivation?.Motivation?.Name ?? "",
      text: motivation?.Text ?? "",
    })),
    background,
    notes: raw.Notes ?? "",
    modifiers: clone(raw.Modifiers ?? {}),
    title: raw.Title ?? "",
    source: clone(raw.Source ?? ""),
    dedications: clone(raw.Dedications ?? {}),
    boughtTalents: array(raw.BoughtTalents).map((talent) => ({
      ...clone(talent),
      key: talent?.key ?? talent?.Key ?? talent?.data?.Key ?? null,
      name: talent?.name ?? talent?.Name ?? talent?.data?.Name ?? "",
      count: number(talent?.count ?? talent?.Count),
      attributes: clone(talent?.attributes ?? talent?.Attributes ?? talent?.data?.Attributes ?? {}),
    })),
    vehicles: array(raw.Vehicles).map(clone),
    modStates: clone(raw.ModStates ?? {}),
    forceRating: number(raw.ForceRating),
    rules: (raw.Morality || raw.Background?.Force?.Key)
      ? "fad"
      : (array(raw.Duties).length ? "aor" : "eote"),
    raw: clone(raw),
  };
}

export { CHARS as HYPERDRIVE_CHARACTERISTICS };
