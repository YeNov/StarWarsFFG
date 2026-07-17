import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import { BiographyTemplate, AttributesTemplate } from "../../actor-templates.js";

/**
 * `vehicle` (Actor) — template.json `templates: ["biography", "attributes",
 * "meta_only"]` + a large inline `stats` block (its own, NOT the shared actor
 * `stats` template), plus `spaceShip` and `silhouetteImage`. Every legacy inline
 * `type`/`label`/`min`/`max` key is declared to avoid a drop; `crew` is a
 * freeform `ObjectField` (`{}` default, dynamic role/actor entries).
 */
export class VehicleDataModel extends mix(
  BaseActorDataModel,
  BiographyTemplate,
  AttributesTemplate,
  MetaOnlyTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    const num = (initial = 0) => new f.NumberField({ initial });
    const str = (initial) => new f.StringField({ initial });
    return {
      ...super.defineSchema(),
      stats: new f.SchemaField({
        silhouette: new f.SchemaField({ value: num(1), type: str("Number"), label: str("Silhouette") }),
        speed: new f.SchemaField({ value: num(0), max: num(0), type: str("Number"), label: str("Speed") }),
        handling: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Handling") }),
        hullTrauma: new f.SchemaField({ value: num(0), min: num(0), max: num(10), label: str("Hull Trauma") }),
        systemStrain: new f.SchemaField({ value: num(0), min: num(0), max: num(10), label: str("System Strain") }),
        shields: new f.SchemaField({ fore: num(0), port: num(0), starboard: num(0), aft: num(0), label: str("Shields") }),
        armour: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Armour"), adjusted: num(0) }),
        sensorRange: new f.SchemaField({ value: str("Short"), type: str("String") }),
        crew: new f.ObjectField(),
        passengerCapacity: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Passenger Capacity") }),
        encumbrance: new f.SchemaField({ value: num(0), min: num(0), max: num(10), adjusted: num(0) }),
        cost: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Cost"), adjusted: num(0) }),
        rarity: new f.SchemaField({ value: num(0), isrestricted: new f.BooleanField({ initial: false }), type: str("Number"), label: str("Rarity"), adjusted: num(0) }),
        customizationHardPoints: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Hard Points"), adjusted: num(0) }),
        // `backup` is not in template.json but is bound on the vehicle sheet
        // (HyperdriveBackup) and the Codex vehicle sheet, and stored on 457
        // vehicles. Nullable: the stored value is `null` on many of them.
        hyperdrive: new f.SchemaField({
          value: num(1),
          backup: new f.NumberField({ initial: null, nullable: true }),
          type: str("Number"),
          label: str("SWFFG.Hyperdrive"),
        }),
        consumables: new f.SchemaField({ value: num(1), duration: str("months"), type: str("Number"), label: str("SWFFG.Consumables") }),
        navicomputer: new f.SchemaField({ value: new f.BooleanField({ initial: false }), type: str("Boolean"), label: str("SWFFG.VehicleNavicomputer") }),
      }),
      spaceShip: new f.BooleanField({ initial: false }),
      silhouetteImage: new f.StringField({ initial: "systems/starwarsffg/images/shipdefence.png" }),
    };
  }
}
