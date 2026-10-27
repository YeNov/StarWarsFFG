/**
 * Which roll options a roll offers (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "Which items offer their options" and "What the words mean").
 *
 * Items link option macros by uuid (`system.rollOptions`, and the same field on the copies an item
 * holds: its qualities, its attachments and their qualities, specialization tree nodes). The dialog
 * loads and parses those macros first (linkedMacroUuids lists them), then asks collectOfferedOptions
 * which options fit this roll:
 *
 * - talents (items and learned tree nodes) whenever their `offer` matches; one row per talent name,
 *   with its ranks combined across sources;
 * - a weapon, its qualities, its attachments and their qualities only on attacks with that weapon,
 *   and only while it is carried;
 * - armour (while equipped) and gear (while carried), with their qualities and attachments;
 * - a quality or modification that is switched off or broken offers nothing;
 * - a Force power roll offers nothing;
 * - `offer.initiative` true keeps a row to initiative rolls, false keeps it off them, and
 *   hasInitiativeOption says whether a roller has such a row at all (a "talented" combatant in a
 *   group initiative roll; docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md).
 *
 * An option that changes the weapon (`weapon`) is offered on attacks only.
 *
 * "ranks", "forceRating" and "skillRank" (with their sign: "-ranks") are resolved here. "amount" waits until the
 * player picks an amount, and the live words (forceAvailable, destinyLight, destinyDark) until the
 * planner reads them, so a roll uses the values of the moment it is made. An amount with no max
 * is offered with `max: null`: no cap beyond the payer's strain.
 *
 * Free of Foundry globals, so Node covers it (tests/node/roll-options-offer.test.mjs).
 */
import { diceWord, normalizeName } from "./roll-options.js";
import { isCarried } from "./optional-buffs-offer.js";
import { isModifierSuspended } from "./modifier-switch.js";

const idOf = (doc) => doc?.id ?? doc?._id;
const linksOf = (holder) => (Array.isArray(holder?.rollOptions) ? holder.rollOptions : []);
const listOf = (value) => (Array.isArray(value) ? value : []);
const isOff = (modifier) => isModifierSuspended(modifier) || modifier?.system?.broken === true;

/** A rank of 1 or more, read from a number or a numeric string; anything else counts 1. */
function rankOf(value) {
  const rank = Number(value);
  return Number.isFinite(rank) && rank >= 1 ? Math.trunc(rank) : 1;
}

/**
 * Every option macro uuid linked on these items or on any copy they hold, once each, in the order
 * first met. The dialog loads these before it renders.
 * @param {Iterable<object>} items
 * @returns {string[]}
 */
export function linkedMacroUuids(items) {
  const seen = new Set();
  const add = (holder) => {
    for (const uuid of linksOf(holder)) if (typeof uuid === "string" && uuid) seen.add(uuid);
  };
  for (const item of items ?? []) {
    const system = item?.system ?? {};
    add(system);
    for (const q of listOf(system.itemmodifier)) add(q?.system);
    for (const a of listOf(system.itemattachment)) {
      add(a?.system);
      for (const q of listOf(a?.system?.itemmodifier)) add(q?.system);
    }
    if (item?.type === "specialization") {
      for (const node of Object.values(system.talents ?? {})) add(node);
    }
  }
  return [...seen];
}

/**
 * The type of the rolled skill (Combat, General, Knowledge, Social, Magic): the actor's own skill
 * first, then the configured skill list.
 * @param {object|null} actor
 * @param {string|null} skillKey
 * @param {object|null} configuredSkills - e.g. CONFIG.FFG.skills
 * @returns {string|null}
 */
export function skillTypeOf(actor, skillKey, configuredSkills) {
  if (!skillKey) return null;
  const type = actor?.system?.skills?.[skillKey]?.type ?? configuredSkills?.[skillKey]?.type ?? null;
  return typeof type === "string" && type ? type : null;
}

function offerMatches(offer, context) {
  if (!offer) return true;
  if (Array.isArray(offer.skills) && !(context.skillKey && offer.skills.includes(context.skillKey))) return false;
  if (Array.isArray(offer.skillTypes) && !(context.skillType && offer.skillTypes.includes(context.skillType))) return false;
  if (offer.attack === true && !context.isAttack) return false;
  if (offer.initiative === true && !context.isInitiative) return false;
  if (offer.initiative === false && context.isInitiative) return false;
  return true;
}

/**
 * The options this roll offers.
 * @param {object} params
 * @param {Iterable<object>} params.items - the rolling actor's items
 * @param {Map<string, {ok: boolean, options?: object[]}>} params.macros - parsed macro text by uuid
 * @param {{skillKey: string|null, skillType: string|null, weaponId: string|null, isAttack: boolean,
 *   isForcePower: boolean, isInitiative?: boolean, forceRating: number, skillRank?: number}} params.context
 * @returns {object[]} OfferedOption rows
 */
export function collectOfferedOptions({ items, macros, context }) {
  if (context?.isForcePower) return [];
  const groups = gatherOptionGroups(items, macros, context?.weaponId ?? null);

  const forceRating = Number(context?.forceRating) || 0;
  const skillRank = Number(context?.skillRank) || 0;
  const offered = [];
  for (const [key, group] of groups) {
    const { option, source, description } = group;
    if (!offerMatches(option.offer, context ?? {})) continue;
    // A row that changes the weapon needs a weapon to change.
    if (option.weapon && !context?.isAttack) continue;
    const ranked = group.talent && group.ranked;
    const rank = ranked ? group.rank : (group.talent ? 1 : group.rank);
    // "ranks", "forceRating" and "skillRank" are known now; live words and "amount" are left for
    // the planner.
    const resolve = (value) => {
      const word = diceWord(value);
      if (word?.word === "ranks") return word.sign * rank;
      if (word?.word === "forceRating") return word.sign * forceRating;
      if (word?.word === "skillRank") return word.sign * skillRank;
      return value;
    };
    const resolveDice = (dice) => Object.fromEntries(Object.entries(dice ?? {}).map(([diceKey, value]) => [diceKey, resolve(value)]));
    offered.push({
      key,
      label: option.label ?? source,
      source,
      ranked,
      rank,
      hint: option.hint ?? null,
      description: description ?? null,
      twoWeapons: option.offer?.twoWeapons ?? null,
      minDifficulty: option.offer?.minDifficulty ?? null,
      amount: option.amount
        ? { max: option.amount.max === undefined ? null : resolve(option.amount.max), label: option.amount.label ?? null }
        : null,
      cost: { strain: option.cost?.strain ?? 0, maneuvers: option.cost?.maneuvers ?? 0 },
      dice: resolveDice(option.dice),
      weapon: option.weapon ? resolveDice(option.weapon) : null,
      difficultyFloor: option.difficultyFloor ?? null,
      characteristic: option.characteristic ?? null,
      skill: option.skill ?? null,
      choices: Array.isArray(option.choices)
        ? option.choices.map((choice) => ({ id: choice.id, label: choice.label, dice: resolveDice(choice.dice) }))
        : null,
    });
  }
  return offered;
}

/**
 * Whether these items link an option kept to initiative rolls (`offer.initiative: true`), whatever
 * its other keys say: what makes a combatant "talented" for a group initiative roll. The items
 * count as for any roll without a weapon (talents; equipped armour and carried gear, with their
 * qualities and attachments; nothing switched off or broken).
 * @param {object} params
 * @param {Iterable<object>} params.items - the roller's items
 * @param {Map<string, {ok: boolean, options?: object[]}>} params.macros - parsed macro text by uuid
 * @returns {boolean}
 */
export function hasInitiativeOption({ items, macros }) {
  for (const group of gatherOptionGroups(items, macros, null).values()) {
    if (group.option?.offer?.initiative === true) return true;
  }
  return false;
}

/**
 * Every option the items link, as one group per row key in the order first met, before any offer
 * is checked: {option, source, ranked, rank, talent, description}. A weapon counts only when it is
 * the one rolled with.
 */
function gatherOptionGroups(items, macros, weaponId) {
  const groups = new Map();
  const textOf = (value) => (typeof value === "string" && value.trim() !== "" ? value : null);

  const addLinks = (links, { source, ranked = false, rank = 1, talentName = null, description = null }) => {
    for (const uuid of links) {
      const parsed = macros?.get(uuid);
      if (!parsed?.ok) continue;
      parsed.options.forEach((option, index) => {
        const optionKey = typeof option?.id === "string" ? `id:${option.id}` : `#${index}`;
        const key = talentName === null
          ? `${uuid}:${optionKey}`
          : `${uuid}:${optionKey}:${normalizeName(talentName)}`;
        const group = groups.get(key);
        if (!group) {
          groups.set(key, { option, source, ranked, rank, talent: talentName !== null, description: textOf(description) });
        } else {
          group.description ??= textOf(description);
          if (group.talent) {
            group.ranked = group.ranked && ranked;
            group.rank += rank;
          }
        }
      });
    }
  };

  const addQualities = (qualities) => {
    for (const q of listOf(qualities)) {
      if (isOff(q)) continue;
      addLinks(linksOf(q?.system), { source: q?.name ?? "", rank: rankOf(q?.system?.rank), description: q?.system?.description });
    }
  };

  const addHolder = (item) => {
    const system = item.system ?? {};
    addLinks(linksOf(system), { source: item.name ?? "", description: system.description });
    addQualities(system.itemmodifier);
    for (const a of listOf(system.itemattachment)) {
      addLinks(linksOf(a?.system), { source: a?.name ?? "", description: a?.system?.description });
      addQualities(a?.system?.itemmodifier);
    }
  };

  for (const item of items ?? []) {
    const system = item?.system ?? {};
    switch (item?.type) {
      case "talent": {
        const ranked = system.ranks?.ranked === true;
        addLinks(linksOf(system), {
          source: item.name ?? "", talentName: item.name ?? "", ranked, rank: ranked ? rankOf(system.ranks?.current) : 1,
          description: system.description,
        });
        break;
      }
      case "specialization": {
        for (const node of Object.values(system.talents ?? {})) {
          if (node?.islearned !== true) continue;
          addLinks(linksOf(node), { source: node.name ?? "", talentName: node.name ?? "", ranked: node.isRanked === true, rank: 1, description: node.description });
        }
        break;
      }
      case "weapon":
        if (isCarried(item) && idOf(item) === weaponId) addHolder(item);
        break;
      case "armour":
        if (system.equippable?.equipped) addHolder(item);
        break;
      case "gear":
        if (isCarried(item)) addHolder(item);
        break;
      default:
        break;
    }
  }

  return groups;
}
