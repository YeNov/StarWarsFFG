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
 * @param {object} roll
 * @param {object} roll.data - what the dialog was opened with
 * @param {object} [roll.item] - the item rolled with, if any
 * @param {(id: string) => object|undefined} lookupWorldActor - e.g. `(id) => game.actors.get(id)`
 * @returns {object|null}
 */
export function rollActorFrom({ data, item }, lookupWorldActor) {
  const isActor = (candidate) => candidate?.documentName === "Actor";
  if (isActor(data?.document)) return data.document;
  if (isActor(item?.actor)) return item.actor;
  if (isActor(data?.token?.actor)) return data.token.actor;
  const id = data?.actor?._id;
  return (id && lookupWorldActor?.(id)) || null;
}
