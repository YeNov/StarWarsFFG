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
import { validateDraft } from "./validate.js";
import { calcXp, calcCredits, calcObligation } from "./calculators.js";
import { loadSource } from "./load-source.js";
import { DraftStore } from "./draft-store.js";
import { NewerSchemaError, CorruptDraftError } from "./draft-schema.js";
import { emitCommitRequest, wizardPending, setCommitResponseHandler } from "./socket-bridge.js";
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
    background: { template: `${PC_WIZARD}/tabs/background.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`, `${PC_WIZARD}/item_pill.html`] },
    startingBonus: { template: `${PC_WIZARD}/tabs/startingBonus.html` },
    obligation: { template: `${PC_WIZARD}/tabs/obligation.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`] },
    species: { template: `${PC_WIZARD}/tabs/species.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`] },
    career: { template: `${PC_WIZARD}/tabs/career.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`] },
    xp_spend: { template: `${PC_WIZARD}/tabs/xp_spend.html` },
    gear: { template: `${PC_WIZARD}/tabs/gear.html`, templates: [`${PC_WIZARD}/parts/gear-filters.html`, `${PC_WIZARD}/parts/pickable-table.html`] },
    motivation: { template: `${PC_WIZARD}/tabs/motivation.html`, templates: [`${PC_WIZARD}/parts/pickable-table.html`] },
    review: { template: `${PC_WIZARD}/tabs/review.html` },
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
        { id: "xp_spend", label: "xp_spend" },
        { id: "gear", label: "gear" },
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
      "buy-skill": CharacterCreator._onBuySkill,
      "refund-skill": CharacterCreator._onRefundSkill,
      "select-starting-bonus": CharacterCreator._onSelectStartingBonus,
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
  };

  #commitPhase = "editing";
  #draft = { commit: null };
  #sessionNoticeId = mintSessionNoticeId();
  #pools = {};
  #commitTimer = null;

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
    for (const poolKey of ["species", "career", "obligation", "motivation", "gear", "background"]) {
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

    return {
      tabs: this._prepareTabs("primary"),
      data: this.data,
      pools: this.#pools,
      isForceAndDestiny: this.data.selected.rules === "fad",
      totalXp: xp.total,
      availableXp: xp.available,
      totalCredits: credits.total,
      availableCredits: credits.available,
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

  /** The single mutation funnel + commit barrier. */
  #mutate(fn) {
    if (this.#commitPhase !== "editing") return false;
    if (this.#draft.commit) this.#remintCommitId(); // edit after an attempt ⇒ new identity
    fn(this.data);
    this.draftStore.scheduleSave({ data: this.data, commit: this.#draft.commit });
    this.render({ parts: ["header", "preview"] }); // targeted, never a full re-render per keystroke
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
    this.#mutate((data) => {
      data.gearFilters = { ...(data.gearFilters ?? {}), [field]: event.currentTarget.value };
    });
  }

  // --- click actions (bound with `this` = the app instance) --------------------------

  static _onSelect(event, target) {
    const { uuid, table } = target.dataset;
    const ref = (this.#pools[table] ?? []).find((entry) => entry.uuid === uuid);
    if (!ref) return;
    this.#mutate((data) => {
      if (["obligation", "motivation"].includes(table)) data.selected[`${table}s`].push(ref);
      else if (["culture", "hook", "forceAttitude"].includes(table)) data.selected.background[table] = ref;
      else data.selected[table] = ref;
    });
  }

  static _onRemoveObligation(event, target) {
    this.#mutate((data) => { data.selected.obligations = data.selected.obligations.filter((entry) => entry.uuid !== target.dataset.uuid); });
  }

  static _onRemoveMotivation(event, target) {
    this.#mutate((data) => { data.selected.motivations = data.selected.motivations.filter((entry) => entry.uuid !== target.dataset.uuid); });
  }

  static _onRefundGear(event, target) {
    this.#mutate((data) => { data.purchases.credits = data.purchases.credits.filter((purchase) => purchase.ref?.uuid !== target.dataset.uuid); });
  }

  static _onBuySkill(event, target) {
    this.#mutate((data) => { data.purchases.xp.skills.push({ key: target.dataset.field, cost: 5 }); });
  }

  static _onRefundSkill(event, target) {
    this.#mutate((data) => {
      const index = data.purchases.xp.skills.findIndex((purchase) => purchase.key === target.dataset.field);
      if (index >= 0) data.purchases.xp.skills.splice(index, 1);
    });
  }

  static _onSelectStartingBonus(event, target) {
    this.#mutate((data) => { applyStartingBonus(data, target.dataset.field); });
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
    emitCommitRequest(built.previewActor.toObject(), this.#draft.commit);
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
