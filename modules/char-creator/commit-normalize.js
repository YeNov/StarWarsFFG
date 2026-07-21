/**
 * Commit-source normalization, fingerprint, and the GM-side request sanitizer (D3).
 *
 * Covered. Imports build-item-schema.js, constants.js and the DEV-14 XP builders from
 * helpers/xp-entry-builders.js (a named, import-clean exception) — NEVER actor-helpers.js.
 */

import { FLAG_SCOPE, FLAGS } from "./constants.js";
import { assignWizardIdentity, projectItemSource } from "./build-item-schema.js";
import { buildXpSpendEntry, buildXpEarnEntry } from "../helpers/xp-entry-builders.js";

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Thrown when a socket commit request fails validation. */
export class InvalidCommitRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidCommitRequestError";
  }
}

/** Deterministic 16-char base-62 digest of an arbitrary JSON-able value. */
export function digest16(value) {
  const str = JSON.stringify(value);
  const mask = (1n << 64n) - 1n;
  const prime = 1099511628211n;
  let forward = 14695981039346656037n;
  for (let i = 0; i < str.length; i++) forward = ((forward ^ BigInt(str.charCodeAt(i))) * prime) & mask;
  let reverse = 14695981039346656037n;
  for (let i = str.length - 1; i >= 0; i--) reverse = ((reverse ^ BigInt(str.charCodeAt(i) + 131)) * prime) & mask;
  let combined = (forward << 64n) | reverse;
  let out = "";
  for (let i = 0; i < 16; i++) {
    out = B62[Number(combined % 62n)] + out;
    combined /= 62n;
  }
  return out;
}

/** Deep-clone a source with `_stats` stripped everywhere and top-level `ownership` removed. */
function stripForFingerprint(source) {
  const clone = structuredClone(source);
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      delete node._stats;
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(clone);
  delete clone.ownership; // the server-added processing-GM entry differs across failover
  return clone;
}

/** Fingerprint a source, excluding `_stats` and `ownership`. */
export function fingerprint(source) {
  return digest16(stripForFingerprint(source));
}

/**
 * Normalize a built actor source for commit: reapply the ONE identity formula, bake the
 * two-entry XP log (spend newest, then earn) through the pure DEV-14 builders, stamp the
 * commit flag, and compute the fingerprint. The XP entries ride the source (so any
 * same-key overwrite restores the intended log and the whisper is suppressed).
 *
 * @param {object} actorData
 * @param {{userId: string, commitId: string, firstAttemptAt: string, xp: {total: number, available: number}}} commit
 * @returns {Promise<{source: object, fingerprint: string}>}
 */
export async function normalizeCommitSource(actorData, { userId, commitId, firstAttemptAt, xp }) {
  const source = structuredClone(actorData);
  await assignWizardIdentity(source, { userId, commitId }); // no second formula

  const date = String(firstAttemptAt).slice(0, 10);
  const spend = buildXpSpendEntry({
    description: "Character Creation Changes",
    cost: xp.total - xp.available,
    available: xp.available,
    total: xp.total,
    statusId: `pcw:${commitId}:spend`,
    date,
  });
  const earn = buildXpEarnEntry({
    grant: xp.total,
    available: xp.total,
    total: xp.total,
    note: "Initial State",
    statusId: `pcw:${commitId}:earn`,
    date,
    granter: "GM",
  });

  source.flags = source.flags ?? {};
  source.flags[FLAG_SCOPE] = source.flags[FLAG_SCOPE] ?? {};
  source.flags[FLAG_SCOPE].xpLog = [spend, earn]; // newest-first
  source.flags[FLAG_SCOPE][FLAGS.commit] = { commitId, userId, xp, date };

  return { source, fingerprint: fingerprint(source) };
}

/**
 * GM-side sanitizer: build a FRESH source from an untrusted socket request. Allowed
 * quarry is name (clamped), img, system, and items (rebuilt through projectItemSource);
 * `_id`, the caller's `ownership`, `flags` and `prototypeToken` are dropped; ownership is
 * REPLACED with {[sender]: OWNER}. Non-finite xp is rejected.
 *
 * @param {object} request  { source, commit: { xp, … } }
 * @param {string} sender    the authenticated socket sender id
 * @returns {{source: object, commit: object}}
 */
export function sanitizeCommitRequest(request, sender) {
  const commit = request?.commit ?? {};
  const xp = commit.xp;
  if (!xp || !Number.isFinite(xp.total) || !Number.isFinite(xp.available)) {
    throw new InvalidCommitRequestError("commit xp.total/xp.available must be finite numbers");
  }

  const raw = request?.source ?? {};
  const source = {
    name: String(raw.name ?? "").slice(0, 128),
    img: raw.img,
    type: "character",
    system: structuredClone(raw.system ?? {}),
    items: Array.isArray(raw.items) ? raw.items.map(projectItemSource) : [],
    ownership: { [sender]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
  };

  return { source, commit: { commitId: commit.commitId, userId: sender, firstAttemptAt: commit.firstAttemptAt, xp } };
}
