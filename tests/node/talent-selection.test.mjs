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

test("talentDocumentUuid remaps a stale legacy pack reference through configured talents", () => {
  const availableTalents = [
    {
      uuid: "Compendium.yehors-sw-ffg-shared-data.yn-talents.Item.uZA7QtFgQE00Kt9c",
      name: "Quick Strike",
      snapshot: { flags: { starwarsffg: { ffgimportid: "QUICKST" } } },
    },
  ];
  assert.equal(
    talentDocumentUuid({
      name: "Quick Strike",
      pack: "unwilingful-alliance.oggdudetalents",
      itemId: "MeZPtjuPTFEVyi3q",
    }, availableTalents),
    "Compendium.yehors-sw-ffg-shared-data.yn-talents.Item.uZA7QtFgQE00Kt9c",
  );
});

test("talentDocumentUuid keeps an explicit source UUID ahead of configured name matches", () => {
  assert.equal(
    talentDocumentUuid(
      { name: "Quick Strike", source: "Item.custom-quick-strike" },
      [{ uuid: "Compendium.pack.talents.Item.quick-strike", name: "Quick Strike" }],
    ),
    "Item.custom-quick-strike",
  );
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

test("prepareTalentTree exposes the configured replacement for a stale legacy talent", () => {
  const rows = prepareTalentTree({
    talent0: {
      name: "Quick Strike",
      pack: "unwilingful-alliance.oggdudetalents",
      itemId: "MeZPtjuPTFEVyi3q",
    },
  }, [], 5, [{
    uuid: "Compendium.yehors-sw-ffg-shared-data.yn-talents.Item.uZA7QtFgQE00Kt9c",
    name: "Quick Strike",
  }]);

  assert.equal(
    rows[0].cells[0].uuid,
    "Compendium.yehors-sw-ffg-shared-data.yn-talents.Item.uZA7QtFgQE00Kt9c",
  );
});
