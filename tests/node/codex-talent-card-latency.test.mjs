import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  findOwnedTalentSourceId,
  findTalentListEntry,
  talentDetailProperties,
} from "../../modules/actors/talent-details.js";

const actorSheetSource = fs.readFileSync(
  new URL("../../modules/actors/actor-sheet-ffg.js", import.meta.url),
  "utf8",
);

test("talent cards resolve prepared actor data by id before falling back to name", () => {
  const talents = [
    { itemId: "shared", name: "First" },
    { itemId: "other", name: "Second" },
  ];

  assert.equal(findTalentListEntry(talents, "shared", "Second"), talents[0]);
  assert.equal(findTalentListEntry(talents, "missing", "Second"), talents[1]);
  assert.equal(findTalentListEntry(talents, "", "Unknown"), undefined);
});

test("local talent details retain the same Force and Ranked tags as Item details", () => {
  const localize = (key) => `localized:${key}`;
  assert.deepEqual(
    talentDetailProperties({ isForceTalent: true, isRanked: true }, localize),
    ["localized:SWFFG.ForceTalent", "localized:SWFFG.Ranked"],
  );
  assert.deepEqual(talentDetailProperties({}, localize), []);
});

test("merged talent rows resolve their directly owned source without a pack lookup", () => {
  assert.equal(
    findOwnedTalentSourceId({
      source: [
        { type: "specialization", id: "spec-id" },
        { type: "talent", id: "owned-id" },
      ],
    }),
    "owned-id",
  );
  assert.equal(findOwnedTalentSourceId({ source: [{ type: "species", id: "species-id" }] }), "species-id");
  assert.equal(findOwnedTalentSourceId({ source: [{ type: "specialization", id: "spec-id" }] }), undefined);
});

test("actor-sheet talent clicks take the local path before any compendium request", () => {
  const handlerStart = actorSheetSource.indexOf("// Toggle item details");
  const handlerEnd = actorSheetSource.indexOf("// Toggle Force Power details", handlerStart);
  const handler = actorSheetSource.slice(handlerStart, handlerEnd);

  const localLookup = handler.indexOf("findTalentListEntry(");
  const localRender = handler.indexOf("this._talentDisplayDetails(talent, ev)");
  const remoteLookup = handler.indexOf('ImportHelpers.findCompendiumEntityById("Item", itemId)');

  assert.ok(localLookup >= 0, "missing local talent-list lookup");
  assert.ok(localRender > localLookup, "local talent data is not rendered directly");
  assert.ok(remoteLookup > localRender, "compendium lookup still runs before the local talent path");
});

test("Codex talent edit and send-to-chat paths resolve local data before compendiums", () => {
  const editStart = actorSheetSource.indexOf("// Edit Inventory Item");
  const editEnd = actorSheetSource.indexOf("// Roll Force Power", editStart);
  const editHandler = actorSheetSource.slice(editStart, editEnd);
  assert.ok(editHandler.indexOf("findOwnedTalentSourceId(talent)") >= 0);
  assert.ok(
    editHandler.indexOf("findOwnedTalentSourceId(talent)")
      < editHandler.indexOf('ImportHelpers.findCompendiumEntityById("Item", itemId)'),
    "talent edit still scans packs before checking the owned source",
  );

  const chatStart = actorSheetSource.indexOf("async _itemDetailsToChat(");
  const chatEnd = actorSheetSource.indexOf("async _forcePowerDetailsToChat(", chatStart);
  const chatHandler = actorSheetSource.slice(chatStart, chatEnd);
  assert.ok(chatHandler.indexOf("findTalentListEntry(") >= 0);
  assert.ok(
    chatHandler.indexOf("findTalentListEntry(")
      < chatHandler.indexOf('ImportHelpers.findCompendiumEntityById("Item", itemId)'),
    "talent chat still scans packs before checking prepared talent data",
  );
  assert.doesNotMatch(chatHandler, /findCompendiumEntityByName/);
});
