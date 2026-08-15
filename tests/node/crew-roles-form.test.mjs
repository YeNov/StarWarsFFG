/**
 * Crew role settings form normalization.
 *
 * The crew-roles dialog posts one `role_name` / `role_skill` / `use_handling` / `use_weapons`
 * field per row. FormDataExtended collapses a *single* row to scalars and only produces arrays
 * once two or more rows share a name, so the raw form data has three distinct shapes (none,
 * one, many). rolesFromFormData() is the single place that flattening is handled.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { rolesFromFormData } from "../../modules/settings/crew-roles-form.js";

test("no rows yields an empty role list", () => {
  assert.deepEqual(rolesFromFormData({}), []);
});

test("a single row is not iterated character-by-character", () => {
  // FormDataExtended returns scalars, not 1-length arrays, when a name appears once.
  const roles = rolesFromFormData({
    role_name: "Gunner",
    role_skill: "Gunnery",
    use_handling: false,
    use_weapons: true,
  });

  assert.deepEqual(roles, [
    { role_name: "Gunner", role_skill: "Gunnery", use_handling: false, use_weapons: true },
  ]);
});

test("multiple rows keep their order and per-row flags", () => {
  const roles = rolesFromFormData({
    role_name: ["Gunner", "Pilot"],
    role_skill: ["Gunnery", "Piloting: Space"],
    use_handling: [false, true],
    use_weapons: [true, false],
  });

  assert.deepEqual(roles, [
    { role_name: "Gunner", role_skill: "Gunnery", use_handling: false, use_weapons: true },
    { role_name: "Pilot", role_skill: "Piloting: Space", use_handling: true, use_weapons: false },
  ]);
});

test("missing companion fields fall back to safe defaults", () => {
  const roles = rolesFromFormData({ role_name: ["Gunner", "Pilot"] });

  assert.deepEqual(roles, [
    { role_name: "Gunner", role_skill: "", use_handling: false, use_weapons: false },
    { role_name: "Pilot", role_skill: "", use_handling: false, use_weapons: false },
  ]);
});

test("keepBlank retains unnamed rows so row indices stay stable mid-edit", () => {
  const roles = rolesFromFormData(
    {
      role_name: ["Gunner", "   ", "Pilot"],
      role_skill: ["Gunnery", "Cool", "Piloting: Space"],
      use_handling: [false, false, true],
      use_weapons: [true, false, false],
    },
    { keepBlank: true },
  );

  assert.equal(roles.length, 3);
  assert.deepEqual(roles[1], {
    role_name: "",
    role_skill: "Cool",
    use_handling: false,
    use_weapons: false,
  });
});

test("role names are trimmed and blank rows are dropped", () => {
  const roles = rolesFromFormData({
    role_name: [" Gunner ", "   ", "Pilot"],
    role_skill: ["Gunnery", "Cool", "Piloting: Space"],
    use_handling: [false, false, true],
    use_weapons: [true, false, false],
  });

  assert.deepEqual(roles, [
    { role_name: "Gunner", role_skill: "Gunnery", use_handling: false, use_weapons: true },
    { role_name: "Pilot", role_skill: "Piloting: Space", use_handling: true, use_weapons: false },
  ]);
});
