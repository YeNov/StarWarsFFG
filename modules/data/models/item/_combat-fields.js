/**
 * Field factories shared by the two weapon-like Item types (`weapon` and
 * `shipweapon`), which declare identical `damage`/`crit`/`range`/`special`
 * blocks in template.json. Kept in one place so the two can't drift.
 *
 * `special.value` is rich text (ProseMirror) per the plan's rich-text audit, so
 * it is an `HTMLField`; the sibling `type`/`label` are the legacy inline
 * presentation keys template.json stores.
 */

/** `damage` — `{ value, type, label, abrev, adjusted }`. */
export function damageField() {
  const f = foundry.data.fields;
  return new f.SchemaField({
    value: new f.NumberField({ initial: 0 }),
    type: new f.StringField({ initial: "Number" }),
    label: new f.StringField({ initial: "Damage" }),
    abrev: new f.StringField({ initial: "Dam" }),
    adjusted: new f.NumberField({ initial: 0 }),
  });
}

/** `crit` — `{ value, type, label, abrev, adjusted }`. */
export function critField() {
  const f = foundry.data.fields;
  return new f.SchemaField({
    value: new f.NumberField({ initial: 0 }),
    type: new f.StringField({ initial: "Number" }),
    label: new f.StringField({ initial: "Critical Rating" }),
    abrev: new f.StringField({ initial: "Crit" }),
    adjusted: new f.NumberField({ initial: 0 }),
  });
}

/** `range` — `{ value, type, label, adjusted }`; value/adjusted are strings. */
export function rangeField() {
  const f = foundry.data.fields;
  return new f.SchemaField({
    value: new f.StringField({ initial: "Short" }),
    type: new f.StringField({ initial: "String" }),
    label: new f.StringField({ initial: "Range" }),
    adjusted: new f.StringField({ initial: "Short" }),
  });
}

/** `special` — `{ value (rich text), type, label }`. */
export function specialField() {
  const f = foundry.data.fields;
  return new f.SchemaField({
    value: new f.HTMLField({ initial: "" }),
    type: new f.StringField({ initial: "String" }),
    label: new f.StringField({ initial: "Special" }),
  });
}
