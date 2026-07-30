/**
 * Content-source descriptors + pure predicates (issue C, N-1, N-4, D7).
 *
 * Covered (plan §0.6.2). Imports nothing (a subset of its constants-only closure);
 * the I/O that actually reads packs/settings/user flags lives in load-source.js.
 *
 * Why a table rather than the literal `${type}Compendiums`: that template is invalid
 * for several categories (verified swffg-main.js:567-652). Force powers use the
 * setting `forcePowerCompendiums` while the Item type is lowercase `forcepower`; gear
 * spans FIVE Item types under the ONE `itemCompendiums` setting.
 *
 * N-1: the world career type is `career`, NOT `careers`.
 * Not consumed (deliberate): talentCompendiums, signatureAbilityCompendiums.
 * Recorded: getAvailableMoralities (character-creator.js:735-757) loads the SAME
 * `obligation` pack + world type as obligations, differentiated by item type —
 * hence one `obligation` poolKey covers obligation / duty / morality.
 */

/** Thrown when a pool key has no descriptor. */
export class UnknownPoolKeyError extends Error {
  constructor(poolKey) {
    super(`unknown source poolKey: ${JSON.stringify(poolKey)}`);
    this.name = "UnknownPoolKeyError";
    this.poolKey = poolKey;
  }
}

/**
 * poolKey → { settingKey, worldItemTypes, bucketing }.
 * `bucketing` is a human-readable note of how the shell sub-divides the pool; the
 * shell (load-source.js) owns the actual bucketing logic.
 */
export const SOURCE_DESCRIPTORS = Object.freeze({
  species: Object.freeze({
    settingKey: "speciesCompendiums",
    worldItemTypes: Object.freeze(["species"]),
    bucketing: null,
  }),
  career: Object.freeze({
    settingKey: "careerCompendiums",
    worldItemTypes: Object.freeze(["career"]), // N-1: `career`, not `careers`
    bucketing: null,
  }),
  specialization: Object.freeze({
    settingKey: "specializationCompendiums",
    worldItemTypes: Object.freeze(["specialization"]),
    bucketing: "in-career / out-of-career / universal",
  }),
  forcePower: Object.freeze({
    settingKey: "forcePowerCompendiums",
    worldItemTypes: Object.freeze(["forcepower"]), // setting key ≠ item type
    bucketing: "by system.required_force_rating",
  }),
  background: Object.freeze({
    settingKey: "backgroundCompendiums",
    worldItemTypes: Object.freeze(["background"]),
    bucketing: "system.type → culture / hook / attitude",
  }),
  obligation: Object.freeze({
    settingKey: "obligationCompendiums",
    worldItemTypes: Object.freeze(["obligation"]),
    bucketing: "system.type -> obligation / duty / morality",
  }),
  motivation: Object.freeze({
    settingKey: "motivationCompendiums",
    worldItemTypes: Object.freeze(["motivation"]),
    bucketing: "system.type",
  }),
  gear: Object.freeze({
    settingKey: "itemCompendiums",
    worldItemTypes: Object.freeze(["weapon", "armour", "gear", "itemattachment", "itemmodifier"]),
    bucketing: "the five gear category chips",
  }),
});

/**
 * Fetch the descriptor for a pool key, throwing UnknownPoolKeyError on a bad key.
 * @param {string} poolKey
 * @returns {{settingKey: string, worldItemTypes: string[], bucketing: (string|null)}}
 */
export function getDescriptor(poolKey) {
  const descriptor = SOURCE_DESCRIPTORS[poolKey];
  if (!descriptor) throw new UnknownPoolKeyError(poolKey);
  return descriptor;
}

/**
 * The stable id of a content source: a compendium pack's collection id, or the
 * sentinel `"world"` for the world-items source.
 * @param {("world"|{collection?: string, metadata?: {id?: string}})} source
 * @returns {string}
 */
export function sourceIdOf(source) {
  if (source === "world") return "world";
  return source?.collection ?? source?.metadata?.id ?? String(source);
}

const WORLD_SOURCE_ID = "world";
const WORLD_SOURCE_ENABLED = "enabled:world";

/**
 * Whether a source is enabled for a pool. Compendiums default ON so newly-added
 * GM packs are visible; world items default OFF so the wizard is driven by the
 * XP-spending compendium settings unless the user explicitly opts world items in.
 * @param {string} poolKey
 * @param {string} sourceId
 * @param {Object<string, string[]>} [exclusions]  { [poolKey]: [sourceId, …] }
 * @returns {boolean}
 */
export function isSourceEnabled(poolKey, sourceId, exclusions = {}) {
  const excluded = exclusions?.[poolKey] ?? [];
  if (sourceId === WORLD_SOURCE_ID) return excluded.includes(WORLD_SOURCE_ENABLED) && !excluded.includes(WORLD_SOURCE_ID);
  return !excluded.includes(sourceId);
}

/**
 * Apply the PC creator's purchase-time rarity/restricted gates unless a caller is
 * using the configured source list as a reconstruction catalog.
 */
export function passesSourceAvailabilityGate(
  item,
  {
    maxRarity,
    allowRestricted,
    ignoreAvailabilityGates = false,
  } = {},
) {
  if (ignoreAvailabilityGates) return true;
  const rarity = Number(item?.system?.rarity?.value);
  if (Number.isFinite(rarity) && Number.isFinite(Number(maxRarity)) && rarity > Number(maxRarity)) {
    return false;
  }
  return allowRestricted || !item?.system?.rarity?.isrestricted;
}

/**
 * Normalise a source setting into a trimmed list of compendium ids. The legacy
 * settings are comma-separated strings, but accepting arrays keeps the UI ready
 * for a future settings migration.
 * @param {(string|string[]|null|undefined)} settingValue
 * @returns {string[]}
 */
export function sourceSettingPackIds(settingValue) {
  const values = typeof settingValue === "string" ? settingValue.split(",") : (settingValue || []);
  return values
    .map((value) => typeof value === "string" ? value.trim() : value)
    .filter((value) => typeof value === "string" && value.length > 0);
}

/**
 * Return configured pack ids that cannot be resolved by the caller.
 * @param {(string|string[]|null|undefined)} settingValue
 * @param {(packId: string) => boolean} hasPack
 * @returns {string[]}
 */
export function missingSourcePackIds(settingValue, hasPack) {
  return sourceSettingPackIds(settingValue).filter((packId) => !hasPack(packId));
}

/**
 * Summarise whether a source setting is empty or points at unavailable packs.
 * @param {(string|string[]|null|undefined)} settingValue
 * @param {(packId: string) => boolean} hasPack
 * @returns {{packIds: string[], noConfiguredCompendiums: boolean, missingPackIds: string[]}}
 */
export function sourcePackStatus(settingValue, hasPack) {
  const packIds = sourceSettingPackIds(settingValue);
  return {
    packIds,
    noConfiguredCompendiums: packIds.length === 0,
    missingPackIds: packIds.filter((packId) => !hasPack(packId)),
  };
}

/**
 * Return a clean copy of the source-selection flag after enabling/disabling one
 * source. Compendiums are stored as exclusions; world items use an explicit
 * enable sentinel because their default is disabled.
 * @param {Object<string, string[]>} exclusions
 * @param {string} poolKey
 * @param {string} sourceId
 * @param {boolean} enabled
 * @returns {Object<string, string[]>}
 */
export function setSourceEnabled(exclusions = {}, poolKey, sourceId, enabled) {
  const next = {};
  for (const [key, values] of Object.entries(exclusions ?? {})) {
    const clean = Array.isArray(values) ? [...new Set(values.filter(Boolean))] : [];
    if (clean.length) next[key] = clean;
  }

  const current = new Set(next[poolKey] ?? []);
  if (sourceId === WORLD_SOURCE_ID) {
    current.delete(WORLD_SOURCE_ID);
    current.delete(WORLD_SOURCE_ENABLED);
    if (enabled) current.add(WORLD_SOURCE_ENABLED);
  } else if (enabled) {
    current.delete(sourceId);
  } else {
    current.add(sourceId);
  }

  if (current.size) next[poolKey] = [...current];
  else delete next[poolKey];

  return next;
}
