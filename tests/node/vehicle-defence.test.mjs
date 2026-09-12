/**
 * Vehicle defence zones. A vehicle's defence is per-zone: there is no single
 * "ship defence" number in the rules, and an attack always resolves against one
 * zone. These tests pin the contract that the zone SET comes entirely from the
 * actor's own prepared data, while only the ARRANGEMENT is hardcoded.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFENCE_ZONE_MODES,
  ZONE_ORDER,
  resolveDefenceTarget,
  vehicleDefenceZoneMode,
  vehicleDefenceZones,
  zoneReticleSvg,
} from "../../modules/helpers/vehicle-defence.js";

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

/* ------------------------------------------------------------------ *
 * The silhouette rule
 *
 * A craft of silhouette 4 or below defends in two zones, fore and aft.
 * Silhouette 5 and up defends in four. Every stock vehicle carries all four
 * ratings in its schema regardless, so the rule NARROWS the discovered set --
 * it never adds a zone the data does not have.
 * ------------------------------------------------------------------ */

/** Actor stand-in with a silhouette and, optionally, the per-vehicle override. */
const craft = (shields, silhouette, defenceZones) => ({
  type: "vehicle",
  system: { stats: { shields, silhouette: { value: silhouette }, defenceZones } },
});

/** A stock four-zone shield block. A factory, so no test can pollute another. */
const FOUR = () => ({ fore: 2, port: 1, starboard: 1, aft: 3 });

test("a silhouette 4 craft defends in fore and aft only", () => {
  assert.deepEqual(vehicleDefenceZones(craft(FOUR(), 4)), [
    { key: "fore", value: 2 },
    { key: "aft", value: 3 },
  ]);
});

test("a silhouette 5 craft still defends in all four zones", () => {
  // The other side of the boundary: `<= 4`, not `< 4` and not `<= 5`.
  assert.deepEqual(vehicleDefenceZones(craft(FOUR(), 5)).map((z) => z.key), [
    "fore", "starboard", "aft", "port",
  ]);
});

test("a craft with no readable silhouette is not treated as small", () => {
  // Narrowing hides stored ratings, so unreadable data errs towards showing them.
  // `silhouette` is nullable, and Number(null) === Number("") === 0 would read an
  // unset silhouette as the smallest craft there is.
  for (const silhouette of [undefined, null, "", "big", NaN]) {
    assert.equal(vehicleDefenceZoneMode(craft(FOUR(), silhouette)), "four", `silhouette ${silhouette}`);
  }
});

test("a literal silhouette 0 is readable and does narrow", () => {
  assert.equal(vehicleDefenceZoneMode(craft(FOUR(), 0)), "two");
});

test("every mode the vehicle schema offers is one the resolver understands", () => {
  // Both vehicle sheets build their picker from this list, so a mode offered
  // there but unknown to the resolver would be selectable and silently do nothing.
  assert.deepEqual(DEFENCE_ZONE_MODES, ["auto", "two", "four"]);
  for (const mode of DEFENCE_ZONE_MODES) {
    assert.ok(["two", "four"].includes(vehicleDefenceZoneMode(craft(FOUR(), 6, mode))), mode);
  }
  assert.equal(vehicleDefenceZoneMode(craft(FOUR(), 6, "auto")), "four");
  assert.equal(vehicleDefenceZoneMode(craft(FOUR(), 2, "auto")), "two");
});

test("a small craft overridden to four defends in all four zones", () => {
  assert.deepEqual(vehicleDefenceZones(craft(FOUR(), 2, "four")).map((z) => z.key), [
    "fore", "starboard", "aft", "port",
  ]);
});

test("a capital ship overridden to two defends in fore and aft only", () => {
  assert.deepEqual(vehicleDefenceZones(craft(FOUR(), 8, "two")).map((z) => z.key), ["fore", "aft"]);
});

test("an unset or unrecognised override defers to the silhouette", () => {
  for (const override of [undefined, null, "auto", "", "TWO", "half"]) {
    assert.equal(vehicleDefenceZoneMode(craft(FOUR(), 3, override)), "two", `override ${override}`);
    assert.equal(vehicleDefenceZoneMode(craft(FOUR(), 6, override)), "four", `override ${override}`);
  }
});

test("a hidden zone keeps its rating and comes back when the override says four", () => {
  // The narrowing reads; it never writes. Port and starboard stay in the data so
  // flipping the override restores them exactly as they were.
  const actor = craft(FOUR(), 2);
  assert.deepEqual(vehicleDefenceZones(actor).map((z) => z.key), ["fore", "aft"]);
  assert.equal(actor.system.stats.shields.port, 1);
  assert.equal(actor.system.stats.shields.starboard, 1);

  actor.system.stats.defenceZones = "four";
  assert.deepEqual(vehicleDefenceZones(actor), [
    { key: "fore", value: 2 },
    { key: "starboard", value: 1 },
    { key: "aft", value: 3 },
    { key: "port", value: 1 },
  ]);
});

test("narrowing never strands a craft that has neither a fore nor an aft zone", () => {
  // Filtering an exotic schema down to fore/aft would leave nothing to shoot at,
  // and a reticle with no wedges is a dead control. Keep what the craft has.
  assert.deepEqual(vehicleDefenceZones(craft({ dorsal: 2, ventral: 1 }, 3)).map((z) => z.key), [
    "dorsal", "ventral",
  ]);
});

/** Token stand-ins. `game.user.targets` is a Set of Tokens, so tests pass Sets. */
const shipToken = (shields) => ({ actor: { type: "vehicle", system: { stats: { shields } } } });
const troopToken = () => ({ actor: { type: "character", system: { stats: { defence: { ranged: 1, melee: 0 } } } } });

test("no targets at all resolves to none", () => {
  const result = resolveDefenceTarget(new Set());
  assert.equal(result.status, "none");
  assert.equal(result.actor, null);
  assert.deepEqual(result.zones, []);
});

test("a lone non-vehicle target resolves to none", () => {
  assert.equal(resolveDefenceTarget(new Set([troopToken()])).status, "none");
});

test("exactly one vehicle resolves to single, carrying its zones", () => {
  const token = shipToken({ fore: 2, port: 1, starboard: 1, aft: 0 });
  const result = resolveDefenceTarget(new Set([token]));
  assert.equal(result.status, "single");
  assert.equal(result.actor, token.actor);
  assert.deepEqual(result.zones.map((z) => z.key), ["fore", "starboard", "aft", "port"]);
});

test("a targeted small craft resolves to its two zones, not four", () => {
  // The roll dialog's whole path. resolveDefenceTarget delegates the zone set
  // rather than deriving one of its own, so the silhouette rule reaches the reticle.
  const result = resolveDefenceTarget(new Set([{ actor: craft(FOUR(), 3) }]));
  assert.equal(result.status, "single");
  assert.deepEqual(result.zones.map((z) => z.key), ["fore", "aft"]);
});

test("a non-vehicle alongside one vehicle is still single", () => {
  const token = shipToken({ fore: 2, aft: 1 });
  const result = resolveDefenceTarget(new Set([troopToken(), token]));
  assert.equal(result.status, "single");
  assert.equal(result.actor, token.actor);
});

test("two vehicles are ambiguous and carry no zones", () => {
  const result = resolveDefenceTarget(new Set([shipToken({ fore: 2 }), shipToken({ fore: 3 })]));
  assert.equal(result.status, "ambiguous");
  assert.equal(result.actor, null);
  assert.deepEqual(result.zones, []);
});

test("a vehicle whose shields yield no zones takes the none path", () => {
  // Same outcome as targeting no vehicle at all: no panel, no contribution.
  assert.equal(resolveDefenceTarget(new Set([shipToken({ label: "Shields" })])).status, "none");
  assert.equal(resolveDefenceTarget(new Set([shipToken(undefined)])).status, "none");
});

test("a null or undefined target collection resolves to none rather than throwing", () => {
  assert.equal(resolveDefenceTarget(undefined).status, "none");
  assert.equal(resolveDefenceTarget(null).status, "none");
});

test("a target with no actor is ignored", () => {
  assert.equal(resolveDefenceTarget(new Set([{ actor: null }])).status, "none");
});

const labelled = (...keys) => keys.map((key, i) => ({
  key,
  label: key.toUpperCase(),
  value: i,
  ariaLabel: `${key}, ${i} setback`,
}));

test("one wedge is emitted per zone", () => {
  const four = zoneReticleSvg({ zones: labelled("fore", "starboard", "aft", "port"), selected: null });
  assert.equal((four.match(/class="ffg-zone[ "]/g) ?? []).length, 4);
  const two = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: null });
  assert.equal((two.match(/class="ffg-zone[ "]/g) ?? []).length, 2);
  const six = zoneReticleSvg({ zones: labelled("a", "b", "c", "d", "e", "f"), selected: null });
  assert.equal((six.match(/class="ffg-zone[ "]/g) ?? []).length, 6);
});

test("exactly the selected zone is marked, by index not by key", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "starboard", "aft", "port"), selected: "aft" });
  assert.equal((svg.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((svg.match(/aria-pressed="false"/g) ?? []).length, 3);
  assert.match(svg, /data-zone-index="2"[^>]*aria-pressed="true"/);
  // Raw zone keys must never reach an attribute value.
  assert.doesNotMatch(svg, /data-zone-key=/);
});

test("nothing selected puts the whole reticle in its warning state", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: null });
  assert.match(svg, /class="ffg-zone-reticle ffg-zone-unpicked"/);
  assert.equal((svg.match(/aria-pressed="true"/g) ?? []).length, 0);
});

test("a selected zone clears the warning state", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: "fore" });
  assert.match(svg, /class="ffg-zone-reticle"/);
  assert.doesNotMatch(svg, /ffg-zone-unpicked/);
});

test("every wedge is keyboard-operable", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "aft"), selected: null });
  assert.equal((svg.match(/role="button"/g) ?? []).length, 2);
  assert.equal((svg.match(/tabindex="0"/g) ?? []).length, 2);
  assert.equal((svg.match(/aria-label="/g) ?? []).length, 2);
});

test("displayed text is XML-escaped", () => {
  const svg = zoneReticleSvg({
    zones: [{ key: "fore", label: `Fore & "aft" <hack>`, value: 1, ariaLabel: `a & b` }],
    selected: null,
  });
  assert.doesNotMatch(svg, /<hack>/);
  assert.match(svg, /Fore &amp; &quot;aft&quot; &lt;hack&gt;/);
  assert.match(svg, /aria-label="a &amp; b"/);
});

test("a single zone draws a complete donut instead of a degenerate 360 arc", () => {
  // SVG cannot draw an arc whose endpoints coincide -- it renders nothing at all.
  const svg = zoneReticleSvg({ zones: labelled("fore"), selected: null });
  const path = svg.match(/ d="([^"]+)"/)[1];
  const outerArcs = (path.match(/A 54 54/g) ?? []).length;
  const innerArcs = (path.match(/A 21 21/g) ?? []).length;
  assert.equal(outerArcs, 2, "outer ring split into two half arcs");
  assert.equal(innerArcs, 2, "inner ring split into two half arcs");
  assert.match(path, /Z$/);
});

test("the wedges run clockwise from the top, so the order reads nautically", () => {
  const svg = zoneReticleSvg({ zones: labelled("fore", "starboard", "aft", "port"), selected: null });
  // Anchored on the path element: a bare /d="/ also matches inside aria-presseD=".
  const starts = [...svg.matchAll(/<path class="ffg-zone-wedge" d="M ([\d.-]+) ([\d.-]+)/g)]
    .map(([, x, y]) => [Number(x), Number(y)]);
  assert.equal(starts.length, 4);
  // Each wedge begins at its anticlockwise edge, so wedge 0 (fore) starts top-left
  // and sweeps across the top; 1 (starboard) down the right; 2 (aft) across the
  // bottom; 3 (port) up the left.
  const [fore, starboard, aft, port] = starts;
  assert.ok(fore[0] < 60 && fore[1] < 60, `fore starts top-left, got ${fore}`);
  assert.ok(starboard[0] > 60 && starboard[1] < 60, `starboard starts top-right, got ${starboard}`);
  assert.ok(aft[0] > 60 && aft[1] > 60, `aft starts bottom-right, got ${aft}`);
  assert.ok(port[0] < 60 && port[1] > 60, `port starts bottom-left, got ${port}`);
});

test("no zones yields an empty string rather than an empty reticle", () => {
  assert.equal(zoneReticleSvg({ zones: [], selected: null }), "");
});

test("the value is stacked directly under the zone name in every wedge", () => {
  // Radial placement put the value nearer the hub, which reads as ABOVE the name
  // on the bottom wedge and beside it on the left and right ones. The pair must
  // stack the same way whichever direction the wedge faces.
  for (const count of [1, 2, 4, 6]) {
    const keys = Array.from({ length: count }, (_, i) => `z${i}`);
    const svg = zoneReticleSvg({ zones: labelled(...keys), selected: null });
    const names = [...svg.matchAll(/<text class="ffg-zone-name" x="([\d.-]+)" y="([\d.-]+)"/g)];
    const values = [...svg.matchAll(/<text class="ffg-zone-value" x="([\d.-]+)" y="([\d.-]+)"/g)];
    assert.equal(names.length, count);
    assert.equal(values.length, count);
    for (let i = 0; i < count; i++) {
      const [, nx, ny] = names[i];
      const [, vx, vy] = values[i];
      assert.equal(vx, nx, `wedge ${i} of ${count}: value shares the name's x`);
      assert.ok(
        Number(vy) > Number(ny),
        `wedge ${i} of ${count}: value y ${vy} must sit below name y ${ny}`,
      );
    }
  }
});
