/**
 * Node tests for the PC wizard's saved draft (modules/char-creator/draft-schema.js): the pure half
 * of "save and resume". The wizard stores one draft per player as a record on the player's own
 * User; this file covers what that record holds, how it is read back, and what the pure helpers do
 * with old, oversized and stale content. Writing the record to the User, the debounce, the lock,
 * clearing it and the resume banner need Foundry, so they are tested there.
 *
 * Rules from docs/pc-wizard-guide.md ("Drafts: resume and discard") and the design document
 * superpowers/docs/plans/PcWizard/pc_wizard_design_doc.md (5.7 and 5.8.2):
 *   - The record is schema version 1: system version, save time, the character's name, the commit
 *     (null until a Create attempt freezes it) and the build state. The commit sits BESIDE the
 *     build; whether a draft is frozen is read from `commit !== null`.
 *   - A newer-version or unreadable draft is never resumed; the player is offered a discard.
 *   - The draft must stay within 64 KiB (65,536 UTF-8 bytes, owner-confirmed 2026-07-21,
 *     docs/superpowers/reports/2026-07-22-pc-wizard-rewrite-handoff.md item 7). A bigger draft is
 *     compacted: items found in a compendium are stored as a reference only and re-read on resume.
 *   - On resume each selection is refreshed from its source where possible; anything that can no
 *     longer be found is kept as stored, with a warning.
 *   - The `*_2k_credits` starting-bonus keys keep their names because saved drafts store them
 *     (starting-bonus.js, ruling R17).
 *
 * Every fixture here is synthetic. Expected values are written out, not computed with the
 * functions under test, and every "stored" read goes through JSON text because that is how the
 * User flag is kept.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  serializeDraft,
  deserializeDraft,
  measureDraftBytes,
  isWithinBudget,
  compactDraft,
  rehydrateRef,
  normalizeDraftRules,
  NewerSchemaError,
  CorruptDraftError,
} from "../../modules/char-creator/draft-schema.js";

const COMMIT_ID = "Zk3mQ9vT0pLx7RcA";
const SAVED_AT = "2026-07-21T09:30:00.000Z";
const SAVE_META = { systemVersion: "2.1.4", savedAt: SAVED_AT };

const SPECIES_UUID = "Compendium.testpack.species.Item.spTestHuman00001";
const OBLIGATION_UUID = "Compendium.testpack.obligations.Item.obTestDebt00001";
const CAREER_UUID = "Compendium.testpack.careers.Item.caTestScout00001";
const SPECIALIZATION_UUID = "Compendium.testpack.specs.Item.sdTestRanger0001";
const FORCE_POWER_UUID = "Compendium.testpack.powers.Item.fpTestSense00001";
const WEAPON_UUID = "Compendium.testpack.gear.Item.wpTestRifle000001";
const ATTACHMENT_UUID = "Compendium.testpack.gear.Item.atTestScope000001";
const WORLD_GEAR_UUID = "Item.wgTestKit0000001";

/** A selection as the wizard stores it: the item's identity plus a copy of its data. */
function itemRef(uuid, name, type, system) {
  return { uuid, name, type, img: "icons/svg/item-bag.svg", snapshot: { name, type, system } };
}

/**
 * A fresh, representative mid-build draft: the durable fields of the wizard state (identity,
 * options, commitId, grants, selected, purchases, initial, spendingCredits) as design 5.7 lists
 * them, filled in as a player would. The derived `available` lists are left out on purpose; the
 * case about them adds them.
 */
function buildDraft() {
  return {
    identity: { name: "Kel Varn", img: "", tokenImg: "" },
    options: { removeStartingSkillRankCap: false },
    commitId: COMMIT_ID,
    grants: {
      gm: { credits: 500 },
      extra: { xp: 0, credits: 0 },
      bonus: { xp: 0, credits: 2500, duty: 0, obligation: 0, conflict: 0, morality: 0 },
    },
    selected: {
      background: { culture: null, hook: null, forceAttitude: null },
      startingBonus: "fad_2k_credits",
      obligations: [itemRef(OBLIGATION_UUID, "Test Debt", "obligation", { type: "morality", magnitude: 10 })],
      species: itemRef(SPECIES_UUID, "Test Human", "species", { startingXP: 100 }),
      speciesSkillRankChoices: {},
      speciesSkillRankChoiceBranches: {},
      career: itemRef(CAREER_UUID, "Test Scout", "career", { careerSkills: { careerSkill0: "Athletics", careerSkill1: "Cool" } }),
      careerCareerSkillRanks: ["Athletics", "Cool"],
      specialization: itemRef(SPECIALIZATION_UUID, "Test Ranger", "specialization", {
        talents: { talent0: { name: "Test Talent A" }, talent1: { name: "Test Talent B" } },
      }),
      specializationCareerSkillRanks: ["Cool"],
      rules: "fad",
      motivations: [],
    },
    purchases: {
      xp: {
        characteristics: [{ key: "Brawn", value: 3, cost: 30 }],
        skills: [{ key: "Athletics", value: 1, cost: 5 }],
        talents: [{ key: "talent0", cost: 5 }],
        specializations: [],
        forcePowers: [{ ref: itemRef(FORCE_POWER_UUID, "Test Sense", "forcepower", { upgrades: {} }), cost: 10 }],
      },
      credits: [
        { id: "buyWeapon0000001", ref: itemRef(WEAPON_UUID, "Test Rifle", "weapon", { hardpoints: { value: 2 } }), cost: 200, quantity: 1 },
        { id: "buyScope00000001", ref: itemRef(ATTACHMENT_UUID, "Test Scope", "itemattachment", { type: "weapon" }), cost: 50, attachTo: "buyWeapon0000001" },
        { id: "buyKit0000000001", ref: itemRef(WORLD_GEAR_UUID, "Test Kit", "gear", { price: { value: 25 } }), cost: 25, quantity: 1 },
      ],
    },
    initial: { duty: 10, obligation: 10, morality: 50 },
    spendingCredits: 42,
  };
}

/**
 * The commit a Create attempt freezes. The wizard writes commitId, userId, firstAttemptAt and xp;
 * the design also lists a fingerprint, so one is carried here to show the record keeps the commit
 * exactly as given.
 */
function frozenCommit() {
  return {
    commitId: COMMIT_ID,
    userId: "usrTestPlayer001",
    firstAttemptAt: "2026-07-21T10:00:00.000Z",
    xp: { total: 100, available: 60 },
    fingerprint: "fp-0123456789abcdef",
  };
}

/** The draft with enough gear that its full record is over the size budget. */
function bulkyDraft() {
  const draft = buildDraft();
  draft.purchases.credits = Array.from({ length: 40 }, (_, index) => ({
    id: `buyBulk${String(index).padStart(9, "0")}`,
    ref: itemRef(`Compendium.testpack.gear.Item.gearBulk${index}`, `Bulk Gear ${index}`, "gear", { description: "x".repeat(3000) }),
    cost: 10,
    quantity: 1,
  }));
  return draft;
}

/** What the User flag does to a record: it is kept as JSON text and parsed on the way back. */
function throughStorage(record) {
  return JSON.parse(JSON.stringify(record));
}

// ---------------------------------------------------------------------------------------------
// What the saved record holds
// ---------------------------------------------------------------------------------------------

test("a saved draft is a version 1 record holding the character name, the commit and the build", () => {
  const data = buildDraft();
  const commit = frozenCommit();

  const record = serializeDraft({ data, commit }, SAVE_META);

  assert.deepEqual(record, {
    schemaVersion: 1,
    systemVersion: "2.1.4",
    savedAt: "2026-07-21T09:30:00.000Z",
    characterName: "Kel Varn",
    commit: frozenCommit(),
    data: buildDraft(),
  });
});

test("a draft written to storage and read back resumes the same build under the same commit ID", () => {
  const expectedBuild = buildDraft();
  const record = serializeDraft({ data: buildDraft(), commit: null }, SAVE_META);

  const resumed = deserializeDraft(throughStorage(record));

  assert.deepEqual(resumed.data, expectedBuild);
  assert.equal(resumed.data.commitId, "Zk3mQ9vT0pLx7RcA");
  assert.equal(resumed.data.spendingCredits, 42);
  assert.equal(resumed.schemaVersion, 1);
});

test("a draft with a frozen commit resumes frozen, the commit unchanged and kept beside the build", () => {
  const record = serializeDraft({ data: buildDraft(), commit: frozenCommit() }, SAVE_META);

  const resumed = deserializeDraft(throughStorage(record));

  assert.deepEqual(resumed.commit, frozenCommit());
  assert.equal(resumed.data.commitId, "Zk3mQ9vT0pLx7RcA");
  assert.equal("commit" in resumed.data, false);
  assert.equal("commitFrozen" in resumed.data, false);
});

test("a draft with no commit resumes not frozen, whether the commit is null or left out", () => {
  const withNull = serializeDraft({ data: buildDraft(), commit: null }, SAVE_META);
  const omitted = serializeDraft({ data: buildDraft() }, SAVE_META);

  assert.equal(deserializeDraft(throughStorage(withNull)).commit, null);
  assert.equal(deserializeDraft(throughStorage(omitted)).commit, null);
});

test("a record saved without a system version stores null and is stamped with the time of the save", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-07-21T12:00:00.000Z") });

  const record = serializeDraft({ data: buildDraft() });

  assert.equal(record.systemVersion, null);
  assert.equal(record.savedAt, "2026-07-21T12:00:00.000Z");
});

test("the record mirrors the character's name and stores an empty name for a draft with none", () => {
  const unnamed = buildDraft();
  unnamed.identity.name = "";
  const noIdentity = buildDraft();
  delete noIdentity.identity;

  const named = serializeDraft({ data: buildDraft() }, SAVE_META);
  const withEmptyName = serializeDraft({ data: unnamed }, SAVE_META);
  const withoutIdentity = serializeDraft({ data: noIdentity }, SAVE_META);

  assert.equal(named.characterName, "Kel Varn");
  assert.equal(withEmptyName.characterName, "");
  assert.equal(withoutIdentity.characterName, "");
});

test("saving a draft that was loaded with warnings does not store the warnings", () => {
  const stored = throughStorage(serializeDraft({ data: buildDraft(), commit: null }, SAVE_META));
  const loaded = { ...deserializeDraft(stored), warnings: ["SWFFG.CharacterCreator.Draft.RefreshWarning"] };

  const resaved = serializeDraft(loaded, SAVE_META);

  assert.deepEqual(Object.keys(resaved).sort(), ["characterName", "commit", "data", "savedAt", "schemaVersion", "systemVersion"]);
});

// Design 5.7: "`available` and all this.ui state are EXCLUDED (derivable / transient)". The wizard
// state carries `available.specializations` (always an empty list nothing reads) and
// serializeDraft stores the whole state, so it is saved with every draft. Harmless, but not what
// the design says; remove the todo flag when the draft stops storing it.
test("the saved build leaves out the derived available lists", {
  todo: "serializeDraft stores the whole wizard state, including available.specializations (design 5.7 excludes it)",
}, () => {
  const data = buildDraft();
  data.available = { specializations: [] };

  const record = serializeDraft({ data, commit: null }, SAVE_META);

  assert.equal("available" in record.data, false);
});

// ---------------------------------------------------------------------------------------------
// Reading a stored draft back: newer, older and unreadable records
// ---------------------------------------------------------------------------------------------

test("a draft from schema version 2, newer than this build reads, is refused naming that version", () => {
  const record = { schemaVersion: 2, data: buildDraft() };

  assert.throws(
    () => deserializeDraft(record),
    (error) => error instanceof NewerSchemaError && error.version === 2,
  );
});

test("a draft from schema version 0, which has no migration to the current one, is refused as corrupt", () => {
  const record = { schemaVersion: 0, data: buildDraft() };

  assert.throws(() => deserializeDraft(record), CorruptDraftError);
});

const UNREADABLE_RECORDS = [
  ["a stored draft that is null", null],
  ["a stored draft with no schema version", { data: {} }],
  ["a stored draft whose schema version is not a number", { schemaVersion: "1", data: {} }],
  ["a stored draft with no build data", { schemaVersion: 1 }],
];

for (const [label, record] of UNREADABLE_RECORDS) {
  test(`${label} is refused as corrupt instead of crashing`, () => {
    assert.throws(
      () => deserializeDraft(record),
      (error) => error instanceof CorruptDraftError && !(error instanceof NewerSchemaError),
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Ruleset normalization of drafts saved by earlier versions
// ---------------------------------------------------------------------------------------------

test("ruleset normalization supports old and flattened draft formats", () => {
  const oldDraft = buildDraft();
  oldDraft.selected.rules = "aor";
  oldDraft.selected.startingBonus = "5xp";
  normalizeDraftRules(oldDraft);
  assert.equal(oldDraft.selected.rules, "aor");
  assert.equal(oldDraft.selected.startingBonus, "aor_5xp");

  const flattenedDraft = buildDraft();
  delete flattenedDraft.selected.rules;
  flattenedDraft.selected.startingBonus = "eote_10xp";
  normalizeDraftRules(flattenedDraft);
  assert.equal(flattenedDraft.selected.rules, "eote");
  assert.equal(flattenedDraft.selected.startingBonus, "eote_10xp");

  const defaultDraft = buildDraft();
  delete defaultDraft.selected.rules;
  defaultDraft.selected.startingBonus = null;
  normalizeDraftRules(defaultDraft);
  assert.equal(defaultDraft.selected.rules, "fad");
});

test("a starting-bonus key's own ruleset prefix decides the ruleset over the stored one", () => {
  const draft = buildDraft();
  draft.selected.rules = "fad";
  draft.selected.startingBonus = "aor_5xp";

  normalizeDraftRules(draft);

  assert.equal(draft.selected.rules, "aor");
  assert.equal(draft.selected.startingBonus, "aor_5xp");
});

for (const [stored, expected] of [["swd", "fad"], ["eote", "eote"]]) {
  test(`with no starting bonus chosen a stored ruleset of "${stored}" becomes "${expected}" and no bonus key is invented`, () => {
    const draft = buildDraft();
    draft.selected.rules = stored;
    draft.selected.startingBonus = null;

    normalizeDraftRules(draft);

    assert.equal(draft.selected.rules, expected);
    assert.equal(draft.selected.startingBonus, null);
  });
}

test("normalization changes the draft it is given in place, which is how the store loads a draft", () => {
  const draft = buildDraft();
  draft.selected.rules = "aor";
  draft.selected.startingBonus = "10xp";

  const returned = normalizeDraftRules(draft);

  assert.equal(returned, draft);
  assert.equal(draft.selected.startingBonus, "aor_10xp");
});

test("a draft with no selection block is left as it is", () => {
  const draft = { identity: { name: "Kel Varn" }, commitId: COMMIT_ID };

  normalizeDraftRules(draft);

  assert.deepEqual(draft, { identity: { name: "Kel Varn" }, commitId: COMMIT_ID });
});

for (const [rules, key] of [["fad", "fad_2k_credits"], ["aor", "aor_2k_credits"], ["eote", "eote_2k_credits"]]) {
  test(`a draft saved with the ${key} starting bonus resumes with that same key and its stored credit grant`, () => {
    const draft = buildDraft();
    draft.selected.rules = rules;
    draft.selected.startingBonus = key;
    draft.grants.bonus.credits = 2500;
    const stored = throughStorage(serializeDraft({ data: draft, commit: null }, SAVE_META));

    const resumed = deserializeDraft(stored);
    normalizeDraftRules(resumed.data);

    assert.equal(resumed.data.selected.rules, rules);
    assert.equal(resumed.data.selected.startingBonus, key);
    assert.equal(resumed.data.grants.bonus.credits, 2500);
  });
}

test("a 2k_credits starting bonus saved before the rulesets were flattened takes its stored ruleset as a prefix", () => {
  const draft = buildDraft();
  draft.selected.rules = "eote";
  draft.selected.startingBonus = "2k_credits";

  normalizeDraftRules(draft);

  assert.equal(draft.selected.rules, "eote");
  assert.equal(draft.selected.startingBonus, "eote_2k_credits");
});

// ---------------------------------------------------------------------------------------------
// The 64 KiB size budget and the uuid-only fallback
// ---------------------------------------------------------------------------------------------

test("the draft size counts UTF-8 bytes, so a euro sign adds three and an emoji four", () => {
  // {"s":""} is 8 bytes; the euro sign (U+20AC) takes 3 bytes in UTF-8 and the grinning face
  // (U+1F600) takes 4, although its JavaScript length is 2.
  assert.equal(measureDraftBytes({ s: "" }), 8);
  assert.equal(measureDraftBytes({ s: "€" }), 11);
  assert.equal(measureDraftBytes({ s: "😀" }), 12);
});

test("a record of exactly 64 KiB (65,536 bytes) is within the budget and one byte more is not", () => {
  const atLimit = { s: "a".repeat(65528) };
  const oneOver = { s: "a".repeat(65529) };
  assert.equal(Buffer.byteLength(JSON.stringify(atLimit), "utf8"), 65536, "setup: the record is exactly 64 KiB");
  assert.equal(Buffer.byteLength(JSON.stringify(oneOver), "utf8"), 65537, "setup: the record is one byte over");

  assert.equal(isWithinBudget(atLimit), true);
  assert.equal(isWithinBudget(oneOver), false);
});

test("a representative draft record is within the budget", () => {
  const record = serializeDraft({ data: buildDraft(), commit: frozenCommit() }, SAVE_META);

  assert.equal(isWithinBudget(record), true);
});

test("a maximum-content draft that exceeds budget is brought under it by the uuid-only fallback", () => {
  const record = serializeDraft({ data: bulkyDraft(), commit: frozenCommit() }, SAVE_META);
  assert.equal(isWithinBudget(record), false, "setup: the full snapshots exceed the budget");

  const compacted = compactDraft(record);

  assert.equal(isWithinBudget(compacted), true);
  // compaction drops compendium snapshots but keeps the uuids
  assert.equal(compacted.data.purchases.credits[0].ref.snapshot, undefined);
  assert.equal(compacted.data.purchases.credits[0].ref.uuid, "Compendium.testpack.gear.Item.gearBulk0");
  // input record is not mutated
  assert.notEqual(record.data.purchases.credits[0].ref.snapshot, undefined);
});

test("compaction reduces only compendium items to a reference and leaves everything else as it was", () => {
  const record = serializeDraft({ data: buildDraft(), commit: frozenCommit() }, SAVE_META);
  // the expected record: the same draft with the snapshot removed from each compendium item by hand
  const expected = serializeDraft({ data: buildDraft(), commit: frozenCommit() }, SAVE_META);
  delete expected.data.selected.obligations[0].snapshot;
  delete expected.data.selected.species.snapshot;
  delete expected.data.selected.career.snapshot;
  delete expected.data.selected.specialization.snapshot;
  delete expected.data.purchases.xp.forcePowers[0].ref.snapshot;
  delete expected.data.purchases.credits[0].ref.snapshot;
  delete expected.data.purchases.credits[1].ref.snapshot;
  // purchases.credits[2] is a world item: it keeps its snapshot

  const compacted = compactDraft(record);

  assert.deepEqual(compacted, expected);
});

// ---------------------------------------------------------------------------------------------
// Stale and missing references on resume
// ---------------------------------------------------------------------------------------------

test("rehydrateRef: obligation user-edits survive a snapshot refresh", () => {
  const stored = { uuid: "Compendium.p.Item.ob", name: "Debt", type: "obligation", snapshot: { name: "Debt", system: { magnitude: 15, edited: true } } };
  const fresh = { name: "Debt (updated)", system: { magnitude: 5, edited: false } };
  const { ref, warning } = rehydrateRef(stored, fresh);
  assert.equal(warning, false);
  assert.equal(ref.snapshot.name, "Debt (updated)"); // fresh top-level
  assert.equal(ref.snapshot.system.magnitude, 15); // user edit preserved
  assert.equal(ref.snapshot.system.edited, true);
});

test("a resumed item that is not an obligation takes the whole fresh snapshot and keeps its own identity", () => {
  const stored = {
    uuid: SPECIES_UUID,
    name: "Test Human",
    type: "species",
    img: "icons/svg/item-bag.svg",
    snapshot: { name: "Test Human", flags: { stored: true }, system: { startingXP: 90, description: "stored text" } },
  };
  const fresh = { name: "Test Human", system: { startingXP: 100 } };

  const { ref, warning } = rehydrateRef(stored, fresh);

  assert.equal(warning, false);
  assert.deepEqual(ref, {
    uuid: SPECIES_UUID,
    name: "Test Human",
    type: "species",
    img: "icons/svg/item-bag.svg",
    snapshot: { name: "Test Human", system: { startingXP: 100 } },
  });
});

test("an item whose source can no longer be found is kept as stored and flagged with a warning", () => {
  const stored = itemRef(SPECIES_UUID, "Test Human", "species", { startingXP: 90 });

  for (const missing of [null, undefined]) {
    const { ref, warning } = rehydrateRef(stored, missing);

    assert.equal(warning, true);
    assert.deepEqual(ref, itemRef(SPECIES_UUID, "Test Human", "species", { startingXP: 90 }));
  }
});

test("a compacted item whose source can no longer be found stays without a snapshot and is flagged", () => {
  // The guide: "If such a pack is deleted or rebuilt in between ... those selections come back empty".
  const compacted = { uuid: SPECIES_UUID, name: "Test Human", type: "species", img: "icons/svg/item-bag.svg" };

  const { ref, warning } = rehydrateRef(compacted, null);

  assert.equal(warning, true);
  assert.deepEqual(ref, { uuid: SPECIES_UUID, name: "Test Human", type: "species", img: "icons/svg/item-bag.svg" });
  assert.equal("snapshot" in ref, false);
});

test("a compacted item is restored from its source on resume without a warning", () => {
  const record = serializeDraft({ data: buildDraft(), commit: null }, SAVE_META);
  const storedSpecies = throughStorage(compactDraft(record)).data.selected.species;
  assert.equal("snapshot" in storedSpecies, false, "setup: compaction left a uuid-only reference");
  const fresh = { name: "Test Human", type: "species", system: { startingXP: 100 } };

  const { ref, warning } = rehydrateRef(storedSpecies, fresh);

  assert.equal(warning, false);
  assert.deepEqual(ref, {
    uuid: SPECIES_UUID,
    name: "Test Human",
    type: "species",
    img: "icons/svg/item-bag.svg",
    snapshot: { name: "Test Human", type: "species", system: { startingXP: 100 } },
  });
});
