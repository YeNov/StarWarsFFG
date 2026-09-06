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

/**
 * What should happen when `ranks` ranks are taken back off a talent -- an XP refund,
 * or a species that granted it being removed.
 *
 * @param {object} talent  the talent item
 * @param {number} [ranks=1]  how many ranks the grantor is taking back
 * @returns {{action: "decrement", total: number}|{action: "delete"}}
 */
export function planTalentRevoke(talent, ranks = 1) {
  if (!talent?.system?.ranks?.ranked) return { action: "delete" };
  const take = Math.max(1, Math.trunc(Number(ranks) || 1));
  const total = talentRanks(talent) - take;
  return total > 0 ? { action: "decrement", total } : { action: "delete" };
}

/** Group talent items by trimmed name, preserving the order they were given in. */
export function groupTalentsByName(talents) {
  const groups = new Map();
  for (const talent of (talents ?? [])) {
    const name = talentName(talent?.name);
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(talent);
  }
  return groups;
}

/** Creation timestamp used to pick the copy to keep; absent stats sort last-stable. */
function createdTime(item) {
  const time = Number(item?._stats?.createdTime);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * Stable comparison payload for deciding whether deleting copies is lossless.
 * Identity, ordering, rank, tier and the provenance totals are deliberately
 * excluded because the repair chooses or combines those fields. Everything else
 * (including descriptions, modifiers, effects and non-provenance flags) must agree.
 */
function repairPayload(item) {
  const source = typeof item?.toObject === "function" ? item.toObject() : item;
  const clone = JSON.parse(JSON.stringify(source ?? {}));
  clone.name = talentName(clone.name);
  for (const key of ["_id", "id", "_stats", "folder", "sort", "ownership"]) delete clone[key];
  if (clone.system?.ranks) delete clone.system.ranks.current;
  if (clone.system) delete clone.system.tier;
  if (clone.flags?.starwarsffg) {
    delete clone.flags.starwarsffg.grantedRanks;
    if (!Object.keys(clone.flags.starwarsffg).length) delete clone.flags.starwarsffg;
  }
  if (clone.flags && !Object.keys(clone.flags).length) delete clone.flags;
  return stableStringify(clone);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * How to merge a group of same-named talent items into one.
 *
 * @param {object[]} talents  every copy of one talent on an actor
 * @returns {null
 *          |{action: "skip", reason: "not-ranked"|"conflicting-data"}
 *          |{action: "merge", keepId: string|null, rank: number, tier: number,
 *            grantedRanks: Record<string, number>, deleteIds: Array<string|null>}}
 */
export function planDuplicateRepair(talents) {
  const copies = (talents ?? []).filter(Boolean);
  if (copies.length < 2) return null;
  // Summing ranks onto a talent that has none would invent data; report instead.
  if (copies.some((t) => !t.system?.ranks?.ranked)) return { action: "skip", reason: "not-ranked" };
  // Deleting a copy is safe only when rank/tier/provenance are the sole differences.
  // A description, modifier, effect or other flag that drifted must be resolved by a
  // GM rather than silently discarded by the automatic repair.
  const payload = repairPayload(copies[0]);
  if (copies.some((copy) => repairPayload(copy) !== payload)) {
    return { action: "skip", reason: "conflicting-data" };
  }

  // Stable sort: equal (or absent) timestamps keep the given order, so the first
  // copy the actor lists is the one kept.
  const ordered = copies
    .map((talent, index) => ({ talent, index }))
    .sort((a, b) => (createdTime(a.talent) - createdTime(b.talent)) || (a.index - b.index))
    .map((entry) => entry.talent);

  const grantedRanks = {};
  let rank = 0;
  let tier = 0;
  for (const copy of ordered) {
    rank += talentRanks(copy);
    const copyTier = Number.parseInt(copy?.system?.tier, 10);
    if (Number.isFinite(copyTier) && copyTier > tier) tier = copyTier;
    for (const [grantor, granted] of Object.entries(copy?.flags?.starwarsffg?.grantedRanks ?? {})) {
      const amount = Number(granted);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      grantedRanks[grantor] = (grantedRanks[grantor] ?? 0) + Math.trunc(amount);
    }
  }

  return {
    action: "merge",
    keepId: talentId(ordered[0]),
    rank,
    tier: tier > 0 ? tier : 1,
    grantedRanks,
    deleteIds: ordered.slice(1).map(talentId),
  };
}
