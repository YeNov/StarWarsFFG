import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  buildImportIndex,
  buildSnapshotIndex,
  buildSkillMetadata,
  collectImportEntries,
  entriesFromDocs,
  entriesFromSelectionRefs,
  findIndexedSnapshot,
  looseNameScore,
  normalizeName,
} from "../../modules/importer/hyperdrive/resolve.js";

const entry = (type, id, name, uuid = `${type}:${name}`, system = undefined) => ({
  itemType: type,
  ffgimportid: id,
  ref: { uuid, type, name, snapshot: { name, type, ...(system ? { system } : {}) } },
});

test("resolves by typed key and normalized name; duplicates use first and report ambiguity", () => {
  const first = entry("weapon", "SAME", "<b>Defender</b>", "first");
  const index = buildImportIndex([
    first,
    entry("gear", "SAME", "Other"),
    entry("weapon", "OTHER", " Defender ", "second"),
  ]);
  assert.equal(index.getByKey("weapon", "SAME"), first);
  assert.equal(index.getByKey("gear", "SAME").itemType, "gear");
  assert.equal(index.getByName("weapon", "DEFENDER").ref.uuid, "first");
  assert.equal(index.ambiguities.length, 1);
  assert.equal(normalizeName("<em> Foo </em>"), "foo");
});

test("expanded compendium names resolve conservatively after exact names", () => {
  const exact = entry("weapon", "EXACT", "Unarmed");
  const expanded = entry("weapon", "EXPANDED", "Unarmed Strike");
  let index = buildImportIndex([expanded, exact]);
  assert.equal(index.getByName("weapon", "Unarmed"), exact);

  index = buildImportIndex([expanded]);
  assert.equal(index.getByName("weapon", "Unarmed"), expanded);
  assert.ok(looseNameScore("Superior", "Superior Weapon Customization") > 0);
  assert.equal(looseNameScore("Weighted Head", "Weapon Sling"), 0);
});

test("ambiguous expanded names are rejected and reported", () => {
  const index = buildImportIndex([
    entry("weapon", "ONE", "Unarmed Strike"),
    entry("weapon", "TWO", "Unarmed Combat"),
  ]);
  assert.equal(index.getByName("weapon", "Unarmed"), null);
  assert.deepEqual(index.ambiguities, [{
    itemType: "weapon",
    name: "unarmed",
    count: 2,
    loose: true,
  }]);
});

test("quality and attachment expansion respects the owning item type", () => {
  const entries = [
    entry("itemmodifier", "SUPERIOR", "Superior Weapon Customization", "weapon-quality", { type: "weapon" }),
    entry("itemmodifier", "SUPERIOR", "Superior Armor Customization", "armor-quality", { type: "armor" }),
    entry("itemattachment", null, "Superior Weapon Customization", "weapon-attachment", { type: "weapon" }),
    entry("itemattachment", null, "Superior Armor Customization", "armor-attachment", { type: "armor" }),
  ];
  const modifiers = buildSnapshotIndex(entries, "itemmodifier");
  const attachments = buildSnapshotIndex(entries, "itemattachment");
  assert.equal(
    findIndexedSnapshot(modifiers, { Key: "SUPERIOR" }, { ownerType: "weapon" }).name,
    "Superior Weapon Customization",
  );
  assert.equal(
    findIndexedSnapshot(modifiers, { Key: "SUPERIOR" }, { ownerType: "armour" }).name,
    "Superior Armor Customization",
  );
  assert.equal(
    findIndexedSnapshot(attachments, { Name: "Superior" }, { ownerType: "weapon" }).name,
    "Superior Weapon Customization",
  );
});

test("doc collection keeps keyless docs and includes every supplied pack list plus world items", () => {
  const doc = (type, name, id) => ({
    type,
    name,
    uuid: `${type}:${name}`,
    flags: { starwarsffg: { ffgimportid: id } },
    toObject: () => ({ type, name, flags: { starwarsffg: { ffgimportid: id } } }),
  });
  assert.equal(entriesFromDocs([doc("gear", "Keyless", null)]).length, 1);
  const all = collectImportEntries({
    docLists: [[doc("weapon", "One", "W1")], [doc("gear", "Two", "G1")]],
    worldItems: [doc("armour", "Three", "A1")],
  });
  assert.deepEqual(all.map((value) => value.ref.name), ["One", "Two", "Three"]);
});

test("configured PC-creator selection refs become deduplicated import entries", () => {
  const refs = [{
    uuid: "Compendium.selected.attachments.Item.one",
    name: "Weighted Head",
    type: "itemattachment",
    snapshot: {
      name: "Weighted Head",
      type: "itemattachment",
      flags: { starwarsffg: { ffgimportid: null } },
    },
  }];
  const entries = entriesFromSelectionRefs([...refs, structuredClone(refs[0])]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ref.snapshot.name, "Weighted Head");
  assert.equal(entries[0].itemType, "itemattachment");
});

test("live skill metadata uses import ids and the selected alternate skill theme", () => {
  const { skillMap, skillMeta } = buildSkillMetadata({
    entries: [entry("skill", "DISC", "Discipline")],
    temporarySkills: { BRAWL: "Brawl" },
    themeId: "starwars",
    alternateSkillLists: [{
      id: "starwars",
      skills: {
        Brawl: { characteristic: "Brawn", type: "Combat" },
        Discipline: { characteristic: "Willpower", type: "General" },
      },
    }],
  });
  assert.equal(skillMap.DISC, "Discipline");
  assert.equal(skillMap.BRAWL, "Brawl");
  assert.deepEqual(skillMeta.find((skill) => skill.skill === "Brawl"), {
    skill: "Brawl",
    characteristic: "Brawn",
    type: "Combat",
  });
});
