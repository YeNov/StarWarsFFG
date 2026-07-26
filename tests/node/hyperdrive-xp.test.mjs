import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  baseCharacteristicDeltas,
  deriveXp,
  purchasedSkillDeltas,
  rankedTalentResidualEffects,
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

test("treats characteristics as pre-item values and skills as purchased ranks", () => {
  const characteristics = baseCharacteristicDeltas(
    parsed.characteristics,
    parsed.species.startingChars,
  );
  assert.deepEqual(characteristics.deltas, {
    Brawn: 1,
    Agility: 2,
    Intellect: 2,
    Cunning: 1,
    Willpower: 0,
    Presence: 0,
  });
  const skills = purchasedSkillDeltas(parsed.skills);
  assert.equal(skills.deltas.Athletics, 1);
  assert.equal(skills.deltas.Brawl, 2);
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
