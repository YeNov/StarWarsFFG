/**
 * Commit service I/O shell (D3).
 *
 * NOT Covered and outside the rule-7 closure — it creates the Actor document. The pure
 * normalization/fingerprint/sanitizer live in commit-normalize.js. Verified live at
 * Stage 23 (the upsert, verifyCommitLog against a real actor, the socket round-trip).
 */

import { normalizeCommitSource } from "./commit-normalize.js";
import { FLAG_SCOPE, FLAGS } from "./constants.js";

/** Thrown by the best-effort stamp preflight when the target id already exists. */
export class CommitCollisionError extends Error {
  constructor(actorId) {
    super(`an actor with id ${actorId} already exists`);
    this.name = "CommitCollisionError";
    this.actorId = actorId;
  }
}

/** Same-client coalescing: one in-flight commit per commitId. */
const inFlight = new Map();

/**
 * Create the actor from a normalized source.
 *
 * NB (stated plainly): a top-level Actor create with `keepId: true` is an UPSERT. No
 * atomic, exactly-once, or never-overwrite guarantee is made here — the worst case is a
 * duplicate character the GM deletes, never a lost or corrupted build.
 *
 * @param {object} actorData
 * @param {object} commit  { userId, commitId, firstAttemptAt, xp }
 * @returns {Promise<object>} the created Actor
 */
export async function commitBuild(actorData, commit) {
  if (inFlight.has(commit.commitId)) return inFlight.get(commit.commitId);

  const work = (async () => {
    const { source } = await normalizeCommitSource(actorData, commit);

    // best-effort stamp preflight. A retry after a lost response should be idempotent:
    // if the deterministic id already belongs to this exact wizard commit, return it.
    const existing = game.actors.get(source._id);
    if (existing) {
      if (isMatchingCommittedActor(existing, commit)) {
        verifyCommitLog(existing, commit);
        return existing;
      }
      throw new CommitCollisionError(source._id);
    }

    const actor = await Actor.implementation.create(source, { keepId: true });
    verifyCommitLog(actor, commit); // read-only (D10)
    return actor;
  })();

  inFlight.set(commit.commitId, work);
  try {
    return await work;
  } finally {
    inFlight.delete(commit.commitId);
  }
}

export function isMatchingCommittedActor(actor, commit) {
  const stamp = actor?.getFlag?.(FLAG_SCOPE, FLAGS.commit);
  return stamp?.commitId === commit?.commitId
    && stamp?.userId === commit?.userId
    && stamp?.date === String(commit?.firstAttemptAt ?? "").slice(0, 10)
    && Number(stamp?.xp?.total) === Number(commit?.xp?.total)
    && Number(stamp?.xp?.available) === Number(commit?.xp?.available);
}

/** Read-only D10 verification that the baked XP log landed. Never writes. */
function verifyCommitLog(actor, commit) {
  const log = actor.getFlag("starwarsffg", "xpLog") ?? [];
  const hasSpend = log.some((entry) => entry.id === `pcw:${commit.commitId}:spend`);
  if (!hasSpend) CONFIG.logger?.warn?.(`commit ${commit.commitId}: baked XP spend entry not found on the created actor`);
}
