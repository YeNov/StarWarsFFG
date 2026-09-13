/**
 * Which items a vehicle may hold.
 *
 * A vehicle has no characteristics, skills, career or XP, so the item types that only
 * mean something on a character are refused when one is added to it. A talent is not
 * inert either: its modifiers become Active Effects on whatever owns it, and those
 * point at character data a vehicle does not have.
 *
 * The Adversary talent is the one exception, so that attacks against a named ship can
 * be upgraded the way attacks against an NPC are. The roll dialog and the token badge
 * find it on any actor by the name in the `adversaryItemName` setting, matched exactly,
 * so it is matched exactly here too: a talent a vehicle accepts is always one they count.
 *
 * Pure and dependency-free (no imports, no `game`, no DOM) so it can be unit tested
 * headlessly, the same contract `vehicle-defence.js` keeps.
 */

/** Item types that belong to characters and never to vehicles. */
const CHARACTER_ONLY_TYPES = ["career", "forcepower", "talent", "signatureability", "specialization", "species", "ability"];

/**
 * Why a vehicle refuses an item, or `null` when it may hold it.
 *
 * @param {{type: string, name: string}} item  The item being added to the vehicle.
 * @param {string} adversaryItemName           The `adversaryItemName` setting.
 * @returns {"characterOnly"|"notAdversary"|null}
 *   `characterOnly` for a character-only type, `notAdversary` for a talent other than
 *   Adversary, `null` when the vehicle may hold the item.
 */
export function vehicleItemRefusal(item, adversaryItemName) {
  const type = String(item?.type);
  if (!CHARACTER_ONLY_TYPES.includes(type)) return null;
  if (type !== "talent") return "characterOnly";
  return item.name === adversaryItemName ? null : "notAdversary";
}
