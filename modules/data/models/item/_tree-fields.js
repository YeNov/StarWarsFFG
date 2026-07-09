/**
 * Field helpers for the tree-type Item models (forcepower, specialization,
 * career, signatureability). template.json seeds their slot dictionaries with
 * fixed numbered keys (`upgrade0..15`, `talent0..19`, …) but the inner slot
 * shape is written dynamically at runtime by item-editor.js. A live force power
 * confirmed the inner shape is genuinely freeform — hyphenated link keys
 * (`links-top-1`, `links-right`), a string `cost`, a nested `attributes` bag,
 * assorted booleans — so slot VALUES stay untyped `ObjectField`s and nothing is
 * ever stripped. The numbered keys are dynamic too (`TypedObjectField`), just
 * seeded with the template.json defaults.
 */

/** Build `{ <prefix>0: value(), … <prefix>{count-1}: value() }`. */
function numbered(prefix, count, value) {
  const out = {};
  for (let i = 0; i < count; i++) out[`${prefix}${i}`] = value();
  return out;
}

/**
 * A dictionary of freeform slot objects (`upgrades` / `talents`), seeded with
 * `count` empty slots (`{}`). Dynamic keys, freeform values → drop-proof.
 */
export function slotDictField(prefix, count) {
  const f = foundry.data.fields;
  return new f.TypedObjectField(new f.ObjectField(), {
    initial: () => numbered(prefix, count, () => ({})),
  });
}

/**
 * A dictionary of strings (`careerSkills`), seeded with `count` entries all set
 * to `initialValue` (`"(none)"`).
 */
export function stringSlotField(prefix, count, initialValue = "(none)") {
  const f = foundry.data.fields;
  return new f.TypedObjectField(new f.StringField(), {
    initial: () => numbered(prefix, count, () => initialValue),
  });
}

/** A dictionary of booleans (`uplink_nodes`), seeded with `count` `false` entries. */
export function boolSlotField(prefix, count) {
  const f = foundry.data.fields;
  return new f.TypedObjectField(new f.BooleanField(), {
    initial: () => numbered(prefix, count, () => false),
  });
}
