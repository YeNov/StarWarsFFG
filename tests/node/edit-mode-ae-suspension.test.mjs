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

test("ActorFFG skips Active Effect application before touching any effects", () => {
  // ActorFFG cannot be imported into the deliberately minimal Node tier because it extends
  // Foundry's Actor document. Keep a narrow wiring assertion here while the state predicate
  // above remains a normal executable unit test.
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg.js", import.meta.url), "utf8");
  const method = source.indexOf("applyActiveEffects(...args)");
  const guard = source.indexOf("ActorHelpers.isEditModeOwner(this)", method);
  const firstEffectRead = source.indexOf("this.allApplicableEffects()", method);

  assert.ok(method >= 0);
  assert.ok(guard > method);
  assert.ok(firstEffectRead > guard);
});
