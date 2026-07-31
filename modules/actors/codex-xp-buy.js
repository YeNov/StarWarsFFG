const CODEX_ALWAYS_XP_BUY_TYPES = new Set(["rival", "nemesis", "minion", "vehicle"]);

/**
 * Resolve whether Codex purchase/management affordances should be active.
 *
 * Characters retain their transient XP-chip toggle. Other Codex actor types
 * have no XP chip, so their mode is always active unless Edit Mode is blocking
 * the underlying purchase and delete handlers.
 */
export function codexXpBuyActive(actorType, editMode, transientMode) {
  if (editMode) return false;
  if (CODEX_ALWAYS_XP_BUY_TYPES.has(actorType)) return true;
  return actorType === "character" && !!transientMode;
}
