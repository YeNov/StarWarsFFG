import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";

/**
 * `criticalinjury` — template.json `templates: ["core"]` + top-level
 * `min`/`max`/`severity` (the roll range this injury occupies + its severity).
 */
export class CriticalInjuryDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      min: new f.NumberField({ initial: 0 }),
      max: new f.NumberField({ initial: 0 }),
      severity: new f.NumberField({ initial: 1 }),
    };
  }
}
