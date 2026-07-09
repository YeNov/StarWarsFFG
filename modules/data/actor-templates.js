/**
 * Actor template mixins — one per shared `templates` block in template.json's
 * `Actor` section. Each reproduces the exact stored shape (including the legacy
 * inline `type`/`label`/`abrev` presentation keys that template.json bakes into
 * document data) so no field is silently dropped when a type flips to a
 * DataModel. See ./mix.js and the migration plan for the mapping.
 *
 * Rich-text fields (`biography`, `general.features`) use `HTMLField` per the
 * plan's rich-text note — a plain `StringField` can mangle stored ProseMirror
 * markup. The sheets already run these through `enrichHTML`.
 */

import { defaultSkillList } from "../config/ffg-skillslist.js";

/**
 * Stock starwars skill dictionary, used as the `skills` default for new actors.
 * Mirrors template.json's `skills` template block (identical key set + values).
 * Sourced from the shared config so the two never drift.
 *
 * NOTE (Stage 7): confirm new-actor skill defaulting against a live world
 * before registering minion/rival/nemesis — worlds with a custom
 * `arraySkillList` may expect a different starting set than the stock list.
 */
const STOCK_SKILLS = () => {
  const list = defaultSkillList.find((l) => l.id === "starwars");
  return foundry.utils.deepClone(list?.skills ?? {});
};

/** template.json `biography` — a single rich-text field. */
export const BiographyTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        biography: new f.HTMLField({ initial: "" }),
      };
    }
  };

/** template.json `species` — `{ species: { value, type } }`. */
export const SpeciesRefTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        species: new f.SchemaField({
          value: new f.StringField({ initial: "" }),
          type: new f.StringField({ initial: "String" }),
        }),
      };
    }
  };

/** template.json `career` — `{ career: { value, type } }`. */
export const CareerRefTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        career: new f.SchemaField({
          value: new f.StringField({ initial: "" }),
          type: new f.StringField({ initial: "String" }),
        }),
      };
    }
  };

/**
 * template.json `specialisation` — `{ specialisation: { value, list, type } }`.
 *
 * NOTE (Stage 8): `list` is `[]` in template.json; confirm its element type
 * (string ids vs. objects) against a live character with multiple
 * specialisations before registering CharacterDataModel. Only `character` uses
 * this template. Modelled as a string array for now — inert until registered.
 */
export const SpecialisationRefTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        specialisation: new f.SchemaField({
          value: new f.StringField({ initial: "" }),
          list: new f.ArrayField(new f.StringField()),
          type: new f.StringField({ initial: "String" }),
        }),
      };
    }
  };

/**
 * template.json `stats` — the character/minion/nemesis derived-stat block.
 * (rival and vehicle declare their own inline `stats`, so this shared template
 * is not used by them.) `credits` carries legacy inline `type`/`label` keys
 * that are stored on documents, so they must be declared to avoid a drop.
 */
export const StatsTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      const num = (initial = 0) => new f.NumberField({ initial });
      return {
        ...super.defineSchema(),
        stats: new f.SchemaField({
          wounds: new f.SchemaField({ value: num(), min: num(), max: num(), adjusted: num() }),
          strain: new f.SchemaField({ value: num(), min: num(), max: num(), adjusted: num() }),
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
  };

/**
 * template.json `characteristics` — the six fixed characteristics. Explicit
 * named fields (the outer key set is invariant: Brawn/Agility/Intellect/
 * Cunning/Willpower/Presence), each `{ value, label, abrev }`.
 */
export const CharacteristicsTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      const characteristic = (label, abrev) =>
        new f.SchemaField({
          value: new f.NumberField({ initial: 0 }),
          label: new f.StringField({ initial: label }),
          abrev: new f.StringField({ initial: abrev }),
        });
      return {
        ...super.defineSchema(),
        characteristics: new f.SchemaField({
          Brawn: characteristic("Brawn", "Br"),
          Agility: characteristic("Agility", "Ag"),
          Intellect: characteristic("Intellect", "Int"),
          Cunning: characteristic("Cunning", "Cun"),
          Willpower: characteristic("Willpower", "Will"),
          Presence: characteristic("Presence", "Pr"),
        }),
      };
    }
  };

/**
 * template.json `skills`. The outer key set is NOT fixed — GMs can add custom
 * skills via `CONFIG.FFG` — so it stays a `TypedObjectField`, not named fields.
 * Each skill value stays a freeform `ObjectField`: template.json declares only
 * rank/characteristic/groupskill/careerskill/type/max, but the dice-modifier
 * status effects write seven more per-skill keys (boost/setback/upgrades/
 * success/upgradeDifficulty/difficulty/advantage — see swffg-main.js
 * `allSkillChanges`), and a strict inner schema would strip them. The default
 * dictionary is the stock starwars skill list.
 */
export const SkillsTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        skills: new f.TypedObjectField(new f.ObjectField(), {
          initial: () => STOCK_SKILLS(),
        }),
      };
    }
  };

/**
 * template.json `attributes` — a freeform bag populated by Active Effects /
 * modifiers, so a plain untyped `ObjectField` (default `{}`), not a schema.
 */
export const AttributesTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        attributes: new f.ObjectField(),
      };
    }
  };

/** template.json `general` — `{ general: { features } }`; features is rich text. */
export const GeneralTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        general: new f.SchemaField({
          features: new f.HTMLField({ initial: "<p></p>" }),
        }),
      };
    }
  };
