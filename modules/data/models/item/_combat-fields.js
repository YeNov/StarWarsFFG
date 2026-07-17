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

/**
 * `skill` — the skill a weapon-like item rolls with. template.json declares this
 * on `weapon` only, but `shipweapon` stores it too (1026 documents) and
 * DiceHelpers.rollItem resolves `actor.system.skills[itemData.skill.value]`
 * for both, so leaving it off shipweapon breaks ship-weapon attack rolls.
 *
 * `useBrawn` is deliberately NOT declared: the OggDude/SWA importers write it
 * (3018 documents) but nothing reads it — grep finds writes only — so it is
 * dead data and dropping it is correct.
 */
export function skillField(initial = "Ranged: Light") {
  const f = foundry.data.fields;
  return new f.SchemaField({
    value: new f.StringField({ initial }),
    type: new f.StringField({ initial: "String" }),
    label: new f.StringField({ initial: "Skill" }),
  });
}

/**
 * `characteristic` — overrides which characteristic a weapon rolls against
 * (the importers set `Brawn` for melee/brawl/lightsaber). Not in template.json,
 * but stored on 1285 weapons / 988 shipweapons and read by
 * ModifierHelpers (modifiers.js `data.characteristic?.value`) and the Codex
 * item sheet's `data.characteristic.value` select.
 */
export function characteristicField() {
  const f = foundry.data.fields;
  return new f.SchemaField({
    value: new f.StringField({ initial: "" }),
  });
}

/**
 * `status` — item damage condition (None/Minor/Moderate/Major). Not in
 * template.json; bound on the weapon/armour/shipweapon sheets and read by
 * DiceHelpers (`item.system.status !== "None"`) to add Setback dice and block
 * rolls with too-damaged gear. Stored on 896 weapons. Undeclared, that whole
 * rule silently no-ops.
 */
export function statusField() {
  const f = foundry.data.fields;
  return new f.StringField({ initial: "None" });
}
