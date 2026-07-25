import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { dedicationCharacteristicDeltas } from "../../modules/char-creator/dedication.js";
import {
  prepareTalentTree,
  talentDocumentUuid,
} from "../../modules/char-creator/talent-selection.js";

test("talentDocumentUuid prefers the stock source UUID", () => {
  assert.equal(
    talentDocumentUuid({
      source: "Compendium.starwarsffg.talents.Item.source-id",
      pack: "legacy.talents",
      itemId: "legacy-id",
    }),
    "Compendium.starwarsffg.talents.Item.source-id",
  );
});

test("talentDocumentUuid resolves compendium and world item references", () => {
  assert.equal(
    talentDocumentUuid({ pack: "starwarsffg.talents", itemId: "talent-id" }),
    "Compendium.starwarsffg.talents.Item.talent-id",
  );
  assert.equal(talentDocumentUuid({ itemId: "world-id" }), "Item.world-id");
  assert.equal(talentDocumentUuid({}), "");
});

test("prepareTalentTree retains a resolvable UUID on each talent cell", () => {
  const rows = prepareTalentTree({
    talent0: {
      name: "Grit",
      source: "Compendium.starwarsffg.talents.Item.grit",
    },
  }, [], 5);

  assert.equal(rows[0].cells[0].uuid, "Compendium.starwarsffg.talents.Item.grit");
});

test("prepareTalentTree marks Dedication cells with characteristic choices", () => {
  const rows = prepareTalentTree({
    talent0: {
      name: "<b>Dedication</b>",
    },
  }, ["talent0"], 0, {
    dedicationChoices: { talent0: "Brawn" },
    characteristicChoices: [
      { key: "Brawn", label: "Brawn", value: 3 },
      { key: "Agility", label: "Agility", value: 2 },
    ],
  });
  const cell = rows[0].cells[0];

  assert.equal(cell.isDedication, true);
  assert.equal(cell.dedicationCharacteristic, "Brawn");
  assert.deepEqual(cell.characteristicChoices.map((choice) => [choice.key, choice.selected]), [
    ["Brawn", true],
    ["Agility", false],
  ]);
});

test("dedicationCharacteristicDeltas counts only chosen learned Dedication purchases", () => {
  const deltas = dedicationCharacteristicDeltas({
    talent4: { name: "Dedication" },
    talent5: { name: "Grit" },
    talent6: { name: "<b>Dedication</b>" },
  }, [
    { key: "talent4", characteristic: "Brawn" },
    { key: "talent5", characteristic: "Agility" },
    { key: "talent6", characteristic: "Brawn" },
    { key: "talent7", characteristic: "Cunning" },
    { key: "talent4" },
  ]);

  assert.deepEqual(deltas, { Brawn: 2 });
});
