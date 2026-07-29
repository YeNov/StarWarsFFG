import test from "node:test";
import assert from "node:assert/strict";

import { codexItemTypeLabelKey } from "../../modules/items/codex-item-labels.js";

test("Codex obligation headers use the item's actual track type", () => {
  assert.equal(codexItemTypeLabelKey("obligation", "obligation"), "SWFFG.DescriptionObligation");
  assert.equal(codexItemTypeLabelKey("obligation", "morality"), "SWFFG.DescriptionMorality");
  assert.equal(codexItemTypeLabelKey("obligation", "duty"), "SWFFG.DescriptionDuty");
  assert.equal(codexItemTypeLabelKey("obligation", " Duty "), "SWFFG.DescriptionDuty");
});

test("Codex obligation headers safely fall back for missing legacy subtypes", () => {
  assert.equal(codexItemTypeLabelKey("obligation", ""), "TYPES.Item.obligation");
  assert.equal(codexItemTypeLabelKey("obligation"), "TYPES.Item.obligation");
});

test("other Codex item headers retain their Foundry type labels", () => {
  assert.equal(codexItemTypeLabelKey("motivation", "Ambition"), "TYPES.Item.motivation");
  assert.equal(codexItemTypeLabelKey("weapon", "weapon"), "TYPES.Item.weapon");
});
