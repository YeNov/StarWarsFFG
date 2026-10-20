/**
 * Node tests for the PC Wizard state factory + mutators (Stage 7).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { setSetting, resetSettings } from "./_stub/foundry-stub.mjs";
import { createInitialData, restoreDerivedState, setIdentity, setSelection, addSelection, toSelectionRef } from "../../modules/char-creator/wizard-state.js";
import { serializeDraft, deserializeDraft } from "../../modules/char-creator/draft-schema.js";
import { applyStartingBonus } from "../../modules/char-creator/starting-bonus.js";
import { calcObligation } from "../../modules/char-creator/calculators.js";

function seedSettings() {
  resetSettings();
  setSetting("starwarsffg", "defaultCredits", 500);
  setSetting("starwarsffg", "defaultDuty", 10);
  setSetting("starwarsffg", "defaultObligation", 20);
  setSetting("starwarsffg", "defaultMorality", 50);
}

test("createInitialData mints a 16-character alphanumeric commit id", () => {
  seedSettings();
  assert.match(createInitialData().commitId, /^[a-zA-Z0-9]{16}$/);
});

test("createInitialData: grants.gm.credits and initial.* seeded from game.settings.get", () => {
  seedSettings();
  const data = createInitialData();
  assert.equal(data.grants.gm.credits, 500);
  assert.equal(data.initial.duty, 10);
  assert.equal(data.initial.obligation, 20);
  assert.equal(data.initial.morality, 50);
});

test("createInitialData defaults the ruleset to Force and Destiny", () => {
  seedSettings();
  assert.equal(createInitialData().selected.rules, "fad");
});

test("createInitialData: spendingCredits is a d100 in [1,100], rolled once", () => {
  seedSettings();
  const data = createInitialData();
  assert.ok(Number.isInteger(data.spendingCredits));
  assert.ok(data.spendingCredits >= 1 && data.spendingCredits <= 100);
  // mutators never re-roll it
  const before = data.spendingCredits;
  applyStartingBonus(data, "fad_10xp");
  setIdentity(data, { name: "Kel" });
  assert.equal(data.spendingCredits, before);
});

test("createInitialData: bonus fields start zeroed", () => {
  seedSettings();
  const grants = createInitialData().grants;
  assert.deepEqual(grants.bonus, { xp: 0, credits: 0, duty: 0, obligation: 0, conflict: 0, morality: 0 });
  assert.deepEqual(grants.extra, { xp: 0, credits: 0 });
});

test("toSelectionRef produces {uuid, name, type, img, snapshot} with no live document", () => {
  const ref = toSelectionRef({
    uuid: "Compendium.pack.Item.abc",
    name: "Blaster",
    type: "weapon",
    img: "icons/x.png",
    toObject: () => ({ name: "Blaster", system: { damage: 6 } }),
  });
  assert.deepEqual(Object.keys(ref).sort(), ["img", "name", "snapshot", "type", "uuid"]);
  assert.deepEqual(ref.snapshot, { name: "Blaster", system: { damage: 6 } });
});

test("setIdentity, setSelection and addSelection write the identity, one selection and an appended selection onto the draft", () => {
  seedSettings();
  const data = createInitialData();
  setIdentity(data, { name: "Kel", img: "icons/kel.png", tokenImg: "icons/kel-token.png" });
  assert.equal(data.identity.name, "Kel");
  assert.equal(data.identity.img, "icons/kel.png");
  assert.equal(data.identity.tokenImg, "icons/kel-token.png");

  const speciesRef = { uuid: "u1", name: "Human", type: "species", img: "i", snapshot: {} };
  setSelection(data, "species", speciesRef);
  assert.equal(data.selected.species, speciesRef);

  const motiveRef = { uuid: "u2", name: "Cause", type: "motivation", img: "i", snapshot: {} };
  addSelection(data, "motivations", motiveRef);
  assert.deepEqual(data.selected.motivations, [motiveRef]);
});

test("an Age of Rebellion starting bonus of 5 XP and 5 Duty is stored under bonus.xp and bonus.duty and creates no \"undefined\" key", () => {
  seedSettings();
  const data = createInitialData();
  data.selected.rules = "aor";
  applyStartingBonus(data, "aor_5xp");
  assert.equal(data.grants.bonus.duty, 5);
  assert.equal(data.grants.bonus.xp, 5);
  assert.ok(!("undefined" in data.grants.bonus));
  assert.equal(data.selected.startingBonus, "aor_5xp");
});

test("applyStartingBonus: re-selecting zeroes prior fields (no stale morality)", () => {
  seedSettings();
  const data = createInitialData();
  applyStartingBonus(data, "fad_21_plus_morality");
  assert.equal(data.grants.bonus.morality, 21);
  applyStartingBonus(data, "fad_10xp");
  assert.equal(data.grants.bonus.morality, 0); // cleared, not stale
  assert.equal(data.grants.bonus.xp, 10);
});

test("applyStartingBonus eote_1k_credits grants 1000 credits and 5 Obligation and nothing else, every time", () => {
  seedSettings();
  const a = createInitialData();
  const b = createInitialData();
  a.selected.rules = "eote";
  b.selected.rules = "eote";
  applyStartingBonus(a, "eote_1k_credits");
  applyStartingBonus(b, "eote_1k_credits");
  assert.deepEqual(a.grants.bonus, b.grants.bonus);
  assert.deepEqual(a.grants.bonus, { xp: 0, credits: 1000, duty: 0, obligation: 5, conflict: 0, morality: 0 });
});

test("applyStartingBonus(null) clears the bonus back to zero", () => {
  seedSettings();
  const data = createInitialData();
  data.selected.rules = "eote";
  applyStartingBonus(data, "eote_10xp");
  applyStartingBonus(data, null);
  assert.equal(data.selected.startingBonus, null);
  assert.deepEqual(data.grants.bonus, { xp: 0, credits: 0, duty: 0, obligation: 0, conflict: 0, morality: 0 });
});

test("calcObligation adds the same Obligation or Morality adjustment that grants.bonus displays", () => {
  seedSettings();
  // eote: display bonus.obligation and calcObligation adjustment both = +5
  const eote = createInitialData();
  eote.selected.rules = "eote";
  applyStartingBonus(eote, "eote_5xp");
  assert.equal(eote.grants.bonus.obligation, 5);
  assert.equal(calcObligation(eote).available, eote.initial.obligation + 5);

  // fad: display bonus.morality and calcObligation adjustment both = +21
  const fad = createInitialData();
  applyStartingBonus(fad, "fad_21_plus_morality");
  assert.equal(fad.grants.bonus.morality, 21);
  assert.equal(calcObligation(fad).available, fad.initial.morality + 21);
});

test("applyStartingBonus rejects a choice from another ruleset", () => {
  seedSettings();
  const data = createInitialData();
  applyStartingBonus(data, "aor_10xp");
  assert.equal(data.selected.startingBonus, null);
  assert.equal(data.grants.bonus.xp, 0);
  assert.equal(data.grants.bonus.duty, 0);
});

// A saved draft leaves out the derived `available` lists (design 5.7), so the wizard rebuilds them
// when it resumes one. Without that a resumed wizard would be missing a field a fresh wizard has.
test("a fresh wizard that is saved and resumed is the same wizard state again", () => {
  seedSettings();
  const fresh = createInitialData();
  const stored = JSON.parse(JSON.stringify(serializeDraft({ data: fresh, commit: null })));
  assert.equal("available" in stored.data, false, "setup: the saved draft stores no available lists");

  const resumed = restoreDerivedState(deserializeDraft(stored).data);

  assert.deepEqual(resumed, fresh);
});

test("resuming replaces available lists that an earlier version saved with the draft", () => {
  seedSettings();
  const data = createInitialData();
  data.available = { specializations: [{ name: "Stored by an earlier version" }] };

  restoreDerivedState(data);

  assert.deepEqual(data.available, { specializations: [] });
});
