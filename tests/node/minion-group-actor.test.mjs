/**
 * The actor-facing side of the minion group rules: which actors are groups, where their damage
 * track lives, how a crew member's group skills scale when rolling for a minion vehicle, and when
 * toggling Minion Vehicle flips the prototype token's link.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isMinionVehicle,
  groupTrack,
  crewRollOptions,
  effectiveSkillRank,
  withGroupSkillRanks,
  prototypeLinkUpdate,
} from "../../modules/helpers/minion-group.js";

const vehicle = ({ minionVehicle, hull = { value: 0, max: 6 }, quantity = { value: 4, max: 4 }, isToken = false } = {}) => ({
  type: "vehicle",
  isToken,
  flags: minionVehicle === undefined ? {} : { starwarsffg: { config: { minionVehicle } } },
  system: { stats: { hullTrauma: hull }, quantity },
});

const flagChange = (minionVehicle) => ({ flags: { starwarsffg: { config: { minionVehicle } } } });

test("only a vehicle with the Minion Vehicle option ticked is a minion vehicle", () => {
  assert.equal(isMinionVehicle(vehicle({ minionVehicle: true })), true);
  assert.equal(isMinionVehicle(vehicle({ minionVehicle: false })), false);
  assert.equal(isMinionVehicle(vehicle()), false);
  assert.equal(isMinionVehicle({ type: "minion", flags: flagChange(true).flags }), false);
  assert.equal(isMinionVehicle(null), false);
});

test("a minion's group track is its wounds; a minion vehicle's is its hull", () => {
  const minion = {
    type: "minion",
    system: { stats: { wounds: { value: 5, max: 12 } }, unit_wounds: { value: 3 }, quantity: { value: 3, max: 4 } },
  };
  assert.deepEqual(groupTrack(minion), { path: "system.stats.wounds.value", damage: 5, perUnit: 3, size: 4 });

  // Prepared data: the per-vehicle threshold is `unit`, and `max` is the whole group's.
  assert.deepEqual(
    groupTrack(vehicle({ minionVehicle: true, hull: { value: 8, max: 24, unit: 6 } })),
    { path: "system.stats.hullTrauma.value", damage: 8, perUnit: 6, size: 4 },
  );
  // Unprepared data: the stored threshold is already per vehicle.
  assert.deepEqual(
    groupTrack(vehicle({ minionVehicle: true, hull: { value: 8, max: 6 } })),
    { path: "system.stats.hullTrauma.value", damage: 8, perUnit: 6, size: 4 },
  );
  assert.equal(groupTrack(vehicle({ minionVehicle: false })), null);
  assert.equal(groupTrack({ type: "rival", system: {} }), null);
});

test("crew roll options carry the group skill rank of the vehicle they are given", () => {
  assert.deepEqual(crewRollOptions(vehicle({ minionVehicle: true, quantity: { value: 3, max: 4 } })), { groupSkillRank: 2 });
  assert.deepEqual(crewRollOptions(vehicle({ minionVehicle: true, quantity: { value: 0, max: 4 } })), { groupSkillRank: 0 });
  assert.deepEqual(crewRollOptions(vehicle({ minionVehicle: false, quantity: { value: 3, max: 4 } })), {});
  assert.deepEqual(crewRollOptions(undefined), {});
});

test("only a group skill takes the group rank", () => {
  assert.equal(effectiveSkillRank({ rank: 1, groupskill: true }, { groupSkillRank: 3 }), 3);
  assert.equal(effectiveSkillRank({ rank: 1, groupskill: false }, { groupSkillRank: 3 }), 1);
  assert.equal(effectiveSkillRank({ rank: 2, groupskill: true }, {}), 2);
  assert.equal(effectiveSkillRank({ rank: 2, groupskill: true }), 2);
  assert.equal(effectiveSkillRank({ groupskill: true }, { groupSkillRank: 0 }), 0);
  assert.equal(effectiveSkillRank({ rank: "3" }), 3);
  assert.equal(effectiveSkillRank(undefined), 0);
});

test("group skill ranks are applied to a copy of the crew's data", () => {
  const system = {
    characteristics: { Agility: { value: 3 } },
    skills: {
      Gunnery: { rank: 1, groupskill: true, characteristic: "Agility" },
      Cool: { rank: 2, groupskill: false, characteristic: "Presence" },
    },
  };
  const scaled = withGroupSkillRanks(system, { groupSkillRank: 3 });
  assert.equal(scaled.skills.Gunnery.rank, 3);
  assert.equal(scaled.skills.Gunnery.characteristic, "Agility");
  assert.equal(scaled.skills.Cool.rank, 2);
  assert.equal(scaled.characteristics, system.characteristics);
  assert.equal(system.skills.Gunnery.rank, 1, "the crew actor's own data is untouched");
  assert.equal(withGroupSkillRanks(system, {}), system);
  assert.equal(withGroupSkillRanks(system), system);
});

test("switching Minion Vehicle unlinks or relinks the prototype token", () => {
  assert.deepEqual(prototypeLinkUpdate(vehicle({ minionVehicle: false }), flagChange(true)), { actorLink: false });
  assert.deepEqual(prototypeLinkUpdate(vehicle({ minionVehicle: true }), flagChange(false)), { actorLink: true });
  assert.deepEqual(prototypeLinkUpdate(vehicle(), flagChange(true)), { actorLink: false });
  // Sheet Options sends dotted keys, which may reach _preUpdate flat or partly expanded.
  assert.deepEqual(prototypeLinkUpdate(vehicle(), { "flags.starwarsffg.config.minionVehicle": true }), { actorLink: false });
  assert.deepEqual(prototypeLinkUpdate(vehicle(), { flags: { "starwarsffg.config.minionVehicle": true } }), { actorLink: false });
});

test("the prototype token is left alone unless the option changes on a world vehicle", () => {
  assert.equal(prototypeLinkUpdate(vehicle({ minionVehicle: true }), flagChange(true)), null, "Accept rewrites every option");
  assert.equal(prototypeLinkUpdate(vehicle({ minionVehicle: false, isToken: true }), flagChange(true)), null);
  assert.equal(prototypeLinkUpdate({ type: "minion", flags: {} }, flagChange(true)), null);
  assert.equal(prototypeLinkUpdate(vehicle(), { name: "TIE Squadron" }), null);
  assert.equal(prototypeLinkUpdate(vehicle(), undefined), null);
});
