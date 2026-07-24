/**
 * Node tests for draft serialization / migration / byte-budget / rehydration (Stage 13, D5).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  serializeDraft,
  deserializeDraft,
  measureDraftBytes,
  isWithinBudget,
  compactDraft,
  rehydrateRef,
  NewerSchemaError,
  CorruptDraftError,
} from "../../modules/char-creator/draft-schema.js";
import { DRAFT_SCHEMA_VERSION, DRAFT_MAX_BYTES } from "../../modules/char-creator/constants.js";

function sampleData({ gearCount = 2, snapshotPad = 40 } = {}) {
  const gear = Array.from({ length: gearCount }, (_, i) => ({
    ref: {
      uuid: `Compendium.pack.Item.gear${i}`,
      name: `Gear ${i}`,
      type: "weapon",
      img: "icons/x.png",
      snapshot: { name: `Gear ${i}`, system: { description: "x".repeat(snapshotPad), price: { value: 100 } } },
    },
    cost: 100,
  }));
  return {
    identity: { name: "Kel", img: "" },
    commitId: "COMMIT0000000001",
    grants: { gm: { credits: 500 }, bonus: { xp: 0, credits: 0 } },
    selected: {
      background: { culture: null, hook: null, forceAttitude: null },
      startingBonus: null,
      obligations: [],
      species: { uuid: "Compendium.pack.Item.human", name: "Human", type: "species", snapshot: { system: { startingXP: 100 } } },
      speciesSkillRankChoices: {},
      speciesSkillRankChoiceBranches: {},
      career: null,
      careerCareerSkillRanks: [],
      specialization: null,
      specializationCareerSkillRanks: [],
      motivations: [],
    },
    available: { specializations: [] },
    purchases: { xp: { characteristics: [], skills: [], talents: [], specializations: [], forcePowers: [] }, credits: gear },
    initial: { duty: 10, obligation: 10, morality: 50 },
    spendingCredits: 42,
  };
}

const sampleCommit = {
  commitId: "COMMIT0000000001",
  firstAttemptAt: "2026-07-21T00:00:00.000Z",
  xp: { total: 100, available: 20 },
  fingerprint: "fp-abc123",
};

test("round-trips {data, commit}, keeping commit beside data", () => {
  const data = sampleData();
  const record = serializeDraft({ data, commit: sampleCommit }, { savedAt: "2026-07-21T00:00:00.000Z" });
  assert.equal(record.schemaVersion, DRAFT_SCHEMA_VERSION);
  assert.equal(record.characterName, "Kel");
  const back = deserializeDraft(record);
  assert.deepEqual(back.data, data);
  assert.deepEqual(back.commit, sampleCommit);
});

test("frozen-commit durability: the commit (incl fingerprint) survives round-trip deep-equal", () => {
  const record = serializeDraft({ data: sampleData(), commit: sampleCommit });
  const back = deserializeDraft(record);
  assert.deepEqual(back.commit, sampleCommit);
  assert.equal(back.commit.fingerprint, "fp-abc123");
});

test("a null commit round-trips as null (draft not yet frozen)", () => {
  const record = serializeDraft({ data: sampleData(), commit: null });
  assert.equal(deserializeDraft(record).commit, null);
});

test("a NEWER schemaVersion is refused (NewerSchemaError)", () => {
  assert.throws(() => deserializeDraft({ schemaVersion: DRAFT_SCHEMA_VERSION + 1, data: {} }), NewerSchemaError);
});

test("a corrupt draft is refused (CorruptDraftError), never a crash", () => {
  assert.throws(() => deserializeDraft(null), CorruptDraftError);
  assert.throws(() => deserializeDraft({ schemaVersion: 1 }), CorruptDraftError); // no data
  assert.throws(() => deserializeDraft({ foo: 1 }), CorruptDraftError); // no schemaVersion
});

test("byte measurement is UTF-8 bytes; a normal draft is within the 64 KiB budget", () => {
  const record = serializeDraft({ data: sampleData(), commit: sampleCommit });
  const bytes = measureDraftBytes(record);
  // a multi-byte char proves we count bytes, not UTF-16 units
  assert.ok(measureDraftBytes({ s: "€" }) === new TextEncoder().encode(JSON.stringify({ s: "€" })).byteLength);
  assert.ok(bytes <= DRAFT_MAX_BYTES);
  assert.ok(isWithinBudget(record));
});

test("a maximum-content draft that exceeds budget is brought under it by the uuid-only fallback", () => {
  const record = serializeDraft({ data: sampleData({ gearCount: 40, snapshotPad: 3000 }), commit: sampleCommit });
  assert.ok(measureDraftBytes(record) > DRAFT_MAX_BYTES, "the fixture should exceed budget with full snapshots");
  const compacted = compactDraft(record);
  assert.ok(isWithinBudget(compacted), "compaction should bring it within budget");
  // compaction drops compendium snapshots but keeps the uuids
  assert.equal(compacted.data.purchases.credits[0].ref.snapshot, undefined);
  assert.equal(compacted.data.purchases.credits[0].ref.uuid, "Compendium.pack.Item.gear0");
  // input record is not mutated
  assert.ok(record.data.purchases.credits[0].ref.snapshot !== undefined);
});

test("rehydrateRef: obligation user-edits survive a snapshot refresh", () => {
  const stored = { uuid: "Compendium.p.Item.ob", name: "Debt", type: "obligation", snapshot: { name: "Debt", system: { magnitude: 15, edited: true } } };
  const fresh = { name: "Debt (updated)", system: { magnitude: 5, edited: false } };
  const { ref, warning } = rehydrateRef(stored, fresh);
  assert.equal(warning, false);
  assert.equal(ref.snapshot.name, "Debt (updated)"); // fresh top-level
  assert.equal(ref.snapshot.system.magnitude, 15); // user edit preserved
  assert.equal(ref.snapshot.system.edited, true);
});

test("rehydrateRef: a non-obligation ref takes the fresh system; an unresolvable ref warns", () => {
  const species = { uuid: "u", name: "Human", type: "species", snapshot: { system: { startingXP: 90 } } };
  const fresh = { system: { startingXP: 100 } };
  assert.equal(rehydrateRef(species, fresh).ref.snapshot.system.startingXP, 100);

  const { ref, warning } = rehydrateRef(species, null);
  assert.equal(warning, true);
  assert.equal(ref, species); // kept as-is
});
