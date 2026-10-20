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
