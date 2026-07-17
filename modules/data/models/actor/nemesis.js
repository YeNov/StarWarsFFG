import { mix, BaseActorDataModel } from "../../mix.js";
import { MetaOnlyTemplate } from "../../shared-fields.js";
import {
  BiographyTemplate,
  SpeciesRefTemplate,
  StatsTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
} from "../../actor-templates.js";

/**
 * `nemesis` (Actor) — template.json `templates: ["biography", "species",
 * "stats", "characteristics", "skills", "attributes", "general", "meta_only"]`.
 * Pure template composition, no own fields (shared `stats`, so includes
 * `strain`).
 */
export class NemesisDataModel extends mix(
  BaseActorDataModel,
  BiographyTemplate,
  SpeciesRefTemplate,
  StatsTemplate,
  CharacteristicsTemplate,
  SkillsTemplate,
  AttributesTemplate,
  GeneralTemplate,
  MetaOnlyTemplate,
) {}
