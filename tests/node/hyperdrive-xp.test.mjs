import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";
import {
  deriveXp,
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

test("computes build-item-only residual characteristics and caps over-granted skills", () => {
  const characteristics = residualCharacteristicDeltas(parsed.characteristics, {
    Brawn: { value: 3 },
    Agility: { value: 2 },
    Intellect: { value: 2 },
    Cunning: { value: 2 },
    Willpower: { value: 2 },
    Presence: { value: 2 },
  });
  assert.deepEqual(characteristics.deltas, {
    Brawn: 0,
    Agility: 2,
    Intellect: 2,
    Cunning: 1,
    Willpower: 0,
    Presence: 0,
  });
  const skills = residualSkillDeltas(parsed.skills, { Brawl: { rank: 3 } });
  assert.equal(skills.deltas.Brawl, undefined);
  assert.match(skills.warnings.join("\n"), /Brawl.*capping at 0/);
});
