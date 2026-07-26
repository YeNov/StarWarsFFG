/**
 * Content-source I/O shell (issue C, N-1, N-4, D7).
 *
 * NOT Covered and outside the rule-7 closure — it reads live packs, world items,
 * world settings and the user's source-exclusion flag, none of which the Node stub
 * may install. The pure descriptor table + predicates live in source-descriptors.js;
 * behaviour here is verified live at Stage 23.
 */

import { FLAG_SCOPE, FLAGS } from "./constants.js";
import { getDescriptor, sourceIdOf, isSourceEnabled, sourceSettingPackIds } from "./source-descriptors.js";
import { toSelectionRef } from "./wizard-state.js";

/** poolKey → { signature, refs } cache, invalidated when the pool's inputs change. */
const poolCache = new Map();
const SLOW_SOURCE_LOAD_MS = 1000;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logSlowSourceLoad(message, startedAt, details = "") {
  const duration = Math.round(nowMs() - startedAt);
  if (duration < SLOW_SOURCE_LOAD_MS) return;
  CONFIG.logger?.warn?.(`PC wizard source load slow: ${message} took ${duration}ms${details}`);
}

/** Drop the cache for one pool (or all pools when called with no argument). */
export function invalidateSourceCache(poolKey) {
  if (poolKey === undefined) poolCache.clear();
  else poolCache.delete(poolKey);
}

/** Read this user's per-pool source exclusions from their own User flag (D7). */
export function readExclusions() {
  return game.user.getFlag(FLAG_SCOPE, FLAGS.sourceSelection) ?? {};
}

function sourceCacheSignature(poolKey, descriptor, { exclusions, maxRarity, allowRestricted }) {
  const settingValue = game.settings.get(FLAG_SCOPE, descriptor.settingKey);
  const packs = sourceSettingPackIds(settingValue).map((packId) => {
    const pack = game.packs.get(packId);
    return {
      id: packId,
      available: !!pack,
      sourceId: pack ? sourceIdOf(pack) : packId,
      size: pack?.index?.size ?? pack?.index?.contents?.length ?? null,
    };
  });
  return JSON.stringify({
    packs,
    exclusions: [...new Set(exclusions?.[poolKey] ?? [])].sort(),
    maxRarity,
    allowRestricted: !!allowRestricted,
  });
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
  const loadStartedAt = nowMs();
  const descriptor = getDescriptor(poolKey);
  const maxRarity = game.settings.get("starwarsffg", "maxRarity");
  const allowRestricted = game.settings.get("starwarsffg", "allowRestricted");
  const signature = sourceCacheSignature(poolKey, descriptor, { exclusions, maxRarity, allowRestricted });
  const cached = poolCache.get(poolKey);
  if (cached?.signature === signature) return cached.refs;

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
  const packJobs = sourceSettingPackIds(settingValue).map(async (packId) => {
    const pack = game.packs.get(packId);
    if (!pack) return [];
    const sourceId = sourceIdOf(pack);
    if (!isSourceEnabled(poolKey, sourceId, exclusions)) return [];
    const packStartedAt = nowMs();
    let docs;
    try {
      docs = await pack.getDocuments();
    } catch (err) {
      CONFIG.logger?.warn?.(`PC wizard failed to load compendium ${packId}: ${err.message}`);
      return [];
    }
    logSlowSourceLoad(`${poolKey}/${packId}`, packStartedAt, ` (${docs.length} documents)`);
    const packRefs = [];
    for (const item of docs) {
      if (!descriptor.worldItemTypes.includes(item.type)) continue;
      if (passesGmGate(item)) packRefs.push(toSelectionRef(item));
    }
    return packRefs;
  });
  for (const result of await Promise.allSettled(packJobs)) {
    if (result.status === "fulfilled") refs.push(...result.value);
    else CONFIG.logger?.warn?.(`PC wizard failed to load ${poolKey} source: ${result.reason?.message ?? result.reason}`);
  }

  // World items of the mapped types (N-1 careers, N-4 gear).
  if (isSourceEnabled(poolKey, "world", exclusions)) {
    for (const item of game.items) {
      if (!descriptor.worldItemTypes.includes(item.type)) continue;
      if (passesGmGate(item)) refs.push(toSelectionRef(item));
    }
  }

  poolCache.set(poolKey, { signature, refs });
  logSlowSourceLoad(poolKey, loadStartedAt, ` (${refs.length} refs)`);
  return refs;
}
