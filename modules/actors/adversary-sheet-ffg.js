import { ActorSheetFFG } from "./actor-sheet-ffg.js";
import ActorOptions from "./actor-ffg-options.js";

export class AdversarySheetFFG extends ActorSheetFFG {
  constructor(...args) {
    super(...args);
  }

  /** @override */
  get template() {
    const path = "systems/starwarsffg/templates/actors";
    return `${path}/ffg-adversary-sheet.html`;
  }

  // Only the adversary-specific delta from ActorSheetFFG. `position`, `tabs`,
  // and `scrollY` are inherited and intentionally NOT re-declared: DEFAULT_OPTIONS
  // arrays concatenate across the inheritance chain, so re-declaring `tabs` would
  // bind two Tabs instances. The per-type template comes from get template().
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "sheet", "actor", "adversary", "v2"],
  };

  /**
   * @override
   * NOTE: `getData` MUST be async and MUST await `super.getData()` — the parent
   * `ActorSheetFFG.getData` is async (returns a Promise). Previously this method
   * was sync and did `const data = super.getData()` (no await), so `data` was a
   * Promise: the un-awaited `_updateSpecialization(data)` rejected with
   * "Cannot read properties of undefined (reading 'slice')" (data.talentList),
   * and the `data.limited` / `data.items` tweaks were written onto the Promise
   * wrapper and silently lost.
   */
  async getData() {
    const data = await super.getData();
    // FIRST RENDER ONLY — same reason as the base sheet's sizing block (see
    // actor-sheet-ffg.js): re-applying every render snaps a resized sheet back to
    // default (#14). This carries its OWN latch rather than reusing the base's:
    // `await super.getData()` above has already consumed that one, and this block
    // runs afterwards, so without a latch here it would overwrite the values the
    // base just guarded and the fix would do nothing on adversary sheets.
    const setInitialSize = !this._advSizeInitialized;
    this._advSizeInitialized = true;
    switch (this.actor.type) {
      case "character":
        if (setInitialSize) {
          this.position.width = 595;
          this.position.height = 783;
          if (data.limited) {
            this.position.height = 165;
          }
        }

        // we need to update all specialization talents with the latest talent information
        if (!this.actor.flags.starwarsffg?.loaded) {
          await super._updateSpecialization(data);
        }

        break;
      default:
    }

    data.items = this.actor.items.map((item) => item);

    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.options.editable) return;

    if (this.actor.type === "character") {
      this.sheetoptions.clear();
      this.sheetoptions.register("enableAutoSoakCalculation", {
        name: game.i18n.localize("SWFFG.EnableSoakCalc"),
        hint: game.i18n.localize("SWFFG.EnableSoakCalcHint"),
        type: "Boolean",
        default: true,
      });
      this.sheetoptions.register("enableForcePool", {
        name: game.i18n.localize("SWFFG.EnableForcePool"),
        hint: game.i18n.localize("SWFFG.EnableForcePoolHint"),
        type: "Boolean",
        default: true,
      });
      this.sheetoptions.register("enableStrainThreshold", {
        name: game.i18n.localize("SWFFG.EnableStrainThreshold"),
        hint: game.i18n.localize("SWFFG.EnableStrainThresholdHint"),
        type: "Boolean",
        default: true,
      });
      this.sheetoptions.register("talentSorting", {
        name: game.i18n.localize("SWFFG.EnableSortTalentsByActivation"),
        hint: game.i18n.localize("SWFFG.EnableSortTalentsByActivationHint"),
        type: "Array",
        default: 0,
        options: [game.i18n.localize("SWFFG.UseGlobalSetting"), game.i18n.localize("SWFFG.OptionValueYes"), game.i18n.localize("SWFFG.OptionValueNo")],
      });
    }
  }
}
