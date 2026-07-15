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
 * inline `stats` block.
 *
 * Rival does NOT use the shared `stats` template, and `strain` is the *only*
 * field that differs between them — i.e. the whole reason this block exists is
 * to omit strain. That omission is deliberate and is kept: rivals have no
 * strain threshold in FFG, the rival sheet has no strain UI, and
 * `strainOverThreshold` is computed for character/nemesis only
 * (actor-ffg.js:269).
 *
 * Do not be tempted to re-add it by the stored data: 711 rivals *do* carry a
 * `stats.strain`, but 684 of those are `{value: 0, min: 0, max: undefined}` —
 * an empty shell written by the adversary importer, not authored. A token bar
 * needs a max to render, so it never displayed anyway.
 *
 * The one dissenting signal is `ActorFFG._onCreate`, which binds the rival
 * prototype token's bar2 to `stats.strain`. That looks like a copy-paste from
 * the character/nemesis cases: minion, which likewise has no strain, correctly
 * gets no bar2 at all. Treated as a pre-existing upstream bug, not a reason to
 * declare the field — see the fix plan.
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
