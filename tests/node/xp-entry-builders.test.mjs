/**
 * Node tests for the pure XP-log entry builders (Stage 4, DEV-14).
 *
 * The module imports nothing and touches no globals; the stub is imported only to
 * keep every Node test file uniform.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { buildXpSpendEntry, buildXpEarnEntry } from "../../modules/helpers/xp-entry-builders.js";

test("buildXpSpendEntry: action is always the literal 'purchased'", () => {
  const entry = buildXpSpendEntry({
    description: "skill rank Astrogation 1 --> 2",
    cost: 10,
    available: 40,
    total: 100,
    statusId: "ae123",
    date: "2026-07-21",
  });
  assert.equal(entry.action, "purchased");
});

test("buildXpSpendEntry: the description lands in .description (not in .action)", () => {
  const entry = buildXpSpendEntry({
    description: "bought Grit",
    cost: 5,
    available: 20,
    total: 50,
    date: "2026-07-21",
  });
  assert.equal(entry.description, "bought Grit");
  assert.notEqual(entry.action, "bought Grit");
});

test("buildXpSpendEntry: shape — id, xp{cost,available,total}, date", () => {
  const entry = buildXpSpendEntry({
    description: "d",
    cost: 5,
    available: 20,
    total: 50,
    statusId: "ae9",
    date: "2026-07-21",
  });
  assert.deepEqual(entry, {
    action: "purchased",
    id: "ae9",
    xp: { cost: 5, available: 20, total: 50 },
    date: "2026-07-21",
    description: "d",
  });
});

test("buildXpSpendEntry: statusId defaults to undefined when omitted", () => {
  const entry = buildXpSpendEntry({ description: "d", cost: 1, available: 2, total: 3, date: "2026-07-21" });
  assert.equal(entry.id, undefined);
});

test("buildXpEarnEntry: the grant is stored under xp.cost", () => {
  const entry = buildXpEarnEntry({
    grant: 25,
    available: 25,
    total: 25,
    note: "starting XP",
    date: "2026-07-21",
  });
  assert.equal(entry.xp.cost, 25);
});

test("buildXpEarnEntry: granter 'GM' maps to action 'granted'", () => {
  const entry = buildXpEarnEntry({
    grant: 10,
    available: 10,
    total: 10,
    note: "n",
    date: "2026-07-21",
    granter: "GM",
  });
  assert.equal(entry.action, "granted");
});

test("buildXpEarnEntry: granter defaults to 'GM' -> 'granted'", () => {
  const entry = buildXpEarnEntry({ grant: 10, available: 10, total: 10, note: "n", date: "2026-07-21" });
  assert.equal(entry.action, "granted");
});

test("buildXpEarnEntry: a non-GM granter maps to action 'adjusted'", () => {
  const entry = buildXpEarnEntry({
    grant: 10,
    available: 10,
    total: 10,
    note: "n",
    date: "2026-07-21",
    granter: "player",
  });
  assert.equal(entry.action, "adjusted");
});

test("buildXpEarnEntry: note lands in .description", () => {
  const entry = buildXpEarnEntry({ grant: 3, available: 3, total: 3, note: "species grant", date: "2026-07-21" });
  assert.equal(entry.description, "species grant");
});

test("the builders are referentially pure — same input yields equal output, no shared state", () => {
  const spendArgs = { description: "d", cost: 5, available: 20, total: 50, statusId: "x", date: "2026-07-21" };
  assert.deepEqual(buildXpSpendEntry(spendArgs), buildXpSpendEntry(spendArgs));

  const earnArgs = { grant: 7, available: 7, total: 7, note: "n", date: "2026-07-21", granter: "GM" };
  assert.deepEqual(buildXpEarnEntry(earnArgs), buildXpEarnEntry(earnArgs));

  // the argument object is not mutated
  assert.deepEqual(spendArgs, { description: "d", cost: 5, available: 20, total: 50, statusId: "x", date: "2026-07-21" });
  assert.deepEqual(earnArgs, { grant: 7, available: 7, total: 7, note: "n", date: "2026-07-21", granter: "GM" });

  // distinct calls return independent objects (no shared nested references)
  const a = buildXpSpendEntry(spendArgs);
  const b = buildXpSpendEntry(spendArgs);
  assert.notEqual(a, b);
  assert.notEqual(a.xp, b.xp);
});
