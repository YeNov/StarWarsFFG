import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";

/**
 * `talent` — template.json `templates: ["core"]` + own fields. `trees` is an
 * array of specialization id strings (see item-sheet-ffg.js
 * `system.trees.includes(specialization.id)`); `longDesc` is rich text
 * (`HTMLField`). Read by the specialization / signature-ability tree UI and the
 * Codex force-tree widget — shape must stay identical.
 */
export class TalentDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      activation: new f.SchemaField({
        value: new f.StringField({ initial: "Passive" }),
        type: new f.StringField({ initial: "String" }),
        label: new f.StringField({ initial: "Activation" }),
      }),
      ranks: new f.SchemaField({
        ranked: new f.BooleanField({ initial: false }),
        current: new f.NumberField({ initial: 1 }),
        min: new f.NumberField({ initial: 0 }),
      }),
      isForceTalent: new f.BooleanField({ initial: false }),
      isConflictTalent: new f.BooleanField({ initial: false }),
      tier: new f.NumberField({ initial: 1 }),
      trees: new f.ArrayField(new f.StringField()),
      longDesc: new f.HTMLField({ initial: "" }),
    };
  }
}
