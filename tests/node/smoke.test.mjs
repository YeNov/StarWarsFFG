/**
 * Trivial smoke test so `npm test` has a non-empty suite from Stage 1 onward (plan §2).
 *
 * GATE-NODE's pass condition is absolute — every test passes, zero failures, zero unexpected
 * skips — so the tier must never be empty in a way that lets a green run mean nothing.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";

test("the Node test tier runs", () => {
  assert.equal(1 + 1, 2);
});

test("the foundry stub is loadable and provides foundry.utils.randomID", () => {
  const id = globalThis.foundry.utils.randomID(16);
  assert.match(id, /^[a-zA-Z0-9]{16}$/);
});
