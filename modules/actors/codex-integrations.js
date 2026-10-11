/**
 * Codex II's hooks into system windows it does not own. Open Codex sheets redraw when a setting
 * they show changes; the embedded item editor opened from a Codex item sheet takes its scheme; the
 * roll dialog for an actor on a Codex sheet gets the dark dice marker (its styles are the system's).
 */
import { CodexItemSheet } from "../items/codex-item-sheet.js";
import { cdxNormalizeScheme, cdxSchemeClasses, refreshOpenCodexSheets } from "./codex-sheets.js";

/**
 * World settings an open Codex sheet shows. World settings are Setting documents, so a change
 * fires createSetting (first write) or updateSetting on every client.
 */
const REDRAW_ON = new Set([
  "starwarsffg.campaignDay",
  "starwarsffg.vehicleCritWeeklyLimit",
  "starwarsffg.codexTalentTierSorting",
]);

/** Register the hooks. Call during init. */
export function registerCodexIntegrations() {
  const redraw = (setting) => {
    if (REDRAW_ON.has(setting.key)) refreshOpenCodexSheets();
  };
  Hooks.on("createSetting", redraw);
  Hooks.on("updateSetting", redraw);
  // Fires for itemEditor and its talentEditor / forcePowerEditor subclasses alike.
  Hooks.on("renderitemEditor", skinItemEditor);
  Hooks.on("renderRollBuilderFFG", markCodexDiceWindow);
}

/**
 * Skin the embedded item editor ONLY when its host item resolves to the Codex item sheet (a
 * stock-sheet weapon keeps the stock editor): `cdx` + `cdx-embed` on the window so the palette
 * vars resolve, and the host item's (or its actor's) scheme class on the content form.
 */
function skinItemEditor(app) {
  const host = app.data?.sourceObject;
  if (!app.element || host?._getSheetClass?.() !== CodexItemSheet) return;
  const stored = host.getFlag?.("starwarsffg", "scheme") ?? host.actor?.getFlag?.("starwarsffg", "scheme");
  app.element.classList.add("cdx", "cdx-embed");
  app.form?.classList?.add(...cdxSchemeClasses(cdxNormalizeScheme(stored) ?? "republic"));
}

/**
 * Give the roll dialog the dark dice treatment ONLY when the rolling actor uses a Codex sheet.
 * A dedicated marker (`.cdx-dice`), not `.cdx`, whose broad `.cdx form input,…button` rules would
 * restyle the stock dialog controls.
 */
function markCodexDiceWindow(app) {
  try {
    const rollActor = app.roll?.item?.actor
      ?? (app.roll?.data?.actor?._id ? game.actors.get(app.roll.data.actor._id) : null);
    const sheetClass = rollActor?.getFlag?.("core", "sheetClass") ?? "";
    const isCodex = sheetClass.includes("Codex")
      || (rollActor?._sheet?.constructor?.name ?? "").startsWith("Codex");
    app.element?.classList?.toggle("cdx-dice", !!isCodex);
  } catch (e) { /* on any detection error, leave the stock dialog styling */ }
}
