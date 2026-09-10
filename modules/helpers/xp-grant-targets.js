/**
 * Who the Group Manager's "Grant XP" dialog offers, and who it pre-selects.
 *
 * The group manager's own table is filtered by the `pcListMode` world setting, and
 * on its default ("Active Only") it holds one row per *connected* player -- so a
 * character whose player is logged out is not on screen and cannot be paid. XP
 * granting deliberately does not consult that setting: it always offers every
 * player-owned character, and the dialog's checkboxes decide who is actually paid.
 *
 * Pure by design -- documents in, plain data out -- so the rule lives somewhere the
 * Node tier can pin it instead of inside a dialog callback only a browser can run.
 */

/**
 * Every character that can be granted XP, in name order.
 *
 * A character qualifies when a non-GM user has OWNER on it, connected or not. GM users
 * are skipped unless `includeGMCharacters` is set, mirroring the group manager's
 * `GMCharactersInGroupManager` setting -- and note that letting them in widens the list
 * to *every* character actor in the world, because core's `testUserPermission` passes a
 * GM on every document regardless of its ownership.
 *
 * @param {object} args
 * @param {Iterable<Actor>} args.actors             Candidate actors, typically `game.actors`.
 * @param {Iterable<User>} args.users               Candidate users, typically `game.users`.
 * @param {boolean} [args.includeGMCharacters]      Whether GM users qualify a character.
 * @returns {Array<{id: string, name: string, offline: boolean}>}
 */
export function collectXpGrantTargets({ actors, users, includeGMCharacters = false }) {
  const eligible = [...users].filter((user) => !user.isGM || includeGMCharacters);
  const targets = [];

  for (const actor of actors) {
    if (actor?.type !== "character") continue;
    const owners = eligible.filter((user) => actor.testUserPermission(user, "OWNER"));
    if (!owners.length) continue;
    targets.push({
      id: actor.id,
      name: actor.name,
      // Shown as a hint in the dialog, never a filter: an absent player still earns XP.
      offline: !owners.some((user) => user.active),
    });
  }

  return targets.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/**
 * The boxes that start ticked.
 *
 * Everyone, unless tokens are controlled when the dialog opens -- then just the
 * characters those tokens belong to. Controlling tokens that are not player characters
 * (a squad of stormtroopers, say) falls back to everyone, because opening the dialog on
 * an empty selection and granting nothing is never what was meant.
 *
 * @param {object} args
 * @param {Array<{id: string}>} args.characters       Rows from `collectXpGrantTargets`.
 * @param {Array<string>} [args.controlledActorIds]   Base actor ids of the controlled tokens.
 * @returns {Set<string>} Ids to tick.
 */
export function defaultXpSelection({ characters, controlledActorIds = [] }) {
  const all = characters.map((character) => character.id);
  const controlled = new Set(controlledActorIds);
  const narrowed = all.filter((id) => controlled.has(id));
  return new Set(narrowed.length ? narrowed : all);
}
