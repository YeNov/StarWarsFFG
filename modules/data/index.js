/**
 * System Data Model registry.
 *
 * Public entry point for the template.json → DataModel migration. Re-exports
 * the composition primitives, shared template mixins, and concrete per-sub-type
 * models, and owns `registerSystemDataModels()`, the single place where those
 * models get wired into `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels`.
 *
 * Concrete models live one-per-type under ./models/item/ (and ./models/actor/
 * as those stages land). Foundry uses a registered DataModel where present and
 * falls back to template.json for the rest, so partial registration is valid —
 * each stage adds a few more entries to `registerSystemDataModels()`.
 *
 * Plan: docs/superpowers/plans/2026-07-04-template-json-to-datamodel-migration.md
 */

export { mix, BaseActorDataModel, BaseItemDataModel } from "./mix.js";
export { metadataField, MetaOnlyTemplate } from "./shared-fields.js";
export { reportDataModelConformance } from "./conformance-report.js";
export * from "./actor-templates.js";
export * from "./item-templates.js";

// Concrete Item models (one file per type).
import { AbilityDataModel } from "./models/item/ability.js";
import { HomesteadUpgradeDataModel } from "./models/item/homesteadupgrade.js";
import { CriticalInjuryDataModel } from "./models/item/criticalinjury.js";
import { CriticalDamageDataModel } from "./models/item/criticaldamage.js";
import { BackgroundDataModel } from "./models/item/background.js";
import { ObligationDataModel } from "./models/item/obligation.js";
import { MotivationDataModel } from "./models/item/motivation.js";
import { ItemModifierDataModel } from "./models/item/itemmodifier.js";
import { GearDataModel } from "./models/item/gear.js";
import { WeaponDataModel } from "./models/item/weapon.js";
import { ArmourDataModel } from "./models/item/armour.js";
import { ShipWeaponDataModel } from "./models/item/shipweapon.js";
import { ShipAttachmentDataModel } from "./models/item/shipattachment.js";
import { ItemAttachmentDataModel } from "./models/item/itemattachment.js";
import { TalentDataModel } from "./models/item/talent.js";
import { SpeciesDataModel } from "./models/item/species.js";
import { ForcePowerDataModel } from "./models/item/forcepower.js";
import { SpecializationDataModel } from "./models/item/specialization.js";
import { CareerDataModel } from "./models/item/career.js";
import { SignatureAbilityDataModel } from "./models/item/signatureability.js";

// Concrete Actor models (one file per type).
import { VehicleDataModel } from "./models/actor/vehicle.js";
import { HomesteadDataModel } from "./models/actor/homestead.js";
import { MinionDataModel } from "./models/actor/minion.js";
import { RivalDataModel } from "./models/actor/rival.js";
import { NemesisDataModel } from "./models/actor/nemesis.js";
import { CharacterDataModel } from "./models/actor/character.js";

export {
  AbilityDataModel,
  HomesteadUpgradeDataModel,
  CriticalInjuryDataModel,
  CriticalDamageDataModel,
  BackgroundDataModel,
  ObligationDataModel,
  MotivationDataModel,
  ItemModifierDataModel,
  GearDataModel,
  WeaponDataModel,
  ArmourDataModel,
  ShipWeaponDataModel,
  ShipAttachmentDataModel,
  ItemAttachmentDataModel,
  TalentDataModel,
  SpeciesDataModel,
  ForcePowerDataModel,
  SpecializationDataModel,
  CareerDataModel,
  SignatureAbilityDataModel,
  VehicleDataModel,
  HomesteadDataModel,
  MinionDataModel,
  RivalDataModel,
  NemesisDataModel,
  CharacterDataModel,
};

/**
 * Register the system's per-sub-type data models. Called once from the `init`
 * hook (swffg-main.js), before any document is prepared.
 */
export function registerSystemDataModels() {
  // Stage 1 (proof of concept): the two simplest Item types, no own fields.
  Object.assign(CONFIG.Item.dataModels, {
    homesteadupgrade: HomesteadUpgradeDataModel,
    ability: AbilityDataModel,
  });

  // Stage 2: small leaf Item types (real fields, no dynamic dictionaries).
  Object.assign(CONFIG.Item.dataModels, {
    criticalinjury: CriticalInjuryDataModel,
    criticaldamage: CriticalDamageDataModel,
    background: BackgroundDataModel,
    obligation: ObligationDataModel,
    motivation: MotivationDataModel,
    itemmodifier: ItemModifierDataModel,
  });

  // Stage 3: equipment Item types (heavier sheet coupling).
  Object.assign(CONFIG.Item.dataModels, {
    gear: GearDataModel,
    weapon: WeaponDataModel,
    armour: ArmourDataModel,
    shipweapon: ShipWeaponDataModel,
    shipattachment: ShipAttachmentDataModel,
    itemattachment: ItemAttachmentDataModel,
  });

  // Stage 4: talent + species (read by the tree UI / importer).
  Object.assign(CONFIG.Item.dataModels, {
    talent: TalentDataModel,
    species: SpeciesDataModel,
  });

  // Stage 5: tree types with dynamic numbered slots (freeform slot values).
  Object.assign(CONFIG.Item.dataModels, {
    forcepower: ForcePowerDataModel,
    specialization: SpecializationDataModel,
    career: CareerDataModel,
    signatureability: SignatureAbilityDataModel,
  });

  // Stage 6: simplest Actor types (no shared Stats/Characteristics/Skills).
  Object.assign(CONFIG.Actor.dataModels, {
    vehicle: VehicleDataModel,
    homestead: HomesteadDataModel,
  });

  // Stage 7: adversary Actor types sharing Stats/Characteristics/Skills.
  Object.assign(CONFIG.Actor.dataModels, {
    minion: MinionDataModel,
    rival: RivalDataModel,
    nemesis: NemesisDataModel,
  });

  // Stage 8: character — the full PC (largest surface). Completes all types.
  Object.assign(CONFIG.Actor.dataModels, {
    character: CharacterDataModel,
  });
}
