/**
 * Node tests for the PC Wizard shared constants (Stage 5).
 *
 * Guards the stable values other modules depend on and the non-collision with the
 * GM bridge's socket event names (plan §0.9). That lang/en.json parses is checked by
 * lang-expansion.test.mjs, which parses every localization file.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  SOCKET_CHANNEL,
  SOCKET_EVENT_TYPE,
  SOCKET_EVENTS,
  FLAG_SCOPE,
  FLAGS,
  DRAFT_SCHEMA_VERSION,
  DRAFT_MAX_BYTES,
  COMMIT_TIMEOUT_MS,
  START_NOTICE_SPACING_MS,
} from "../../modules/char-creator/constants.js";

test("stable values", () => {
  assert.equal(SOCKET_CHANNEL, "system.starwarsffg");
  assert.equal(SOCKET_EVENT_TYPE, "pcWizard");
  assert.equal(FLAG_SCOPE, "starwarsffg");
  assert.equal(FLAGS.draft, "pcWizardDraft");
  assert.equal(FLAGS.sourceSelection, "pcWizardSourceSelection");
  assert.equal(FLAGS.commit, "pcWizardCommit");
  assert.equal(DRAFT_SCHEMA_VERSION, 1);
  assert.equal(DRAFT_MAX_BYTES, 65536);
  assert.equal(COMMIT_TIMEOUT_MS, 15000);
  assert.equal(START_NOTICE_SPACING_MS, 30000);
});

test("wizard socket event names are distinct from each other and from the GM bridge's (plan §0.9)", () => {
  const gmBridgeEvents = ["ffgApplyToTarget", "ffgUpdateMessage", "ffgCritRecovery"];
  const wizardEvents = Object.values(SOCKET_EVENTS);
  assert.equal(new Set(wizardEvents).size, wizardEvents.length, "two wizard events share a name");
  for (const evt of wizardEvents) {
    assert.ok(!gmBridgeEvents.includes(evt), `wizard event "${evt}" collides with a GM-bridge event`);
  }
});
