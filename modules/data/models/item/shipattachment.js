import { mix, BaseItemDataModel } from "../../mix.js";
import {
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  EquippableTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
} from "../../item-templates.js";

/**
 * `shipattachment` — template.json `templates: ["core", "basic", "hardpoints",
 * "equippable", "itemattachments", "qualities"]` + a top-level `label`
 * (`"Ship Attachment"`).
 */
export class ShipAttachmentDataModel extends mix(
  BaseItemDataModel,
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  EquippableTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      label: new f.StringField({ initial: "Ship Attachment" }),
    };
  }
}
