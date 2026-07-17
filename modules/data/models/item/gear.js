import { mix, BaseItemDataModel } from "../../mix.js";
import {
  CoreTemplate,
  BasicTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
} from "../../item-templates.js";

/**
 * `gear` — template.json `templates: ["core", "basic", "itemattachments",
 * "qualities"]`. No own fields.
 */
export class GearDataModel extends mix(
  BaseItemDataModel,
  CoreTemplate,
  BasicTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
) {}
