/**
 * Node tests for applyBuild (Stage 10) — the single builder, all collaborators injected.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { applyBuild } from "../../modules/char-creator/apply-build.js";
import { assignWizardIdentity } from "../../modules/char-creator/build-item-schema.js";
import { DEDICATION_ATTRIBUTE_KEY } from "../../modules/char-creator/dedication.js";
import {
  normalizeCommitSource,
  sanitizeCommitRequest,
} from "../../modules/char-creator/commit-normalize.js";

/** Fixture mirroring the real applyCharacteristicDeltas (Brawn/Willpower derivations). */
function fixtureDeltas(system, deltas) {
  const out = structuredClone(system);
  for (const [ch, d] of Object.entries(deltas)) {
    if (!d) continue;
    out.characteristics[ch].value += d;
    if (ch === "Brawn") {
      out.stats.wounds.max += d;
      out.stats.soak.value += d;
      out.stats.encumbrance.max += d;
    }
    if (ch === "Willpower") out.stats.strain.max += d;
  }
  return out;
}

function makeDeps(calls) {
  return {
    creationDefaults: {
      img: "systems/starwarsffg/images/defaults/actors/character.png",
      prototypeToken: { actorLink: true },
      system: {
        characteristics: { Brawn: { value: 2 }, Willpower: { value: 2 }, Agility: { value: 2 } },
        skills: {
          Astrogation: { rank: 0, label: "Astrogation", careerskill: false },
          Brawl: { rank: 0, label: "Brawl", careerskill: false },
          Coordination: { rank: 0, label: "Coordination", careerskill: false },
          KnowledgeLore: { rank: 0, label: "Knowledge: Lore", careerskill: false },
        },
        stats: { wounds: { max: 10 }, soak: { value: 2 }, encumbrance: { max: 5 }, strain: { max: 10 }, credits: { value: 0 } },
        experience: {},
      },
    },
    applyCharacteristicDeltas: (system, deltas) => { calls?.deltas?.push(deltas); return fixtureDeltas(system, deltas); },
    toItemData: (ref, options) => { calls?.items?.push({ ref, options }); return { name: ref.name, type: ref.type }; },
  };
}

function makeDraft(overrides = {}) {
  return {
    identity: { name: "Kel", img: "" },
    commitId: "COMMIT0000000001",
    grants: { gm: { credits: 500 }, bonus: { xp: 0, credits: 0, duty: 0, obligation: 0, conflict: 0, morality: 0 } },
    selected: {
      background: { culture: null, hook: null, forceAttitude: { uuid: "fa1", name: "Guardian", type: "background", snapshot: {} } },
      startingBonus: null,
      obligations: [],
      species: { uuid: "sp1", name: "Human", type: "species", snapshot: { system: { startingXP: 100 } } },
      speciesSkillRankChoices: {},
      speciesSkillRankChoiceBranches: {},
      career: null,
      careerCareerSkillRanks: [],
      specialization: null,
      specializationCareerSkillRanks: [],
      rules: "fad",
      motivations: [],
    },
    available: { specializations: [] },
    purchases: {
      xp: {
        characteristics: [{ key: "Brawn", value: 3, cost: 30 }, { key: "Brawn", value: 4, cost: 40 }],
        skills: [{ key: "Astrogation", cost: 10 }],
        talents: [],
        specializations: [],
        forcePowers: [],
      },
      credits: [],
    },
    initial: { duty: 10, obligation: 10, morality: 50 },
    spendingCredits: 42,
    ...overrides,
  };
}

test("characteristic + derived stats: 2 Brawn purchases raise Brawn, wounds, soak, encumbrance", () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  assert.equal(actorData.system.characteristics.Brawn.value, 4);
  assert.equal(actorData.system.stats.wounds.max, 12);
  assert.equal(actorData.system.stats.soak.value, 4);
  assert.equal(actorData.system.stats.encumbrance.max, 7);
});

test("skill purchases add ranks", () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  assert.equal(actorData.system.skills.Astrogation.rank, 1);
});

test("career and specialization skills are marked as career skills", () => {
  const draft = makeDraft();
  draft.selected.career = {
    uuid: "career1",
    name: "Explorer",
    type: "career",
    snapshot: { system: { careerSkills: { careerSkill0: "Astrogation" } } },
  };
  draft.selected.specialization = {
    uuid: "spec1",
    name: "Fringer",
    type: "specialization",
    snapshot: { system: { careerSkills: { careerSkill0: "Coordination" } } },
  };
  draft.purchases.xp.specializations = [
    {
      cost: 20,
      ref: {
        uuid: "spec2",
        name: "Scholar",
        type: "specialization",
        snapshot: { system: { careerSkills: { careerSkill0: "Knowledge: Lore" } } },
      },
    },
  ];

  const { actorData } = applyBuild(draft, makeDeps());

  assert.equal(actorData.system.skills.Astrogation.careerskill, true);
  assert.equal(actorData.system.skills.Coordination.careerskill, true);
  assert.equal(actorData.system.skills.KnowledgeLore.careerskill, true);
  assert.equal(actorData.system.skills.Brawl.careerskill, false);
});

test("XP, credits (incl. spendingCredits) and the selected ruleset track match the calculators", () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  assert.deepEqual(actorData.system.experience, { total: 100, available: 100 - 70 - 10 });
  assert.equal(actorData.system.stats.credits.value, 500 + 42); // available + spendingCredits
  assert.equal(actorData.system.morality.value, 50);
  assert.equal(actorData.system.duty, undefined);
  assert.equal(actorData.system.obligation, undefined);
});

test("base identity: name, img, prototypeToken from creationDefaults", () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  assert.equal(actorData.name, "Kel");
  assert.equal(actorData.type, "character");
  assert.equal(actorData.img, "systems/starwarsffg/images/defaults/actors/character.png");
  assert.deepEqual(actorData.prototypeToken, { actorLink: true, name: "Kel" });
});

test("force-attitude background is included when selected", () => {
  const calls = { deltas: [], items: [] };
  applyBuild(makeDraft(), makeDeps(calls));
  assert.ok(calls.items.some((c) => c.ref.uuid === "fa1"));
});

test("force-attitude background is excluded outside Force and Destiny", () => {
  const calls = { deltas: [], items: [] };
  const draft = makeDraft();
  draft.selected.rules = "aor";
  applyBuild(draft, makeDeps(calls));
  assert.ok(!calls.items.some((call) => call.ref.uuid === "fa1"));
});

test("items are built via the injected toItemData (species + forceAttitude present)", () => {
  const calls = { deltas: [], items: [] };
  const { actorData } = applyBuild(makeDraft(), makeDeps(calls));
  const names = actorData.items.map((it) => it.name);
  assert.ok(names.includes("Human"));
  assert.ok(names.includes("Guardian"));
});

test("species skill-rank choices are baked onto the species item", () => {
  const calls = { deltas: [], items: [] };
  const draft = makeDraft();
  draft.selected.species.snapshot.system.creation = {
    skillRankChoices: [
      { id: "human-additional-non-career-skills", count: 2, rank: 1, pool: "nonCareer" },
      { id: "specialist-double-rank", count: 1, rank: 2, pool: "list", skills: ["Coordination"] },
    ],
  };
  draft.selected.speciesSkillRankChoices = {
    "human-additional-non-career-skills": ["Astrogation", "Coordination"],
    "specialist-double-rank": ["Coordination"],
  };

  applyBuild(draft, makeDeps(calls));

  const speciesCall = calls.items.find((call) => call.ref.uuid === "sp1");
  assert.deepEqual(speciesCall.options.rankGrants, ["Astrogation", "Coordination", "Coordination", "Coordination"]);
});

test("Dedication talent choices are passed as specialization node attribute grants", () => {
  const calls = { deltas: [], items: [] };
  const draft = makeDraft();
  draft.selected.specialization = {
    uuid: "spec1",
    name: "Survivalist",
    type: "specialization",
    snapshot: {
      system: {
        talents: {
          talent4: { name: "Dedication", attributes: {} },
        },
      },
    },
  };
  draft.purchases.xp.talents = [{ key: "talent4", cost: 10, characteristic: "Brawn" }];

  applyBuild(draft, makeDeps(calls));

  const specCall = calls.items.find((call) => call.ref.uuid === "spec1");
  assert.deepEqual(specCall.options.learnedKeys, ["talent4"]);
  assert.deepEqual(specCall.options.nodeAttributeGrants, {
    talent4: {
      [DEDICATION_ATTRIBUTE_KEY]: { modtype: "Characteristic", mod: "Brawn", value: 1 },
    },
  });
});

test("the injected applyCharacteristicDeltas is called once with aggregated deltas", () => {
  const calls = { deltas: [], items: [] };
  applyBuild(makeDraft(), makeDeps(calls));
  assert.equal(calls.deltas.length, 1);
  assert.deepEqual(calls.deltas[0], { Brawn: 2 });
});

test("the input draft is not mutated", () => {
  const draft = makeDraft();
  const before = structuredClone(draft);
  applyBuild(draft, makeDeps());
  assert.deepEqual(draft, before);
});

test("player attachment purchases survive build, socket sanitization, and GM normalization", async () => {
  const draft = makeDraft();
  draft.purchases.credits = [
    {
      id: "weapon-purchase",
      cost: 400,
      ref: {
        uuid: "weapon-1",
        name: "Training Lightsaber",
        type: "weapon",
        snapshot: { name: "Training Lightsaber", type: "weapon", system: { itemattachment: [] }, effects: [] },
      },
    },
    {
      id: "attachment-purchase",
      attachTo: "weapon-purchase",
      cost: 100,
      ref: {
        uuid: "attachment-1",
        name: "Balanced Hilt",
        type: "itemattachment",
        snapshot: {
          name: "Balanced Hilt",
          type: "itemattachment",
          system: { hardpoints: { value: 1 }, itemattachment: [] },
          effects: [{ name: "Balanced Hilt Effect" }],
        },
      },
    },
  ];
  const deps = makeDeps();
  deps.toItemData = (ref) => structuredClone(ref.snapshot);

  const { actorData } = applyBuild(draft, deps);
  const weapon = actorData.items.find((item) => item.name === "Training Lightsaber");

  assert.equal(actorData.items.some((item) => item.name === "Balanced Hilt"), false);
  assert.equal(weapon.system.itemattachment.length, 1);
  assert.equal(weapon.system.itemattachment[0].name, "Balanced Hilt");
  assert.equal(weapon.effects[0].name, "Balanced Hilt Effect");

  const commit = {
    userId: "player-1",
    commitId: draft.commitId,
    firstAttemptAt: "2026-07-25T12:00:00.000Z",
    xp: { total: 100, available: 20 },
  };
  await assignWizardIdentity(actorData, commit);
  assert.match(weapon.system.itemattachment[0]._id, /^[0-9A-Za-z]{16}$/);
  const sanitized = sanitizeCommitRequest({ source: actorData, commit }, "player-1");
  const { source } = await normalizeCommitSource(sanitized.source, sanitized.commit);
  const committedWeapon = source.items.find((item) => item.name === "Training Lightsaber");

  assert.equal(committedWeapon.system.itemattachment.length, 1);
  assert.equal(committedWeapon.system.itemattachment[0].name, "Balanced Hilt");
  assert.match(committedWeapon.system.itemattachment[0]._id, /^[0-9A-Za-z]{16}$/);
  assert.equal(committedWeapon.effects[0].name, "Balanced Hilt Effect");
  assert.match(committedWeapon._id, /^[0-9A-Za-z]{16}$/);
});

test("only the highest-soak purchased armor is equipped for derived soak calculation", () => {
  const draft = makeDraft();
  draft.purchases.credits = [
    {
      id: "armour-light",
      cost: 200,
      ref: {
        uuid: "armor-1",
        name: "Padded Armor",
        type: "armour",
        snapshot: { name: "Padded Armor", type: "armour", system: { soak: { value: 1 }, equippable: { equipped: false } } },
      },
    },
    {
      id: "armour-heavy",
      cost: 400,
      ref: {
        uuid: "armor-2",
        name: "Heavy Clothing",
        type: "armour",
        snapshot: { name: "Heavy Clothing", type: "armour", system: { soak: { value: 2 }, equippable: { equipped: false } } },
      },
    },
  ];
  const deps = makeDeps();
  deps.toItemData = (ref) => structuredClone(ref.snapshot);

  const { actorData } = applyBuild(draft, deps);
  const light = actorData.items.find((item) => item.name === "Padded Armor");
  const heavy = actorData.items.find((item) => item.name === "Heavy Clothing");

  assert.equal(light.system.equippable.equipped, false);
  assert.equal(heavy.system.equippable.equipped, true);
});
