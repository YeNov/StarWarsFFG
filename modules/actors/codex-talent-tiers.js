/**
 * Talent tier resolution for the Codex sheets.
 *
 * `ActorFFG#talentList` entries carry no tier of their own (the core sheets
 * only compute one for non-starwars dice themes), so the tier is re-derived
 * here from the actor's own items:
 *
 *   - a talent ITEM carries `system.tier`, and that is authoritative: it is the
 *     value the talent's own sheet edits, so changing it has to move the card;
 *   - a talent that exists only as a specialization tree entry takes its row in
 *     the 4-wide grid, `talentN` -> trunc(N / 4) + 1 - the same formula the
 *     tree's XP cost uses in item-ffg.js. Across several trees the lowest row
 *     wins: the earliest point a character could have taken it.
 *
 * A ranked talent bought more than once is stored as several items, and those
 * copies can disagree once one of them is edited. The copy edited most recently
 * decides (`_stats.modifiedTime`), so the change just made on a talent's sheet
 * is the one shown; with no usable timestamps the highest tier wins.
 *
 * Pure module - no Foundry globals - so it is unit-testable under node.
 */

const DEFAULT_TIER = 1;
const TREE_WIDTH = 4;

/** Row of a `talentN` tree key, 1-based. Returns null for a non-tree key. */
function tierFromTreeKey(key) {
  const match = /^talent(\d+)$/.exec(String(key ?? ""));
  if (!match) return null;
  return Math.trunc(Number(match[1]) / TREE_WIDTH) + 1;
}

/** Normalised talent name, or "" when there is nothing usable to key on. */
function nameOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** Record a tree row for `name`, keeping the lowest row seen. */
function recordRow(map, name, tier) {
  const talentName = nameOf(name);
  if (!talentName) return;
  const current = map.get(talentName);
  if (current === undefined || tier < current) map.set(talentName, tier);
}

/**
 * Record an item's tier for `name`. The most recently modified item wins, so an
 * edit to one copy of a duplicated ranked talent is what gets shown; ties (and
 * items with no timestamp) fall back to the highest tier.
 */
function recordItem(map, name, tier, modifiedTime) {
  const talentName = nameOf(name);
  if (!talentName) return;
  const current = map.get(talentName);
  if (current === undefined) {
    map.set(talentName, { tier, modifiedTime });
    return;
  }
  const newer = modifiedTime > current.modifiedTime;
  const sameAge = modifiedTime === current.modifiedTime;
  if (newer || (sameAge && tier > current.tier)) map.set(talentName, { tier, modifiedTime });
}

/**
 * Build a talent name -> tier map from an actor's items.
 *
 * @param {Iterable<object>} items  the actor's items (Foundry documents or plain objects)
 * @returns {Map<string, number>}
 */
export function buildTalentTierMap(items) {
  const rows = new Map();   // name -> tier, from specialization trees
  const owned = new Map();  // name -> { tier, modifiedTime }, from talent items
  for (const item of (items ?? [])) {
    if (item?.type === "talent") {
      const tier = Number.parseInt(item?.system?.tier, 10);
      const modifiedTime = Number(item?._stats?.modifiedTime);
      recordItem(
        owned,
        item?.name,
        Number.isFinite(tier) && tier > 0 ? tier : DEFAULT_TIER,
        Number.isFinite(modifiedTime) ? modifiedTime : 0,
      );
      continue;
    }
    if (item?.type !== "specialization") continue;
    for (const [key, slot] of Object.entries(item?.system?.talents ?? {})) {
      if (slot?.islearned !== true) continue;
      const tier = tierFromTreeKey(key);
      if (tier === null) continue;
      recordRow(rows, slot?.name, tier);
    }
  }
  // An item's own tier is authoritative; tree rows only fill in for talents that
  // have no item of their own.
  const map = new Map(rows);
  for (const [name, { tier }] of owned) map.set(name, tier);
  return map;
}

/**
 * Group a talent list into ascending tiers. The order inside a group is the
 * incoming order, so whatever sort the sheet already applied (activation or
 * name) still holds within a tier.
 *
 * @param {Array<object>} talentList  entries from `ActorFFG#talentList`
 * @param {Map<string, number>} tierMap  from {@link buildTalentTierMap}
 * @returns {Array<{tier: number, talents: object[]}>}
 */
export function groupTalentsByTier(talentList, tierMap) {
  const byTier = new Map();
  for (const talent of (talentList ?? [])) {
    const tier = tierMap?.get(talent?.name) ?? DEFAULT_TIER;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(talent);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, talents]) => ({ tier, talents }));
}
