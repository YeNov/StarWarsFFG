import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate, BasicTemplate } from "../../item-templates.js";

/**
 * `background` — template.json `templates: ["core", "basic"]` + a `type`
 * category. `description` is NOT redeclared here: template.json redeclares it in
 * the type body, but that is the redundant authoring artifact — it is declared
 * once on `CoreTemplate` and merges to a single `system.description`.
 */
export class BackgroundDataModel extends mix(BaseItemDataModel, CoreTemplate, BasicTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      type: new f.StringField({ initial: "culture" }),
    };
  }
}
