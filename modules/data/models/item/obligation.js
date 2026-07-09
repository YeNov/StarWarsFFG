import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate, BasicTemplate } from "../../item-templates.js";

/**
 * `obligation` — template.json `templates: ["core", "basic"]` + `type`
 * category, `magnitude`, `subtype`. (Redundant `description` dropped — declared
 * once on `CoreTemplate`.)
 */
export class ObligationDataModel extends mix(BaseItemDataModel, CoreTemplate, BasicTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      type: new f.StringField({ initial: "duty" }),
      magnitude: new f.NumberField({ initial: 0 }),
      subtype: new f.StringField({ initial: "" }),
    };
  }
}
