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
import { createInitialData } from "./wizard-state.js";
import { applyStartingBonus } from "./starting-bonus.js";
import { prepareTalentTree, rootConnectedKeys, canLearn, talentTierCost } from "./talent-selection.js";
import { validateDraft, getFreeRankCaps } from "./validate.js";
import {
  clearSpeciesSkillRankChoices,
  getSpeciesSkillRankChoiceStatus,
  prepareSpeciesSkillRankChoiceSections,
  selectSpeciesSkillRankChoiceBranch,
  toggleSpeciesSkillRankChoice,
} from "./species-skill-choices.js";
import { calcXp, calcCredits, calcObligation } from "./calculators.js";
import { invalidateSourceCache, loadSource, readExclusions } from "./load-source.js";
import { SOURCE_DESCRIPTORS, isSourceEnabled, sourceIdOf, sourceSettingPackIds, setSourceEnabled } from "./source-descriptors.js";
import { DraftStore } from "./draft-store.js";
import { NewerSchemaError, CorruptDraftError } from "./draft-schema.js";
import { emitCommitRequest, wizardPending, setCommitResponseHandler } from "./socket-bridge.js";
import { commitBuild } from "./commit-service.js";
import { mintSessionNoticeId, emitStartNotice, showSubmitToast } from "./notify.js";
import { setPending, clearPending } from "./notify-policy.js";
import { COMMIT_TIMEOUT_MS, FLAG_SCOPE, FLAGS } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PC_WIZARD = "systems/starwarsffg/templates/wizards/pc_wizard";

function shopPriceOf(ref) {
  const price = Number(ref?.snapshot?.system?.price?.value);
  return Number.isFinite(price) ? price : null;
}

function isPurchasableShopRef(ref) {
  const price = shopPriceOf(ref);
  return price !== null && price > 0;
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

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static #activeInstance = null;

  static get isOpen() {
    return Boolean(CharacterCreator.#activeInstance);
  }

  static open(options = {}) {
    const active = CharacterCreator.#activeInstance;
    if (active) {
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

  /** @override — the verified tab order minus the dropped `rules` tab; opens on `background`. */
  static TABS = {
    primary: {
      tabs: [
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
      initial: "background",
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
      "inventory-view": CharacterCreator._onInventoryView,
      "clear-gear-filters": CharacterCreator._onClearGearFilters,
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
      "open-sources": CharacterCreator._onOpenSources,
      "toggle-source": CharacterCreator._onToggleSource,
      "resume-draft": CharacterCreator._onResumeDraft,
      "discard-draft": CharacterCreator._onDiscardDraft,
      commit: CharacterCreator._onCommit,
    },
    position: { width: 950, height: 800 },
    classes: ["starwarsffg", "wizard", "charCreator"],
  };

  /** Per-part change/input bindings (issue B) — attached only within each part's element. */
  static PART_BINDINGS = {
    background: [{ selector: "input[data-field='backgroundSearch']", event: "input", handler: "_onBackgroundSearchInput" }],
    species: [{ selector: "input[data-field='speciesSearch']", event: "input", handler: "_onSpeciesSearchInput" }],
    gear: [{ selector: "[data-field]", event: "change", handler: "_onGearFilterChange" }],
    startingBonus: [{ selector: "select[name='startingBonus']", event: "change", handler: "_onStartingBonusChange" }],
    forcePower: [{ selector: "input[data-discount]", event: "change", handler: "_onToggleForcePowerDiscount" }],
  };

  #commitPhase = "editing";
  #draft = { commit: null };
  #sessionNoticeId = mintSessionNoticeId();
  #pools = {};
  #commitTimer = null;
  #xpView = "bonus"; // xp_spend sub-view: "bonus" | "skills" | "talents" (transient, not persisted to draft)
  #inventoryView = "weapon"; // Inventory sub-view: "weapon" | "armour" | "gear" (transient)
  #backgroundView = "culture"; // Background accordion: "culture" | "hook" | "forceAttitude" (transient)
  #backgroundSearch = { culture: "", hook: "", forceAttitude: "" }; // Background accordion name filters (transient)
  #speciesSearch = ""; // Species tab name filter (transient, not persisted to draft)
  #skillDescriptions = null; // cached { ffgimportid|name (lowercased): description html }
  #sourcesOpen = false; // Content-source overlay state (transient)

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
    for (const poolKey of ["species", "career", "obligation", "motivation", "gear", "background", "specialization", "forcePower"]) {
      try { await this.#ensurePool(poolKey); } catch { /* pool unavailable in this world */ }
    }

    const xp = calcXp(this.data);
    const credits = calcCredits(this.data);
    const obligation = calcObligation(this.data);
    const validation = validateDraft(this.data);
    const sourceGroups = this.#prepareSourceGroups(readExclusions());

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

    // Starting-bonus radio choices for the current ruleset (i18n keys → localized labels).
    const bonusTable = CONFIG.FFG?.characterCreator?.startingBonusesRadio?.[this.data.selected.rules] ?? {};
    const startingBonusChoices = Object.entries(bonusTable).map(([key, labelKey]) => ({ key, label: game.i18n.localize(labelKey) }));

    // Flat skill list for the XP-spend tab (the preview panel's column layout is separate).
    // Each row carries the prepared rank, whether it's a career skill, and the cost of the
    // NEXT rank (career rank*5, non-career rank*5 + 5).
    const skillPurchases = this.data.purchases.xp.skills;
    const skillDescriptions = await this.#ensureSkillDescriptions();
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

    // Review verification (RAW): a skill cannot exceed rank 2 at character creation. Flag — never
    // block — any that do, so the review tab can highlight them.
    const skillCapWarnings = xpSkills.filter((skill) => skill.rank > 2).map((skill) => ({ label: skill.label, rank: skill.rank }));

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
    const careerSkillNames = Object.values(this.data.selected.career?.snapshot?.system?.careerSkills ?? {}).filter(Boolean);
    const careerPicked = this.data.selected.careerCareerSkillRanks;
    const careerFreeRanks = careerSkillNames.map((name) => {
      const picked = careerPicked.includes(name);
      return { key: name, picked, canToggle: picked || careerPicked.length < freeRankCaps.career };
    });
    const specSkillNames = Object.values(this.data.selected.specialization?.snapshot?.system?.careerSkills ?? {}).filter(Boolean);
    const specPicked = this.data.selected.specializationCareerSkillRanks;
    const specFreeRanks = specSkillNames.map((name) => {
      const picked = specPicked.includes(name);
      return { key: name, picked, canToggle: picked || specPicked.length < freeRankCaps.specialization };
    });
    const speciesFreeRankChoiceSections = prepareSpeciesSkillRankChoiceSections(this.data, xpSkills);
    const speciesFreeRankStatus = getSpeciesSkillRankChoiceStatus(this.data);
    const bonusSkillWarnings = [
      { label: "Career bonus skills", used: careerPicked.length, expected: freeRankCaps.career },
      { label: "Specialization bonus skills", used: specPicked.length, expected: freeRankCaps.specialization },
      ...speciesFreeRankStatus.entries.map((entry) => ({
        label: `Species bonus skills: ${entry.label}`,
        used: entry.used,
        expected: entry.expected,
      })),
    ].filter((entry) => entry.used !== entry.expected);

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
    const learnedTalentKeys = this.data.purchases.xp.talents.map((purchase) => purchase.key);
    const talentTree = specForTree?.snapshot?.system?.talents
      ? prepareTalentTree(specForTree.snapshot.system.talents, learnedTalentKeys, xp.available)
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
    const matchesSearch = (ref) => !invSearch || (ref?.name ?? "").toLowerCase().includes(invSearch);
    const shopItems = (this.#pools.gear ?? [])
      .filter((ref) => {
        const price = shopPriceOf(ref);
        return ref.type === invView && isPurchasableShopRef(ref) && matchesSearch(ref)
          && price >= invMinPrice && (!invMaxPrice || price <= invMaxPrice);
      })
      .map((ref) => {
        const price = shopPriceOf(ref);
        return { uuid: ref.uuid, name: ref.name, img: ref.img, price, affordable: price <= credits.available };
      });
    const ownedItems = this.data.purchases.credits
      .filter((purchase) => purchase.ref?.type === invView && matchesSearch(purchase.ref))
      .map((purchase) => ({ uuid: purchase.ref.uuid, name: purchase.ref.name, img: purchase.ref.img, cost: purchase.cost }));

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
      pools,
      speciesRows,
      speciesMatchCount,
      speciesNoMatches,
      speciesSearch: this.#speciesSearch,
      isForceAndDestiny,
      backgroundSections,
      forceRating,
      forcePowers,
      startingBonusChoices,
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
      inventoryFilters: invFilters,
      shopItems,
      ownedItems,
      encumbrance,
      obligationKey: obligation.key,
      availableObligation: obligation.available,
      steps: validation.steps,
      warnings: validation.warnings,
      bonusSkillWarnings,
      skillCapWarnings,
      sourceGroups,
      sourcesOpen: this.#sourcesOpen,
      actor: preview,
    };
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
  #mutate(fn, { parts } = {}) {
    if (this.#commitPhase !== "editing") return false;
    if (this.#draft.commit) this.#remintCommitId(); // edit after an attempt ⇒ new identity
    fn(this.data);
    this.draftStore.scheduleSave({ data: this.data, commit: this.#draft.commit });
    // Per-part `scrollable: [""]` (PARTS) preserves each tab section's scroll across the
    // re-render, so a long tab (e.g. the skills list) keeps its position on every click.
    if (parts) this.render({ parts });
    else this.render();
    return true;
  }

  #remintCommitId() {
    const superseded = this.data.commitId;
    this.data.commitId = foundry.utils.randomID(16);
    this.#draft.commit = null;
    this.draftStore.setCommit(null);
    CONFIG.logger?.debug?.(`PC wizard: superseded commit ${superseded} — reminted ${this.data.commitId}`);
  }

  /** Load a content pool once and re-render the parts that display it. */
  async #ensurePool(poolKey) {
    if (this.#pools[poolKey]) return;
    this.#pools[poolKey] = await loadSource(poolKey);
  }

  #prepareSourceGroups(exclusions) {
    return Object.entries(SOURCE_DESCRIPTORS).map(([poolKey, descriptor]) => {
      const packIds = sourceSettingPackIds(game.settings.get(FLAG_SCOPE, descriptor.settingKey));
      const sources = packIds.map((packId) => {
        const pack = game.packs.get(packId);
        const sourceId = pack ? sourceIdOf(pack) : packId;
        return {
          id: sourceId,
          label: pack?.metadata?.label ?? pack?.title ?? pack?.metadata?.id ?? packId,
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
        sources,
      };
    });
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

  _onGearFilterChange(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.value;
    this.#mutate((data) => {
      data.gearFilters = { ...(data.gearFilters ?? {}), [field]: value };
    }, { parts: ["gear"] });
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
    const sourcePool = ["culture", "hook", "forceAttitude"].includes(table) ? this.#pools.background : this.#pools[table];
    const ref = (sourcePool ?? []).find((entry) => entry.uuid === uuid);
    if (!ref) return;
    this.#mutate((data) => {
      if (["obligation", "motivation"].includes(table)) {
        data.selected[`${table}s`].push(ref);
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
    const { uuid } = target.dataset;
    this.#mutate((data) => {
      const index = data.purchases.credits.findIndex((purchase) => purchase.ref?.uuid === uuid);
      if (index >= 0) data.purchases.credits.splice(index, 1); // remove ONE owned instance
    });
  }

  static _onBuyGear(event, target) {
    const { uuid } = target.dataset;
    const ref = (this.#pools.gear ?? []).find((entry) => entry.uuid === uuid);
    if (!ref || !isPurchasableShopRef(ref)) return;
    const cost = shopPriceOf(ref);
    this.#mutate((data) => { data.purchases.credits.push({ ref, cost }); });
  }

  static _onInventoryView(event, target) {
    // Pure view toggle — no data change, so bypass #mutate.
    const view = target.dataset.view;
    this.#inventoryView = ["weapon", "armour", "gear"].includes(view) ? view : "weapon";
    this.render({ parts: ["gear"] });
  }

  static _onClearGearFilters() {
    this.#mutate((data) => { data.gearFilters = {}; }, { parts: ["gear"] });
  }

  static async _onOpenItem(event, target) {
    const { uuid } = target.dataset;
    if (!uuid) return;
    const document = await fromUuid(uuid);
    document?.sheet?.render(true);
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
    this.#mutate((data) => {
      const cap = getFreeRankCaps(data).career;
      const list = data.selected.careerCareerSkillRanks;
      const index = list.indexOf(skill);
      if (index >= 0) list.splice(index, 1); // remove a free rank
      else if (list.length < cap) list.push(skill); // add, capped by selected data
    });
  }

  static _onToggleSpecRank(event, target) {
    const skill = target.dataset.field;
    this.#mutate((data) => {
      const cap = getFreeRankCaps(data).specialization;
      const list = data.selected.specializationCareerSkillRanks;
      const index = list.indexOf(skill);
      if (index >= 0) list.splice(index, 1); // remove a free rank
      else if (list.length < cap) list.push(skill); // add, capped by selected data
    });
  }

  static _onToggleSpeciesRank(event, target) {
    const { choice, field } = target.dataset;
    this.#mutate((data) => {
      toggleSpeciesSkillRankChoice(data, choice, field);
    });
  }

  static _onSelectSpeciesRankChoiceBranch(event, target) {
    const { group, choice } = target.dataset;
    this.#mutate((data) => {
      selectSpeciesSkillRankChoiceBranch(data, group, choice);
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
    this.#xpView = ["bonus", "skills", "talents"].includes(view) ? view : "bonus";
    this.render({ parts: ["xp_spend"] });
  }

  // Learned talents live ONLY in data.purchases.xp.talents ({ key, cost }) — never written onto
  // the specialization ref (which is the shared, module-cached pool object). That single source of
  // truth lives in this.data, which is rebuilt fresh on every wizard open, so nothing survives a
  // close/reopen.
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
    this.render(true);
  }

  static _onCommit() {
    this.#runCommit();
  }

  /** The commit sequence: freeze identity on the first attempt, save, then request the build. */
  async #runCommit() {
    if (this.#commitPhase !== "editing") return;
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
    emitCommitRequest(source, this.#draft.commit);
    this.#commitTimer = window.setTimeout(() => this._onCommitTimeout(), COMMIT_TIMEOUT_MS);
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
