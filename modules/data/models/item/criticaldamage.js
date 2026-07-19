import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";

/**
 * `criticaldamage` — template.json `templates: ["core"]` + top-level
 * `min`/`max`/`severity`. Same shape as `criticalinjury`.
 */
export class CriticalDamageDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      min: new f.NumberField({ initial: 0 }),
      max: new f.NumberField({ initial: 0 }),
      severity: new f.NumberField({ initial: 1 }),
      mechanicsLastAttemptDay: new f.NumberField({ nullable: true, initial: null, integer: true }),
    };
  }
}
