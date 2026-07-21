/**
 * Node tests for D9 / R7-2 policy (Stage 14). Covers R7-2 cases 1-5, 7, 8; case 6
 * (GM connect with no intervening render) is a live Stage-23 check.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  startDedupKey,
  finishDedupKey,
  claimOnce,
  shouldAcceptAck,
  shouldEmitStart,
  setPending,
  clearPending,
} from "../../modules/char-creator/notify-policy.js";
import { START_NOTICE_SPACING_MS } from "../../modules/char-creator/constants.js";

const base = { requesterId: "me", sessionNoticeId: "S1", senderIsGM: true, currentUserId: "me" };
function pendingWith(...ids) {
  const map = new Map();
  for (const id of ids) map.set(id, {});
  return map;
}

test("R7-2 case 4: ACK accepted only when requester + GM sender + pending all hold", () => {
  assert.equal(shouldAcceptAck({ ...base, pending: pendingWith("S1") }), true);
});

test("R7-2 case 1: ACK rejected for the WRONG requesterId", () => {
  assert.equal(shouldAcceptAck({ ...base, requesterId: "someoneElse", pending: pendingWith("S1") }), false);
});

test("R7-2 case 2: ACK rejected when the sender is NOT a GM", () => {
  assert.equal(shouldAcceptAck({ ...base, senderIsGM: false, pending: pendingWith("S1") }), false);
});

test("R7-2 case 3: ACK rejected for an unknown / non-pending session", () => {
  assert.equal(shouldAcceptAck({ ...base, pending: pendingWith("OTHER") }), false);
  assert.equal(shouldAcceptAck({ ...base, pending: new Map() }), false);
});

test("GM-side de-dup: a (sender, session) start is processed once", () => {
  const seen = new Set();
  assert.equal(claimOnce(seen, startDedupKey("p1", "S1")), true);
  assert.equal(claimOnce(seen, startDedupKey("p1", "S1")), false);
  // a different player or session is a different key
  assert.equal(claimOnce(seen, startDedupKey("p2", "S1")), true);
  assert.equal(claimOnce(seen, startDedupKey("p1", "S2")), true);
});

test("finish de-dup keys on (sender, commitId)", () => {
  const seen = new Set();
  assert.equal(claimOnce(seen, finishDedupKey("p1", "C1")), true);
  assert.equal(claimOnce(seen, finishDedupKey("p1", "C1")), false);
  assert.equal(claimOnce(seen, finishDedupKey("p1", "C2")), true);
});

test("two concurrent players: accepting player A's ACK does not affect player B", () => {
  const pending = pendingWith("A", "B");
  clearPending(pending, "A"); // A's ACK accepted
  assert.equal(pending.has("A"), false);
  assert.equal(pending.has("B"), true);
});

test("close-while-pending: clearing the entry leaves the map empty (no leak)", () => {
  const pending = pendingWith("S1");
  clearPending(pending, "S1");
  assert.equal(pending.size, 0);
});

test("R7-2 case 8 — lost-ACK failover: a second GM can re-process and its ACK is accepted", () => {
  // GM1 and GM2 each de-dup on their own sender id, so the failover GM processes anew
  const gm1Seen = new Set();
  const gm2Seen = new Set();
  assert.equal(claimOnce(gm1Seen, startDedupKey("gm1", "S1")), true);
  assert.equal(claimOnce(gm2Seen, startDedupKey("gm2", "S1")), true);
  // GM1's ACK was lost; the session is still pending, so GM2's ACK is accepted
  const pending = pendingWith("S1");
  assert.equal(shouldAcceptAck({ ...base, senderIsGM: true, pending }), true);
});

test("shouldEmitStart: render triggers", () => {
  const now = 1_000_000;
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: false, lastEmitAt: null, now }), true); // first render always
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: true, lastEmitAt: now - START_NOTICE_SPACING_MS, now }), true);
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: true, lastEmitAt: now - 1000, now }), false); // too soon
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: false, lastEmitAt: now - START_NOTICE_SPACING_MS, now }), false); // no GM
});

test("shouldEmitStart: gmConnect + preCommit + non-pending", () => {
  assert.equal(shouldEmitStart({ state: "pending", reason: "gmConnect", hasActiveGM: true, lastEmitAt: 0, now: 0 }), true);
  assert.equal(shouldEmitStart({ state: "pending", reason: "gmConnect", hasActiveGM: false, lastEmitAt: 0, now: 0 }), false);
  assert.equal(shouldEmitStart({ state: "pending", reason: "preCommit", hasActiveGM: false, lastEmitAt: 0, now: 0 }), true); // unconditional
  assert.equal(shouldEmitStart({ state: "delivered", reason: "preCommit", hasActiveGM: true, lastEmitAt: null, now: 0 }), false); // not pending
});

test("setPending adds an entry", () => {
  const pending = new Map();
  setPending(pending, "S1", { commitId: "C1" });
  assert.deepEqual(pending.get("S1"), { commitId: "C1" });
});
