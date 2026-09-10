/**
 * Vehicle defence zones.
 *
 * A vehicle's defence is not one number. Each zone (`system.stats.shields.<zone>`)
 * carries its own value, and an attack resolves against exactly one of them --
 * the zone the attacker is shooting into. Nothing here ever aggregates the zones:
 * there is no "ship defence" stat in the rules, so a max or an average would be
 * inventing one.
 *
 * The zone SET always comes from the actor's own prepared data. `stats.shields` is
 * a SchemaField, so the prepared object contains exactly the declared fields --
 * today `fore, port, starboard, aft, label`. If the data model later drops to two
 * zones or gains a fifth, everything here follows with no code change.
 *
 * Pure and dependency-free (no imports, no `game`, no DOM) so it can be unit tested
 * headlessly, the same contract `vehicle-hardpoints.js` keeps.
 */

/**
 * Where zones SIT, never which zones exist.
 *
 * Stored order is fore, port, starboard, aft; laying wedges out in that order puts
 * port on the right and starboard at the bottom. This table sorts whatever zones
 * the data supplied so the arrangement makes nautical sense. Unrecognised keys are
 * appended in their stored order. This is the one place a list of zone names
 * appears, and it is deliberate.
 */
export const ZONE_ORDER = ["fore", "starboard", "aft", "port"];

/**
 * A vehicle's defence zones, ordered for display.
 * @param {object} actor a prepared vehicle Actor (or any object with `system.stats.shields`).
 * @returns {Array<{key: string, value: number}>} empty for missing or malformed data.
 */
export function vehicleDefenceZones(actor) {
  const shields = actor?.system?.stats?.shields;
  if (!shields || typeof shields !== "object") return [];

  // Type, not name: `label` is a StringField and every zone is a NumberField, so
  // this separates them structurally. Testing the key would hardcode the zone set,
  // and Number("") === 0 would let an empty label masquerade as a zone.
  const zones = [];
  for (const [key, value] of Object.entries(shields)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    zones.push({ key, value });
  }

  const rank = (key) => {
    const index = ZONE_ORDER.indexOf(key);
    return index === -1 ? ZONE_ORDER.length : index;
  };
  // The index tiebreak keeps unknown keys in stored order rather than relying on
  // sort stability.
  return zones
    .map((zone, index) => ({ zone, index }))
    .sort((a, b) => rank(a.zone.key) - rank(b.zone.key) || a.index - b.index)
    .map((entry) => entry.zone);
}

/**
 * Which vehicle, if any, this roll resolves against.
 *
 * Only a SINGLE vehicle target is supported. Two ships lit up at once is genuinely
 * ambiguous -- the attacker may be fore of one and aft of the other -- so rather
 * than guess or silently contribute nothing, the caller is told to say so on screen.
 *
 * A vehicle whose shields yield no zones takes the `none` path, because there is
 * nothing to pick and a reticle with no wedges would be a dead control.
 *
 * @param {Iterable<object>|null|undefined} targets `game.user.targets`, or any iterable of Tokens.
 * @returns {{status: "none"|"single"|"ambiguous", actor: object|null, zones: Array<{key: string, value: number}>}}
 */
export function resolveDefenceTarget(targets) {
  const none = { status: "none", actor: null, zones: [] };
  if (!targets) return none;

  const vehicles = [];
  for (const token of targets) {
    if (token?.actor?.type === "vehicle") vehicles.push(token.actor);
  }
  if (vehicles.length === 0) return none;
  if (vehicles.length > 1) return { status: "ambiguous", actor: null, zones: [] };

  const actor = vehicles[0];
  const zones = vehicleDefenceZones(actor);
  if (zones.length === 0) return none;
  return { status: "single", actor, zones };
}

/* ------------------------------------------------------------------ *
 * Reticle geometry
 *
 * The reticle is returned as an SVG STRING rather than built as DOM, so the
 * geometry stays unit testable and this module keeps its no-DOM contract. The
 * dialog only assigns the result to innerHTML.
 * ------------------------------------------------------------------ */

const VIEWBOX = 120;
const CENTRE = 60;
const OUTER_R = 54;
const INNER_R = 21;
/**
 * Both text lines share one anchor at the middle of the ring, and the value is
 * offset straight DOWN from the name. Placing them at two different radii instead
 * would rotate the pair with the wedge -- readable at the top, but putting the
 * number above the name on the bottom wedge and beside it on the sides.
 */
const TEXT_R = 37;
const NAME_DY = -3;
const VALUE_DY = 10;

/** Point on a circle, measuring degrees CLOCKWISE from 12 o'clock. */
function polar(radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  const round = (n) => Math.round(n * 100) / 100;
  return [round(CENTRE + radius * Math.cos(radians)), round(CENTRE + radius * Math.sin(radians))];
}

/**
 * A full circle cannot be drawn as one arc: its start and end points coincide and
 * SVG renders nothing. Any span of 360 degrees is split into two halves.
 */
function arcSpans(from, to) {
  if (to - from < 360) return [[from, to]];
  const middle = from + 180;
  return [[from, middle], [middle, to]];
}

/** A donut segment: outer arc clockwise, inner arc back. */
function donutPath(from, to) {
  const spans = arcSpans(from, to);
  const [startX, startY] = polar(OUTER_R, from);
  let d = `M ${startX} ${startY}`;
  for (const [a, b] of spans) {
    const [x, y] = polar(OUTER_R, b);
    d += ` A ${OUTER_R} ${OUTER_R} 0 ${b - a > 180 ? 1 : 0} 1 ${x} ${y}`;
  }
  const [innerX, innerY] = polar(INNER_R, to);
  d += ` L ${innerX} ${innerY}`;
  for (const [a, b] of [...spans].reverse()) {
    const [x, y] = polar(INNER_R, a);
    d += ` A ${INNER_R} ${INNER_R} 0 ${b - a > 180 ? 1 : 0} 0 ${x} ${y}`;
  }
  return `${d} Z`;
}

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
/** Every displayed string is escaped: zone labels ultimately come from world data. */
const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);

/**
 * The zone picker, as SVG markup.
 *
 * Wedges are the circle divided by however many zones there are, with the first
 * centred at 12 o'clock. Nothing about "four" is baked in.
 *
 * Attributes carry the zone's INDEX, never its key: the caller holds the same
 * ordered array and maps back, so no schema-derived string reaches the markup.
 *
 * @param {object} options
 * @param {Array<{key: string, label: string, value: number, ariaLabel: string}>} options.zones
 *   ordered zones, already localised by the caller (this module must not touch `game`).
 * @param {string|null} options.selected the selected zone's `key`, or null for none.
 * @returns {string} SVG markup, or "" when there are no zones.
 */
export function zoneReticleSvg({ zones, selected }) {
  if (!Array.isArray(zones) || zones.length === 0) return "";

  const count = zones.length;
  const sweep = 360 / count;
  const rootClass = selected == null ? "ffg-zone-reticle ffg-zone-unpicked" : "ffg-zone-reticle";

  const wedges = zones.map((zone, index) => {
    const centreAngle = index * sweep;
    const path = donutPath(centreAngle - sweep / 2, centreAngle + sweep / 2);
    const [textX, textY] = polar(TEXT_R, centreAngle);
    const [labelX, labelY] = [textX, Math.round((textY + NAME_DY) * 100) / 100];
    const [valueX, valueY] = [textX, Math.round((textY + VALUE_DY) * 100) / 100];
    const isSelected = selected != null && zone.key === selected;
    const zeroClass = zone.value <= 0 ? " ffg-zone-empty" : "";
    return [
      `<g class="ffg-zone${isSelected ? " ffg-zone-selected" : ""}${zeroClass}"`,
      ` data-zone-index="${index}" role="button" tabindex="0"`,
      ` aria-pressed="${isSelected ? "true" : "false"}" aria-label="${escapeXml(zone.ariaLabel)}">`,
      `<path class="ffg-zone-wedge" d="${path}"/>`,
      `<text class="ffg-zone-name" x="${labelX}" y="${labelY}">${escapeXml(zone.label)}</text>`,
      `<text class="ffg-zone-value" x="${valueX}" y="${valueY}">${escapeXml(zone.value)}</text>`,
      `</g>`,
    ].join("");
  });

  return [
    `<svg class="${rootClass}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    wedges.join(""),
    `<circle class="ffg-zone-hub" cx="${CENTRE}" cy="${CENTRE}" r="${INNER_R}"/>`,
    `</svg>`,
  ].join("");
}
