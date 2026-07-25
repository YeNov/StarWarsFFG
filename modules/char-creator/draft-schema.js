/**
 * Draft serialization, migration, byte-budget, and rehydration merge (D5).
 *
 * Covered. Imports constants.js only (for DRAFT_SCHEMA_VERSION / DRAFT_MAX_BYTES —
 * duplicating those is forbidden; the closure allows the import).
 *
 * Schema v1 keeps `commit` BESIDE `data`, not inside it — "frozen" is derived from
 * `commit !== null`, there is no `data.commitFrozen`.
 */

import { DRAFT_SCHEMA_VERSION, DRAFT_MAX_BYTES } from "./constants.js";

/** Thrown when a stored draft is from a NEWER schema than this build understands. */
export class NewerSchemaError extends Error {
  constructor(version) {
    super(`draft schemaVersion ${version} is newer than ${DRAFT_SCHEMA_VERSION}`);
    this.name = "NewerSchemaError";
    this.version = version;
  }
}

/** Thrown when a stored draft is unreadable/corrupt. */
export class CorruptDraftError extends Error {
  constructor(message) {
    super(message);
    this.name = "CorruptDraftError";
  }
}

/**
 * Migrations keyed by the version they migrate FROM (each returns the next version's
 * record). Empty at v1 — there is nothing older to migrate yet.
 */
export const MIGRATIONS = Object.freeze({});

/**
 * Serialize a draft into the outer storage record.
 * @param {{data: object, commit?: (object|null)}} input
 * @param {{systemVersion?: string, savedAt?: string}} [meta]
 * @returns {object} the storage record
 */
export function serializeDraft({ data, commit = null }, { systemVersion = null, savedAt } = {}) {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    systemVersion,
    savedAt: savedAt ?? new Date().toISOString(),
    characterName: data?.identity?.name ?? "",
    commit,
    data,
  };
}

/**
 * Validate + migrate a stored record to the current schema. Never crashes on a bad
 * draft: throws a typed error the caller turns into a "discard?" prompt.
 * @param {*} record
 * @returns {object} the record normalized to the current schema version
 */
export function deserializeDraft(record) {
  if (!record || typeof record !== "object" || typeof record.schemaVersion !== "number" || !record.data) {
    throw new CorruptDraftError("draft is missing schemaVersion or data");
  }
  if (record.schemaVersion > DRAFT_SCHEMA_VERSION) {
    throw new NewerSchemaError(record.schemaVersion);
  }

  let migrated = record;
  let version = record.schemaVersion;
  while (version < DRAFT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (typeof migrate !== "function") throw new CorruptDraftError(`no migration from schemaVersion ${version}`);
    migrated = migrate(migrated);
    version += 1;
  }
  return { ...migrated, schemaVersion: DRAFT_SCHEMA_VERSION };
}

/**
 * Normalize ruleset state across pre-flattening and flattened wizard drafts.
 * Mutates and returns `data`.
 */
export function normalizeDraftRules(data) {
  if (!data?.selected) return data;
  const bonus = String(data.selected.startingBonus ?? "");
  const prefixedRules = /^(fad|aor|eote)_/.exec(bonus)?.[1];
  const storedRules = ["fad", "aor", "eote"].includes(data.selected.rules) ? data.selected.rules : null;
  const rules = prefixedRules ?? storedRules ?? "fad";
  data.selected.rules = rules;
  if (bonus && !prefixedRules) data.selected.startingBonus = `${rules}_${bonus}`;
  return data;
}

/** Measure a record's serialized size in UTF-8 BYTES (not UTF-16 code units). */
export function measureDraftBytes(record) {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

/** Whether a record is within the draft-size budget (≤ 64 KiB). */
export function isWithinBudget(record) {
  return measureDraftBytes(record) <= DRAFT_MAX_BYTES;
}

/** True for a compendium-resolvable ref (safe to reduce to a uuid-only ref). */
function isCompendiumResolvable(ref) {
  return Boolean(ref && typeof ref === "object" && typeof ref.uuid === "string" && ref.uuid.startsWith("Compendium."));
}

/** Walk a value, applying `fn` to every SelectionRef-shaped object ({uuid, snapshot}). */
function walkRefs(value, fn) {
  if (Array.isArray(value)) {
    value.forEach((entry) => walkRefs(entry, fn));
  } else if (value && typeof value === "object") {
    if (typeof value.uuid === "string" && "snapshot" in value) fn(value);
    for (const key of Object.keys(value)) {
      if (key === "snapshot") continue; // don't descend into snapshots
      walkRefs(value[key], fn);
    }
  }
}

/**
 * Fallback compaction (D5): drop the stored snapshot of every compendium-resolvable
 * ref, leaving a uuid-only ref that resume rehydrates via fromUuid. Returns a NEW
 * record; the input is not mutated.
 * @param {object} record
 * @returns {object}
 */
export function compactDraft(record) {
  const clone = structuredClone(record);
  walkRefs(clone.data, (ref) => {
    if (isCompendiumResolvable(ref)) delete ref.snapshot;
  });
  return clone;
}

/**
 * Merge a freshly-fetched snapshot into a stored ref on resume. Obligations preserve
 * their user-edited `system` fields; everything else takes the fresh snapshot. When
 * the source is unresolvable (no fresh snapshot), the stored ref is kept and a warning
 * is flagged.
 * @param {object} storedRef
 * @param {object|null} freshSnapshot
 * @returns {{ref: object, warning: boolean}}
 */
export function rehydrateRef(storedRef, freshSnapshot) {
  if (!freshSnapshot) return { ref: storedRef, warning: true };

  const snapshot = structuredClone(freshSnapshot);
  if (storedRef.type === "obligation" && storedRef.snapshot?.system !== undefined) {
    snapshot.system = structuredClone(storedRef.snapshot.system);
  }
  return { ref: { ...storedRef, snapshot }, warning: false };
}
