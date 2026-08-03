/**
 * Resolve a prepared actor talent-list entry without touching world or
 * compendium collections. Talent-tree entries are not embedded actor Items, so
 * their card ids must be resolved against ActorFFG#talentList first.
 */
export function findTalentListEntry(talentList, itemId, itemName) {
  const talents = Array.isArray(talentList) ? talentList : [];
  const id = String(itemId ?? "").trim();
  if (id) {
    const byId = talents.find((talent) => String(talent?.itemId ?? "") === id);
    if (byId) return byId;
  }

  const name = String(itemName ?? "").trim();
  if (!name) return undefined;
  return talents.find((talent) => String(talent?.name ?? "") === name);
}

/** Return the first directly owned talent Item represented by a merged row. */
export function findOwnedTalentSourceId(talent) {
  const source = Array.isArray(talent?.source) ? talent.source : [];
  return source.find((entry) => ["talent", "species"].includes(entry?.type) && entry?.id)?.id;
}

/** Match the tags produced by ItemFFG#getItemDetails for talent Items. */
export function talentDetailProperties(talent, localize = (key) => key) {
  const properties = [];
  if (talent?.isForceTalent) properties.push(localize("SWFFG.ForceTalent"));
  if (talent?.isRanked) properties.push(localize("SWFFG.Ranked"));
  return properties;
}
