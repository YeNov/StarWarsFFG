/**
 * Static sub-type → DataModel class maps.
 *
 * Deliberately dependency-free apart from the concrete model classes: both
 * ./index.js (which registers these into CONFIG) and ./conformance-report.js
 * (which constructs them directly) need this mapping, and index.js re-exports
 * the reporter. Importing the maps *from* index.js would therefore close an
 * import cycle and risk reading an uninitialized binding, so the maps live here
 * instead and both sides import this module.
 *
 * Plan: docs/superpowers/plans/2026-07-14-datamodel-undeclared-paths-fix.md
 */

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

import { VehicleDataModel } from "./models/actor/vehicle.js";
import { HomesteadDataModel } from "./models/actor/homestead.js";
import { MinionDataModel } from "./models/actor/minion.js";
import { RivalDataModel } from "./models/actor/rival.js";
import { NemesisDataModel } from "./models/actor/nemesis.js";
import { CharacterDataModel } from "./models/actor/character.js";

/** All 20 Item sub-types. */
export const ITEM_MODELS = {
  ability: AbilityDataModel,
  homesteadupgrade: HomesteadUpgradeDataModel,
  criticalinjury: CriticalInjuryDataModel,
  criticaldamage: CriticalDamageDataModel,
  background: BackgroundDataModel,
  obligation: ObligationDataModel,
  motivation: MotivationDataModel,
  itemmodifier: ItemModifierDataModel,
  gear: GearDataModel,
  weapon: WeaponDataModel,
  armour: ArmourDataModel,
  shipweapon: ShipWeaponDataModel,
  shipattachment: ShipAttachmentDataModel,
  itemattachment: ItemAttachmentDataModel,
  talent: TalentDataModel,
  species: SpeciesDataModel,
  forcepower: ForcePowerDataModel,
  specialization: SpecializationDataModel,
  career: CareerDataModel,
  signatureability: SignatureAbilityDataModel,
};

/** All 6 Actor sub-types. */
export const ACTOR_MODELS = {
  vehicle: VehicleDataModel,
  homestead: HomesteadDataModel,
  minion: MinionDataModel,
  rival: RivalDataModel,
  nemesis: NemesisDataModel,
  character: CharacterDataModel,
};

/**
 * Resolve the model class for a document, independent of whether the models are
 * registered in CONFIG (they are not, under a diagnostic boot).
 * @param {string} documentName "Actor" | "Item"
 * @param {string} type          the sub-type
 */
export function modelFor(documentName, type) {
  if (documentName === "Actor") return ACTOR_MODELS[type] ?? null;
  if (documentName === "Item") return ITEM_MODELS[type] ?? null;
  return null;
}
