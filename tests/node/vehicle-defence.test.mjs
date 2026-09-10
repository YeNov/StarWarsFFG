/**
 * Vehicle defence zones. A vehicle's defence is per-zone: there is no single
 * "ship defence" number in the rules, and an attack always resolves against one
 * zone. These tests pin the contract that the zone SET comes entirely from the
 * actor's own prepared data, while only the ARRANGEMENT is hardcoded.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ZONE_ORDER, vehicleDefenceZones } from "../../modules/helpers/vehicle-defence.js";

/** Actor stand-in carrying a prepared `stats.shields` block. */
const vehicle = (shields) => ({ type: "vehicle", system: { stats: { shields } } });

test("the four stock zones come back in nautical order, not stored order", () => {
  // Stored order is fore, port, starboard, aft -- laying wedges out in that order
  // would put port on the right and starboard at the bottom.
  const actor = vehicle({ fore: 2, port: 1, starboard: 1, aft: 0, label: "Shields" });
  assert.deepEqual(vehicleDefenceZones(actor), [
    { key: "fore", value: 2 },
    { key: "starboard", value: 1 },
    { key: "aft", value: 0 },
    { key: "port", value: 1 },
  ]);
});

test("the string `label` field is excluded structurally, not by name", () => {
  // `label` is a StringField; zones are NumberFields. An empty label would coerce
  // to 0 under Number(), so the filter tests the type, never the key.
  const actor = vehicle({ fore: 1, aft: 1, label: "" });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore", "aft"]);
});

test("a two-zone craft yields two zones and nothing is invented", () => {
  assert.deepEqual(vehicleDefenceZones(vehicle({ fore: 1, aft: 1 })), [
    { key: "fore", value: 1 },
    { key: "aft", value: 1 },
  ]);
});

test("an unknown zone key is kept and sorted after the known ones", () => {
  const actor = vehicle({ fore: 2, port: 1, starboard: 1, aft: 0, dorsal: 3 });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), [
    "fore", "starboard", "aft", "port", "dorsal",
  ]);
});

test("two unknown keys keep their stored order relative to each other", () => {
  const actor = vehicle({ ventral: 1, fore: 2, dorsal: 3 });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore", "ventral", "dorsal"]);
});

test("non-numeric and non-finite values are dropped", () => {
  const actor = vehicle({ fore: 2, aft: "1", port: NaN, starboard: null });
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore"]);
});

test("a negative zone survives extraction; clamping is the caller's job", () => {
  // An Active Effect can drive a zone below zero. It must still DISPLAY as stored.
  assert.deepEqual(vehicleDefenceZones(vehicle({ fore: -1 })), [{ key: "fore", value: -1 }]);
});

test("missing, null or malformed shields yield no zones rather than throwing", () => {
  assert.deepEqual(vehicleDefenceZones(vehicle(undefined)), []);
  assert.deepEqual(vehicleDefenceZones(vehicle(null)), []);
  assert.deepEqual(vehicleDefenceZones(vehicle("broken")), []);
  assert.deepEqual(vehicleDefenceZones({}), []);
  assert.deepEqual(vehicleDefenceZones(undefined), []);
});

test("a shields block holding only a label yields no zones", () => {
  assert.deepEqual(vehicleDefenceZones(vehicle({ label: "Shields" })), []);
});

test("ZONE_ORDER is arrangement only and never decides which zones exist", () => {
  assert.deepEqual(ZONE_ORDER, ["fore", "starboard", "aft", "port"]);
});
