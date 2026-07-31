export function normalizeName(name) {
  return String(name ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase();
}

const NAME_QUALIFIERS = new Set([
  "armor",
  "attachment",
  "attachments",
  "customisation",
  "customization",
  "gear",
  "mod",
  "modification",
  "modifications",
  "quality",
  "qualities",
  "weapon",
]);

function nameTokens(name) {
  return normalizeName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\barmour\b/g, "armor")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score conservative expanded-name matches. This deliberately is not edit-distance
 * fuzzy matching: it accepts descriptive suffixes and known item/quality qualifiers,
 * but does not turn misspellings into arbitrary compendium selections.
 */
export function looseNameScore(requested, candidate) {
  const requestedTokens = nameTokens(requested);
  const candidateTokens = nameTokens(candidate);
  if (!requestedTokens.length || !candidateTokens.length) return 0;
  const requestedName = requestedTokens.join(" ");
  const candidateName = candidateTokens.join(" ");
  if (requestedName === candidateName) return 1000;

  const shorter = requestedTokens.length <= candidateTokens.length ? requestedTokens : candidateTokens;
  const longer = shorter === requestedTokens ? candidateTokens : requestedTokens;
  const isPrefix = shorter.every((token, index) => longer[index] === token);
  if (isPrefix && longer.length - shorter.length <= 3) {
    return 800 - (longer.length - shorter.length);
  }

  const core = (tokens) => tokens.filter((token) => !NAME_QUALIFIERS.has(token));
  const requestedCore = core(requestedTokens);
  const candidateCore = core(candidateTokens);
  if (requestedCore.length
    && requestedCore.length === candidateCore.length
    && requestedCore.every((token, index) => candidateCore[index] === token)) {
    return 600 - Math.abs(candidateTokens.length - requestedTokens.length);
  }
  return 0;
}

function normalizeItemType(type) {
  const value = normalizeName(type);
  return value === "armor" ? "armour" : value;
}

function resolutionAlias(itemType, field, value, ownerType = null) {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  return [
    normalizeItemType(itemType),
    normalizeItemType(ownerType),
    field,
    normalized,
  ].join("|");
}

export function resolutionAliases(itemType, entry, { ownerType = null } = {}) {
  return [
    resolutionAlias(itemType, "key", entry?.Key ?? entry?.key, ownerType),
    resolutionAlias(itemType, "name", entry?.Name ?? entry?.name, ownerType),
  ].filter(Boolean);
}

export function resolveFindingOverride(overrides, itemType, entry, options = {}) {
  for (const alias of resolutionAliases(itemType, entry, options)) {
    const ref = overrides?.get?.(alias) ?? overrides?.[alias];
    if (ref) return ref;
  }
  return null;
}

export function snapshotAppliesToOwner(snapshot, ownerType) {
  const owner = normalizeItemType(ownerType);
  if (!owner) return true;
  const appliesTo = normalizeItemType(snapshot?.system?.type);
  if (!appliesTo || appliesTo === "all") return true;
  if (owner === "shipweapon" && appliesTo === "weapon") return true;
  return appliesTo === owner;
}

export function buildSnapshotIndex(entries = [], itemType) {
  const index = {};
  const candidates = [];
  for (const entry of entries) {
    if (entry.itemType !== itemType) continue;
    const snapshot = entry.ref?.snapshot;
    if (!snapshot) continue;
    const candidate = {
      key: entry.ffgimportid ?? null,
      name: entry.ref?.name ?? snapshot.name ?? "",
      snapshot,
      ref: entry.ref,
    };
    candidates.push(candidate);
    if (candidate.key && !index[candidate.key]) index[candidate.key] = snapshot;
    const name = normalizeName(candidate.name);
    if (name && !index[`name:${name}`]) index[`name:${name}`] = snapshot;
  }
  Object.defineProperty(index, "__candidates", {
    value: candidates,
    enumerable: false,
  });
  Object.defineProperty(index, "__itemType", {
    value: itemType,
    enumerable: false,
  });
  return index;
}

export function findIndexedSnapshot(index, entry, options = {}) {
  const { ownerType = null } = options;
  const key = String(entry?.Key ?? entry?.key ?? "").trim();
  const name = entry?.Name ?? entry?.name;
  const candidates = index?.__candidates ?? [];
  const itemType = index?.__itemType;
  const override = options.resolveFinding?.(itemType, entry, { ownerType });
  const overrideSnapshot = override?.ref?.snapshot ?? override?.snapshot ?? override;
  if (overrideSnapshot) return overrideSnapshot;
  const canReport = itemType && (key || normalizeName(name));
  const report = (reason, matches = []) => {
    if (!canReport) return;
    options.onResolutionFinding?.({
      kind: itemType,
      entry,
      ownerType,
      reason,
      count: matches.length || undefined,
      candidates: matches.map((candidate) => candidate.name).filter(Boolean),
      candidateRefs: matches.map((candidate) => candidate.ref).filter(Boolean),
    });
  };
  if (key && candidates.length) {
    const keyed = candidates.filter((candidate) =>
      candidate.key === key && snapshotAppliesToOwner(candidate.snapshot, ownerType));
    if (keyed.length === 1) return keyed[0].snapshot;
    if (keyed.length > 1 && name) {
      const named = keyed.filter((candidate) => looseNameScore(name, candidate.name) === 1000);
      if (named.length === 1) return named[0].snapshot;
    }
    if (keyed.length > 1) {
      report("ambiguous", keyed);
      return keyed[0].snapshot;
    }
  }
  if (key && index?.[key] && snapshotAppliesToOwner(index[key], ownerType)) return index[key];

  const normalizedName = normalizeName(name);
  if (normalizedName && candidates.length) {
    const named = candidates.filter((candidate) =>
      normalizeName(candidate.name) === normalizedName
      && snapshotAppliesToOwner(candidate.snapshot, ownerType));
    if (named.length === 1) return named[0].snapshot;
    if (named.length > 1) {
      report("ambiguous", named);
      return named[0].snapshot;
    }
  }
  if (normalizedName
    && index?.[`name:${normalizedName}`]
    && snapshotAppliesToOwner(index[`name:${normalizedName}`], ownerType)) {
    return index[`name:${normalizedName}`];
  }

  const requestedNames = [
    name,
    entry?.ModDesc,
    entry?.QualDesc,
    entry?.MiscDesc,
    key,
  ].filter((value, position, values) =>
    normalizeName(value) && values.findIndex((other) => normalizeName(other) === normalizeName(value)) === position);
  let bestScore = 0;
  let best = [];
  for (const candidate of candidates) {
    if (!snapshotAppliesToOwner(candidate.snapshot, ownerType)) continue;
    const score = Math.max(...requestedNames.map((requested) =>
      looseNameScore(requested, candidate.name)), 0);
    if (score > bestScore) {
      bestScore = score;
      best = [candidate.snapshot];
    } else if (score && score === bestScore) {
      best.push(candidate.snapshot);
    }
  }
  if (bestScore && best.length === 1) return best[0];
  if (bestScore) {
    report("ambiguous", candidates.filter((candidate) => best.includes(candidate.snapshot)));
  } else {
    report("not-found");
  }
  return null;
}

export function buildImportIndex(entries = []) {
  const byKey = new Map();
  const byName = new Map();
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const entry of entries) {
    if (entry?.ffgimportid) push(byKey, `${entry.itemType} ${entry.ffgimportid}`, entry);
    if (entry?.ref?.name) push(byName, `${entry.itemType} ${normalizeName(entry.ref.name)}`, entry);
  }
  const ambiguities = [];
  const reported = new Set();
  const reportAmbiguity = (itemType, label, value, list, loose = false) => {
    const fingerprint = `${label}:${itemType}:${value}:${loose}`;
    if (reported.has(fingerprint)) return;
    ambiguities.push({
      itemType,
      [label]: value,
      count: list.length,
      candidateRefs: list.map((entry) => entry.ref),
      ...(loose ? { loose: true } : {}),
    });
    reported.add(fingerprint);
  };
  const pick = (map, itemType, value, label) => {
    const list = map.get(`${itemType} ${value}`);
    if (!list?.length) return null;
    if (list.length > 1) reportAmbiguity(itemType, label, value, list);
    return list[0];
  };
  const pickByName = (itemType, name) => {
    const normalized = normalizeName(name);
    const exact = pick(byName, itemType, normalized, "name");
    if (exact) return exact;
    let bestScore = 0;
    let best = [];
    for (const entry of entries) {
      if (entry.itemType !== itemType) continue;
      const score = looseNameScore(name, entry.ref?.name);
      if (score > bestScore) {
        bestScore = score;
        best = [entry];
      } else if (score && score === bestScore) {
        best.push(entry);
      }
    }
    if (!bestScore) return null;
    if (best.length > 1) {
      reportAmbiguity(itemType, "name", normalized, best, true);
      return null;
    }
    return best[0];
  };
  return {
    entries,
    getByKey: (type, key) => pick(byKey, type, key, "key"),
    getByName: pickByName,
    ambiguities,
  };
}

function candidateSuggestionScore(finding, entry) {
  const ref = entry?.ref ?? entry;
  const snapshot = ref?.snapshot ?? {};
  const candidateType = entry?.itemType ?? ref?.type ?? snapshot.type;
  const expectedType = finding?.kind;
  if (["itemmodifier", "itemattachment"].includes(candidateType)
    && !snapshotAppliesToOwner(snapshot, finding?.ownerType)) return 0;

  const requestedKey = finding?.key;
  const requestedName = finding?.name;
  const candidateKey = entry?.ffgimportid
    ?? snapshot?.flags?.starwarsffg?.ffgimportid;
  let score = 0;
  if (normalizeName(requestedKey) && normalizeName(requestedKey) === normalizeName(candidateKey)) {
    score = 2000;
  }
  for (const requested of [requestedName, requestedKey]) {
    score = Math.max(score, looseNameScore(requested, ref?.name ?? snapshot.name));
  }
  if (!score) return 0;
  if (candidateType === expectedType) score += 2000;
  return score;
}

/**
 * Pick a visible, replaceable suggestion for an unresolved finding. Candidate
 * refs already reported by the resolver win; otherwise search the supplied
 * broader catalog and prefer the expected Foundry item type.
 */
export function bestFindingSuggestion(finding, entries = []) {
  if (finding?.candidateRefs?.length) return finding.candidateRefs[0];
  let bestScore = 0;
  let best = null;
  for (const entry of entries) {
    const score = candidateSuggestionScore(finding, entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry.ref ?? entry;
    }
  }
  return best;
}

export function entriesFromDocs(docs = []) {
  return Array.from(docs ?? []).map((doc) => {
    const snapshot = typeof doc?.toObject === "function" ? doc.toObject() : structuredClone(doc);
    const itemType = doc?.type ?? snapshot?.type;
    return {
      itemType,
      ffgimportid: doc?.flags?.starwarsffg?.ffgimportid
        ?? snapshot?.flags?.starwarsffg?.ffgimportid
        ?? null,
      ref: {
        uuid: doc?.uuid ?? snapshot?.uuid ?? `${itemType}:${doc?.id ?? snapshot?._id ?? snapshot?.name ?? ""}`,
        name: doc?.name ?? snapshot?.name ?? "",
        type: itemType,
        img: doc?.img ?? snapshot?.img,
        snapshot,
      },
    };
  }).filter((entry) => entry.itemType);
}

export function entriesFromSelectionRefs(refs = []) {
  const seen = new Set();
  const entries = [];
  for (const ref of refs ?? []) {
    const snapshot = structuredClone(ref?.snapshot ?? {});
    const itemType = ref?.type ?? snapshot?.type;
    if (!itemType) continue;
    const uuid = ref?.uuid ?? `${itemType}:${snapshot?._id ?? ref?.name ?? snapshot?.name ?? ""}`;
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    entries.push({
      itemType,
      ffgimportid: snapshot?.flags?.starwarsffg?.ffgimportid ?? null,
      ref: {
        uuid,
        name: ref?.name ?? snapshot?.name ?? "",
        type: itemType,
        img: ref?.img ?? snapshot?.img,
        snapshot,
      },
    });
  }
  return entries;
}

export function collectImportEntries({
  docLists = [],
  worldItems = [],
  selectionRefs = [],
} = {}) {
  const combined = [
    ...Array.from(docLists ?? []).flatMap((docs) => entriesFromDocs(docs)),
    ...entriesFromDocs(worldItems),
    ...entriesFromSelectionRefs(selectionRefs),
  ];
  const seen = new Set();
  return combined.filter((entry) => {
    const identity = entry?.ref?.uuid;
    if (!identity || !seen.has(identity)) {
      if (identity) seen.add(identity);
      return true;
    }
    return false;
  });
}

const HYPERDRIVE_SKILL_NAME_PAIRS = [
  ["CORE", "Core Worlds", "Knowledge: Core Worlds"],
  ["EDU", "Education", "Knowledge: Education"],
  ["LORE", "Lore", "Knowledge: Lore"],
  ["OUT", "Outer Rim", "Knowledge: Outer Rim"],
  ["UND", "Underworld", "Knowledge: Underworld"],
  ["WARF", "Warfare", "Knowledge: Warfare"],
  ["XEN", "Xenology", "Knowledge: Xenology"],
  ["PILOTPL", "Piloting (Planetary)", "Piloting: Planetary"],
  ["PILOTSP", "Piloting (Space)", "Piloting: Space"],
  ["RANGHVY", "Ranged (Heavy)", "Ranged: Heavy"],
  ["RANGLT", "Ranged (Light)", "Ranged: Light"],
];

/**
 * Hyperdrive/OggDude uses display names which do not always match the skill keys in
 * Foundry's standard Star Wars skill theme. Keep these aliases local to Hyperdrive:
 * alternate themes and live skill-compendium mappings may override them below.
 */
export const HYPERDRIVE_SKILL_ALIASES = Object.freeze(Object.fromEntries(
  HYPERDRIVE_SKILL_NAME_PAIRS.flatMap(([importId, hyperdriveName, foundryName]) => [
    [importId, foundryName],
    [hyperdriveName, foundryName],
    [foundryName, foundryName],
  ]),
));

export function canonicalHyperdriveSkill(value, skillMap = {}) {
  const name = String(value ?? "").trim();
  if (!name) return name;
  const aliases = { ...HYPERDRIVE_SKILL_ALIASES, ...(skillMap ?? {}) };
  if (aliases[name]) return aliases[name];
  const normalized = name.toLocaleLowerCase();
  const matched = Object.entries(aliases)
    .find(([candidate]) => candidate.toLocaleLowerCase() === normalized);
  return matched?.[1] ?? name;
}

/**
 * Build the import-keyed skill lookup plus characteristic/type metadata used by
 * OggDude-style die modifiers.
 */
export function buildSkillMetadata({
  entries = [],
  temporarySkills = {},
  alternateSkillLists = [],
  themeId = "starwars",
} = {}) {
  const skillMap = { ...HYPERDRIVE_SKILL_ALIASES, ...(temporarySkills ?? {}) };
  for (const entry of entries) {
    if (entry.itemType === "skill" && entry.ffgimportid && entry.ref?.name) {
      skillMap[entry.ffgimportid] = entry.ref.name;
    }
  }
  for (const [importId, hyperdriveName, foundryName] of HYPERDRIVE_SKILL_NAME_PAIRS) {
    const activeName = skillMap[importId] ?? foundryName;
    skillMap[hyperdriveName] = activeName;
    skillMap[foundryName] = activeName;
  }
  const theme = alternateSkillLists.find((list) => list.id === themeId)
    ?? alternateSkillLists.find((list) => list.id === "starwars")
    ?? alternateSkillLists[0];
  const skillMeta = Object.entries(theme?.skills ?? {}).map(([key, data]) => ({
    skill: data?.value ?? key,
    characteristic: data?.characteristic ?? null,
    type: data?.type ?? null,
  }));
  return { skillMap, skillMeta };
}
