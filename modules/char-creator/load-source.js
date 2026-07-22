/**
 * Content-source I/O shell (issue C, N-1, N-4, D7).
 *
 * NOT Covered and outside the rule-7 closure — it reads live packs, world items,
 * world settings and the user's source-exclusion flag, none of which the Node stub
 * may install. The pure descriptor table + predicates live in source-descriptors.js;
 * behaviour here is verified live at Stage 23.
 */

import { FLAG_SCOPE, FLAGS } from "./constants.js";
import { getDescriptor, sourceIdOf, isSourceEnabled } from "./source-descriptors.js";
import { toSelectionRef } from "./wizard-state.js";

/** poolKey → SelectionRef[] cache, invalidated when the pool's inputs change. */
const poolCache = new Map();

/** Drop the cache for one pool (or all pools when called with no argument). */
export function invalidateSourceCache(poolKey) {
  if (poolKey === undefined) poolCache.clear();
  else poolCache.delete(poolKey);
}

/** Read this user's per-pool source exclusions from their own User flag (D7). */
export function readExclusions() {
  return game.user.getFlag(FLAG_SCOPE, FLAGS.sourceSelection) ?? {};
}

/**
 * Load a content pool as SelectionRefs: the packs named in the pool's setting UNION
 * the world items of the pool's mapped Item types. Falsy pack ids are skipped;
 * disabled sources are skipped; the GM gates (maxRarity / allowRestricted) exclude
 * items as in the legacy getItems (character-creator.js:663-676). Results carry
 * `toObject()` snapshots and are cached per poolKey.
 *
 * @param {string} poolKey
 * @param {{exclusions?: Object<string, string[]>}} [options]
 * @returns {Promise<Array<object>>} SelectionRefs
 */
export async function loadSource(poolKey, { exclusions = readExclusions() } = {}) {
  if (poolCache.has(poolKey)) return poolCache.get(poolKey);

  const descriptor = getDescriptor(poolKey);
  const maxRarity = game.settings.get("starwarsffg", "maxRarity");
  const allowRestricted = game.settings.get("starwarsffg", "allowRestricted");

  const passesGmGate = (item) => {
    if (item.system?.rarity?.value > maxRarity) return false;
    if (!allowRestricted && item.system?.rarity?.isrestricted) return false;
    return true;
  };

  const refs = [];

  // Compendium packs named in the pool's setting. The `<type>Compendiums` settings
  // store a COMMA-SEPARATED STRING (legacy getSources split on ","), so split it;
  // tolerate an array too, in case a future migration changes the storage type.
  const settingValue = game.settings.get(FLAG_SCOPE, descriptor.settingKey);
  const packIds = typeof settingValue === "string" ? settingValue.split(",") : (settingValue || []);
  for (const rawPackId of packIds) {
    const packId = typeof rawPackId === "string" ? rawPackId.trim() : rawPackId;
    if (!packId) continue; // falsy / empty pack ids skipped
    const pack = game.packs.get(packId);
    if (!pack) continue;
    const sourceId = sourceIdOf(pack);
    if (!isSourceEnabled(poolKey, sourceId, exclusions)) continue;
    const docs = await pack.getDocuments();
    for (const item of docs) {
      if (!descriptor.worldItemTypes.includes(item.type)) continue;
      if (passesGmGate(item)) refs.push(toSelectionRef(item));
    }
  }

  // World items of the mapped types (N-1 careers, N-4 gear).
  if (isSourceEnabled(poolKey, "world", exclusions)) {
    for (const item of game.items) {
      if (!descriptor.worldItemTypes.includes(item.type)) continue;
      if (passesGmGate(item)) refs.push(toSelectionRef(item));
    }
  }

  poolCache.set(poolKey, refs);
  return refs;
}
