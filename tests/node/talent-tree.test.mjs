/**
 * Node tests for the connected-to-root purchase rule (`canPurchaseNode`, modules/helpers/talent-tree.js).
 *
 * The rule (docs/superpowers/specs/2026-05-23-talent-tree-purchase-order-design.md): a node can be
 * bought when it is not learned and either sits in the root row or has a learned neighbour joined
 * to it by an active connector. Connectors are stored on the lower or the left node: `links-top-N`
 * joins slot N of the node to the node above, `links-right` joins it to the node on its right.
 *
 * Three kinds of tree use the rule, with the options the item sheet passes for each
 * (modules/items/item-sheet-ffg.js):
 *   - a specialization: 20 talents, one column each, row 0 is always buyable;
 *   - a Force power: 16 upgrades that can span several columns, with an implicit "basic power"
 *     above row 0 (decision R32: a row-0 upgrade needs an up-link to it, or a side or down
 *     connection, to count as rooted);
 *   - a signature ability: 8 upgrades, same multi-column and implicit-parent rules as a Force power.
 *
 * These cases moved here from the in-Foundry suite `tests/talent-tree.test.js`: the helper has no
 * Foundry dependency, so a Foundry world adds nothing. The Node wrappers the character creator puts
 * around it (`canLearn`, `rootConnectedKeys`) are in talent-paths.test.mjs.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { canPurchaseNode } from "../../modules/helpers/talent-tree.js";

const SPECIALIZATION = { prefix: "talent", width: 4, total: 20, sizeAware: false };
const FORCE_POWER = { prefix: "upgrade", width: 4, total: 16, sizeAware: true, rootHasImplicitParent: true };
const SIGNATURE_ABILITY = { prefix: "upgrade", width: 4, total: 8, sizeAware: true, rootHasImplicitParent: true };

/** A specialization tree of 20 unlearned talents, with `nodes` merged over the named ones. */
function specialization(nodes = {}) {
  const tree = {};
  for (let i = 0; i < 20; i++) tree[`talent${i}`] = { islearned: false };
  for (const [key, fields] of Object.entries(nodes)) tree[key] = { ...tree[key], ...fields };
  return tree;
}

/**
 * An upgrade tree of `total` unlearned single-width upgrades, as the item sheet prepares them
 * (`sizeInt` set), with `nodes` merged over the named ones.
 */
function upgrades(total, nodes = {}) {
  const tree = {};
  for (let i = 0; i < total; i++) tree[`upgrade${i}`] = { islearned: false, sizeInt: 1, visible: true };
  for (const [key, fields] of Object.entries(nodes)) tree[key] = { ...tree[key], ...fields };
  return tree;
}

/**
 * The same tree as stored: only the `size` string, no `sizeInt`. This is what the click-time guard
 * sees, before the sheet's data preparation has run.
 */
function storedUpgrades(total, nodes = {}) {
  const tree = {};
  for (let i = 0; i < total; i++) tree[`upgrade${i}`] = { islearned: false, size: "single", visible: true };
  for (const [key, fields] of Object.entries(nodes)) tree[key] = { ...tree[key], ...fields };
  return tree;
}

const forcePower = (nodes) => upgrades(16, nodes);
const storedForcePower = (nodes) => storedUpgrades(16, nodes);
const signatureAbility = (nodes) => upgrades(8, nodes);

// ---------------------------------------------------------------------------
// Specialization trees
// ---------------------------------------------------------------------------

for (const key of ["talent0", "talent1", "talent2", "talent3"]) {
  test(`a specialization root-row talent (${key}) with no connectors and no learned neighbours is purchasable`, () => {
    const tree = specialization();

    const result = canPurchaseNode(tree, key, SPECIALIZATION);

    assert.equal(result, true);
  });
}

test("a learned specialization root-row talent is not purchasable again", () => {
  const tree = specialization({ talent0: { islearned: true } });

  const result = canPurchaseNode(tree, "talent0", SPECIALIZATION);

  assert.equal(result, false);
});

test("a specialization talent linked up and right but with no learned neighbour is not purchasable", () => {
  const tree = specialization({ talent5: { "links-top-1": true, "links-right": true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, false);
});

test("a specialization talent linked up to a learned talent above it is purchasable", () => {
  const tree = specialization({
    talent1: { islearned: true },
    talent5: { "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, true);
});

test("a learned talent above does not unlock a talent that has no up-link", () => {
  const tree = specialization({ talent1: { islearned: true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, false);
});

test("a specialization talent is purchasable when the learned talent on its left links right", () => {
  const tree = specialization({ talent4: { islearned: true, "links-right": true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, true);
});

test("a learned talent on the left without a right link does not unlock the talent beside it", () => {
  const tree = specialization({ talent4: { islearned: true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, false);
});

test("a talent whose own right link is set is purchasable when the talent on its right is learned", () => {
  const tree = specialization({
    talent5: { "links-right": true },
    talent6: { islearned: true },
  });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, true);
});

test("a learned talent on the right does not unlock a talent whose own right link is not set", () => {
  const tree = specialization({ talent6: { islearned: true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, false);
});

test("a specialization talent is purchasable when the learned talent below it links up to it", () => {
  const tree = specialization({ talent9: { islearned: true, "links-top-1": true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, true);
});

test("a learned talent below does not unlock the talent above it when it has no up-link", () => {
  const tree = specialization({ talent9: { islearned: true } });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, false);
});

test("a learned specialization talent is not purchasable even when linked to a learned neighbour", () => {
  const tree = specialization({
    talent1: { islearned: true },
    talent5: { islearned: true, "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "talent5", SPECIALIZATION);

  assert.equal(result, false);
});

test("a rightmost-column talent's right link does not reach the first talent of the next row", () => {
  // talent7 is the last talent of row 1; index 8 is the FIRST talent of row 2, not its neighbour.
  const tree = specialization({
    talent7: { "links-right": true },
    talent8: { islearned: true },
  });

  const result = canPurchaseNode(tree, "talent7", SPECIALIZATION);

  assert.equal(result, false);
});

// ---------------------------------------------------------------------------
// Force power trees (R32: row 0 needs an up-link or a side or down connection)
// ---------------------------------------------------------------------------

for (const key of ["upgrade0", "upgrade1", "upgrade2", "upgrade3"]) {
  test(`a Force power row-0 upgrade (${key}) with no up-link and no learned neighbour is not purchasable`, () => {
    const tree = forcePower();

    const result = canPurchaseNode(tree, key, FORCE_POWER);

    assert.equal(result, false);
  });
}

test("a Force power row-0 upgrade linked up to the implicit basic power is purchasable", () => {
  const tree = forcePower({ upgrade0: { "links-top-1": true } });

  const result = canPurchaseNode(tree, "upgrade0", FORCE_POWER);

  assert.equal(result, true);
});

test("a double-wide Force power row-0 upgrade with only its second slot linked up is purchasable", () => {
  // upgrade3 is the placeholder for the second column of the double-wide upgrade2.
  const tree = forcePower({
    upgrade2: { sizeInt: 2, "links-top-2": true },
    upgrade3: { sizeInt: 1, visible: false },
  });

  const result = canPurchaseNode(tree, "upgrade2", FORCE_POWER);

  assert.equal(result, true);
});

test("a Force power row-0 upgrade without an up-link is purchasable beside a learned upgrade that links right", () => {
  const tree = forcePower({
    upgrade0: { islearned: true, "links-right": true },
    upgrade1: {},
  });

  const result = canPurchaseNode(tree, "upgrade1", FORCE_POWER);

  assert.equal(result, true);
});

test("a Force power row-0 upgrade without an up-link is purchasable above a learned upgrade that links up to it", () => {
  const tree = forcePower({ upgrade4: { islearned: true, "links-top-1": true } });

  const result = canPurchaseNode(tree, "upgrade0", FORCE_POWER);

  assert.equal(result, true);
});

test("a Force power row-0 upgrade without an up-link is not purchasable beside or above learned upgrades that do not link to it", () => {
  // upgrade0 is learned but has no right link; upgrade5 is learned but has no up-link.
  const tree = forcePower({
    upgrade0: { islearned: true },
    upgrade5: { islearned: true },
  });

  const result = canPurchaseNode(tree, "upgrade1", FORCE_POWER);

  assert.equal(result, false);
});

test("a double-wide Force power upgrade is purchasable when the learned upgrade after its two columns is linked from it", () => {
  const tree = forcePower({
    upgrade4: { sizeInt: 2, "links-right": true },
    upgrade6: { islearned: true },
  });

  const result = canPurchaseNode(tree, "upgrade4", FORCE_POWER);

  assert.equal(result, true);
});

test("a Force power upgrade finds its learned left neighbour past a placeholder to the double-wide upgrade that ends beside it", () => {
  // upgrade4 spans columns 0-1 (upgrade5 is its placeholder) and links right into upgrade6.
  const tree = forcePower({
    upgrade4: { sizeInt: 2, islearned: true, "links-right": true },
    upgrade5: { sizeInt: 0 },
    upgrade6: {},
  });

  const result = canPurchaseNode(tree, "upgrade6", FORCE_POWER);

  assert.equal(result, true);
});

test("a learned placeholder is never the left neighbour of a Force power upgrade", () => {
  const tree = forcePower({
    upgrade5: { sizeInt: 0, islearned: true, "links-right": true },
    upgrade6: {},
  });

  const result = canPurchaseNode(tree, "upgrade6", FORCE_POWER);

  assert.equal(result, false);
});

test("a double-wide Force power upgrade linked up from its second slot is purchasable when the upgrade above that slot is learned", () => {
  const tree = forcePower({
    upgrade5: { islearned: true },
    upgrade8: { sizeInt: 2, "links-top-2": true },
  });

  const result = canPurchaseNode(tree, "upgrade8", FORCE_POWER);

  assert.equal(result, true);
});

test("a double-wide Force power upgrade linked up from its second slot is not purchasable when only the upgrade above its first slot is learned", () => {
  const tree = forcePower({
    upgrade4: { islearned: true },
    upgrade8: { sizeInt: 2, "links-top-2": true },
  });

  const result = canPurchaseNode(tree, "upgrade8", FORCE_POWER);

  assert.equal(result, false);
});

test("a double-wide Force power upgrade is purchasable from the learned upgrade below when that upgrade links up from its own first slot", () => {
  // Increase Hull Trauma (upgrade8, double-wide) checks its second column. The upgrade below
  // that column is the single-width upgrade13, and its link to the parent above is stored as
  // upgrade13's OWN links-top-1: the number is the child's offset from its own left edge.
  const tree = forcePower({
    upgrade8: { sizeInt: 2 },
    upgrade9: { sizeInt: 0 },
    upgrade13: { islearned: true, "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "upgrade8", FORCE_POWER);

  assert.equal(result, true);
});

test("a single-width Force power upgrade is purchasable from a learned double-wide upgrade below, past an invisible placeholder", () => {
  // upgrade5 (column 1) looks down at the learned double-wide upgrade8 (columns 0-1), which owns
  // column 1. The invisible placeholder upgrade9 is not a cell, so the walk steps past it.
  const tree = forcePower({
    upgrade5: {},
    upgrade8: { sizeInt: 2, islearned: true, "links-top-1": true, "links-top-2": true },
    upgrade9: { sizeInt: 1, visible: false },
  });

  const result = canPurchaseNode(tree, "upgrade5", FORCE_POWER);

  assert.equal(result, true);
});

// The same rules on stored data, where only the `size` string exists (the click-time guard).

test("stored data: a double-wide Force power upgrade linked up from its second slot reads its width from the size string", () => {
  const tree = storedForcePower({
    upgrade11: { islearned: true },
    upgrade14: { size: "double", "links-top-2": true },
  });

  const result = canPurchaseNode(tree, "upgrade14", FORCE_POWER);

  assert.equal(result, true);
});

test("stored data: a double-wide Force power upgrade linked up from its first slot reads its width from the size string", () => {
  const tree = storedForcePower({
    upgrade10: { islearned: true },
    upgrade14: { size: "double", "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "upgrade14", FORCE_POWER);

  assert.equal(result, true);
});

test("stored data: an up-link walks past a placeholder to the learned multi-column upgrade that owns the column", () => {
  // upgrade3 has no recognised size, so it counts as a placeholder and the walk continues to the
  // double-wide upgrade2.
  const tree = storedForcePower({
    upgrade2: { size: "double", islearned: true },
    upgrade3: { size: "" },
    upgrade7: { "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "upgrade7", FORCE_POWER);

  assert.equal(result, true);
});

test("stored data: a double-wide upgrade is purchasable from the learned upgrade below that links up from its own first slot", () => {
  const tree = storedForcePower({
    upgrade8: { size: "double" },
    upgrade9: { size: "single", visible: false },
    upgrade13: { islearned: true, "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "upgrade8", FORCE_POWER);

  assert.equal(result, true);
});

test("stored data: a single-width upgrade is purchasable from a learned double-wide upgrade below, past an invisible placeholder", () => {
  const tree = storedForcePower({
    upgrade5: {},
    upgrade8: { size: "double", islearned: true, "links-top-1": true, "links-top-2": true },
    upgrade9: { size: "single", visible: false },
  });

  const result = canPurchaseNode(tree, "upgrade5", FORCE_POWER);

  assert.equal(result, true);
});

// ---------------------------------------------------------------------------
// Signature ability trees (same implicit-parent rule as a Force power; no earlier case)
// ---------------------------------------------------------------------------

for (const key of ["upgrade0", "upgrade1", "upgrade2", "upgrade3"]) {
  test(`a signature ability row-0 upgrade (${key}) with no up-link and no learned neighbour is not purchasable`, () => {
    const tree = signatureAbility();

    const result = canPurchaseNode(tree, key, SIGNATURE_ABILITY);

    assert.equal(result, false);
  });
}

test("a signature ability row-0 upgrade linked up to the implicit base ability is purchasable", () => {
  const tree = signatureAbility({ upgrade0: { "links-top-1": true } });

  const result = canPurchaseNode(tree, "upgrade0", SIGNATURE_ABILITY);

  assert.equal(result, true);
});

test("a signature ability row-0 upgrade without an up-link is purchasable beside a learned upgrade that links right", () => {
  const tree = signatureAbility({
    upgrade0: { islearned: true, "links-right": true },
    upgrade1: {},
  });

  const result = canPurchaseNode(tree, "upgrade1", SIGNATURE_ABILITY);

  assert.equal(result, true);
});

test("a signature ability row-0 upgrade without an up-link is purchasable above a learned upgrade that links up to it", () => {
  const tree = signatureAbility({ upgrade4: { islearned: true, "links-top-1": true } });

  const result = canPurchaseNode(tree, "upgrade0", SIGNATURE_ABILITY);

  assert.equal(result, true);
});

test("the implicit base ability does not root a signature ability row-1 upgrade", () => {
  // upgrade4's link goes up to upgrade0, which is not learned. Only row 0 touches the base ability.
  const tree = signatureAbility({ upgrade4: { "links-top-1": true } });

  const result = canPurchaseNode(tree, "upgrade4", SIGNATURE_ABILITY);

  assert.equal(result, false);
});

test("a signature ability row-1 upgrade linked up to a learned row-0 upgrade is purchasable", () => {
  const tree = signatureAbility({
    upgrade0: { islearned: true },
    upgrade4: { "links-top-1": true },
  });

  const result = canPurchaseNode(tree, "upgrade4", SIGNATURE_ABILITY);

  assert.equal(result, true);
});

test("a learned signature ability upgrade is not purchasable even when linked up to the base ability", () => {
  const tree = signatureAbility({ upgrade0: { islearned: true, "links-top-1": true } });

  const result = canPurchaseNode(tree, "upgrade0", SIGNATURE_ABILITY);

  assert.equal(result, false);
});
