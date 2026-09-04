import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { refreshSheetsForRemoteUpdate } from "../../modules/helpers/sheet-sync.js";

/**
 * Item sheets submit with `render: false` -- the render-race fix, so the DOM is not swapped out
 * from under someone who is mid-edit. Foundry's ClientDocument#_onUpdate honours that flag on
 * EVERY client, not just the one that typed, and `ItemHelpers.itemUpdate` compensates with two
 * explicit re-renders that only ever run locally. So a second user with the same item -- or the
 * owning actor -- open kept seeing the old numbers until they reloaded.
 *
 * Verified live: a player changed a weapon from damage 6 to 11 and crit 3 to 9; the GM's data
 * was correct while the GM's actor sheet still rendered DAM6 and the GM's item sheet still
 * showed crit 3, indefinitely.
 *
 * The suppression is only ever right for the client doing the editing -- nobody else is typing.
 * These cover the predicate that decides when a client must refresh anyway.
 */

const sheet = (rendered) => {
  const calls = [];
  return { rendered, render: (force) => calls.push(force), calls };
};

const doc = ({ open = true, actorOpen = null } = {}) => ({
  sheet: sheet(open),
  actor: actorOpen === null ? null : { sheet: sheet(actorOpen) },
});

const ME = "user-me";
const OTHER = "user-other";

test("refreshes an open item sheet when another client suppressed the render", () => {
  const item = doc({ open: true });

  const refreshed = refreshSheetsForRemoteUpdate(item, { render: false }, OTHER, ME);

  assert.deepEqual(refreshed, ["item"]);
  assert.deepEqual(item.sheet.calls, [false], "re-render must not steal focus");
});

test("refreshes the owning actor's sheet too, since it shows the item's derived data", () => {
  const item = doc({ open: true, actorOpen: true });

  const refreshed = refreshSheetsForRemoteUpdate(item, { render: false }, OTHER, ME);

  assert.deepEqual(refreshed, ["item", "actor"]);
  assert.deepEqual(item.actor.sheet.calls, [false]);
});

test("leaves the editing client alone -- it already re-rendered itself", () => {
  // itemUpdate does its own explicit renders locally; doing it again here would reintroduce
  // the mid-edit DOM swap the render-race fix removed.
  const item = doc({ open: true, actorOpen: true });

  assert.deepEqual(refreshSheetsForRemoteUpdate(item, { render: false }, ME, ME), []);
  assert.deepEqual(item.sheet.calls, []);
  assert.deepEqual(item.actor.sheet.calls, []);
});

test("does nothing when the render was not suppressed", () => {
  // Foundry re-renders these itself; a second render would be wasted work.
  const item = doc({ open: true, actorOpen: true });

  assert.deepEqual(refreshSheetsForRemoteUpdate(item, { render: true }, OTHER, ME), []);
  assert.deepEqual(refreshSheetsForRemoteUpdate(item, {}, OTHER, ME), []);
  assert.deepEqual(item.sheet.calls, []);
});

test("skips sheets nobody has open", () => {
  const closed = doc({ open: false, actorOpen: false });

  assert.deepEqual(refreshSheetsForRemoteUpdate(closed, { render: false }, OTHER, ME), []);
  assert.deepEqual(closed.sheet.calls, []);
  assert.deepEqual(closed.actor.sheet.calls, []);
});

test("handles a world item, which has no owning actor", () => {
  const worldItem = doc({ open: true });

  assert.deepEqual(refreshSheetsForRemoteUpdate(worldItem, { render: false }, OTHER, ME), ["item"]);
});

test("survives a document with no sheet at all", () => {
  assert.deepEqual(refreshSheetsForRemoteUpdate({}, { render: false }, OTHER, ME), []);
  assert.deepEqual(refreshSheetsForRemoteUpdate(undefined, { render: false }, OTHER, ME), []);
});

test("the refresh is wired to the updateItem hook", () => {
  const source = fs.readFileSync(new URL("../../modules/swffg-main.js", import.meta.url), "utf8");

  assert.match(source, /Hooks\.on\(\s*["']updateItem["']/, "must listen for item updates");
  assert.match(source, /refreshSheetsForRemoteUpdate/, "must use the shared predicate");
});
