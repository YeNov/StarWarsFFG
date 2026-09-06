import test from "node:test";
import assert from "node:assert/strict";

import { buildTalentTierMap, groupTalentsByTier } from "../../modules/actors/codex-talent-tiers.js";

/** Minimal stand-ins for the actor items the map is built from. */
const talentItem = (name, tier) => ({ type: "talent", name, system: { tier } });
const specItem = (name, talents) => ({ type: "specialization", name, system: { talents } });

test("standalone talent items take their own tier", () => {
  const map = buildTalentTierMap([talentItem("Grit", 1), talentItem("Dedication", 5)]);
  assert.equal(map.get("Grit"), 1);
  assert.equal(map.get("Dedication"), 5);
});

test("a talent with no tier falls back to tier 1", () => {
  const map = buildTalentTierMap([talentItem("Mystery", undefined), talentItem("Junk", "not a number")]);
  assert.equal(map.get("Mystery"), 1);
  assert.equal(map.get("Junk"), 1);
});

test("specialization tree talents derive their tier from the grid key", () => {
  const map = buildTalentTierMap([
    specItem("Sharpshooter", {
      talent0: { name: "Row One", islearned: true },
      talent3: { name: "Still Row One", islearned: true },
      talent4: { name: "Row Two", islearned: true },
      talent19: { name: "Row Five", islearned: true },
    }),
  ]);
  assert.equal(map.get("Row One"), 1);
  assert.equal(map.get("Still Row One"), 1);
  assert.equal(map.get("Row Two"), 2);
  assert.equal(map.get("Row Five"), 5);
});

test("unlearned specialization slots and empty slots are ignored", () => {
  const map = buildTalentTierMap([
    specItem("Sharpshooter", {
      talent0: { name: "Unlearned", islearned: false },
      talent4: { name: "", islearned: true },
      talent8: { islearned: true },
    }),
  ]);
  assert.equal(map.size, 0);
});

test("a talent found at several tiers keeps the lowest", () => {
  const map = buildTalentTierMap([
    specItem("A", { talent12: { name: "Grit", islearned: true } }),
    specItem("B", { talent4: { name: "Grit", islearned: true } }),
    talentItem("Grit", 5),
  ]);
  assert.equal(map.get("Grit"), 2);
});

test("groups ascending by tier and keeps the incoming order within a tier", () => {
  const map = new Map([["Second", 1], ["First", 1], ["High", 3]]);
  const groups = groupTalentsByTier([
    { name: "High" },
    { name: "Second" },
    { name: "First" },
  ], map);
  assert.deepEqual(groups.map((g) => g.tier), [1, 3]);
  assert.deepEqual(groups[0].talents.map((t) => t.name), ["Second", "First"]);
  assert.deepEqual(groups[1].talents.map((t) => t.name), ["High"]);
});

test("talents missing from the map are grouped as tier 1", () => {
  const groups = groupTalentsByTier([{ name: "Unknown" }, { name: "Known" }], new Map([["Known", 2]]));
  assert.deepEqual(groups.map((g) => g.tier), [1, 2]);
  assert.deepEqual(groups[0].talents.map((t) => t.name), ["Unknown"]);
});

test("an empty talent list produces no groups", () => {
  assert.deepEqual(groupTalentsByTier([], new Map()), []);
  assert.deepEqual(groupTalentsByTier(undefined, undefined), []);
});
