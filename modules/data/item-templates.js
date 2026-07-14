/**
 * Item template mixins — one per shared `templates` block in template.json's
 * `Item` section. Same rules as the actor templates: reproduce the exact stored
 * shape, including the legacy inline `type`/`label`/`abrev` presentation keys,
 * so nothing is dropped on cutover. See ./mix.js and the migration plan.
 *
 * `itemattachment` / `itemmodifier` / `adjusteditemmodifer` are plain
 * duplicated-object snapshots stored inside the parent item (NOT real embedded
 * Documents), so they are `ArrayField(ObjectField)` — they migrate as part of
 * whatever item contains them.
 */

import { metadataField } from "./shared-fields.js";

/**
 * template.json `core` — `description` (rich text), a freeform `attributes`
 * bag, and the shared `metadata` block. `description` uses `HTMLField` because
 * it holds ProseMirror markup (see the plan's rich-text note).
 *
 * The three narrative types (background/obligation/motivation) redeclare
 * `description` in their own bodies in template.json; that is a benign
 * authoring artifact (identical `""`, merges to one `system.description`). It
 * is declared ONCE here and must NOT be redeclared on those types — a schema
 * cannot hold two same-named fields.
 */
export const CoreTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        description: new f.HTMLField({ initial: "" }),
        attributes: new f.ObjectField(),
        metadata: metadataField(),
      };
    }
  };

/**
 * template.json `basic` — quantity / encumbrance / price / rarity, each with
 * the legacy inline presentation keys stored on documents.
 */
export const BasicTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      const num = (initial = 0) => new f.NumberField({ initial });
      const str = (initial) => new f.StringField({ initial });
      return {
        ...super.defineSchema(),
        quantity: new f.SchemaField({
          value: num(1),
          type: str("Number"),
          label: str("Quantity"),
          abrev: str("Qty"),
        }),
        encumbrance: new f.SchemaField({
          value: num(),
          type: str("Number"),
          label: str("Encumbrance"),
          abrev: str("Encum"),
          adjusted: num(),
        }),
        price: new f.SchemaField({
          value: num(),
          type: str("Number"),
          label: str("Price"),
          adjusted: num(),
        }),
        rarity: new f.SchemaField({
          value: num(),
          // Not in template.json, but written by every OggDude importer and bound
          // as a checkbox on ~10 sheets; 1272 weapons / 1142 gear / 1024 shipweapons
          // / 245 armour store it. Undeclared it reads `undefined`, so the
          // restricted flag renders false everywhere and the character-creator
          // shop filter stops excluding restricted gear.
          isrestricted: new f.BooleanField({ initial: false }),
          type: str("Number"),
          label: str("Rarity"),
          adjusted: num(),
        }),
      };
    }
  };

/** template.json `hardpoints` — `{ hardpoints: { value, type, label, abrev, adjusted } }`. */
export const HardpointsTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        hardpoints: new f.SchemaField({
          value: new f.NumberField({ initial: 0 }),
          type: new f.StringField({ initial: "Number" }),
          label: new f.StringField({ initial: "Hard Points" }),
          abrev: new f.StringField({ initial: "HP" }),
          adjusted: new f.NumberField({ initial: 0 }),
        }),
      };
    }
  };

/** template.json `equippable` — `{ equippable: { value, type, equipped } }`. */
export const EquippableTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        equippable: new f.SchemaField({
          value: new f.BooleanField({ initial: true }),
          type: new f.StringField({ initial: "Boolean" }),
          equipped: new f.BooleanField({ initial: false }),
        }),
      };
    }
  };

/**
 * template.json `itemattachments` — `{ itemattachment: [] }`. Array of
 * duplicated attachment snapshots (weapon/armour mods), not embedded Documents.
 */
export const ItemAttachmentsTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        itemattachment: new f.ArrayField(new f.ObjectField()),
      };
    }
  };

/**
 * template.json `qualities` — `{ itemmodifier: [], adjusteditemmodifer: [] }`.
 * Arrays of duplicated quality-modifier snapshots. The `adjusteditemmodifer`
 * misspelling is intentional — it matches the stored path and must be
 * preserved exactly.
 */
export const QualitiesTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      const f = foundry.data.fields;
      return {
        ...super.defineSchema(),
        itemmodifier: new f.ArrayField(new f.ObjectField()),
        adjusteditemmodifer: new f.ArrayField(new f.ObjectField()),
      };
    }
  };
