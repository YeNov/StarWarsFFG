/**
 * Node tests for commit normalization / fingerprint / sanitizer (Stage 15, D3).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  normalizeCommitSource,
  fingerprint,
  digest16,
  sanitizeCommitRequest,
  InvalidCommitRequestError,
} from "../../modules/char-creator/commit-normalize.js";

const commit = { userId: "u1", commitId: "COMMIT0000000001", firstAttemptAt: "2026-07-21T12:00:00.000Z", xp: { total: 100, available: 20 } };
function actorData() {
  return { name: "Kel", type: "character", img: "i.png", system: { experience: {} }, items: [{ name: "Blaster", type: "weapon", system: {}, effects: [] }] };
}

test("normalizeCommitSource bakes exactly two pcw:<commitId>:* entries with the frozen date", async () => {
  const { source } = await normalizeCommitSource(actorData(), commit);
  const log = source.flags.starwarsffg.xpLog;
  assert.equal(log.length, 2);
  assert.equal(log[0].id, "pcw:COMMIT0000000001:spend");
  assert.equal(log[1].id, "pcw:COMMIT0000000001:earn");
  assert.equal(log[0].date, "2026-07-21");
  assert.equal(log[1].date, "2026-07-21");
});

test("the baked SPEND entry has action 'purchased' and description 'Character Creation Changes'", async () => {
  const { source } = await normalizeCommitSource(actorData(), commit);
  const [spend, earn] = source.flags.starwarsffg.xpLog;
  assert.equal(spend.action, "purchased");
  assert.equal(spend.description, "Character Creation Changes");
  assert.equal(spend.xp.cost, 80); // total - available
  // earn: grant stored under xp.cost === total, action granted
  assert.equal(earn.action, "granted");
  assert.equal(earn.xp.cost, 100);
});

test("the commit stamp is written to flags.starwarsffg.pcWizardCommit", async () => {
  const { source } = await normalizeCommitSource(actorData(), commit);
  assert.deepEqual(source.flags.starwarsffg.pcWizardCommit, { commitId: "COMMIT0000000001", userId: "u1", xp: { total: 100, available: 20 }, date: "2026-07-21" });
});

test("normalization is deterministic for the same input (fingerprint stable)", async () => {
  const a = await normalizeCommitSource(actorData(), commit);
  const b = await normalizeCommitSource(actorData(), commit);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.deepEqual(a.source, b.source);
});

test("the fingerprint excludes _stats (and ownership)", () => {
  const withStats = { name: "A", _stats: { x: 1 }, items: [{ name: "i", _stats: { y: 2 } }] };
  const withoutStats = { name: "A", items: [{ name: "i" }] };
  assert.equal(fingerprint(withStats), fingerprint(withoutStats));

  const withOwnership = { name: "A", ownership: { gm: 3 } };
  const withoutOwnership = { name: "A" };
  assert.equal(fingerprint(withOwnership), fingerprint(withoutOwnership));
});

test("digest16 is a deterministic 16-char base-62 string", () => {
  assert.match(digest16({ a: 1 }), /^[0-9A-Za-z]{16}$/);
  assert.equal(digest16({ a: 1 }), digest16({ a: 1 }));
  assert.notEqual(digest16({ a: 1 }), digest16({ a: 2 }));
});

test("sanitizer drops _id/ownership/flags/prototypeToken, rebuilds items, and reassigns ownership", () => {
  const request = {
    source: {
      _id: "EVIL",
      name: "Kel",
      img: "i.png",
      system: { characteristics: {} },
      prototypeToken: { actorLink: false },
      flags: { core: { sourceId: "x" }, evil: true },
      ownership: { attacker: 3 },
      items: [{ _id: "IX", name: "Blaster", type: "weapon", folder: "f", system: {}, effects: [] }],
    },
    commit: { commitId: "C1", firstAttemptAt: "2026-07-21T00:00:00.000Z", xp: { total: 100, available: 20 } },
  };
  const { source, commit: outCommit } = sanitizeCommitRequest(request, "sender7");
  assert.ok(!("_id" in source));
  assert.ok(!("flags" in source));
  assert.ok(!("prototypeToken" in source));
  assert.deepEqual(source.ownership, { sender7: 3 }); // OWNER, replaced
  assert.ok(!("_id" in source.items[0]) && !("folder" in source.items[0])); // items rebuilt via projectItemSource
  assert.equal(outCommit.userId, "sender7"); // userId comes from the authenticated sender
});

test("sanitizer clamps an over-long name", () => {
  const request = { source: { name: "x".repeat(500) }, commit: { xp: { total: 1, available: 1 } } };
  const { source } = sanitizeCommitRequest(request, "s");
  assert.equal(source.name.length, 128);
});

test("sanitizer rejects a non-finite xp", () => {
  assert.throws(() => sanitizeCommitRequest({ source: {}, commit: { xp: { total: Infinity, available: 0 } } }, "s"), InvalidCommitRequestError);
  assert.throws(() => sanitizeCommitRequest({ source: {}, commit: { xp: { total: 10 } } }, "s"), InvalidCommitRequestError);
  assert.throws(() => sanitizeCommitRequest({ source: {}, commit: {} }, "s"), InvalidCommitRequestError);
});
