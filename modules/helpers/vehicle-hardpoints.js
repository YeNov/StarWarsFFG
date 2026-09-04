/**
 * Vehicle hard points: how many the installed attachments spend, and how many the
 * hull actually has.
 *
 * The stored stat is not a capacity. Every `shipattachment` carries an
 * `(inherent)` Active Effect that SUBTRACTS its hard-point cost from
 * `system.stats.customizationHardPoints.value` (see modifiers.js), so the value
 * a sheet reads is the REMAINING count -- that is how the stock sheet reports
 * free hard points, and it may legitimately go negative. Summing the
 * attachments' costs and pairing that total with the same, already-reduced value
 * charges every attachment twice: a 5-HP ship with 2 spent read 2/5, and adding
 * a 2-HP attachment made it 4/3 rather than 4/5.
 *
 * So the rating is reconstructed here: take the prepared value and give back
 * exactly what the attachments SPENT out of it -- every negative ADD on the path
 * from a `shipattachment`, whichever effect carries it. Anything that GRANTS hard
 * points is positive and is left in, so an attachment that adds capacity raises
 * the rating instead of being mistaken for part of its own cost. An attachment
 * whose effect never got its cost written (they are created zeroed and only
 * filled in when the item sheet is submitted) still spends its hard points
 * through `used`, so the pair stays consistent either way.
 *
 * Pure and dependency-free (no imports, no game/DOM access) so it can be unit
 * tested headlessly.
 */
export const HARDPOINT_PATH = "system.stats.customizationHardPoints.value";

const AE_MODE_ADD = 2; // CONST.ACTIVE_EFFECT_MODES.ADD, mirrored (see config/ffg-active-effect-modes.js)

function appliedEffectsOf(actor) {
  if (actor?.appliedEffects) return actor.appliedEffects;
  if (typeof actor?.allApplicableEffects === "function") {
    return [...actor.allApplicableEffects()].filter((e) => e.active);
  }
  return [];
}

/**
 * Read the hull rating from unprepared source data for a sheet error fallback. Unlike the
 * prepared value, this cannot include an attachment's Active Effect spend.
 * @param {object} actor
 * @returns {number}
 */
export function vehicleHardpointSourceRating(actor) {
  const rating = Number(actor?._source?.system?.stats?.customizationHardPoints?.value);
  return Number.isFinite(rating) ? rating : 0;
}

/**
 * Read a vehicle's four shield zone ratings from unprepared source data, for the same sheet
 * error fallback. These render as editable inputs in Edit Mode, so a fabricated zero would be
 * submitted straight back over the stored ratings.
 * @param {object} actor
 * @returns {{fore: number, aft: number, port: number, starboard: number}}
 */
export function vehicleShieldSourceRatings(actor) {
  const shields = actor?._source?.system?.stats?.shields ?? {};
  const ratings = {};
  for (const zone of ["fore", "aft", "port", "starboard"]) {
    const rating = Math.trunc(Number(shields[zone]));
    ratings[zone] = Number.isFinite(rating) ? rating : 0;
  }
  return ratings;
}

/**
 * @param {object} actor - a vehicle Actor (or any object with `items`,
 *   `appliedEffects` and prepared `system`).
 * @returns {{used: number, max: number}} hard points spent by attachments, and
 *   the hull's own hard-point rating.
 */
export function vehicleHardpoints(actor) {
  let used = 0;
  for (const item of actor?.items ?? []) {
    if (item?.type === "shipattachment") used += Number(item.system?.hardpoints?.value) || 0;
  }

  // `appliedEffects` is the set that actually reached the prepared data, so
  // disabled or suppressed effects are correctly left out of the give-back
  // (the actor-ffg.js spelling of the same filter is allApplicableEffects() +
  // effect.active, kept here as the fallback).
  let spent = 0;
  for (const effect of appliedEffectsOf(actor)) {
    if (effect?.parent?.type !== "shipattachment") continue;
    for (const change of effect.changes ?? []) {
      if (change?.key !== HARDPOINT_PATH) continue;
      if ((change.mode ?? AE_MODE_ADD) !== AE_MODE_ADD) continue;
      const value = Number(change.value) || 0;
      // Only a SPEND is given back. A cost is always written negative (modifiers.js writes
      // `hardpoints.value * -1`), a grant positive, so the sign is the structural signal --
      // unlike the effect's name, which the user can change in Foundry's own AE config and
      // which a cost authored as a modifier row never carries in the first place.
      if (value >= 0) continue;
      spent += value;
    }
  }

  const shown = Number(actor?.system?.stats?.customizationHardPoints?.value) || 0;
  return { used, max: shown - spent };
}
