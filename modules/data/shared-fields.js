/**
 * Field factories and template mixins shared between Actor and Item data models.
 *
 * See ./mix.js for the composition model and the migration plan for the
 * per-type mapping. Every field is built inside a function / `defineSchema()`
 * so nothing is evaluated at import time.
 */

/**
 * The `metadata` block (template.json `meta_only`, and the item `core`
 * template). Free-text tags and source-book references, both plain string
 * arrays — see the source/tag handlers in
 * modules/apps/ffg-document-sheet.js and the OggDude importers, which push
 * lower-cased category strings and `"<book> pg. <n>"` strings respectively.
 *
 * Default shape: `{ tags: [], sources: [] }`.
 *
 * @returns {foundry.data.fields.SchemaField}
 */
export function metadataField() {
  const f = foundry.data.fields;
  return new f.SchemaField({
    tags: new f.ArrayField(new f.StringField()),
    sources: new f.ArrayField(new f.StringField()),
  });
}

/**
 * template.json `meta_only` template — just the metadata block, no description
 * or attributes. Used by all six Actor types and the `homesteadupgrade` Item
 * type.
 *
 * Default shape: `{ metadata: { tags: [], sources: [] } }`.
 */
export const MetaOnlyTemplate = (Base) =>
  class extends Base {
    static defineSchema() {
      return {
        ...super.defineSchema(),
        metadata: metadataField(),
      };
    }
  };
