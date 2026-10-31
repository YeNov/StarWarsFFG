/**
 * The roll options card (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Side
 * card"): the Foundry-side half of the card, shared by the dice dialog (RollBuilderFFG) and the
 * initiative dialog (CombatFFG), so both offer, plan, draw, roll and charge options the same way
 * (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md, "Sharing the card's code").
 *
 * A card belongs to one roll. It reads the rolling actor's items once: the optional buffs that fit
 * the skill, and the roll options their linked macros hold (loaded and parsed by `load`). Each
 * `plan` resolves the rows against a base pool the dialog passes in, with the live values of that
 * moment; `pool` layers the ticked rows onto that base; `attach` and `render` hang the card on the
 * dialog's window and keep it drawn. What the card shows is worked out by the pure helpers in
 * roll-option-card.js, and what it does to the dice by roll-option-pool.js; this file only holds
 * the state between them and talks to Foundry.
 */
import { layerPool, optionDiceRows } from "./roll-option-pool.js";
import { boostSupply } from "./optional-buff-pool.js";
import PopoutEditor from "../popout-editor.js";
import { collectOfferedBuffs, withAppliedBuffs } from "../helpers/optional-buffs-offer.js";
import { parseOptionText } from "../helpers/roll-options.js";
import { collectOfferedOptions, linkedMacroUuids } from "../helpers/roll-options-offer.js";
import { liveOptionValues, planOptionStates, rollOptionInputs, swapValues } from "../helpers/roll-option-costs.js";
import { cardPanelContext, formatRollOptionsLine, keepOffered, rollOptionCardEntries, tickedRowCount } from "../helpers/roll-option-card.js";
import { chargeRollOptionCost, localizeRollOptionText } from "../helpers/roll-option-hooks.js";

/** The card's content, re-rendered on every change. */
const PANEL_TEMPLATE = "systems/starwarsffg/templates/dice/parts/roll-options-panel.html";

/** A plan with nothing in it, until the first real one. */
const EMPTY_PLAN = Object.freeze({ rows: [], selection: {}, choices: {}, strain: 0, maneuvers: 0, after: null });

/**
 * Load and parse the option macros these uuids name. A macro that is gone or whose text does not
 * validate is left out, with a console warning. Uuids already in `cache` are not fetched again, so
 * one cache can serve several actors.
 * @param {string[]} uuids
 * @param {Map<string, {ok: true, options: object[]}>} [cache]
 * @returns {Promise<Map<string, {ok: true, options: object[]}>>} the cache
 */
export async function loadOptionMacros(uuids, cache = new Map()) {
  for (const uuid of uuids ?? []) {
    if (cache.has(uuid)) continue;
    try {
      const macro = await foundry.utils.fromUuid(uuid);
      if (!macro) {
        CONFIG.logger.warn(`Roll option macro ${uuid} was not found; its options are skipped.`);
        continue;
      }
      const parsed = parseOptionText(macro.command);
      if (!parsed.ok) {
        CONFIG.logger.warn(`Roll option macro "${macro.name}" (${uuid}) has errors; its options are skipped.`);
        continue;
      }
      cache.set(uuid, parsed);
    } catch (error) {
      CONFIG.logger.warn(`Could not load roll option macro ${uuid}: ${error}`);
    }
  }
  return cache;
}

export class RollOptionsCard {
  /** Parsed option macros by uuid, once loaded. */
  #macros = null;
  /** A sent pool's ticked options and picked branches, applied once the options they name have loaded. */
  #pendingOptions = null;
  #pendingChoices = null;
  /** The base pool and layers the latest plan was made with. */
  #env = { basePool: null, defence: 0, adversaryRanks: 0, adversaryMode: false };
  /** The card element on the dialog's window, once attached. */
  #panel = null;
  #bound = new WeakSet();

  /**
   * @param {object} params
   * @param {Actor|null} [params.actor] - the actor the roll is for (a crew member for a crew roll)
   * @param {object|null} [params.item] - the item rolled with
   * @param {{key: string|null, characteristic: number|null, rank: number|null}} [params.skill]
   * @param {boolean} [params.initiative] - an initiative roll
   * @param {Array<{key: string, name: string}>} [params.appliedBuffs] - buffs baked into an older sent pool
   * @param {object|null} [params.sent] - a sent pool's layers (readSentLayers), or null
   * @param {Array<Item>} [params.extraItems] - items besides the actor's whose buffs the roll offers (a homestead's upgrades)
   */
  constructor({ actor = null, item = null, skill = { key: null, characteristic: null, rank: null }, initiative = false, appliedBuffs = [], sent = null, extraItems = [] } = {}) {
    this.actor = actor ?? null;
    this.extraItems = Array.isArray(extraItems) ? extraItems : [];
    this.item = item ?? null;
    this.skill = { key: skill?.key ?? null, characteristic: skill?.characteristic ?? null, rank: skill?.rank ?? null };
    this.initiative = initiative === true;
    this.appliedBuffs = Array.isArray(appliedBuffs) ? appliedBuffs : [];
    /** The optional buffs this roll offers, and the keys of those the player ticked. */
    this.buffs = this.#collectBuffs();
    this.tickedBuffKeys = new Set();
    // A sent pool's buffs arrive ticked and unlocked (one baked into an older message stays locked).
    for (const key of sent?.buffs ?? []) {
      if (this.buffs.some((buff) => buff.key === key && !buff.applied)) this.tickedBuffKeys.add(key);
    }
    /** The Two weapons switch: "no", "same" or "different". */
    this.twoWeapons = this.twoWeaponsAvailable ? (sent?.twoWeapons ?? "no") : "no";
    /**
     * Everything read off the rolling actor goes through rollOptionInputs, which turns a roll with
     * no actor into no items, Force rating 0 and no payer.
     */
    this.inputs = this.#readInputs();
    this.offered = [];
    /** Ticked keys → amounts; branches picked on rows with choices; amounts typed into unticked rows. */
    this.selection = {};
    this.choices = {};
    this.amounts = {};
    /** The description of the talent or item behind each row, drawn as the sheets draw it. */
    this.tooltips = new Map();
    this.states = EMPTY_PLAN;
    this.#pendingOptions = sent?.options ?? null;
    this.#pendingChoices = sent?.choices ?? null;
  }

  /** Whether this roll offers Two weapons: an attack with a personal weapon. */
  get twoWeaponsAvailable() {
    return this.item?.type === "weapon";
  }

  /** Load the macros the actor's items link, once, and offer their options. Does not plan. */
  async load() {
    if (this.#macros) return;
    this.#macros = await loadOptionMacros(linkedMacroUuids(this.inputs.items));
    await this.#offer();
    // A sent pool's options arrive ticked; the next plan unticks any that no longer fit.
    if (this.#pendingOptions) {
      this.selection = { ...this.#pendingOptions };
      this.#pendingOptions = null;
    }
    if (this.#pendingChoices) {
      this.choices = { ...this.#pendingChoices };
      this.#pendingChoices = null;
    }
  }

  /**
   * Offer the card for another skill, as when an initiative roll switches between Vigilance and
   * Cool: the buffs and options are read again, and ticks, branches and buff ticks the new offer
   * still has rows for are kept. Does not plan.
   * @param {{key: string|null, characteristic: number|null, rank: number|null}} skill
   */
  async setSkill({ key = null, characteristic = null, rank = null } = {}) {
    if (!this.#macros) await this.load();
    this.skill = { key, characteristic, rank };
    this.inputs = this.#readInputs();
    this.buffs = this.#collectBuffs();
    await this.#offer();
    const kept = keepOffered(
      { selection: this.selection, choices: this.choices, buffKeys: this.tickedBuffKeys },
      { offered: this.offered, buffs: this.buffs.filter((buff) => !buff.applied) },
    );
    this.selection = kept.selection;
    this.choices = kept.choices;
    this.tickedBuffKeys = kept.buffKeys;
  }

  /**
   * Re-plan the rows from the current selection, picks and Two weapons choice. The live values
   * (Force dice left, the Destiny pool) are read anew every time, so the plan made at Roll uses the
   * values of that moment, and the pool, the chat line and the charge all come from it.
   *
   * An option with a minimum difficulty (Against The Odds: Daunting) is judged on the pool with
   * every other ticked effect and the Adversary upgrade, so the plan is made twice when one is
   * offered: once to build that pool, once with its count.
   * @param {{basePool: DicePoolFFG, defence?: number, adversaryRanks?: number, adversaryMode?: boolean}} env
   * @returns {object} the plan (planOptionStates)
   */
  plan({ basePool, defence = 0, adversaryRanks = 0, adversaryMode = false } = {}) {
    this.#env = { basePool, defence, adversaryRanks, adversaryMode };
    const common = {
      offered: this.offered,
      selection: this.selection,
      choices: this.choices,
      twoWeapons: this.twoWeapons,
      pool: this.inputs.pool,
      canCharge: this.inputs.canCharge,
      live: this.#liveValues(),
      boostBase: boostSupply(basePool, this.tickedBuffs()),
      swapAvailable: this.#swapAvailable(),
    };
    let states = planOptionStates(common);
    if (this.offered.some((option) => option.minDifficulty != null)) {
      states = planOptionStates({ ...common, difficultyCount: this.#difficultyCount(states) });
    }
    this.selection = states.selection;
    this.choices = states.choices;
    this.states = states;
    return states;
  }

  /**
   * The pool to show and roll: the ticked buffs, Two weapons and the ticked options of the latest
   * plan layered onto `basePool`, then defence and the Adversary upgrade (roll-option-pool.js).
   * Always a new pool: the base the player's edits change is never touched.
   * @param {{basePool: DicePoolFFG, defence?: number, adversaryRanks?: number, adversaryMode?: boolean}} env
   * @returns {DicePoolFFG}
   */
  pool({ basePool, defence = 0, adversaryRanks = 0, adversaryMode = false } = {}) {
    return layerPool(basePool, {
      buffs: this.tickedBuffs(),
      rows: optionDiceRows(this.tickedOptions(), this.twoWeapons),
      skill: this.#skillLayer(this.states),
      defence,
      adversaryRanks,
      adversaryMode,
    });
  }

  /** The ticked optional buffs that still need adding to the pool. */
  tickedBuffs() {
    return this.buffs.filter((buff) => !buff.applied && this.tickedBuffKeys.has(buff.key));
  }

  /** The optional buffs in the pool: those already in a sent pool, then those ticked here. */
  buffsInPool() {
    return [...this.buffs.filter((buff) => buff.applied), ...this.tickedBuffs()];
  }

  /** The ticked roll options as the latest plan resolved them, with their floors, for optionDiceRows. */
  tickedOptions() {
    const offered = new Map(this.offered.map((option) => [option.key, option]));
    return (this.states?.rows ?? [])
      .filter((row) => row.ticked && offered.has(row.key))
      .map((row) => ({ dice: row.dice ?? {}, floor: offered.get(row.key).difficultyFloor ?? null }));
  }

  /** The chat line's entries for the latest plan. */
  entries() {
    return rollOptionCardEntries({
      offered: this.offered,
      states: this.states,
      twoWeapons: this.twoWeapons,
      unit: this.inputs.pool?.unit === "wounds" ? "wounds" : "strain",
    });
  }

  /** The chat card's roll options line, or null: for the entries given (a click-time snapshot), else the latest plan's. */
  rollOptionsText(entries = this.entries()) {
    return formatRollOptionsLine(entries, localizeRollOptionText);
  }

  /** The chat card's optional buffs line, or null. */
  optionalBuffsText() {
    const buffs = this.buffsInPool();
    return buffs.length > 0
      ? game.i18n.format("SWFFG.OptionalBuffs.CardLine", { names: buffs.map(RollOptionsCard.buffLabel).join(", ") })
      : null;
  }

  /**
   * What to charge once the roll has posted: the latest plan's strain (wounds, for a rival), through
   * the GM bridge's queue, for the actor the roll is for. Null when nothing is owed.
   * @param {Array<object>} entries - from entries()
   * @returns {(() => Promise<void>)|null}
   */
  chargeAfterPost(entries) {
    const strain = this.states.strain;
    const actor = this.actor;
    return strain > 0 && actor ? () => chargeRollOptionCost(actor, strain, entries) : null;
  }

  /** What a pool sent to a player carries of the card (roll-option-sent.js). */
  sentSelections() {
    return {
      options: this.states.selection,
      choices: this.states.choices,
      buffs: this.tickedBuffs().map((buff) => buff.key),
      twoWeapons: this.twoWeapons,
    };
  }

  /** A buff's name for the card and the chat line. */
  static buffLabel(buff) {
    return buff.name || game.i18n.localize("SWFFG.OptionalBuffs.Unnamed");
  }

  /**
   * Hang the card on the window and listen on it.
   *
   * `.window-content` sets `overflow: hidden`, so the card, which hangs off the window's right edge,
   * is moved out of the content to be a direct child of the application element (paired with the
   * dialog's overflow rule in mandar.css). The listeners are delegated on the card itself, which
   * keeps its element while its content is re-rendered: option ticks, amounts and branches, buff
   * ticks, the Two weapons switch and the fold tab. Each changes the card's state, then calls
   * `onChange`, which re-plans and redraws.
   * @param {HTMLElement} appElement - the dialog's application element
   * @param {() => (void|Promise<void>)} onChange
   */
  attach(appElement, onChange) {
    const panel = appElement?.querySelector?.(".ffg-roll-options-panel");
    if (!panel) return;
    if (panel.parentElement !== appElement) appElement.appendChild(panel);
    this.#panel = panel;
    if (this.#bound.has(panel)) return;
    this.#bound.add(panel);
    panel.addEventListener("change", (event) => {
      const optionTick = event.target.closest?.(".ffg-ro-option-tick");
      if (optionTick) {
        const key = optionTick.dataset.optionKey;
        if (optionTick.checked) this.selection[key] = this.amounts[key] ?? 1;
        else delete this.selection[key];
        onChange();
        return;
      }
      const amount = event.target.closest?.(".ffg-ro-amount");
      if (amount) {
        const key = amount.dataset.optionKey;
        const value = Math.max(1, Math.trunc(Number(amount.value)) || 1);
        this.amounts[key] = value;
        if (key in this.selection) this.selection[key] = value;
        onChange();
        return;
      }
      const tick = event.target.closest?.(".optional-buff-tick");
      if (!tick) return;
      if (tick.checked) this.tickedBuffKeys.add(tick.dataset.buffKey);
      else this.tickedBuffKeys.delete(tick.dataset.buffKey);
      onChange();
    });
    panel.addEventListener("click", (event) => {
      const toggle = event.target.closest?.(".ffg-roll-options-toggle");
      if (toggle) {
        event.preventDefault();
        const collapsed = panel.classList.toggle("ffg-ro-collapsed");
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        return;
      }
      const choice = event.target.closest?.("[data-two-weapons]");
      if (choice) {
        event.preventDefault();
        this.twoWeapons = choice.dataset.twoWeapons;
        onChange();
        return;
      }
      const branch = event.target.closest?.("[data-option-choice]");
      if (branch) {
        event.preventDefault();
        this.choices[branch.dataset.optionKey] = branch.dataset.optionChoice;
        onChange();
      }
    });
  }

  /**
   * Draw the card from the current state. It shows only when the roll has something to offer; it
   * starts folded, and folded, its tab shows how many rows are ticked.
   */
  async render() {
    const panel = this.#panel;
    if (!panel) return;
    const context = cardPanelContext({
      twoWeaponsAvailable: this.twoWeaponsAvailable,
      twoWeapons: this.twoWeapons,
      buffs: this.buffs,
      tickedBuffKeys: this.tickedBuffKeys,
      offered: this.offered,
      states: this.states,
      amounts: this.amounts,
      tooltips: this.tooltips,
      pool: this.inputs.pool,
      localize: localizeRollOptionText,
    });
    const show = context.twoWeapons.available || context.buffs.length > 0 || (context.options?.length ?? 0) > 0;
    panel.classList.toggle("ffg-ro-open", show);
    panel.setAttribute("aria-hidden", show ? "false" : "true");
    const inner = panel.querySelector(".ffg-roll-options-inner");
    if (inner) inner.innerHTML = show ? await foundry.applications.handlebars.renderTemplate(PANEL_TEMPLATE, context) : "";
    const count = tickedRowCount({ buffs: this.buffs, tickedBuffKeys: this.tickedBuffKeys, states: this.states, twoWeapons: this.twoWeapons });
    const badge = panel.querySelector(".ffg-roll-options-count");
    if (badge) badge.textContent = count > 0 ? String(count) : "";
    const toggle = panel.querySelector(".ffg-roll-options-toggle");
    toggle?.setAttribute("title", count > 0
      ? `${game.i18n.localize("SWFFG.RollOptions.Panel.Toggle")} (${game.i18n.format("SWFFG.RollOptions.Panel.Ticked", { count })})`
      : game.i18n.localize("SWFFG.RollOptions.Panel.Toggle"));
  }

  /** The optional buffs this roll offers, read from the rolling actor's items (and any extra ones) for the skill. */
  #collectBuffs() {
    try {
      const item = this.item;
      const offered = collectOfferedBuffs({
        items: [...(this.actor?.items ?? []), ...this.extraItems],
        skillKey: this.skill.key,
        weaponId: item?.type === "weapon" ? (item.id ?? item._id ?? null) : null,
        isForcePower: item?.type === "forcepower",
      });
      return withAppliedBuffs(offered, this.appliedBuffs);
    } catch (error) {
      CONFIG.logger.warn(`Could not read the optional buffs for this roll: ${error}`);
      return withAppliedBuffs([], this.appliedBuffs);
    }
  }

  #readInputs() {
    return rollOptionInputs(this.actor, {
      skillKey: this.skill.key,
      item: this.item,
      configuredSkills: CONFIG.FFG?.skills ?? null,
      hasActiveGM: !!game.users?.activeGM,
      initiative: this.initiative,
    });
  }

  /** Offer the loaded options for the current inputs, and draw the descriptions of new rows. */
  async #offer() {
    this.offered = collectOfferedOptions({ items: this.inputs.items, macros: this.#macros ?? new Map(), context: this.inputs.context });
    for (const option of this.offered) {
      if (!option.description || this.tooltips.has(option.key)) continue;
      try {
        this.tooltips.set(option.key, await PopoutEditor.renderDiceImages(option.description, this.actor));
      } catch (error) {
        CONFIG.logger.warn(`Could not draw the description of roll option "${option.label}": ${error}`);
      }
    }
  }

  /** What the live words stand for now: the rolling actor's Force dice left, and the Destiny pool. */
  #liveValues() {
    let destiny = {};
    try {
      destiny = { destinyLight: game.settings.get("starwarsffg", "dPoolLight"), destinyDark: game.settings.get("starwarsffg", "dPoolDark") };
    } catch {
      destiny = {};
    }
    return liveOptionValues(this.actor, destiny);
  }

  /** Whether a swap can rebuild this roll's dice: it needs the actor, the characteristic and the rank. */
  #swapAvailable() {
    const { characteristic, rank } = this.skill;
    return !!this.actor && characteristic !== null && Number.isFinite(Number(characteristic))
      && rank !== null && Number.isFinite(Number(rank));
  }

  /** The skill layer for a plan: the rolled characteristic and rank, and a ticked swap's values. */
  #skillLayer(states) {
    const offered = new Map(this.offered.map((option) => [option.key, option]));
    const swap = { characteristic: null, skill: null };
    for (const row of states?.rows ?? []) {
      const option = row.ticked ? offered.get(row.key) : null;
      if (!option) continue;
      swap.characteristic ??= option.characteristic ?? null;
      swap.skill ??= option.skill ?? null;
    }
    const values = swap.characteristic || swap.skill ? swapValues(this.actor, swap) : { swapCharacteristic: null, swapRank: null };
    return { characteristic: this.skill.characteristic, rank: this.skill.rank, ...values };
  }

  /**
   * Difficulty and challenge dice in the pool a plan gives, leaving out the rows that wait for a
   * minimum difficulty themselves, with defence and the Adversary upgrade as the roll would have them.
   */
  #difficultyCount(states) {
    const offered = new Map(this.offered.map((option) => [option.key, option]));
    const applied = (states?.rows ?? [])
      .filter((row) => row.ticked && offered.has(row.key) && offered.get(row.key).minDifficulty == null)
      .map((row) => ({ dice: row.dice ?? {}, floor: offered.get(row.key).difficultyFloor ?? null }));
    const { basePool, defence, adversaryRanks, adversaryMode } = this.#env;
    const pool = layerPool(basePool, {
      buffs: this.tickedBuffs(),
      rows: optionDiceRows(applied, this.twoWeapons),
      skill: this.#skillLayer(states),
      defence,
      adversaryRanks,
      adversaryMode,
    });
    return (Number(pool.difficulty) || 0) + (Number(pool.challenge) || 0);
  }
}
