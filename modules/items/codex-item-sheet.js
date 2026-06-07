/**
 * Codex II item sheets — an opt-in "Codex II Item Sheet" registered alongside
 * the stock item sheet. Reuses the `.cdx` CSS scope and the five scheme palettes
 * from the actor work; the scheme is a per-ITEM flag, falling back to the owning
 * actor's scheme, then republic.
 *
 * Scope: bespoke templates for weapon/armour/gear/talent; a generic Codex frame
 * (codex-item.html) for the other simple types (ability, crit injury/damage,
 * obligation, motivation, background, ship attachment, homestead upgrade). The
 * complex tree/config types (specialization, career, force/signature, species,
 * item attachment, ship weapon, item modifier) keep the stock sheet for now and
 * are NOT registered for this sheet.
 *
 * Tabs stay native: the base ItemSheetFFG configures a Foundry Tabs controller
 * keyed off `.sheet-tabs` / `.sheet-body`, so the codex templates keep that
 * markup (and the shared modifiers/sources/tags partials) and only restyle it.
 */
import { ItemSheetFFG } from "./item-sheet-ffg.js";
import { CDX_SCHEMES } from "../actors/codex-sheets.js";

/** Types with a bespoke codex template; everything else uses codex-item.html.
 *  Only list a type once its `codex-<type>.html` actually exists — a missing
 *  file throws ENOENT when the sheet renders. (talent still pending.) */
const CODEX_DETAILED = new Set(["gear", "weapon", "armour", "talent"]);

/** data.status values ↔ condition-track labels (None = Undamaged). */
const CODEX_STATUS = ["None", "Minor", "Moderate", "Major"];
const CODEX_STATUS_LABELS = ["Undamaged", "Minor", "Moderate", "Major"];

export class CodexItemSheet extends ItemSheetFFG {
  // Concatenated onto the base classes → the OUTER window <div> ends up
  // `…item v2 cdx`. `cdx` is our CSS scope.
  static DEFAULT_OPTIONS = {
    classes: ["cdx"],
  };

  /** Per-item palette: item flag → owning actor's flag → republic. */
  _cdxScheme() {
    const s = this.item?.getFlag?.("starwarsffg", "scheme")
      ?? this.item?.actor?.getFlag?.("starwarsffg", "scheme");
    return CDX_SCHEMES.includes(s) ? s : "republic";
  }

  /** Replace the legacy root classes with ONLY the palette class (mirrors the
   *  actor mixin) so mandar's structural item-form rules don't match us. The
   *  editable/locked classes are still applied by the base. @override */
  _getLegacyRootClasses(_context = {}) {
    return [`scheme-${this._cdxScheme()}`];
  }

  /** Strip stale `scheme-*` before super re-adds the current one. @override */
  _applyLegacyRootClasses(form, context = {}) {
    for (const s of CDX_SCHEMES) form.classList.remove(`scheme-${s}`);
    super._applyLegacyRootClasses(form, context);
  }

  /** Bespoke template for the four detailed types; generic frame otherwise. @override */
  get template() {
    const base = "systems/starwarsffg/templates/items/codex";
    const type = this.item?.type;
    return CODEX_DETAILED.has(type) ? `${base}/codex-${type}.html` : `${base}/codex-item.html`;
  }

  /** @override — condition/status track model + the transient edit-mode flags. */
  async getData(options) {
    const ctx = await super.getData(options);
    try {
      const cur = Math.max(0, CODEX_STATUS.indexOf(ctx?.data?.status ?? "None"));
      ctx.cdxConditions = CODEX_STATUS.map((value, i) => ({
        value,
        label: CODEX_STATUS_LABELS[i],
        current: i === cur,
        filled: i >= 1 && i <= cur, // Minor..current shade in as a progress track
      }));
    } catch (e) { ctx.cdxConditions = []; }
    // Transient edit mode: stat blocks are display-only until toggled on. The
    // owner must still be able to edit (isEditable); a non-owner is always locked.
    ctx.cdxIEdit = !!this._cdxIEdit && this.isEditable;
    ctx.cdxILock = !ctx.cdxIEdit;
    return ctx;
  }

  /** Scheme picker + an edit-mode toggle in the window header controls. @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({ action: "cdxScheme", icon: "fa-solid fa-palette", label: "Scheme", onClick: () => this._cdxPickScheme() });
    if (this.isEditable) {
      controls.push({
        action: "cdxEdit",
        icon: "fa-solid fa-pen-to-square",
        label: "Codex Edit Mode",
        onClick: () => { this._cdxIEdit = !this._cdxIEdit; this.render(); },
      });
    }
    return controls;
  }

  /** Small DialogV2 to choose one of the five palettes; writes the item flag. */
  async _cdxPickScheme() {
    const current = this._cdxScheme();
    const buttons = CDX_SCHEMES.map((s) => ({ action: s, label: s.charAt(0).toUpperCase() + s.slice(1) + (s === current ? " ✓" : "") }));
    let choice;
    try {
      choice = await foundry.applications.api.DialogV2.wait({
        window: { title: "Codex II — Scheme" },
        content: `<p style="margin:.2rem 0 .5rem">Colour scheme for <b>${this.item?.name ?? "item"}</b>:</p>`,
        buttons,
        rejectClose: false,
      });
    } catch (e) { return; }
    if (choice && CDX_SCHEMES.includes(choice)) await this.item.setFlag("starwarsffg", "scheme", choice);
  }

  /** @override — keep every stock listener; make the form the scroll container
   *  (mandar forces overflow:visible !important on it) and wire the locked-mode
   *  rarity "(R)" toggle button. */
  activateListeners(html) {
    super.activateListeners(html);
    const form = this.form;
    if (form) {
      form.style.setProperty("overflow-y", "auto", "important");
      form.style.setProperty("overflow-x", "hidden", "important");
    }
    const root = html?.[0] ?? form;
    root?.querySelectorAll?.(".cdx-restrict-btn").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        if (!this.isEditable) return;
        await this.item.update({ "system.rarity.isrestricted": !this.item.system?.rarity?.isrestricted });
      });
    });
  }

  /** Edit mode is transient — never persist it across reopenings. @override */
  async close(options = {}) {
    this._cdxIEdit = false;
    return super.close(options);
  }
}
