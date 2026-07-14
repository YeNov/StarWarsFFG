import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import {
  BiographyTemplate,
  SpeciesRefTemplate,
  CareerRefTemplate,
  SpecialisationRefTemplate,
  StatsTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
} from "../../actor-templates.js";

/**
 * `character` (Actor) — the full PC. template.json `templates: ["biography",
 * "species", "career", "specialisation", "stats", "characteristics", "skills",
 * "attributes", "general", "meta_only"]` + the character-only tracks
 * `encumbrance`, `obligation`, `duty`, `morality`, `conflict`, `experience`.
 * Largest surface / heaviest derived-stat coupling — done last.
 */
export class CharacterDataModel extends mix(
  BaseActorDataModel,
  BiographyTemplate,
  SpeciesRefTemplate,
  CareerRefTemplate,
  SpecialisationRefTemplate,
  StatsTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
  MetaOnlyTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    const num = (initial = 0) => new f.NumberField({ initial });
    const str = (initial) => new f.StringField({ initial });
    return {
      ...super.defineSchema(),
      encumbrance: new f.SchemaField({
        value: num(0),
        type: str("Number"),
        label: str("Encumbrance"),
        abrev: str("Encum"),
        adjusted: num(0),
      }),
      obligation: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Obligation") }),
      duty: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Duty") }),
      morality: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Morality") }),
      conflict: new f.SchemaField({ value: num(0), type: str("Number"), label: str("Conflict") }),
      experience: new f.SchemaField({ total: num(0), available: num(0) }),
      // Not in template.json, but written by the OggDude character importer
      // (import-helpers.js) and the sheet's add/remove-duty handlers, and read
      // by the Group Manager's obligation/duty tables plus the derived totals in
      // ActorFFG._prepareCharacterData. Freeform: randomID-keyed entries of
      // `{key, type, magnitude, description}`.
      obligationlist: new f.ObjectField(),
      dutylist: new f.ObjectField(),
    };
  }
}
