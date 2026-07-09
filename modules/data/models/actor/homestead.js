import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import { BiographyTemplate, AttributesTemplate } from "../../actor-templates.js";

/**
 * `homestead` (Actor) — template.json `templates: ["biography", "attributes",
 * "meta_only"]` + `cost` and `consumables`. No shared Stats/Characteristics/
 * Skills, so low coupling. (Distinct from the `homesteadupgrade` Item type.)
 */
export class HomesteadDataModel extends mix(
  BaseActorDataModel,
  BiographyTemplate,
  AttributesTemplate,
  MetaOnlyTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      cost: new f.SchemaField({
        value: new f.NumberField({ initial: 0 }),
        type: new f.StringField({ initial: "Number" }),
        label: new f.StringField({ initial: "Cost" }),
        adjusted: new f.NumberField({ initial: 0 }),
      }),
      consumables: new f.SchemaField({
        value: new f.NumberField({ initial: 1 }),
        duration: new f.StringField({ initial: "months" }),
        type: new f.StringField({ initial: "Number" }),
        label: new f.StringField({ initial: "SWFFG.Consumables" }),
      }),
    };
  }
}
