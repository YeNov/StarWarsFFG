/**
 * Codex II — entry point. Loaded as its own script after the Star Wars FFG system's.
 */
import { systemApi } from "./system-api.js";   // keep first: it stops Codex starting on an incompatible system
import { CODEX_PACKAGE_ID } from "./codex-paths.js";
import { CodexActorSheet, CodexAdversarySheet } from "./codex-sheets.js";
import { CodexItemSheet } from "./codex-item-sheet.js";
import { codexQuantityLabel } from "./codex-quantity.js";
import { effectiveSheetTheme } from "./sheet-theme.js";
import { healStaleThemeChoice, registerCodexSettings } from "./settings.js";
import { registerCodexIntegrations } from "./integrations.js";

export const CODEX_ACTOR_TYPES = ["character", "rival", "nemesis", "minion", "vehicle"];

// Types left out keep the stock sheet: career, itemmodifier and species.
export const CODEX_ITEM_TYPES = [
  "weapon", "armour", "gear", "talent", "forcepower", "specialization", "signatureability", "shipweapon",
  "itemattachment", "ability", "criticalinjury", "criticaldamage", "obligation", "motivation", "background",
  "shipattachment", "homesteadupgrade",
];

Hooks.once("init", () => {
  registerCodexSettings();

  // Scope "ffg", not this package's id: worlds store a chosen sheet as "ffg.CodexActorSheet",
  // "ffg.CodexAdversarySheet" or "ffg.CodexItemSheet", and the id is `${scope}.${class name}`.
  // Codex never takes makeDefault: the stock sheets stay the default.
  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("ffg", CodexActorSheet, { types: CODEX_ACTOR_TYPES, label: "Codex II Sheet" });
  Actors.registerSheet("ffg", CodexAdversarySheet, { types: ["character"], label: "Codex II Adversary Sheet" });
  Items.registerSheet("ffg", CodexItemSheet, { types: CODEX_ITEM_TYPES, label: "Codex II Item Sheet" });

  // Per-user default sheet: this user's sheet theme picks the Codex sheets for the types they cover.
  const sheetFor = { Actor: [CodexActorSheet, CODEX_ACTOR_TYPES], Item: [CodexItemSheet, CODEX_ITEM_TYPES] };
  systemApi.sheetResolvers.register(CODEX_PACKAGE_ID, (document) => {
    const [cls, types] = sheetFor[document.documentName] ?? [];
    return cls && types.includes(document.type) && effectiveSheetTheme().startsWith("codex") ? cls : null;
  });

  Handlebars.registerHelper("codexQuantity", codexQuantityLabel);
  registerCodexIntegrations();
});

Hooks.once("ready", healStaleThemeChoice);
