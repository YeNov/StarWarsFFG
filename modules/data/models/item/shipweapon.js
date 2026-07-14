import { mix, BaseItemDataModel } from "../../mix.js";
import {
  CoreTemplate,
  BasicTemplate,
  HardpointsTemplate,
  EquippableTemplate,
  ItemAttachmentsTemplate,
  QualitiesTemplate,
} from "../../item-templates.js";
import {
  damageField,
  critField,
  rangeField,
  specialField,
  skillField,
  characteristicField,
  statusField,
} from "./_combat-fields.js";

/**
 * `shipweapon` — template.json `templates: ["core", "basic", "hardpoints",
 * "equippable", "itemattachments", "qualities"]` + a top-level `label`
 * (`"Ship Weapon"`), a `firingarc` block, and the shared damage/crit/range/
 * special combat fields (no `skill`/`ammo`, unlike personal weapons).
 */
export class ShipWeaponDataModel extends mix(
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
      label: new f.StringField({ initial: "Ship Weapon" }),
      // Not in template.json's shipweapon body, but stored on 1026 shipweapons
      // and required by DiceHelpers.rollItem, which resolves
      // `actor.system.skills[itemData.skill.value]` for shipweapons too.
      skill: skillField("Gunnery"),
      characteristic: characteristicField(),
      status: statusField(),
      firingarc: new f.SchemaField({
        fore: new f.BooleanField({ initial: false }),
        aft: new f.BooleanField({ initial: false }),
        port: new f.BooleanField({ initial: false }),
        starboard: new f.BooleanField({ initial: false }),
        dorsal: new f.BooleanField({ initial: false }),
        ventral: new f.BooleanField({ initial: false }),
      }),
      damage: damageField(),
      crit: critField(),
      range: rangeField(),
      special: specialField(),
    };
  }
}
