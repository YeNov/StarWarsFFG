/**
 * Talent tier resolution for the Codex sheets.
 *
 * `ActorFFG#talentList` entries carry no tier of their own (the core sheets
 * only compute one for non-starwars dice themes), so the tier is re-derived
 * here from the actor's own items:
 *
 *   - a standalone / species talent item carries `system.tier`;
 *   - a specialization tree talent's tier is its row in the 4-wide grid,
 *     `talentN` -> trunc(N / 4) + 1 - the same formula the tree's XP cost uses
 *     in item-ffg.js.
 *
 * A talent that appears in several places (bought twice, in two trees) keeps
 * the LOWEST tier it was found at: that is the earliest point in a tree a
 * character could have taken it.
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

/** Record `tier` for `name`, keeping the lowest tier seen. */
function record(map, name, tier) {
  const talentName = typeof name === "string" ? name.trim() : "";
  if (!talentName) return;
  const current = map.get(talentName);
  if (current === undefined || tier < current) map.set(talentName, tier);
}

/**
 * Build a talent name -> tier map from an actor's items.
 *
 * @param {Iterable<object>} items  the actor's items (Foundry documents or plain objects)
 * @returns {Map<string, number>}
 */
export function buildTalentTierMap(items) {
  const map = new Map();
  for (const item of (items ?? [])) {
    if (item?.type === "talent") {
      const tier = Number.parseInt(item?.system?.tier, 10);
      record(map, item?.name, Number.isFinite(tier) && tier > 0 ? tier : DEFAULT_TIER);
      continue;
    }
    if (item?.type !== "specialization") continue;
    for (const [key, slot] of Object.entries(item?.system?.talents ?? {})) {
      if (slot?.islearned !== true) continue;
      const tier = tierFromTreeKey(key);
      if (tier === null) continue;
      record(map, slot?.name, tier);
    }
  }
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
