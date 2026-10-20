import test from "node:test";
import assert from "node:assert/strict";

import { rollActorFrom } from "../../modules/dice/roll-actor.js";

/**
 * Which actor the roll dialog reads optional buffs from. A sheet hands the dialog its live actor,
 * which for an unlinked token is the token's own copy; a pool sent to a player arrives as plain
 * data and can only name the world actor.
 */

const actor = (id) => ({ documentName: "Actor", id });

test("a sheet's live actor is used first, so an unlinked token's own actor is read", () => {
  assert.equal(rollActorFrom({ data: { document: actor("token-copy"), actor: { _id: "world" } } }, () => actor("world")).id, "token-copy");
});

test("an item's owner is used when the data has no live actor", () => {
  assert.equal(rollActorFrom({ data: { actor: { _id: "world" } }, item: { actor: actor("owner") } }, () => actor("world")).id, "owner");
});

test("a token's actor comes before the world actor", () => {
  assert.equal(rollActorFrom({ data: { token: { actor: actor("tok") }, actor: { _id: "world" } } }, () => actor("world")).id, "tok");
});

test("a sent pool's plain data falls back to the world actor", () => {
  assert.equal(rollActorFrom({ data: { document: { _id: "x" }, actor: { _id: "world" } } }, (id) => actor(id)).id, "world");
});

test("no actor anywhere gives null", () => {
  assert.equal(rollActorFrom({ data: {} }, () => undefined), null);
});

test("an actor named by uuid comes first, as for a crew member rolling from the vehicle's sheet", () => {
  const crew = actor("crew");
  const found = rollActorFrom(
    { data: { document: actor("vehicle") }, actorUuid: "Actor.crew" },
    () => actor("world"),
    (uuid) => (uuid === "Actor.crew" ? crew : undefined),
  );

  assert.equal(found.id, "crew");
});

test("a uuid that resolves to no actor falls back to the roll's own data", () => {
  const found = rollActorFrom({ data: { document: actor("sheet") }, actorUuid: "Actor.gone" }, () => undefined, () => undefined);

  assert.equal(found.id, "sheet");
});
