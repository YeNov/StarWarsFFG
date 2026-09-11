/**
 * The d100 trigger tables in the Group Manager's Obligation and Duty sections.
 *
 * Each character's entries take consecutive slices of 1-100 sized by magnitude, and
 * the d100 result names whoever's slice it lands in. The window used to build these
 * by pushing into arrays on the window instance that were only ever emptied in the
 * constructor -- and it re-renders on every actor update. So each render appended
 * another copy of every entry, and once the party changed, entries for characters no
 * longer in the group stayed behind and could still be named by the roll.
 *
 * The builder is pure, so each render starts from nothing but the characters it is
 * given. These tests pin that, along with the numbering the rolls depend on.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildRangeTable } from "../../modules/helpers/obligation-duty-table.js";

// Magnitudes are strings here because that is how the actor sheet stores them.
const character = (id, name, obligationlist = {}) => ({ id, name, system: { obligationlist } });
const ranges = (table) => table.map((e) => `${e.name} ${e.rangeStart}-${e.rangeEnd}`);

test("entries are numbered from 1 and carry what the table and the roll read", () => {
  const dax = character("dax", "Dax", { a: { type: "Debt", magnitude: "10" } });

  assert.deepEqual(buildRangeTable([dax], "obligationlist"), [
    { playerId: "dax", name: "Dax", type: "Debt", magnitude: "10", rangeStart: 1, rangeEnd: 10 },
  ]);
});

test("each character's slice starts where the previous one ended", () => {
  const dax = character("dax", "Dax", { a: { type: "Debt", magnitude: "10" } });
  const vex = character("vex", "Vex", { b: { type: "Bounty", magnitude: "5" } });

  assert.deepEqual(ranges(buildRangeTable([dax, vex], "obligationlist")), ["Dax 1-10", "Vex 11-15"]);
});

test("a character's several entries sit back to back", () => {
  const dax = character("dax", "Dax", {
    a: { type: "Debt", magnitude: "10" },
    b: { type: "Addiction", magnitude: "5" },
  });

  assert.deepEqual(ranges(buildRangeTable([dax], "obligationlist")), ["Dax 1-10", "Dax 11-15"]);
});

test("a character with no entries takes no slice and shifts nobody", () => {
  const dax = character("dax", "Dax", { a: { type: "Debt", magnitude: "10" } });
  const bare = { id: "bare", name: "Bare", system: {} };
  const vex = character("vex", "Vex", { b: { type: "Bounty", magnitude: "5" } });

  assert.deepEqual(ranges(buildRangeTable([dax, bare, vex], "obligationlist")), ["Dax 1-10", "Vex 11-15"]);
});

test("building the table again gives the same table, not a longer one", () => {
  const dax = character("dax", "Dax", { a: { type: "Debt", magnitude: "10" } });

  buildRangeTable([dax], "obligationlist");
  buildRangeTable([dax], "obligationlist");

  assert.deepEqual(ranges(buildRangeTable([dax], "obligationlist")), ["Dax 1-10"]);
});

test("a character who has left the group leaves nothing behind in the next table", () => {
  const dax = character("dax", "Dax", { a: { type: "Debt", magnitude: "10" } });
  const vex = character("vex", "Vex", { b: { type: "Bounty", magnitude: "10" } });

  buildRangeTable([dax, vex], "obligationlist");

  assert.deepEqual(ranges(buildRangeTable([dax], "obligationlist")), ["Dax 1-10"]);
});

test("an empty entry is skipped rather than failing the whole table", () => {
  const dax = character("dax", "Dax", { a: null, b: { type: "Debt", magnitude: "10" } });

  assert.deepEqual(ranges(buildRangeTable([dax], "obligationlist")), ["Dax 1-10"]);
});
