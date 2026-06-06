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

export const CDX_SCHEMES = ["republic", "empire", "dark", "light", "mercenary"];
const CDX_TEMPLATES = "systems/starwarsffg/templates/actors/codex";

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
    return CDX_SCHEMES.includes(s) ? s : "republic";
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
    return super.close(options);
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

    if (!this.options.editable) return;
    // Strain recovery — open the token-action-hud-ffgsw post-encounter utility.
    root.querySelectorAll(".cdx-strain-rest").forEach((btn) => {
      btn.addEventListener("click", (ev) => { ev.preventDefault(); this._cdxStrainRecovery(); });
    });
    // Wounds / strain steppers (−/+), clamped to [0, threshold].
    root.querySelectorAll(".cdx-step").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const stat = ev.currentTarget.dataset.stat;
        const dir = Number(ev.currentTarget.dataset.dir) || 0;
        const s = this.actor?.system?.stats?.[stat];
        if (!s) return;
        const max = Number(s.max);
        let val = (Number(s.value) || 0) + dir;
        val = Math.max(0, Number.isFinite(max) ? Math.min(max, val) : val);
        await this.actor.update({ [`system.stats.${stat}.value`]: val });
      });
    });
  }

  /**
   * Expose the crit-injury count (Injuries tab badge) and the wound/strain
   * damage tracks (the colored pip bars next to the steppers). @override
   */
  async getData(options) {
    const ctx = await super.getData(options);
    try {
      ctx.cdxCritCount = this.actor?.items?.filter((i) => i.type === "criticalinjury").length ?? 0;
      // Specializations ordered by acquisition — the one bought FIRST (oldest
      // createdTime) comes first in the array, so it renders as the first pill
      // and paints on TOP of the stack. A null createdTime (e.g. a spec carried
      // over by a duplicated actor) sorts oldest; sort then id break exact ties.
      const specItems = (this.actor?.items?.filter((i) => i.type === "specialization") ?? [])
        .sort((a, b) => ((a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0)) || (a.sort - b.sort) || a._id.localeCompare(b._id));
      ctx.cdxSpecs = specItems;
      ctx.cdxSpecCount = specItems.length;
      ctx.cdxSpecExtra = Math.max(0, specItems.length - 1);
    } catch (e) { ctx.cdxCritCount = 0; }
    ctx.cdxTracks = {};
    try {
      for (const stat of ["wounds", "strain"]) {
        const s = this.actor?.system?.stats?.[stat];
        if (!s || s.max == null) continue;
        ctx.cdxTracks[stat] = this._cdxTrack(Number(s.value) || 0, Number(s.max) || 0);
      }
    } catch (e) { /* leave tracks empty */ }
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
