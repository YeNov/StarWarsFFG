import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import {
  BiographyTemplate,
  SpeciesRefTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
} from "../../actor-templates.js";

/**
 * `rival` (Actor) — template.json `templates: ["biography", "species",
 * "characteristics", "skills", "attributes", "general", "meta_only"]` + its OWN
 * inline `stats` block. Rival does NOT use the shared `stats` template: its
 * stats omit `strain` (and `strainOverThreshold`), so `StatsTemplate` is not
 * mixed in and the block is declared here.
 */
export class RivalDataModel extends mix(
  BaseActorDataModel,
  BiographyTemplate,
  SpeciesRefTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
  MetaOnlyTemplate,
) {
  static defineSchema() {
    const f = foundry.data.fields;
    const num = (initial = 0) => new f.NumberField({ initial });
    return {
      ...super.defineSchema(),
      stats: new f.SchemaField({
        wounds: new f.SchemaField({ value: num(), min: num(), max: num(), adjusted: num() }),
        soak: new f.SchemaField({ value: num(), adjusted: num() }),
        defence: new f.SchemaField({ ranged: num(), melee: num(), adjusted: num() }),
        encumbrance: new f.SchemaField({ value: num(), max: num(), adjusted: num() }),
        forcePool: new f.SchemaField({ value: num(), max: num(), adjusted: num() }),
        credits: new f.SchemaField({
          value: num(),
          type: new f.StringField({ initial: "Number" }),
          label: new f.StringField({ initial: "Credits" }),
          adjusted: num(),
        }),
      }),
    };
  }
}
