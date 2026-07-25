import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
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
