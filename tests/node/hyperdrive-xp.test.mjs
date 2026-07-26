import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  deriveXp,
  rankedTalentResidualEffects,
  residualCharacteristicDeltas,
  residualSkillDeltas,
} from "../../modules/importer/hyperdrive/to-actor.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));
const parsed = parseHyperdrive(RAW);

test("derives total/spent/available XP and preserves an overspent export", () => {
  const xp = deriveXp(parsed, { Brawn: 1 });
  assert.deepEqual({ total: xp.total, spent: xp.spent, available: xp.available }, {
    total: 140,
    spent: 355,
    available: -215,
  });
  assert.match(xp.warnings[0], /over budget/i);
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
