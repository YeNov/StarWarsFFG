/**
 * Node tests for the PC Wizard shared constants (Stage 5).
 *
 * Guards the stable values other modules depend on and the non-collision with the
 * GM bridge's socket event names (plan §0.9), plus that lang/en.json still parses.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

test("wizard socket event names do NOT collide with the GM bridge's (plan §0.9)", () => {
  const gmBridgeEvents = ["ffgApplyToTarget", "ffgUpdateMessage", "ffgCritRecovery"];
  const wizardEvents = Object.values(SOCKET_EVENTS);
  for (const evt of wizardEvents) {
    assert.ok(!gmBridgeEvents.includes(evt), `wizard event "${evt}" collides with a GM-bridge event`);
  }
});

test("wizard socket event names are internally unique", () => {
  const values = Object.values(SOCKET_EVENTS);
  assert.equal(new Set(values).size, values.length);
});

test("SOCKET_EVENTS is frozen (constants are not mutable at runtime)", () => {
  assert.ok(Object.isFrozen(SOCKET_EVENTS));
  assert.ok(Object.isFrozen(FLAGS));
});

test("lang/en.json parses as valid JSON and keeps the CharacterCreator block", () => {
  const enPath = fileURLToPath(new URL("../../lang/en.json", import.meta.url));
  const raw = readFileSync(enPath, "utf8");
  const parsed = JSON.parse(raw); // throws on malformed JSON
  assert.ok(Object.keys(parsed).some((k) => k.startsWith("SWFFG.CharacterCreator.")));
});
