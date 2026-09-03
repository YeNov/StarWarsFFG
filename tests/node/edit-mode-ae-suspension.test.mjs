import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import ActorHelpers from "../../modules/helpers/actor-helpers.js";

const actor = ({ enabled = true, owner = game.user.id } = {}) => ({
  getFlag: (_scope, key) => ({
    "config.enableEditMode": enabled,
    "config.editModeActor": owner,
  })[key],
});

test("recognizes only the client that owns persisted Edit Mode", () => {
  assert.equal(ActorHelpers.isEditModeOwner(actor()), true);
  assert.equal(ActorHelpers.isEditModeOwner(actor({ enabled: false })), false);
  assert.equal(ActorHelpers.isEditModeOwner(actor({ owner: "another-user" })), false);
  assert.equal(ActorHelpers.isEditModeOwner(undefined), false);
});

test("ActorFFG filters applicable effects but still lets core clear its state", () => {
  // ActorFFG cannot be imported into the deliberately minimal Node tier because it extends
  // Foundry's Actor document. Keep a narrow wiring assertion here while the state predicate
  // above remains a normal executable unit test.
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg.js", import.meta.url), "utf8");
  const applicable = source.indexOf("*allApplicableEffects()");
  const guard = source.indexOf("ActorHelpers.isEditModeOwner(this)", applicable);
  const parentEffects = source.indexOf("yield* super.allApplicableEffects()", guard);
  const apply = source.indexOf("applyActiveEffects(...args)", parentEffects);
  const parentApply = source.indexOf("return super.applyActiveEffects(...args)", apply);

  assert.ok(applicable >= 0);
  assert.ok(guard > applicable);
  assert.ok(parentEffects > guard);
  assert.ok(apply > parentEffects);
  assert.ok(parentApply > apply);
});

test("Sheet Options uses the persisted owner instead of client-local effect mutations", () => {
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg-options.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /_suspendedAECache|beginEditMode|endEditMode/);
  assert.match(source, /config\.editModeActor.*game\.user\.id/);
  assert.match(source, /await this\.data\.object\.update\(updateObject\)/);
});
