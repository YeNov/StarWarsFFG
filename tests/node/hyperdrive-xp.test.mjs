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
    characteristics: 170, // Agility 2->4 (70), Intellect 2->4 (70), Cunning 2->3 (30)
    specializations: 10, // Death Watch is universal, a flat 10
    skills: 25, // Charm 10 (non-career) + Coercion/Survival/Vigilance 5 each
    total: 380,
  });
  assert.equal(xp.spent, 380);
});

test("reports a spend that does not reconcile with the exported remaining XP", () => {
  const xp = deriveXp(parsed);
  // 140 - 380 = -240, but the export claims -215: the fixture's own counter is 25 XP
  // adrift. Deriving `spent` as `total - available` would have hidden this entirely.
  assert.match(xp.warnings.join("\n"), /does not reconcile.*difference of 25 XP/s);
});

test("counts Dedication advances from purchased nodes, not the Dedications map", () => {
  // The fixture's map still lists Intellect -> MARSHAL, a specialization the character
  // no longer owns; only Steel Hand's purchased DEDI node is a real advance.
  assert.deepEqual(dedicationAdvances(parsed), { Brawn: 1 });
});

test("persists only the characteristic and skill residual left by the build items", () => {
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
  const characteristics = residualCharacteristicDeltas(parsed.characteristics, preview);
  assert.deepEqual(characteristics.deltas, {
    Brawn: 0, // fully supplied by the species + Dedication — persisting 1 would double-count
    Agility: 2,
    Intellect: 2,
    Cunning: 1,
    Willpower: 0,
    Presence: 0,
  });

  const skills = residualSkillDeltas(parsed.skills, preview);
  assert.equal(skills.deltas.Athletics, undefined); // the career's free rank covers it
  assert.equal(skills.deltas.Brawl, undefined); // three free ranks already exceed the exported 2
  assert.equal(skills.deltas.Charm, 1); // no item grants Charm, so it is genuinely purchased
  assert.match(skills.warnings.join("\n"), /Skill Brawl: imported items grant 3 free rank\(s\)/);
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
