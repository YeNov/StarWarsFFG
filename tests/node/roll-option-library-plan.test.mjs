import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { ROLL_OPTION_LIBRARY } from "../../modules/config/roll-option-library.js";
import { libraryMacroText, planItemLinks, planLibraryMacros } from "../../modules/helpers/roll-option-library-plan.js";

/**
 * What the GM's library run creates and links
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "The library run").
 */

const uuidByEntry = new Map(ROLL_OPTION_LIBRARY.map((entry) => [entry.id, `Macro.${entry.id}`]));
const plan = (itemData, isLive = () => true) => planItemLinks(itemData, { uuidByEntry, isLive });
const quality = (name, links = []) => ({ _id: `q-${name}`, name, type: "itemmodifier", system: { rollOptions: links } });

/** Apply a plan's update to plain data, as Foundry's update would. */
function apply(data, update) {
  const next = structuredClone(data);
  for (const [path, value] of Object.entries(update ?? {})) foundry.utils.setProperty(next, path, structuredClone(value));
  return next;
}

test("existing macros are reused, not recreated", () => {
  const { create, uuidByEntry: map } = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.af", libraryId: "auto-fire" }]);
  assert.equal(create.length, ROLL_OPTION_LIBRARY.length - 1);
  assert.equal(create.some((entry) => entry.id === "auto-fire"), false);
  assert.equal(map.get("auto-fire"), "Macro.af");
  assert.equal(planLibraryMacros(ROLL_OPTION_LIBRARY, []).create.length, ROLL_OPTION_LIBRARY.length);
});

test("a world with the first eight macros gets only the new entries, and their talents get linked", () => {
  const firstEight = ["auto-fire", "intense-focus", "frenzied-attack", "guns-blazing", "saber-swarm", "true-aim", "sniper-shot", "point-blank"];
  const existing = firstEight.map((id) => ({ uuid: `Macro.old-${id}`, libraryId: id }));
  const { create, uuidByEntry: map } = planLibraryMacros(ROLL_OPTION_LIBRARY, existing);
  assert.deepEqual(create.map((entry) => entry.id), ROLL_OPTION_LIBRARY.filter((entry) => !firstEight.includes(entry.id)).map((entry) => entry.id));
  assert.equal(create.length, 215, "the reviewed talents (2026-10-22) and six Deadly Accuracy versions (2026-10-27)");
  assert.ok(create.some((entry) => entry.id === "master-slicer"));
  for (const id of firstEight) assert.equal(map.get(id), `Macro.old-${id}`);

  // The run adds each created macro's uuid to the map before linking.
  for (const entry of create) map.set(entry.id, `Macro.new-${entry.id}`);
  const link = (itemData, isLive) => planItemLinks(itemData, { uuidByEntry: map, isLive });
  const fresh = link({ type: "talent", name: "Master Slicer", system: { rollOptions: [] } }, () => true);
  assert.deepEqual(fresh.update, { "system.rollOptions": ["Macro.new-master-slicer"] });
  assert.deepEqual(fresh.linked, [{ entryId: "master-slicer", place: "item" }]);
  assert.equal(link({ type: "talent", name: "Master Slicer", system: { rollOptions: ["Macro.mine"] } }, () => true).update, null);
  assert.equal(link({ type: "talent", name: "Guns Blazing", system: { rollOptions: ["Macro.old-guns-blazing"] } }, () => true).update, null);
});

test("a talent item gets its link", () => {
  const result = plan({ type: "talent", name: "Guns Blazing", system: { rollOptions: [] } });
  assert.deepEqual(result.update, { "system.rollOptions": ["Macro.guns-blazing"] });
  assert.deepEqual(result.linked, [{ entryId: "guns-blazing", place: "item" }]);
});

test("a quality item gets its link", () => {
  assert.deepEqual(plan({ type: "itemmodifier", name: "Auto-fire", system: {} }).update, { "system.rollOptions": ["Macro.auto-fire"] });
});

test("name variants match", () => {
  assert.deepEqual(plan({ type: "talent", name: "guns-blazing", system: {} }).update, { "system.rollOptions": ["Macro.guns-blazing"] });
});

test("a live link is left alone; a dead link is replaced", () => {
  const talent = { type: "talent", name: "Point Blank", system: { rollOptions: ["Macro.x"] } };
  assert.equal(plan(talent, () => true).update, null);
  assert.deepEqual(plan(talent, () => false).update, { "system.rollOptions": ["Macro.point-blank"] });
});

test("qualities on a weapon and on an attachment's modifications are linked", () => {
  const weapon = {
    type: "weapon", name: "Repeater",
    system: {
      itemmodifier: [quality("Auto-fire"), quality("Pierce")],
      itemattachment: [{ _id: "a1", name: "Rapid Recharge", type: "itemattachment", system: { itemmodifier: [quality("Auto-Fire")] } }],
    },
  };
  const result = plan(weapon);
  assert.deepEqual(Object.keys(result.update).sort(), ["system.itemattachment", "system.itemmodifier"]);
  assert.deepEqual(result.update["system.itemmodifier"].map((q) => q.system.rollOptions), [["Macro.auto-fire"], []]);
  assert.deepEqual(result.update["system.itemattachment"][0].system.itemmodifier[0].system.rollOptions, ["Macro.auto-fire"]);
  assert.deepEqual(result.linked, [
    { entryId: "auto-fire", place: "quality:Auto-fire" },
    { entryId: "auto-fire", place: "attachment:Rapid Recharge/quality:Auto-Fire" },
  ]);
  assert.deepEqual(weapon.system.itemmodifier[0].system.rollOptions, [], "the input is not changed");
});

test("qualities on armour and on an attachment item are linked too", () => {
  assert.ok(plan({ type: "armour", name: "Plate", system: { itemmodifier: [quality("Auto-fire")] } }).update["system.itemmodifier"]);
  assert.ok(plan({ type: "itemattachment", name: "Kit", system: { itemmodifier: [quality("Auto-fire")] } }).update["system.itemmodifier"]);
});

test("tree nodes are linked by name, learned or not", () => {
  const spec = { type: "specialization", name: "Gunslinger", system: { talents: {
    talent0: { name: "Intense Focus", islearned: false },
    talent1: { name: "Parry", islearned: true },
  } } };
  const result = plan(spec);
  assert.deepEqual(result.update, { "system.talents.talent0.rollOptions": ["Macro.intense-focus"] });
  assert.deepEqual(result.linked, [{ entryId: "intense-focus", place: "tree:talent0:Intense Focus" }]);
});

test("species are skipped", () => {
  assert.equal(plan({ type: "species", name: "Human", system: { talents: { x: { name: "Point Blank" } } } }).update, null);
});

test("unknown names are left alone", () => {
  assert.equal(plan({ type: "talent", name: "Parry", system: {} }).update, null);
  assert.equal(plan({ type: "talent", name: "Auto-fire", system: {} }).update, null, "a talent never takes a quality's entry");
});

test("an entry without a macro is not linked", () => {
  const partial = new Map([["guns-blazing", "Macro.gb"]]);
  assert.equal(planItemLinks({ type: "talent", name: "Point Blank", system: {} }, { uuidByEntry: partial, isLive: () => true }).update, null);
});

test("running twice changes nothing the second time", () => {
  const items = [
    { type: "talent", name: "True Aim", system: { rollOptions: [] } },
    { type: "weapon", name: "Repeater", system: { itemmodifier: [quality("Auto-fire")], itemattachment: [{ _id: "a1", name: "X", system: { itemmodifier: [quality("Auto-fire")] } }] } },
    { type: "specialization", name: "Sniper", system: { talents: { talent4: { name: "Sniper Shot" } } } },
  ];
  for (const item of items) {
    const first = plan(item);
    assert.ok(first.update, item.name);
    assert.equal(plan(apply(item, first.update)).update, null, item.name);
  }
});

/* Updating library macros in place (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md, "The library"). */

const rr = ROLL_OPTION_LIBRARY.find((entry) => entry.id === "rapid-reaction");
const old = JSON.stringify(rr.previous[0], null, 2);
const editedOld = JSON.stringify(rr.previous[0].map((option) => ({ ...option, hint: "Mine" })), null, 2);

test("an unedited library macro is updated in place", () => {
  const { create, uuidByEntry: map, update, edited } = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: old }]);
  assert.deepEqual(update, [{ uuid: "Macro.rr", entryId: "rapid-reaction", command: libraryMacroText(rr) }]);
  assert.deepEqual(edited, []);
  assert.equal(map.get("rapid-reaction"), "Macro.rr");
  assert.equal(create.some((entry) => entry.id === "rapid-reaction"), false);
});

test("key order and spacing do not count as an edit", () => {
  const reordered = JSON.stringify(rr.previous[0].map((option) => Object.fromEntries(Object.entries(option).reverse())));
  const { update } = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: reordered }]);
  assert.deepEqual(update, [{ uuid: "Macro.rr", entryId: "rapid-reaction", command: libraryMacroText(rr) }]);
});

test("an edited library macro is left and reported", () => {
  const edits = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: editedOld }]);
  assert.deepEqual([edits.update, edits.edited], [[], [{ uuid: "Macro.rr", entryId: "rapid-reaction" }]]);
  const broken = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: "not json" }]);
  assert.deepEqual([broken.update, broken.edited], [[], [{ uuid: "Macro.rr", entryId: "rapid-reaction" }]]);
});

test("a current macro, or an edited one whose entry never changed, is left quietly", () => {
  const current = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: libraryMacroText(rr) }]);
  assert.deepEqual([current.update, current.edited], [[], []]);
  const autoFire = ROLL_OPTION_LIBRARY.find((entry) => entry.id === "auto-fire");
  const mine = JSON.stringify(autoFire.options.map((option) => ({ ...option, hint: "Mine" })));
  const quiet = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.af", libraryId: "auto-fire", command: mine }]);
  assert.deepEqual([quiet.update, quiet.edited], [[], []]);
});

test("every macro of an entry is checked", () => {
  const both = planLibraryMacros(ROLL_OPTION_LIBRARY, [
    { uuid: "Macro.rr1", libraryId: "rapid-reaction", command: old },
    { uuid: "Macro.rr2", libraryId: "rapid-reaction", command: old },
  ]);
  assert.deepEqual(both.update.map((u) => u.uuid), ["Macro.rr1", "Macro.rr2"]);
  assert.equal(both.uuidByEntry.get("rapid-reaction"), "Macro.rr1");
  const one = planLibraryMacros(ROLL_OPTION_LIBRARY, [
    { uuid: "Macro.rr1", libraryId: "rapid-reaction", command: old },
    { uuid: "Macro.rr2", libraryId: "rapid-reaction", command: editedOld },
  ]);
  assert.deepEqual(one.update.map((u) => u.uuid), ["Macro.rr1"]);
  assert.deepEqual(one.edited, [{ uuid: "Macro.rr2", entryId: "rapid-reaction" }]);
});

test("an item with the library link and a custom link keeps both", () => {
  const { uuidByEntry: map, update } = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.rr", libraryId: "rapid-reaction", command: old }]);
  const item = { type: "talent", name: "Rapid Reaction", system: { rollOptions: ["Macro.rr", "Macro.mine"] } };
  assert.equal(planItemLinks(item, { uuidByEntry: map, isLive: () => true }).update, null, "nothing to relink");
  assert.deepEqual(update.map((u) => u.uuid), ["Macro.rr"], "the macro the item links is the one updated");
});

test("running it again changes nothing", () => {
  const existing = ROLL_OPTION_LIBRARY.map((entry) => ({ uuid: `Macro.${entry.id}`, libraryId: entry.id, command: libraryMacroText(entry) }));
  const again = planLibraryMacros(ROLL_OPTION_LIBRARY, existing);
  assert.deepEqual([again.create, again.update, again.edited], [[], [], []]);
});

// Point Blank as the library installed it before options could add damage.
const pointBlankBefore = [{ id: "point-blank", label: "Point Blank", hint: "Short range or engaged", offer: { skills: ["Ranged: Light", "Ranged: Heavy"] } }];

test("an installed, unedited Point Blank macro gets the damage", () => {
  const pb = ROLL_OPTION_LIBRARY.find((entry) => entry.id === "point-blank");
  const { update, edited } = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.pb", libraryId: "point-blank", command: JSON.stringify(pointBlankBefore) }]);
  assert.deepEqual(update, [{ uuid: "Macro.pb", entryId: "point-blank", command: libraryMacroText(pb) }]);
  assert.deepEqual(JSON.parse(update[0].command)[0].weapon, { damage: "ranks" });
  assert.deepEqual(edited, []);
});

test("a Point Blank macro the GM edited is left and reported", () => {
  const mine = JSON.stringify([{ ...pointBlankBefore[0], hint: "Engaged only" }]);
  const { update, edited } = planLibraryMacros(ROLL_OPTION_LIBRARY, [{ uuid: "Macro.pb", libraryId: "point-blank", command: mine }]);
  assert.deepEqual([update, edited], [[], [{ uuid: "Macro.pb", entryId: "point-blank" }]]);
});

test("a run links Deadly Accuracy to its Ranged: Heavy version, and keeps a version the GM swapped in", () => {
  const map = new Map([["deadly-accuracy-ranged-heavy", "Macro.da-rh"], ["deadly-accuracy-melee", "Macro.da-melee"]]);
  const link = (itemData) => planItemLinks(itemData, { uuidByEntry: map, isLive: () => true });
  assert.deepEqual(link({ type: "talent", name: "Deadly Accuracy", system: { rollOptions: [] } }).update,
    { "system.rollOptions": ["Macro.da-rh"] });
  assert.equal(link({ type: "talent", name: "Deadly Accuracy", system: { rollOptions: ["Macro.da-melee"] } }).update ?? null, null);
});
