/**
 * The actor a roll dialog belongs to, for reading its optional buffs.
 *
 * A sheet passes its `getData()` result, whose `document` is the live actor: for an unlinked token
 * that is the token's own copy, which may carry different items from the world actor it was made
 * from. `data.actor` is only a plain copy whose `_id` names the world actor, so it comes last. A
 * pool sent to a player arrives as plain data and can only name the world actor.
 *
 * Free of Foundry globals (the world lookup is passed in), so Node covers it
 * (tests/node/roll-actor.test.mjs).
 *
 * An actor named by uuid comes first: a crew roll opens on the vehicle's sheet but rolls for a
 * crew member, and a pool sent to a player names the actor it was built for, token or not.
 *
 * @param {object} roll
 * @param {object} roll.data - what the dialog was opened with
 * @param {object} [roll.item] - the item rolled with, if any
 * @param {string|null} [roll.actorUuid] - the actor the roll is for, when the caller knows it
 * @param {(id: string) => object|undefined} lookupWorldActor - e.g. `(id) => game.actors.get(id)`
 * @param {(uuid: string) => object|undefined} [lookupByUuid] - e.g. `fromUuidSync`
 * @returns {object|null}
 */
export function rollActorFrom({ data, item, actorUuid }, lookupWorldActor, lookupByUuid) {
  const isActor = (candidate) => candidate?.documentName === "Actor";
  if (actorUuid && lookupByUuid) {
    const named = lookupByUuid(actorUuid);
    if (isActor(named)) return named;
  }
  if (isActor(data?.document)) return data.document;
  if (isActor(item?.actor)) return item.actor;
  if (isActor(data?.token?.actor)) return data.token.actor;
  const id = data?.actor?._id;
  return (id && lookupWorldActor?.(id)) || null;
}

/**
 * The rolled skill's key, characteristic value and rank, for a roll opened without them.
 *
 * The system's own rolls pass these (DiceHelpers.rollSkill, rollItem); a module that opens the
 * dialog through DiceHelpers.displayRollDialog may not (Token Action HUD passes the sheet data, the
 * pool, the translated skill name and the weapon). Without the key, roll options and optional buffs
 * tied to a skill stay hidden, and a swap or a Skill Rank buff cannot rebuild the dice, so the
 * dialog works them out: the weapon's skill, else the skill whose key or translated label is the
 * name given; then its rank and its characteristic's value from the actor. Whatever the caller
 * passed is kept.
 *
 * @param {object} roll
 * @param {object|null} roll.actor - from rollActorFrom
 * @param {object} [roll.item] - the item rolled with
 * @param {string} [roll.skillName] - the name the dialog was opened with
 * @param {string|null} [roll.skillKey]
 * @param {number|null} [roll.characteristic]
 * @param {number|null} [roll.rank]
 * @param {object} [helpers]
 * @param {object|null} [helpers.configuredSkills] - e.g. CONFIG.FFG.skills, for labels the actor lacks
 * @param {(key: string) => string} [helpers.localize] - e.g. game.i18n.localize
 * @returns {{skillKey: string|null, characteristic: number|null, rank: number|null}}
 */
export function rollSkillContext({ actor, item, skillName, skillKey = null, characteristic = null, rank = null }, { configuredSkills = null, localize = (key) => key } = {}) {
  const skills = actor?.system?.skills ?? {};
  let key = skillKey ?? null;
  const fromItem = item?.system?.skill?.value;
  if (!key && typeof fromItem === "string" && fromItem in skills) key = fromItem;
  const name = typeof skillName === "string" ? skillName.trim() : "";
  if (!key && name) {
    const labelOf = (skillKeyCandidate, skill) => skill?.label ?? configuredSkills?.[skillKeyCandidate]?.label ?? null;
    key = Object.keys(skills).find((candidate) => {
      const label = labelOf(candidate, skills[candidate]);
      return candidate === name || (label && (label === name || localize(label) === name));
    }) ?? null;
  }
  const skill = key ? skills[key] : null;
  const characteristicKey = skill?.characteristic;
  return {
    skillKey: key,
    characteristic: characteristic ?? (characteristicKey ? Number(actor?.system?.characteristics?.[characteristicKey]?.value) || 0 : null),
    rank: rank ?? (skill ? Number(skill.rank) || 0 : null),
  };
}
