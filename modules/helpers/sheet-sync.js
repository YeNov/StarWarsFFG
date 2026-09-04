/**
 * Keeping other clients' open sheets in step with a suppressed-render write.
 *
 * The item sheet submits with `render: false` -- the render-race fix, so a re-render cannot swap
 * the DOM out from under someone who is mid-edit. Foundry honours that flag in
 * `ClientDocument#_onUpdate`, which runs on EVERY client, and `ItemHelpers.itemUpdate` makes up
 * for it with two explicit re-renders (its own sheet, and the owning actor's) that only ever run
 * on the client doing the editing.
 *
 * The result was that a second user with the same item, or its owning actor, open kept seeing the
 * old values until they reloaded: a player changing a weapon's damage left the GM's character
 * sheet showing the previous number indefinitely.
 *
 * Suppressing the render is only ever correct for the client that is typing. Everyone else has no
 * edit in progress to protect, so they refresh here instead.
 *
 * Pure of Foundry globals -- the current user id is passed in -- so it can be unit tested.
 */

/**
 * Re-render the sheets a remote suppressed-render update would otherwise have left stale.
 *
 * @param {object} doc - the updated document (an Item; `doc.actor` is its owner, if embedded)
 * @param {object} options - the update operation's options, carrying `render`
 * @param {string} userId - the user who performed the update
 * @param {string} currentUserId - the user this client is logged in as
 * @returns {string[]} which sheets were refreshed, for tests and logging
 */
export function refreshSheetsForRemoteUpdate(doc, options, userId, currentUserId) {
  // The editing client already re-rendered itself, deliberately and at the right moment.
  if (userId === currentUserId) return [];
  // Anything that did not suppress its render is re-rendered by Foundry already.
  if (options?.render !== false) return [];

  const refreshed = [];
  // `render(false)` re-renders in place without bringing the window to the front or stealing
  // focus -- this is a background refresh of someone else's edit, not an action they took.
  if (doc?.sheet?.rendered) {
    doc.sheet.render(false);
    refreshed.push("item");
  }
  // The owning actor's sheet shows the item's derived data (weapon rows, talent panels), so it
  // goes stale for exactly the same reason.
  if (doc?.actor?.sheet?.rendered) {
    doc.actor.sheet.render(false);
    refreshed.push("actor");
  }
  return refreshed;
}
