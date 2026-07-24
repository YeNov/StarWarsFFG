/**
 * Limited-ammo helpers shared by the roll gate (dice-helpers), the ammo
 * consumption step (roll-builder), the item sheets, and getItemProperties.
 *
 * Two modes, selected by the world setting `useLimitedAmmoQuality`:
 *
 *   - Option A (setting OFF, the default): a manual magazine. Ammo tracking is
 *     opt-in per item via the `config.enableAmmo` flag; `max`/`value` are the
 *     numbers the user typed on the sheet. Applies to `weapon` and `shipweapon`.
 *
 *   - Option B (setting ON): ammo is driven by the "Limited Ammo" weapon
 *     quality. Any weapon/shipweapon that carries the quality is tracked
 *     automatically (the per-item toggle is ignored); `max` is the quality's
 *     rank. Weapons without the quality have unlimited ammo (no gate).
 */

/** Item types that can track ammo. */
const AMMO_TYPES = new Set(["weapon", "shipweapon"]);

/** Canonical name of the quality that drives Option B (matched case-insensitively). */
export const LIMITED_AMMO_QUALITY = "limited ammo";

/**
 * True when the world is in quality-driven (Option B) mode. Defaults to false
 * if the setting is not registered yet or `game` is unavailable.
 */
export function isQualityAmmoMode() {
  try {
    return !!game.settings.get("starwarsffg", "useLimitedAmmoQuality");
  } catch (err) {
    return false;
  }
}

/**
 * Rank of the "Limited Ammo" quality on this item, or null when the item does
 * not carry it. Ranks from multiple copies of the quality are summed, matching
 * how FFG stacks Limited Ammo from a base weapon plus attachments/qualities.
 */
export function getLimitedAmmoRank(item) {
  const mods = item?.system?.itemmodifier;
  if (!Array.isArray(mods)) return null;
  let rank = null;
  for (const mod of mods) {
    const name = String(mod?.name ?? "").trim().toLowerCase();
    if (name !== LIMITED_AMMO_QUALITY) continue;
    const modRank = parseInt(mod?.system?.rank, 10);
    rank = (rank ?? 0) + (Number.isFinite(modRank) ? modRank : 0);
  }
  return rank;
}

/**
 * Whether ammo is being tracked for this item under the active mode. Returns
 * false for non-weapon types.
 */
export function isAmmoTracked(item) {
  if (!AMMO_TYPES.has(item?.type)) return false;
  if (isQualityAmmoMode()) {
    return getLimitedAmmoRank(item) !== null;
  }
  return !!item.getFlag?.("starwarsffg", "config.enableAmmo");
}

/**
 * Magazine size for this item under the active mode. In quality mode this is
 * the "Limited Ammo" rank; otherwise the manually-entered `ammo.max`.
 */
export function getAmmoMax(item) {
  if (isQualityAmmoMode()) {
    return getLimitedAmmoRank(item) ?? 0;
  }
  const max = parseInt(item?.system?.ammo?.max, 10);
  return Number.isFinite(max) ? max : 0;
}

/** Current rounds remaining. */
export function getAmmoValue(item) {
  const value = parseInt(item?.system?.ammo?.value, 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Whether the item can currently fire: either it does not track ammo, or it
 * still has at least one round.
 */
export function hasAmmoToFire(item) {
  if (!isAmmoTracked(item)) return true;
  return getAmmoValue(item) > 0;
}
