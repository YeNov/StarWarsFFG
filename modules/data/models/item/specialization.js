import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";
import { slotDictField, stringSlotField, editingField } from "./_tree-fields.js";

/**
 * `specialization` — template.json `templates: ["core"]` + a 20-slot `talents`
 * tree (`talent0..19`, freeform slots), a 5-entry `careerSkills` dictionary
 * (`careerSkill0..4`, default `"(none)"`), and a `universal` flag.
 */
export class SpecializationDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      talents: slotDictField("talent", 20),
      careerSkills: stringSlotField("careerSkill", 5),
      isEditing: editingField(),
      universal: new f.BooleanField({ initial: false }),
    };
  }
}
