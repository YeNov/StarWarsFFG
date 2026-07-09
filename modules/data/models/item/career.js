import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";
import { stringSlotField } from "./_tree-fields.js";

/**
 * `career` — template.json `templates: ["core"]` + freeform `specializations`
 * and `signatureabilities` dictionaries (dynamic id-keyed refs, `{}` default)
 * and an 8-entry `careerSkills` dictionary (`careerSkill0..7`, default
 * `"(none)"`).
 */
export class CareerDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      specializations: new f.ObjectField(),
      signatureabilities: new f.ObjectField(),
      careerSkills: stringSlotField("careerSkill", 8),
    };
  }
}
