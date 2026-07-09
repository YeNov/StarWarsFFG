import { mix, BaseItemDataModel } from "../../mix.js";
import {
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  EquippableTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
} from "../../item-templates.js";
import { damageField, critField, rangeField, specialField } from "./_combat-fields.js";

/**
 * `weapon` — template.json `templates: ["core", "basic", "hardpoints",
 * "equippable", "itemattachments", "qualities"]` + own combat fields:
 * `skill`, `damage`, `crit`, `range`, `special`, `ammo`.
 */
export class WeaponDataModel extends mix(
  BaseItemDataModel,
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  EquippableTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      ...super.defineSchema(),
      skill: new f.SchemaField({
        value: new f.StringField({ initial: "Ranged: Light" }),
        type: new f.StringField({ initial: "String" }),
        label: new f.StringField({ initial: "Skill" }),
      }),
      damage: damageField(),
      crit: critField(),
      range: rangeField(),
      special: specialField(),
      ammo: new f.SchemaField({
        max: new f.NumberField({ initial: 0 }),
        value: new f.NumberField({ initial: 0 }),
      }),
    };
  }
}
