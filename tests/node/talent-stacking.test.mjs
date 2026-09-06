/**
 * Talents stack as ranks on one item, never as duplicate items.
 * See docs/superpowers/specs/2026-09-06-talent-rank-merging-design.md.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  talentName,
  talentRanks,
  planTalentGrant,
  collapseTalentBatch,
  planTalentRevoke,
  planDuplicateRepair,
  groupTalentsByName,
} from "../../modules/helpers/talent-stacking.js";

/** A talent as it appears on an actor (document-like) or in create data. */
const talent = (name, { id = null, ranked = true, current = 1, tier = 1, flags } = {}) => ({
  _id: id,
  id,
  name,
  type: "talent",
  system: { ranks: { ranked, current }, tier },
  flags: flags ?? {},
});

test("a talent's rank floors at 1 when it is null, missing or unparseable", () => {
  assert.equal(talentRanks(talent("Grit", { current: 3 })), 3);
  assert.equal(talentRanks(talent("Grit", { current: null })), 1);
  assert.equal(talentRanks(talent("Grit", { current: "x" })), 1);
  assert.equal(talentRanks({ name: "Grit", type: "talent", system: {} }), 1);
});

test("names are compared trimmed and case-sensitively", () => {
  assert.equal(talentName("  Grit "), "Grit");
  assert.equal(talentName(42), "");
  const plan = planTalentGrant([talent("Grit", { id: "a" })], talent(" Grit "));
  assert.equal(plan.action, "increment");
  assert.equal(planTalentGrant([talent("Grit", { id: "a" })], talent("grit")).action, "create");
});

test("a talent the actor does not have is created", () => {
  assert.deepEqual(planTalentGrant([talent("Grit", { id: "a" })], talent("Dedication")), { action: "create" });
  assert.deepEqual(planTalentGrant([], talent("Grit")), { action: "create" });
  assert.deepEqual(planTalentGrant(undefined, talent("Grit")), { action: "create" });
});

test("a ranked talent the actor already has increments the existing item", () => {
  const plan = planTalentGrant([talent("Grit", { id: "a", current: 2 })], talent("Grit", { current: 1 }));
  assert.deepEqual(plan, { action: "increment", itemId: "a", ranks: 1, total: 3 });
});

test("an incoming talent carrying several ranks adds all of them", () => {
  const plan = planTalentGrant([talent("Grit", { id: "a", current: 1 })], talent("Grit", { current: 3 }));
  assert.deepEqual(plan, { action: "increment", itemId: "a", ranks: 3, total: 4 });
});

test("a non-ranked talent the actor already has is refused", () => {
  const plan = planTalentGrant([talent("Nobody's Fool", { id: "b", ranked: false })], talent("Nobody's Fool", { ranked: false }));
  assert.deepEqual(plan, { action: "refuse", reason: "not-ranked", itemId: "b" });
});

test("an unusable incoming name is left to normal creation", () => {
  assert.deepEqual(planTalentGrant([talent("Grit", { id: "a" })], { type: "talent", system: {} }), { action: "create" });
});

test("a batch with two copies of one new talent keeps a single entry with the ranks summed", () => {
  const batch = [talent("Grit", { current: 1 }), talent("Grit", { current: 2 }), talent("Parry")];
  const collapsed = collapseTalentBatch(batch);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0].name, "Grit");
  assert.equal(collapsed[0].system.ranks.current, 3);
  assert.equal(collapsed[1].name, "Parry");
});

test("collapsing does not mutate the entries it was given", () => {
  const batch = [talent("Grit", { current: 1 }), talent("Grit", { current: 2 })];
  collapseTalentBatch(batch);
  assert.equal(batch[0].system.ranks.current, 1);
});

test("a batch duplicate of a non-ranked talent is dropped, not summed", () => {
  const collapsed = collapseTalentBatch([
    talent("Nobody's Fool", { ranked: false }),
    talent("Nobody's Fool", { ranked: false }),
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].system.ranks.current, 1);
});

test("non-talent entries and unusable names pass through untouched", () => {
  const gear = { name: "Blaster", type: "weapon" };
  const nameless = { type: "talent", system: {} };
  const collapsed = collapseTalentBatch([gear, nameless, nameless]);
  assert.deepEqual(collapsed, [gear, nameless, nameless]);
  assert.deepEqual(collapseTalentBatch(undefined), []);
});

test("revoking fewer ranks than the talent holds decrements it", () => {
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 }), 1), { action: "decrement", total: 2 });
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 }), 2), { action: "decrement", total: 1 });
});

test("revoking the last rank deletes the talent", () => {
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 1 }), 1), { action: "delete" });
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 2 }), 5), { action: "delete" });
});

test("a non-ranked talent is deleted whatever is revoked", () => {
  assert.deepEqual(planTalentRevoke(talent("Nobody's Fool", { ranked: false }), 1), { action: "delete" });
});

test("revoking defaults to one rank and never takes less than one", () => {
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 })), { action: "decrement", total: 2 });
  assert.deepEqual(planTalentRevoke(talent("Grit", { current: 3 }), 0), { action: "decrement", total: 2 });
});

test("talents are grouped by trimmed name", () => {
  const groups = groupTalentsByName([talent("Grit", { id: "a" }), talent(" Grit ", { id: "b" }), talent("Parry", { id: "c" })]);
  assert.deepEqual([...groups.keys()], ["Grit", "Parry"]);
  assert.deepEqual(groups.get("Grit").map((t) => t.id), ["a", "b"]);
});

test("a single copy needs no repair", () => {
  assert.equal(planDuplicateRepair([talent("Grit", { id: "a" })]), null);
  assert.equal(planDuplicateRepair([]), null);
});

test("duplicates merge onto the oldest copy, summing ranks and keeping the highest tier", () => {
  const older = { ...talent("Precise Aim", { id: "a", current: 1, tier: 1 }), _stats: { createdTime: 100 } };
  const newer = { ...talent("Precise Aim", { id: "b", current: 1, tier: 2 }), _stats: { createdTime: 200 } };
  assert.deepEqual(planDuplicateRepair([newer, older]), {
    action: "merge",
    keepId: "a",
    rank: 2,
    tier: 2,
    grantedRanks: {},
    deleteIds: ["b"],
  });
});

test("granted ranks from every copy are merged and summed per grantor", () => {
  const a = { ...talent("Grit", { id: "a", current: 1, flags: { starwarsffg: { grantedRanks: { spec1: 1 } } } }), _stats: { createdTime: 1 } };
  const b = { ...talent("Grit", { id: "b", current: 2, flags: { starwarsffg: { grantedRanks: { spec1: 1, spec2: 1 } } } }), _stats: { createdTime: 2 } };
  const plan = planDuplicateRepair([a, b]);
  assert.deepEqual(plan.grantedRanks, { spec1: 2, spec2: 1 });
  assert.equal(plan.rank, 3);
});

test("a group containing a non-ranked talent is skipped rather than summed", () => {
  const plan = planDuplicateRepair([talent("Grit", { id: "a" }), talent("Grit", { id: "b", ranked: false })]);
  assert.deepEqual(plan, { action: "skip", reason: "not-ranked" });
});

test("duplicates with different behavior-bearing data are skipped", () => {
  const a = { ...talent("Grit", { id: "a" }), system: { ...talent("Grit").system, description: "A" } };
  const b = { ...talent("Grit", { id: "b" }), system: { ...talent("Grit").system, description: "B" } };
  assert.deepEqual(planDuplicateRepair([a, b]), { action: "skip", reason: "conflicting-data" });
});

test("copies with no creation timestamp keep the order they were given", () => {
  const plan = planDuplicateRepair([talent("Grit", { id: "a" }), talent("Grit", { id: "b" })]);
  assert.equal(plan.keepId, "a");
  assert.deepEqual(plan.deleteIds, ["b"]);
});
