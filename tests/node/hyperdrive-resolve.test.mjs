import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  buildImportIndex,
  buildSkillMetadata,
  collectImportEntries,
  entriesFromDocs,
  normalizeName,
} from "../../modules/importer/hyperdrive/resolve.js";

const entry = (type, id, name, uuid = `${type}:${name}`) => ({
  itemType: type,
  ffgimportid: id,
  ref: { uuid, type, name, snapshot: { name, type } },
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
