import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import "./_stub/foundry-stub.mjs";
import { parseHyperdrive } from "../../modules/importer/hyperdrive/parse.js";

const RAW = JSON.parse(fs.readFileSync(new URL("./_fixtures/hyperdrive/mandalorian-warrior.json", import.meta.url)));

test("parses identity, accounting, species, characteristics, and derived totals", () => {
  const parsed = parseHyperdrive(RAW);
  assert.equal(parsed.name, "");
  assert.equal(parsed.credits, 0);
  assert.equal(parsed.biography, "This is a background story block");
  assert.deepEqual(parsed.characteristics, RAW.Characteristics);
  assert.equal(parsed.xp.source, -215);
  assert.deepEqual(parsed.derived, { wounds: 18, strain: 13, soak: 4 });
  assert.equal(parsed.species.key, "MANDOHUMAN");
  assert.equal(parsed.species.startingXP, 105);
  assert.deepEqual(parsed.species.startingAttrs, { woundThreshold: 11, strainThreshold: 10 });
  assert.deepEqual(parsed.species.selectedSkills, ["Brawl"]);
});

test("parses tree grids, force powers, skills, career ranks, and signatures from canonical fields", () => {
  const parsed = parseHyperdrive(RAW);
  assert.equal(parsed.specializations[0].grid[0][2], true);
  assert.equal(parsed.specializations[1].universal, true);
  assert.equal(parsed.forcePowers.find((power) => power.key === "CONJURE").paidCosts["1-0"], 15);
  assert.equal(parsed.skills.find((skill) => skill.skill === "Brawl").rank, 2);
  assert.deepEqual(parsed.careerRanks, ["Athletics", "Brawl", "Cool"]);
  assert.deepEqual(parsed.specRanks, ["Brawl", "Coordination"]);
  assert.deepEqual(parsed.signatureAbilities, []);
  assert.notEqual(parsed.specializations, RAW.BoughtTalents);
  assert.notEqual(parsed.forcePowers, RAW.BoughtPowers);
});

test("preserves equipment instances, separates cybernetics, and normalizes narrative metadata", () => {
  const parsed = parseHyperdrive(RAW);
  assert.equal(parsed.weapons[0].inventoryID, "12DEFEND_1785054958137");
  assert.equal(parsed.weapons[0].Attachments[0].Key, "COMBTEST");
  assert.equal(parsed.armour[0].ModStates["HC_1785054992381-ARMINS-SOAKADD"].installed[0], true);
  assert.equal(parsed.gear.length, 2);
  assert.equal(parsed.cybernetics[0].Key, "CYLEGII");
  assert.equal(parsed.obligations[0].text, "This is obligation details panel");
  assert.equal(parsed.duties[0].xp10, true);
  assert.equal(parsed.morality.score, 50);
  assert.equal(parsed.motivations[0].text, "This is motivation details panel");
  assert.equal(parsed.background.culture.key, null);
  assert.equal(parsed.background.culture.name, "Comfortable Beneficiaries");
  assert.equal(parsed.vehicles.length, 1);
  assert.equal(parsed.rules, "fad");
});

test("is null-safe and infers non-Force rulesets", () => {
  assert.doesNotThrow(() => parseHyperdrive({}));
  assert.equal(parseHyperdrive({ Duties: [{}] }).rules, "aor");
  assert.equal(parseHyperdrive({}).rules, "eote");
  assert.equal(parseHyperdrive({ Credits: "not-a-number" }).credits, 0);
});
