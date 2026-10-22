import test from "node:test";
import assert from "node:assert/strict";

import { rollActorFrom, rollSkillContext } from "../../modules/dice/roll-actor.js";

/**
 * Which actor the roll dialog reads optional buffs from. A sheet hands the dialog its live actor,
 * which for an unlinked token is the token's own copy; a pool sent to a player arrives as plain
 * data and can only name the world actor.
 */

const actor = (id) => ({ documentName: "Actor", id });

test("a sheet's live actor is used first, so an unlinked token's own actor is read", () => {
  assert.equal(rollActorFrom({ data: { document: actor("token-copy"), actor: { _id: "world" } } }, () => actor("world")).id, "token-copy");
});

test("an item's owner is used when the data has no live actor", () => {
  assert.equal(rollActorFrom({ data: { actor: { _id: "world" } }, item: { actor: actor("owner") } }, () => actor("world")).id, "owner");
});

test("a token's actor comes before the world actor", () => {
  assert.equal(rollActorFrom({ data: { token: { actor: actor("tok") }, actor: { _id: "world" } } }, () => actor("world")).id, "tok");
});

test("a sent pool's plain data falls back to the world actor", () => {
  assert.equal(rollActorFrom({ data: { document: { _id: "x" }, actor: { _id: "world" } } }, (id) => actor(id)).id, "world");
});

test("no actor anywhere gives null", () => {
  assert.equal(rollActorFrom({ data: {} }, () => undefined), null);
});

test("an actor named by uuid comes first, as for a crew member rolling from the vehicle's sheet", () => {
  const crew = actor("crew");
  const found = rollActorFrom(
    { data: { document: actor("vehicle") }, actorUuid: "Actor.crew" },
    () => actor("world"),
    (uuid) => (uuid === "Actor.crew" ? crew : undefined),
  );

  assert.equal(found.id, "crew");
});

test("a uuid that resolves to no actor falls back to the roll's own data", () => {
  const found = rollActorFrom({ data: { document: actor("sheet") }, actorUuid: "Actor.gone" }, () => undefined, () => undefined);

  assert.equal(found.id, "sheet");
});

/* A roll opened without the skill details (Token Action HUD calls DiceHelpers.displayRollDialog with
 * only the sheet data, the pool, the translated skill name and the weapon): the dialog works them
 * out from the actor, so roll options and optional buffs match the skill as they do from the sheet. */

const hero = {
  system: {
    characteristics: { Agility: { value: 3 }, Cunning: { value: 2 } },
    skills: {
      "Ranged: Light": { rank: 2, characteristic: "Agility", label: "SWFFG.SkillsNameRangedLight" },
      Stealth: { rank: 1, characteristic: "Agility", label: "SWFFG.SkillsNameStealth" },
      Streetwise: { rank: 0, characteristic: "Cunning", label: "SWFFG.SkillsNameStreetwise" },
    },
  },
};
const EN = { "SWFFG.SkillsNameRangedLight": "Ranged: Light", "SWFFG.SkillsNameStealth": "Stealth", "SWFFG.SkillsNameStreetwise": "Streetwise" };
const localize = (key) => EN[key] ?? key;

test("what the caller passed is kept", () => {
  assert.deepEqual(
    rollSkillContext({ actor: hero, skillName: "Stealth", skillKey: "Stealth", characteristic: 5, rank: 4 }, { localize }),
    { skillKey: "Stealth", characteristic: 5, rank: 4 },
  );
});

test("a weapon roll takes the weapon's skill", () => {
  const pistol = { type: "weapon", system: { skill: { value: "Ranged: Light" } } };
  assert.deepEqual(rollSkillContext({ actor: hero, item: pistol, skillName: "Ranged: Light" }, { localize }), { skillKey: "Ranged: Light", characteristic: 3, rank: 2 });
});

test("a skill roll is matched by its translated name, or by its key", () => {
  assert.deepEqual(rollSkillContext({ actor: hero, skillName: "Stealth" }, { localize }), { skillKey: "Stealth", characteristic: 3, rank: 1 });
  const fr = (key) => ({ "SWFFG.SkillsNameStreetwise": "Système D" })[key] ?? key;
  assert.deepEqual(rollSkillContext({ actor: hero, skillName: "Système D" }, { localize: fr }), { skillKey: "Streetwise", characteristic: 2, rank: 0 });
  assert.equal(rollSkillContext({ actor: hero, skillName: " Ranged: Light " }, { localize }).skillKey, "Ranged: Light");
});

test("a skill the configured list knows is found by its label there", () => {
  const configuredSkills = { Stealth: { label: "SWFFG.SkillsNameStealth" } };
  const actorWithoutLabels = { system: { characteristics: hero.system.characteristics, skills: { Stealth: { rank: 1, characteristic: "Agility" } } } };
  const fr = (key) => ({ "SWFFG.SkillsNameStealth": "Discrétion" })[key] ?? key;
  assert.equal(rollSkillContext({ actor: actorWithoutLabels, skillName: "Discrétion" }, { localize: fr, configuredSkills }).skillKey, "Stealth");
  assert.equal(rollSkillContext({ actor: actorWithoutLabels, skillName: "Discrétion" }, { localize: fr }).skillKey, null, "no label anywhere: no match");
});

test("a name that is no skill, or no actor, leaves the details unknown", () => {
  assert.deepEqual(rollSkillContext({ actor: hero, skillName: "Lightsaber" }, { localize }), { skillKey: null, characteristic: null, rank: null });
  assert.deepEqual(rollSkillContext({ actor: null, skillName: "Stealth" }, { localize }), { skillKey: null, characteristic: null, rank: null });
  assert.deepEqual(rollSkillContext({ actor: hero, skillName: "" }, { localize }), { skillKey: null, characteristic: null, rank: null });
});

test("a key passed without characteristic or rank gets them from the actor", () => {
  assert.deepEqual(rollSkillContext({ actor: hero, skillName: "Stealth", skillKey: "Stealth" }, { localize }), { skillKey: "Stealth", characteristic: 3, rank: 1 });
});
