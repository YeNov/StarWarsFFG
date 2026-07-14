import { mix, BaseItemDataModel } from "../../mix.js";
import {
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  EquippableTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
} from "../../item-templates.js";
import { statusField } from "./_combat-fields.js";

/**
 * `armour` — template.json `templates: ["core", "basic", "hardpoints",
 * "equippable", "itemattachments", "qualities"]` + `defence` and `soak`, plus
 * the undeclared-but-stored `status` condition (see `statusField`).
 */
export class ArmourDataModel extends mix(
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
      status: statusField(),
      defence: new f.SchemaField({
        value: new f.NumberField({ initial: 0 }),
        type: new f.StringField({ initial: "Number" }),
        label: new f.StringField({ initial: "Defence" }),
        abrev: new f.StringField({ initial: "Def" }),
        adjusted: new f.NumberField({ initial: 0 }),
      }),
      soak: new f.SchemaField({
        value: new f.NumberField({ initial: 0 }),
        type: new f.StringField({ initial: "Number" }),
        label: new f.StringField({ initial: "Soak" }),
        adjusted: new f.NumberField({ initial: 0 }),
      }),
    };
  }
}
