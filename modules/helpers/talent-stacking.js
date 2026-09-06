/**
 * Talents stack as ranks on one item, never as duplicate items.
 *
 * A ranked talent bought, dropped or granted more than once used to arrive as a
 * second embedded item with the same name. The sheets already merged those for
 * display (`ActorFFG#_prepareCharacterData` sums same-named ranked talents into one
 * `talentList` entry), so the duplication was invisible until the copies drifted
 * apart -- a tier edited on one copy, modifiers on another.
 *
 * Every decision about that lives here, with no Foundry globals, so it can be unit
 * tested and shared by the create path, the XP refund, the species grant/removal
 * hooks and the repair helper.
 *
 * A rank that is not a usable number counts as 1, never 0: `ranks.current` is a
 * nullable NumberField and a cleared Rank field persists `null`. This mirrors
 * `ModifierHelpers.rankMultiplier`, which is what scales a ranked talent's
 * modifiers -- and why merging is safe: one item at rank 2 grants exactly what two
 * items at rank 1 granted.
 *
 * @see docs/superpowers/specs/2026-09-06-talent-rank-merging-design.md
 */

/** Trimmed talent name, or "" when there is nothing usable to key on. */
export function talentName(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** Ranks held by a talent (document or create data). Always >= 1. */
export function talentRanks(item) {
  const rank = Number(item?.system?.ranks?.current);
  if (!Number.isFinite(rank) || rank < 1) return 1;
  return Math.trunc(rank);
}

/** The id of a talent, whether it is a document or plain create data. */
function talentId(item) {
  return item?.id ?? item?._id ?? null;
}

/**
 * What should happen when `incoming` is added to an actor that already holds
 * `existingTalents`.
 *
 * @param {object[]} existingTalents  the actor's talent items
 * @param {object} incoming           the talent being created
 * @returns {{action: "create"}
 *          |{action: "increment", itemId: string|null, ranks: number, total: number}
 *          |{action: "refuse", reason: "not-ranked", itemId: string|null}}
 */
export function planTalentGrant(existingTalents, incoming) {
  const name = talentName(incoming?.name);
  if (!name) return { action: "create" };

  const existing = (existingTalents ?? []).find((t) => talentName(t?.name) === name);
  if (!existing) return { action: "create" };

  // A talent with no ranks cannot be held twice; the caller reports this.
  if (!existing.system?.ranks?.ranked) {
    return { action: "refuse", reason: "not-ranked", itemId: talentId(existing) };
  }

  const ranks = talentRanks(incoming);
  return { action: "increment", itemId: talentId(existing), ranks, total: talentRanks(existing) + ranks };
}

/**
 * Fold same-named talents inside one create batch together. Two copies of a talent
 * the actor does NOT yet have would each see an actor without it, so this runs
 * before the per-item check.
 *
 * Returns a new array; entries it changes are copied, so the caller's data is never
 * mutated.
 *
 * @param {object[]} entries  item create data
 * @returns {object[]}
 */
export function collapseTalentBatch(entries) {
  const out = [];
  const seen = new Map(); // talent name -> index in `out`
  for (const entry of (entries ?? [])) {
    const name = entry?.type === "talent" ? talentName(entry?.name) : "";
    if (!name) {
      out.push(entry);
      continue;
    }
    const at = seen.get(name);
    if (at === undefined) {
      seen.set(name, out.length);
      out.push(entry);
      continue;
    }
    const kept = out[at];
    // A non-ranked talent cannot stack: drop the duplicate outright.
    if (!kept?.system?.ranks?.ranked) continue;
    out[at] = {
      ...kept,
      system: { ...kept.system, ranks: { ...kept.system.ranks, current: talentRanks(kept) + talentRanks(entry) } },
    };
  }
  return out;
}
