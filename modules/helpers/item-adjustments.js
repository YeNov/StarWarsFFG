/**
 * The item's derived ("adjusted") numbers, as a pure function.
 *
 * Extracted from `ItemFFG#prepareData` so the arithmetic is synchronous and
 * Node-testable. It used to live inside an `async prepareData()`, which Foundry
 * does NOT await (`ClientDocument#prepareData` is
 * prepareBaseData → prepareEmbeddedDocuments → prepareDerivedData, all sync).
 * The owning actor therefore read `system.encumbrance.adjusted` — and every
 * other `.adjusted` field — while the item's promise was still suspended, so it
 * saw the previous pass's value. Everything here is sync; the document side is
 * a thin wrapper that calls it from `prepareDerivedData()`, which Foundry runs
 * for each embedded item during the actor's `prepareEmbeddedDocuments()` — i.e.
 * before the actor's own `prepareDerivedData()`.
 *
 * The function MUTATES the `system` object it is given (that is what data
 * preparation does) and returns it.
 */

import ModifierHelpers from "./modifiers.js";

/** Capitalize the first character; "" for anything that is not a string. */
export function capitalize(s) {
  if (typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Shift a range band by `steps` and return the resulting band's value, clamped
 * to the ends of the table.
 * @param {object} rangeSetting  CONFIG.FFG.ranges / CONFIG.FFG.vehicle_ranges
 * @param {string} currentValue  The band the item started from.
 * @param {number} steps
 * @returns {string}
 */
function shiftRange(rangeSetting, currentValue, steps) {
  const bands = Object.values(rangeSetting ?? {});
  if (!bands.length) return currentValue;
  const currentRangeIndex = bands.findIndex((r) => r.value === currentValue);
  let newRange = currentRangeIndex + steps;
  if (newRange < 0) newRange = 0;
  if (newRange >= bands.length) newRange = bands.length - 1;
  return bands[newRange].value;
}

/** The active, unbroken quality rows carried by an attachment. */
function activeAttachmentModifiers(attachment) {
  return attachment?.system?.itemmodifier?.filter((i) => i?.system?.active && !i?.system?.broken) || [];
}

/**
 * Fold an attachment's active qualities into the item's `adjusteditemmodifier`
 * display summary, stacking ranks when the same quality is already listed.
 */
function mergeAttachmentQualities(data, attachment) {
  if (!attachment?.system?.itemmodifier) return;
  for (const am of activeAttachmentModifiers(attachment)) {
    const foundItem = data.adjusteditemmodifier.find((i) => i.name === am.name);
    if (foundItem) {
      if (foundItem.system?.rank) {
        foundItem.system.rank_current = parseInt(foundItem.system.rank_current, 10) + 1;
      }
    } else {
      data.adjusteditemmodifier.push({
        ...am,
        system: { ...am.system, rank_current: am.system?.rank ? 1 : null },
        adjusted: true,
      });
    }
  }
}

/**
 * Compute every derived/adjusted field for an item.
 *
 * @param {object} data  The item's `system` object. Mutated in place.
 * @param {string} type  The item type ("weapon", "armour", …).
 * @param {object} [ctx]
 * @param {object} [ctx.ranges]         CONFIG.FFG.ranges — personal-scale range bands.
 * @param {object} [ctx.vehicleRanges]  CONFIG.FFG.vehicle_ranges — ship-scale range bands.
 * @param {function(string): boolean} [ctx.isEffectDisabled]  True when the Active Effect
 *   backing the named modifier row is switched off (the sheet's "enabled" checkbox).
 * @param {string} [ctx.actorType]      The owning actor's type, if any.
 * @param {boolean} [ctx.isEmbedded]    Whether the item is owned by an actor.
 * @param {object} [ctx.characteristics]  The owner's `system.characteristics`.
 * @returns {object} `data`
 */
export function applyItemAdjustments(data, type, ctx = {}) {
  const {
    ranges,
    vehicleRanges,
    isEffectDisabled = () => false,
    actorType,
    isEmbedded = false,
    characteristics,
  } = ctx;

  switch (type) {
    case "weapon":
    case "shipweapon": {
      // Apply item attachments / modifiers
      data.damage.value = parseInt(data.damage.value, 10);
      data.crit.value = parseInt(data.crit.value, 10);
      data.encumbrance.value = parseInt(data.encumbrance.value, 10);
      data.price.value = parseInt(data.price.value, 10);
      data.rarity.value = parseInt(data.rarity.value, 10);
      data.hardpoints.value = parseInt(data.hardpoints.value, 10);

      data.range.adjusted = data.range.value;
      data.damage.adjusted = parseInt(data.damage.value, 10);
      data.crit.adjusted = parseInt(data.crit.value, 10);
      data.encumbrance.adjusted = parseInt(data.encumbrance.value, 10);
      data.price.adjusted = parseInt(data.price.value, 10);
      data.rarity.adjusted = parseInt(data.rarity.value, 10);
      data.hardpoints.adjusted = parseInt(data.hardpoints.value, 10);

      data.adjusteditemmodifier = [];

      const rangeSetting = (type === "shipweapon") ? vehicleRanges : ranges;

      if (data?.itemmodifier) {
        data.itemmodifier.forEach((modifier) => {
          // adjusteditemmodifier is a derived summary for display. Keep its nested system
          // independent so aggregating attachment ranks cannot mutate the source modifier
          // that Active Effect reconciliation reads.
          data.adjusteditemmodifier.push({
            ...modifier,
            system: { ...modifier.system, rank_current: modifier.system?.rank },
          });
          data.damage.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "damage", "Weapon Stat");
          data.crit.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "critical", "Weapon Stat");
          data.encumbrance.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "encumbrance", "Weapon Stat");
          data.price.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "price", "Weapon Stat");
          data.rarity.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "rarity", "Weapon Stat");
          data.hardpoints.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "hardpoints", "Weapon Stat");
          const range = ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "range", "Weapon Stat");
          data.range.adjusted = shiftRange(rangeSetting, data.range.value, range);
        });
      }

      if (data?.itemattachment) {
        data.itemattachment.forEach((attachment) => {
          const activeModifiers = activeAttachmentModifiers(attachment);
          data.damage.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "damage", "Weapon Stat");
          data.crit.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "critical", "Weapon Stat");
          if (data.crit.adjusted < 1) data.crit.adjusted = 1;
          data.encumbrance.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "encumbrance", "Weapon Stat");
          data.price.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "price", "Weapon Stat");
          data.rarity.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "rarity", "Weapon Stat");
          data.hardpoints.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "hardpoints", "Weapon Stat");
          const range = ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "range", "Weapon Stat");
          data.range.adjusted = shiftRange(rangeSetting, data.range.value, range);

          mergeAttachmentQualities(data, attachment);
        });
      }

      // Weapon Stat / damage modifiers listed on the weapon itself. Each modifier row is
      // backed by an Active Effect whose disabled state is driven by the sheet's "enabled"
      // checkbox, so skip any whose backing effect is disabled -- otherwise an unchecked
      // modifier keeps adding its damage. This runs for standalone items too (not only when
      // embedded) so the adjusted damage is shown before the weapon is owned by an actor.
      if (actorType !== "vehicle") {
        let damageAdd = 0;
        for (const attr of Object.keys(data.attributes ?? {})) {
          if (data.attributes[attr].mod === "damage" && data.attributes[attr].modtype === "Weapon Stat") {
            if (isEffectDisabled(attr)) continue;
            damageAdd += parseInt(data.attributes[attr].value, 10);
          }
        }
        data.damage.adjusted += damageAdd;
        // Adding the wielder's characteristic to damage (e.g. Brawn for melee) needs an actor.
        if (isEmbedded && characteristics && ModifierHelpers.shouldApplyCharacteristicToDamage(data)) {
          data.damage.adjusted += parseInt(characteristics[data.characteristic.value].value, 10);
        }
      }

      const rangeLabel = (type === "weapon" ? `SWFFG.WeaponRange` : `SWFFG.VehicleRange`) + capitalize(data.range.adjusted);
      data.range.label = rangeLabel;

      break;
    }
    case "armour": {
      data.soak.value = parseInt(data.soak.value, 10);
      data.defence.value = parseInt(data.defence.value, 10);
      data.encumbrance.value = parseInt(data.encumbrance.value, 10);
      data.price.value = parseInt(data.price.value, 10);
      data.rarity.value = parseInt(data.rarity.value, 10);
      data.hardpoints.value = parseInt(data.hardpoints.value, 10);

      data.soak.adjusted = parseInt(data.soak.value, 10);
      data.defence.adjusted = parseInt(data.defence.value, 10);
      data.encumbrance.adjusted = parseInt(data.encumbrance.value, 10);
      data.price.adjusted = parseInt(data.price.value, 10);
      data.rarity.adjusted = parseInt(data.rarity.value, 10);
      data.hardpoints.adjusted = parseInt(data.hardpoints.value, 10);

      data.adjusteditemmodifier = [];

      if (data?.itemmodifier) {
        data.itemmodifier.forEach((modifier) => {
          // See the weapon branch above: the summarized copy must not share its system
          // object with the source quality.
          data.adjusteditemmodifier.push({
            ...modifier,
            system: { ...modifier.system, rank_current: modifier.system?.rank },
          });
          data.soak.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "soak", "Armor Stat");
          data.defence.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "defence", "Armor Stat");
          data.encumbrance.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "encumbrance", "Armor Stat");
          data.price.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "price", "Armor Stat");
          data.rarity.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "rarity", "Armor Stat");
          data.hardpoints.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(modifier, [], "hardpoints", "Armor Stat");
        });
      }

      if (data?.itemattachment) {
        data.itemattachment.forEach((attachment) => {
          const activeModifiers = activeAttachmentModifiers(attachment);
          data.soak.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "soak", "Armor Stat");
          data.soak.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "Soak", "Stat");
          data.defence.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "defence", "Armor Stat");
          data.encumbrance.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "encumbrance", "Armor Stat");
          data.price.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "price", "Armor Stat");
          data.rarity.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "rarity", "Armor Stat");
          data.hardpoints.adjusted += ModifierHelpers.getCalculatedValueFromCurrentAndArray(attachment, activeModifiers, "hardpoints", "Armor Stat");

          mergeAttachmentQualities(data, attachment);
        });
      }

      // Armor Stat / Stat modifiers listed on the armour itself. Each modifier row is backed
      // by an Active Effect whose disabled state is driven by the sheet's "enabled" checkbox,
      // so skip any whose backing effect is disabled -- otherwise an unchecked modifier keeps
      // applying. Runs for standalone items too (not only when embedded) so the adjusted
      // values are shown before the armour is owned by an actor.
      if (actorType !== "vehicle") {
        let soakAdd = 0, defenceAdd = 0, encumbranceAdd = 0;
        for (const attr of Object.keys(data.attributes ?? {})) {
          const modtype = data.attributes[attr].modtype;
          if (modtype === "Armor Stat" || modtype === "Stat" || modtype === "Stat All") {
            if (isEffectDisabled(attr)) continue;
            switch (data.attributes[attr].mod.toLocaleLowerCase()) {
              case "soak":
                soakAdd += parseInt(data.attributes[attr].value, 10);
                break;
              case "defence":
                defenceAdd += parseInt(data.attributes[attr].value, 10);
                break;
              case "encumbrance":
                encumbranceAdd += parseInt(data.attributes[attr].value, 10);
                break;
              default:
                break;
            }
          }
        }
        data.soak.adjusted += soakAdd;
        data.defence.adjusted += defenceAdd;
        data.encumbrance.adjusted += encumbranceAdd;
      }
      break;
    }
    case "talent": {
      const cleanedActivationName = data.activation.value.replace(/[\W_]+/g, "");
      const activationId = `SWFFG.TalentActivations${capitalize(cleanedActivationName)}`;
      data.activation.label = activationId;
      break;
    }
    case "gear": {
      data.encumbrance.value = parseInt(data.encumbrance.value, 10);
      break;
    }
    default:
      break;
  }

  if (["weapon", "armour", "shipweapon"].includes(type)) {
    // get all item attachments
    let totalHPUsed = 0;

    if (data?.itemattachment?.length) {
      data.itemattachment.forEach((attachment) => {
        totalHPUsed += attachment.system?.hardpoints?.value || 0;
      });
    }

    data.hardpoints.current = data.hardpoints.value - totalHPUsed;
  }

  return data;
}
