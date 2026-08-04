import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  settings: {
    get: (_namespace, key) => key === "useLimitedAmmoQuality",
  },
};

const { getInitialLimitedAmmoValue } = await import("../../modules/helpers/ammo-helpers.js");

const limitedAmmo = (rank, name = "Limited Ammo Quality") => ({
  name,
  flags: { starwarsffg: { ffgimportid: "LIMITEDAMMO" } },
  system: { rank },
});

const weapon = (itemmodifier = []) => ({
  type: "weapon",
  system: { itemmodifier, ammo: { value: 0, max: 0 } },
});

test("a weapon gaining Limited Ammo starts with current ammo at its threshold", () => {
  assert.equal(getInitialLimitedAmmoValue(weapon(), [limitedAmmo(3)]), 3);
});

test("stacked Limited Ammo qualities initialize to their combined threshold", () => {
  assert.equal(getInitialLimitedAmmoValue(weapon(), [limitedAmmo(2), limitedAmmo(1)]), 3);
});

test("vehicle weapons receive the same Limited Ammo default", () => {
  assert.equal(getInitialLimitedAmmoValue({ ...weapon(), type: "shipweapon" }, [limitedAmmo(4)]), 4);
});

test("an existing Limited Ammo weapon is not refilled by later updates", () => {
  assert.equal(getInitialLimitedAmmoValue(weapon([limitedAmmo(2)]), [limitedAmmo(3)]), null);
});

test("non-weapons do not receive a Limited Ammo magazine", () => {
  const gear = { type: "gear", system: { itemmodifier: [] } };
  assert.equal(getInitialLimitedAmmoValue(gear, [limitedAmmo(2)]), null);
});

test("manual ammo mode does not initialize from the Limited Ammo quality", () => {
  globalThis.game.settings.get = () => false;
  try {
    assert.equal(getInitialLimitedAmmoValue(weapon(), [limitedAmmo(2)]), null);
  } finally {
    globalThis.game.settings.get = (_namespace, key) => key === "useLimitedAmmoQuality";
  }
});
