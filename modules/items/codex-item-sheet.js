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
    // Critical injury + critical damage share one template (same data model).
    if (type === "criticalinjury" || type === "criticaldamage") return `${base}/codex-crit.html`;
    return CODEX_DETAILED.has(type) ? `${base}/codex-${type}.html` : `${base}/codex-item.html`;
  }

  /** @override — add the condition/status track model (weapon/armour). */
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
    return ctx;
  }

  /** Add a scheme picker to the window header controls. @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({ action: "cdxScheme", icon: "fa-solid fa-palette", label: "Scheme", onClick: () => this._cdxPickScheme() });
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
   *  (mandar forces overflow:visible !important on it) and wire the inline rarity
   *  "(R)" Restricted toggle. */
  activateListeners(html) {
    super.activateListeners(html);
    const form = this.form;
    if (form) {
      form.style.setProperty("overflow-y", "auto", "important");
      form.style.setProperty("overflow-x", "hidden", "important");
    }
    const root = html?.[0] ?? form;

    // Bespoke tab switching — same as the codex actor sheets (.cdx-tab buttons /
    // .cdx-pane sections, toggled in JS). The stock native Tabs controller keyed
    // off .sheet-tabs doesn't apply here: we use .cdx-tabstrip so the item tabs
    // match the character sheet. Remember the active tab across re-renders (e.g.
    // a scheme change re-renders the whole sheet).
    if (root) {
      root.querySelectorAll(".cdx-tab").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const tab = ev.currentTarget.dataset.tab;
          if (!tab) return;
          root.querySelectorAll(".cdx-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
          root.querySelectorAll(".cdx-pane").forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
          this._cdxTab = tab;
        });
      });
      if (this._cdxTab && root.querySelector(`.cdx-tab[data-tab="${this._cdxTab}"]`)) {
        root.querySelectorAll(".cdx-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === this._cdxTab));
        root.querySelectorAll(".cdx-pane").forEach((p) => p.classList.toggle("active", p.dataset.tab === this._cdxTab));
      }
    }

    // Live header subtitle "{skill} - {characteristic}" (weapon Special tab). The
    // selects submit render:false, so reflect the choice into the header without
    // waiting for a re-render.
    const sub = root?.querySelector?.(".cdx-isub");
    if (sub) {
      const skillSel = root.querySelector('select[name="data.skill.value"]');
      const charSel = root.querySelector('select[name="data.characteristic.value"]');
      const none = game.i18n?.localize?.("SWFFG.None");
      const optText = (sel) => (sel && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex]?.text ?? "") : "").trim();
      const sync = () => {
        const parts = [optText(skillSel), optText(charSel)].filter((p) => p && p !== none);
        sub.textContent = parts.join(" - ");
        sub.style.display = parts.length ? "" : "none";
      };
      skillSel?.addEventListener("change", sync);
      charSel?.addEventListener("change", sync);
      // An owned weapon folds the wielder's characteristic into damage.adjusted
      // (Brawn-based weapons), and the skill gates whether that applies. The
      // generic change pipeline submits render:false, so a characteristic/skill
      // change wouldn't refresh the adjusted badges — request an explicit
      // re-render (coalesces with the pipeline's own submit), mirroring the
      // base sheet's cross-field reactivity for "ranked"/"islearned".
      const reRender = async (ev) => { await this._onSubmit(ev, { render: true }); };
      skillSel?.addEventListener("change", reRender);
      charSel?.addEventListener("change", reRender);
    }

    root?.querySelectorAll?.(".cdx-restrict-btn").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        if (!this.isEditable) return;
        await this.item.update({ "system.rarity.isrestricted": !this.item.system?.rarity?.isrestricted });
      });
    });
    // Price — same comma rules as actor credits. The field is NOT Foundry-bound
    // (no name=), so the comma'd display string can never round-trip into the
    // stored Number when a neighbouring field triggers a submit. Show commas at
    // rest, raw digits while editing, reformat + persist the integer on commit.
    const fmt = (v) => (parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0).toLocaleString("en-US");
    const curPrice = () => parseInt(String(this.item?.system?.price?.value ?? "0").replace(/[^\d]/g, ""), 10) || 0;
    root?.querySelectorAll?.("input.cdx-price").forEach((field) => {
      field.value = fmt(curPrice());
      field.addEventListener("focus", () => { field.value = String(curPrice()); setTimeout(() => field.select(), 0); });
      field.addEventListener("input", () => {
        const caret = field.selectionStart;
        const stripped = field.value.replace(/[^\d]/g, "");
        if (stripped !== field.value) { field.value = stripped; try { field.setSelectionRange(caret - 1, caret - 1); } catch (e) {} }
      });
      field.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); field.blur(); }
        else if (ev.key === "Escape") { ev.preventDefault(); field.value = String(curPrice()); field.blur(); }
      });
      field.addEventListener("blur", async () => {
        const n = parseInt(field.value.replace(/[^\d]/g, ""), 10) || 0;
        field.value = fmt(n);
        if (this.isEditable && n !== curPrice()) { try { await this.item.update({ "system.price.value": n }); } catch (e) {} }
      });
    });
    // Digits-only fields (Damage/Crit/Encum/HP/Rarity/Qty/Soak/Defence):
    // strip any non-digit on input so the field can only ever hold an integer.
    root?.querySelectorAll?.("input.cdx-num").forEach((inp) => {
      inp.setAttribute("inputmode", "numeric");
      inp.addEventListener("input", () => {
        const cleaned = inp.value.replace(/[^0-9]/g, "");
        if (cleaned !== inp.value) {
          const pos = inp.selectionStart;
          inp.value = cleaned;
          try { inp.setSelectionRange(pos - 1, pos - 1); } catch (e) {}
        }
      });
      inp.addEventListener("keypress", (ev) => {
        if (ev.key.length === 1 && !/[0-9]/.test(ev.key)) ev.preventDefault();
      });
    });
  }
}
