import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import ModifierHelpers from "../../modules/helpers/modifiers.js";
import ItemHelpers from "../../modules/helpers/item-helpers.js";

/**
 * A career or specialization grants its career skills through one `(inherent)` Active Effect
 * holding a `system.skills.<skill>.careerskill` change per slot. Nothing on the actor derives
 * those flags from the item's `system.careerSkills` -- the effect IS the grant.
 *
 * That effect used to be filled in from `careerSkills` in exactly two places: the OggDude
 * importer, and the item sheet's own save. An item from a compendium that was built any other
 * way (a pack exported from an older world, a hand-authored spec) carries no such effect, and
 * `_preCreate` planned one only for unowned items -- and then with five literal `"(none)"`
 * placeholders, ignoring the career skills sitting right there in the item's data.
 *
 * Live evidence: a character who bought Soresu Defender after creation kept `Lightsaber` as a
 * non-career skill. The spec on the actor held
 * `careerSkills: {careerSkill1: "Lightsaber", ...}` and three Active Effects, none of them
 * `(inherent)`, so no career-skill change ever reached the actor.
 */

const item = (type, careerSkills, effects = []) => ({
  type,
  img: "icons/test.webp",
  system: { careerSkills },
  effects,
});

const SORESU = {
  careerSkill0: "Discipline",
  careerSkill1: "Lightsaber",
  careerSkill2: "Knowledge: Lore",
  careerSkill3: "Vigilance",
  careerSkill4: "(none)",
};

test("a specialization's career skills become career-skill changes", () => {
  assert.deepEqual(ModifierHelpers.planCareerSkillChanges("specialization", SORESU), [
    { key: "system.skills.Discipline.careerskill", mode: AE_MODES.ADD, value: true },
    { key: "system.skills.Lightsaber.careerskill", mode: AE_MODES.ADD, value: true },
    { key: "system.skills.Knowledge: Lore.careerskill", mode: AE_MODES.ADD, value: true },
    { key: "system.skills.Vigilance.careerskill", mode: AE_MODES.ADD, value: true },
    // an empty slot keeps its placeholder, so the sheet's by-index rewrite still lines up
    { key: "(none)", mode: AE_MODES.ADD, value: true },
  ]);
});

test("a career gets all eight of its slots, filled or not", () => {
  const changes = ModifierHelpers.planCareerSkillChanges("career", { careerSkill0: "Cool" });

  assert.equal(changes.length, 8);
  assert.equal(changes[0].key, "system.skills.Cool.careerskill");
  assert.deepEqual(new Set(changes.slice(1).map((c) => c.key)), new Set(["(none)"]));
});

test("a missing or empty careerSkills dictionary yields placeholders, not a crash", () => {
  assert.equal(ModifierHelpers.planCareerSkillChanges("specialization", undefined).length, 5);
  assert.equal(ModifierHelpers.planCareerSkillChanges("career", {}).length, 8);
  assert.deepEqual(ModifierHelpers.planCareerSkillChanges("talent", {}), []);
});

test("the inherent effect a specialization is created with carries its career skills", () => {
  const planned = ModifierHelpers.planInherentEffect(item("specialization", SORESU));

  assert.equal(planned.name, "(inherent)");
  assert.deepEqual(planned.changes.map((c) => c.key), [
    "system.skills.Discipline.careerskill",
    "system.skills.Lightsaber.careerskill",
    "system.skills.Knowledge: Lore.careerskill",
    "system.skills.Vigilance.careerskill",
    "(none)",
  ]);
});

test("a specialization dropped on an actor is still planned an inherent effect", () => {
  // The general rule is that an owned item is a copy of one that already carries its inherent
  // effect, so it is not planned again. Career and specialization are the exception: the packs
  // people actually drop from were built without one.
  const source = fs.readFileSync(new URL("../../modules/items/item-ffg.js", import.meta.url), "utf8");
  const preCreate = source.slice(source.indexOf("async _preCreate("), source.indexOf("async _onCreate("));
  const forced = preCreate.slice(preCreate.indexOf("const forceInherent"));

  for (const type of ["career", "specialization"]) {
    assert.match(forced.slice(0, forced.indexOf("\n")), new RegExp(`"${type}"`),
      `${type} must be planned an inherent effect even when it is created on an actor`);
  }
});

/**
 * The repair planner: what to do about one career/specialization that is already on an actor.
 */
test("plans the missing effect for an item that has none", () => {
  const plan = ItemHelpers.planCareerSkillRepair(item("specialization", SORESU));

  assert.equal(plan.action, "create");
  assert.equal(plan.changes[1].key, "system.skills.Lightsaber.careerskill");
});

test("plans an update when the effect is there but still holds placeholders", () => {
  const stale = [{
    _id: "abc123",
    name: "(inherent)",
    changes: Array.from({ length: 5 }, () => ({ key: "(none)", mode: AE_MODES.ADD, value: true })),
  }];

  const plan = ItemHelpers.planCareerSkillRepair(item("specialization", SORESU, stale));

  assert.equal(plan.action, "update");
  assert.equal(plan.effectId, "abc123");
});

test("plans nothing when the effect already grants the right skills", () => {
  const good = [{
    _id: "abc123",
    name: "(inherent)",
    changes: ModifierHelpers.planCareerSkillChanges("specialization", SORESU),
  }];

  assert.equal(ItemHelpers.planCareerSkillRepair(item("specialization", SORESU, good)).action, "none");
});

test("plans nothing for an item type that has no career skills", () => {
  assert.equal(ItemHelpers.planCareerSkillRepair(item("talent", {})).action, "none");
  assert.equal(ItemHelpers.planCareerSkillRepair(undefined).action, "none");
});

test("a stored change reading value:\"true\" still matches -- Foundry stringifies it", () => {
  const stored = [{
    _id: "abc123",
    name: "(inherent)",
    changes: ModifierHelpers.planCareerSkillChanges("specialization", SORESU)
      .map((change) => ({ ...change, value: "true" })),
  }];

  assert.equal(ItemHelpers.planCareerSkillRepair(item("specialization", SORESU, stored)).action, "none");
});
