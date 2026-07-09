import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";

/**
 * `ability` — template.json `templates: ["core"]`. Description + freeform
 * attributes + metadata, no own fields.
 */
export class AbilityDataModel extends mix(BaseItemDataModel, CoreTemplate) {}
