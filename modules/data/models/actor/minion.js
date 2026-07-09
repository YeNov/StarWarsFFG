import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import {
  BiographyTemplate,
  StatsTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
} from "../../actor-templates.js";

/**
 * `minion` (Actor) — template.json `templates: ["biography", "stats",
 * "characteristics", "skills", "attributes", "meta_only"]` (shared `stats`, so
 * includes `strain`) + `quantity` and `unit_wounds`. No species/general.
 */
export class MinionDataModel extends mix(
  BaseActorDataModel,
  BiographyTemplate,
  StatsTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  MetaOnlyTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      quantity: new f.SchemaField({
        value: new f.NumberField({ initial: 1 }),
        max: new f.NumberField({ initial: 1 }),
        type: new f.StringField({ initial: "Number" }),
        label: new f.StringField({ initial: "Quantity" }),
        abrev: new f.StringField({ initial: "Qty" }),
      }),
      unit_wounds: new f.SchemaField({
        value: new f.NumberField({ initial: 0 }),
        type: new f.StringField({ initial: "Number" }),
        label: new f.StringField({ initial: "Unit Wounds" }),
      }),
    };
  }
}
