/**
 * Obligation, Duty and Morality as the rules and the sheets see them.
 *
 * A character's Obligation (or Duty) is its stored value -- the baseline -- plus the
 * magnitude of every Obligation (or Duty) entry it carries. The baseline is what the
 * wizard and the importers write (starting value plus any bonus taken), while their
 * entries arrive at magnitude 0; so adding the entries on top keeps every existing
 * character's number and lets entries edited later count. Morality is different: its
 * entries are Emotional Strengths and Weaknesses with no value, and the score is set by
 * hand.
 *
 * Every consumer -- both character sheets and the Group Manager -- calls these
 * helpers rather than reading a total off the actor: a value added during data
 * preparation is not in the schema, and `actor.toObject(false)`, which the sheets build
 * their context from, serializes through the schema and would drop it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  entryMagnitude, characterTrack, trackVisibility,
  buildTrackTable, matchRange, buildMoralityList, closestMorality,
} from "../../modules/helpers/obligation-tracks.js";

const entry = (name, type, magnitude = 0, subtype = "") => ({ type: "obligation", name, system: { type, magnitude, subtype } });
const pc = (id, name, { obligation = 0, duty = 0, morality = 0, conflict = 0, items = [], obligationlist = {}, dutylist = {} } = {}) => ({
  id, name, items,
  system: { obligation: { value: obligation }, duty: { value: duty }, morality: { value: morality }, conflict: { value: conflict }, obligationlist, dutylist },
});
const ranges = (table) => table.map((r) => `${r.name}:${r.type || "-"} ${r.rangeStart}-${r.rangeEnd}`);

// --- the total ------------------------------------------------------------

test("a track's total is its baseline plus its entries' magnitudes", () => {
  const dax = pc("dax", "Dax", { obligation: 10, items: [entry("Debt", "obligation", 5), entry("Bounty", "obligation", 3)] });
  const { baseline, total } = characterTrack(dax, "obligation");

  assert.deepEqual({ baseline, total }, { baseline: 10, total: 18 });
});

test("a character built by the wizard keeps its number, since its entries carry no magnitude", () => {
  const dax = pc("dax", "Dax", { obligation: 15, items: [entry("Debt", "obligation", 0)] });

  assert.equal(characterTrack(dax, "obligation").total, 15);
});

test("only entries of the track being totalled count towards it", () => {
  const dax = pc("dax", "Dax", { duty: 5, items: [entry("Debt", "obligation", 20), entry("Recon", "duty", 10), entry("Hatred", "morality", 7)] });

  assert.equal(characterTrack(dax, "duty").total, 15);
});

test("items that are not obligation entries are ignored even if their type field matches", () => {
  const blaster = { type: "weapon", name: "Blaster", system: { type: "obligation", magnitude: 50 } };
  const dax = pc("dax", "Dax", { obligation: 10, items: [blaster] });

  assert.equal(characterTrack(dax, "obligation").total, 10);
});

test("an entry with a blank magnitude leaves the total a number", () => {
  const dax = pc("dax", "Dax", { obligation: 10, items: [entry("Blank", "obligation", ""), entry("Debt", "obligation", 5)] });

  assert.equal(characterTrack(dax, "obligation").total, 15);
});

test("a blank or unreadable magnitude counts as nothing", () => {
  for (const blank of ["", null, undefined, "abc", -5]) assert.equal(entryMagnitude(blank), 0, `for ${JSON.stringify(blank)}`);
  assert.equal(entryMagnitude("12"), 12);
});

// --- which boxes a sheet shows ---------------------------------------------

test("a box shows when the character has entries of that kind", () => {
  const dax = pc("dax", "Dax", { items: [entry("Recon", "duty", 0)] });

  assert.deepEqual(trackVisibility(dax), { obligation: false, duty: true, morality: false });
});

test("a box shows when its value is not zero, with or without entries", () => {
  const dax = pc("dax", "Dax", { obligation: 10, morality: 50 });

  assert.deepEqual(trackVisibility(dax), { obligation: true, duty: false, morality: true });
});

test("Conflict alone is enough to show the Morality and Conflict boxes", () => {
  assert.equal(trackVisibility(pc("dax", "Dax", { conflict: 3 })).morality, true);
});

test("Edit Mode shows every box, so a baseline can be set from nothing", () => {
  assert.deepEqual(trackVisibility(pc("dax", "Dax"), { editMode: true }), { obligation: true, duty: true, morality: true });
});

test("a Force user sees Morality even before it has been set", () => {
  assert.equal(trackVisibility(pc("dax", "Dax"), { forceUser: true }).morality, true);
});

// --- the Group Manager's d100 tables ---------------------------------------

test("with exactly one entry, the baseline folds into it", () => {
  const dax = pc("dax", "Dax", { obligation: 15, items: [entry("Debt", "obligation", 0)] });

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:Debt 1-15"]);
});

test("a folded entry also keeps its own magnitude", () => {
  const dax = pc("dax", "Dax", { obligation: 10, items: [entry("Debt", "obligation", 5)] });

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:Debt 1-15"]);
});

test("with several entries, the baseline takes its own unnamed slice ahead of them", () => {
  const dax = pc("dax", "Dax", { obligation: 10, items: [entry("Debt", "obligation", 5), entry("Bounty", "obligation", 3)] });

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:- 1-10", "Dax:Debt 11-15", "Dax:Bounty 16-18"]);
});

test("a baseline with no entries takes an unnamed slice", () => {
  assert.deepEqual(ranges(buildTrackTable([pc("dax", "Dax", { duty: 10 })], "duty")), ["Dax:- 1-10"]);
});

test("each character's slices start where the previous character's ended", () => {
  const dax = pc("dax", "Dax", { obligation: 10, items: [entry("Debt", "obligation", 0)] });
  const vex = pc("vex", "Vex", { items: [entry("Bounty", "obligation", 5)] });

  assert.deepEqual(ranges(buildTrackTable([dax, vex], "obligation")), ["Dax:Debt 1-10", "Vex:Bounty 11-15"]);
});

test("an entry with no magnitude takes no slice and does not break the ones after it", () => {
  const dax = pc("dax", "Dax", { items: [entry("Debt", "obligation", 10), entry("Blank", "obligation", ""), entry("Bounty", "obligation", 5)] });
  const kai = pc("kai", "Kai", { items: [entry("Family", "obligation", 10)] });

  assert.deepEqual(ranges(buildTrackTable([dax, kai], "obligation")), ["Dax:Debt 1-10", "Dax:Bounty 11-15", "Kai:Family 16-25"]);
});

test("an old import's list, when it adds up to the baseline, names the baseline's slices", () => {
  const dax = pc("dax", "Dax", { obligation: 15, obligationlist: { a: { type: "Debt", magnitude: "10" }, b: { type: "Addiction", magnitude: "5" } } });

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:Debt 1-10", "Dax:Addiction 11-15"]);
});

test("an old import's list that no longer matches the baseline is not trusted", () => {
  const dax = pc("dax", "Dax", { obligation: 20, obligationlist: { a: { type: "Debt", magnitude: "10" } } });

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:- 1-20"]);
});

test("building the table again gives the same table, not a longer one", () => {
  const dax = pc("dax", "Dax", { obligation: 10 });
  buildTrackTable([dax], "obligation");
  buildTrackTable([dax], "obligation");

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:- 1-10"]);
});

test("a character who has left the group leaves nothing behind in the next table", () => {
  const dax = pc("dax", "Dax", { obligation: 10 });
  const vex = pc("vex", "Vex", { obligation: 10 });
  buildTrackTable([dax, vex], "obligation");

  assert.deepEqual(ranges(buildTrackTable([dax], "obligation")), ["Dax:- 1-10"]);
});

test("a roll lands on the slice whose range holds it, edges included", () => {
  const table = buildTrackTable([pc("dax", "Dax", { obligation: 10 }), pc("vex", "Vex", { obligation: 5 })], "obligation");

  assert.deepEqual([1, 10, 11, 15, 16].map((roll) => matchRange(table, roll)?.name ?? null), ["Dax", "Dax", "Vex", "Vex", null]);
});

// --- Morality --------------------------------------------------------------

test("the Morality list carries each score and the character's Emotional Strengths and Weaknesses", () => {
  const sarah = pc("sarah", "Sarah", {
    morality: 75,
    items: [entry("Compassion", "morality", 0, "Emotional Strength"), entry("Hatred", "morality", 0, "Emotional Weakness")],
  });

  assert.deepEqual(buildMoralityList([sarah]), [
    { playerId: "sarah", name: "Sarah", morality: 75, strengths: ["Compassion"], weaknesses: ["Hatred"] },
  ]);
});

test("a character with no Morality set and no Morality entries is not on the list", () => {
  assert.deepEqual(buildMoralityList([pc("dax", "Dax", { obligation: 10 })]), []);
});

test("the character whose Morality is closest to the roll is triggered", () => {
  const list = buildMoralityList([pc("a", "A", { morality: 50 }), pc("b", "B", { morality: 75 }), pc("c", "C", { morality: 90 })]);

  assert.deepEqual(closestMorality(list, 73).map((r) => r.name), ["B"]);
});

test("characters equally close to the roll are all named, since the rules give no tie-break", () => {
  const list = buildMoralityList([pc("a", "A", { morality: 60 }), pc("b", "B", { morality: 70 })]);

  assert.deepEqual(closestMorality(list, 65).map((r) => r.name), ["A", "B"]);
});

test("nobody is triggered when nobody tracks Morality", () => {
  assert.deepEqual(closestMorality([], 50), []);
});
