/**
 * Public API v1 also covers what the Codex II sheets inherit from the system's sheet classes, the
 * system partials their templates include and the system images they point at. Renaming any of
 * these breaks the module: bump PUBLIC_API_VERSION in modules/api/public-api.js and update the
 * module in the same change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SURFACE = {
  "modules/apps/ffg-document-sheet.js": [
    "_getLegacyRootClasses(", "_applyLegacyRootClasses(", "async _preRender(", "async _onRender(",
    "async _onSubmit(", "_scrollPreservationSelectors(", "_minDimensions(", "static VIEWER_CONTROLS",
    "get viewerControls(",
  ],
  "modules/apps/ffg-actor-sheet.js": ["_getHeaderControls(", 'Hooks.callAll("renderActorSheetV2"'],
  "modules/actors/actor-sheet-ffg.js": [
    "async getData(", "activateListeners(html)", "async _buyCore(", "async _buySkillRank(",
    "_createSkillColumns(", "async _itemDisplayDetails(", "async _itemDetailsElement(",
    "async _ffgConfirmDelete(", "static obligationTrackContext(", "this.sheetoptions = new ActorOptions(",
    "this._afterSkillDicePoolRendered?.(",
  ],
  "modules/helpers/sheet-sync.js": ["sheet._ffgPaintAmmo?.("],
  // The settings menu Codex's Configure Codex extends (Task 6 sorts the rows by entry id).
  "modules/settings/ui-settings.js": [
    "export class ffgSettings extends FFGFormApplication", "closeOnSubmit: true",
    "html.find(\"button[name='reset']\").click(this._onResetDefaults.bind(this));", "_onResetDefaults(event) {",
    "_buildSettingsContext(acceptableSettings) {", "const s = foundry.utils.duplicate(setting[1]);",
    "s.isCheckbox = ", "s.isSelect = ", "s.isRange = ", "s.isFilePicker = ",
    "system: {title: game.system.title, menus: [], settings: includeSettings}",
    "async _updateObject(event, formData) {",
  ],
  "modules/apps/ffg-form-application.js": ["handler: FFGFormApplication._formSubmitHandler,", "async _onSubmit("],
  "templates/dialogs/ffg-ui-settings.html": [
    "{{#each data.system.settings}}", "this.namespace", "this.key", 'name="reset"', 'class="filepicker"',
  ],
};

for (const [path, needles] of Object.entries(SURFACE)) {
  test(`${path} keeps the members public API v1 covers`, () => {
    const source = read(path);
    for (const needle of needles) assert.ok(source.includes(needle), `${path} no longer has ${needle}`);
  });
}

const SHARED_PARTIALS = [
  "templates/parts/shared/ffg-effects.html",
  "templates/parts/shared/ffg-modifiers.html",
  "templates/parts/shared/ffg-sources.html",
  "templates/parts/shared/ffg-tags.html",
  "templates/parts/ffg-mods.html",
  "templates/parts/ffg-attachments.html",
  "templates/items/dialogs/ffg-modification.html",
];

test("the system partials Codex templates include exist and are preloaded", () => {
  const preload = read("modules/helpers/partial-templates.js");
  for (const path of SHARED_PARTIALS) {
    assert.ok(fs.existsSync(new URL(`../../${path}`, import.meta.url)), `${path} is missing`);
    assert.ok(preload.includes(`"systems/starwarsffg/${path}"`), `${path} is not preloaded`);
  }
});

test("the templates Codex renders directly exist", () => {
  for (const path of ["templates/dialogs/ffg-ui-settings.html", "templates/dialogs/ffg-confirm-purchase.html"]) {
    assert.ok(fs.existsSync(new URL(`../../${path}`, import.meta.url)), `${path} is missing`);
  }
});

// Codex points at these as systems/starwarsffg/images/...: the purple difficulty die is its
// critical injury severity pip (vehicle sheet, injuries list, stylesheet), and generic-die.svg is
// the die its Eldritch scheme masks onto a hovered roll button.
const SHARED_IMAGES = [
  "images/dice/starwars/purple.png",
  "images/generic-die.svg",
];

test("the system images Codex points at exist", () => {
  for (const path of SHARED_IMAGES) {
    assert.ok(fs.existsSync(new URL(`../../${path}`, import.meta.url)), `${path} is missing`);
  }
});
