/**
 * Codex II settings: each user's sheet theme, the GM's default theme for the table, the Codex house
 * rules, and the Configure Codex menu that edits them (with the system's vehicleCritWeeklyLimit).
 * Codex registers them itself, under the system's namespace, so the values stored while Codex was
 * part of the system keep working and the menu stays under Star Wars FFG in Configure Settings.
 */
import { systemApi } from "./system-api.js";
import { FOLLOW_GM_SHEET_THEME } from "./sheet-theme.js";

const { ffgSettings } = systemApi.apps;

/** The settings Configure Codex shows, in this order. */
const CODEX_MENU_SETTINGS = [
  "starwarsffg.gmDefaultSheetTheme",
  "starwarsffg.defaultSheetTheme",
  "starwarsffg.codexAdvantageHealsStrain",
  "starwarsffg.codexTalentTierSorting",
  "starwarsffg.vehicleCritWeeklyLimit",
];

class codexSettings extends ffgSettings {
  static DEFAULT_OPTIONS = {
    id: "codex-settings",
    classes: ["starwarsffg", "codex-settings"],
    window: { title: "SWFFG.Settings.codex.Title" },
  };

  static PARTS = {
    content: { root: true, template: "systems/starwarsffg/templates/dialogs/ffg-ui-settings.html" },
  };

  async _prepareContext(_options) {
    const context = this._buildSettingsContext(CODEX_MENU_SETTINGS);
    // The system registers vehicleCritWeeklyLimit before Codex registers the rest, so order the
    // rows by the list rather than by registration.
    context.data.system.settings.sort((a, b) => CODEX_MENU_SETTINGS.indexOf(a.id) - CODEX_MENU_SETTINGS.indexOf(b.id));
    return context;
  }
}

/** Register the Codex settings and the Configure Codex menu. Call during init. */
export function registerCodexSettings() {
  // Not GM-restricted: the menu holds the per-client Default Sheet Theme, which every user sets
  // for themselves. World-scoped (GM-only) settings inside it — e.g. the strain house rule — are
  // filtered out for non-GMs in _buildSettingsContext, so players see only what they can change.
  game.settings.registerMenu("starwarsffg", "codexSettings", {
    name: game.i18n.localize("SWFFG.Settings.codex.Name"),
    hint: game.i18n.localize("SWFFG.Settings.codex.Hint"),
    label: game.i18n.localize("SWFFG.Settings.codex.Label"),
    icon: "fa-solid fa-book-sparkles",
    type: codexSettings,
    restricted: false,
  });

  // The sheet themes a user or the GM can pick. The value is `codex-<scheme>` for Codex, so one
  // selector sets both the sheet style and the default Codex colour scheme.
  const sheetThemes = {
    default: "Default (system sheets)",
    "codex-republic": "Codex II — Republic",
    "codex-empire": "Codex II — Empire",
    "codex-dark": "Codex II — Dark",
    "codex-light": "Codex II — Light",
    "codex-mercenary": "Codex II — Mercenary",
    "codex-eldritch-scholar": "Codex II — Eldritch Horror - Scholar",
    "codex-eldritch-fate": "Codex II — Eldritch Horror - Fate",
  };

  // The GM's default sheet theme for the table: what every user gets while their own Default
  // Sheet Theme (below) is on "Use the GM's default", the value each browser starts with.
  // A change reloads only the browsers that follow it.
  game.settings.register("starwarsffg", "gmDefaultSheetTheme", {
    name: "GM's Default Sheet Theme",
    hint: "The sheet style (and Codex II colour scheme) for everyone whose own Default Sheet Theme is Use the GM's default, which is what every user starts with. A user who picked their own keeps it. Reloads their browsers on change.",
    scope: "world",
    config: false,
    default: "default",
    type: String,
    choices: sheetThemes,
    onChange: () => {
      if (game.settings.get("starwarsffg", "defaultSheetTheme") === FOLLOW_GM_SHEET_THEME) foundry.utils.debouncedReload();
    },
  });

  // Default sheet theme — client-scoped (per world, local to each user). Picks which sheet style
  // new/unconfigured documents open with, and the default Codex colour scheme. Starts on
  // FOLLOW_GM_SHEET_THEME, which defers to the GM's setting above. Documents with an explicit
  // per-document sheet (the ⚙ Sheet button, flags.core.sheetClass) or scheme flag keep their own
  // choice. Resolved through effectiveSheetTheme() in the Codex sheet resolver and cdxDefaultScheme.
  game.settings.register("starwarsffg", "defaultSheetTheme", {
    name: "Default Sheet Theme",
    hint: "Which sheet style (and Codex II colour scheme) to use by default. Stored locally per client; Use the GM's default follows the GM's choice. Documents with an explicitly chosen sheet/scheme keep that choice. Reloads on change.",
    scope: "client",
    config: false,
    default: FOLLOW_GM_SHEET_THEME,
    type: String,
    choices: {
      [FOLLOW_GM_SHEET_THEME]: "Use the GM's default",
      ...sheetThemes,
    },
    onChange: foundry.utils.debouncedReload,
  });

  // Codex house rule: whether advantages recover strain during Post-Encounter strain recovery
  // (every 2 advantages = 1 strain). On by default. Read by the codex sheet's
  // _cdxApplyStrainRecovery.
  game.settings.register("starwarsffg", "codexAdvantageHealsStrain", {
    name: game.i18n.localize("SWFFG.Settings.codex.AdvantageHealsStrain.Name"),
    hint: game.i18n.localize("SWFFG.Settings.codex.AdvantageHealsStrain.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
  });

  // Codex talents tab: group the talent cards under "Tier N" headings instead of one flat list.
  // On by default. Read by the codex sheet's _prepareContext; open sheets redraw on a change from
  // the setting hook in integrations.js.
  game.settings.register("starwarsffg", "codexTalentTierSorting", {
    name: game.i18n.localize("SWFFG.Settings.codex.TalentTierSorting.Name"),
    hint: game.i18n.localize("SWFFG.Settings.codex.TalentTierSorting.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
  });
}

/**
 * Self-heal a stale `defaultSheetTheme` client value. Call at ready.
 *
 * The setting originally offered a bare "codex" option; the scheme-fold replaced it with
 * per-scheme keys ("codex-<scheme>") and dropped "codex" from the choices. A client left on the
 * legacy "codex" (or any value no longer in the choices) still routes to the Codex sheet
 * (startsWith("codex")), yet the settings dropdown can't render the missing value — so it shows
 * "Default (system sheets)" as selected while sheets still open as Codex II, and re-picking
 * Default fires no change. Reset any out-of-choices value to the setting's default ("Use the GM's
 * default") so the effective sheet and the dropdown agree. Runs once: after the reset the value is
 * a valid choice.
 */
export async function healStaleThemeChoice() {
  try {
    const cfg = game.settings.settings.get("starwarsffg.defaultSheetTheme");
    const current = game.settings.get("starwarsffg", "defaultSheetTheme");
    if (cfg?.choices && !(current in cfg.choices)) {
      await game.settings.set("starwarsffg", "defaultSheetTheme", cfg.default);
    }
  } catch (err) {
    CONFIG.logger?.warn?.("defaultSheetTheme normalization skipped", err);
  }
}
