/**
 * Node tests for the build-dependency factory (Stage 10, DEV-16).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { makeBuildDependencies, MissingCollaboratorError } from "../../modules/char-creator/build-deps.js";

function collaborators(overrides = {}) {
  return {
    getActorCreationDefaults: (type) => ({ type, img: "d.png", prototypeToken: {}, system: {} }),
    applyCharacteristicDeltas: (sys) => sys,
    materializeTreePurchases: (source) => source,
    toItemData: (ref, options) => ({ ref, options }),
    ...overrides,
  };
}

test("creationDefaults is getActorCreationDefaults('character')", () => {
  const seen = [];
  const deps = makeBuildDependencies(collaborators({
    getActorCreationDefaults: (type) => { seen.push(type); return { type, marker: "defaults" }; },
  }));
  assert.deepEqual(seen, ["character"]); // called with "character"
  assert.equal(deps.creationDefaults.marker, "defaults");
  assert.equal(deps.creationDefaults.type, "character");
});

test("the toItemData adapter binds materializeTreePurchases as materializeTree on every call", () => {
  const materializeTreePurchases = () => "the-real-materializer";
  const deps = makeBuildDependencies(collaborators({ materializeTreePurchases }));
  const out1 = deps.toItemData({ uuid: "a" }, { learnedKeys: ["n"] });
  const out2 = deps.toItemData({ uuid: "b" });
  assert.equal(out1.options.materializeTree, materializeTreePurchases);
  assert.equal(out2.options.materializeTree, materializeTreePurchases);
});

test("a caller-supplied materializeTree option CANNOT override the binding", () => {
  const real = () => "real";
  const deps = makeBuildDependencies(collaborators({ materializeTreePurchases: real }));
  const out = deps.toItemData({ uuid: "a" }, { materializeTree: () => "evil", learnedKeys: ["n"] });
  assert.equal(out.options.materializeTree, real);
});

test("other caller options are preserved", () => {
  const deps = makeBuildDependencies(collaborators());
  const out = deps.toItemData({ uuid: "a" }, { learnedKeys: ["x"], rankGrants: ["Astrogation"] });
  assert.deepEqual(out.options.learnedKeys, ["x"]);
  assert.deepEqual(out.options.rankGrants, ["Astrogation"]);
});

test("applyCharacteristicDeltas is threaded through unchanged", () => {
  const fn = (sys) => sys;
  const deps = makeBuildDependencies(collaborators({ applyCharacteristicDeltas: fn }));
  assert.equal(deps.applyCharacteristicDeltas, fn);
});

test("omitting or passing a non-function for ANY of the four throws MissingCollaboratorError", () => {
  for (const key of ["getActorCreationDefaults", "applyCharacteristicDeltas", "materializeTreePurchases", "toItemData"]) {
    assert.throws(() => makeBuildDependencies(collaborators({ [key]: undefined })), MissingCollaboratorError, `undefined ${key}`);
    assert.throws(() => makeBuildDependencies(collaborators({ [key]: "nope" })), MissingCollaboratorError, `non-fn ${key}`);
  }
});
