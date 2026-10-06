/**
 * Which sheet theme this browser uses: "default" (the system sheets) or
 * "codex-<scheme>" (plus the legacy bare "codex").
 *
 * The client `defaultSheetTheme` setting is each user's own choice. Its default,
 * FOLLOW_GM_SHEET_THEME, defers to the GM's world `gmDefaultSheetTheme`, so the
 * GM decides what a table starts on and a player who picks a theme keeps it.
 */
export const FOLLOW_GM_SHEET_THEME = "gm";

export function effectiveSheetTheme() {
  try {
    const own = String(game.settings.get("starwarsffg", "defaultSheetTheme") ?? "");
    if (own && own !== FOLLOW_GM_SHEET_THEME) return own;
    return String(game.settings.get("starwarsffg", "gmDefaultSheetTheme") ?? "") || "default";
  } catch {
    // Settings not registered yet (early init).
    return "default";
  }
}
