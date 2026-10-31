/**
 * Codex II — entry point. Loaded as its own script after the Star Wars FFG system's.
 */
import { systemApi } from "./system-api.js";   // keep first: it stops Codex starting on an incompatible system
import { CODEX_PACKAGE_ID, CODEX_ROOT, codexVersion } from "./codex-paths.js";
import { CodexActorSheet, CodexAdversarySheet } from "./codex-sheets.js";
import { CodexItemSheet } from "./codex-item-sheet.js";
import { codexQuantityLabel } from "./codex-quantity.js";
import { effectiveSheetTheme } from "./sheet-theme.js";
import { healStaleThemeChoice, registerCodexSettings } from "./settings.js";
import { registerCodexIntegrations } from "./integrations.js";

export const CODEX_ACTOR_TYPES = ["character", "rival", "nemesis", "minion", "vehicle", "homestead"];

// Types left out keep the stock sheet: career, itemmodifier and species.
export const CODEX_ITEM_TYPES = [
  "weapon", "armour", "gear", "talent", "forcepower", "specialization", "signatureability", "shipweapon",
  "itemattachment", "ability", "criticalinjury", "criticaldamage", "obligation", "motivation", "background",
  "shipattachment", "homesteadupgrade",
];

const CODEX_STYLESHEETS = ["cdx", "cdx-republic", "cdx-empire", "cdx-dark", "cdx-light", "cdx-mercenary", "cdx-eldritch"];

const CODEX_TEMPLATES = [
  "templates/actors/codex-character.html", "templates/actors/codex-minion.html", "templates/actors/codex-vehicle.html",
  "templates/actors/codex-homestead.html",
  "templates/items/codex-item.html", "templates/items/codex-gear.html", "templates/items/codex-weapon.html",
  "templates/items/codex-armour.html", "templates/items/codex-talent.html", "templates/items/codex-crit.html",
  "templates/items/codex-shipweapon.html", "templates/items/codex-itemattachment.html",
  "templates/items/codex-shipattachment.html", "templates/items/codex-forcepower.html",
  "templates/items/codex-specialization.html", "templates/items/codex-signatureability.html",
  "templates/parts/cdx-skills.html", "templates/parts/cdx-combat.html", "templates/parts/cdx-gear.html",
  "templates/parts/cdx-talents.html", "templates/parts/cdx-injuries.html", "templates/parts/cdx-ratio-chip.html",
];

/**
 * Append the Codex stylesheets as unlayered links. Called from init, which runs after the system
 * added its theme stylesheet (mandar.css): Codex must come after it to win equal-specificity
 * rules, and must not go through manifest `styles`, which Foundry puts in `@layer modules` --
 * below the unlayered theme whatever the specificity.
 */
function addCodexStylesheets() {
  const version = encodeURIComponent(codexVersion());
  for (const name of CODEX_STYLESHEETS) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.media = "all";
    link.href = `${CODEX_ROOT}/styles/${name}.css?v=${version}`;
    document.head.append(link);
  }
}

// Merge Codex's strings into the translation table: English first as the fallback, then the active
// language when it differs. While Codex ships inside the system nothing else loads codex/lang;
// the module lists lang/en.json in module.json instead and drops this hook.
Hooks.on("i18nInit", async () => {
  const langs = game.i18n.lang && game.i18n.lang !== "en" ? ["en", game.i18n.lang] : ["en"];
  for (const lang of langs) {
    try {
      const json = await foundry.utils.fetchJsonWithTimeout(`${CODEX_ROOT}/lang/${lang}.json`);
      foundry.utils.mergeObject(game.i18n.translations, foundry.utils.expandObject(json));
    } catch (err) {
      // Another language without a usable file of its own falls back to English; English is that
      // fallback, so a failure to load it is reported.
      if (lang === "en") console.error("Codex II | strings failed to load", err);
    }
  }
});

// The system's in-Foundry test runner (tests/ffg-tests.js) asks packages for their suites. The
// last argument is the run's harness: its fixture tracker, waits, and skip-with-reason.
Hooks.on("starwarsffg.functionalTests", (packageSuites) => {
  packageSuites.push({
    id: CODEX_PACKAGE_ID,
    register: async (suite, suiteInstance, Test, chai, harness) => {
      const { CodexBrowserTests } = await import("../tests/browser/index.js");
      CodexBrowserTests(suite, suiteInstance, Test, chai, harness);
    },
  });
});

Hooks.once("init", () => {
  addCodexStylesheets();
  foundry.applications.handlebars.loadTemplates(CODEX_TEMPLATES.map((path) => `${CODEX_ROOT}/${path}`))
    .catch((err) => console.error("Codex II | template preload failed", err));
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
