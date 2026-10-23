/**
 * What a roll costs, and when it is paid.
 *
 * Rolling can use up the actor's once-only effects (a Boost for the next check, say) and a round
 * of the weapon's ammo. Both are paid only after the roll has reached chat: a roll that fails to
 * post leaves the actor and the weapon untouched, so the player can roll again without losing
 * the effect or the round.
 *
 * Free of Foundry globals, so the order is covered in Node (tests/node/roll-costs.test.mjs).
 */

/**
 * The ids of the effects a roll uses up: those marked to last for one check. The marker lives in
 * `flags.starwarsffg.duration`; older effects still carry it in `system.duration`.
 * @param {Iterable<object>} effects - the actor's ActiveEffects
 * @returns {string[]}
 */
export function onceEffectIds(effects) {
  const ids = [];
  for (const effect of effects ?? []) {
    const duration = effect?.flags?.starwarsffg?.duration ?? effect?.system?.duration;
    if (duration === "once") ids.push(effect.id ?? effect._id);
  }
  return ids;
}

/**
 * Post the roll, then pay its costs. When the post fails, nothing is paid and the error is
 * passed on; when a hook cancels it (no message comes back), nothing is paid either. A cost
 * that fails is reported and does not stop the others: the roll is already in
 * chat by then.
 * @param {() => Promise<*>} post - creates the chat message
 * @param {Array<() => Promise<*>>} costs - each pays one cost
 * @param {object} [options]
 * @param {(error: Error) => void} [options.onCostError] - told about each cost that failed
 * @returns {Promise<*>} what `post` returned
 */
export async function postThenPay(post, costs, { onCostError = reportCostError } = {}) {
  const result = await post();
  // A preCreateChatMessage hook that refuses the message makes ChatMessage.create resolve
  // undefined (one message) or [] (a list): the roll never reached chat, so nothing is paid.
  if (result === undefined || result === null || (Array.isArray(result) && result.length === 0)) return result;
  for (const pay of costs) {
    try {
      await pay();
    } catch (error) {
      onCostError(error);
    }
  }
  return result;
}

function reportCostError(error) {
  globalThis.CONFIG?.logger?.warn?.(`Could not pay a roll cost: ${error}`);
}
