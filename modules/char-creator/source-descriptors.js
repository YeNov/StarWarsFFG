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
 * `obligation` pack + world type as obligations, differentiated only by ruleset —
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
    bucketing: "obligation / duty / morality per ruleset",
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

/**
 * Whether a source is enabled for a pool. Persistence is stored as EXCLUSIONS so a
 * newly-added GM pack defaults ON (D7): a source is enabled unless the user's
 * exclusion list for that pool names it.
 * @param {string} poolKey
 * @param {string} sourceId
 * @param {Object<string, string[]>} [exclusions]  { [poolKey]: [sourceId, …] }
 * @returns {boolean}
 */
export function isSourceEnabled(poolKey, sourceId, exclusions = {}) {
  const excluded = exclusions?.[poolKey] ?? [];
  return !excluded.includes(sourceId);
}
