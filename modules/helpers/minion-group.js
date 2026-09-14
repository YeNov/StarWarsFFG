/**
 * Minion group rules, shared by minion actors and by vehicles with the Minion Vehicle Sheet
 * Option on (a squadron of identical, minion-crewed craft).
 *
 * A group has a size and a per-unit threshold, and one combined damage track. A unit is lost
 * each time the damage EXCEEDS another per-unit threshold -- the track is 1-indexed, so a group
 * of 4 with 6 per unit loses its first unit at 7 damage, not 6. Group skills rank at units
 * left - 1, capped at 5.
 *
 * Pure: no Foundry globals, so the rules are tested in Node.
 */

/** A per-unit hull at or above this draws one bar per vehicle rather than pips, the cutoff `_cdxTrack` uses. */
export const HULL_PIP_LIMIT = 20;

const toCount = (value) => Math.max(0, Math.trunc(Number(value) || 0));

/** The whole group's threshold. */
export function groupThreshold(perUnit, size) {
  return toCount(perUnit) * toCount(size);
}

/** Units still standing. A per-unit threshold of 0 leaves the whole group up until any damage lands. */
export function unitsLeft(damage, perUnit, size) {
  const units = toCount(size);
  const taken = toCount(damage);
  const unit = toCount(perUnit);
  if (unit === 0) return taken > 0 ? 0 : units;
  return Math.max(0, Math.min(units, units - Math.floor((taken - 1) / unit)));
}

/** A group skill's rank for a group with `left` units standing. */
export function groupSkillRank(left) {
  return Math.max(0, Math.min(5, toCount(left) - 1));
}

/**
 * The damage after destroying (`dir` -1) or reviving (`dir` +1) one unit. The current damage is
 * split into lost units plus partial damage on the next unit; the lost count moves by one and the
 * SAME partial is re-attached, so a hit already sitting on the next unit survives the step. From a
 * clean group that costs per-unit + 1, afterwards exactly per-unit. Clamped to one past the
 * group threshold, which is the whole group lost.
 */
export function stepUnits(damage, perUnit, size, dir) {
  const unit = Math.max(1, toCount(perUnit));
  const units = toCount(size);
  const current = toCount(damage);
  const ceiling = units * unit + 1;
  const lost = current >= 1 ? Math.floor((current - 1) / unit) : 0;
  const partial = current >= 1 ? (current - 1) - lost * unit : 0;
  const targetLost = Math.max(0, Math.min(units, lost - Math.sign(Number(dir) || 0)));
  if (targetLost === 0 && partial === 0) return 0;
  return Math.max(0, Math.min(ceiling, targetLost * unit + partial + 1));
}

/** The damage that leaves no unit standing. */
export function wipeOutDamage(perUnit, size) {
  return groupThreshold(perUnit, size) + 1;
}

/**
 * The Codex Combined Hull Pool track: one entry per vehicle, filled left to right. A small
 * per-vehicle hull is a row of pips like the minion wound pool; a large one is a single bar,
 * since 30 pips per ship would not fit.
 */
export function hullPoolSegments(damage, perUnit, size) {
  const unit = toCount(perUnit);
  const taken = toCount(damage);
  const segments = [];
  for (let index = 0; index < toCount(size); index++) {
    const filled = Math.max(0, Math.min(unit, taken - index * unit));
    segments.push(unit < HULL_PIP_LIMIT
      ? { bar: false, pips: Array.from({ length: unit }, (_, pip) => pip < filled) }
      : { bar: true, pct: Math.round((filled / unit) * 100) });
  }
  return segments;
}

/**
 * Pool a minion vehicle group's hull in PREPARED data. The stored threshold is per vehicle (what
 * stat blocks and importers write, plus any hull-threshold Active Effects by now); it is kept as
 * `hullTrauma.unit` and `hullTrauma.max` becomes the whole group's, so the token bar, the
 * over-threshold figure and both sheets read the pool. Re-running on the same object keeps `unit`
 * rather than multiplying the pooled max again.
 */
export function prepareMinionVehicleHull(system) {
  const hull = system?.stats?.hullTrauma;
  const quantity = system?.quantity;
  if (!hull || !quantity) return;
  const perUnit = hull.unit ?? hull.max;
  hull.unit = perUnit;
  hull.max = groupThreshold(perUnit, quantity.max);
  quantity.value = unitsLeft(hull.value, perUnit, quantity.max);
}

/** A vehicle whose Sheet Options tick Minion Vehicle. */
export function isMinionVehicle(actor) {
  return actor?.type === "vehicle" && actor?.flags?.starwarsffg?.config?.minionVehicle === true;
}

/**
 * Where a group's combined damage lives and what it is measured against: a minion's wounds by
 * `unit_wounds`, a minion vehicle's hull trauma by its per-vehicle threshold. `null` for anything
 * that is not a group.
 */
export function groupTrack(actor) {
  const system = actor?.system;
  if (actor?.type === "minion") {
    return {
      path: "system.stats.wounds.value",
      damage: toCount(system?.stats?.wounds?.value),
      perUnit: toCount(system?.unit_wounds?.value),
      size: toCount(system?.quantity?.max),
    };
  }
  if (isMinionVehicle(actor)) {
    const hull = system?.stats?.hullTrauma;
    return {
      path: "system.stats.hullTrauma.value",
      // Prepared data keeps the per-vehicle threshold as `unit`; unprepared data still has it in `max`.
      damage: toCount(hull?.value),
      perUnit: toCount(hull?.unit ?? hull?.max),
      size: toCount(system?.quantity?.max),
    };
  }
  return null;
}

/**
 * Options for `get_dice_pool` when a crew member rolls for a vehicle. A minion vehicle group ranks
 * the crew's group skills by ITS vehicles left, read from the actor given -- the sheet's own actor,
 * which is the token actor on an unlinked squadron -- never from a lookup by id.
 */
export function crewRollOptions(vehicleActor) {
  if (!isMinionVehicle(vehicleActor)) return {};
  return { groupSkillRank: groupSkillRank(vehicleActor.system?.quantity?.value) };
}

/** A skill's rank for a roll: the group rank for a group skill when one is given, its own otherwise. */
export function effectiveSkillRank(skill, options = {}) {
  if (skill?.groupskill && Number.isFinite(options?.groupSkillRank)) return options.groupSkillRank;
  return Number(skill?.rank) || 0;
}

/**
 * A copy of a crew actor's system data with its group skills at the group rank, for code that
 * reads skill ranks straight off system data (combat initiative). The crew actor's own prepared
 * data is never modified.
 */
export function withGroupSkillRanks(system, options = {}) {
  if (!system?.skills || !Number.isFinite(options?.groupSkillRank)) return system;
  const skills = {};
  for (const [key, skill] of Object.entries(system.skills)) {
    skills[key] = skill?.groupskill ? { ...skill, rank: options.groupSkillRank } : skill;
  }
  return { ...system, skills };
}

/** Read a path from update data whose keys may be nested, dotted, or a mix of both. */
function readUpdateValue(changes, path) {
  const parts = path.split(".");
  let node = changes;
  for (let index = 0; index < parts.length; index++) {
    if (node === null || typeof node !== "object") return undefined;
    const rest = parts.slice(index).join(".");
    if (Object.hasOwn(node, rest)) return node[rest];
    node = node[parts[index]];
  }
  return node;
}

/**
 * The prototype token change that goes with switching Minion Vehicle on a world vehicle: unlinked
 * while it is a group, like a minion, so each token placed is its own squadron; linked again when
 * it is not. Sheet Options writes every option on each Accept, so only an actual change counts. A
 * token actor has no prototype token of its own to change.
 */
export function prototypeLinkUpdate(actor, changes) {
  if (actor?.type !== "vehicle" || actor?.isToken) return null;
  const next = readUpdateValue(changes, "flags.starwarsffg.config.minionVehicle");
  if (typeof next !== "boolean" || next === isMinionVehicle(actor)) return null;
  return { actorLink: !next };
}
