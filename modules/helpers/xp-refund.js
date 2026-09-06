/**
 * Pure lookup for "what does refunding this XP-log entry actually undo?".
 *
 * Only two purchase paths ever created an Active Effect for their purchase: skill
 * ranks and characteristics, both via `_spendXp`, which names the effect
 * `purchased-<id>` and stores that id on the log entry. Everything else charges the
 * actor directly, because an Active Effect can neither grant a document nor tick a
 * talent-tree node:
 *
 *   - `item` — a force power / specialization / talent bought as an Item.
 *   - `node` — a specialization talent or a force-power / signature-ability /
 *              specialization tree upgrade, stored as `…islearned = true` on the item.
 *   - `xp`   — a self XP adjustment, which moves available AND total.
 *
 * Those entries carry an `undo` descriptor instead of an effect id. Entries written
 * before this existed carry neither, and resolve to `none`: there is no record of
 * what they bought, so there is nothing to reverse.
 *
 * Keeping the resolution here -- with no Foundry globals -- is also what fixes the
 * destructive case: `effect.name.includes(purchaseId)` with an EMPTY id matches
 * every effect, so a refund click on an id-less entry deleted an unrelated
 * purchase (in practice a talent's effect). An empty id resolves to nothing, always.
 *
 * @see modules/actors/actor-sheet-ffg.js (_refundPurchase, the only caller)
 */

/**
 * Resolve what a refund click should undo.
 *
 * @param {string} purchaseId              id stored on the XP-log entry
 * @param {object} sources
 * @param {Array<{id: string, name: string}>} [sources.effects]     the actor's Active Effects
 * @param {Array<object>} [sources.logEntries]                      the actor's `xpLog` flag
 * @returns {{kind: "effect", effectId: string}
 *          |{kind: "item", itemId: string, cost: number}
 *          |{kind: "talent-rank", itemId: string, ranks: number, cost: number}
 *          |{kind: "node", itemId: string, path: string, cost: number}
 *          |{kind: "xp", amount: number}
 *          |{kind: "none"}}
 */
export function resolveRefundTarget(purchaseId, { effects = [], logEntries = [] } = {}) {
  if (typeof purchaseId !== "string" || purchaseId === "") return { kind: "none" };

  const effect = effects.find((ae) => typeof ae?.name === "string" && ae.name.includes(purchaseId));
  if (effect) return { kind: "effect", effectId: effect.id };

  const entry = logEntries.find((e) => e?.id === purchaseId);
  const undo = entry?.undo;
  const cost = Number(entry?.xp?.cost) || 0;

  if (undo?.type === "item" && undo.itemId) return { kind: "item", itemId: undo.itemId, cost };
  // A talent purchase that merged into a talent the actor already had bought ranks,
  // not a document: the refund takes those ranks back and deletes the item only if
  // that empties it. Entries logged before merging existed carry `item` and still
  // delete, so nothing already in an XP log changes meaning.
  if (undo?.type === "talent-rank" && undo.itemId) {
    const ranks = Math.max(1, Math.trunc(Number(undo.ranks) || 1));
    return { kind: "talent-rank", itemId: undo.itemId, ranks, cost };
  }
  if (undo?.type === "node" && undo.itemId && undo.path) {
    return { kind: "node", itemId: undo.itemId, path: undo.path, cost };
  }
  // The adjusted amount is signed and moved both XP figures, so the entry's own
  // cost is not enough to reverse it -- a negative adjustment must be given back.
  if (undo?.type === "xp" && Number.isFinite(Number(undo.amount))) {
    return { kind: "xp", amount: Number(undo.amount) };
  }

  return { kind: "none" };
}
