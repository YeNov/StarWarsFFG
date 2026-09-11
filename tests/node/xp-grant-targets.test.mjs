/**
 * The candidate list behind the Group Manager's "Grant XP" dialog.
 *
 * The dialog exists because the group manager's own table is filtered by the
 * `pcListMode` world setting, and on its default ("Active Only") a character
 * whose player is not logged in has no row at all -- so the bulk XP button,
 * which used to read the rendered rows, could never reach them.
 *
 * These helpers are deliberately pure: they take documents and return plain
 * data, so the rule for "who can be granted XP" is pinned here rather than in
 * a dialog callback that only a browser can run.
 *
 * `testUserPermission` is stubbed the way core implements it -- a GM passes
 * every permission test on every document -- because that, not the ownership
 * array, is what makes `includeGMCharacters` widen the list to every character
 * in the world.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { collectXpGrantTargets, defaultXpSelection, rememberXpExclusions } from "../../modules/helpers/xp-grant-targets.js";

const user = (id, { isGM = false, active = false } = {}) => ({ id, isGM, active });

const actor = (id, name, { type = "character", owners = [] } = {}) => ({
  id,
  name,
  type,
  testUserPermission: (u, permission) => u.isGM || (permission === "OWNER" && owners.includes(u.id)),
});

const ids = (rows) => rows.map((r) => r.id);

test("a character is listed even though its only owner is logged out", () => {
  const users = [user("gm", { isGM: true, active: true }), user("mara")];
  const actors = [actor("dax", "Dax", { owners: ["mara"] })];

  assert.deepEqual(ids(collectXpGrantTargets({ actors, users })), ["dax"]);
});

test("actors that are not characters are left out", () => {
  const users = [user("mara", { active: true })];
  const actors = [
    actor("dax", "Dax", { owners: ["mara"] }),
    actor("speeder", "Speeder", { type: "vehicle", owners: ["mara"] }),
    actor("thug", "Thug", { type: "minion", owners: ["mara"] }),
  ];

  assert.deepEqual(ids(collectXpGrantTargets({ actors, users })), ["dax"]);
});

test("a character no player owns is left out", () => {
  const users = [user("mara", { active: true })];
  const actors = [actor("extra", "Cantina Patron", { owners: [] })];

  assert.deepEqual(collectXpGrantTargets({ actors, users }), []);
});

test("GM users do not qualify a character on their own", () => {
  const users = [user("gm", { isGM: true, active: true })];
  const actors = [actor("extra", "Cantina Patron", { owners: [] })];

  assert.deepEqual(collectXpGrantTargets({ actors, users }), []);
});

test("includeGMCharacters lets the GM qualify a character nobody else owns", () => {
  const users = [user("gm", { isGM: true, active: true })];
  const actors = [actor("extra", "Cantina Patron", { owners: [] })];

  assert.deepEqual(ids(collectXpGrantTargets({ actors, users, includeGMCharacters: true })), ["extra"]);
});

test("a character is flagged offline when none of its owners are connected", () => {
  const users = [user("mara"), user("jax")];
  const actors = [actor("dax", "Dax", { owners: ["mara", "jax"] })];

  assert.equal(collectXpGrantTargets({ actors, users })[0].offline, true);
});

test("a character is not flagged offline when one of its owners is connected", () => {
  const users = [user("mara"), user("jax", { active: true })];
  const actors = [actor("dax", "Dax", { owners: ["mara", "jax"] })];

  assert.equal(collectXpGrantTargets({ actors, users })[0].offline, false);
});

test("a character owned by two players is listed once", () => {
  const users = [user("mara", { active: true }), user("jax", { active: true })];
  const actors = [actor("dax", "Dax", { owners: ["mara", "jax"] })];

  assert.deepEqual(ids(collectXpGrantTargets({ actors, users })), ["dax"]);
});

test("characters are listed in name order", () => {
  const users = [user("mara", { active: true })];
  const actors = [
    actor("c", "Zeb", { owners: ["mara"] }),
    actor("a", "Ahsoka", { owners: ["mara"] }),
    actor("b", "Kanan", { owners: ["mara"] }),
  ];

  assert.deepEqual(ids(collectXpGrantTargets({ actors, users })), ["a", "b", "c"]);
});

test("every character starts selected when no token is controlled", () => {
  const characters = [{ id: "dax" }, { id: "mara" }];

  const selected = defaultXpSelection({ characters, controlledActorIds: [] });

  assert.deepEqual([...selected].sort(), ["dax", "mara"]);
});

test("controlling tokens narrows the selection to those characters", () => {
  const characters = [{ id: "dax" }, { id: "mara" }, { id: "jax" }];

  const selected = defaultXpSelection({ characters, controlledActorIds: ["mara", "jax"] });

  assert.deepEqual([...selected].sort(), ["jax", "mara"]);
});

test("controlling tokens that are not player characters selects everyone rather than nobody", () => {
  const characters = [{ id: "dax" }, { id: "mara" }];

  const selected = defaultXpSelection({ characters, controlledActorIds: ["stormtrooper"] });

  assert.deepEqual([...selected].sort(), ["dax", "mara"]);
});

// --- remembering the ticks between openings ---------------------------------

test("characters left unticked last time start unticked", () => {
  const characters = [{ id: "dax" }, { id: "mara" }, { id: "jax" }];

  const selected = defaultXpSelection({ characters, excludedIds: ["mara"] });

  assert.deepEqual([...selected].sort(), ["dax", "jax"]);
});

test("a character the dialog has not seen before starts ticked", () => {
  const characters = [{ id: "dax" }, { id: "newcomer" }];

  const selected = defaultXpSelection({ characters, excludedIds: ["dax"] });

  assert.deepEqual([...selected], ["newcomer"]);
});

test("controlled tokens decide the ticks whatever was remembered", () => {
  const characters = [{ id: "dax" }, { id: "mara" }];

  const selected = defaultXpSelection({ characters, controlledActorIds: ["mara"], excludedIds: ["mara"] });

  assert.deepEqual([...selected], ["mara"]);
});

test("what gets remembered is who was left unticked", () => {
  const characters = [{ id: "dax" }, { id: "mara" }, { id: "jax" }];

  assert.deepEqual(rememberXpExclusions({ characters, selectedIds: ["dax"] }), ["mara", "jax"]);
});

test("a remembered character missing from today's list stays remembered", () => {
  const characters = [{ id: "dax" }];

  assert.deepEqual(rememberXpExclusions({ characters, selectedIds: ["dax"], previous: ["retired", "dax"] }), ["retired"]);
});
