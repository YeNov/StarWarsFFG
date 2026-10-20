/**
 * The system's public API for optional packages (first user: the Codex II module).
 *
 * Published on `globalThis.starwarsffg` while swffg-main.js is evaluated, i.e. before any module
 * script runs, so a module can extend the system's sheet classes at its own top level. A module
 * must not import system files by path instead: a different URL loads a second copy of the
 * system code, with its own hooks and socket state.
 *
 * apiVersion is the contract number. Bump it, and update the Codex II module in the same change,
 * whenever a name in PUBLIC_API_SHAPE changes, or one of the members below changes its name,
 * arguments or meaning. Besides the names in PUBLIC_API_SHAPE, apiVersion 2 covers what the
 * Codex sheets inherit and override:
 *   FFGDocumentSheet: _getLegacyRootClasses, _applyLegacyRootClasses, _preRender, _onRender,
 *     _onSubmit, _scrollPreservationSelectors, _minDimensions, VIEWER_CONTROLS, viewerControls,
 *     and the V1 bridge (getData, activateListeners(html), the `template` getter);
 *   FFGActorSheet: _getHeaderControls, and the re-fired renderActorSheetV2 hook;
 *   ActorSheetFFG: _buyCore, _buySkillRank, _createSkillColumns, _itemDisplayDetails,
 *     _itemDetailsElement, _ffgConfirmDelete, sheetoptions, static obligationTrackContext,
 *     and the callbacks it invokes by name: _afterSkillDicePoolRendered, _ffgPaintAmmo;
 *   the system partials the Codex templates include;
 *   the settings menu Codex's Configure Codex extends:
 *     ffgSettings (settings/ui-settings.js): _buildSettingsContext(acceptableSettings) returns
 *       { data: { system: { title, menus, settings } } }; each settings entry is a copy of the
 *       setting's registered config (id, namespace, key, choices, range) plus name, hint, value,
 *       type, isCheckbox, isSelect, isRange, isFilePicker. _onRender wires the Reset and
 *       file-picker buttons, _onResetDefaults refills the form, _updateObject saves every
 *       changed setting, and the window closes on submit;
 *     FFGFormApplication: the form handler that feeds _onSubmit -> _updateObject;
 *     templates/dialogs/ffg-ui-settings.html: renders data.system.settings, names each input
 *       "<namespace>.<key>", and carries the Reset and file-picker buttons.
 * tests/node/public-api-surface.test.mjs pins those.
 */
// apiVersion 2 adds the optional buffs editor: the shared partial
// templates/parts/shared/ffg-optional-buffs.html, which Codex item templates include, and
// ItemSheetFFG#_activateOptionalBuffListeners / #_saveOptionalBuffs, which Codex item sheets
// inherit through activateListeners.
export const PUBLIC_API_VERSION = 2;

export const PUBLIC_API_SHAPE = Object.freeze({
  sheets: ["ActorSheetFFG", "AdversarySheetFFG", "ItemSheetFFG"],
  apps: ["FFGFormApplication", "ffgSettings"],
  helpers: [
    "DiceHelpers", "DicePoolFFG", "ActorHelpers",
    "killMinionGroup", "groupTrack", "hullPoolSegments", "stepUnits",
    "availFor", "applyCritRecoveryAttempt",
    "isAmmoTracked", "getAmmoMax", "getAmmoValue",
    "vehicleHardpoints", "vehicleHardpointSourceRating", "vehicleShieldSourceRatings", "vehicleDefenceZones",
    "adjustCodexStat", "bindStatStepPrediction", "predictedCodexStat",
  ],
  sheetResolvers: ["register", "has", "resolve"],
});

/**
 * Freeze the parts into the public API object. A missing or unlisted name throws, so the
 * published shape cannot drift from PUBLIC_API_SHAPE unnoticed.
 * @param {Record<string, Record<string, unknown>>} parts
 * @returns {Readonly<object>}
 */
export function buildPublicApi(parts) {
  const api = { apiVersion: PUBLIC_API_VERSION };
  for (const [group, names] of Object.entries(PUBLIC_API_SHAPE)) {
    const given = parts?.[group] ?? {};
    const extra = Object.keys(given).filter((name) => !names.includes(name));
    if (extra.length) throw new Error(`starwarsffg public API: ${group} has unlisted ${extra.join(", ")}`);
    for (const name of names) {
      if (given[name] === undefined) throw new Error(`starwarsffg public API: ${group}.${name} is missing`);
    }
    api[group] = Object.freeze({ ...given });
  }
  return Object.freeze(api);
}
