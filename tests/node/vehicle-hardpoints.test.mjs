import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HARDPOINT_PATH,
  vehicleHardpoints,
  vehicleHardpointSourceRating,
} from "../../modules/helpers/vehicle-hardpoints.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * Actor stand-in. `shown` is the PREPARED hard-point value -- what the sheet sees
 * after the attachments' `(inherent)` effects have already been applied.
 */
function vehicle({ shown, attachments = [] }) {
  const items = attachments.map((a, i) => ({
    _id: `att${i}`,
    type: a.type ?? "shipattachment",
    system: { hardpoints: { value: a.hp } },
  }));
  const appliedEffects = [];
  attachments.forEach((a, i) => {
    if (a.effect === undefined) return;
    appliedEffects.push({
      name: a.effectName ?? "(inherent)",
      parent: items[i],
      changes: [{ key: HARDPOINT_PATH, mode: a.mode ?? 2, value: a.effect }],
    });
  });
  return { items, appliedEffects, system: { stats: { customizationHardPoints: { value: shown } } } };
}

test("the capacity is the vehicle's own rating, not the attachment-reduced one", () => {
  // 5 HP ship; a 2-HP attachment whose inherent effect already took its 2 away.
  const actor = vehicle({ shown: 3, attachments: [{ hp: 2, effect: -2 }] });
  assert.deepEqual(vehicleHardpoints(actor), { used: 2, max: 5 });
});

test("an attachment is never counted twice (issue: 2/5 became 4/3)", () => {
  // Turret 1 + Physical Countermeasures 1 + Hull/Keel 2 on a 5-HP hull.
  const actor = vehicle({
    shown: 1,
    attachments: [{ hp: 1, effect: -1 }, { hp: 1, effect: -1 }, { hp: 2, effect: -2 }],
  });
  assert.deepEqual(vehicleHardpoints(actor), { used: 4, max: 5 });
});

test("attachments carrying no effect (or a zeroed one) still spend their hard points", () => {
  const actor = vehicle({
    shown: 3,
    attachments: [{ hp: 1 }, { hp: 1, effect: 0 }, { hp: 2, effect: -2 }],
  });
  assert.deepEqual(vehicleHardpoints(actor), { used: 4, max: 5 });
});

test("hard points granted from elsewhere stay in the capacity", () => {
  // A gear item that adds +2 HP: its effect is not an attachment's spend.
  const actor = vehicle({ shown: 7, attachments: [{ hp: 2, effect: -2 }] });
  actor.appliedEffects.push({
    parent: { type: "gear" },
    changes: [{ key: HARDPOINT_PATH, mode: 2, value: 4 }],
  });
  assert.deepEqual(vehicleHardpoints(actor), { used: 2, max: 9 });
});

test("a spend is given back whatever effect carries it", () => {
  // The cost need not live on the "(inherent)" effect: a user can author it as a modifier row
  // (which lands on an attr<timestamp> effect) or rename the inherent one in Foundry's AE
  // config. Matching on the name would silently stop giving these back and re-charge the hull.
  const actor = vehicle({ shown: 3, attachments: [{ hp: 2, effect: -2, effectName: "attr1750000000000" }] });
  assert.deepEqual(vehicleHardpoints(actor), { used: 2, max: 5 });
});

test("a separate effect on an attachment can grant hard points", () => {
  // A 5-HP hull spends 2 on the attachment and gains 1 from a separate modifier.
  // The prepared value is 4; only giving back the inherent -2 reconstructs 6.
  const actor = vehicle({ shown: 4, attachments: [{ hp: 2, effect: -2 }] });
  actor.appliedEffects.push({
    name: "Reinforced Mount",
    parent: actor.items[0],
    changes: [{ key: HARDPOINT_PATH, mode: 2, value: 1 }],
  });
  assert.deepEqual(vehicleHardpoints(actor), { used: 2, max: 6 });
});

test("only ADD-mode spends are added back; other modes are left alone", () => {
  const actor = vehicle({ shown: 0, attachments: [{ hp: 2, effect: 0, mode: 5 }] });
  assert.deepEqual(vehicleHardpoints(actor), { used: 2, max: 0 });
});

test("a vehicle with nothing installed reads as its own rating", () => {
  assert.deepEqual(vehicleHardpoints(vehicle({ shown: 5 })), { used: 0, max: 5 });
  assert.deepEqual(vehicleHardpoints(undefined), { used: 0, max: 0 });
});

test("the sheet error fallback preserves the stored hull rating", () => {
  assert.equal(vehicleHardpointSourceRating({
    _source: { system: { stats: { customizationHardPoints: { value: 5 } } } },
  }), 5);
  assert.equal(vehicleHardpointSourceRating({}), 0);

  const sheet = read("modules/actors/codex-sheets.js");
  assert.match(sheet, /cdxVehHpMax = vehicleHardpointSourceRating\(this\.actor\)/);
});

test("the Codex vehicle sheet shows used-of-rating and edits the rating", () => {
  const sheet = read("modules/actors/codex-sheets.js");
  const template = read("templates/actors/codex/codex-vehicle.html");
  assert.match(sheet, /vehicleHardpoints/);
  // The rating -- not the prepared value -- is what the readout and the edit
  // field use, so submitting the sheet cannot bake an attachment's spend in.
  assert.match(template, /\{\{cdxVehHpUsed\}\} \/ \{\{cdxVehHpMax\}\}/);
  assert.doesNotMatch(template, /name="data\.stats\.customizationHardPoints\.value" value="\{\{data\.stats/);
});

test("an actor exposing only allApplicableEffects() is read the same way", () => {
  const item = { type: "shipattachment", system: { hardpoints: { value: 2 } } };
  const effects = [
    { name: "(inherent)", parent: item, active: true, changes: [{ key: HARDPOINT_PATH, mode: 2, value: -2 }] },
    // A disabled effect never reached the prepared value, so it must not be given back.
    { name: "(inherent)", parent: item, active: false, changes: [{ key: HARDPOINT_PATH, mode: 2, value: -7 }] },
  ];
  const actor = {
    items: [item],
    allApplicableEffects: () => effects,
    system: { stats: { customizationHardPoints: { value: 3 } } },
  };
  assert.deepEqual(vehicleHardpoints(actor), { used: 2, max: 5 });
});
