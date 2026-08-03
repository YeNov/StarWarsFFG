import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
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
