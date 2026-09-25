/**
 * Bridge to the Status Icon Counters module.
 *
 * That module puts a number on a status icon; the number belongs on the Active Effect's own
 * changes too, so a condition stacked three times applies its modifier at 3 rather than at 1.
 * The bridge watches for the counter's flag changing and rewrites the effect's changes to match.
 *
 * Three things have to be right, and none of them were:
 *
 * 1. The write has to be fenced. `updateActiveEffect` fires on EVERY connected client for EVERY
 *    Active Effect update anywhere in the world -- not just on the client that made the change,
 *    and not just for counter changes. Unfenced, each client echoed every effect update back at
 *    the server, and anyone without ownership of the effect collected a red "lacks permission to
 *    update ActiveEffect [...] in parent Item [...]" toast for their trouble: a burst of them
 *    whenever an actor whose career item carries one effect per career skill was loaded.
 *
 * 2. It has to read the STORED changes, not the prepared ones. V14 moved the changes to
 *    `system.changes` and left a shim behind `ActiveEffect#changes`; the prepared entries carry
 *    a back-reference to their own effect, so reading them and writing them straight back
 *    serialized a copy of the whole Active Effect into every one of its changes. On the clients
 *    that DID have permission -- the GM's -- that write went through.
 *
 * 3. It has to write `system.changes`. The top-level `changes` is the deprecated spelling, kept
 *    working only by a migration shim that relocates it.
 *
 * Pure of Foundry globals -- the current user id is passed in -- so it can be unit tested.
 */

/**
 * Decide what, if anything, this client should write back after an Active Effect update.
 *
 * @param {object} effect - the updated ActiveEffect (`isOwner`, `_source.system.changes`)
 * @param {object} changes - the update's diff, as Foundry hands it to the hook
 * @param {string} userId - the user who performed the update
 * @param {string} currentUserId - the user this client is logged in as
 * @returns {object[]|null} the changes array to write to `system.changes`, or null to write nothing
 */
export function planStatusCounterSync(effect, changes, userId, currentUserId) {
  // Every other client receives our write through the ordinary document broadcast; only the
  // client that moved the counter follows up on it.
  if (!userId || userId !== currentUserId) return null;
  // Foundry hands the hook an expanded diff, but a caller that passed a flattened update is
  // relayed verbatim -- so accept either spelling rather than silently doing nothing.
  const counterValue =
    changes?.flags?.statuscounter?.counter?.value ?? changes?.["flags.statuscounter.counter.value"];
  // Not a counter change: the update is somebody else's business (a suspend, a rename, one of
  // the system's own effect syncs) and must not provoke a write of its own.
  if (!counterValue) return null;
  // A player can be looking at an effect on an actor or item they do not own -- an NPC's gear,
  // another character's career. Asking the server to write it only earns a refusal.
  if (effect?.isOwner === false) return null;

  // `_source` is the stored data: plain, and free of the prepared entries' back-reference to
  // the effect that owns them. Falling back to the prepared array keeps a caller that passes a
  // plain object working, and `effect` is dropped below either way.
  const current = effect?._source?.system?.changes ?? effect?.system?.changes ?? effect?.changes;
  if (!Array.isArray(current) || current.length === 0) return null;
  if (current.every((change) => change?.value === counterValue)) return null;

  // A fresh array: mutating the live one corrupts prepared data and defeats the diff that
  // decides whether the update is worth sending at all.
  return current.map(({ effect: _backReference, ...change }) => ({ ...change, value: counterValue }));
}
