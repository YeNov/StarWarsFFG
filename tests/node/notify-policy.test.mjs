/**
 * Node tests for D9 / R7-2 policy (Stage 14). Covers R7-2 cases 1-5, 7 and the de-dup half of 8; case 6
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
  shouldAcceptCommitResponse,
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

test("an ACK is accepted when it names this requester, comes from a GM and matches a pending session", () => {
  assert.equal(shouldAcceptAck({ ...base, pending: pendingWith("S1") }), true);
});

test("an ACK that names a different requester is rejected", () => {
  assert.equal(shouldAcceptAck({ ...base, requesterId: "someoneElse", pending: pendingWith("S1") }), false);
});

test("an ACK from a non-GM sender is rejected", () => {
  assert.equal(shouldAcceptAck({ ...base, senderIsGM: false, pending: pendingWith("S1") }), false);
});

test("an ACK for an unknown session, or with nothing pending, is rejected", () => {
  assert.equal(shouldAcceptAck({ ...base, pending: pendingWith("OTHER") }), false);
  assert.equal(shouldAcceptAck({ ...base, pending: new Map() }), false);
});

// R7-2 case 8 (lost-ACK failover) rests on this: the key carries the authenticated sender, so a
// second GM that receives the same session's notice processes it anew and its ACK is accepted
// (the ACK itself is the first case above). A real failover needs two GM sessions: G09.
test("a start notice is processed once per sender and session, and another sender's or another session's is processed anew", () => {
  const seen = new Set();
  assert.equal(claimOnce(seen, startDedupKey("p1", "S1")), true);
  assert.equal(claimOnce(seen, startDedupKey("p1", "S1")), false);
  // a different sender or session is a different key
  assert.equal(claimOnce(seen, startDedupKey("p2", "S1")), true);
  assert.equal(claimOnce(seen, startDedupKey("p1", "S2")), true);
});

test("finish de-dup keys on (sender, commitId)", () => {
  const seen = new Set();
  assert.equal(claimOnce(seen, finishDedupKey("p1", "C1")), true);
  assert.equal(claimOnce(seen, finishDedupKey("p1", "C1")), false);
  assert.equal(claimOnce(seen, finishDedupKey("p1", "C2")), true);
});

test("setPending records a session, and clearing it removes only that session and leaves nothing behind", () => {
  const pending = new Map();
  setPending(pending, "A", { commitId: "C1" });
  setPending(pending, "B", { commitId: "C2" });
  assert.deepEqual(pending.get("A"), { commitId: "C1" });

  clearPending(pending, "A"); // player A's ACK accepted, or A closed the wizard while pending
  assert.equal(pending.has("A"), false);
  assert.equal(pending.has("B"), true);

  clearPending(pending, "B");
  assert.equal(pending.size, 0);
});

test("a render start notice is sent the first time, then only with an active GM once the spacing interval has passed", () => {
  const now = 1_000_000;
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: false, lastEmitAt: null, now }), true); // first render always
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: true, lastEmitAt: now - START_NOTICE_SPACING_MS, now }), true);
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: true, lastEmitAt: now - 1000, now }), false); // too soon
  assert.equal(shouldEmitStart({ state: "pending", reason: "render", hasActiveGM: false, lastEmitAt: now - START_NOTICE_SPACING_MS, now }), false); // no GM
});

test("a GM-connect start notice needs an active GM, a pre-commit one is always sent, and a session that is not pending sends none", () => {
  assert.equal(shouldEmitStart({ state: "pending", reason: "gmConnect", hasActiveGM: true, lastEmitAt: 0, now: 0 }), true);
  assert.equal(shouldEmitStart({ state: "pending", reason: "gmConnect", hasActiveGM: false, lastEmitAt: 0, now: 0 }), false);
  assert.equal(shouldEmitStart({ state: "pending", reason: "preCommit", hasActiveGM: false, lastEmitAt: 0, now: 0 }), true); // unconditional
  assert.equal(shouldEmitStart({ state: "delivered", reason: "preCommit", hasActiveGM: true, lastEmitAt: null, now: 0 }), false); // not pending
});

test("commit response is accepted only from a GM for this requester and pending commit", () => {
  const pending = new Map([["S1", { commitId: "C1" }]]);
  const args = { requesterId: "me", commitId: "C1", senderIsGM: true, currentUserId: "me", pending };
  assert.equal(shouldAcceptCommitResponse(args), true);
  assert.equal(shouldAcceptCommitResponse({ ...args, requesterId: "other" }), false);
  assert.equal(shouldAcceptCommitResponse({ ...args, senderIsGM: false }), false);
  assert.equal(shouldAcceptCommitResponse({ ...args, commitId: "C2" }), false);
  assert.equal(shouldAcceptCommitResponse({ ...args, pending: new Map() }), false);
});
