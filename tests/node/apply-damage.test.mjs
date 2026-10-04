import test from "node:test";
import assert from "node:assert/strict";

import {
  getSoakProtectionQualities,
  planDamageApplication,
  planDamageSeed,
  planDamageTarget,
} from "../../modules/helpers/apply-damage-plan.js";

/**
 * The Apply Damage decision: which pool is written, how far Pierce and Breach get through the
 * target's soak, and whether worn Beskar or Cortosis stops them entirely.
 *
 * This used to drive `ApplyDamage.show()` end to end, which meant standing up `DialogV2`,
 * `fromUuid`, `ChatMessage` and `ui` as globals -- the integration surface the Node tier is
 * fenced off from (tests/node/stub-boundary.test.mjs). The decision now lives in a module of
 * its own, free of Foundry globals, and this covers it directly. What is NOT covered here is
 * the dialog markup and the wording of the two chat messages, which stay in `show()`.
 */

const quality = (name, system = {}, flags = {}) => ({ name, system, flags });
const armor = (mods = [], { equipped = true, attachments = [], type = "armour" } = {}) => ({
  type,
  system: { equippable: { equipped }, itemmodifier: mods, itemattachment: attachments },
});
const actorWith = (items = [], type = "character") => ({
  name: "Target", type, items,
  system: { stats: { soak: { value: 6 }, armour: { value: 6 } } },
});

/** The whole chain, the way `show()` runs it: target -> seed -> apply. */
const applyHit = ({ items = [], type = "character", pierce = 0, breach = 0, pool = "wounds", damage = 12 } = {}) => {
  const actor = actorWith(items, type);
  const target = planDamageTarget(actor);
  const seed = planDamageSeed({
    name: "Weapon",
    system: {
      damage: { value: damage - 2 },
      doNotSubmit: { qualities: [
        { name: "Pierce Quality", totalRanks: pierce },
        { name: "Breach Quality", totalRanks: breach },
      ] },
    },
  }, 2);
  // The dialog seeds its two inputs from `seed` and hands back whatever the user left there.
  return { seed, ...planDamageApplication(actor, target, { damage: seed.autoDamage, pierce: seed.autoPierce, pool }) };
};

// ---------------------------------------------------------------------------
// Beskar and Cortosis
// ---------------------------------------------------------------------------

for (const name of ["Beskar", "Cortosis Quality"]) {
  for (const attack of [{ pierce: 3 }, { breach: 1 }, { pierce: 2, breach: 1 }]) {
    test(`${name} on worn armor protects full soak against ${JSON.stringify(attack)}`, () => {
      const result = applyHit({ items: [armor([quality(name)])], ...attack });

      assert.equal(result.path, "system.stats.wounds.value");
      assert.equal(result.applied, 6);
      assert.equal(result.effectiveSoak, 6);
      assert.equal(result.pierce, 0);
      assert.deepEqual(result.soakProtection, [name.split(" ")[0]]);
    });
  }
}

test("the seed offers Pierce plus ten per Breach", () => {
  assert.equal(applyHit({ pierce: 2, breach: 1 }).seed.autoPierce, 12);
  assert.equal(applyHit({ damage: 12 }).seed.autoDamage, 12);
});

test("import ids identify renamed qualities and unranked qualities still protect soak", () => {
  for (const id of ["BESKAR", "CORTOSIS"]) {
    const items = [armor([quality("Localized name", { rank: null }, { starwarsffg: { ffgimportid: id } })])];

    assert.equal(applyHit({ items, breach: 1 }).applied, 6);
  }
});

test("only active, unbroken attachment mods grant protection", () => {
  for (const [system, expected] of [[{ active: true }, 6], [{ active: false }, 12], [{ active: true, broken: true }, 12], [{}, 12]]) {
    const items = [armor([], { attachments: [{ system: { itemmodifier: [quality("Cortosis", system)] } }] })];

    assert.equal(applyHit({ items, breach: 1 }).applied, expected);
  }
});

test("unworn armor, weapons, and unrelated names do not protect soak", () => {
  for (const items of [[], [armor([quality("Beskar")], { equipped: false })], [armor([quality("Cortosis")], { type: "weapon" })], [armor([quality("Not Cortosis")])]]) {
    assert.equal(applyHit({ items, pierce: 3 }).applied, 9);
    assert.equal(applyHit({ items, breach: 1 }).applied, 12);
  }
});

test("protection applies to strain and to all personal actor types, with damage floored at zero", () => {
  const items = [armor([quality("Beskar")])];
  for (const type of ["character", "nemesis", "rival", "minion"]) {
    assert.equal(applyHit({ items, type, breach: 1, damage: 4 }).applied, 0);
  }

  const strain = applyHit({ items, pool: "strain", breach: 1 });
  assert.equal(strain.path, "system.stats.strain.value");
  assert.equal(strain.applied, 6);
});

test("personal armor does not grant vehicle armor protection", () => {
  const result = applyHit({ items: [armor([quality("Beskar")])], type: "vehicle", breach: 1 });

  assert.equal(result.path, "system.stats.hullTrauma.value");
  assert.equal(result.applied, 12);
  assert.deepEqual(result.soakProtection, []);
});

test("both protective qualities are listed once, sorted, including attachment and renamed ones", () => {
  const actor = actorWith([armor([quality("Cortosis"), quality("Beskar Quality")], {
    attachments: [{ system: { itemmodifier: [quality("Renamed", { active: true }, { starwarsffg: { ffgimportid: "BESKAR" } })] } }],
  })]);

  assert.deepEqual(getSoakProtectionQualities(actor), ["Beskar", "Cortosis"]);
});

test("no protection is reported for absent, unworn, inactive, or broken qualities", () => {
  for (const items of [
    [],
    [armor([quality("Beskar")], { equipped: false })],
    [armor([], { attachments: [{ system: { itemmodifier: [quality("Cortosis", { active: false })] } }] })],
    [armor([], { attachments: [{ system: { itemmodifier: [quality("Cortosis", { active: true, broken: true })] } }] })],
  ]) {
    assert.deepEqual(getSoakProtectionQualities(actorWith(items)), []);
  }
});

// ---------------------------------------------------------------------------
// Target shape
// ---------------------------------------------------------------------------

test("each actor type contributes its own pools, soak and labels", () => {
  assert.deepEqual(planDamageTarget(actorWith([], "vehicle")), {
    showRadio: true, soakWord: "armour", soakValue: 6,
    woundLabelKey: "SWFFG.VehicleHullTrauma", strainLabelKey: "SWFFG.VehicleHullStrain",
    woundPath: "system.stats.hullTrauma.value", strainPath: "system.stats.systemStrain.value",
  });
  assert.deepEqual(planDamageTarget(actorWith([], "minion")), {
    showRadio: false, soakWord: "soak", soakValue: 6,
    woundLabelKey: "SWFFG.Wounds", strainLabelKey: null,
    woundPath: "system.stats.wounds.value", strainPath: null,
  });
  assert.equal(planDamageTarget(actorWith([], "character")).strainPath, "system.stats.strain.value");
  // An unsupported type has no pools to write; `show()` turns this into a warning.
  assert.equal(planDamageTarget(actorWith([], "space-whale")), null);
  assert.equal(planDamageTarget(undefined), null);
});

test("a minion has no strain track to write to", () => {
  // The radio is hidden for minions and rivals, so the pool is forced back to wounds rather
  // than resolving to a path that does not exist.
  const actor = actorWith([], "minion");

  const result = planDamageApplication(actor, planDamageTarget(actor), { damage: 12, pierce: 0, pool: "strain" });

  assert.equal(result.path, "system.stats.wounds.value");
});

// ---------------------------------------------------------------------------
// The seed read off the weapon
// ---------------------------------------------------------------------------

test("the seed prefers the adjusted damage and adds the successes", () => {
  const seed = planDamageSeed({ name: "Blaster", system: { damage: { value: 6, adjusted: 9 } } }, 3);

  assert.equal(seed.autoDamage, 12);
  assert.equal(seed.weaponName, "Blaster");
});

test("the seed falls back to the base damage and to a generic name", () => {
  const seed = planDamageSeed({ system: { damage: { value: 6, adjusted: 0 } } }, 1);

  assert.equal(seed.autoDamage, 7);
  assert.equal(seed.weaponName, "weapon");
});

test("the seed reads Pierce and Breach off the rendered qualities, suffixed or not", () => {
  const seed = planDamageSeed({ system: { doNotSubmit: { qualities: [
    { name: "Pierce", totalRanks: 1 },
    { name: "Pierce Quality", totalRanks: 2 },
    { name: "Breach Quality", totalRanks: 1 },
    { name: "Vicious", totalRanks: 4 },
  ] } } }, 0);

  assert.equal(seed.autoPierce, 13);
});

test("damage and pierce entered by hand are floored at zero", () => {
  const actor = actorWith();
  const target = planDamageTarget(actor);

  const result = planDamageApplication(actor, target, { damage: -5, pierce: -5, pool: "wounds" });

  assert.equal(result.damage, 0);
  assert.equal(result.pierce, 0);
  assert.equal(result.applied, 0);
});

// ---------------------------------------------------------------------------
// Parry and Reflect
// ---------------------------------------------------------------------------

const STRAIN = "system.stats.strain.value";
const WOUNDS = "system.stats.wounds.value";

/** One hit on a soak-6 target with a defensive talent switched on. */
const defend = (input, type = "character") => {
  const actor = actorWith([], type);
  return planDamageApplication(actor, planDamageTarget(actor), input);
};

test("a defensive talent reduces the hit before soak and returns the hit and its cost together", () => {
  const hit = defend({ damage: 12, pierce: 0, pool: "wounds", defence: { reduction: 4, cost: 3, costPath: STRAIN } });

  assert.equal(hit.damage, 12); // the public line still shows the damage as dealt
  assert.equal(hit.reduction, 4);
  assert.equal(hit.reduced, 8);
  assert.equal(hit.applied, 2);
  assert.deepEqual(hit.changes, [{ path: WOUNDS, delta: 2 }, { path: STRAIN, delta: 3 }]);
  assert.deepEqual(hit.defenceCost, { path: STRAIN, delta: 3 });
});

test("a reduction larger than the damage leaves only the cost to pay", () => {
  const hit = defend({ damage: 3, pierce: 0, pool: "wounds", defence: { reduction: 5, cost: 3, costPath: STRAIN } });

  assert.equal(hit.reduced, 0);
  assert.equal(hit.applied, 0);
  assert.deepEqual(hit.changes, [{ path: WOUNDS, delta: 0 }, { path: STRAIN, delta: 3 }]);
});

test("Pierce works on the reduced damage", () => {
  const hit = defend({ damage: 12, pierce: 4, pool: "wounds", defence: { reduction: 4, cost: 3, costPath: STRAIN } });

  assert.equal(hit.effectiveSoak, 2);
  assert.equal(hit.applied, 6);
});

test("strain damage and a strain cost merge into one change, and the cost is kept on its own", () => {
  const hit = defend({ damage: 12, pierce: 0, pool: "strain", defence: { reduction: 4, cost: 1, costPath: STRAIN } });

  assert.deepEqual(hit.changes, [{ path: STRAIN, delta: 3 }]); // 2 from the hit, 1 from the cost
  assert.deepEqual(hit.defenceCost, { path: STRAIN, delta: 1 });
});

test("a rival pays in wounds, merged with the hit", () => {
  for (const type of ["rival"]) {
    const hit = defend({ damage: 12, pierce: 0, pool: "wounds", defence: { reduction: 4, cost: 3, costPath: WOUNDS } }, type);

    assert.deepEqual(hit.changes, [{ path: WOUNDS, delta: 5 }]);
    assert.deepEqual(hit.defenceCost, { path: WOUNDS, delta: 3 });
  }
});

test("without a defensive talent the result is exactly what it always was", () => {
  const actor = actorWith();
  const hit = planDamageApplication(actor, planDamageTarget(actor), { damage: 12, pierce: 2, pool: "wounds" });

  assert.deepEqual(Object.keys(hit).sort(),
    ["applied", "damage", "effectiveSoak", "path", "pierce", "poolLabelKey", "soak", "soakProtection", "soakWord"]);
  assert.equal(hit.applied, 8);
});
