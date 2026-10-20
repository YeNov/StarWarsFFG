/**
 * Node tests for the character creator's talent-path rules (modules/char-creator/talent-selection.js):
 *
 *   - `canLearn(talents, learned, key)`: may the wizard buy this talent now?
 *   - `rootConnectedKeys(talents, learned)`: which learned talents still have a path to the root
 *     row? When the wizard unlearns a talent it keeps only this set, so anything the removal cut
 *     off is dropped (and refunded) with it.
 *
 * The rule is the specialization connected-to-root rule (docs/superpowers/specs/
 * 2026-05-23-talent-tree-purchase-order-design.md): the root row is always buyable; any other talent
 * needs a learned neighbour joined to it by a connector. Connectors are stored on the lower or the
 * left talent: `links-top-1` joins a talent to the one above, `links-right` joins it to the next one
 * in its row. Force power and signature ability trees do not use these two functions; their rule
 * (`canPurchaseNode` with an implicit parent above row 0) is in talent-tree.test.mjs.
 *
 * Doing the unlearn through the wizard's own action (removal, refund, the rest of the build) is
 * covered in Foundry, not here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { canLearn, rootConnectedKeys } from "../../modules/char-creator/talent-selection.js";

/**
 * A three-row specialization grid. Connectors:
 *
 *   row 0   t0      t1      t2      t3       root row: buyable with nothing learned
 *           |       |                |
 *   row 1   t4 ---- t5      t6      t7       t4 up to t0 and right to t5; t5 up to t1;
 *                   |                |       t7 up to t3; t6 has no connector
 *   row 2   t8      t9      t10     t11      t9 up to t5; t11 up to t7; t8 and t10 have none
 *
 * Every talent starts unlearned; the learned state of a case is the Set passed alongside.
 */
function grid() {
  return {
    talent0: { name: "Root A" },
    talent1: { name: "Root B" },
    talent2: { name: "Root C" },
    talent3: { name: "Root D" },
    talent4: { name: "Left branch", "links-top-1": true, "links-right": true },
    talent5: { name: "Middle branch", "links-top-1": true },
    talent6: { name: "Unconnected" },
    talent7: { name: "Right branch", "links-top-1": true },
    talent8: { name: "Unconnected below" },
    talent9: { name: "Middle leaf", "links-top-1": true },
    talent10: { name: "Unconnected leaf" },
    talent11: { name: "Right leaf", "links-top-1": true },
  };
}

const learned = (...keys) => new Set(keys.map((n) => `talent${n}`));

/** A result Set as an array of talent numbers, ascending, so a case compares plain values. */
const numbers = (set) => [...set].map((key) => Number(key.slice(6))).sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// canLearn
// ---------------------------------------------------------------------------

for (const key of ["talent0", "talent1", "talent2", "talent3"]) {
  test(`canLearn allows the root-row talent ${key} when nothing is learned`, () => {
    const talents = grid();

    const result = canLearn(talents, learned(), key);

    assert.equal(result, true);
  });
}

test("canLearn allows a root-row talent even when its learned neighbours are not connected to it", () => {
  const talents = grid();

  const result = canLearn(talents, learned(0, 1), "talent2");

  assert.equal(result, true);
});

test("canLearn allows a talent whose up-link leads to a learned talent", () => {
  const talents = grid();

  const result = canLearn(talents, learned(0), "talent4");

  assert.equal(result, true);
});

test("canLearn allows a talent beside a learned talent that links right to it", () => {
  // talent5 is reached through talent4's right link; its own up-link leads to talent1, not learned.
  const talents = grid();

  const result = canLearn(talents, learned(0, 4), "talent5");

  assert.equal(result, true);
});

test("canLearn allows a talent whose own right link leads to a learned talent", () => {
  // talent4 links right to talent5, which is learned (through talent1 above it). talent4's own
  // up-link leads to talent0, which is not learned, so only the right link opens it.
  const talents = grid();

  const result = canLearn(talents, learned(1, 5), "talent4");

  assert.equal(result, true);
});

test("canLearn refuses a talent whose connector leads to an unlearned talent", () => {
  // talent4 is linked up to talent0, but talent0 is not learned.
  const talents = grid();

  const result = canLearn(talents, learned(), "talent4");

  assert.equal(result, false);
});

test("canLearn refuses a talent that skips a row of the path", () => {
  // talent9 is linked up to talent5; talent5 is not learned, only talent0 and talent4 are.
  const talents = grid();

  const result = canLearn(talents, learned(0, 4), "talent9");

  assert.equal(result, false);
});

for (const key of ["talent6", "talent8", "talent10"]) {
  test(`canLearn refuses the unconnected talent ${key} even beside learned talents`, () => {
    // A learned talent sits beside each of these three, but no connector joins it to the talent.
    const talents = grid();

    const result = canLearn(talents, learned(0, 4, 5, 9), key);

    assert.equal(result, false);
  });
}

test("canLearn refuses a root-row talent that is already learned", () => {
  const talents = grid();

  const result = canLearn(talents, learned(0), "talent0");

  assert.equal(result, false);
});

test("canLearn refuses a connected talent that is already learned", () => {
  const talents = grid();

  const result = canLearn(talents, learned(0, 4), "talent4");

  assert.equal(result, false);
});

test("canLearn refuses a key that is not a talent of the tree", () => {
  const talents = grid();

  const result = canLearn(talents, learned(0, 1, 2, 3), "talent12");

  assert.equal(result, false);
});

test("canLearn does not refuse a talent because the snapshot flags it islearned", () => {
  // A snapshot can carry islearned flags. Learned state lives only in the wizard's purchases, so
  // a flag on talent0 must not block buying it.
  const talents = grid();
  talents.talent0.islearned = true;

  const result = canLearn(talents, learned(), "talent0");

  assert.equal(result, true);
});

test("canLearn does not open a talent because the snapshot flags its neighbour islearned", () => {
  // talent0 is flagged learned in the snapshot but is not in the learned set, so talent4 below it
  // stays closed.
  const talents = grid();
  talents.talent0.islearned = true;

  const result = canLearn(talents, learned(), "talent4");

  assert.equal(result, false);
});

test("canLearn does not write learned state onto the talents it is given", () => {
  const talents = grid();
  const before = JSON.stringify(talents);

  canLearn(talents, learned(0, 4), "talent5");

  assert.equal(JSON.stringify(talents), before);
});

// ---------------------------------------------------------------------------
// rootConnectedKeys
// ---------------------------------------------------------------------------

test("rootConnectedKeys is empty when nothing is learned", () => {
  const talents = grid();

  const result = rootConnectedKeys(talents, learned());

  assert.deepEqual(numbers(result), []);
});

test("rootConnectedKeys keeps a root-row purchase that stands alone", () => {
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(2));

  assert.deepEqual(numbers(result), [2]);
});

test("rootConnectedKeys keeps every talent of a chain that reaches the root row", () => {
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(0, 4, 5, 9));

  assert.deepEqual(numbers(result), [0, 4, 5, 9]);
});

test("rootConnectedKeys returns a Set the wizard can ask about a purchase key", () => {
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(2));

  assert.ok(result instanceof Set);
  assert.equal(result.has("talent2"), true);
  assert.equal(result.has("talent3"), false);
});

test("rootConnectedKeys drops a purchase with no path to the root row", () => {
  // talent4 is learned but talent0 above it is not.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(4));

  assert.deepEqual(numbers(result), []);
});

test("rootConnectedKeys drops a whole detached branch", () => {
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(5, 9, 7, 11));

  assert.deepEqual(numbers(result), []);
});

test("rootConnectedKeys drops the talents below a talent whose removal cut their only path", () => {
  // The wizard removes talent4 from {0, 4, 5, 9} first: talent5 then reaches no learned talent
  // (its up-link leads to the unlearned talent1) and talent9 hangs off talent5.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(0, 5, 9));

  assert.deepEqual(numbers(result), [0]);
});

test("rootConnectedKeys keeps a talent that still has another learned path to the root row", () => {
  // talent5 is reached through talent4's right link AND its own up-link to talent1. With talent4
  // removed, the up-link keeps talent5 and talent9 connected.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(0, 1, 5, 9));

  assert.deepEqual(numbers(result), [0, 1, 5, 9]);
});

test("rootConnectedKeys leaves an unrelated branch intact when another branch is cut", () => {
  // Left branch {0, 5, 9} lost talent4; the right branch {3, 7, 11} is separate and complete.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(0, 5, 9, 3, 7, 11));

  assert.deepEqual(numbers(result), [0, 3, 7, 11]);
});

test("rootConnectedKeys drops a branch when its root-row talent is removed and leaves the other branch", () => {
  // talent3 was removed from {0, 4, 5, 9, 3, 7, 11}: talent7 and talent11 lose their path.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(0, 4, 5, 9, 7, 11));

  assert.deepEqual(numbers(result), [0, 4, 5, 9]);
});

test("rootConnectedKeys keeps a talent through its own right link to a learned talent", () => {
  // talent4 reaches no learned talent above it (talent0 is not learned); it is kept because it
  // links right to talent5, which is connected to the root row through talent1.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(1, 5, 4));

  assert.deepEqual(numbers(result), [1, 4, 5]);
});

test("rootConnectedKeys drops a purchase whose talent is not in the tree and keeps the rest", () => {
  // A resumed draft can hold a purchase for a talent the specialization no longer has. The grid
  // has talent0 to talent11, so talent12 is stale; it sits between two connected purchases.
  const talents = grid();

  const result = rootConnectedKeys(talents, new Set(["talent0", "talent12", "talent4"]));

  assert.deepEqual(numbers(result), [0, 4]);
});

test("rootConnectedKeys is empty when every purchase is for a talent that is not in the tree", () => {
  const talents = grid();

  const result = rootConnectedKeys(talents, new Set(["talent12", "talent30"]));

  assert.deepEqual(numbers(result), []);
});

test("rootConnectedKeys gives the same result whatever order the purchases are listed in", () => {
  // The deepest talent comes first in the set and the root-row talent last.
  const talents = grid();

  const result = rootConnectedKeys(talents, learned(9, 5, 4, 0));

  assert.deepEqual(numbers(result), [0, 4, 5, 9]);
});

test("rootConnectedKeys takes what is learned from the learned set, not from islearned flags stored on the talents", () => {
  // Every talent is flagged learned in the snapshot; only talent4 is in the learned set, and
  // nothing in the set reaches the root row.
  const talents = grid();
  for (const talent of Object.values(talents)) talent.islearned = true;

  const result = rootConnectedKeys(talents, learned(4));

  assert.deepEqual(numbers(result), []);
});

test("rootConnectedKeys does not change the learned set it is given", () => {
  const talents = grid();
  const purchases = learned(0, 5, 9);

  rootConnectedKeys(talents, purchases);

  assert.deepEqual(numbers(purchases), [0, 5, 9]);
});
