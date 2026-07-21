/**
 * Node tests for toItemData (Stage 9) — the tree materializer is INJECTED (DEV-15),
 * so these run with a fake and never touch the poisoned item-helpers.js.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { toItemData } from "../../modules/char-creator/to-item-data.js";
import { assignWizardIdentity } from "../../modules/char-creator/build-item-schema.js";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";

function gearRef() {
  return {
    uuid: "Compendium.p.Item.blaster",
    name: "Blaster",
    type: "weapon",
    img: "icons/blaster.png",
    snapshot: {
      _id: "SRC0000000000001",
      name: "Blaster",
      type: "weapon",
      img: "icons/blaster.png",
      system: { damage: 6, price: { value: 500 } },
      effects: [],
    },
  };
}

function specRef(learnedNodeDisabledMap) {
  return {
    uuid: "Compendium.p.Item.spec",
    name: "Ace",
    type: "specialization",
    img: "icons/spec.png",
    snapshot: {
      _id: "SPEC000000000001",
      name: "Ace",
      type: "specialization",
      img: "icons/spec.png",
      system: { talents: {} },
      effects: [],
    },
  };
}

test("no options: projects the snapshot, strips source identity, does not mutate input", () => {
  const ref = gearRef();
  const snapshotBefore = structuredClone(ref.snapshot);
  const out = toItemData(ref);
  assert.equal(out.name, "Blaster");
  assert.ok(!("_id" in out));
  assert.deepEqual(ref.snapshot, snapshotBefore); // input untouched
});

test("the injected materializer is called with (clonedSnapshot, learnedKeys) and its result is embedded", () => {
  const ref = specRef();
  const calls = [];
  const materializeTree = (source, learnedKeys) => {
    calls.push({ source, learnedKeys });
    // return a materialized source with a synced, enabled effect
    return {
      ...source,
      effects: [
        { _id: "FX01", name: "grantsBrawn", disabled: false, changes: [{ key: "system.characteristics.Brawn.value", value: "1", mode: AE_MODES.ADD }] },
      ],
    };
  };
  const out = toItemData(ref, { materializeTree, learnedKeys: ["node1", "node2"] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].learnedKeys, ["node1", "node2"]);
  assert.notEqual(calls[0].source, ref.snapshot); // received a clone, not the stored snapshot
  assert.equal(out.effects.length, 1);
  assert.equal(out.effects[0].name, "grantsBrawn");
  assert.equal(out.effects[0].disabled, false);
});

test("the materializer is NOT called when there are no learned keys", () => {
  const ref = specRef();
  let called = false;
  toItemData(ref, { materializeTree: () => { called = true; return ref.snapshot; }, learnedKeys: [] });
  assert.equal(called, false);
});

test("projection preserves an effect's disabled:true (unlearned node stays disabled)", () => {
  const ref = specRef();
  const materializeTree = (source) => ({
    ...source,
    effects: [{ _id: "FXd", name: "unlearned", disabled: true, changes: [{ key: "k", value: "1", mode: AE_MODES.ADD }] }],
  });
  const out = toItemData(ref, { materializeTree, learnedKeys: ["n"] });
  assert.equal(out.effects[0].disabled, true);
});

test("issue E: rank grants are deterministic (pcwRank<n>_slug), identical across runs, no Date.now()", () => {
  const ref = () => ({
    uuid: "u", name: "Ace", type: "specialization", img: "i",
    snapshot: { name: "Ace", type: "specialization", system: {}, effects: [] },
  });
  const a = toItemData(ref(), { rankGrants: ["Astrogation", "Astrogation", "Coordination"] });
  const b = toItemData(ref(), { rankGrants: ["Astrogation", "Astrogation", "Coordination"] });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a.system.attributes).sort(), ["pcwRank0_Astrogation", "pcwRank1_Astrogation", "pcwRank2_Coordination"]);
  assert.equal(a.effects.length, 3);
  assert.deepEqual(a.effects[0].changes[0], { key: "system.skills.Astrogation.rank", mode: AE_MODES.ADD, value: 1 });
  // two ranks of the same skill produce two distinct attributes (not one overwriting the other)
  assert.equal(a.system.attributes.pcwRank0_Astrogation.mod, "Astrogation");
  assert.equal(a.system.attributes.pcwRank1_Astrogation.mod, "Astrogation");
});

test("N-5 / duplicate purchase: two identical gear refs → two independent items with distinct ids", async () => {
  const item0 = toItemData(gearRef());
  const item1 = toItemData(gearRef());
  assert.notEqual(item0, item1); // independent objects
  const actorData = await assignWizardIdentity({ items: [item0, item1] }, { userId: "u", commitId: "COMMIT01" });
  assert.notEqual(actorData.items[0]._id, actorData.items[1]._id);
  assert.match(actorData.items[0]._id, /^[a-zA-Z0-9]{16}$/);
});
