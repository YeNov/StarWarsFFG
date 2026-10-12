// @ts-check
/**
 * Contract of the multi-user session helpers in playwright/foundry.js: each player is its own user
 * in its own browser context, sees a document according to the ownership the test gave it, and is
 * deleted, with every document the test created, when the sessions are disposed.
 */

import { CONST_OWNERSHIP, FoundrySessions, expect, openGame, test } from "../playwright/foundry.js";

/** What the session in `page` is, and what it may do with the actor. */
const viewOf = (page, actorId) => page.evaluate((id) => {
  const actor = game.actors.get(id);
  return {
    user: game.user.id,
    isGM: game.user.isGM,
    observer: Boolean(actor?.testUserPermission(game.user, "OBSERVER")),
    owner: Boolean(actor?.isOwner),
  };
}, actorId);

test("owner, observer and non-owner players each see the actor by their own ownership", async ({ sessions }) => {
  const owner = await sessions.player({ name: "owner" });
  const observer = await sessions.player({ name: "observer" });
  const outsider = await sessions.player({ name: "non-owner" });
  const actor = await sessions.create("Actor", {
    name: "shared-hero",
    type: "character",
    ownership: {
      default: CONST_OWNERSHIP.NONE,
      [owner.user.id]: CONST_OWNERSHIP.OWNER,
      [observer.user.id]: CONST_OWNERSHIP.OBSERVER,
    },
  });

  expect(await viewOf(sessions.gm, actor.id)).toMatchObject({ isGM: true, observer: true, owner: true });
  expect(await viewOf(owner.page, actor.id)).toEqual({ user: owner.user.id, isGM: false, observer: true, owner: true });
  expect(await viewOf(observer.page, actor.id)).toEqual({ user: observer.user.id, isGM: false, observer: true, owner: false });
  expect(await viewOf(outsider.page, actor.id)).toEqual({ user: outsider.user.id, isGM: false, observer: false, owner: false });
});

test("disposing the sessions closes the players and deletes what the test created", async ({ page, browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is not configured");
  await openGame(page);
  const sessions = new FoundrySessions({ browser, gm: page, baseURL, testInfo: test.info() });
  try {
    const player = await sessions.player();
    const item = await sessions.create("Item", { name: "gear", type: "gear" });

    await sessions.dispose();

    expect(player.page.isClosed()).toBe(true);
    expect(await page.evaluate(({ userId, itemId }) => ({
      user: game.users.has(userId),
      item: game.items.has(itemId),
    }), { userId: player.user.id, itemId: item.id })).toEqual({ user: false, item: false });
  } finally {
    await sessions.dispose(); // a no-op once disposed; cleans up if the test failed before that
  }
});
