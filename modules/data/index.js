/**
 * System Data Model public entry point.
 *
 * Re-exports the composition primitives, shared template mixins and the
 * per-sub-type models, and owns `registerSystemDataModels()` — the single place
 * those models get wired into `CONFIG.Actor.dataModels` /
 * `CONFIG.Item.dataModels`. Concrete models live one-per-type under
 * ./models/item/ and ./models/actor/; the sub-type → class maps live in
 * ./models-registry.js so the conformance reporter can use them without
 * importing this module (which re-exports it).
 *
 * All 26 sub-types are registered and template.json is retired — the staged,
 * partial registration the migration used is finished.
 *
 * NOTE: registration is client-side only. The Foundry server never executes
 * these esmodules, so it resolves no model, never prunes undeclared paths, and
 * keeps persisting the full stored record. A path missing from a schema is
 * therefore invisible to sheets and code, but is NOT erased from the database.
 *
 * Plans: docs/superpowers/plans/2026-07-04-template-json-to-datamodel-migration.md
 *        docs/superpowers/plans/2026-07-14-datamodel-undeclared-paths-fix.md
 */

export { mix, BaseActorDataModel, BaseItemDataModel } from "./mix.js";
export { metadataField, MetaOnlyTemplate } from "./shared-fields.js";
export { reportDataModelConformance } from "./conformance-report.js";
export * from "./actor-templates.js";
export * from "./item-templates.js";
export * from "./models-registry.js";

import { ACTOR_MODELS, ITEM_MODELS } from "./models-registry.js";

/**
 * Register the system's per-sub-type data models. Called once from the `init`
 * hook (swffg-main.js), before any document is prepared.
 *
 * The staged, type-by-type registration this used to spell out is finished —
 * all 26 sub-types are live — so the maps now come wholesale from
 * ./models-registry.js, which the conformance reporter also uses.
 */
export function registerSystemDataModels() {
  Object.assign(CONFIG.Item.dataModels, ITEM_MODELS);
  Object.assign(CONFIG.Actor.dataModels, ACTOR_MODELS);
}
