/**
 * Vehicle defence zones.
 *
 * A vehicle's defence is not one number. Each zone (`system.stats.shields.<zone>`)
 * carries its own value, and an attack resolves against exactly one of them --
 * the zone the attacker is shooting into. Nothing here ever aggregates the zones:
 * there is no "ship defence" stat in the rules, so a max or an average would be
 * inventing one.
 *
 * The zone SET always comes from the actor's own prepared data. `stats.shields` is
 * a SchemaField, so the prepared object contains exactly the declared fields --
 * today `fore, port, starboard, aft, label`. If the data model later drops to two
 * zones or gains a fifth, everything here follows with no code change.
 *
 * Pure and dependency-free (no imports, no `game`, no DOM) so it can be unit tested
 * headlessly, the same contract `vehicle-hardpoints.js` keeps.
 */

/**
 * Where zones SIT, never which zones exist.
 *
 * Stored order is fore, port, starboard, aft; laying wedges out in that order puts
 * port on the right and starboard at the bottom. This table sorts whatever zones
 * the data supplied so the arrangement makes nautical sense. Unrecognised keys are
 * appended in their stored order. This is the one place a list of zone names
 * appears, and it is deliberate.
 */
export const ZONE_ORDER = ["fore", "starboard", "aft", "port"];

/**
 * A vehicle's defence zones, ordered for display.
 * @param {object} actor a prepared vehicle Actor (or any object with `system.stats.shields`).
 * @returns {Array<{key: string, value: number}>} empty for missing or malformed data.
 */
export function vehicleDefenceZones(actor) {
  const shields = actor?.system?.stats?.shields;
  if (!shields || typeof shields !== "object") return [];

  // Type, not name: `label` is a StringField and every zone is a NumberField, so
  // this separates them structurally. Testing the key would hardcode the zone set,
  // and Number("") === 0 would let an empty label masquerade as a zone.
  const zones = [];
  for (const [key, value] of Object.entries(shields)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    zones.push({ key, value });
  }

  const rank = (key) => {
    const index = ZONE_ORDER.indexOf(key);
    return index === -1 ? ZONE_ORDER.length : index;
  };
  // The index tiebreak keeps unknown keys in stored order rather than relying on
  // sort stability.
  return zones
    .map((zone, index) => ({ zone, index }))
    .sort((a, b) => rank(a.zone.key) - rank(b.zone.key) || a.index - b.index)
    .map((entry) => entry.zone);
}

/**
 * Which vehicle, if any, this roll resolves against.
 *
 * Only a SINGLE vehicle target is supported. Two ships lit up at once is genuinely
 * ambiguous -- the attacker may be fore of one and aft of the other -- so rather
 * than guess or silently contribute nothing, the caller is told to say so on screen.
 *
 * A vehicle whose shields yield no zones takes the `none` path, because there is
 * nothing to pick and a reticle with no wedges would be a dead control.
 *
 * @param {Iterable<object>|null|undefined} targets `game.user.targets`, or any iterable of Tokens.
 * @returns {{status: "none"|"single"|"ambiguous", actor: object|null, zones: Array<{key: string, value: number}>}}
 */
export function resolveDefenceTarget(targets) {
  const none = { status: "none", actor: null, zones: [] };
  if (!targets) return none;

  const vehicles = [];
  for (const token of targets) {
    if (token?.actor?.type === "vehicle") vehicles.push(token.actor);
  }
  if (vehicles.length === 0) return none;
  if (vehicles.length > 1) return { status: "ambiguous", actor: null, zones: [] };

  const actor = vehicles[0];
  const zones = vehicleDefenceZones(actor);
  if (zones.length === 0) return none;
  return { status: "single", actor, zones };
}
