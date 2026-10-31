import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { filterSkills, firstSkill, groupSkills, homesteadDefaultRows, homesteadItems, homesteadRollers, homesteadRollPool } from "../../modules/helpers/homestead-roll.js";

/**
 * Rolling a character's skill from the homestead sheet
 * (docs/superpowers/specs/2026-10-31-homestead-skill-roll-design.md): who may roll, the skill
 * search, and which upgrade modifier rows count.
 */

const user = (id, isGM = false) => ({ id, isGM });
const actor = (name, type, owners) => ({ name, type, testUserPermission: (u, level) => level === "OWNER" && owners.includes(u.id) });
const names = (actors) => actors.map((a) => a.name);

test("rollers for a player are their own characters", () => {
  const p = user("p");
  const actors = [actor("Zed", "character", ["q"]), actor("Bo", "character", ["p"]), actor("Grunt", "minion", ["p"])];

  assert.deepEqual(names(homesteadRollers({ actors, user: p, users: [p, user("q")] })), ["Bo"]);
});

test("rollers for the GM are player-owned characters", () => {
  const gm = user("gm", true);
  const actors = [actor("Villain", "character", ["gm"]), actor("Bo", "character", ["gm", "p"]), actor("Al", "character", ["q"])];

  assert.deepEqual(names(homesteadRollers({ actors, user: gm, users: [gm, user("p"), user("q")] })), ["Al", "Bo"]);
});

test("filterSkills matches label case-insensitively", () => {
  const skills = [{ key: "Mechanics", label: "Mechanics" }, { key: "Medicine", label: "Medicine" }, { key: "Charm", label: "Charm" }];

  assert.deepEqual(filterSkills(skills, "me").map((s) => s.key), ["Mechanics", "Medicine"]);
  assert.deepEqual(filterSkills(skills, "  ").map((s) => s.key), ["Mechanics", "Medicine", "Charm"]);
});

const upgrade = (id, name, attributes, type = "homesteadupgrade") => ({ id, name, type, system: { attributes } });

test("defaultRows ignore inactive and foreign-skill rows", () => {
  const workshop = upgrade("u1", "Workshop", {
    a: { modtype: "Skill Boost", mod: "Mechanics", value: 1 },
    b: { modtype: "Skill Boost", mod: "Charm", value: 1 },
    c: { modtype: "Roll Modifiers", mod: "Add Advantage", value: 1, active: false },
    d: { modtype: "Characteristic", mod: "Brawn", value: 1 },
  });

  assert.deepEqual(homesteadDefaultRows([workshop], "Mechanics"), [
    { key: "u1:default", name: "Workshop", source: "Workshop", rows: [{ modtype: "Skill Boost", mod: "Mechanics", value: 1 }] },
  ]);
});

test("defaultRows ignore storage items", () => {
  const kit = upgrade("g1", "Toolkit", { a: { modtype: "Skill Boost", mod: "Mechanics", value: 1 } }, "gear");

  assert.deepEqual(homesteadDefaultRows([kit], "Mechanics"), []);
});

test("homesteadItems returns [] for a missing homestead", () => {
  assert.deepEqual(homesteadItems(null), []);
  assert.deepEqual(homesteadItems({ type: "character", items: [upgrade("u1", "Workshop", {})] }), []);
});

test("homesteadItems returns only upgrades", () => {
  const items = [upgrade("u1", "Workshop", {}), upgrade("g1", "Toolkit", {}, "gear")];

  assert.deepEqual(homesteadItems({ type: "homestead", items }).map((i) => i.id), ["u1"]);
});

test("a default Skill Rank row stays rebuildable by a ticked rank buff", async () => {
  const { DicePoolFFG } = await import("../../modules/dice/pool.js");
  const { applyOfferedBuffs } = await import("../../modules/dice/optional-buff-pool.js");
  // Intellect 3, Mechanics 2: 2 proficiency + 1 ability. The Library adds a rank (3, 3 → 3 proficiency).
  const start = new DicePoolFFG({ proficiency: 2, ability: 1, difficulty: 2 });
  const library = [{ key: "u1:default", name: "Library", source: "Library", rows: [{ modtype: "Skill Rank", mod: "Mechanics", value: 1 }] }];

  const { pool, rank } = homesteadRollPool({ pool: start, groups: library, characteristic: 3, rank: 2 });
  assert.deepEqual([pool.proficiency, pool.ability, rank], [3, 0, 3]);

  // The character's own +1 rank buff, ticked in the dialog: (3, 4) is 3 proficiency + 1 ability.
  const ticked = applyOfferedBuffs(pool, [{ rows: [{ modtype: "Skill Rank", mod: "Mechanics", value: 1 }] }], { characteristic: 3, rank });
  assert.deepEqual([ticked.proficiency, ticked.ability], [3, 1]);
});

test("default upgrade rows are recorded on the pool", async () => {
  const { DicePoolFFG } = await import("../../modules/dice/pool.js");
  const start = new DicePoolFFG({ ability: 2, difficulty: 2 });
  const groups = [{ key: "u1:default", name: "Lab", source: "Lab", rows: [
    { modtype: "Skill Add Upgrade", mod: "Mechanics", value: 1 },
    { modtype: "Dice Modifiers", mod: "Upgrade Ability", value: 1 },
  ] }];

  const { pool } = homesteadRollPool({ pool: start, groups, characteristic: 2, rank: 0 });
  assert.deepEqual([pool.proficiency, pool.ability, pool.upgrades, pool.modUpgrades], [2, 0, 1, 1]);
});

test("firstSkill picks the first skill the search leaves", () => {
  const skills = [{ key: "Mechanics", label: "Mechanics" }, { key: "Medicine", label: "Medicine" }];

  assert.equal(firstSkill(skills, "medi"), "Medicine");
  assert.equal(firstSkill(skills, "zzz"), null);
});

test("groupSkills follows the character sheet: categories in order, skills sorted, empty ones dropped", () => {
  const types = [{ type: "General", label: "General" }, { type: "Combat", label: "Combat" }, { type: "Knowledge", label: "Knowledge" }];
  const skills = [
    { key: "Ranged-Light", label: "Ranged (Light)", type: "Combat" },
    { key: "Mechanics", label: "Mechanics", type: "General" },
    { key: "Brawl", label: "Brawl", type: "Combat" },
    { key: "Astrogation", label: "Astrogation", type: "General" },
    { key: "Xenology", label: "Xenology", type: "Knowledge" },
  ];

  assert.deepEqual(groupSkills(skills, types, "").map((g) => [g.label, g.skills.map((s) => s.key)]), [
    ["General", ["Astrogation", "Mechanics"]],
    ["Combat", ["Brawl", "Ranged-Light"]],
    ["Knowledge", ["Xenology"]],
  ]);
  assert.deepEqual(groupSkills(skills, types, "me").map((g) => [g.label, g.skills.map((s) => s.key)]), [["General", ["Mechanics"]]]);
});

test("groupSkills keeps skills of a type the list does not name", () => {
  const groups = groupSkills([{ key: "Pilot", label: "Pilot", type: "Custom" }], [{ type: "General", label: "General" }], "");

  assert.deepEqual(groups.map((g) => [g.label, g.skills.map((s) => s.key)]), [["Custom", ["Pilot"]]]);
});

test("firstSkill follows the grouped order", () => {
  const types = [{ type: "General", label: "General" }, { type: "Combat", label: "Combat" }];
  const skills = [{ key: "Brawl", label: "Brawl", type: "Combat" }, { key: "Mechanics", label: "Mechanics", type: "General" }];

  assert.equal(firstSkill(skills, "", types), "Mechanics");
});
