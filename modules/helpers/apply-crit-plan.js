/**
 * The Apply Crit decisions, free of Foundry globals so Node can cover them
 * (tests/node/apply-crit-plan.test.mjs). `ApplyCrit.show()` (apply-crit.js) owns the dialog,
 * the table draw and the chat messages.
 */

/**
 * How many ranks of a talent an actor has. The prepared `talentList` covers talent items,
 * specialization trees and species grants alike; an actor without one falls back to its talent
 * items. An unranked talent counts as one rank.
 * @param {object} actor
 * @param {string} name - the talent's English name, matched whatever its case
 * @returns {number}
 */
export function talentRanks(actor, name) {
  const wanted = name.toLowerCase();
  const matches = (entry) => (entry?.name || "").trim().toLowerCase() === wanted;

  if (Array.isArray(actor?.talentList)) {
    const entry = actor.talentList.find(matches);
    if (!entry) return 0;
    const rank = Number(entry.rank);
    return Number.isFinite(rank) && rank > 0 ? rank : 1;
  }

  let ranks = 0;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "talent" || !matches(item)) continue;
    ranks += item.system?.ranks?.ranked ? Number(item.system.ranks.current) || 0 : 1;
  }
  return ranks;
}

/**
 * What the crit dialog opens with. Lethal Blows adds to Critical Injuries only, so it counts
 * for nothing against a vehicle's Critical Hit.
 * @param {object} params
 * @param {object|null} params.attacker - the actor who made the attack
 * @param {object} params.target - the actor taking the crit
 * @param {object[]} params.qualities - the weapon's rendered qualities (`{name, totalRanks}`)
 * @returns {{existingCrits: number, durableRanks: number, viciousRanks: number, lethalRanks: number}}
 */
export function planCritSeed({ attacker, target, qualities }) {
  let existingCrits = 0;
  for (const item of target?.items ?? []) {
    if (item?.type === "criticalinjury" || item?.type === "criticaldamage") existingCrits += 1;
  }

  let viciousRanks = 0;
  for (const quality of qualities ?? []) {
    if ((quality?.name || "").toLowerCase().includes("vicious")) viciousRanks += Number(quality?.totalRanks) || 0;
  }

  return {
    existingCrits,
    durableRanks: talentRanks(target, "Durable"),
    viciousRanks,
    lethalRanks: target?.type === "vehicle" ? 0 : talentRanks(attacker, "Lethal Blows"),
  };
}

/**
 * The crit roll's formula. Each part stays visible in it, so the chat card shows where the
 * total came from.
 * @param {object} parts
 * @param {number} parts.modifier - the dialog's modifier (existing crits × 10 to begin with)
 * @param {number} parts.durableRanks
 * @param {number} parts.viciousRanks
 * @param {number} parts.lethalRanks
 * @returns {string}
 */
export function critFormula({ modifier, durableRanks, viciousRanks, lethalRanks }) {
  return `max(1d100 + ${modifier} - ${durableRanks * 10} + ${viciousRanks * 10} + ${lethalRanks * 10}, 1)`;
}

/**
 * The table row a crit total lands on. Rows already drawn are skipped. A total above every row
 * lands on the top row (the book's "151+") and one below every row on the bottom row, where
 * Foundry's own draw would quietly roll again. A total in a gap between rows lands nowhere.
 * @param {object[]} results - the table's results (`{range: [low, high], drawn}`)
 * @param {number} total
 * @returns {object|null}
 */
export function pickCritResult(results, total) {
  const rows = [...(results ?? [])].filter((r) => !r?.drawn && Array.isArray(r?.range));
  if (rows.length === 0) return null;

  const hit = rows.find((r) => total >= r.range[0] && total <= r.range[1]);
  if (hit) return hit;

  const top = rows.reduce((a, b) => (b.range[1] > a.range[1] ? b : a));
  if (total > top.range[1]) return top;
  const bottom = rows.reduce((a, b) => (b.range[0] < a.range[0] ? b : a));
  if (total < bottom.range[0]) return bottom;
  return null;
}

/**
 * The item a table row adds, as a UUID that resolves in the world or in a compendium.
 * A text row adds none.
 * @param {object} result - a TableResult
 * @returns {string|null}
 */
export function critResultItemUuid(result) {
  if (result?.type !== "document") return null;
  return result.documentUuid || null;
}

/**
 * Who sees what the crit posts: the same users as the attack it came from. A whispered attack
 * is also seen by its author, so the crit is whispered to them too unless the attack was blind.
 * `messageMode` is the V14 mode that keeps those `whisper` and `blind` values as they are.
 * @param {object} message - the attack's ChatMessage
 * @returns {{messageMode: string, whisper: string[], blind: boolean}}
 */
export function visibilityOf(message) {
  const whisper = [...(message?.whisper ?? [])];
  const blind = message?.blind === true;
  const authorId = message?.author?.id ?? message?.author;
  if (whisper.length > 0 && !blind && typeof authorId === "string" && !whisper.includes(authorId)) {
    whisper.push(authorId);
  }
  const messageMode = blind ? "blind" : whisper.length > 0 ? "gm" : "public";
  return { messageMode, whisper, blind };
}
