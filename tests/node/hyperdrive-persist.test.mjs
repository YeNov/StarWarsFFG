import test from "node:test";
import assert from "node:assert/strict";

import { replaceActor } from "../../modules/importer/hyperdrive/persist.js";

test("override creates a fresh actor and deletes the previous document", async () => {
  const calls = [];
  const previousSource = { _id: "existing-actor", name: "Old Vesh" };
  const actorData = {
    _id: "new-random-id",
    name: "Vesh Qal",
    system: {
      experience: { available: 0, total: 110 },
      skills: { Discipline: { careerskill: true } },
    },
    items: [{ name: "Seer", type: "specialization" }],
  };
  const existing = {
    id: "existing-actor",
    toObject: () => previousSource,
    delete: async () => { calls.push("delete-existing"); },
  };
  const createActor = async (source, options) => {
    calls.push("create");
    assert.notEqual(source, actorData);
    assert.deepEqual(source, { ...actorData, _id: "existing-actor" });
    assert.deepEqual(options, { keepId: true });
    return { id: source._id };
  };

  const result = await replaceActor(existing, actorData, createActor);

  assert.equal(result.id, "existing-actor");
  assert.equal(actorData._id, "new-random-id");
  assert.deepEqual(calls, ["delete-existing", "create"]);
});

test("override does not create anything when deleting the existing actor fails", async () => {
  const failure = new Error("delete failed");
  let createCalls = 0;
  const existing = {
    id: "existing-actor",
    toObject: () => ({ _id: "existing-actor", name: "Old Vesh" }),
    delete: async () => { throw failure; },
  };

  await assert.rejects(
    replaceActor(existing, {}, async () => {
      createCalls += 1;
      return {};
    }),
    failure,
  );
  assert.equal(createCalls, 0);
});

test("override restores the previous actor if replacement creation fails", async () => {
  const failure = new Error("validation failed");
  const previousSource = {
    _id: "existing-actor",
    name: "Old Vesh",
    system: { experience: { available: -100, total: 10 } },
  };
  const createdSources = [];
  const existing = {
    id: "existing-actor",
    toObject: () => previousSource,
    delete: async () => {},
  };

  await assert.rejects(
    replaceActor(existing, { name: "Vesh Qal" }, async (source) => {
      createdSources.push(source);
      if (createdSources.length === 1) throw failure;
      return { id: source._id };
    }),
    failure,
  );
  assert.deepEqual(createdSources, [
    { name: "Vesh Qal", _id: "existing-actor" },
    previousSource,
  ]);
});
