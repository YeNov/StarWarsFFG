/**
 * Node tests for applyBuild (Stage 10) — the single builder, all collaborators injected.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { applyBuild } from "../../modules/char-creator/apply-build.js";

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
        skills: { Astrogation: { rank: 0 }, Coordination: { rank: 0 } },
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
      rules: "fad",
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

test("XP, credits (incl. spendingCredits) and obligation match the calculators", () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  assert.deepEqual(actorData.system.experience, { total: 100, available: 100 - 70 - 10 });
  assert.equal(actorData.system.stats.credits.value, 500 + 42); // available + spendingCredits
  assert.equal(actorData.system.morality.value, 50); // fad → morality key
});

test("base identity: name, img, prototypeToken from creationDefaults", () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  assert.equal(actorData.name, "Kel");
  assert.equal(actorData.type, "character");
  assert.equal(actorData.img, "systems/starwarsffg/images/defaults/actors/character.png");
  assert.deepEqual(actorData.prototypeToken, { actorLink: true, name: "Kel" });
});

test("force-attitude is INCLUDED under fad and EXCLUDED otherwise", () => {
  const fadCalls = { deltas: [], items: [] };
  applyBuild(makeDraft(), makeDeps(fadCalls));
  assert.ok(fadCalls.items.some((c) => c.ref.uuid === "fa1"));

  const eoteCalls = { deltas: [], items: [] };
  const eoteDraft = makeDraft();
  eoteDraft.selected.rules = "eote";
  applyBuild(eoteDraft, makeDeps(eoteCalls));
  assert.ok(!eoteCalls.items.some((c) => c.ref.uuid === "fa1"));
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

test("credit-purchased attachments are nested into their target item", () => {
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
});
