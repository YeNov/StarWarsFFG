import test from "node:test";
import assert from "node:assert/strict";

import { codexXpBuyActive } from "../../modules/actors/codex-xp-buy.js";

test("Codex characters retain their transient XP-buy toggle", () => {
  assert.equal(codexXpBuyActive("character", false, false), false);
  assert.equal(codexXpBuyActive("character", false, true), true);
});

test("Codex non-character actors keep XP-buy management active", () => {
  for (const actorType of ["rival", "nemesis", "minion", "vehicle"]) {
    assert.equal(codexXpBuyActive(actorType, false, false), true, actorType);
  }
});

test("Edit Mode suppresses XP-buy management for every actor type", () => {
  for (const actorType of ["character", "rival", "nemesis", "minion", "vehicle"]) {
    assert.equal(codexXpBuyActive(actorType, true, true), false, actorType);
  }
});

test("unsupported actor types do not acquire XP-buy mode implicitly", () => {
  assert.equal(codexXpBuyActive("homestead", false, true), false);
  assert.equal(codexXpBuyActive(undefined, false, true), false);
});
