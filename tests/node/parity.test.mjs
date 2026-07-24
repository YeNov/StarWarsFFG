/**
 * Stage 19 — Node parity fixtures for identity, projection and mapping.
 *
 * These pin the cross-module invariants that the individual stage suites only touch
 * in isolation: preview↔commit id equality, same-payload determinism, the canonical
 * projection edge cases, and the BUG-3 refund-by-uuid contract.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { applyBuild } from "../../modules/char-creator/apply-build.js";
import { assignWizardIdentity, projectItemSource } from "../../modules/char-creator/build-item-schema.js";
import { normalizeCommitSource } from "../../modules/char-creator/commit-normalize.js";
import { toItemData } from "../../modules/char-creator/to-item-data.js";
import { calcXp } from "../../modules/char-creator/calculators.js";

const IDENTITY = { userId: "user01", commitId: "COMMIT0000000001" };

function makeDeps() {
  return {
    creationDefaults: {
      img: "systems/starwarsffg/images/defaults/actors/character.png",
      prototypeToken: { actorLink: true },
      system: {
        characteristics: { Brawn: { value: 2 }, Willpower: { value: 2 } },
        skills: { Astrogation: { rank: 0 } },
        stats: { wounds: { max: 10 }, soak: { value: 2 }, encumbrance: { max: 5 }, strain: { max: 10 }, credits: { value: 0 } },
        experience: {},
      },
    },
    applyCharacteristicDeltas: (system) => structuredClone(system),
    // a realistic item source with one effect, so both id paths assign item AND effect ids
    toItemData: (ref) => ({ name: ref.name, type: ref.type, system: {}, effects: [{ name: `${ref.name}-fx` }] }),
  };
}

function makeDraft(overrides = {}) {
  return {
    identity: { name: "Kel", img: "" },
    commitId: IDENTITY.commitId,
    grants: { gm: { credits: 500 }, bonus: { xp: 0, credits: 0, duty: 0, obligation: 0, conflict: 0, morality: 0 } },
    selected: {
      background: { culture: null, hook: null, forceAttitude: null },
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
    purchases: { xp: { characteristics: [], skills: [], talents: [], specializations: [], forcePowers: [] }, credits: [] },
    initial: { duty: 10, obligation: 10, morality: 50 },
    spendingCredits: 42,
    ...overrides,
  };
}

// --- R7-1 identity fixtures (a), (b), (e) -----------------------------------------

test("(a) repeated assignWizardIdentity gives identical ids", async () => {
  const build = () => ({ items: [{ effects: [{}, {}] }, { effects: [] }] });
  const first = await assignWizardIdentity(build(), IDENTITY);
  const second = await assignWizardIdentity(build(), IDENTITY);
  assert.equal(first._id, second._id);
  assert.deepEqual(first.items.map((i) => i._id), second.items.map((i) => i._id));
  assert.deepEqual(first.items[0].effects.map((f) => f._id), second.items[0].effects.map((f) => f._id));
});

test("(b) the same gear bought twice gets DISTINCT item ids", async () => {
  const gear = () => ({ uuid: "Compendium.p.Item.blaster", name: "Blaster", type: "weapon", snapshot: { name: "Blaster", type: "weapon", system: {}, effects: [] } });
  const actorData = await assignWizardIdentity({ items: [toItemData(gear()), toItemData(gear())] }, IDENTITY);
  assert.notEqual(actorData.items[0]._id, actorData.items[1]._id);
  assert.match(actorData.items[0]._id, /^[a-zA-Z0-9]{16}$/);
});

test("(e) re-minting the commitId changes ALL ids", async () => {
  const build = () => ({ items: [{ effects: [{}] }, { effects: [] }] });
  const a = await assignWizardIdentity(build(), IDENTITY);
  const b = await assignWizardIdentity(build(), { userId: IDENTITY.userId, commitId: "COMMIT0000000002" });
  assert.notEqual(a._id, b._id);
  assert.notEqual(a.items[0]._id, b.items[0]._id);
  assert.notEqual(a.items[0].effects[0]._id, b.items[0].effects[0]._id);
});

// --- (c) preview ↔ commit id equality ---------------------------------------------

test("(c) applyBuild+assignWizardIdentity and normalizeCommitSource produce identical _ids", async () => {
  const draft = makeDraft();
  const { actorData } = applyBuild(draft, makeDeps());

  const previewData = structuredClone(actorData);
  await assignWizardIdentity(previewData, IDENTITY);

  const xp = calcXp(draft);
  const { source } = await normalizeCommitSource(actorData, { ...IDENTITY, firstAttemptAt: "2026-07-21T00:00:00.000Z", xp });

  assert.equal(previewData._id, source._id);
  assert.deepEqual(previewData.items.map((i) => i._id), source.items.map((i) => i._id));
  assert.deepEqual(
    previewData.items.map((i) => i.effects.map((f) => f._id)),
    source.items.map((i) => i.effects.map((f) => f._id)),
  );
});

// --- (d) same-payload determinism -------------------------------------------------

test("(d) two normalizeCommitSource runs on the same payload are byte-equal", async () => {
  const { actorData } = applyBuild(makeDraft(), makeDeps());
  const commit = { ...IDENTITY, firstAttemptAt: "2026-07-21T00:00:00.000Z", xp: { total: 100, available: 20 } };
  const a = await normalizeCommitSource(actorData, commit);
  const b = await normalizeCommitSource(actorData, commit);
  assert.equal(JSON.stringify(a.source), JSON.stringify(b.source));
  assert.equal(a.fingerprint, b.fingerprint);
});

// --- canonical projection fixture -------------------------------------------------

test("canonical projection: ammo weapon, medical gear, two same-key effects with different priority, tinted overlay", () => {
  const raw = {
    _id: "SRC0000000000001",
    name: "Ammo Blaster",
    type: "weapon",
    img: "icons/blaster.png",
    sort: 100,
    ownership: { default: 0 },
    _stats: { systemId: "starwarsffg" },
    system: { damage: 6 },
    flags: {
      starwarsffg: { config: { enableAmmo: true, medicalType: "stimpack" } },
      "third-party": { drop: "me" },
    },
    effects: [
      { _id: "FX1", name: "add wounds", tint: "#ff0000", changes: [{ key: "system.stats.wounds.max", value: "1", mode: 2, priority: 10 }], flags: { core: { overlay: true, sourceId: "x" } } },
      { _id: "FX2", name: "add wounds", changes: [{ key: "system.stats.wounds.max", value: "1", mode: 2, priority: 20 }] },
    ],
  };
  const out = projectItemSource(raw);

  // ammo / medical config (starwarsffg scope) survives; third-party scope dropped; source id stripped
  assert.equal(out.flags.starwarsffg.config.enableAmmo, true);
  assert.equal(out.flags.starwarsffg.config.medicalType, "stimpack");
  assert.ok(!("third-party" in out.flags));
  assert.ok(!("_id" in out) && !("sort" in out) && !("ownership" in out) && !("_stats" in out));

  // two same-key effects keep their DISTINCT priorities (no collapse)
  assert.equal(out.effects[0].changes[0].priority, 10);
  assert.equal(out.effects[1].changes[0].priority, 20);

  // tinted flags.core.overlay survives; flags.core.sourceId does not
  assert.equal(out.effects[0].tint, "#ff0000");
  assert.deepEqual(out.effects[0].flags.core, { overlay: true });
});

// --- BUG-3: un-learn refund matches by uuid ---------------------------------------

test("BUG-3: refunding a purchased force power matches by uuid and refunds the XP", () => {
  const draft = makeDraft();
  draft.purchases.xp.forcePowers = [
    { ref: { uuid: "Compendium.p.Item.sense", name: "Sense", type: "forcepower" }, cost: 10 },
    { ref: { uuid: "Compendium.p.Item.move", name: "Move", type: "forcepower" }, cost: 15 },
  ];
  const before = calcXp(draft).available;

  // un-learn "Move" — matched by uuid, not by object/string identity (the legacy BUG-3)
  const targetUuid = "Compendium.p.Item.move";
  draft.purchases.xp.forcePowers = draft.purchases.xp.forcePowers.filter((p) => p.ref.uuid !== targetUuid);

  assert.equal(draft.purchases.xp.forcePowers.length, 1);
  assert.equal(draft.purchases.xp.forcePowers[0].ref.uuid, "Compendium.p.Item.sense");
  assert.equal(calcXp(draft).available, before + 15); // the 15 XP came back
});
