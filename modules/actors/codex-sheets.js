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
import { DicePoolFFG } from "../dice-pool-ffg.js";

export const CDX_SCHEMES = ["republic", "empire", "dark", "light", "mercenary", "eldritch"];

/**
 * Blocks that get an SVG notch outline (see _cdxNotchOutlines). These are the
 * --cdx-clip octagon blocks whose diagonal corners a CSS border can't follow.
 * Excludes the editor containers and the overlapping chip-label tabs.
 */
const CDX_NOTCH_SEL = [
  ".cdx-stat", ".cdx-card", ".cdx-injury", ".cdx-talent", ".cdx-panel",
  ".cdx-istat", ".cdx-icheck2", ".item.force-power", ".cdx-forcepool",
  ".cdx-header", ".cdx-pill", ".cdx-square", ".cdx-veh-rarity",
  ".cdx-ihead", ".cdx-ipill", ".cdx-ihead .cdx-status",
].join(",");

const CDX_NOTCH = 9;   // notch size in px — must match --cdx-notch in the CSS

/**
 * Redraw one block's SVG notch outline at a KNOWN border-box size (px). The
 * <path> traces the same octagon geometry as the block's clip-path fill, inset
 * slightly so the stroke sits inside the clip; falls back to a plain rectangle
 * when the block is too small for a full octagon. Callers pass w/h from the
 * ResizeObserver entry so this never reads the DOM; if omitted it measures
 * (forces a layout — the slow path, kept only as a fallback).
 */
export function cdxDrawNotch(el, w, h) {
  const svg = el.querySelector(":scope > svg.cdx-notch");
  if (!svg) return;
  if (w == null || h == null) {             // fallback: measure (border box) — forces layout
    const r = el.getBoundingClientRect();
    w = r.width; h = r.height;
  }
  if (w < 2 || h < 2) return;               // hidden / unlaid-out — observer redraws later
  const n = CDX_NOTCH, i = 0.75;            // i: inset so the stroke stays inside the clip
  const d = (w < 2 * n + 2 || h < 2 * n + 2)
    ? `M${i},${i} L${w - i},${i} L${w - i},${h - i} L${i},${h - i} Z`
    : `M${i},${n} L${n},${i} L${w - n},${i} L${w - i},${n}` +
      ` L${w - i},${h - n} L${w - n},${h - i} L${n},${h - i} L${i},${h - n} Z`;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.firstChild.setAttribute("d", d);
}

/**
 * Give every notched block (CDX_NOTCH_SEL) inside `root` an <svg.cdx-notch>
 * overlay whose stroked <path> outlines the same octagon as its clip-path fill,
 * so the two can never drift. The path is built from the block's live px size, so
 * notches stay a fixed 9px and the stroke a uniform 1px at any size / DPR. A
 * single ResizeObserver (stored on `host`, rebuilt each call, torn down in the
 * sheet's close) redraws blocks on resize — tab switch, window resize, header
 * collapse, talent expand.
 *
 * Perf: the observer reads the size straight off each entry (borderBoxSize), so
 * it never calls getBoundingClientRect, and its initial per-element fire does the
 * FIRST draw — so the build loop only creates nodes. No forced layout on either
 * path (avoids read-after-write layout thrashing across N blocks).
 */
export function cdxBuildNotchOutlines(host, root) {
  if (!root) return;
  host._cdxNotchRO?.disconnect();
  host._cdxNotchRO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize && e.borderBoxSize[0];
      if (box) cdxDrawNotch(e.target, box.inlineSize, box.blockSize);
      else cdxDrawNotch(e.target);          // legacy fallback: measures
    }
  });
  for (const el of root.querySelectorAll(CDX_NOTCH_SEL)) {
    if (!el.querySelector(":scope > svg.cdx-notch")) {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "cdx-notch");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.appendChild(document.createElementNS(NS, "path"));
      // Append (not prepend): an absolutely-positioned last child keeps the
      // block's `:first-child` rules intact (e.g. .cdx-vr-k:not(:first-child)),
      // and there are no `:last-child` rules to disturb. pointer-events:none
      // keeps the on-top overlay click-through.
      el.append(svg);
    }
    // observe() delivers an initial size on the next frame -> first draw. No
    // explicit cdxDrawNotch here, so this loop performs zero layout reads.
    host._cdxNotchRO.observe(el);
  }
}
export const CDX_SCHEME_LABELS = {
  republic: "Republic",
  empire: "Empire",
  dark: "Dark",
  light: "Light",
  mercenary: "Mercenary",
  eldritch: "Eldritch Horror",
};
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
 * Manual inventory order (Codex weapon/armour/gear cards, reorderable by their drag
 * grips). Items are ordered by Foundry's `sort` field ascending; an item that has
 * never been sorted (sort 0) falls to the BOTTOM in name order. So a fresh actor lists
 * each category alphabetically; once a player drags a card the category keeps the chosen
 * order; a newly added item lands at the end. Shared by getData (the render order) and
 * the drag handler (to reconstruct the current order before re-numbering). `_cdxReorderItem`
 * writes sort values as multiples of CDX_SORT_BASE so the order stays well-spaced.
 */
const CDX_SORT_BASE = 100000;
function cdxInventoryOrder(a, b) {
  const ea = (Number(a.sort) || 0) || Number.MAX_SAFE_INTEGER;
  const eb = (Number(b.sort) || 0) || Number.MAX_SAFE_INTEGER;
  return (ea - eb) || String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

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
    this._cdxRegisterSheetOptions();
    this._cdxActivate(html);
  }

  /**
   * Codex-only Sheet Options, added on top of the stock per-type ones. Registered
   * here (not in the base actor-sheet-ffg per-type blocks) so the option appears
   * ONLY when a Codex sheet is the active sheet — i.e. "the Codex theme is
   * selected" is exactly "this sheet class is in use". `this.sheetoptions` is
   * created by the base activateListeners (run via super above) for every actor
   * type the Codex sheet supports.
   *
   *  - Inventory Style: "split" (default) keeps the separate Combat + Gear tabs;
   *    "combined" merges weapons/armour/gear under one Inventory tab. Only the
   *    actor types with those tabs get it (vehicles have a different tab set).
   *    Stored as a semantic string (NOT an index) because the dialog's Array
   *    type renders an object's keys as the <option value>s; see getData/the
   *    templates which branch on the "combined" value.
   */
  _cdxRegisterSheetOptions() {
    if (!this.sheetoptions) return;
    if (!["character", "rival", "nemesis", "minion"].includes(this.actor?.type)) return;
    this.sheetoptions.register("codexInventoryStyle", {
      name: game.i18n.localize("SWFFG.Codex.InventoryStyle"),
      hint: game.i18n.localize("SWFFG.Codex.InventoryStyleHint"),
      type: "Array",
      default: "split",
      options: {
        split: game.i18n.localize("SWFFG.Codex.InventoryStyleSplit"),
        combined: game.i18n.localize("SWFFG.Codex.InventoryStyleCombined"),
      },
    });
  }

  /** @override — drop the pill-stack's document listener when the sheet closes. */
  async close(options = {}) {
    this._cdxPillStack?.destroy();
    this._cdxPillStack = null;
    this._cdxNotchRO?.disconnect();
    this._cdxNotchRO = null;
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

    // Reflect GM status as a class so GM-only chrome can hide itself for players —
    // currently the per-pill delete cross (species/career/spec/force/sig). CSS
    // hides `.cdx-pill .item-delete` when this class is absent.
    (form ?? root).classList.toggle("cdx-gm", !!game.user?.isGM);

    // Collapsible header toggle (characters/rivals/nemeses/minions; vehicles have no
    // button). Flip the class live and swap the button label/icon for instant
    // feedback, then persist the per-actor flag WITHOUT a re-render (the class
    // already reflects the new state, so a re-render would only cause a flash).
    root.querySelector(".cdx-hcollapse-btn")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const header = root.querySelector(".cdx-header");
      if (!header) return;
      const collapsed = header.classList.toggle("cdx-hcollapsed");
      const btn = ev.currentTarget;
      const label = btn.querySelector(".cdx-hcollapse-label");
      if (label) label.textContent = collapsed ? "Expand" : "Collapse";
      const icon = btn.querySelector("i");
      if (icon) icon.className = collapsed ? "fas fa-caret-down" : "fas fa-caret-up";
      await this.actor.update({ "flags.starwarsffg.codexHeaderCollapsed": collapsed }, { render: false });
    });

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

    // Species/career pills are single `.cdx-pill.item[data-item-id]` spans in
    // `.cdx-pills` — NOT inside a `.cdx-stack`, so CdxPillStack (which only scans
    // `.cdx-stack`) ignores them, and NOT inside `.items`/`.header-description-
    // block`/`.injuries`, so the stock opener in actor-sheet-ffg.js never matches
    // them either. That left the pill body a dead click. Open the item sheet
    // directly; the delete-X keeps flowing to the stock `.item-delete` handler
    // (the pill span is itself `.item`, which that handler resolves via
    // `.parents(".item")`), so it stays edit-mode-gated.
    root.querySelectorAll(".cdx-pill.species[data-item-id], .cdx-pill.career[data-item-id]").forEach((pill) => {
      pill.addEventListener("click", (ev) => {
        if (ev.target.closest(".item-delete")) return; // delete-X → stock handler
        ev.preventDefault();
        ev.stopPropagation();
        this.actor?.items?.get(pill.dataset.itemId)?.sheet?.render(true);
      });
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

    // Carried toggle (Codex inventory, weapon/armour/gear): flip flags.starwarsffg.carried.
    // Un-pressed = left on a ship/base → the item's encumbrance*qty is excluded from the
    // actor's encumbrance (ActorFFG._calculateDerivedValues honours the flag; default =
    // carried). stopPropagation so the click doesn't expand/roll the card.
    root.querySelectorAll(".toggle-carried").forEach((el) => {
      el.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!this.options.editable) return;
        if (this.actor?.verifyEditModeIsNotEnabled && !this.actor.verifyEditModeIsNotEnabled()) return;
        const item = this.actor?.items?.get(ev.currentTarget.dataset.itemId);
        if (!item) return;
        const carried = item.getFlag("starwarsffg", "carried") !== false;
        await item.setFlag("starwarsffg", "carried", !carried);
      });
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
    this._cdxWireReorder(root);
    this._cdxWireCredits(root);
    // Alignment selector (bio) → write the Codex alignment flag; the chip recolours
    // on the resulting re-render.
    root.querySelector(".cdx-align-select")?.addEventListener("change", (ev) => {
      const v = ev.currentTarget.value;
      if (CDX_ALIGNMENTS.includes(v)) this.actor?.setFlag("starwarsffg", "codexAlignment", v);
    });
    this._cdxWireAmmo(root);
    // Strain recovery — self-contained post-encounter strain recovery dialog.
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

    // Notched-block outlines. A CSS `border` on a --cdx-clip octagon is sliced
    // off at the 45° notches; instead each notched block carries an SVG overlay
    // whose single stroked <path> traces the SAME octagon geometry as the clip,
    // sized to the block in px so the notches stay a fixed 9px and the line is a
    // uniform 1px on every edge (see _cdxNotchOutlines).
    this._cdxNotchOutlines(root);
  }

  /** @see cdxBuildNotchOutlines — thin instance wrapper so the observer is
   *  owned by (and torn down with) this sheet. */
  _cdxNotchOutlines(root) {
    cdxBuildNotchOutlines(this, root);
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
   * Inventory card reordering (weapons / armour / gear). Each card carries a left-edge
   * grip (`.cdx-grip`, draggable); dragging it reorders cards WITHIN their own category by
   * rewriting the items' Foundry `sort` field. The whole-card cross-actor transfer drag
   * (base DragDrop, dragSelector `.cdx-card`) is left intact: the grip's dragstart calls
   * stopPropagation so the base transfer dragstart never fires for a grip drag, and the
   * grip drop calls stopPropagation so it never bubbles to the base sheet drop zone (which
   * would route it through _onSortItem and double-sort). A grip dropped on empty space just
   * no-ops — the base _onTransferItemDrop ignores our non-JSON payload.
   */
  _cdxWireReorder(root) {
    const clearMarks = () => root
      .querySelectorAll(".cdx-card.cdx-drop-before, .cdx-card.cdx-drop-after")
      .forEach((c) => c.classList.remove("cdx-drop-before", "cdx-drop-after"));

    root.querySelectorAll(".cdx-card .cdx-grip").forEach((grip) => {
      const card = grip.closest(".cdx-card[data-item-id]");
      if (!card) return;
      // A plain click on the grip must not expand/roll the card.
      grip.addEventListener("click", (ev) => ev.stopPropagation());
      grip.addEventListener("dragstart", (ev) => {
        ev.stopPropagation(); // beat the base .cdx-card transfer dragstart
        const item = this.actor?.items?.get(card.dataset.itemId);
        if (!item) return;
        this._cdxReorder = { id: item.id, type: item.type, card };
        try {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", item.id); // Firefox needs a payload to start a drag
          ev.dataTransfer.setDragImage(card, 12, 16);      // ghost the whole card, not the 5px sliver
        } catch (e) { /* dataTransfer may be restricted; the drag still works */ }
        card.classList.add("cdx-dragging");
      });
      grip.addEventListener("dragend", () => {
        this._cdxReorder = null;
        card.classList.remove("cdx-dragging");
        clearMarks();
      });
    });

    root.querySelectorAll(".cdx-card[data-item-id]").forEach((card) => {
      // Whether the pointer is in the card's lower half → drop AFTER it, else BEFORE.
      const dropsAfter = (ev) => {
        const rect = card.getBoundingClientRect();
        return (ev.clientY - rect.top) > rect.height / 2;
      };
      const validTarget = () => {
        const drag = this._cdxReorder;
        if (!drag) return null;
        const target = this.actor?.items?.get(card.dataset.itemId);
        // Same category only, and never the dragged card itself.
        if (!target || target.type !== drag.type || target.id === drag.id) return null;
        return { drag, target };
      };
      card.addEventListener("dragover", (ev) => {
        const v = validTarget();
        if (!v) return;            // not a grip reorder (or wrong category) → let the base transfer handle it
        ev.preventDefault();       // mark the card as a valid drop target
        ev.stopPropagation();
        const after = dropsAfter(ev);
        card.classList.toggle("cdx-drop-after", after);
        card.classList.toggle("cdx-drop-before", !after);
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("cdx-drop-before", "cdx-drop-after");
      });
      card.addEventListener("drop", async (ev) => {
        const v = validTarget();
        if (!v) return;
        ev.preventDefault();
        ev.stopPropagation();      // never reach the base sheet drop (it would also _onSortItem)
        const after = dropsAfter(ev);
        clearMarks();
        // Persist the new order WITHOUT a re-render, then move the card in place. A
        // re-render would reset the form's scroll (you've usually scrolled into the
        // inventory) and flash; the optimistic DOM move mirrors the ammo stepper.
        const ok = await this._cdxReorderItem(v.drag.id, v.target.id, v.drag.type, after);
        if (ok && v.drag.card) { if (after) card.after(v.drag.card); else card.before(v.drag.card); }
      });
    });
  }

  /**
   * Persist a within-category reorder: re-number every item of `type` so the dragged item
   * lands before/after the target, writing the Foundry `sort` field. Re-numbering the whole
   * category (rather than a single relative sort) keeps the result deterministic even from a
   * cold start where every item still has sort 0. Only items whose sort actually changes are
   * written, and with {render:false} — the caller moves the card in the DOM. Returns true on
   * success so the caller knows it's safe to do the optimistic move.
   */
  async _cdxReorderItem(dragId, targetId, type, after) {
    if (dragId === targetId) return false;
    const dragItem = this.actor?.items?.get(dragId);
    if (!dragItem) return false;
    const sibs = (this.actor?.items?.filter((i) => i.type === type) ?? []).sort(cdxInventoryOrder);
    const from = sibs.findIndex((i) => i.id === dragId);
    if (from < 0) return false;
    sibs.splice(from, 1);
    let to = sibs.findIndex((i) => i.id === targetId);
    if (to < 0) return false;
    if (after) to += 1;
    sibs.splice(to, 0, dragItem);
    const updates = [];
    sibs.forEach((it, idx) => {
      const want = (idx + 1) * CDX_SORT_BASE;
      if ((Number(it.sort) || 0) !== want) updates.push({ _id: it.id, sort: want });
    });
    try {
      if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates, { render: false });
    } catch (e) {
      return false;
    }
    return true;
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
    nodes.forEach((elem) => {
      // Resolve the weapon item from its card so its roll modifiers are folded
      // into the previewed pool (matches what clicking the weapon rolls).
      const card = elem.closest(".cdx-card.weapon[data-item-id]");
      const item = card ? (this.actor?.items?.get(card.dataset.itemId) ?? null) : null;
      try { DiceHelpers.addSkillDicePool(data, elem, item); } catch (e) { /* skip this weapon */ }
    });
  }

  /**
   * Distribute skills into two columns WITHOUT splitting a skill group across the
   * break. The stock _createSkillColumns fills column 1 to a row target and spills
   * a group across the gap (repeating its header); instead we keep each group
   * [header, ...skills] whole and pick the in-order boundary that best balances the
   * two columns — so e.g. Combat (Brawl…) moves wholesale to the second column
   * rather than starting at the bottom of the first. @override
   */
  _createSkillColumns(data) {
    const byLabel = game.settings.get("starwarsffg", "skillSorting");
    const sortFn = byLabel
      ? (a, b) => data.data.skills[a].label.localeCompare(data.data.skills[b].label, game.i18n.lang)
      : (a, b) => a.toLowerCase().localeCompare(b.toLowerCase());

    // Each group = its header row + sorted skill rows; treated as one unbreakable unit.
    const groups = data.data.skilltypes.map((type) => {
      const skills = Object.keys(data.data.skills)
        .filter((s) => data.data.skills[s].type === type.type)
        .sort(sortFn)
        .map((s) => ({ name: s, ...data.data.skills[s] }));
      return [{ id: "header", ...type }, ...skills];
    }).filter((g) => g.length > 1);

    // Pick the in-order split point (k groups in column 0, the rest in column 1)
    // that minimises the row-count imbalance between the two columns.
    const total = groups.reduce((n, g) => n + g.length, 0);
    let bestK = groups.length, bestDiff = Infinity, running = 0;
    for (let k = 1; k <= groups.length; k++) {
      running += groups[k - 1].length;
      const diff = Math.abs(running - (total - running));
      if (diff < bestDiff) { bestDiff = diff; bestK = k; }
    }

    const cols = [[], []];
    groups.forEach((g, i) => cols[i < bestK ? 0 : 1].push(...g));
    return cols.filter((c) => c.length > 0);
  }

  /**
   * Expose the crit-injury count (Injuries tab badge) and the wound/strain
   * damage tracks (the colored pip bars next to the steppers). @override
   */
  async getData(options) {
    const ctx = await super.getData(options);
    // Per-actor collapsed-header preference (characters/rivals/nemeses/minions).
    ctx.cdxHeaderCollapsed = !!this.actor?.getFlag?.("starwarsffg", "codexHeaderCollapsed");
    // Inventory Style (Sheet Option): "combined" merges weapons/armour/gear into
    // one Inventory tab; anything else (default "split") keeps the Combat + Gear
    // tabs. Dotted-key getFlag, same idiom as config.enableEditMode above.
    ctx.cdxCombinedInventory = this.actor?.getFlag?.("starwarsffg", "config.codexInventoryStyle") === "combined";
    // Inventory render order: cdxItems is the actor's items in manual drag-sort order
    // (see cdxInventoryOrder). The weapon/armour/gear partials iterate THIS instead of the
    // collection-ordered `items`, so reordering via the card grips is reflected. These are
    // still the live Item documents (not toObject'd), so the templates keep full
    // item.system / item.flags / item.img access.
    ctx.cdxItems = [...(this.actor?.items ?? [])].sort(cdxInventoryOrder);
    // Show the inventory drag grips only to a user who can actually edit the actor —
    // isEditable folds in document ownership (options.editable alone can be true for a
    // non-owner, who would then get a permission error on drop). The wiring in
    // _cdxWireReorder is gated by options.editable; with no grips rendered it's a no-op.
    ctx.cdxCanReorder = !!this.isEditable;
    // Labels for the codex header/bio-stats. The codex templates render these via
    // context vars (not bare {{localize}}) so they reliably reflect the optional
    // label override settings: the configured override when set, otherwise the
    // localized default. Covers the credits square (expanded + collapsed) and the
    // Obligation / Morality / Conflict bio-stats.
    const cdxLabel = (settingKey, i18nKey) =>
      game.settings.get("starwarsffg", settingKey) || game.i18n.localize(i18nKey);
    ctx.cdxCreditsLabel = cdxLabel("labelCredits", "SWFFG.DescriptionCredits");
    ctx.cdxObligationLabel = cdxLabel("labelObligation", "SWFFG.DescriptionObligation");
    ctx.cdxMoralityLabel = cdxLabel("labelMorality", "SWFFG.DescriptionMorality");
    ctx.cdxConflictLabel = cdxLabel("labelConflict", "SWFFG.DescriptionConflict");
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

  /** Small DialogV2 to choose one of the six palettes; writes the actor flag. */
  async _cdxPickScheme() {
    const current = this._cdxScheme();
    const buttons = CDX_SCHEMES.map((s) => ({
      action: s,
      label: CDX_SCHEME_LABELS[s] + (s === current ? " ✓" : ""),
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
   * Post-Encounter strain recovery for this actor. Ported from the
   * token-action-hud-ffgsw "strainRecovery" macro (AdmiralDave/Wrycu) so the codex
   * sheet no longer depends on that module: pops a Cool/Discipline dice-pool
   * chooser, rolls the chosen pool, and removes strain equal to
   * success + floor(advantage / 2). Operates directly on this actor (no token
   * selection needed). No-op with a notice if there's no strain to heal.
   */
  async _cdxStrainRecovery() {
    const actor = this.actor;
    const currentStrain = Number(actor?.system?.stats?.strain?.value) || 0;
    if (currentStrain <= 0) {
      ui.notifications?.info(game.i18n.format("SWFFG.Codex.StrainRecovery.NoStrain", { name: actor?.name ?? "" }));
      return;
    }

    const skills = actor.system?.skills ?? {};
    const coolSkill = skills["Cool"];
    const disciplineSkill = skills["Discipline"];
    const coolChar = coolSkill ? actor.system?.characteristics?.[coolSkill.characteristic] : null;
    const disciplineChar = disciplineSkill ? actor.system?.characteristics?.[disciplineSkill.characteristic] : null;
    if (!coolSkill || !disciplineSkill || !coolChar || !disciplineChar) {
      ui.notifications?.error(game.i18n.format("SWFFG.Codex.StrainRecovery.MissingSkill", { name: actor?.name ?? "" }));
      return;
    }

    const buildPool = (skill, characteristic) => {
      const pool = new DicePoolFFG({
        ability: Math.max(characteristic?.value ?? 0, skill?.rank ?? 0),
        boost: skill.boost,
        setback: skill.setback,
        remsetback: skill.remsetback,
        force: skill.force ?? 0,
        advantage: skill.advantage,
        dark: skill.dark,
        light: skill.light,
        failure: skill.failure,
        threat: skill.threat,
        success: skill.success,
        triumph: skill?.triumph ?? 0,
        despair: skill?.despair ?? 0,
      });
      pool.upgrade(Math.min(characteristic.value ?? 0, skill.rank ?? 0));
      return pool;
    };

    const coolPool = buildPool(coolSkill, coolChar);
    const disciplinePool = buildPool(disciplineSkill, disciplineChar);

    // Pre-select the stronger pool (more ability+proficiency+boost, proficiency breaks ties).
    const weight = (p) => p.ability + p.proficiency + p.boost;
    const coolBetter = weight(coolPool) > weight(disciplinePool)
      || (weight(coolPool) === weight(disciplinePool) && coolPool.proficiency > disciplinePool.proficiency);

    const content = `<form class="form cdx-strain-recovery">
      <p>${game.i18n.localize("SWFFG.Codex.StrainRecovery.SelectSkill")}</p>
      <div class="cdx-strain-choices">
        <label><input type="radio" name="selected_skill" value="Cool"${coolBetter ? " checked" : ""} /> ${coolSkill.label} ${coolPool.renderPreview().outerHTML}</label>
        <label><input type="radio" name="selected_skill" value="Discipline"${coolBetter ? "" : " checked"} /> ${disciplineSkill.label} ${disciplinePool.renderPreview().outerHTML}</label>
      </div>
    </form>`;

    await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("SWFFG.Codex.StrainRecovery.Title"), icon: "fa-solid fa-laptop-medical" },
      content,
      modal: true,
      rejectClose: false,
      buttons: [{
        action: "recover",
        label: game.i18n.localize("SWFFG.Codex.StrainRecovery.Recover"),
        default: true,
        callback: async (event, button) => {
          const chosen = button.form.elements.selected_skill.value === "Cool" ? coolPool : disciplinePool;
          await this._cdxApplyStrainRecovery(chosen, currentStrain);
        },
      }],
    });
  }

  /**
   * Roll a recovery pool and remove the recovered strain from this actor.
   * Healed = success (+ floor(advantage / 2) when the "advantages heal strain"
   * house rule is enabled), capped at current strain.
   */
  async _cdxApplyStrainRecovery(pool, currentStrain) {
    const actor = this.actor;
    const message = await new game.ffg.RollFFG(pool.renderDiceExpression()).toMessage({
      speaker: { actor },
      flavor: `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize("SWFFG.Codex.StrainRecovery.Title")}...`,
    });
    const result = message.rolls?.[0]?.ffg ?? {};
    const advantageHeals = game.settings.get("starwarsffg", "codexAdvantageHealsStrain");
    const rolled = (result.success ?? 0) + (advantageHeals ? Math.floor((result.advantage ?? 0) / 2) : 0);
    const healed = Math.min(currentStrain, Math.max(0, rolled));
    await ChatMessage.create({
      speaker: { actor },
      content: game.i18n.format("SWFFG.Codex.StrainRecovery.Healed", { quantity: healed }),
    });
    await actor.update({ "system.stats.strain.value": currentStrain - healed });
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
