/**
 * System Data Model registry.
 *
 * Public entry point for the template.json → DataModel migration. Re-exports
 * the composition primitives and shared template mixins, and owns
 * `registerSystemDataModels()`, the single place where per-sub-type classes get
 * wired into `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels`.
 *
 * Stage 0: registers NOTHING. template.json still governs every type. Each
 * later stage adds its concrete DataModel classes to the maps below, one or a
 * few types at a time — Foundry uses a registered DataModel where present and
 * falls back to template.json for the rest, so partial registration is valid.
 *
 * Plan: docs/superpowers/plans/2026-07-04-template-json-to-datamodel-migration.md
 */

import { HomesteadUpgradeDataModel, AbilityDataModel } from "./item-models.js";

export { mix, BaseActorDataModel, BaseItemDataModel } from "./mix.js";
export { metadataField, MetaOnlyTemplate } from "./shared-fields.js";
export * from "./actor-templates.js";
export * from "./item-templates.js";
export * from "./item-models.js";

/**
 * Register the system's per-sub-type data models. Called once from the `init`
 * hook (swffg-main.js), before any document is prepared.
 *
 * Foundry uses a registered DataModel where present and falls back to
 * template.json for the rest, so partial registration is valid — each stage
 * adds a few more entries below.
 */
export function registerSystemDataModels() {
  // Stage 1 (proof of concept): the two simplest Item types, no own fields.
  Object.assign(CONFIG.Item.dataModels, {
    homesteadupgrade: HomesteadUpgradeDataModel,
    ability: AbilityDataModel,
  });
}
