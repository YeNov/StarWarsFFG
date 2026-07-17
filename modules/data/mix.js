/**
 * Star Wars FFG — System Data Model composition primitives (Stage 0 scaffolding).
 *
 * This is the first piece of the template.json → System Data Model migration.
 * Foundry has no native "template" concept the way template.json does, so each
 * of template.json's shared `templates` blocks is reproduced as a mixin
 * function `(Base) => class extends Base` that merges extra fields into
 * `defineSchema()`. Concrete per-sub-type classes compose a base model with the
 * mixins they need, exactly mirroring each type's `templates: [...]` array.
 *
 * Stage 0 registers ZERO types — this module and its siblings only define the
 * building blocks. `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels` stay
 * empty until later stages flip individual types over (see
 * ./index.js#registerSystemDataModels and the migration plan:
 * docs/superpowers/plans/2026-07-04-template-json-to-datamodel-migration.md).
 *
 * NOTE: every field is constructed lazily inside `defineSchema()`, which
 * Foundry only calls when a type is instantiated or registered. Because Stage 0
 * registers nothing, none of these classes are ever instantiated, so this
 * scaffolding cannot affect system boot.
 */

/**
 * Compose a base DataModel class with one or more schema "template" mixins.
 *
 * `mix(Base, A, B)` yields `B(A(Base))`, so `super.defineSchema()` chains
 * through every mixin and later mixins win on key collisions. Our shared
 * templates use disjoint top-level keys, so composition order is cosmetic.
 *
 * @param {Function} Base   a `foundry.abstract.TypeDataModel` subclass
 * @param {...(Base: Function) => Function} mixins  template mixin functions
 * @returns {Function} the composed subclass
 */
export function mix(Base, ...mixins) {
  return mixins.reduce((acc, mixin) => mixin(acc), Base);
}

/**
 * Root system-data model for Actor sub-types. Concrete Actor types compose this
 * with the actor template mixins (./actor-templates.js) plus their own fields.
 */
export class BaseActorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }
}

/**
 * Root system-data model for Item sub-types. Concrete Item types compose this
 * with the item template mixins (./item-templates.js) plus their own fields.
 */
export class BaseItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }
}
