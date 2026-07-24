/**
 * Node tests for PC wizard attachment purchase helpers.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  attachmentAppliesTo,
  canAttach,
  isAttachablePurchase,
  remainingHardpoints,
  usedHardpoints,
} from "../../modules/char-creator/attachment-purchases.js";

function ref(type, { attachmentType = "all", hp = 0 } = {}) {
  return {
    type,
    snapshot: {
      system: {
        type: attachmentType,
        hardpoints: { value: hp },
      },
    },
  };
}

test("attachment compatibility follows target type or all", () => {
  assert.equal(attachmentAppliesTo(ref("weapon"), ref("itemattachment", { attachmentType: "weapon" })), true);
  assert.equal(attachmentAppliesTo(ref("armour"), ref("itemattachment", { attachmentType: "weapon" })), false);
  assert.equal(attachmentAppliesTo(ref("armour"), ref("itemattachment", { attachmentType: "all" })), true);
  assert.equal(attachmentAppliesTo(ref("armour"), ref("itemattachment", { attachmentType: "armor" })), true);
});

test("hardpoint accounting filters attachments that no longer fit", () => {
  const target = { id: "weapon-1", ref: ref("weapon", { hp: 3 }) };
  const data = {
    purchases: {
      credits: [
        target,
        { id: "attachment-1", ref: ref("itemattachment", { attachmentType: "weapon", hp: 2 }), attachTo: "weapon-1" },
      ],
    },
  };

  assert.equal(usedHardpoints(data, "weapon-1"), 2);
  assert.equal(remainingHardpoints(data, target), 1);
  assert.equal(canAttach(data, target, ref("itemattachment", { attachmentType: "weapon", hp: 1 })), true);
  assert.equal(canAttach(data, target, ref("itemattachment", { attachmentType: "weapon", hp: 2 })), false);
});

test("zero-hardpoint items can still open attachment browsing", () => {
  const target = { id: "armor-1", ref: ref("armour", { hp: 0 }) };
  const data = { purchases: { credits: [target] } };

  assert.equal(isAttachablePurchase(target), true);
  assert.equal(canAttach(data, target, ref("itemattachment", { attachmentType: "armour", hp: 0 })), true);
  assert.equal(canAttach(data, target, ref("itemattachment", { attachmentType: "armour", hp: 1 })), false);
});
