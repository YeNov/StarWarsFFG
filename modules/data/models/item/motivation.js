import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate, BasicTemplate } from "../../item-templates.js";

/**
 * `motivation` — template.json `templates: ["core", "basic"]` + a `type`
 * category. (Redundant `description` dropped — declared once on `CoreTemplate`.)
 */
export class MotivationDataModel extends mix(BaseItemDataModel, CoreTemplate, BasicTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      type: new f.StringField({ initial: "ambition" }),
    };
  }
}
