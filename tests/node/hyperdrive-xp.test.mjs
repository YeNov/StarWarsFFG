import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  dedicationAdvances,
  deriveXp,
  rankedTalentResidualEffects,
  residualCharacteristicDeltas,
  residualSkillDeltas,
} from "../../modules/importer/hyperdrive/to-actor.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const parsed = parseHyperdrive(RAW);

test("derives spend from the purchases and preserves an overspent export", () => {
  const xp = deriveXp(parsed);
  // total = species starting 105 + Obligation 5/10 + Duty 5/10 + Morality 5
  assert.equal(xp.total, 140);
  // available is the exported remaining XP, preserved rather than clamped.
  assert.equal(xp.available, -215);
  assert.match(xp.warnings.join("\n"), /over budget by 215/i);

  // Spend is computed from the purchases themselves, not back-derived from `available`.
  assert.deepEqual(xp.breakdown, {
    talents: 120, // Steel Hand 95 + Death Watch 25, from each row's Cost
    forcePowers: 55, // Conjure 20 + 15, Alter 10 + 10 (PaidCosts)
    // Brawn 2->3 (30), Agility 2->4 (70), Intellect 2->4 (70), Cunning 2->3 (30). The
    // Steel Hand Dedication is not inside the exported Brawn 3, so that step was bought.
    characteristics: 200,
    specializations: 10, // Death Watch is universal, a flat 10
    skills: 80, // exported values are paid ranks; free ranks determine each purchase's tier
    total: 465,
  });
  assert.equal(xp.spent, 465);
});

test("reports a spend that does not reconcile with the exported remaining XP", () => {
  const xp = deriveXp(parsed);
  // 140 - 465 = -325, but the export claims -215: the fixture's own counter is 110 XP
  // adrift. Deriving `spent` as `total - available` would have hidden this entirely.
  assert.match(xp.warnings.join("\n"), /does not reconcile.*difference of 110 XP/s);
});

test("adds Hyperdrive earned XP to the lifetime total", () => {
  const imported = parseHyperdrive({
    Species: {
      StartingAttrs: { Experience: "90" },
      StartingChars: {
        Brawn: 3,
        Agility: 2,
        Intellect: 2,
        Cunning: 2,
        Willpower: 1,
        Presence: 2,
      },
    },
    Characteristics: {
      Brawn: 3,
      Agility: 2,
      Intellect: 2,
      Cunning: 2,
      Willpower: 1,
      Presence: 2,
    },
    EarnedXP: "50",
    XP: 0,
  });
  const xp = deriveXp(imported);
  assert.equal(xp.total, 140);
  assert.equal(xp.available, 0);
});

// A Smuggler who took Infiltrator as a second specialization and bought its Dedication
// node for Cunning. Hyperdrive's `Characteristics` hold species start + purchased
// advances only: the sheet shows Cunning 4 while the export says 3, and the export's
// own XP counter only balances when the Dedication is NOT inside that 3.
const DEDICATED = parseHyperdrive({
  Species: {
    StartingAttrs: { Experience: "100" },
    StartingChars: { Brawn: 2, Agility: 2, Intellect: 2, Cunning: 2, Willpower: 2, Presence: 2 },
  },
  Career: { Key: "SMUG", Specializations: ["CHARMER", "PILOT"] },
  Specializations: [
    {
      Key: "CHARMER",
      TalentRows: [{ Cost: "5", Talents: ["SMOOTHTALK", "KILL", "GRIT", "CONGENIAL"] }],
      BoughtTalents: [[false, false, false, false]],
    },
    {
      Key: "INFILTRATOR",
      TalentRows: [{ Cost: "5", Talents: ["DEDI", "GRIT", "DODGE", "JUMP"] }],
      BoughtTalents: [[true, false, false, false]],
    },
  ],
  Dedications: { Cunning: ["INFILTRATOR"] },
  Characteristics: { Brawn: 2, Agility: 2, Intellect: 2, Cunning: 3, Willpower: 2, Presence: 2 },
  EarnedXP: "0",
  // 100 - (Dedication node 5 + out-of-career specialization 30 + Cunning 2->3 30)
  XP: 35,
});

test("exported characteristics exclude Dedication, so the bought advance is still charged", () => {
  const xp = deriveXp(DEDICATED);
  assert.equal(xp.breakdown.characteristics, 30);
  assert.equal(xp.breakdown.talents, 5);
});

test("a specialization outside the career costs 10 XP more", () => {
  const xp = deriveXp(DEDICATED);
  assert.equal(xp.breakdown.specializations, 30);
  assert.equal(xp.spent, 65);
  assert.deepEqual(xp.warnings, []);
});

test("Dedication is added on top of the exported characteristic", () => {
  // The preview has the species 2 + the Dedication item effect 1.
  const preview = { characteristics: { Cunning: { value: 3 } } };
  const { deltas, warnings } = residualCharacteristicDeltas(
    { Cunning: 3 },
    preview,
    dedicationAdvances(DEDICATED),
  );
  assert.equal(deltas.Cunning, 1); // 2 + 1 + 1 = 4, as Hyperdrive shows
  assert.deepEqual(warnings, []);
});

test("Dedication still lands when the talent tree supplied no Dedication effect", () => {
  // The specialization was not matched in the world, so only the species applies.
  const preview = { characteristics: { Cunning: { value: 2 } } };
  const { deltas } = residualCharacteristicDeltas({ Cunning: 3 }, preview, { Cunning: 1 });
  assert.equal(deltas.Cunning, 2);
});

test("counts Dedication advances from purchased nodes, not the Dedications map", () => {
  // The fixture's map still lists Intellect -> MARSHAL, a specialization the character
  // no longer owns; only Steel Hand's purchased DEDI node is a real advance.
  assert.deepEqual(dedicationAdvances(parsed), { Brawn: 1 });
});

test("persists characteristic residuals and purchased skill ranks", () => {
  // What an unsaved preview actor built from the build items alone already prepares.
  const preview = {
    characteristics: {
      Brawn: { value: 3 }, // species 2 + Steel Hand Dedication 1
      Agility: { value: 2 },
      Intellect: { value: 2 },
      Cunning: { value: 2 },
      Willpower: { value: 2 },
      Presence: { value: 2 },
    },
    skills: {
      Brawl: { rank: 3 }, // species + career + specialization free ranks
      Athletics: { rank: 1 },
      Cool: { rank: 1 },
      Coordination: { rank: 1 },
    },
  };
  const characteristics = residualCharacteristicDeltas(parsed.characteristics, preview, dedicationAdvances(parsed));
  assert.deepEqual(characteristics.deltas, {
    Brawn: 1, // exported 3 + Dedication 1 = 4, of which the species + Dedication supply 3
    Agility: 2,
    Intellect: 2,
    Cunning: 1,
    Willpower: 0,
    Presence: 0,
  });

  const skills = residualSkillDeltas(parsed.skills, preview);
  assert.equal(skills.deltas.Athletics, 1);
  assert.equal(skills.deltas.Brawl, 2);
  assert.equal(skills.deltas.Charm, 1);
  assert.deepEqual(skills.warnings, []);
});

test("does not subtract imported free ranks from Hyperdrive purchases", () => {
  const skills = residualSkillDeltas(
    [{ skill: "Melee", rank: 1 }],
    { skills: { Melee: { rank: 2 } } },
  );
  assert.deepEqual(skills, { deltas: { Melee: 1 }, warnings: [] });
});

test("canonicalizes purchased Hyperdrive skill ranks through import ids", () => {
  const skills = residualSkillDeltas([
    { key: "RANGHVY", skill: "Ranged (Heavy)", rank: 1 },
    { key: "OUT", skill: "Outer Rim", rank: 0 },
    { key: "XEN", skill: "Xenology", rank: 0 },
  ]);
  assert.deepEqual(skills, { deltas: { "Ranged: Heavy": 1 }, warnings: [] });
});

test("a characteristic no item supplies is persisted in full", () => {
  const { deltas, warnings } = residualCharacteristicDeltas(
    { Presence: 4 },
    { characteristics: {} },
  );
  assert.equal(deltas.Presence, 4);
  assert.deepEqual(warnings, []);
});

test("recovers ranked talent effects omitted by the specialization grid", () => {
  const recovered = rankedTalentResidualEffects(parsed, {
    materializedSpecializationKeys: ["STEELHAND"],
  });
  assert.deepEqual(recovered.effectsBySpecialization.DEATHWCOTR, [{
    name: "hyperdriveRank_TOUGH",
    changes: [{
      key: "system.stats.wounds.max",
      mode: 2,
      value: 2,
    }],
  }]);
  assert.match(recovered.warnings.join("\n"), /additional rank.*Toughened/i);
});
