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
import { validateDraft } from "./validate.js";
import { calcXp, calcCredits, calcObligation } from "./calculators.js";
import { loadSource } from "./load-source.js";
import { DraftStore } from "./draft-store.js";
import { NewerSchemaError, CorruptDraftError } from "./draft-schema.js";
import { emitCommitRequest, wizardPending, setCommitResponseHandler } from "./socket-bridge.js";
import { commitBuild } from "./commit-service.js";
import { mintSessionNoticeId, emitStartNotice, showSubmitToast } from "./notify.js";
import { setPending, clearPending } from "./notify-policy.js";
import { COMMIT_TIMEOUT_MS } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PC_WIZARD = "systems/starwarsffg/templates/wizards/pc_wizard";

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
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
      "buy-skill": CharacterCreator._onBuySkill,
      "refund-skill": CharacterCreator._onRefundSkill,
      "characteristic-control": CharacterCreator._onCharacteristicControl,
      "xp-view": CharacterCreator._onXpView,
      "learn-talent": CharacterCreator._onLearnTalent,
      "unlearn-talent": CharacterCreator._onUnlearnTalent,
      "toggle-career-rank": CharacterCreator._onToggleCareerRank,
      "toggle-spec-rank": CharacterCreator._onToggleSpecRank,
      "buy-forcepower": CharacterCreator._onBuyForcePower,
      "refund-forcepower": CharacterCreator._onRefundForcePower,
      "open-sources": CharacterCreator._onOpenSources,
      "resume-draft": CharacterCreator._onResumeDraft,
      "discard-draft": CharacterCreator._onDiscardDraft,
      commit: CharacterCreator._onCommit,
    },
    position: { width: 950, height: 800 },
    classes: ["starwarsffg", "wizard", "charCreator"],
  };

  /** Per-part change/input bindings (issue B) — attached only within each part's element. */
  static PART_BINDINGS = {
    gear: [{ selector: "[data-field]", event: "change", handler: "_onGearFilterChange" }],
    startingBonus: [{ selector: "select[name='startingBonus']", event: "change", handler: "_onStartingBonusChange" }],
    forcePower: [{ selector: "input[data-discount]", event: "change", handler: "_onToggleForcePowerDiscount" }],
  };

  #commitPhase = "editing";
  #draft = { commit: null };
  #sessionNoticeId = mintSessionNoticeId();
  #pools = {};
  #commitTimer = null;
  #xpView = "skills"; // xp_spend sub-view: "skills" | "talents" (transient, not persisted to draft)
  #inventoryView = "weapon"; // Inventory sub-view: "weapon" | "armour" | "gear" (transient)

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
    const pools = { ...this.#pools, culture: ofType("culture"), hook: ofType("hook"), forceAttitude: ofType("attitude") };

    // Starting-bonus radio choices for the current ruleset (i18n keys → localized labels).
    const bonusTable = CONFIG.FFG?.characterCreator?.startingBonusesRadio?.[this.data.selected.rules] ?? {};
    const startingBonusChoices = Object.entries(bonusTable).map(([key, labelKey]) => ({ key, label: game.i18n.localize(labelKey) }));

    // Flat skill list for the XP-spend tab (the preview panel's column layout is separate).
    // Each row carries the prepared rank, whether it's a career skill, and the cost of the
    // NEXT rank (career rank*5, non-career rank*5 + 5).
    const skillPurchases = this.data.purchases.xp.skills;
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
        return { key, label: skill.label ?? key, rank, careerskill, nextValue, nextCost, canBuy, canRefund };
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

    // Free skill ranks: 4 chosen from the career's career-skills, 2 from the specialization's.
    // These feed rankGrants -> toItemData (baked as +1-rank AEs on the career/spec item), so
    // applyBuild already applies them to the built actor; the picker only drives the arrays.
    const careerSkillNames = Object.values(this.data.selected.career?.snapshot?.system?.careerSkills ?? {}).filter(Boolean);
    const careerPicked = this.data.selected.careerCareerSkillRanks;
    const careerFreeRanks = careerSkillNames.map((name) => {
      const picked = careerPicked.includes(name);
      return { key: name, picked, canToggle: picked || careerPicked.length < 4 };
    });
    const specSkillNames = Object.values(this.data.selected.specialization?.snapshot?.system?.careerSkills ?? {}).filter(Boolean);
    const specPicked = this.data.selected.specializationCareerSkillRanks;
    const specFreeRanks = specSkillNames.map((name) => {
      const picked = specPicked.includes(name);
      return { key: name, picked, canToggle: picked || specPicked.length < 2 };
    });

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
          return { uuid: ref.uuid, name: ref.name, baseCost, discounted, cost, requiredRating: ref.snapshot?.system?.required_force_rating, bought, canBuy: !bought && cost <= xp.available };
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
    const invView = this.#inventoryView; // "weapon" | "armour" | "gear"
    const invFilters = this.data.gearFilters ?? {};
    const invSearch = (invFilters.search ?? "").toLowerCase();
    const invMaxPrice = Number(invFilters.maxPrice) || 0;
    const priceOf = (ref) => Number(ref?.snapshot?.system?.price?.value) || 0;
    const matchesSearch = (ref) => !invSearch || (ref?.name ?? "").toLowerCase().includes(invSearch);
    const shopItems = (this.#pools.gear ?? [])
      .filter((ref) => ref.type === invView && matchesSearch(ref) && (!invMaxPrice || priceOf(ref) <= invMaxPrice))
      .map((ref) => {
        const price = priceOf(ref);
        return { uuid: ref.uuid, name: ref.name, img: ref.img, price, affordable: price <= credits.available };
      });
    const ownedItems = this.data.purchases.credits
      .filter((purchase) => purchase.ref?.type === invView && matchesSearch(purchase.ref))
      .map((purchase) => ({ uuid: purchase.ref.uuid, name: purchase.ref.name, cost: purchase.cost }));

    return {
      tabs,
      data: this.data,
      pools,
      isForceAndDestiny: this.data.selected.rules === "fad",
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
      specFreeRanks,
      specFreeUsed: specPicked.length,
      totalXp: xp.total,
      availableXp: xp.available,
      totalCredits: credits.total,
      availableCredits: credits.available,
      inventoryView: invView,
      inventoryFilters: invFilters,
      shopItems,
      ownedItems,
      obligationKey: obligation.key,
      availableObligation: obligation.available,
      steps: validation.steps,
      warnings: validation.warnings,
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

  _onGearFilterChange(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.value;
    this.#mutate((data) => {
      data.gearFilters = { ...(data.gearFilters ?? {}), [field]: value };
    }, { parts: ["gear"] });
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
    const ref = (this.#pools[table] ?? []).find((entry) => entry.uuid === uuid);
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
        }
        // Switching to a different specialization abandons the previous tree's talents (learned
        // talents live only in data.purchases.xp.talents, never on the ref).
        if (table === "specialization" && data.selected.specialization?.uuid !== ref.uuid) {
          data.purchases.xp.talents = [];
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
    if (!ref) return;
    const cost = Number(ref.snapshot?.system?.price?.value) || 0;
    this.#mutate((data) => { data.purchases.credits.push({ ref, cost }); });
  }

  static _onInventoryView(event, target) {
    // Pure view toggle — no data change, so bypass #mutate.
    const view = target.dataset.view;
    this.#inventoryView = ["weapon", "armour", "gear"].includes(view) ? view : "weapon";
    this.render({ parts: ["gear"] });
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

  static _onToggleCareerRank(event, target) {
    const skill = target.dataset.field;
    this.#mutate((data) => {
      const list = data.selected.careerCareerSkillRanks;
      const index = list.indexOf(skill);
      if (index >= 0) list.splice(index, 1); // remove a free rank
      else if (list.length < 4) list.push(skill); // add, capped at 4
    });
  }

  static _onToggleSpecRank(event, target) {
    const skill = target.dataset.field;
    this.#mutate((data) => {
      const list = data.selected.specializationCareerSkillRanks;
      const index = list.indexOf(skill);
      if (index >= 0) list.splice(index, 1); // remove a free rank
      else if (list.length < 2) list.push(skill); // add, capped at 2
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
    this.#xpView = target.dataset.view === "talents" ? "talents" : "skills";
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
    const panel = this.element.querySelector(".sources-panel");
    if (panel) panel.style.display = panel.style.display === "none" ? "" : "none";
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
    clearPending(wizardPending, this.#sessionNoticeId);
    if (this.#commitPhase === "editing") {
      this.draftStore.unlock();
      await this.draftStore.saveNow({ data: this.data, commit: this.#draft.commit });
    }
    const closeOptions = this.minimized && options.animate !== false ? { ...options, animate: false } : options;
    return super.close(closeOptions);
  }
}
