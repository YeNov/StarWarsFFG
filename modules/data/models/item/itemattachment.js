import { mix, BaseItemDataModel } from "../../mix.js";
import {
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  QualitiesTemplate,
  ItemAttachmentsTemplate,
} from "../../item-templates.js";

/**
 * `itemattachment` — template.json `templates: ["core", "basic", "hardpoints",
 * "qualities", "itemattachments"]` + a `type` category. (Mixin order mirrors
 * template.json's list; order is cosmetic since the keys are disjoint.)
 */
export class ItemAttachmentDataModel extends mix(
  BaseItemDataModel,
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  QualitiesTemplate,
  ItemAttachmentsTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      type: new f.StringField({ initial: "all" }),
    };
  }
}
