export function normalizeName(name) {
  return String(name ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase();
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
  const pick = (map, itemType, value, label) => {
    const list = map.get(`${itemType} ${value}`);
    if (!list?.length) return null;
    if (list.length > 1) {
      const fingerprint = `${label}:${itemType}:${value}`;
      if (!reported.has(fingerprint)) {
        ambiguities.push({ itemType, [label]: value, count: list.length });
        reported.add(fingerprint);
      }
    }
    return list[0];
  };
  return {
    entries,
    getByKey: (type, key) => pick(byKey, type, key, "key"),
    getByName: (type, name) => pick(byName, type, normalizeName(name), "name"),
    ambiguities,
  };
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

export function collectImportEntries({ docLists = [], worldItems = [] } = {}) {
  return [
    ...Array.from(docLists ?? []).flatMap((docs) => entriesFromDocs(docs)),
    ...entriesFromDocs(worldItems),
  ];
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
  const skillMap = { ...(temporarySkills ?? {}) };
  for (const entry of entries) {
    if (entry.itemType === "skill" && entry.ffgimportid && entry.ref?.name) {
      skillMap[entry.ffgimportid] = entry.ref.name;
    }
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
