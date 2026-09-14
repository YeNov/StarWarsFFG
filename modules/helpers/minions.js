import { groupTrack, isMinionVehicle, stepUnits, wipeOutDamage } from "./minion-group.js";

export function getKillMinionUpdate(actor) {
  // A minion vehicle group loses one whole vehicle and keeps any partial hull damage on the next.
  if (isMinionVehicle(actor)) {
    const track = groupTrack(actor);
    if (track.perUnit <= 0) return null;
    const next = stepUnits(track.damage, track.perUnit, track.size, -1);
    return next === track.damage ? null : { [track.path]: next };
  }

  const minionHealth = Number(actor?.system?.unit_wounds?.value) || 0;
  if (minionHealth <= 0) return null;

  const currentHealth = Number(actor?.system?.stats?.wounds?.value) || 0;
  return { "system.stats.wounds.value": currentHealth + minionHealth + 1 };
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
