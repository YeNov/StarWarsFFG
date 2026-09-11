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
 * Controlled tokens win: when any of them belong to listed characters, just those
 * characters are ticked -- a one-off "pay these" that ignores what was remembered.
 * Otherwise everyone is ticked except the characters left unticked last time
 * (`excludedIds`). Remembering who was LEFT OUT, rather than who was ticked, means a
 * character created since starts ticked, so nobody is quietly dropped from the XP.
 * Controlling tokens that are not player characters (a squad of stormtroopers, say)
 * counts as controlling none, because opening on an empty selection is never what was meant.
 *
 * @param {object} args
 * @param {Array<{id: string}>} args.characters       Rows from `collectXpGrantTargets`.
 * @param {Array<string>} [args.controlledActorIds]   Base actor ids of the controlled tokens.
 * @param {Array<string>} [args.excludedIds]          Characters left unticked last time.
 * @returns {Set<string>} Ids to tick.
 */
export function defaultXpSelection({ characters, controlledActorIds = [], excludedIds = [] }) {
  const all = characters.map((character) => character.id);
  const controlled = new Set(controlledActorIds);
  const narrowed = all.filter((id) => controlled.has(id));
  if (narrowed.length) return new Set(narrowed);
  const excluded = new Set(excludedIds);
  return new Set(all.filter((id) => !excluded.has(id)));
}

/**
 * What to remember after the boxes change: every listed character left unticked, plus
 * any remembered character who is not in today's list -- a character whose player lost
 * ownership for a while should still be left out when they come back.
 *
 * @param {object} args
 * @param {Array<{id: string}>} args.characters    Rows from `collectXpGrantTargets`.
 * @param {Array<string>} args.selectedIds         The ticked characters.
 * @param {Array<string>} [args.previous]          What was remembered before.
 * @returns {Array<string>} Ids to remember as left unticked.
 */
export function rememberXpExclusions({ characters, selectedIds, previous = [] }) {
  const listed = new Set(characters.map((character) => character.id));
  const selected = new Set(selectedIds);
  const unlisted = previous.filter((id) => !listed.has(id));
  return [...unlisted, ...characters.map((character) => character.id).filter((id) => !selected.has(id))];
}
