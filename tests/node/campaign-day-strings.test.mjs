/**
 * The campaign day (Destiny Tracker readout, its edit dialog, the campaignDay setting) is a system
 * feature, so its strings live in the system's catalog -- not in the Codex II one, which a world
 * without the Codex II module never loads.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const english = JSON.parse(read("lang/en.json").replace(/^﻿/, ""));

const KEYS = {
  "SWFFG.CampaignDay.Day": "Day",
  "SWFFG.CampaignDay.Edit": "Edit",
  "SWFFG.CampaignDay.EditTitle": "Set Campaign Day",
  "SWFFG.CampaignDay.EditLabel": "Day number",
  "SWFFG.CampaignDay.EditSet": "Set",
};

test("the campaign-day strings are in the system's English catalog", () => {
  for (const [key, text] of Object.entries(KEYS)) assert.equal(english[key], text, key);
});

test("the Destiny Tracker and the campaignDay setting use them", () => {
  const tracker = read("modules/ffg-destiny-tracker.js");
  for (const key of ["SWFFG.CampaignDay.Edit\"", "SWFFG.CampaignDay.EditTitle", "SWFFG.CampaignDay.EditLabel", "SWFFG.CampaignDay.EditSet"]) {
    assert.ok(tracker.includes(key), key);
  }
  assert.ok(read("templates/ffg-destiny-tracker.html").includes('"SWFFG.CampaignDay.Day"'));
  assert.equal(read("modules/settings/settings-helpers.js").split("SWFFG.CampaignDay.Day").length - 1, 2);
});

test("no system file still uses the Codex keys for the campaign day", () => {
  for (const path of ["modules/ffg-destiny-tracker.js", "templates/ffg-destiny-tracker.html", "modules/settings/settings-helpers.js"]) {
    assert.doesNotMatch(read(path), /SWFFG\.Codex\.CritTrauma\.(Day|EditDay)/, path);
  }
});
