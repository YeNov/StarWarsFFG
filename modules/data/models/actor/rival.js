import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import {
  BiographyTemplate,
  SpeciesRefTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
  medicalField,
} from "../../actor-templates.js";

/**
 * `rival` (Actor) — template.json `templates: ["biography", "species",
 * "characteristics", "skills", "attributes", "general", "meta_only"]` + its OWN
 * inline `stats` block. Rival does NOT use the shared `stats` template: the
 * shared block carries fields rival never had, so the block is declared here.
 *
 * `strain` IS declared despite template.json's rival omitting it. Two reasons,
 * both measured: 708 rivals store `stats.strain.value`/`.min` (the adversary
 * importer writes it), and `ActorFFG._onCreate` binds the rival prototype
 * token's bar2 to `stats.strain` (actor-ffg.js). Under template.json the stored
 * keys survived and that bar worked; pruning them broke it. `strainOverThreshold`
 * stays character/nemesis-only (actor-ffg.js:269), which is why the rival sheet
 * has no strain UI — the token bar is the consumer.
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
        strain: new f.SchemaField({ value: num(), min: num(), max: num(), adjusted: num() }),
        medical: medicalField(),
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
