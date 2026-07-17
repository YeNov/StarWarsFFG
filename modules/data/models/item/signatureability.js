import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";
import { slotDictField, boolSlotField, editingField } from "./_tree-fields.js";

/**
 * `signatureability` — template.json `templates: ["core"]` + an 8-slot
 * `upgrades` tree (`upgrade0..7`, freeform slots), a numeric `base_cost`, and a
 * 4-entry `uplink_nodes` boolean dictionary (`uplink0..3`, default `false`).
 */
export class SignatureAbilityDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      upgrades: slotDictField("upgrade", 8),
      isEditing: editingField(),
      base_cost: new f.NumberField({ initial: 0 }),
      uplink_nodes: boolSlotField("uplink", 4),
    };
  }
}
