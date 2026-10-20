/**
 * Which optional buffs a roll offers (docs/superpowers/specs/2026-10-20-optional-buffs-design.md).
 *
 * Reads the rolling actor's items and returns each buff that can change this roll, with only the
 * rows that apply and each row's value already multiplied by how many times it counts:
 *   { key, name, source, rows: [{ modtype, mod, value }], applied? }
 *
 * - Armour counts while equipped; weapons and gear while not marked "not carried"; talents (items
 *   and learned specialization tree nodes) always; attachments when the item they sit on counts.
 * - Skill rows apply to rolls of their skill. Roll / Dice / Result rows on a weapon (or one of its
 *   attachments) apply to that weapon's attacks, once; on anything else they apply to every roll.
 * - Weapon, armour and gear rows count by quantity; talent rows by ranks (an unranked talent once).
 * - A Force power roll offers nothing.
 *
 * Free of Foundry globals beyond the Node stub's, so Node covers it
 * (tests/node/optional-buffs-offer.test.mjs).
 */
import { cleanBuffs, isSkillModtype } from "./optional-buffs.js";

/**
 * Whether an item is carried. Only an explicit "not carried" counts against it.
 * @param {object} item
 * @returns {boolean}
 */
export function isCarried(item) {
  return item?.flags?.starwarsffg?.carried !== false;
}

const idOf = (doc) => doc?.id ?? doc?._id;

const quantityOf = (item) => {
  const quantity = Number(item?.system?.quantity?.value);
  return Number.isFinite(quantity) && quantity >= 1 ? quantity : 1;
};

/**
 * The rows of a buff that apply to this roll, multiplied.
 * @param {object} buff - a cleaned buff
 * @param {object} rules
 * @param {string|null} rules.skillKey - the skill being rolled
 * @param {number} rules.skillTimes - how many times a skill row counts
 * @param {boolean} rules.rollRows - whether Roll / Dice / Result rows apply at all
 * @param {number} rules.rollTimes - how many times they count
 */
function applicableRows(buff, { skillKey, skillTimes, rollRows, rollTimes }) {
  const rows = [];
  for (const row of buff.rows) {
    if (isSkillModtype(row.modtype)) {
      if (skillKey && row.mod === skillKey) rows.push({ ...row, value: row.value * skillTimes });
    } else if (rollRows) {
      rows.push({ ...row, value: row.value * rollTimes });
    }
  }
  return rows;
}

/**
 * The optional buffs this roll offers.
 * @param {object} params
 * @param {Iterable<object>} params.items - the rolling actor's items
 * @param {string|null} params.skillKey - the key of the skill being rolled, e.g. "Charm"
 * @param {string|null} params.weaponId - the id of the weapon making the attack
 * @param {boolean} params.isForcePower - whether this is a Force power roll
 * @returns {Array<{key: string, name: string, source: string, rows: Array}>}
 */
export function collectOfferedBuffs({ items, skillKey = null, weaponId = null, isForcePower = false }) {
  if (isForcePower) return [];

  const offered = [];
  const offer = (key, buff, source, rules) => {
    const rows = applicableRows(buff, { skillKey, ...rules });
    if (rows.length > 0) offered.push({ key, name: buff.name, source, rows });
  };

  // Talents from items and from specialization trees, grouped by talent name and buff id.
  const talents = new Map();
  const addTalentBuffs = (talentName, buffs, ranked, contribution) => {
    for (const buff of cleanBuffs(buffs)) {
      const groupKey = `talent:${String(talentName ?? "").toLowerCase()}:${buff.id}`;
      const group = talents.get(groupKey) ?? { talentName, buff, ranked: true, times: 0 };
      group.ranked = group.ranked && ranked;
      group.times += contribution;
      talents.set(groupKey, group);
    }
  };

  for (const item of items ?? []) {
    const id = idOf(item);
    const system = item?.system ?? {};
    const attachments = Array.isArray(system.itemattachment) ? system.itemattachment : [];

    switch (item?.type) {
      case "weapon": {
        if (!isCarried(item)) break;
        const rules = { skillTimes: quantityOf(item), rollRows: id === weaponId, rollTimes: 1 };
        for (const buff of cleanBuffs(system.optionalBuffs)) offer(`${id}:${buff.id}`, buff, item.name, rules);
        for (const attachment of attachments) {
          for (const buff of cleanBuffs(attachment?.system?.optionalBuffs)) {
            offer(`${id}:${idOf(attachment)}:${buff.id}`, buff, attachment.name, rules);
          }
        }
        break;
      }
      case "armour": {
        if (!system.equippable?.equipped) break;
        const times = quantityOf(item);
        const rules = { skillTimes: times, rollRows: true, rollTimes: times };
        for (const buff of cleanBuffs(system.optionalBuffs)) offer(`${id}:${buff.id}`, buff, item.name, rules);
        for (const attachment of attachments) {
          for (const buff of cleanBuffs(attachment?.system?.optionalBuffs)) {
            offer(`${id}:${idOf(attachment)}:${buff.id}`, buff, attachment.name, rules);
          }
        }
        break;
      }
      case "gear": {
        if (!isCarried(item)) break;
        const times = quantityOf(item);
        for (const buff of cleanBuffs(system.optionalBuffs)) {
          offer(`${id}:${buff.id}`, buff, item.name, { skillTimes: times, rollRows: true, rollTimes: times });
        }
        break;
      }
      case "talent": {
        const ranked = system.ranks?.ranked === true;
        // A cleared rank persists as null; like ModifierHelpers.rankMultiplier, count it as 1.
        const rank = Number(system.ranks?.current);
        addTalentBuffs(item.name, system.optionalBuffs, ranked, ranked && Number.isFinite(rank) && rank >= 1 ? rank : 1);
        break;
      }
      case "specialization": {
        for (const node of Object.values(system.talents ?? {})) {
          if (node?.islearned !== true) continue;
          addTalentBuffs(node.name, node.optionalBuffs, node.isRanked === true, 1);
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [key, { talentName, buff, ranked, times }] of talents) {
    const count = ranked ? times : 1;
    offer(key, buff, talentName ?? "", { skillTimes: count, rollRows: true, rollTimes: count });
  }

  return offered;
}

/**
 * Mark the buffs already in the pool, as when the GM ticked them before sending the pool to a
 * player. Applied buffs the dialog can't match to an item are still listed, so the card can name
 * them; they carry no rows, since their dice are already in the pool.
 * @param {Array<object>} offered - from collectOfferedBuffs
 * @param {Array<{key: string, name: string}>} applied
 * @returns {Array<object>}
 */
export function withAppliedBuffs(offered, applied) {
  const appliedKeys = new Set((applied ?? []).map((entry) => entry?.key));
  const result = offered.map((buff) => (appliedKeys.has(buff.key) ? { ...buff, applied: true } : buff));
  const known = new Set(offered.map((buff) => buff.key));
  for (const entry of applied ?? []) {
    if (!entry?.key || known.has(entry.key)) continue;
    result.push({ key: entry.key, name: entry.name ?? "", source: "", rows: [], applied: true });
  }
  return result;
}
