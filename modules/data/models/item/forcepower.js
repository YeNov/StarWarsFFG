import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";
import { slotDictField } from "./_tree-fields.js";

/**
 * `forcepower` — template.json `templates: ["core"]` + a 16-slot `upgrades`
 * tree (`upgrade0..15`, freeform slots) and two numeric costs. (`collection` /
 * `isEditing` / `renderedDesc` seen on a live document are transient derived
 * props added during prepare/getData, not stored — so not declared here.)
 */
export class ForcePowerDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      upgrades: slotDictField("upgrade", 16),
      required_force_rating: new f.NumberField({ initial: 0 }),
      base_cost: new f.NumberField({ initial: 0 }),
    };
  }
}
