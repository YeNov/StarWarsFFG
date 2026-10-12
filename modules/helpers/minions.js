import { groupTrack, isMinionVehicle, stepUnits, wipeOutDamage } from "./minion-group.js";

/**
 * The update that takes one member out of a group: a minion from a minion group, a vehicle from a
 * minion vehicle group. The group's damage moves one member along its track (`stepUnits`), so any
 * partial damage already on the next member is kept. `null` when there is nothing to destroy: not
 * a group, no per-member threshold, or no member left.
 */
export function getKillMinionUpdate(actor) {
  const track = groupTrack(actor);
  if (!track || track.perUnit <= 0) return null;
  const next = stepUnits(track.damage, track.perUnit, track.size, -1);
  return next === track.damage ? null : { [track.path]: next };
}

export function getKillMinionGroupUpdate(actor) {
  if (isMinionVehicle(actor)) {
    const track = groupTrack(actor);
    return { [track.path]: wipeOutDamage(track.perUnit, track.size) };
  }

  const maxWounds = Number(actor?.system?.stats?.wounds?.max) || 0;
  return { "system.stats.wounds.value": maxWounds + 1 };
}

export async function killMinion(actor) {
  const update = getKillMinionUpdate(actor);
  if (!update) return false;
  await actor.update(update);
  return true;
}

export async function killMinionGroup(actor) {
  await actor.update(getKillMinionGroupUpdate(actor));
  return true;
}
