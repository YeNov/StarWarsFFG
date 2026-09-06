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

test("an unlinked token does not inherit its base actor's Edit Mode", () => {
  // BaseActorDelta merges the base actor's flags into every synthetic token actor, so without
  // this guard ticking Edit Mode on one base actor would suspend effects on all of its tokens.
  const tokenActor = (ownConfig) => Object.assign(actor(), {
    isToken: true,
    token: { _source: { delta: { flags: { starwarsffg: ownConfig ? { config: ownConfig } : {} } } } },
  });

  assert.equal(ActorHelpers.isEditModeOwner(tokenActor(null)), false, "inherited only");
  assert.equal(ActorHelpers.isEditModeOwner(tokenActor({ enableEditMode: true })), true, "set on the token itself");
});

test("the token check never materializes the ActorDelta", () => {
  // Reading `token.delta` CONSTRUCTS the ActorDelta, which constructs the synthetic actor,
  // which prepares data -> applyActiveEffects -> allApplicableEffects -> back here: an
  // infinite recursion that overflowed the stack on world load ("Failed data preparation
  // for Scene...Token...Actor. Maximum call stack size exceeded"). The token document's own
  // _source already carries the delta data, so read that and touch no getter.
  const tokenActor = (ownConfig) => Object.assign(actor(), {
    isToken: true,
    token: {
      _source: { delta: { flags: { starwarsffg: ownConfig ? { config: ownConfig } : {} } } },
      get delta() { throw new Error("materialized the ActorDelta"); },
    },
  });

  assert.equal(ActorHelpers.isEditModeOwner(tokenActor(null)), false, "inherited only");
  assert.equal(ActorHelpers.isEditModeOwner(tokenActor({ enableEditMode: true })), true, "set on the token itself");
});

test("ActorFFG withholds stat effects in Edit Mode but keeps conditions applying", () => {
  // ActorFFG cannot be imported into the deliberately minimal Node tier because it extends
  // Foundry's Actor document. Keep a narrow wiring assertion here while the state predicate
  // above remains a normal executable unit test.
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg.js", import.meta.url), "utf8");
  const body = source.slice(
    source.indexOf("*allApplicableEffects("),
    source.indexOf("applyActiveEffects(...args)"),
  );

  assert.ok(body.length > 0, "allApplicableEffects must precede applyActiveEffects");
  assert.match(body, /ActorHelpers\.isEditModeOwner\(this\)/);
  // Core derives statuses/temporaryEffects (and so the token status icons) from this same
  // generator, so condition effects must keep flowing even while stat grants are withheld.
  assert.match(body, /effect\?\.statuses\?\.size/);
  // The phase argument core passes in V14 has to reach super, as applyActiveEffects already does.
  assert.match(body, /yield\* super\.allApplicableEffects\(\.\.\.args\)/);
  assert.match(source, /return super\.applyActiveEffects\(\.\.\.args\)/);
});

test("the stale-flag migration is gated on a real version comparison", () => {
  const source = fs.readFileSync(new URL("../../modules/swffg-migration.js", import.meta.url), "utf8");

  // parseFloat("2.1.2") === parseFloat("2.1.1") === 2.1, so a parseFloat gate cannot tell one
  // patch release from another and a migration behind one would never run for the release that
  // needed it. Every version comparison in this file has to compare version strings.
  assert.doesNotMatch(source, /if\s*\([^)]*parseFloat/);
  assert.match(source, /foundry\.utils\.isNewerVersion/);
  assert.match(source, /olderThan\(oldVersion, "2\.1\.2"\)[\s\S]{0,80}clearStaleEditMode/);
});

test("Sheet Options uses the persisted owner instead of client-local effect mutations", () => {
  const source = fs.readFileSync(new URL("../../modules/actors/actor-ffg-options.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /_suspendedAECache|beginEditMode|endEditMode/);
  assert.match(source, /config\.editModeActor.*game\.user\.id/);
  assert.match(source, /await this\.data\.object\.update\(updateObject\)/);
});
