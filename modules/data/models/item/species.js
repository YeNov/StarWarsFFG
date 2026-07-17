import { mix, BaseItemDataModel } from "../../mix.js";
import { CoreTemplate } from "../../item-templates.js";

/**
 * `species` — template.json `templates: ["core"]` + own fields. `talents`,
 * `abilities` and `species` are freeform dictionaries with dynamic keys and
 * object values (the OggDude importer writes `system.talents[talent._id] = {…}`
 * etc.), so they stay untyped `ObjectField`s — nothing is stripped. `startingXP`
 * is a plain number.
 */
export class SpeciesDataModel extends mix(BaseItemDataModel, CoreTemplate) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      talents: new f.ObjectField(),
      abilities: new f.ObjectField(),
      species: new f.ObjectField(),
      startingXP: new f.NumberField({ initial: 0 }),
    };
  }
}
