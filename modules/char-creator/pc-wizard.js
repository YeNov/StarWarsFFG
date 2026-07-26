/**
 * PC Wizard — the ApplicationV2 shell and THE single composition root (§0.6.5, DEV-16).
 *
 * NOT Covered and NOT Node-importable, by design: this is the one place the real
 * (poisoned) collaborators meet. It imports getActorCreationDefaults /
 * applyCharacteristicDeltas / materializeTreePurchases, passes them plus toItemData to
 * makeBuildDependencies() ONCE, and hands the result to preview.js and every build call.
 *
 * Listener ownership (issue B): clicks route through DEFAULT_OPTIONS.actions; change/input
 * bindings are attached per part in _attachPartListeners (never in _onRender); mutation
 * triggers a targeted re-render, never a full-window re-render per keystroke.
 */

import { getActorCreationDefaults, applyCharacteristicDeltas } from "../actors/actor-ffg.js";
import ItemHelpers from "../helpers/item-helpers.js";
import { toItemData } from "./to-item-data.js";
import { makeBuildDependencies } from "./build-deps.js";
import { buildPreviewActor } from "./preview.js";
import { createInitialData, setIdentity } from "./wizard-state.js";
import { applyStartingBonus, getStartingBonusOptions } from "./starting-bonus.js";
import { prepareTalentTree, rootConnectedKeys, canLearn, talentTierCost } from "./talent-selection.js";
import { dedicationCharacteristicDeltas, isDedicationTalent } from "./dedication.js";
import { validateDraft, getFreeRankCaps } from "./validate.js";
import { normalizeXpSkillPurchases } from "./skill-purchases.js";
import {
  clearSpeciesSkillRankChoices,
  prepareSpeciesSkillRankChoiceSections,
  selectSpeciesSkillRankChoiceBranch,
  toggleSpeciesSkillRankChoice,
} from "./species-skill-choices.js";
import { calcXp, calcCredits, calcObligation, obligationKeyForRules } from "./calculators.js";
import { invalidateSourceCache, loadSource, readExclusions } from "./load-source.js";
import { SOURCE_DESCRIPTORS, isSourceEnabled, sourceIdOf, sourcePackStatus, setSourceEnabled } from "./source-descriptors.js";
import {
  attachedTo,
  attachmentAppliesTo,
  attachmentHardpoints,
  canAttach,
  hardpointValue,
  isAttachablePurchase,
  remainingHardpoints,
  usedHardpoints,
} from "./attachment-purchases.js";
import { DraftStore } from "./draft-store.js";
import { NewerSchemaError, CorruptDraftError } from "./draft-schema.js";
import { emitCommitRequest, wizardPending, setCommitResponseHandler } from "./socket-bridge.js";
import { commitBuild } from "./commit-service.js";
import { mintSessionNoticeId, emitStartNotice, showSubmitToast } from "./notify.js";
import { setPending, clearPending } from "./notify-policy.js";
import { COMMIT_TIMEOUT_MS, FLAG_SCOPE, FLAGS } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PC_WIZARD = "systems/starwarsffg/templates/wizards/pc_wizard";
const STARTUP_POOL_KEYS = Object.freeze(["species", "career", "obligation", "motivation", "gear", "background", "specialization", "forcePower"]);
const STARTUP_POOL_LOAD_CONCURRENCY = 3;

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function shopPriceOf(ref) {
  const price = Number(ref?.snapshot?.system?.price?.value);
  return Number.isFinite(price) ? price : null;
}

function isPurchasableShopRef(ref) {
  const price = shopPriceOf(ref);
  return price !== null && price > 0;
}

function sortByName(a, b) {
  return (a?.name ?? "").localeCompare(b?.name ?? "", undefined, { sensitivity: "base", numeric: true });
}

function statValue(block) {
  const adjusted = Number(block?.adjusted);
  if (Number.isFinite(adjusted) && adjusted !== 0) return adjusted;
  const value = Number(block?.value);
  return Number.isFinite(value) ? value : "-";
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function isSelectableSkillName(value) {
  const name = String(value ?? "").trim();
  return name && name.toLowerCase() !== "(none)";
}

function freeSkillNamesFromSlots(slots = {}) {
  return Object.values(slots)
    .map((name) => String(name ?? "").trim())
    .filter(isSelectableSkillName);
}

function pruneFreeRankSelections(selected = [], skillNames = []) {
  const allowed = new Set(skillNames);
  return selected
    .map((name) => String(name ?? "").trim())
    .filter((name) => allowed.has(name));
}

function rangeLabel(value) {
  const range = value || "Short";
  const entry = CONFIG.FFG?.ranges?.[range];
  return entry?.label ? game.i18n.localize(entry.label) : range;
}

function inventoryStats(ref) {
  const system = ref?.snapshot?.system ?? {};
  if (ref?.type === "weapon") {
    const adjustedRange = system.range?.adjusted && system.range.adjusted !== system.range.value
      ? system.range.adjusted
      : system.range?.value;
    return [
      { label: "Damage", value: statValue(system.damage) },
      { label: "Crit", value: statValue(system.crit) },
      { label: "Range", value: rangeLabel(adjustedRange) },
    ];
  }
  if (ref?.type === "armour") {
    return [
      { label: "Soak", value: statValue(system.soak) },
      { label: "Defence", value: statValue(system.defence) },
    ];
  }
  return [];
}

function normalizeIndexedArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b));
  return entries.length ? entries.map(([, entry]) => entry) : value;
}

function collapseBracketArrayKeys(container) {
  if (!container || typeof container !== "object" || Array.isArray(container)) return;
  for (const key of Object.keys(container)) {
    const match = key.match(/^(.+)\[(\d+)\]$/);
    if (!match) continue;
    const [, arrayKey, indexText] = match;
    const index = Number(indexText);
    container[arrayKey] ??= [];
    container[arrayKey][index] = container[key];
    delete container[key];
  }
}

function normalizeWizardEditedItemSnapshot(raw, { fillItemModifiers = true } = {}) {
  const snapshot = foundry.utils.deepClone(raw ?? {});
  if (snapshot.data) {
    snapshot.system = foundry.utils.mergeObject(snapshot.system ?? {}, snapshot.data, { inplace: false });
    delete snapshot.data;
  }
  snapshot.system ??= {};
  const hasItemModifiers = Object.keys(snapshot.system).some((key) => key === "itemmodifier" || /^itemmodifier\[\d+\]$/.test(key));
  collapseBracketArrayKeys(snapshot.system);
  if (hasItemModifiers || fillItemModifiers) snapshot.system.itemmodifier = normalizeIndexedArray(snapshot.system.itemmodifier ?? []);
  if (Array.isArray(snapshot.system.itemmodifier)) {
    snapshot.system.itemmodifier = snapshot.system.itemmodifier.map((modifier) => {
      const next = foundry.utils.deepClone(modifier);
      next.system ??= {};
      if ("active" in next.system) next.system.active = next.system.active === true || next.system.active === "true" || next.system.active === "on";
      if ("broken" in next.system) next.system.broken = next.system.broken === true || next.system.broken === "true" || next.system.broken === "on";
      return next;
    });
  }
  delete snapshot.id;
  delete snapshot._id;
  delete snapshot.ownership;
  return snapshot;
}

const SOURCE_GROUP_LABELS = Object.freeze({
  species: "Species",
  career: "Careers",
  specialization: "Specializations",
  forcePower: "Force Powers",
  background: "Backgrounds",
  obligation: "Obligations / Duty / Morality",
  motivation: "Motivations",
  gear: "Inventory",
});

const RAW_RESOURCE_WARNING_KEYS = Object.freeze(new Set([
  "SWFFG.CharacterCreator.Validate.RawCharacteristicXp",
  "SWFFG.CharacterCreator.Validate.RawInventoryCredits",
]));

function bringElementAboveApplications(app) {
  const element = app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
  if (!element) return;
  const zIndices = [...document.querySelectorAll(".application, .app, .dialog")]
    .map((node) => Number.parseInt(getComputedStyle(node).zIndex, 10))
    .filter(Number.isFinite);
  element.style.zIndex = String(Math.max(100, ...zIndices) + 1);
}

function applicationElement(app) {
  return app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
}

function zIndexOf(app) {
  const element = applicationElement(app);
  if (!element) return 100;
  const zIndex = Number.parseInt(getComputedStyle(element).zIndex, 10);
  return Number.isFinite(zIndex) ? zIndex : 100;
}

function placeElementAboveApplication(app, aboveApp, offset = 1) {
  const element = applicationElement(app);
  if (!element) return;
  element.style.zIndex = String(zIndexOf(aboveApp) + offset);
}

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static #activeInstance = null;

  static get isOpen() {
    return Boolean(CharacterCreator.#activeInstance);
  }

  static open(options = {}) {
    invalidateSourceCache();
    const active = CharacterCreator.#activeInstance;
    if (active) {
      active.#pools = {};
      if (active.minimized) active.maximize?.();
      active.bringToFront?.();
      active.bringToTop?.();
      active.render(true);
      return active;
    }

    const app = new CharacterCreator(options);
    CharacterCreator.#activeInstance = app;
    app.render(true);
    return app;
  }

  /** @override */
  static PARTS = {
    header: {
      template: `${PC_WIZARD}/header.html`,
      templates: [`${PC_WIZARD}/parts/draft-banner.html`, `${PC_WIZARD}/parts/sources-panel.html`],
    },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    general: { template: `${PC_WIZARD}/tabs/general.html`, scrollable: [""] },
    background: { template: `${PC_WIZARD}/tabs/background.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`, `${PC_WIZARD}/item_pill.html`], scrollable: [""] },
    startingBonus: { template: `${PC_WIZARD}/tabs/startingBonus.html`, scrollable: [""] },
    obligation: { template: `${PC_WIZARD}/tabs/obligation.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`], scrollable: [""] },
    species: { template: `${PC_WIZARD}/tabs/species.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`], scrollable: [""] },
    career: { template: `${PC_WIZARD}/tabs/career.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`], scrollable: [""] },
    specialization: { template: `${PC_WIZARD}/tabs/specialization.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`, `${PC_WIZARD}/item_pill.html`], scrollable: [""] },
    xp_spend: { template: `${PC_WIZARD}/tabs/xp_spend.html`, scrollable: [""] },
    forcePower: { template: `${PC_WIZARD}/tabs/forcePower.html`, scrollable: [""] },
    gear: { template: `${PC_WIZARD}/tabs/gear.html`, templates: [`${PC_WIZARD}/parts/gear-filters.html`, `${PC_WIZARD}/parts/pickable-table.html`], scrollable: [""] },
    motivation: { template: `${PC_WIZARD}/tabs/motivation.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`], scrollable: [""] },
    review: { template: `${PC_WIZARD}/tabs/review.html`, scrollable: [""] },
    preview: {
      template: `${PC_WIZARD}/actor_preview.html`,
      templates: [`${PC_WIZARD}/preview/skills.html`, `${PC_WIZARD}/preview/specialization.html`, `${PC_WIZARD}/preview/forcepower.html`],
    },
  };

  /** @override — the verified tab order; opens on `general`. */
  static TABS = {
    primary: {
      tabs: [
        { id: "general", label: "General" },
        { id: "background", label: "background" },
        { id: "startingBonus", label: "startingBonus" },
        { id: "obligation", label: "obligation" },
        { id: "species", label: "species" },
        { id: "career", label: "career" },
        { id: "specialization", label: "specialization" },
        { id: "xp_spend", label: "xp_spend" },
        { id: "forcePower", label: "forcePower" },
        { id: "gear", label: "Inventory" },
        { id: "motivation", label: "motivation" },
        { id: "review", label: "review" },
      ],
      initial: "general",
    },
  };

  /** @override — `tag: "form"` WITHOUT a form handler (the phantom myFormHandler is not ported). */
  static DEFAULT_OPTIONS = {
    tag: "form",
    actions: {
      select: CharacterCreator._onSelect,
      "remove-obligation": CharacterCreator._onRemoveObligation,
      "remove-motivation": CharacterCreator._onRemoveMotivation,
      "refund-gear": CharacterCreator._onRefundGear,
      "buy-gear": CharacterCreator._onBuyGear,
      "attachment-target": CharacterCreator._onAttachmentTarget,
      "buy-attachment": CharacterCreator._onBuyAttachment,
      "edit-attachment": CharacterCreator._onEditAttachment,
      "refund-attachment": CharacterCreator._onRefundAttachment,
      "inventory-view": CharacterCreator._onInventoryView,
      "toggle-available-attachments": CharacterCreator._onToggleAvailableAttachments,
      "clear-gear-filters": CharacterCreator._onClearGearFilters,
      "obligation-view": CharacterCreator._onObligationView,
      "random-obligation": CharacterCreator._onRandomObligation,
      "open-item": CharacterCreator._onOpenItem,
      "buy-skill": CharacterCreator._onBuySkill,
      "refund-skill": CharacterCreator._onRefundSkill,
      "skill-info": CharacterCreator._onSkillInfo,
      "characteristic-control": CharacterCreator._onCharacteristicControl,
      "xp-view": CharacterCreator._onXpView,
      "learn-talent": CharacterCreator._onLearnTalent,
      "unlearn-talent": CharacterCreator._onUnlearnTalent,
      "toggle-career-rank": CharacterCreator._onToggleCareerRank,
      "toggle-spec-rank": CharacterCreator._onToggleSpecRank,
      "select-species-rank-choice-branch": CharacterCreator._onSelectSpeciesRankChoiceBranch,
      "toggle-species-rank": CharacterCreator._onToggleSpeciesRank,
      "buy-forcepower": CharacterCreator._onBuyForcePower,
      "refund-forcepower": CharacterCreator._onRefundForcePower,
      "background-view": CharacterCreator._onBackgroundView,
      "random-background": CharacterCreator._onRandomBackground,
      "random-list-pick": CharacterCreator._onRandomListPick,
      "open-sources": CharacterCreator._onOpenSources,
      "toggle-source": CharacterCreator._onToggleSource,
      "resume-draft": CharacterCreator._onResumeDraft,
      "discard-draft": CharacterCreator._onDiscardDraft,
      commit: CharacterCreator._onCommit,
    },
    position: { width: 1180, height: 800 },
    classes: ["starwarsffg", "wizard", "charCreator"],
  };

  /** Per-part change/input bindings (issue B) — attached only within each part's element. */
  static PART_BINDINGS = {
    general: [
      { selector: "input[data-field='characterName']", event: "input", handler: "_onGeneralNameInput" },
      { selector: "input[data-field='extraGrant']", event: "change", handler: "_onGeneralGrantChange" },
    ],
    background: [{ selector: "input[data-field='backgroundSearch']", event: "input", handler: "_onBackgroundSearchInput" }],
    obligation: [{ selector: "input[data-field='obligationSearch']", event: "input", handler: "_onObligationSearchInput" }],
    species: [{ selector: "input[data-field='speciesSearch']", event: "input", handler: "_onSpeciesSearchInput" }],
    gear: [
      { selector: "input[data-field='search']", event: "input", handler: "_onGearFilterChange" },
      { selector: "[data-field]:not(input[data-field='search'])", event: "change", handler: "_onGearFilterChange" },
    ],
    startingBonus: [
      { selector: "select[name='rules']", event: "change", handler: "_onRulesChange" },
      { selector: "select[name='startingBonus']", event: "change", handler: "_onStartingBonusChange" },
    ],
    forcePower: [{ selector: "input[data-discount]", event: "change", handler: "_onToggleForcePowerDiscount" }],
    xp_spend: [{ selector: "select[data-field='dedicationCharacteristic']", event: "change", handler: "_onDedicationCharacteristicChange" }],
    motivation: [{ selector: "input[data-field='listSearch']", event: "input", handler: "_onListSearchInput" }],
  };

  #commitPhase = "editing";
  #draft = { commit: null };
  #sessionNoticeId = mintSessionNoticeId();
  #pools = {};
  #commitTimer = null;
  #xpView = "characteristics"; // xp_spend sub-view: "characteristics" | "bonus" | "skills" | "talents" (transient, not persisted to draft)
  #inventoryView = "weapon"; // Inventory sub-view: "weapon" | "armour" | "gear" (transient)
  #backgroundView = "culture"; // Background accordion: "culture" | "hook" | "forceAttitude" (transient)
  #backgroundSearch = { culture: "", hook: "", forceAttitude: "" }; // Background accordion name filters (transient)
  #obligationView = "obligation"; // Obligation accordion: "obligation" | "duty" | "morality" (transient)
  #obligationSearch = { obligation: "", duty: "", morality: "" }; // Obligation accordion name filters (transient)
  #listSearch = { motivation: "" }; // Motivation tab name filter (transient)
  #speciesSearch = ""; // Species tab name filter (transient, not persisted to draft)
  #attachmentTargetId = null; // Expanded owned gear purchase id for attachment shopping.
  #skillDescriptions = null; // cached { ffgimportid|name (lowercased): description html }
  #sourcesOpen = false; // Content-source overlay state (transient)
  #missingSourceWarningShown = false; // One-shot warning for stale compendium settings.
  #missingSourceWarningGroups = null; // Prepared during context, shown after the wizard renders.
  #draftBannerDismissed = false; // Resume/discard banner is only for a different stored draft.
  #draftResumePromptShown = false; // One-shot modal prompt for a resumable stored draft.

  constructor(options = {}) {
    super(options);

    // THE composition root — assemble the build dependencies exactly once.
    this.buildDeps = makeBuildDependencies({
      getActorCreationDefaults,
      applyCharacteristicDeltas,
      materializeTreePurchases: ItemHelpers.materializeTreePurchases,
      toItemData,
    });

    this.draftStore = new DraftStore();
    this.data = createInitialData();
    // The listener is registered once at ready (swffg-main); the open wizard only installs
    // its response handler and shares the module-level pending map.
    setCommitResponseHandler((response) => this._onCommitResponse(response));
  }

  /** @override */
  async _prepareContext() {
    await mapWithConcurrency(STARTUP_POOL_KEYS, STARTUP_POOL_LOAD_CONCURRENCY, async (poolKey) => {
      try {
        await this.#ensurePool(poolKey);
      } catch (err) {
        delete this.#pools[poolKey];
        CONFIG.logger?.warn?.(`PC wizard failed to load ${poolKey} sources: ${err.message}`);
      }
    });
    this.#ensureCreditPurchaseIds(this.data);
    this.#ensureExtraGrants(this.data);
    this.#normalizeFreeRankSelections(this.data);

    const xp = calcXp(this.data);
    const credits = calcCredits(this.data);
    const obligation = calcObligation(this.data);
    const validation = validateDraft(this.data);
    const sourceGroups = this.#prepareSourceGroups(readExclusions());
    this.#prepareMissingSourceWarning(sourceGroups);
    const storedDraft = game.user.getFlag(FLAG_SCOPE, FLAGS.draft);
    const draft = {
      hasResumable: Boolean(storedDraft?.data && storedDraft.data.commitId !== this.data.commitId && !this.#draftBannerDismissed),
      savedAt: storedDraft?.data?.commitId === this.data.commitId ? storedDraft.savedAt : null,
    };

    let preview = null;
    try {
      const built = await buildPreviewActor(this.data, this.buildDeps);
      preview = built.previewActor;
    } catch (err) {
      CONFIG.logger?.warn?.(`PC wizard preview build failed: ${err.message}`);
    }

    // Background pool is bucketed by the item's system.type (culture / hook / attitude),
    // matching the legacy getBackgrounds() split. forceAttitude uses the "attitude" type.
    const backgroundRefs = this.#pools.background ?? [];
    const ofType = (type) => backgroundRefs.filter((ref) => ref.snapshot?.system?.type === type);
    const isForceAndDestiny = this.data.selected.rules === "fad";
    const pools = { ...this.#pools, culture: ofType("culture"), hook: ofType("hook"), forceAttitude: ofType("attitude") };
    const prepareBackgroundRows = (rows, selectedUuid, sectionKey) => {
      const search = (this.#backgroundSearch[sectionKey] ?? "").trim().toLowerCase();
      return rows.map((row) => ({
        ...row,
        selected: row.uuid === selectedUuid,
        hidden: !!search && !(row.name ?? "").toLowerCase().includes(search),
      }));
    };
    const selectedCultureUuid = this.data.selected.background.culture?.uuid;
    const selectedHookUuid = this.data.selected.background.hook?.uuid;
    const selectedForceAttitudeUuid = this.data.selected.background.forceAttitude?.uuid;
    const backgroundSections = [
      {
        key: "culture",
        label: "Culture",
        rows: prepareBackgroundRows(pools.culture, selectedCultureUuid, "culture"),
        selectedUuid: selectedCultureUuid,
        selectedName: this.data.selected.background.culture?.name,
        search: this.#backgroundSearch.culture,
      },
      {
        key: "hook",
        label: "Hook",
        rows: prepareBackgroundRows(pools.hook, selectedHookUuid, "hook"),
        selectedUuid: selectedHookUuid,
        selectedName: this.data.selected.background.hook?.name,
        search: this.#backgroundSearch.hook,
      },
    ];
    if (isForceAndDestiny) {
      backgroundSections.push({
        key: "forceAttitude",
        label: "Force Attitude",
        rows: prepareBackgroundRows(pools.forceAttitude, selectedForceAttitudeUuid, "forceAttitude"),
        selectedUuid: selectedForceAttitudeUuid,
        selectedName: this.data.selected.background.forceAttitude?.name,
        search: this.#backgroundSearch.forceAttitude,
      });
    }
    const activeBackgroundKey = backgroundSections.some((section) => section.key === this.#backgroundView)
      ? this.#backgroundView
      : null;
    for (const section of backgroundSections) {
      section.active = section.key === activeBackgroundKey;
      section.expanded = section.active ? "true" : "false";
      section.headerLabel = section.selectedName ? `${section.label} - ${section.selectedName}` : section.label;
      section.matchCount = section.rows.filter((row) => !row.hidden).length;
      section.noMatches = section.rows.length === 0 || section.matchCount === 0;
      section.canRandom = section.matchCount > 0;
    }
    const speciesSearch = this.#speciesSearch.trim().toLowerCase();
    const speciesRows = [...(this.#pools.species ?? [])]
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }))
      .map((ref) => ({
        ...ref,
        hidden: !!speciesSearch && !(ref.name ?? "").toLowerCase().includes(speciesSearch),
      }));
    const speciesMatchCount = speciesRows.filter((ref) => !ref.hidden).length;
    const speciesNoMatches = speciesRows.length === 0 || speciesMatchCount === 0;
    const activeObligationKey = obligationKeyForRules(this.data.selected.rules);
    const obligationLabels = { obligation: "Obligation", duty: "Duty", morality: "Morality" };
    const obligationSectionDefs = activeObligationKey
      ? [{ key: activeObligationKey, label: obligationLabels[activeObligationKey] }]
      : [];
    const selectedObligationUuids = new Set(this.data.selected.obligations.map((entry) => entry.uuid));
    const obligationSections = obligationSectionDefs.map((def) => {
      const search = (this.#obligationSearch[def.key] ?? "").trim().toLowerCase();
      const rows = (this.#pools.obligation ?? [])
        .filter((ref) => ref.snapshot?.system?.type === def.key)
        .map((ref) => ({
          ...ref,
          selected: selectedObligationUuids.has(ref.uuid),
          disableSelect: selectedObligationUuids.has(ref.uuid),
          hidden: !!search && !(ref.name ?? "").toLowerCase().includes(search),
        }));
      const selectedEntries = this.data.selected.obligations.filter((entry) => entry.snapshot?.system?.type === def.key);
      const matchCount = rows.filter((row) => !row.hidden).length;
      const randomCount = rows.filter((row) => !row.hidden && !row.selected).length;
      return {
        ...def,
        rows,
        search: this.#obligationSearch[def.key],
        selectedEntries,
        active: def.key === this.#obligationView,
        expanded: def.key === this.#obligationView ? "true" : "false",
        headerLabel: selectedEntries.length ? `${def.label} (${selectedEntries.length})` : def.label,
        noMatches: rows.length === 0 || matchCount === 0,
        canRandom: randomCount > 0,
      };
    });
    if (!obligationSections.some((section) => section.key === this.#obligationView)) {
      this.#obligationView = activeObligationKey;
      for (const section of obligationSections) {
        section.active = section.key === this.#obligationView;
        section.expanded = section.active ? "true" : "false";
      }
    }
    const prepareListRows = (poolKey, selectedEntries) => {
      const search = (this.#listSearch[poolKey] ?? "").trim().toLowerCase();
      const selectedUuids = new Set(selectedEntries.map((entry) => entry.uuid));
      return (this.#pools[poolKey] ?? []).map((ref) => ({
        ...ref,
        selected: selectedUuids.has(ref.uuid),
        disableSelect: selectedUuids.has(ref.uuid),
        hidden: !!search && !(ref.name ?? "").toLowerCase().includes(search),
      }));
    };
    const motivationRows = prepareListRows("motivation", this.data.selected.motivations);
    const motivationMatchCount = motivationRows.filter((ref) => !ref.hidden).length;
    const motivationRandomCount = motivationRows.filter((ref) => !ref.hidden && !ref.selected).length;
    const motivationNoMatches = motivationRows.length === 0 || motivationMatchCount === 0;

    const rulesChoices = Object.values(CONFIG.FFG?.characterCreator?.rules ?? {})
      .map((choice) => ({ key: choice.value, label: game.i18n.localize(choice.label) }));
    const startingBonusChoices = getStartingBonusOptions(this.data.selected.rules)
      .map((choice) => ({ key: choice.key, label: game.i18n.localize(choice.labelKey) }));

    // Flat skill list for the XP-spend tab (the preview panel's column layout is separate).
    // Each row carries the prepared rank, whether it's a career skill, and the cost of the
    // NEXT rank (career rank*5, non-career rank*5 + 5).
    const skillPurchases = this.data.purchases.xp.skills;
    const skillDescriptions = this.#xpView === "skills" ? await this.#ensureSkillDescriptions() : {};
    const xpSkills = preview?.system?.skills
      ? Object.entries(preview.system.skills).map(([key, skill]) => {
        const rank = skill.rank ?? 0;
        const careerskill = Boolean(skill.careerskill);
        const nextValue = rank + 1;
        const nextCost = careerskill ? nextValue * 5 : nextValue * 5 + 5;
        // Creation cap: skills may be raised to rank 2 with starting XP. A rank can be
        // refunded only if the CURRENT top rank was itself an XP purchase.
        const canBuy = rank < 2;
        const canRefund = skillPurchases.some((purchase) => purchase.key === key && purchase.value === rank);
        const label = skill.label ?? key;
        const description = skillDescriptions[label.toLowerCase()] ?? skillDescriptions[key.toLowerCase()] ?? "";
        return { key, label, rank, careerskill, type: skill.type, nextValue, nextCost, canBuy, canRefund, description };
      })
      : [];
    const characteristicPurchases = this.data.purchases.xp.characteristics;
    const specializationTalents = this.data.selected.specialization?.snapshot?.system?.talents ?? {};
    const dedicationDeltas = dedicationCharacteristicDeltas(specializationTalents, this.data.purchases.xp.talents);
    const xpCharacteristics = preview?.system?.characteristics
      ? Object.entries(preview.system.characteristics).map(([key, characteristic]) => {
        const value = characteristic.value ?? 0;
        const purchaseValue = Math.max(0, value - (dedicationDeltas[key] ?? 0));
        const nextValue = purchaseValue + 1;
        return {
          key,
          label: key,
          value,
          purchaseValue,
          nextValue,
          nextCost: nextValue * 10,
          canBuy: purchaseValue < 5,
          canRefund: characteristicPurchases.some((purchase) => purchase.key === key && purchase.value === purchaseValue),
        };
      })
      : [];

    // Specialization tab: the selected career's in-career specializations + every
    // universal specialization from the pool (matched by name, as the legacy did).
    // Selecting one sets data.selected.specialization via the shared _onSelect action.
    const specPool = this.#pools.specialization ?? [];
    const careerSpecNames = new Set(
      Object.values(this.data.selected.career?.snapshot?.system?.specializations ?? {}).map((spec) => spec.name),
    );
    const careerSpecializations = specPool.filter((ref) => careerSpecNames.has(ref.name));
    const universalSpecializations = specPool.filter((ref) => ref.snapshot?.system?.universal && !careerSpecNames.has(ref.name));

    // Free skill ranks: chosen from the career's career-skills and the specialization's.
    // These feed rankGrants -> toItemData (baked as +1-rank AEs on the career/spec item), so
    // applyBuild already applies them to the built actor; the picker only drives the arrays.
    const freeRankCaps = getFreeRankCaps(this.data);
    const careerSkillNames = freeSkillNamesFromSlots(this.data.selected.career?.snapshot?.system?.careerSkills);
    const careerPicked = this.data.selected.careerCareerSkillRanks;
    const careerFreeRanks = careerSkillNames.map((name) => {
      const picked = careerPicked.includes(name);
      return { key: name, picked, canToggle: picked || careerPicked.length < freeRankCaps.career };
    });
    const specSkillNames = freeSkillNamesFromSlots(this.data.selected.specialization?.snapshot?.system?.careerSkills);
    const specPicked = this.data.selected.specializationCareerSkillRanks;
    const specFreeRanks = specSkillNames.map((name) => {
      const picked = specPicked.includes(name);
      return { key: name, picked, canToggle: picked || specPicked.length < freeRankCaps.specialization };
    });
    const speciesFreeRankChoiceSections = prepareSpeciesSkillRankChoiceSections(this.data, xpSkills);
    const reviewVerificationSteps = [
      ...validation.warnings.map((warningKey) => {
        const status = RAW_RESOURCE_WARNING_KEYS.has(warningKey) ? "warning" : "incomplete";
        return {
          status,
          statusKey: `SWFFG.CharacterCreator.Validate.Status.${status}`,
          label: game.i18n.localize(warningKey),
        };
      }),
    ];

    // Force powers — gated by the character's Force rating (system.stats.forcePool.max on the
    // built actor, which includes item-granted rating). Rating 0 → the tab is hidden entirely;
    // rating 1+ → show powers whose required_force_rating is within reach.
    const forceRating = Number(preview?.system?.stats?.forcePool?.max) || 0;
    const hasForceRating = forceRating >= 1;
    const fpPurchases = this.data.purchases.xp.forcePowers;
    const boughtFpUuids = new Set(fpPurchases.map((p) => p.ref?.uuid));
    const fpDiscounts = this.data.forcePowerDiscounts ?? {};
    const forcePowers = hasForceRating
      ? (this.#pools.forcePower ?? [])
        .filter((ref) => (Number(ref.snapshot?.system?.required_force_rating) || 0) <= forceRating)
        .map((ref) => {
          const baseCost = Number(ref.snapshot?.system?.base_cost) || 0;
          const discounted = Boolean(fpDiscounts[ref.uuid]); // mentor discount: flat -5 XP
          const cost = discounted ? Math.max(0, baseCost - 5) : baseCost;
          const bought = boughtFpUuids.has(ref.uuid);
          return { uuid: ref.uuid, name: ref.name, img: ref.img, baseCost, discounted, cost, requiredRating: ref.snapshot?.system?.required_force_rating, bought, canBuy: !bought && cost <= xp.available };
        })
      : [];

    // Hide the Force Powers tab from the nav when the character has no Force rating.
    const tabs = this._prepareTabs("primary");
    if (!hasForceRating) delete tabs.forcePower;

    // Talent tree for the selected specialization, consumed by the xp_spend "talents" sub-view.
    // Learned talents come from data.purchases.xp.talents (the single source of truth), never a
    // ref-stored list — so the tree cannot survive a wizard reopen.
    const specForTree = this.data.selected.specialization;
    const talentPurchases = this.data.purchases.xp.talents;
    const learnedTalentKeys = talentPurchases.map((purchase) => purchase.key);
    const dedicationChoices = Object.fromEntries(talentPurchases
      .filter((purchase) => purchase.characteristic)
      .map((purchase) => [purchase.key, purchase.characteristic]));
    const characteristicChoices = xpCharacteristics.map((characteristic) => ({
      key: characteristic.key,
      label: characteristic.label,
      value: characteristic.value,
    }));
    const talentTree = specForTree?.snapshot?.system?.talents
      ? prepareTalentTree(specForTree.snapshot.system.talents, learnedTalentKeys, xp.available, { dedicationChoices, characteristicChoices })
      : null;

    // Inventory tab — a Weapons / Armor / Gear switcher. Each sub-view shows the owned and the
    // shop (buyable) items of that type, filtered by name search + a max-price cap (data.gearFilters).
    // "Buyable" is explicit: helpers granted by attachments often have no price or 0cr and are
    // not standalone starting-gear purchases.
    const invView = this.#inventoryView; // "weapon" | "armour" | "gear"
    const invFilters = this.data.gearFilters ?? {};
    const invSearch = (invFilters.search ?? "").toLowerCase();
    const invMinPrice = Number(invFilters.minPrice) || 0;
    const invMaxPrice = Number(invFilters.maxPrice) || 0;
    const attachmentShowOnlyAvailable = Boolean(invFilters.showOnlyAvailable);
    const matchesSearch = (ref) => !invSearch || (ref?.name ?? "").toLowerCase().includes(invSearch);
    const matchesPrice = (ref) => {
      const price = shopPriceOf(ref);
      return price >= invMinPrice && (!invMaxPrice || price <= invMaxPrice);
    };
    const targetPurchase = this.data.purchases.credits.find((purchase) => purchase.id === this.#attachmentTargetId && isAttachablePurchase(purchase));
    if (!targetPurchase) this.#attachmentTargetId = null;
    const isEditingAttachments = Boolean(targetPurchase);
    const matchesInventoryFilters = (ref) => !isEditingAttachments && matchesSearch(ref) && matchesPrice(ref);
    const shopItems = (this.#pools.gear ?? [])
      .filter((ref) => {
        return ref.type === invView && isPurchasableShopRef(ref) && (isEditingAttachments || matchesInventoryFilters(ref));
      })
      .sort(sortByName)
      .map((ref) => {
        const price = shopPriceOf(ref);
        return { uuid: ref.uuid, name: ref.name, img: ref.img, price, affordable: price <= credits.available, stats: inventoryStats(ref), restricted: Boolean(ref.snapshot?.system?.rarity?.isrestricted) };
      });
    const availableAttachments = targetPurchase
      ? (this.#pools.gear ?? [])
        .filter((ref) => ref.type === "itemattachment" && isPurchasableShopRef(ref))
        .filter((ref) => attachmentAppliesTo(targetPurchase.ref, ref))
        .filter((ref) => matchesSearch(ref) && matchesPrice(ref))
        .filter((ref) => {
          if (!attachmentShowOnlyAvailable) return true;
          return canAttach(this.data, targetPurchase, ref) && shopPriceOf(ref) <= credits.available;
        })
        .sort(sortByName)
        .map((ref) => {
          const price = shopPriceOf(ref);
          const canInstall = canAttach(this.data, targetPurchase, ref) && price <= credits.available;
          return {
            uuid: ref.uuid,
            name: ref.name,
            img: ref.img,
            targetId: targetPurchase.id,
            price,
            hardpoints: attachmentHardpoints(ref),
            restricted: Boolean(ref.snapshot?.system?.rarity?.isrestricted),
            canInstall,
          };
        })
      : [];
    const ownedItems = this.data.purchases.credits
      .filter((purchase) => {
        return !purchase.attachTo
          && purchase.ref?.type === invView
          && (isEditingAttachments || matchesSearch(purchase.ref));
      })
      .map((purchase) => {
        const attachable = isAttachablePurchase(purchase);
        const attachedItems = attachedTo(this.data, purchase.id).map((attachment) => ({
          id: attachment.id,
          uuid: attachment.ref.uuid,
          name: attachment.ref.name,
          img: attachment.ref.img,
          cost: attachment.cost,
          hardpoints: attachmentHardpoints(attachment.ref),
          restricted: Boolean(attachment.ref.snapshot?.system?.rarity?.isrestricted),
        }));
        return {
          id: purchase.id,
          uuid: purchase.ref.uuid,
          name: purchase.ref.name,
          img: purchase.ref.img,
          cost: purchase.cost,
          stats: inventoryStats(purchase.ref),
          restricted: Boolean(purchase.ref.snapshot?.system?.rarity?.isrestricted),
          attachable,
          attachmentsOpen: attachable && purchase.id === this.#attachmentTargetId,
          hardpoints: attachable ? hardpointValue(purchase.ref) : 0,
          usedHardpoints: attachable ? usedHardpoints(this.data, purchase.id) : 0,
          remainingHardpoints: attachable ? remainingHardpoints(this.data, purchase) : 0,
          attachedItems,
        };
      });

    // Encumbrance — read the built preview actor's derived stat (current from carried items, max
    // from Brawn + mods). It rebuilds on every buy/refund, so this tracks purchases automatically.
    const encumbrance = {
      value: Number(preview?.system?.stats?.encumbrance?.value) || 0,
      max: Number(preview?.system?.stats?.encumbrance?.max) || 0,
    };
    encumbrance.over = encumbrance.value > encumbrance.max;

    return {
      tabs,
      data: this.data,
      draft,
      pools,
      speciesRows,
      speciesMatchCount,
      speciesNoMatches,
      speciesSearch: this.#speciesSearch,
      isForceAndDestiny,
      backgroundSections,
      obligationSections,
      motivationRows,
      motivationSearch: this.#listSearch.motivation,
      motivationNoMatches,
      motivationCanRandom: motivationRandomCount > 0,
      forceRating,
      forcePowers,
      rulesChoices,
      startingBonusChoices,
      xpCharacteristics,
      xpSkills,
      xpView: this.#xpView,
      talentTree,
      talentSpecName: specForTree?.name ?? null,
      careerSpecializations,
      universalSpecializations,
      careerFreeRanks,
      careerFreeUsed: careerPicked.length,
      careerFreeCap: freeRankCaps.career,
      specFreeRanks,
      specFreeUsed: specPicked.length,
      specFreeCap: freeRankCaps.specialization,
      speciesFreeRankChoiceSections,
      speciesFreeRankChoiceCount: speciesFreeRankChoiceSections.length,
      totalXp: xp.total,
      availableXp: xp.available,
      totalCredits: credits.total,
      availableCredits: credits.available,
      inventoryView: invView,
      showInventoryStats: ["weapon", "armour"].includes(invView),
      inventoryFilters: invFilters,
      attachmentShowOnlyAvailable,
      shopItems,
      ownedItems,
      availableAttachments,
      encumbrance,
      obligationKey: obligation.key,
      availableObligation: obligation.available,
      steps: validation.steps,
      reviewVerificationSteps,
      sourceGroups,
      sourcesOpen: this.#sourcesOpen,
      actor: preview,
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#showMissingSourceWarning();
    this.#showDraftResumePrompt(context?.draft?.hasResumable);
  }

  /** @override — hand each tabbed part its active-tab descriptor so it can show/hide. */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    partContext.tab = partContext.tabs?.[partId];
    return partContext;
  }

  /** @override — bind change/input listeners per part, scoped to the part element (issue B). */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    for (const binding of CharacterCreator.PART_BINDINGS[partId] ?? []) {
      for (const node of htmlElement.querySelectorAll(binding.selector)) {
        node.addEventListener(binding.event, (event) => this[binding.handler](event));
      }
    }
  }

  /**
   * The single mutation funnel + commit barrier. Click actions do a full re-render (they
   * are low-frequency and must refresh whichever tab is active); the high-frequency gear
   * filter passes an explicit `parts` list so typing never re-renders the whole window.
   */
  #mutate(fn, { parts, focus } = {}) {
    if (this.#commitPhase !== "editing") return false;
    if (this.#draft.commit) this.#remintCommitId(); // edit after an attempt ⇒ new identity
    fn(this.data);
    this.draftStore.scheduleSave({ data: this.data, commit: this.#draft.commit });
    // Per-part `scrollable: [""]` (PARTS) preserves each tab section's scroll across the
    // re-render, so a long tab (e.g. the skills list) keeps its position on every click.
    const renderResult = parts ? this.render({ parts }) : this.render();
    if (focus) {
      const restore = () => requestAnimationFrame(() => this.#restoreFocus(focus));
      if (typeof renderResult?.then === "function") renderResult.then(restore);
      else restore();
    }
    return true;
  }

  #restoreFocus({ selector, selectionStart, selectionEnd }) {
    const field = applicationElement(this)?.querySelector(selector);
    if (!(field instanceof HTMLInputElement)) return;
    field.focus({ preventScroll: true });
    if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) {
      field.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  #remintCommitId() {
    const superseded = this.data.commitId;
    this.data.commitId = foundry.utils.randomID(16);
    this.#draft.commit = null;
    this.draftStore.setCommit(null);
    CONFIG.logger?.debug?.(`PC wizard: superseded commit ${superseded} — reminted ${this.data.commitId}`);
  }

  #normalizeXpSkillPurchases(data) {
    this.#normalizeFreeRankSelections(data);
    normalizeXpSkillPurchases(data, this.buildDeps.creationDefaults.system.skills);
  }

  #normalizeFreeRankSelections(data) {
    const careerSkillNames = freeSkillNamesFromSlots(data.selected?.career?.snapshot?.system?.careerSkills);
    const specSkillNames = freeSkillNamesFromSlots(data.selected?.specialization?.snapshot?.system?.careerSkills);
    data.selected.careerCareerSkillRanks = pruneFreeRankSelections(data.selected?.careerCareerSkillRanks, careerSkillNames);
    data.selected.specializationCareerSkillRanks = pruneFreeRankSelections(data.selected?.specializationCareerSkillRanks, specSkillNames);
  }

  #ensureCreditPurchaseIds(data) {
    for (const purchase of data.purchases?.credits ?? []) {
      purchase.id ??= foundry.utils.randomID(16);
    }
  }

  #ensureExtraGrants(data) {
    data.grants ??= {};
    data.grants.extra ??= { xp: 0, credits: 0 };
    data.grants.extra.xp = nonNegativeInteger(data.grants.extra.xp);
    data.grants.extra.credits = nonNegativeInteger(data.grants.extra.credits);
  }

  /** Load a content pool through the signature-aware source cache. */
  async #ensurePool(poolKey) {
    this.#pools[poolKey] = await loadSource(poolKey);
  }

  #prepareSourceGroups(exclusions) {
    return Object.entries(SOURCE_DESCRIPTORS).map(([poolKey, descriptor]) => {
      const settingValue = game.settings.get(FLAG_SCOPE, descriptor.settingKey);
      const sourceStatus = sourcePackStatus(settingValue, (packId) => Boolean(game.packs.get(packId)));
      const missingPackIds = new Set(sourceStatus.missingPackIds);
      const noConfiguredCompendiums = sourceStatus.noConfiguredCompendiums;
      const sources = sourceStatus.packIds.map((packId) => {
        const pack = game.packs.get(packId);
        const sourceId = pack ? sourceIdOf(pack) : packId;
        return {
          id: sourceId,
          label: pack?.metadata?.label ?? pack?.title ?? pack?.metadata?.id ?? packId,
          missing: missingPackIds.has(packId),
          enabled: isSourceEnabled(poolKey, sourceId, exclusions),
        };
      });

      sources.push({
        id: "world",
        label: game.i18n.localize("SWFFG.CharacterCreator.Sources.World"),
        enabled: isSourceEnabled(poolKey, "world", exclusions),
      });

      return {
        poolKey,
        label: SOURCE_GROUP_LABELS[poolKey] ?? poolKey,
        noConfiguredCompendiums,
        missingPackIds: [...missingPackIds],
        sources,
      };
    });
  }

  #prepareMissingSourceWarning(sourceGroups) {
    if (this.#missingSourceWarningShown) return;
    const groups = sourceGroups.filter((group) => group.noConfiguredCompendiums || group.missingPackIds.length > 0);
    if (!groups.length) return;
    this.#missingSourceWarningGroups = groups;
  }

  #showMissingSourceWarning() {
    const groups = this.#missingSourceWarningGroups;
    if (this.#missingSourceWarningShown || !groups?.length) return;
    this.#missingSourceWarningShown = true;
    this.#missingSourceWarningGroups = null;

    const escape = foundry.utils.escapeHTML ?? ((value) => String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char])));
    const items = groups.map((group) => {
      const details = [];
      if (group.noConfiguredCompendiums) details.push(game.i18n.localize("SWFFG.CharacterCreator.Sources.Missing.NoneConfigured"));
      if (group.missingPackIds.length) details.push(`${game.i18n.localize("SWFFG.CharacterCreator.Sources.Missing.MissingIds")} ${group.missingPackIds.map(escape).join(", ")}`);
      return `<li><b>${escape(group.label)}</b>: ${details.join("; ")}</li>`;
    }).join("");
    const content = `
      <div class="pcw-source-warning">
        <p>${game.i18n.localize("SWFFG.CharacterCreator.Sources.Missing.Description")}</p>
        <ul>${items}</ul>
      </div>
    `;

    window.setTimeout(() => {
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("SWFFG.CharacterCreator.Sources.Missing.Title") },
        classes: ["starwarsffg", "charCreator"],
        content,
        buttons: [{ action: "close", label: game.i18n.localize("SWFFG.CharacterCreator.Sources.Missing.Close"), default: true }],
      });
      dialog.render({ force: true });
      bringElementAboveApplications(dialog);
      requestAnimationFrame(() => bringElementAboveApplications(dialog));
    }, 0);
  }

  #showDraftResumePrompt(hasResumable) {
    if (!hasResumable || this.#draftResumePromptShown || this.#draftBannerDismissed) return;
    this.#draftResumePromptShown = true;

    window.setTimeout(() => {
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("SWFFG.CharacterCreator.Draft.ResumeTitle") },
        classes: ["starwarsffg", "charCreator"],
        content: `<div class="pcw-draft-resume"><p>${game.i18n.localize("SWFFG.CharacterCreator.Draft.Resume")}</p></div>`,
        buttons: [
          {
            action: "resume",
            label: game.i18n.localize("SWFFG.CharacterCreator.Draft.ResumeAction"),
            default: true,
            callback: () => CharacterCreator._onResumeDraft.call(this),
          },
          {
            action: "discard",
            label: game.i18n.localize("SWFFG.CharacterCreator.Draft.Discard"),
            callback: () => CharacterCreator._onDiscardDraft.call(this),
          },
        ],
      });
      dialog.render({ force: true });
      placeElementAboveApplication(dialog, this);
      requestAnimationFrame(() => placeElementAboveApplication(dialog, this));
    }, 0);
  }

  /**
   * Cached skill-description lookup for the xp_spend hover hints. The source pack(s) come from the
   * `skillDescriptionCompendiums` world setting (comma-separated, default world.oggdudeskilldescriptions
   * — the JournalEntry pack the data importer creates). Keyed by both each entry's ffgimportid and its
   * name (lowercased). Absent/unreadable packs yield an empty map (no hints), which is fine.
   */
  async #ensureSkillDescriptions() {
    if (this.#skillDescriptions) return this.#skillDescriptions;
    const map = {};
    try {
      const setting = game.settings.get("starwarsffg", "skillDescriptionCompendiums");
      const packIds = typeof setting === "string" ? setting.split(",") : (setting || []);
      for (const rawId of packIds) {
        const packId = typeof rawId === "string" ? rawId.trim() : rawId;
        if (!packId) continue;
        const pack = game.packs.get(packId);
        if (!pack) continue;
        for (const doc of await pack.getDocuments()) {
          const description = doc.pages?.contents?.[0]?.text?.content ?? "";
          if (!description) continue;
          const id = (doc.flags?.starwarsffg?.ffgimportid ?? "").toLowerCase();
          const name = (doc.name ?? "").toLowerCase();
          if (id) map[id] = description;
          if (name) map[name] = description;
        }
      }
    } catch { /* setting/pack unreadable in this world */ }
    this.#skillDescriptions = map;
    return map;
  }

  _onGeneralNameInput(event) {
    const name = event.currentTarget.value ?? "";
    this.#mutate((data) => { setIdentity(data, { name }); }, { parts: ["header"] });
  }

  _onGeneralGrantChange(event) {
    const field = event.currentTarget.dataset.grantField;
    if (!["xp", "credits"].includes(field)) return;
    const value = nonNegativeInteger(event.currentTarget.value);
    this.#mutate((data) => {
      data.grants.extra ??= { xp: 0, credits: 0 };
      data.grants.extra[field] = value;
    });
  }

  _onGearFilterChange(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.value;
    const focus = event.type === "input" && field === "search"
      ? {
        selector: "section[data-tab='gear'] input[data-field='search']",
        selectionStart: event.currentTarget.selectionStart,
        selectionEnd: event.currentTarget.selectionEnd,
      }
      : null;
    this.#mutate((data) => {
      data.gearFilters = { ...(data.gearFilters ?? {}), [field]: value };
    }, { parts: ["gear"], focus });
  }

  _onSpeciesSearchInput(event) {
    const search = event.currentTarget.value ?? "";
    this.#speciesSearch = search;
    const needle = search.trim().toLowerCase();
    const root = event.currentTarget.closest("[data-tab='species']");
    let visible = 0;
    for (const row of root?.querySelectorAll(".pickable-row") ?? []) {
      const name = row.querySelector(".pickable-name")?.textContent?.toLowerCase() ?? "";
      const match = !needle || name.includes(needle);
      row.hidden = !match;
      if (match) visible += 1;
    }
    const empty = root?.querySelector("[data-species-empty]");
    if (empty) empty.hidden = visible > 0;
  }

  _onBackgroundSearchInput(event) {
    const sectionKey = event.currentTarget.dataset.backgroundKey;
    if (!["culture", "hook", "forceAttitude"].includes(sectionKey)) return;
    const search = event.currentTarget.value ?? "";
    this.#backgroundSearch[sectionKey] = search;
    const needle = search.trim().toLowerCase();
    const root = event.currentTarget.closest(".background-body");
    let visible = 0;
    for (const row of root?.querySelectorAll(".pickable-row") ?? []) {
      const name = row.querySelector(".pickable-name")?.textContent?.toLowerCase() ?? "";
      const match = !needle || name.includes(needle);
      row.hidden = !match;
      if (match) visible += 1;
    }
    const empty = root?.querySelector("[data-background-empty]");
    if (empty) empty.hidden = visible > 0;
  }

  _onListSearchInput(event) {
    const poolKey = event.currentTarget.dataset.poolKey;
    if (poolKey !== "motivation") return;
    const search = event.currentTarget.value ?? "";
    this.#listSearch[poolKey] = search;
    const needle = search.trim().toLowerCase();
    const root = event.currentTarget.closest(`[data-tab='${poolKey}']`);
    let visible = 0;
    let randomable = 0;
    for (const row of root?.querySelectorAll(".pickable-row") ?? []) {
      const name = row.querySelector(".pickable-name")?.textContent?.toLowerCase() ?? "";
      const match = !needle || name.includes(needle);
      row.hidden = !match;
      if (match) {
        visible += 1;
        if (!row.classList.contains("is-selected")) randomable += 1;
      }
    }
    const empty = root?.querySelector("[data-list-empty]");
    if (empty) empty.hidden = visible > 0;
    const random = root?.querySelector("[data-action='random-list-pick']");
    if (random) random.disabled = randomable <= 0;
  }

  _onObligationSearchInput(event) {
    const sectionKey = event.currentTarget.dataset.obligationKey;
    if (!["obligation", "duty", "morality"].includes(sectionKey)) return;
    const search = event.currentTarget.value ?? "";
    this.#obligationSearch[sectionKey] = search;
    const needle = search.trim().toLowerCase();
    const root = event.currentTarget.closest(".list-body");
    let visible = 0;
    let randomable = 0;
    for (const row of root?.querySelectorAll(".pickable-row") ?? []) {
      const name = row.querySelector(".pickable-name")?.textContent?.toLowerCase() ?? "";
      const match = !needle || name.includes(needle);
      row.hidden = !match;
      if (match) {
        visible += 1;
        if (!row.classList.contains("is-selected")) randomable += 1;
      }
    }
    const empty = root?.querySelector("[data-obligation-empty]");
    if (empty) empty.hidden = visible > 0;
    const random = root?.querySelector("[data-action='random-obligation']");
    if (random) random.disabled = randomable <= 0;
  }

  _onToggleForcePowerDiscount(event) {
    const uuid = event.currentTarget.dataset.uuid;
    const checked = event.currentTarget.checked;
    this.#mutate((data) => {
      if (!data.forcePowerDiscounts) data.forcePowerDiscounts = {};
      data.forcePowerDiscounts[uuid] = checked;
    });
  }

  // --- click actions (bound with `this` = the app instance) --------------------------

  static _onSelect(event, target) {
    const { uuid, table } = target.dataset;
    const sourcePool = ["culture", "hook", "forceAttitude"].includes(table)
      ? this.#pools.background
      : ["obligation", "duty", "morality"].includes(table)
        ? this.#pools.obligation
        : this.#pools[table];
    const ref = (sourcePool ?? []).find((entry) => entry.uuid === uuid);
    if (!ref) return;
    this.#mutate((data) => {
      if (["obligation", "duty", "morality"].includes(table)) {
        if (data.selected.obligations.some((entry) => entry.uuid === ref.uuid)) return;
        data.selected.obligations.push(ref);
      } else if (table === "motivation") {
        if (data.selected.motivations.some((entry) => entry.uuid === ref.uuid)) return;
        data.selected.motivations.push(ref);
      } else if (["culture", "hook", "forceAttitude"].includes(table)) {
        data.selected.background[table] = ref;
      } else {
        // Changing the career invalidates career-tied choices. Clear the selected
        // specialization + its free ranks UNLESS it's still valid for the new career
        // (an in-career spec of the new career, or a universal spec).
        if (table === "career" && data.selected.career?.uuid !== ref.uuid) {
          const newCareerSpecNames = new Set(
            Object.values(ref.snapshot?.system?.specializations ?? {}).map((spec) => spec.name),
          );
          const chosen = data.selected.specialization;
          const stillValid = chosen && (newCareerSpecNames.has(chosen.name) || chosen.snapshot?.system?.universal);
          if (!stillValid) {
            data.selected.specialization = null;
            data.selected.specializationCareerSkillRanks = [];
            data.purchases.xp.talents = []; // the dropped spec's purchased talents go with it
          }
          data.selected.careerCareerSkillRanks = [];
          clearSpeciesSkillRankChoices(data);
        }
        // Switching to a different specialization abandons the previous tree's talents (learned
        // talents live only in data.purchases.xp.talents, never on the ref).
        if (table === "specialization" && data.selected.specialization?.uuid !== ref.uuid) {
          data.purchases.xp.talents = [];
          data.selected.specializationCareerSkillRanks = [];
          clearSpeciesSkillRankChoices(data);
        }
        if (table === "species" && data.selected.species?.uuid !== ref.uuid) {
          clearSpeciesSkillRankChoices(data);
        }
        data.selected[table] = ref;
        if (["species", "career", "specialization"].includes(table)) this.#normalizeXpSkillPurchases(data);
      }
    });
  }

  static _onRemoveObligation(event, target) {
    this.#mutate((data) => { data.selected.obligations = data.selected.obligations.filter((entry) => entry.uuid !== target.dataset.uuid); });
  }

  static _onRemoveMotivation(event, target) {
    this.#mutate((data) => { data.selected.motivations = data.selected.motivations.filter((entry) => entry.uuid !== target.dataset.uuid); });
  }

  static _onRefundGear(event, target) {
    const { purchaseId } = target.dataset;
    this.#mutate((data) => {
      this.#ensureCreditPurchaseIds(data);
      const index = data.purchases.credits.findIndex((purchase) => purchase.id === purchaseId);
      if (index < 0) return;
      data.purchases.credits = data.purchases.credits.filter((purchase) => purchase.id !== purchaseId && purchase.attachTo !== purchaseId);
      if (this.#attachmentTargetId === purchaseId) this.#attachmentTargetId = null;
    });
  }

  static _onBuyGear(event, target) {
    const { uuid } = target.dataset;
    const ref = (this.#pools.gear ?? []).find((entry) => entry.uuid === uuid);
    if (!ref || !isPurchasableShopRef(ref)) return;
    const cost = shopPriceOf(ref);
    this.#mutate((data) => { data.purchases.credits.push({ id: foundry.utils.randomID(16), ref, cost }); });
  }

  static _onAttachmentTarget(event, target) {
    const { purchaseId } = target.dataset;
    this.#attachmentTargetId = this.#attachmentTargetId === purchaseId ? null : purchaseId;
    this.render({ parts: ["gear"] });
  }

  static _onBuyAttachment(event, target) {
    const { uuid, targetId } = target.dataset;
    const ref = (this.#pools.gear ?? []).find((entry) => entry.uuid === uuid);
    if (!ref || !isPurchasableShopRef(ref)) return;
    this.#mutate((data) => {
      this.#ensureCreditPurchaseIds(data);
      const targetPurchase = data.purchases.credits.find((purchase) => purchase.id === targetId);
      if (!canAttach(data, targetPurchase, ref)) return;
      data.purchases.credits.push({ id: foundry.utils.randomID(16), ref, cost: shopPriceOf(ref), attachTo: targetId });
    });
  }

  static async _onEditAttachment(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const { purchaseId } = target.dataset;
    const purchase = this.data.purchases.credits.find((entry) => entry.id === purchaseId && entry.attachTo && entry.ref?.type === "itemattachment");
    if (!purchase) return;

    const source = normalizeWizardEditedItemSnapshot(purchase.ref.snapshot ?? {});
    source.name ??= purchase.ref.name;
    source.type = "itemattachment";
    source.img ??= purchase.ref.img;
    source.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    delete source.id;
    delete source._id;

    const tempItem = await new Item.implementation(source, { temporary: true });
    const persist = (changes = {}) => {
      const current = normalizeWizardEditedItemSnapshot(tempItem.toObject?.(false) ?? tempItem.toJSON?.() ?? source);
      const patch = normalizeWizardEditedItemSnapshot(foundry.utils.expandObject(changes ?? {}), { fillItemModifiers: false });
      const snapshot = normalizeWizardEditedItemSnapshot(foundry.utils.mergeObject(current, patch, { inplace: false }));
      this.#mutate((data) => {
        const edited = data.purchases.credits.find((entry) => entry.id === purchaseId && entry.ref?.type === "itemattachment");
        if (!edited) return;
        edited.ref = {
          ...edited.ref,
          name: snapshot.name ?? edited.ref.name,
          img: snapshot.img ?? edited.ref.img,
          snapshot,
        };
      }, { parts: ["gear"] });
    };

    const originalUpdate = tempItem.update.bind(tempItem);
    tempItem.update = async (changes = {}, options = {}) => {
      const result = await originalUpdate(changes, options);
      persist(changes);
      return result;
    };
    const originalCreateEmbeddedDocuments = tempItem.createEmbeddedDocuments?.bind(tempItem);
    if (originalCreateEmbeddedDocuments) {
      tempItem.createEmbeddedDocuments = async (...args) => {
        const result = await originalCreateEmbeddedDocuments(...args);
        persist();
        return result;
      };
    }
    const originalDeleteEmbeddedDocuments = tempItem.deleteEmbeddedDocuments?.bind(tempItem);
    if (originalDeleteEmbeddedDocuments) {
      tempItem.deleteEmbeddedDocuments = async (...args) => {
        const result = await originalDeleteEmbeddedDocuments(...args);
        persist();
        return result;
      };
    }
    const sheet = tempItem.sheet;
    if (sheet) {
      const originalUpdateObject = sheet._updateObject.bind(sheet);
      sheet._updateObject = async (submitEvent, formData, options = {}) => {
        persist(formData);
        return originalUpdateObject(submitEvent, formData, options);
      };
      const originalClose = sheet.close.bind(sheet);
      sheet.close = async (options = {}) => {
        try {
          if (sheet.form) persist(sheet._getSubmitData?.() ?? {});
        } catch (err) {
          CONFIG.logger?.warn?.(`PC wizard could not persist edited attachment on close: ${err.message}`);
        }
        return originalClose(options);
      };
      sheet.render(true);
    }
  }

  static _onRefundAttachment(event, target) {
    const { purchaseId } = target.dataset;
    this.#mutate((data) => {
      data.purchases.credits = data.purchases.credits.filter((purchase) => purchase.id !== purchaseId);
    });
  }

  static _onInventoryView(event, target) {
    // Pure view toggle — no data change, so bypass #mutate.
    const view = target.dataset.view;
    this.#inventoryView = ["weapon", "armour", "gear"].includes(view) ? view : "weapon";
    this.render({ parts: ["gear"] });
  }

  static _onToggleAvailableAttachments() {
    this.#mutate((data) => {
      const filters = data.gearFilters ?? {};
      data.gearFilters = { ...filters, showOnlyAvailable: !filters.showOnlyAvailable };
    }, { parts: ["gear"] });
  }

  static _onClearGearFilters() {
    this.#mutate((data) => { data.gearFilters = {}; }, { parts: ["gear"] });
  }

  static async _onOpenItem(event, target) {
    const { uuid } = target.dataset;
    if (!uuid) return;
    try {
      const document = await fromUuid(uuid);
      if (!document) throw new Error(`document ${uuid} was not found`);
      document.sheet?.render(true);
    } catch (err) {
      CONFIG.logger?.warn?.(`PC wizard could not open item ${uuid}: ${err.message}`);
      ui.notifications.warn(game.i18n.localize("SWFFG.CharacterCreator.Notify.ItemUnavailable"));
    }
  }

  static _onBuySkill(event, target) {
    // The button carries the pre-computed next rank + its scaled cost (career = rank*5,
    // non-career = rank*5 + 5; see xpSkills in _prepareContext / handleSkillModify). Each
    // purchase records its rank value so a refund can remove exactly the top rank.
    const key = target.dataset.field;
    const value = Number(target.dataset.value);
    const cost = Number(target.dataset.cost);
    if (!key || !Number.isFinite(value)) return;
    this.#mutate((data) => { data.purchases.xp.skills.push({ key, value, cost }); });
  }

  static _onRefundSkill(event, target) {
    // data-value on the minus button is the current (top) rank — remove that purchase.
    const key = target.dataset.field;
    const curValue = Number(target.dataset.value);
    this.#mutate((data) => {
      const index = data.purchases.xp.skills.findIndex((purchase) => purchase.key === key && purchase.value === curValue);
      if (index >= 0) data.purchases.xp.skills.splice(index, 1);
    });
  }

  static async _onSkillInfo(event, target) {
    const { key, label } = target.dataset;
    const map = await this.#ensureSkillDescriptions();
    const raw = map[(label ?? "").toLowerCase()] ?? map[(key ?? "").toLowerCase()] ?? "";
    if (!raw) return;
    // Enrich so the SW FFG dice/symbol codes (e.g. [BO], [SU]) render as icons; classes:["starwarsffg"]
    // scopes the system's icon CSS into the dialog.
    const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(raw);
    await foundry.applications.api.DialogV2.wait({
      window: { title: label || key },
      classes: ["starwarsffg"],
      position: { width: Math.round(window.innerWidth * 0.7) },
      content: `<div class="ffg-skill-info">${enriched}</div>`,
      buttons: [{ action: "close", label: "Close", default: true }],
      rejectClose: false,
    });
  }

  static _onToggleCareerRank(event, target) {
    const skill = target.dataset.field;
    if (!isSelectableSkillName(skill)) return;
    this.#mutate((data) => {
      const cap = getFreeRankCaps(data).career;
      const list = data.selected.careerCareerSkillRanks;
      const index = list.indexOf(skill);
      if (index >= 0) list.splice(index, 1); // remove a free rank
      else if (list.length < cap) list.push(skill); // add, capped by selected data
      this.#normalizeXpSkillPurchases(data);
    });
  }

  static _onToggleSpecRank(event, target) {
    const skill = target.dataset.field;
    if (!isSelectableSkillName(skill)) return;
    this.#mutate((data) => {
      const cap = getFreeRankCaps(data).specialization;
      const list = data.selected.specializationCareerSkillRanks;
      const index = list.indexOf(skill);
      if (index >= 0) list.splice(index, 1); // remove a free rank
      else if (list.length < cap) list.push(skill); // add, capped by selected data
      this.#normalizeXpSkillPurchases(data);
    });
  }

  static _onToggleSpeciesRank(event, target) {
    const { choice, field } = target.dataset;
    this.#mutate((data) => {
      toggleSpeciesSkillRankChoice(data, choice, field);
      this.#normalizeXpSkillPurchases(data);
    });
  }

  static _onSelectSpeciesRankChoiceBranch(event, target) {
    const { group, choice } = target.dataset;
    this.#mutate((data) => {
      selectSpeciesSkillRankChoiceBranch(data, group, choice);
      this.#normalizeXpSkillPurchases(data);
    });
  }

  static _onBuyForcePower(event, target) {
    const { uuid } = target.dataset;
    const cost = Number(target.dataset.cost);
    const ref = (this.#pools.forcePower ?? []).find((entry) => entry.uuid === uuid);
    if (!ref) return;
    this.#mutate((data) => { data.purchases.xp.forcePowers.push({ ref, cost }); });
  }

  static _onRefundForcePower(event, target) {
    const { uuid } = target.dataset;
    this.#mutate((data) => { data.purchases.xp.forcePowers = data.purchases.xp.forcePowers.filter((purchase) => purchase.ref?.uuid !== uuid); });
  }

  static _onBackgroundView(event, target) {
    const view = target.dataset.view;
    if (!["culture", "hook", "forceAttitude"].includes(view)) return;
    this.#backgroundView = this.#backgroundView === view ? null : view;
    this.render({ parts: ["background"] });
  }

  static _onRandomBackground(event, target) {
    const sectionKey = target.dataset.view;
    const type = { culture: "culture", hook: "hook", forceAttitude: "attitude" }[sectionKey];
    if (!type) return;
    const search = (this.#backgroundSearch[sectionKey] ?? "").trim().toLowerCase();
    const choices = (this.#pools.background ?? []).filter((ref) => {
      if (ref.snapshot?.system?.type !== type) return false;
      return !search || (ref.name ?? "").toLowerCase().includes(search);
    });
    if (!choices.length) return;
    const ref = choices[Math.floor(Math.random() * choices.length)];
    this.#mutate((data) => { data.selected.background[sectionKey] = ref; });
  }

  static _onObligationView(event, target) {
    const view = target.dataset.view;
    if (!["obligation", "duty", "morality"].includes(view)) return;
    this.#obligationView = this.#obligationView === view ? null : view;
    this.render({ parts: ["obligation"] });
  }

  static _onRandomObligation(event, target) {
    const sectionKey = target.dataset.view;
    if (!["obligation", "duty", "morality"].includes(sectionKey)) return;
    const search = (this.#obligationSearch[sectionKey] ?? "").trim().toLowerCase();
    const selected = new Set(this.data.selected.obligations.map((entry) => entry.uuid));
    const choices = (this.#pools.obligation ?? []).filter((ref) => {
      if (ref.snapshot?.system?.type !== sectionKey) return false;
      if (selected.has(ref.uuid)) return false;
      return !search || (ref.name ?? "").toLowerCase().includes(search);
    });
    if (!choices.length) return;
    const ref = choices[Math.floor(Math.random() * choices.length)];
    this.#mutate((data) => { data.selected.obligations.push(ref); });
  }

  static _onRandomListPick(event, target) {
    const poolKey = target.dataset.poolKey;
    if (poolKey !== "motivation") return;
    const search = (this.#listSearch[poolKey] ?? "").trim().toLowerCase();
    const selected = new Set(this.data.selected[`${poolKey}s`].map((entry) => entry.uuid));
    const choices = (this.#pools[poolKey] ?? []).filter((ref) => {
      if (selected.has(ref.uuid)) return false;
      return !search || (ref.name ?? "").toLowerCase().includes(search);
    });
    if (!choices.length) return;
    const ref = choices[Math.floor(Math.random() * choices.length)];
    this.#mutate((data) => { data.selected[`${poolKey}s`].push(ref); });
  }

  static _onCharacteristicControl(event, target) {
    const key = target.dataset.target;
    const curValue = parseInt(target.dataset.value, 10);
    const increase = target.dataset.direction === "increase";
    if (increase && curValue >= 5) return; // FFG caps creation-time characteristic raises at 5
    this.#mutate((data) => {
      const steps = data.purchases.xp.characteristics;
      if (increase) {
        const newValue = curValue + 1;
        steps.push({ key, value: newValue, cost: newValue * 10 }); // FFG: raising to rating N costs N×10 XP
      } else {
        // Remove only the purchased step that produced the current value — never drop below the
        // species base. (Guards the legacy unguarded splice(-1) that removed the wrong step.)
        const idx = steps.findIndex((p) => p.key === key && p.value === curValue);
        if (idx >= 0) steps.splice(idx, 1);
      }
    });
  }

  static _onXpView(event, target) {
    // Pure view toggle — no data change, so bypass #mutate (no draft save / commit re-mint).
    const view = target.dataset.view;
    this.#xpView = ["characteristics", "bonus", "skills", "talents"].includes(view) ? view : "characteristics";
    this.render({ parts: ["xp_spend"] });
  }

  // Learned talents live ONLY in data.purchases.xp.talents ({ key, cost }) — never written onto
  // the specialization ref (which is the shared, module-cached pool object). That single source of
  // truth lives in this.data, which is rebuilt fresh on every wizard open, so nothing survives a
  // close/reopen.
  _onDedicationCharacteristicChange(event) {
    const key = event.currentTarget.dataset.key;
    const characteristic = event.currentTarget.value;
    const validCharacteristics = new Set(Object.keys(this.buildDeps.creationDefaults.system?.characteristics ?? {}));
    this.#mutate((data) => {
      const talent = data.selected.specialization?.snapshot?.system?.talents?.[key];
      if (!isDedicationTalent(talent)) return;
      const purchase = data.purchases.xp.talents.find((entry) => entry.key === key);
      if (!purchase) return;
      if (validCharacteristics.has(characteristic)) purchase.characteristic = characteristic;
      else delete purchase.characteristic;
    });
  }

  static _onLearnTalent(event, target) {
    const key = target.dataset.key;
    this.#mutate((data) => {
      const talents = data.selected.specialization?.snapshot?.system?.talents;
      if (!talents) return;
      const learned = new Set(data.purchases.xp.talents.map((purchase) => purchase.key));
      if (!canLearn(talents, learned, key)) return; // gated by the shared connected-to-root rule
      data.purchases.xp.talents.push({ key, cost: talentTierCost(Number(key.slice(6))) });
    });
  }

  static _onUnlearnTalent(event, target) {
    const key = target.dataset.key;
    this.#mutate((data) => {
      const talents = data.selected.specialization?.snapshot?.system?.talents;
      if (!talents) return;
      const learned = new Set(data.purchases.xp.talents.map((purchase) => purchase.key));
      if (!learned.delete(key)) return;
      // Safe unlearn: keep only talents still connected to the root row; anything orphaned by
      // this removal is dropped (and refunded) alongside it.
      const keep = rootConnectedKeys(talents, learned);
      data.purchases.xp.talents = data.purchases.xp.talents.filter((purchase) => keep.has(purchase.key));
    });
  }


  _onStartingBonusChange(event) {
    const choice = event.currentTarget.value || null;
    this.#mutate((data) => { applyStartingBonus(data, choice); });
  }

  _onRulesChange(event) {
    const rules = event.currentTarget.value;
    if (!["fad", "aor", "eote"].includes(rules)) return;
    this.#mutate((data) => {
      data.selected.rules = rules;
      applyStartingBonus(data, null);
      this.#obligationView = obligationKeyForRules(rules);
      if (rules !== "fad" && this.#backgroundView === "forceAttitude") this.#backgroundView = "culture";
    });
  }

  static _onOpenSources() {
    this.#sourcesOpen = !this.#sourcesOpen;
    this.render({ parts: ["header"] });
  }

  static async _onToggleSource(event, target) {
    const poolKey = target?.dataset?.table;
    const sourceId = target?.dataset?.field;
    if (!poolKey || !sourceId) return;

    const exclusions = setSourceEnabled(readExclusions(), poolKey, sourceId, target.checked);
    await game.user.setFlag(FLAG_SCOPE, FLAGS.sourceSelection, exclusions);
    invalidateSourceCache(poolKey);
    delete this.#pools[poolKey];
    this.#sourcesOpen = true;
    this.render();
  }

  static async _onResumeDraft() {
    try {
      const record = await this.draftStore.load();
      if (record) {
        this.data = record.data;
        this.#draft.commit = record.commit ?? null;
        this.#draftBannerDismissed = true;
        invalidateSourceCache();
        this.#pools = {};
        for (const warning of record.warnings ?? []) ui.notifications.warn(game.i18n.localize(warning));
        this.render(true);
      }
    } catch (err) {
      const key = err instanceof NewerSchemaError ? "SWFFG.CharacterCreator.Draft.Newer"
        : err instanceof CorruptDraftError ? "SWFFG.CharacterCreator.Draft.Corrupt" : null;
      if (key) ui.notifications.warn(game.i18n.localize(key));
    }
  }

  static async _onDiscardDraft() {
    await this.draftStore.clear();
    this.data = createInitialData();
    this.#draft.commit = null;
    this.#draftBannerDismissed = true;
    invalidateSourceCache();
    this.#pools = {};
    this.render(true);
  }

  static _onCommit() {
    this.#runCommit();
  }

  async #confirmAdvisoryWarnings(warnings = validateDraft(this.data).warnings) {
    if (!warnings.length) return true;
    const escape = foundry.utils.escapeHTML ?? ((value) => String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char])));
    const items = warnings.map((key) => `<li>${escape(game.i18n.localize(key))}</li>`).join("");
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("SWFFG.CharacterCreator.ConfirmWarnings.Title") },
      classes: ["starwarsffg", "charCreator"],
      content: `<div class="pcw-warning-confirm"><p>${game.i18n.localize("SWFFG.CharacterCreator.ConfirmWarnings.Message")}</p><ul>${items}</ul></div>`,
      buttons: [
        { action: "create", label: game.i18n.localize("SWFFG.CharacterCreator.ConfirmWarnings.CreateAnyway"), default: true },
        { action: "back", label: game.i18n.localize("SWFFG.CharacterCreator.ConfirmWarnings.GoBack") },
      ],
      rejectClose: false,
    });
    return action === "create";
  }

  /** The commit sequence: freeze identity on the first attempt, save, then request the build. */
  async #runCommit() {
    if (this.#commitPhase !== "editing") return;
    const warnings = validateDraft(this.data).warnings;
    if (!await this.#confirmAdvisoryWarnings(warnings)) return;
    this.#commitPhase = "committing";
    this.draftStore.lock();

    if (!this.#draft.commit) {
      const xp = calcXp(this.data);
      this.#draft.commit = {
        commitId: this.data.commitId,
        userId: game.user.id,
        firstAttemptAt: new Date().toISOString(),
        xp: { total: xp.total, available: xp.available },
      };
      this.draftStore.setCommit(this.#draft.commit);
    }

    try {
      setPending(wizardPending, this.#sessionNoticeId, { commitId: this.data.commitId });
      emitStartNotice(this.#sessionNoticeId, this.data.commitId); // unconditional preCommit flush
      await this.draftStore.saveNow({ data: this.data, commit: this.#draft.commit });

      const built = await buildPreviewActor(this.data, this.buildDeps);
      const source = built.previewActor.toObject();

      if (game.user.isGM) {
        // A GM can create the actor directly — game.socket.emit does NOT deliver back to
        // the sender, so a GM must never round-trip its own request through the bridge.
        try {
          const actor = await commitBuild(source, this.#draft.commit);
          this._onCommitResponse({ ok: true, requesterId: game.user.id, commitId: this.data.commitId, actorId: actor.id, actorName: actor.name });
        } catch (err) {
          CONFIG.logger?.warn?.(`PC wizard commit failed: ${err.message}`);
          this._onCommitResponse({ ok: false, requesterId: game.user.id, commitId: this.data.commitId });
        }
        return;
      }

      // Players ask the active GM to create the actor, then await the authenticated response.
      emitCommitRequest(source, this.#draft.commit, warnings);
      this.#commitTimer = window.setTimeout(() => this._onCommitTimeout(), COMMIT_TIMEOUT_MS);
    } catch (err) {
      CONFIG.logger?.warn?.(`PC wizard commit preparation failed: ${err.message}`);
      clearPending(wizardPending, this.#sessionNoticeId);
      showSubmitToast(false);
      this.#backToEditing();
    }
  }

  _onCommitResponse(response) {
    if (response.requesterId !== game.user.id || response.commitId !== this.data.commitId) return;
    window.clearTimeout(this.#commitTimer);
    if (response.ok) {
      this.#commitPhase = "committed";
      showSubmitToast(true);
      this.draftStore.idle().then(() => this.draftStore.clear()).then(() => this.close());
      game.actors.get(response.actorId)?.sheet?.render(true);
    } else {
      this.#backToEditing();
    }
  }

  _onCommitTimeout() {
    showSubmitToast(false);
    this.#backToEditing();
  }

  #backToEditing() {
    this.#commitPhase = "editing";
    this.draftStore.unlock(); // draft intact; a retry reuses the frozen identity
    this.render({ parts: ["review"] });
  }

  /** @override — preserve the minimized-animation guard verbatim, then D9 cleanup + a final save. */
  async close(options = {}) {
    try {
      clearPending(wizardPending, this.#sessionNoticeId);
      if (this.#commitPhase === "editing") {
        this.draftStore.unlock();
        await this.draftStore.saveNow({ data: this.data, commit: this.#draft.commit });
      }
      const closeOptions = this.minimized && options.animate !== false ? { ...options, animate: false } : options;
      return await super.close(closeOptions);
    } finally {
      if (CharacterCreator.#activeInstance === this) CharacterCreator.#activeInstance = null;
    }
  }
}
