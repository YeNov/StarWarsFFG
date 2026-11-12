/**
 * Closed `{{editor}}` blocks must not be submitted.
 *
 * The `{{editor}}` helper renders `.editor-content[data-edit="<field>"]` holding
 * the field's ENRICHED HTML — dice codes like `[CH]` already turned into
 * `<span class="dietype …">` glyphs. Foundry's FormDataExtended reads the
 * innerHTML of every `[data-edit]` node it has no editor entry for, so a submit
 * while the block is closed (any submit-on-change) wrote that display HTML over
 * the stored source. Reopened, ProseMirror kept each glyph as a span mark and
 * extended the last one over whatever was typed after it.
 *
 * V1 FormApplication avoided this by registering every block in `this.editors`
 * at render; our sheets register one only when its Edit pencil is clicked, so
 * the fields of the others are dropped here instead. An open editor (one with a
 * live `instance`) is serialized by FormDataExtended from its ProseMirror view
 * and is left alone.
 */

/**
 * Field names of the `{{editor}}` blocks in `root` that have no open editor.
 * @param {ParentNode|null|undefined} root   The sheet's form element.
 * @param {Record<string, {instance?: object|null}>} [editors]  The sheet's editor registry.
 * @returns {Set<string>}
 */
export function closedEditorFields(root, editors = {}) {
  const names = new Set();
  for (const el of root?.querySelectorAll?.(".editor-content[data-edit]") ?? []) {
    const name = el.dataset?.edit;
    if (name && !editors?.[name]?.instance) names.add(name);
  }
  return names;
}

/**
 * Remove the closed editors' fields from a flat FormDataExtended object, in place.
 * @param {Record<string, unknown>} formObject  `FormDataExtended#object` (flat, dotted keys).
 * @param {ParentNode|null|undefined} root      The sheet's form element.
 * @param {Record<string, {instance?: object|null}>} [editors]  The sheet's editor registry.
 * @returns {Record<string, unknown>} The same object.
 */
export function omitClosedEditorFields(formObject, root, editors = {}) {
  for (const name of closedEditorFields(root, editors)) delete formObject[name];
  return formObject;
}
