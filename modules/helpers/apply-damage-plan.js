/**
 * The Apply Damage decision, separated from the dialog that presents it.
 *
 * `apply-damage.js` destructures `foundry.applications.api` at module scope and reaches for
 * `fromUuid`, `ChatMessage` and `ui` — the integration surface the Node test tier is fenced off
 * from (tests/node/stub-boundary.test.mjs). Everything that is actually a DECISION lives here
 * instead: which pool a hit is written to, how much of the target's soak Pierce and Breach get
 * through, and whether worn Beskar or Cortosis stops them outright.
 *
 * Pure of Foundry globals. Labels come back as i18n KEYS rather than localized strings, so this
 * module never touches `game.i18n`; `show()` localizes them for the dialog and the chat cards.
 */

/**
 * The protective qualities worn on the target, deduplicated and sorted.
 *
 * Worn Beskar or Cortosis protects the wearer's full soak from Pierce and Breach.
 *
 * @param {object} actor
 * @returns {string[]} "Beskar" and/or "Cortosis", or empty
 */
export function getSoakProtectionQualities(actor) {
  if (actor?.type === "vehicle") return [];
  const protection = new Set();
  const collectQuality = (quality) => {
    const importId = quality?.flags?.starwarsffg?.ffgimportid;
    const match = /^(BESKAR|CORTOSIS)$/i.exec(importId ?? "")
      ?? /^(beskar|cortosis)\b/i.exec(String(quality?.name ?? "").trim());
    if (match) protection.add(match[1].toLowerCase() === "beskar" ? "Beskar" : "Cortosis");
  };
  for (const item of actor?.items ?? []) {
    if (item.type !== "armour" || !item.system?.equippable?.equipped) continue;
    // Read source qualities, not sheet-only summaries. Attachment mods follow
    // the same active/unbroken gate as the item's adjusted stats.
    for (const quality of item.system.itemmodifier ?? []) collectQuality(quality);
    for (const attachment of item.system.itemattachment ?? []) {
      for (const quality of attachment.system?.itemmodifier ?? []) {
        if (quality.system?.active && !quality.system?.broken) collectQuality(quality);
      }
    }
  }
  return [...protection].sort();
}

/**
 * What the target offers to be damaged: its pools, its soak, and how the dialog should present
 * the choice between them.
 *
 * @param {object} actor
 * @returns {object|null} null for an actor type this cannot damage
 */
export function planDamageTarget(actor) {
  const stats = actor?.system?.stats;
  switch (actor?.type) {
    case "vehicle":
      return {
        showRadio: true,
        soakWord: "armour",
        soakValue: Number(stats?.armour?.value) || 0,
        woundLabelKey: "SWFFG.VehicleHullTrauma",
        strainLabelKey: "SWFFG.VehicleHullStrain",
        woundPath: "system.stats.hullTrauma.value",
        strainPath: "system.stats.systemStrain.value",
      };
    // A minion or rival sheet has no strain box, so it is offered no choice of pool.
    case "minion":
    case "rival":
      return {
        showRadio: false,
        soakWord: "soak",
        soakValue: Number(stats?.soak?.value) || 0,
        woundLabelKey: "SWFFG.Wounds",
        strainLabelKey: null,
        woundPath: "system.stats.wounds.value",
        strainPath: null,
      };
    case "character":
    case "nemesis":
      return {
        showRadio: true,
        soakWord: "soak",
        soakValue: Number(stats?.soak?.value) || 0,
        woundLabelKey: "SWFFG.Wounds",
        strainLabelKey: "SWFFG.Strain",
        woundPath: "system.stats.wounds.value",
        strainPath: "system.stats.strain.value",
      };
    default:
      return null;
  }
}

/**
 * The numbers the dialog opens with, read off the weapon data embedded in the attack's chat
 * message. The user is free to overwrite both before applying.
 *
 * @param {object} itemData - the rendered weapon copy carried on the roll
 * @param {number} successes - the attack's net successes
 * @returns {{autoDamage: number, autoPierce: number, weaponName: string}}
 */
export function planDamageSeed(itemData, successes) {
  const itemSystem = itemData?.system || {};
  // `adjusted` folds in modifiers and attachments; it is 0 on a weapon that has never been
  // through the item sheet, in which case the raw value is the honest number.
  const adjusted = Number(itemSystem.damage?.adjusted) || 0;
  const baseValue = Number(itemSystem.damage?.value) || 0;
  const baseDamage = adjusted !== 0 ? adjusted : baseValue;

  // The rendered qualities live at system.doNotSubmit.qualities with computed totalRanks
  // (including attachment stacking). Names may carry a suffix like " Quality"
  // (e.g. "Pierce Quality"); substring match handles both forms.
  let pierceRanks = 0;
  let breachRanks = 0;
  for (const q of itemSystem.doNotSubmit?.qualities || []) {
    const name = (q?.name || "").toLowerCase();
    const ranks = Number(q?.totalRanks ?? 0) || 0;
    if (name.includes("pierce")) pierceRanks += ranks;
    else if (name.includes("breach")) breachRanks += ranks;
  }

  return {
    autoDamage: baseDamage + (Number(successes) || 0),
    autoPierce: pierceRanks + 10 * breachRanks,
    weaponName: itemData?.name || itemSystem.name || "weapon",
  };
}

/**
 * Resolve one hit: where it is written and how much of it lands.
 *
 * @param {object} actor - the target, for its worn protective qualities
 * @param {object} target - the result of planDamageTarget for that actor
 * @param {{damage: number, pierce: number, pool: string}} input - what the dialog came back with
 * @returns {object|null} null when there is nothing to write to
 */
export function planDamageApplication(actor, target, { damage, pierce, pool } = {}) {
  if (!target) return null;

  const soakProtection = getSoakProtectionQualities(actor);
  // Beskar and Cortosis do not reduce Pierce and Breach, they defeat them: the wearer keeps
  // their whole soak however many ranks the attack brought.
  const appliedPierce = soakProtection.length ? 0 : Math.max(0, parseInt(pierce, 10) || 0);
  const appliedDamage = Math.max(0, parseInt(damage, 10) || 0);

  // Without the radio there is only one pool on offer, whatever was asked for.
  const chosen = target.showRadio ? pool : "wounds";
  const wantsStrain = chosen === "strain" && target.strainPath;
  const path = wantsStrain ? target.strainPath : target.woundPath;
  if (!path) return null;

  const effectiveSoak = Math.max(0, target.soakValue - appliedPierce);

  return {
    path,
    poolLabelKey: wantsStrain ? target.strainLabelKey : target.woundLabelKey,
    damage: appliedDamage,
    pierce: appliedPierce,
    soak: target.soakValue,
    soakWord: target.soakWord,
    effectiveSoak,
    applied: Math.max(0, appliedDamage - effectiveSoak),
    soakProtection,
  };
}
