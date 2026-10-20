import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

globalThis.game = {
  settings: {
    get: (_namespace, key) => key === "useLimitedAmmoQuality",
  },
};

// The ffgAmmoSource hook itself needs Foundry's Hooks, which the Node tier must
// not stand in for. These cases pass the hook's answer in directly.
const { hasAmmoToFire, spendsOwnAmmo, getSuppliedAmmo } = await import("../../modules/helpers/ammo-helpers.js");

const limitedAmmo = (rank) => ({
  name: "Limited Ammo Quality",
  flags: { starwarsffg: { ffgimportid: "LIMITEDAMMO" } },
  system: { rank },
});

const weapon = ({ itemmodifier = [], value = 0 } = {}) => ({
  type: "weapon",
  system: { itemmodifier, ammo: { value, max: 0 } },
});

test("a weapon whose own magazine is empty cannot fire when no package supplies its ammo", () => {
  const empty = weapon({ itemmodifier: [limitedAmmo(1)], value: 0 });
  assert.equal(getSuppliedAmmo(empty), null);
  assert.equal(hasAmmoToFire(empty), false);
  assert.equal(spendsOwnAmmo(empty), true);
});

test("a supplied magazine replaces the weapon's own for the gate and the spend", () => {
  const empty = weapon({ itemmodifier: [limitedAmmo(1)], value: 0 });
  const supplied = { provided: true, canFire: true };
  assert.equal(hasAmmoToFire(empty, supplied), true);
  assert.equal(spendsOwnAmmo(empty, supplied), false);
});

test("a supplied magazine that is empty blocks the shot, even on a weapon with no counter of its own", () => {
  const untracked = weapon();
  const supplied = { provided: true, canFire: false };
  assert.equal(hasAmmoToFire(untracked, supplied), false);
  assert.equal(spendsOwnAmmo(untracked, supplied), false);
});

test("with nothing supplied, the weapon's own magazine stays in charge", () => {
  const loaded = weapon({ itemmodifier: [limitedAmmo(2)], value: 2 });
  assert.equal(hasAmmoToFire(loaded, null), true);
  assert.equal(spendsOwnAmmo(loaded, null), true);
  assert.equal(hasAmmoToFire(weapon(), null), true, "untracked weapons fire freely");
});

test("only weapons and vehicle weapons ask for a supplied magazine", () => {
  const helpers = read("modules/helpers/ammo-helpers.js");
  assert.match(helpers, /export const AMMO_SOURCE_HOOK = "ffgAmmoSource";/);
  assert.match(helpers, /if \(!AMMO_TYPES\.has\(item\?\.type\) \|\| typeof Hooks === "undefined"\) return null;/);
  assert.match(helpers, /Hooks\.callAll\(AMMO_SOURCE_HOOK, item, source\);/);
});

test("every ammo gate and the ammo spend ask the ammo-source hook", () => {
  // The gates must not short-circuit on isAmmoTracked: a supplied magazine can
  // empty on a weapon that tracks nothing itself.
  const gates = [
    ["modules/helpers/dice-helpers.js", /if \(item && !hasAmmoToFire\(item\)\) \{/, "rollItem's gate"],
    ["modules/actors/actor-sheet-ffg.js", /if \(!hasAmmoToFire\(weapon\)\) \{/, "the crew gunnery gate"],
    // The spend lives in RollBuilderFFG#_rollCosts, paid once the roll has posted.
    ["modules/dice/roll-builder.js", /if \((item|weapon) && spendsOwnAmmo\(\1\)\) \{/, "the roll's ammo spend"],
  ];
  for (const [path, pattern, what] of gates) {
    assert.ok(pattern.test(read(path)), `${what} in ${path} does not ask the ammo-source hook`);
  }
});
