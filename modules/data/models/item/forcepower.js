import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";
import { slotDictField, editingField } from "./_tree-fields.js";

/**
 * `forcepower` — template.json `templates: ["core"]` + a 16-slot `upgrades`
 * tree (`upgrade0..15`, freeform slots) and two numeric costs.
 *
 * `collection` / `renderedDesc` really are derived props added during
 * prepare/getData, so they stay undeclared (they leak into stored data on save,
 * and dropping them is a cleanup, not a loss — prepareData recreates them).
 * `isEditing` is NOT in that group, contrary to an earlier note here: a raw-DB
 * audit found it persisted on 43/43 force powers, and the stock sheet's hidden
 * input round-trips it through the document. It is declared via `editingField`.
 */
export class ForcePowerDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      upgrades: slotDictField("upgrade", 16),
      isEditing: editingField(),
      required_force_rating: new f.NumberField({ initial: 0 }),
      base_cost: new f.NumberField({ initial: 0 }),
    };
  }
}
