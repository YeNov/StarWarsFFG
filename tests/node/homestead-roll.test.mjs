import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { filterSkills, homesteadDefaultRows, homesteadItems, homesteadRollers } from "../../modules/helpers/homestead-roll.js";

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
