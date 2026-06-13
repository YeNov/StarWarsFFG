/**
 * CODEX II — ground-up bespoke sheets.
 *
 * These sheets KEEP all behaviour from the stock sheet classes (equip, quantity,
 * rest/heal, XP purchase, dice pools, drag-drop — everything in ActorSheetFFG /
 * AdversarySheetFFG) and only swap the VIEW: bespoke `.cdx-*` markup + a
 * self-contained styles/cdx.css that never reuses a mandar-styled class. The
 * three contracts the new templates must honour are the input `name=` paths,
 * the listener-hook classes/`data-` attributes, and the render guards.
 *
 * Insulation from the active theme (mandar.css), learned the hard way:
 *  - We DROP the actor-type legacy class (`character`/`minion`/…) from the
 *    content <form>, so mandar's `form.window-content.character …` structural
 *    rules (fixed sheet-body height, etc.) simply do not match us. Our own
 *    container layout lives under `.cdx` in cdx.css.
 *  - Tabs are ours (`.cdx-tab` / `.cdx-pane`, toggled in JS below) instead of
 *    `nav.sheet-tabs`, so mandar's absolute side-pinned tab-strip rule never
 *    applies.
 *  - The palette is a PER-ACTOR flag (`flags.starwarsffg.scheme`) applied as a
 *    `scheme-*` class on the form; an in-sheet strip writes it.
 */
import { ActorSheetFFG } from "./actor-sheet-ffg.js";
import { AdversarySheetFFG } from "./adversary-sheet-ffg.js";
import { CdxPillStack } from "./cdx-pill-stack.js";
import DiceHelpers from "../helpers/dice-helpers.js";
import { killMinionGroup } from "../helpers/minions.js";

export const CDX_SCHEMES = ["republic", "empire", "dark", "light", "mercenary"];
const CDX_TEMPLATES = "systems/starwarsffg/templates/actors/codex";

/** The default Codex colour scheme, derived from the Default Sheet Theme setting
 *  (value `codex-<scheme>`), used when a document has no per-document scheme flag.
 *  Falls back to republic (also covers the legacy bare "codex" value). */
export function cdxDefaultScheme() {
  try {
    const t = String(game.settings.get("starwarsffg", "defaultSheetTheme") ?? "");
    const s = t.startsWith("codex-") ? t.slice("codex-".length) : null;
    return CDX_SCHEMES.includes(s) ? s : "republic";
  } catch (e) { return "republic"; }
}

/**
 * Codex alignment — drives the Force chip's background colour (neutral=white,
 * good=blue, evil=red). A per-actor flag `flags.starwarsffg.codexAlignment` ∈
 * {neutral, good, evil} is the manually-set baseline; the *effective* alignment
 * applies Morality with hysteresis:
 *   - neutral: stays neutral while Morality ∈ [30,70]; ≥71 → good, ≤29 → evil
 *   - good:    stays good until Morality drops to ≤29 → evil
 *   - evil:    stays evil until Morality reaches ≥71 → good
 * Morality of 0 / unset is treated as "not tracked" (template default is 0), so
 * the baseline is returned unchanged — a Force user who doesn't use the Morality
 * system isn't painted evil. A genuinely evil 0-Morality actor can be set
 * "evil" by hand.
 */
export const CDX_ALIGNMENTS = ["neutral", "good", "evil"];
export function cdxEffectiveAlignment(stored, moralityRaw) {
  const s = CDX_ALIGNMENTS.includes(stored) ? stored : "neutral";
  if (moralityRaw === null || moralityRaw === undefined || moralityRaw === "") return s;
  const m = Number(moralityRaw) || 0;
  if (m <= 0) return s; // 0 / untracked → keep the baseline
  if (s === "good") return m <= 29 ? "evil" : "good";
  if (s === "evil") return m >= 71 ? "good" : "evil";
  return m >= 71 ? "good" : (m <= 29 ? "evil" : "neutral");
}

// Persist alignment transitions: when an actor's Morality crosses a boundary,
// commit the new alignment to the flag so the state is sticky (true hysteresis)
// instead of being recomputed from the baseline every time. Only the user who
// made the change writes (no multi-client races); only actors that already carry
// the flag (i.e. configured via a Codex sheet) are touched; the follow-up
// setFlag carries no Morality delta so it can't re-trigger this.
Hooks.on("updateActor", async (actor, changed, options, userId) => {
  try {
    if (userId !== game.user?.id) return;
    if (!foundry.utils.hasProperty(changed, "system.morality.value")) return;
    const current = actor.getFlag("starwarsffg", "codexAlignment");
    if (current === undefined) return;
    const next = cdxEffectiveAlignment(current, actor.system?.morality?.value);
    if (next !== current) await actor.setFlag("starwarsffg", "codexAlignment", next);
  } catch (e) { /* never let a hook break actor updates */ }
});

/**
 * Shared Codex behaviour, mixed onto whichever stock sheet base a given actor
 * type uses. Applied to ActorSheetFFG and AdversarySheetFFG below.
 */
export const CodexSchemeMixin = (Base) => class extends Base {
  // Concatenated onto the base's classes by ApplicationV2 → the OUTER window
  // <div> ends up `…actor v2 cdx`. `cdx` is our CSS scope.
  static DEFAULT_OPTIONS = {
    classes: ["cdx"],
  };

  /** The per-actor palette, defaulting to republic. */
  _cdxScheme() {
    const s = this.actor?.getFlag?.("starwarsffg", "scheme");
    return CDX_SCHEMES.includes(s) ? s : cdxDefaultScheme();
  }

  /**
   * Replace (not extend) the legacy root classes: return ONLY the palette
   * class. Deliberately does NOT call super — that would re-add the actor-type
   * class (`character`/…) and let mandar's structural form rules match us. The
   * editable/locked classes are still applied by the base _applyLegacyRootClasses.
   * @override
   */
  _getLegacyRootClasses(_context = {}) {
    return [`scheme-${this._cdxScheme()}`];
  }

  /**
   * Strip stale `scheme-*` before super re-adds the current one (the base only
   * ever ADDS classes), so switching palettes doesn't accumulate them.
   * @override
   */
  _applyLegacyRootClasses(form, context = {}) {
    for (const s of CDX_SCHEMES) form.classList.remove(`scheme-${s}`);
    super._applyLegacyRootClasses(form, context);
  }

  /** @override — add the Codex-only listeners on top of the stock ones. */
  activateListeners(html) {
    super.activateListeners(html);
    this._cdxActivate(html);
  }

  /** @override — drop the pill-stack's document listener when the sheet closes. */
  async close(options = {}) {
    this._cdxPillStack?.destroy();
    this._cdxPillStack = null;
    this._cdxXpBuy = false; // never persist XP-buy mode across reopenings
    return super.close(options);
  }

  /**
   * @override — fix skill-rank purchase for the Codex markup. The stock _buyCore
   * resolves the skill row by walking a FIXED three parents up from the clicked
   * icon (event.target.parentElement ×3); our bespoke skills grid nests the icon
   * one level shallower, so that walk overshoots the row (lands on the column)
   * and _buySkillRank gets no data-ability — the buy silently fails. Resolve the
   * row by data-ability instead, which is nesting-independent. Every other buy
   * action is untouched and defers to super.
   */
  async _buyCore(event) {
    if (event?.target?.dataset?.buyAction === "skill") {
      if (this.actor?.verifyEditModeIsNotEnabled?.() === false) return;
      const row = event.target.closest?.("[data-ability]");
      if (row) await this._buySkillRank(row);
      return;
    }
    return super._buyCore(event);
  }

  _cdxActivate(html) {
    const root = html?.[0] ?? this.form ?? this.element;
    if (!root) return;

    // mandar forces `overflow: visible !important` on the content <form> (it
    // scrolls its own .sheet-body, which our bespoke layout doesn't have). A
    // CSS override can't reliably win that !important battle, so set it inline
    // (inline !important beats any stylesheet rule) — this makes the form the
    // scroll container so the body stops overflowing the window.
    const form = this.form;
    if (form) {
      form.style.setProperty("overflow-y", "auto", "important");
      form.style.setProperty("overflow-x", "hidden", "important");
    }

    // Reflect FFG edit mode as a class so view-only chrome can hide itself when
    // editing is off — e.g. the career-skill ("CS") column, which is redundant
    // with the left career highlight. Mirrors data.disabled in the base getData.
    const editOn = !!(
      this.actor?.getFlag?.("starwarsffg", "config.enableEditMode") &&
      this.actor?.getFlag?.("starwarsffg", "config.editModeActor") === game.user?.id
    );
    (form ?? root).classList.toggle("cdx-editmode", editOn);

    // Bespoke tab switching — no Foundry Tabs controller, no .sheet-tabs.
    root.querySelectorAll(".cdx-tab").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const tab = ev.currentTarget.dataset.tab;
        if (!tab) return;
        root.querySelectorAll(".cdx-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
        root.querySelectorAll(".cdx-pane").forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
        // remember the active tab across re-renders (e.g. on a scheme change)
        this._cdxTab = tab;
      });
    });
    // Restore the remembered tab after a re-render.
    if (this._cdxTab) {
      const has = root.querySelector(`.cdx-tab[data-tab="${this._cdxTab}"]`);
      if (has) {
        root.querySelectorAll(".cdx-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === this._cdxTab));
        root.querySelectorAll(".cdx-pane").forEach((p) => p.classList.toggle("active", p.dataset.tab === this._cdxTab));
      }
    }

    // Collapsible pill stacks (specializations, force powers, signature
    // abilities, …): a reusable widget owns the click handling — first click
    // expands, a click on a pill opens that item's tree, a click anywhere else
    // collapses — and consumes every click so none leaks to the sheet beneath.
    this._cdxPillStack?.destroy();
    this._cdxPillStack = new CdxPillStack(root, {
      onActivate: (id) => { this.actor?.items?.get(id)?.sheet?.render(true); },
      onDelete: (id) => {
        if (this.actor?.verifyEditModeIsNotEnabled?.() === false) return;
        this.actor?.items?.get(id)?.delete();
      },
    });

    // XP-buy mode: clicking the XP chip reveals every purchase affordance (skill
    // upgrades, characteristic/talent/spec/force/signature buys); otherwise they
    // are hidden (see `.cdx-xpbuy` in cdx.css). The flag is TRANSIENT — held on
    // the instance, re-applied on re-render, and reset in close() — so it never
    // persists across reopenings and always starts hidden.
    // Edit mode and buy mode are mutually exclusive (purchases are blocked while
    // editing): edit mode forces buy mode off and makes the XP chip inert.
    if (editOn) this._cdxXpBuy = false;
    (form ?? root).classList.toggle("cdx-xpbuy", !!this._cdxXpBuy);
    root.querySelectorAll(".cdx-xp").forEach((chip) => {
      chip.classList.toggle("active", !!this._cdxXpBuy);
      if (editOn) return; // XP chip is not clickable while edit mode is on
      chip.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._cdxXpBuy = !this._cdxXpBuy;
        (form ?? root).classList.toggle("cdx-xpbuy", this._cdxXpBuy);
        chip.classList.toggle("active", this._cdxXpBuy);
      });
    });

    // Weapon-card dice pools (skill roll preview) — render for viewers too.
    this._cdxWeaponPools(root);

    // Equip toggle: consume clicks on the whole button so they never leak to the
    // card's expand handler. (Clicking the button box outside the glyph used to
    // also expand the card, since the stock handler only skips icon/rollable targets.)
    root.querySelectorAll(".cdx-equip").forEach((el) => {
      el.addEventListener("click", (ev) => ev.stopPropagation());
    });

    // Force powers / signature abilities (Talents tab): clicking the card should
    // expand inline details, NOT open the item's tree. The stock `.items .item`
    // handler opens the sheet for these types; intercept in the capture phase so
    // we beat that bubble handler. Control clicks (edit/delete/roll) pass through;
    // clicks inside an already-open detail block don't toggle it shut.
    root.addEventListener("click", (ev) => {
      const card = ev.target.closest?.(".cdx-talent[data-item-id]");
      if (!card || ev.target.closest(".item-control")) return;
      const item = this.actor?.items?.get(card.dataset.itemId);
      if (!item || !["forcepower", "signatureability"].includes(item.type)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.target.closest(".item-details")) return;
      this._itemDisplayDetails(item, { preventDefault() {}, currentTarget: card });
    }, true);

    if (!this.options.editable) return;
    this._cdxWireCredits(root);
    // Alignment selector (bio) → write the Codex alignment flag; the chip recolours
    // on the resulting re-render.
    root.querySelector(".cdx-align-select")?.addEventListener("change", (ev) => {
      const v = ev.currentTarget.value;
      if (CDX_ALIGNMENTS.includes(v)) this.actor?.setFlag("starwarsffg", "codexAlignment", v);
    });
    this._cdxWireAmmo(root);
    // Strain recovery — open the token-action-hud-ffgsw post-encounter utility.
    root.querySelectorAll(".cdx-strain-rest").forEach((btn) => {
      btn.addEventListener("click", (ev) => { ev.preventDefault(); this._cdxStrainRecovery(); });
    });
    // Wounds / strain steppers (−/+). Floored at 0 but NOT capped at the
    // threshold — current wounds/strain may exceed the threshold (that's the
    // incapacitated/overburdened state), so the only bound is the lower one.
    root.querySelectorAll(".cdx-step").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const stat = ev.currentTarget.dataset.stat;
        const dir = Number(ev.currentTarget.dataset.dir) || 0;
        const s = this.actor?.system?.stats?.[stat];
        if (!s) return;
        const val = Math.max(0, (Number(s.value) || 0) + dir);
        await this.actor.update({ [`system.stats.${stat}.value`]: val });
      });
    });
    // Threshold value & max edited directly (typing, not the ± buttons) -- wounds &
    // strain on actors, hull trauma & system strain on vehicles -- drive the DERIVED
    // progress track (cdxTracks/cdxVehTracks → bar width / pips), which getData only
    // recomputes on render. The generic form pipeline submits with render:false, so
    // the bar/pips stayed stale until the next full re-render. Persist via the
    // explicit system path and let actor.update re-render (default) so the track
    // updates live; change fires on blur (not mid-typing) so the value survives, and
    // stopPropagation keeps the generic submit from also firing and racing us.
    root.querySelectorAll([
      'input[name="data.stats.wounds.value"]', 'input[name="data.stats.wounds.max"]',
      'input[name="data.stats.strain.value"]', 'input[name="data.stats.strain.max"]',
      'input[name="data.stats.hullTrauma.value"]', 'input[name="data.stats.hullTrauma.max"]',
      'input[name="data.stats.systemStrain.value"]', 'input[name="data.stats.systemStrain.max"]',
    ].join(", ")).forEach((input) => {
      input.addEventListener("change", async (ev) => {
        ev.stopPropagation();
        const raw = parseInt(String(ev.currentTarget.value).replace(/[^\d-]/g, ""), 10);
        const val = Math.max(0, Number.isFinite(raw) ? raw : 0);
        const path = ev.currentTarget.name.replace(/^data\./, "system.");
        await this.actor.update({ [path]: val });
      });
    });
    // Ratio-chip steppers (−/+): adjust the value at data-cdx-path, clamped to
    // [0, data-cdx-max]. Drives the Force chip (committed dice) and the vehicle
    // Speed chip from one handler. Always active (a play action).
    root.querySelectorAll(".cdx-ratio-step").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const dir = Number(ev.currentTarget.dataset.dir) || 0;
        const path = ev.currentTarget.dataset.cdxPath;
        if (!path) return;
        const max = Number(ev.currentTarget.dataset.cdxMax);
        const cur = Number(foundry.utils.getProperty(this.actor, path)) || 0;
        let val = cur + dir;
        val = Math.max(0, Number.isFinite(max) ? Math.min(max, val) : val);
        if (val === cur) return;
        await this.actor.update({ [path]: val });
      });
    });
    // Minion Group-Strength steppers (members alive ±1). Alive count is DERIVED
    // from wounds (system prepareData):
    //   alive = qmax - floor((wounds - 1) / unit)
    // The wound track is 1-indexed -- the first point of damage is wound 1, so a
    // member only drops at unit+1 wounds, NOT unit. A flat ±unit step is therefore
    // off by one: from a clean group, −unit (e.g. 0 → 3 at unit 3) leaves the
    // count unchanged because wound 3 still hasn't crossed the kill boundary.
    // Instead, decompose the current wounds into dead members + partial damage on
    // the leading (still-alive) member, move the dead count by one, and re-attach
    // the SAME partial. This costs unit+1 from a clean group (kills a member) and
    // unit mid-damage, while preserving the carried partial damage.
    //   e.g. 3/member, 2 applied, − → 5 wounds = 1 dead + the 2 carried over.
    // Clamped to [0, qmax·unit + 1] (the latter = whole group dead, matching
    // killMinionGroup; one past wounds.max because the alive formula needs the
    // extra point to drop the final member).
    root.querySelectorAll(".cdx-gs-step").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const dir = Number(ev.currentTarget.dataset.dir) || 0; // −1 kill, +1 revive
        const sys = this.actor?.system;
        if (!sys) return;
        const unit = Math.max(1, Math.trunc(Number(sys.unit_wounds?.value) || 1));
        const qmax = Math.max(0, Math.trunc(Number(sys.quantity?.max) || 0));
        const cur = Math.max(0, Math.trunc(Number(sys.stats?.wounds?.value) || 0));
        const ceiling = qmax * unit + 1;
        const deaths = cur >= 1 ? Math.floor((cur - 1) / unit) : 0;
        const partial = cur >= 1 ? (cur - 1) - deaths * unit : 0;
        const targetDeaths = Math.max(0, Math.min(qmax, deaths - dir));
        const next = (targetDeaths === 0 && partial === 0)
          ? 0
          : Math.max(0, Math.min(ceiling, targetDeaths * unit + partial + 1));
        if (next === cur) return;
        await this.actor.update({ "system.stats.wounds.value": next });
      });
    });
    // Wipe Out — eliminate the whole group (wounds → max+1 ⇒ alive 0).
    root.querySelectorAll(".cdx-wipeout").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await killMinionGroup(this.actor);
      });
    });
    // Minion config inputs — group size (quantity.max) and wounds-per-member
    // (unit_wounds.value). These drive DERIVED values (wounds.max, alive count,
    // the wound-pool track), so they need an explicit, re-rendering write:
    //  • The generic change pipeline submits with render:false, so the combined
    //    wound pool never updated in place after an edit.
    //  • Worse, leaving edit mode triggers its own re-render that could race the
    //    in-flight render:false submit, leaving the typed value seemingly lost.
    // Persist via an explicit system path (no reliance on the data.* alias) and
    // let actor.update re-render (default), so the pool updates live and the
    // value survives leaving edit mode. stopPropagation keeps the generic form
    // submit from also firing for this field and racing us.
    root.querySelectorAll('input[name="data.quantity.max"], input[name="data.unit_wounds.value"]').forEach((input) => {
      input.addEventListener("change", async (ev) => {
        ev.stopPropagation();
        const raw = parseInt(String(ev.currentTarget.value).replace(/[^\d-]/g, ""), 10);
        const val = Math.max(0, Number.isFinite(raw) ? raw : 0);
        const path = ev.currentTarget.name === "data.quantity.max" ? "system.quantity.max" : "system.unit_wounds.value";
        await this.actor.update({ [path]: val });
      });
    });
  }

  /**
   * In-place credits editor: the "Change" tab on the CR chip opens a small +/-
   * panel. + and − are a mutually-exclusive toggle (selecting one deselects the
   * other); Confirm adds or subtracts the entered amount from the actor's
   * credits, Cancel/Escape dismiss. Transient (no flag), re-wired each render.
   */
  _cdxWireCredits(root) {
    const wrap = root.querySelector(".cdx-credits-wrap");
    if (!wrap) return;
    const amount = wrap.querySelector(".cdx-cr-amount");
    const ops = [...wrap.querySelectorAll(".cdx-cr-op")];
    const setOp = (b) => ops.forEach((x) => x.classList.toggle("active", x === b));
    const close = () => wrap.classList.remove("editing");
    // Stored credits as a plain integer, and a thousands-separated render of one.
    const curCredits = () => parseInt(String(this.actor?.system?.stats?.credits?.value ?? "0").replace(/[^\d]/g, ""), 10) || 0;
    const fmt = (v) => (parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0).toLocaleString("en-US");
    const open = () => {
      wrap.classList.add("editing");
      if (amount) amount.value = "";
      setOp(ops.find((b) => b.dataset.op === "add") ?? ops[0]);
      setTimeout(() => amount?.focus(), 0);
    };
    const commit = async () => {
      const op = wrap.querySelector(".cdx-cr-op.active")?.dataset.op ?? "add";
      const delta = parseInt(String(amount?.value ?? "").replace(/[^\d]/g, ""), 10) || 0;
      close();
      if (!delta) return;
      const next = Math.max(0, op === "sub" ? curCredits() - delta : curCredits() + delta);
      try { await this.actor?.update({ "system.stats.credits.value": String(next) }); } catch (e) { /* no permission */ }
    };
    // Main credits field — display with thousands-separating commas; show raw
    // digits while editing, reformat + persist on commit. The input is NOT
    // Foundry-bound (no name=), so the comma'd string can never round-trip into
    // the stored value when a neighbouring field triggers a form submit.
    const field = wrap.querySelector(".cdx-sq-input");
    if (field) {
      field.value = fmt(curCredits());
      field.addEventListener("focus", () => { field.value = String(curCredits()); setTimeout(() => field.select(), 0); });
      field.addEventListener("input", () => {
        const caret = field.selectionStart;
        const stripped = field.value.replace(/[^\d]/g, "");
        if (stripped !== field.value) { field.value = stripped; try { field.setSelectionRange(caret - 1, caret - 1); } catch (e) { /* noop */ } }
      });
      field.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); field.blur(); }
        else if (ev.key === "Escape") { ev.preventDefault(); field.value = String(curCredits()); field.blur(); }
      });
      field.addEventListener("blur", async () => {
        const n = parseInt(field.value.replace(/[^\d]/g, ""), 10) || 0;
        field.value = fmt(n);
        if (n !== curCredits()) { try { await this.actor?.update({ "system.stats.credits.value": String(n) }); } catch (e) { /* no permission */ } }
      });
    }
    // Amount field (the +/- panel) — digits only too.
    amount?.addEventListener("input", () => { const c = amount.selectionStart; const s = amount.value.replace(/[^\d]/g, ""); if (s !== amount.value) { amount.value = s; try { amount.setSelectionRange(c - 1, c - 1); } catch (e) { /* noop */ } } });
    wrap.querySelector(".cdx-cr-change")?.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); open(); });
    ops.forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); setOp(b); amount?.focus(); }));
    wrap.querySelector(".cdx-cr-cancel")?.addEventListener("click", (ev) => { ev.preventDefault(); close(); });
    wrap.querySelector(".cdx-cr-confirm")?.addEventListener("click", (ev) => { ev.preventDefault(); commit(); });
    amount?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      else if (ev.key === "Escape") { ev.preventDefault(); close(); }
    });
  }

  /**
   * Ammo chip on expanded weapon cards: the −/+ steppers adjust the weapon's
   * system.ammo magazine. Writes use {render:false} + an optimistic DOM update
   * so a +/- doesn't collapse the expanded card; the persisted value is correct
   * even if a render still occurs.
   */
  _cdxWireAmmo(root) {
    // Swallow clicks inside the chip so they don't toggle the card's expand state.
    root.querySelectorAll(".cdx-ammo").forEach((chip) => {
      chip.addEventListener("click", (ev) => ev.stopPropagation());
    });
    root.querySelectorAll(".cdx-ammo-step").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const chip = ev.currentTarget.closest(".cdx-ammo"); if (!chip) return;
        const w = this.actor?.items?.get(chip.dataset.weaponId); if (!w) return;
        const dir = Number(ev.currentTarget.dataset.dir) || 0;
        const mx = Number(w.system?.ammo?.max) || 0;
        let cur = (Number(w.system?.ammo?.value) || 0) + dir;
        cur = Math.max(0, mx ? Math.min(mx, cur) : cur);
        try { await w.update({ "system.ammo.value": cur }, { render: false }); } catch (e) { return; }
        const cEl = chip.querySelector(".cdx-ammo-count"); if (cEl) cEl.textContent = `${cur}/${mx}`;
      });
    });
  }

  /**
   * Fill each weapon card's dice-pool node with the actor's pool for that weapon's
   * combat skill, reusing the same DiceHelpers.addSkillDicePool the Skills tab uses
   * (so it's the real, full pool). The .roll-button node is display-only here
   * (pointer-events:none in CSS) — the weapon icon is the roll trigger.
   */
  async _cdxWeaponPools(root) {
    const nodes = root.querySelectorAll(".cdx-wpn-skill[data-ability]");
    if (!nodes.length) return;
    let data;
    try { data = await this.getData({}); } catch (e) { return; }
    nodes.forEach((elem) => { try { DiceHelpers.addSkillDicePool(data, elem); } catch (e) { /* skip this weapon */ } });
  }

  /**
   * Expose the crit-injury count (Injuries tab badge) and the wound/strain
   * damage tracks (the colored pip bars next to the steppers). @override
   */
  async getData(options) {
    const ctx = await super.getData(options);
    try {
      ctx.cdxCritCount = this.actor?.items?.filter((i) => i.type === "criticalinjury").length ?? 0;
      // Header pill stacks (specializations / force powers / signature abilities):
      // same shape, all driven by CdxPillStack. Ordered by acquisition — the one
      // bought FIRST (oldest createdTime) comes first → first pill → top of stack.
      // A null createdTime (e.g. carried over by a duplicated actor) sorts oldest;
      // sort then id break exact ties.
      const cdxStack = (type) => (this.actor?.items?.filter((i) => i.type === type) ?? [])
        .sort((a, b) => ((a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0)) || (a.sort - b.sort) || a._id.localeCompare(b._id));
      const specItems = cdxStack("specialization");
      ctx.cdxSpecs = specItems; ctx.cdxSpecCount = specItems.length; ctx.cdxSpecExtra = Math.max(0, specItems.length - 1);
      const forceItems = cdxStack("forcepower");
      ctx.cdxForcePowers = forceItems; ctx.cdxForceCount = forceItems.length; ctx.cdxForceExtra = Math.max(0, forceItems.length - 1);
      const sigItems = cdxStack("signatureability");
      ctx.cdxSigs = sigItems; ctx.cdxSigCount = sigItems.length; ctx.cdxSigExtra = Math.max(0, sigItems.length - 1);
    } catch (e) { ctx.cdxCritCount = 0; }
    ctx.cdxTracks = {};
    try {
      for (const stat of ["wounds", "strain"]) {
        const s = this.actor?.system?.stats?.[stat];
        if (!s || s.max == null) continue;
        ctx.cdxTracks[stat] = this._cdxTrack(Number(s.value) || 0, Number(s.max) || 0);
      }
    } catch (e) { /* leave tracks empty */ }
    // First-two-letters + dot abbreviation per characteristic (e.g. "WILLPOWER"
    // → "WI."), shown by the chip label when the window is too narrow for the
    // full word. A single dot — NOT an ellipsis.
    ctx.cdxCharAbbr = {};
    try {
      for (const [id, c] of Object.entries(ctx.data?.characteristics ?? {})) {
        ctx.cdxCharAbbr[id] = String(c?.label ?? id).slice(0, 2) + ".";
      }
    } catch (e) { /* leave empty */ }
    // Defence melee/ranged → setback-die render data for the locked (display)
    // view. 0 → em-dash, 1–4 → that many black setback dice, 5+ → a plain digit
    // (rules-illegal but shown rather than dropped). Built with an explicit
    // for-loop on purpose: Array.from({length}).map can drop items under some
    // transpilers. In edit mode the template shows plain number inputs instead.
    ctx.cdxDef = {};
    try {
      for (const key of ["melee", "ranged"]) {
        const v = Math.max(0, Math.trunc(Number(this.actor?.system?.stats?.defence?.[key]) || 0));
        const dice = [];
        if (v >= 1 && v <= 4) for (let i = 0; i < v; i++) dice.push(i);
        // Group dice into unbreakable pairs so the layout can only wrap at pair
        // boundaries: 4 → 2×2 (never 3+1), 3 → 2+1 pyramid. A single row still
        // shows when there's room (the whole block stays on one line).
        const pairs = [];
        for (let i = 0; i < dice.length; i += 2) pairs.push(dice.slice(i, i + 2));
        ctx.cdxDef[key] = { value: v, mode: v <= 0 ? "dash" : (v > 4 ? "digit" : "dice"), pairs };
      }
      // Larger of the two dice counts — both rows use it to flip single-row ⇄
      // collapsed at the SAME width (so they switch together, never one of each).
      const poolMax = Math.max(
        ctx.cdxDef.melee.mode === "dice" ? ctx.cdxDef.melee.value : 0,
        ctx.cdxDef.ranged.mode === "dice" ? ctx.cdxDef.ranged.value : 0,
      );
      ctx.cdxDef.melee.poolMax = poolMax;
      ctx.cdxDef.ranged.poolMax = poolMax;
    } catch (e) {
      ctx.cdxDef = { melee: { value: 0, mode: "dash", pairs: [], poolMax: 0 }, ranged: { value: 0, mode: "dash", pairs: [], poolMax: 0 } };
    }
    // Force-chip alignment colour: cdxAlign = effective (baseline + Morality
    // hysteresis), cdxAlignStored = the manually-set baseline (for the selector).
    try {
      const stored = this.actor?.getFlag("starwarsffg", "codexAlignment") ?? "neutral";
      ctx.cdxAlignStored = CDX_ALIGNMENTS.includes(stored) ? stored : "neutral";
      ctx.cdxAlign = cdxEffectiveAlignment(stored, this.actor?.system?.morality?.value);
    } catch (e) { ctx.cdxAlignStored = "neutral"; ctx.cdxAlign = "neutral"; }
    // Ammo chip on expanded weapon cards (system.ammo, gated by the item's
    // config.enableAmmo flag). cdxAmmo is keyed by weapon _id.
    ctx.cdxAmmo = {};
    try {
      for (const item of (this.actor?.items ?? [])) {
        if (item.type !== "weapon") continue;
        if (!item.getFlag("starwarsffg", "config.enableAmmo")) continue;
        ctx.cdxAmmo[item._id] = {
          current: Number(item.system?.ammo?.value) || 0,
          max: Number(item.system?.ammo?.max) || 0,
        };
      }
    } catch (e) { ctx.cdxAmmo = {}; }
    // Short talent activation labels (shown on the talent card's controls line).
    // "Active (Incidental, Out of Turn)" → "Active (OOT)"; others kept as-is.
    try {
      for (const t of (ctx.talentList ?? [])) {
        const act = (t && typeof t.activation === "object") ? (t.activation?.value ?? "") : (t?.activation ?? "");
        t.cdxAct = /out of turn/i.test(String(act)) ? "Active (OOT)" : String(act);
      }
    } catch (e) { /* leave talentList untouched */ }
    // Minion combined-wound-pool track: a grid of member groups, each
    // `unit_wounds` segments wide, filled left-to-right by total wounds suffered.
    // Precomputed here (booleans) rather than via Handlebars arithmetic helpers,
    // which aren't all available. The system already derives quantity.value
    // (alive) and stats.wounds.max (= unit_wounds × quantity.max) from wounds.
    if (this.actor?.type === "minion") {
      try {
        const unit = Math.max(1, Math.trunc(Number(this.actor.system?.unit_wounds?.value) || 1));
        const qmax = Math.max(0, Math.trunc(Number(this.actor.system?.quantity?.max) || 0));
        const woundsVal = Math.max(0, Math.trunc(Number(this.actor.system?.stats?.wounds?.value) || 0));
        const groups = [];
        for (let g = 0; g < qmax; g++) {
          const seg = [];
          for (let s = 0; s < unit; s++) seg.push((g * unit + s) < woundsVal);
          groups.push(seg);
        }
        ctx.cdxMinionGroups = groups;
        // Pre-format the hint here (game.i18n.format is reliable; the {{localize}}
        // Handlebars helper's hash-format support is version-dependent).
        ctx.cdxMinionWoundHint = game.i18n.format("SWFFG.Codex.WoundsSuffered", { n: unit });
      } catch (e) { ctx.cdxMinionGroups = []; }
    }
    // Vehicle derived data: hull/strain damage tracks, hardpoints used (sum of
    // attachment hardpoints), crew count, and a compact cost string.
    if (this.actor?.type === "vehicle") {
      try {
        const s = this.actor.system?.stats ?? {};
        ctx.cdxVehTracks = {
          hull: this._cdxTrack(Number(s.hullTrauma?.value) || 0, Number(s.hullTrauma?.max) || 0),
          strain: this._cdxTrack(Number(s.systemStrain?.value) || 0, Number(s.systemStrain?.max) || 0),
        };
        let hpUsed = 0, crew = 0, crit = 0;
        for (const it of (this.actor.items ?? [])) {
          if (it.type === "shipattachment") hpUsed += Number(it.system?.hardpoints?.value) || 0;
          if (it.type === "shipcrew") crew += 1;
          if (it.type === "criticaldamage") crit += 1;
        }
        ctx.cdxVehHpUsed = hpUsed;
        ctx.cdxVehCrewCount = crew;
        ctx.cdxVehCritCount = crit;
        const cost = Number(s.cost?.value) || 0;
        ctx.cdxVehCost = cost >= 1000 ? `${(cost / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : String(cost);
        // Speed-chip background ramp: white at 0, red-orange at full speed.
        const spMax = Number(s.speed?.max) || 0;
        const spVal = Number(s.speed?.value) || 0;
        ctx.cdxVehSpeedPct = spMax > 0 ? Math.max(0, Math.min(100, Math.round((spVal / spMax) * 100))) : 0;
      } catch (e) { ctx.cdxVehTracks = { hull: {}, strain: {} }; ctx.cdxVehHpUsed = 0; ctx.cdxVehCrewCount = 0; ctx.cdxVehCost = "0"; }
    }
    return ctx;
  }

  /** Build a damage track: pips for small thresholds, a bar for large ones.
   *  Colour escalates green → amber → red as current nears threshold. */
  _cdxTrack(cur, max) {
    const ratio = max > 0 ? cur / max : 0;
    const color = ratio >= 0.8 ? "#a51f17" : ratio >= 0.5 ? "#c8902e" : "#3f7d3a";
    if (max <= 0 || max >= 20) return { useBar: true, color, pct: Math.max(0, Math.min(100, Math.round(ratio * 100))) };
    const pips = [];
    for (let i = 0; i < max; i++) pips.push(i < cur);
    return { useBar: false, color, pips };
  }

  /**
   * Surface the per-actor scheme picker in the window-header controls menu (the
   * ⋮ dropdown), rather than as an in-sheet button strip.
   * @override
   */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      action: "cdxScheme",
      icon: "fa-solid fa-palette",
      label: "Scheme",
      onClick: () => this._cdxPickScheme(),
    });
    return controls;
  }

  /** Small DialogV2 to choose one of the five palettes; writes the actor flag. */
  async _cdxPickScheme() {
    const current = this._cdxScheme();
    const buttons = CDX_SCHEMES.map((s) => ({
      action: s,
      label: s.charAt(0).toUpperCase() + s.slice(1) + (s === current ? " ✓" : ""),
    }));
    let choice;
    try {
      choice = await foundry.applications.api.DialogV2.wait({
        window: { title: "Codex II — Scheme" },
        content: `<p style="margin:.2rem 0 .5rem">Colour scheme for <b>${this.actor.name}</b>:</p>`,
        buttons,
        rejectClose: false,
      });
    } catch (e) { return; }
    if (choice && CDX_SCHEMES.includes(choice)) await this.actor.setFlag("starwarsffg", "scheme", choice);
  }

  /**
   * Open the token-action-hud-ffgsw "Post-Encounter strain recovery" utility (the
   * Cool/Discipline dice-pool dialog) for this actor. That macro operates on the
   * controlled token, so we select this actor's token first, then run the module's
   * own macro script. Falls back to a plain strain reset if the module isn't
   * active, and warns if the actor has no token on the canvas.
   */
  async _cdxStrainRecovery() {
    const MOD = "token-action-hud-ffgsw";
    if (!game.modules.get(MOD)?.active) {
      return this.actor.update({ "system.stats.strain.value": 0 });
    }
    const token = this.actor.getActiveTokens?.()?.[0]
      ?? canvas?.tokens?.placeables?.find((t) => t.actor?.id === this.actor.id);
    if (!token) {
      ui.notifications?.warn(`Select ${this.actor.name}'s token on the canvas to use strain recovery.`);
      return;
    }
    token.control({ releaseOthers: true });
    try {
      const command = await fetch(`modules/${MOD}/content/macros/strainRecovery.js`).then((r) => (r.ok ? r.text() : null));
      if (!command) throw new Error("strainRecovery macro not found");
      await new Macro({ name: "Strain Recovery", type: "script", command, img: "icons/svg/regen.svg" }).execute();
    } catch (e) {
      console.error("starwarsffg | Codex strain recovery failed", e);
      ui.notifications?.error("Strain recovery utility failed to run.");
    }
  }
};

/** Codex sheet for character / rival / nemesis / minion / vehicle. */
export class CodexActorSheet extends CodexSchemeMixin(ActorSheetFFG) {
  /** @override */
  get template() {
    const t = this.actor.type;
    const name = ["character", "rival", "nemesis"].includes(t) ? "character" : t;
    return `${CDX_TEMPLATES}/codex-${name}.html`;
  }
}

/**
 * Codex Adversary sheet — the system's "Adversary Sheet" is a character-type
 * actor sheet (used to build NPCs for compendium export), structurally the same
 * as the character sheet, so it reuses codex-character.html. We keep it as a
 * separate selectable class so a GM can pick it via the ⚙ Sheet picker; it
 * inherits AdversarySheetFFG's adversary-specific getData (sizing, specialization
 * refresh).
 */
export class CodexAdversarySheet extends CodexSchemeMixin(AdversarySheetFFG) {
  /** @override */
  get template() {
    return `${CDX_TEMPLATES}/codex-character.html`;
  }
}
