import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate, QualitiesTemplate } from "../../item-templates.js";

/**
 * `itemmodifier` — template.json `templates: ["core", "qualities"]` + a `type`
 * category and `rank`. A quality/modifier snapshot (e.g. weapon qualities).
 */
export class ItemModifierDataModel extends mix(BaseItemDataModel, CoreTemplate, QualitiesTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      type: new f.StringField({ initial: "all" }),
      rank: new f.NumberField({ initial: 0 }),
    };
  }
}
