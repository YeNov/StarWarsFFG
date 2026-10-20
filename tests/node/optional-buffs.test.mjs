import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  addBuff,
  addBuffRow,
  buffModifierTypes,
  cleanBuffs,
  newBuff,
  removeBuff,
  removeBuffRow,
  renameBuff,
  setBuffRow,
} from "../../modules/helpers/optional-buffs.js";

/**
 * The optional buff list as the item sheets edit it: which row types a buff may hold, what a new
 * buff and row look like, the edits, and how stored data is read back.
 */

test("only row types a buff can hold are offered in its picker", () => {
  const all = {
    Stat: { value: "Stat" },
    "Skill Boost": { value: "Skill Boost" },
    "Roll Modifiers": { value: "Roll Modifiers" },
    "Career Skill": { value: "Career Skill" },
  };

  assert.deepEqual(Object.keys(buffModifierTypes(all)), ["Skill Boost", "Roll Modifiers"]);
});

test("a new buff has an id, no name and no rows", () => {
  const b = newBuff();

  assert.equal(typeof b.id, "string");
  assert.ok(b.id.length > 0);
  assert.deepEqual({ name: b.name, rows: b.rows }, { name: "", rows: [] });
});

test("a new row starts as one Add Boost", () => {
  const [b] = addBuff([]);

  assert.deepEqual(addBuffRow([b], b.id)[0].rows, [{ modtype: "Roll Modifiers", mod: "Add Boost", value: 1 }]);
});

test("editing returns a new list and leaves the old one as it was", () => {
  const before = [{ id: "a", name: "Hutt contacts", rows: [] }];
  const snapshot = structuredClone(before);

  renameBuff(before, "a", "Changed");
  addBuffRow(before, "a");
  removeBuff(before, "a");

  assert.deepEqual(before, snapshot);
});

test("rename, remove and row edits touch only their target", () => {
  const list = [
    { id: "a", name: "A", rows: [
      { modtype: "Skill Boost", mod: "Charm", value: 1 },
      { modtype: "Skill Setback", mod: "Charm", value: 1 },
    ] },
    { id: "b", name: "B", rows: [] },
  ];

  assert.deepEqual(renameBuff(list, "a", "Hood up").map((b) => b.name), ["Hood up", "B"]);
  assert.deepEqual(removeBuff(list, "a").map((b) => b.id), ["b"]);
  assert.deepEqual(removeBuffRow(list, "a", 0)[0].rows, [{ modtype: "Skill Setback", mod: "Charm", value: 1 }]);
  assert.deepEqual(setBuffRow(list, "a", 1, { mod: "Deception" })[0].rows[1],
    { modtype: "Skill Setback", mod: "Deception", value: 1 });
});

test("a row's value is kept a whole number", () => {
  const list = [{ id: "a", name: "", rows: [{ modtype: "Skill Boost", mod: "Charm", value: 1 }] }];

  assert.equal(setBuffRow(list, "a", 0, { value: "2" })[0].rows[0].value, 2);
  assert.equal(setBuffRow(list, "a", 0, { value: "abc" })[0].rows[0].value, 0);
});

test("stored data that a buff can't hold is dropped, not thrown on", () => {
  assert.deepEqual(cleanBuffs(undefined), []);
  assert.deepEqual(cleanBuffs({ not: "an array" }), []);

  const [b] = cleanBuffs([{ name: 7, rows: [
    { modtype: "Stat", mod: "Wounds", value: 1 },
    { modtype: "Skill Boost", mod: "Charm", value: "1" },
    null,
  ] }, "junk"]);

  assert.equal(typeof b.id, "string");
  assert.equal(b.name, "");
  assert.deepEqual(b.rows, [{ modtype: "Skill Boost", mod: "Charm", value: 1 }]);
});

test("a buff stored without an id keeps the same id on every read, so edits can find it", () => {
  const stored = [{ name: "Imported", rows: [] }];
  const { id } = cleanBuffs(stored)[0];

  assert.equal(cleanBuffs(stored)[0].id, id);
  assert.deepEqual(renameBuff(stored, id, "Renamed").map((b) => b.name), ["Renamed"]);
});
