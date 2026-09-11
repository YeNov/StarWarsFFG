/**
 * Obligation, Duty and Morality: the totals the sheets show, the boxes they show them
 * in, and the d100 tables the Group Manager rolls against.
 *
 * Obligation and Duty are summed tracks. The value stored on the character is the
 * BASELINE -- what the wizard and the importers write (the ruleset's starting value
 * plus or minus any bonus taken), and what a GM edits in Edit Mode. Each Obligation (or
 * Duty) entry the character carries adds its magnitude on top. Entries created by the
 * wizard and importers arrive at magnitude 0, so their characters keep the number they
 * were built with, and entries edited later now count.
 *
 * Morality is not summed. Its entries are Emotional Strengths and Weaknesses with no
 * value; the score is set by hand and moves by the end-of-session Conflict roll.
 *
 * Pure on purpose -- documents in, plain data out. Every consumer calls these rather
 * than reading a total off the actor: a value added during data preparation is not in
 * the schema, and `actor.toObject(false)`, which the sheets build their context from,
 * serializes through the schema and would silently drop it.
 */

/** The item `system.subtype` values that mark a Morality entry (see CONFIG.FFG.characterCreator). */
const EMOTIONAL_STRENGTH = "Emotional Strength";
const EMOTIONAL_WEAKNESS = "Emotional Weakness";

/** Where the old OggDude character importer wrote each track's entries. */
const LEGACY_LISTS = Object.freeze({ obligation: "obligationlist", duty: "dutylist" });

/**
 * An entry's magnitude as a slice width: a whole positive number, otherwise 0. A blank
 * or unreadable magnitude used to become NaN and poison every range after it.
 * @param {*} value
 * @returns {number}
 */
export function entryMagnitude(value) {
  const n = Math.trunc(Number(value));
  return n > 0 ? n : 0;
}

/**
 * A character's Obligation, Duty or Morality entries -- `obligation` items whose
 * `system.type` names the track -- in the order the character carries them.
 * @param {Iterable<Item>} items
 * @param {"obligation"|"duty"|"morality"} track
 * @returns {Array<Item>}
 */
export function trackEntries(items, track) {
  return [...(items ?? [])].filter((item) => item?.type === "obligation" && item.system?.type === track);
}

/**
 * The baseline, entries and total of a summed track.
 * @param {Actor} character
 * @param {"obligation"|"duty"} track
 * @returns {{baseline: number, entries: Array<Item>, total: number}}
 */
export function characterTrack(character, track) {
  const baseline = Number(character?.system?.[track]?.value) || 0;
  const entries = trackEntries(character?.items, track);
  const total = baseline + entries.reduce((sum, entry) => sum + entryMagnitude(entry.system?.magnitude), 0);
  return { baseline, entries, total };
}

/**
 * Which of a sheet's Obligation, Duty and Morality/Conflict boxes to draw. A box shows
 * when the character has entries of that kind or a value in it; Edit Mode shows them
 * all, so a baseline can be set from nothing.
 * @param {Actor} character
 * @param {object} [options]
 * @param {boolean} [options.editMode]   The viewing user owns the character's Edit Mode.
 * @param {boolean} [options.forceUser]  Show Morality regardless (the Codex sheet's existing rule).
 * @returns {{obligation: boolean, duty: boolean, morality: boolean}}
 */
export function trackVisibility(character, { editMode = false, forceUser = false } = {}) {
  const inUse = (track) => {
    const { baseline, entries } = characterTrack(character, track);
    return entries.length > 0 || baseline !== 0;
  };
  const morality = Number(character?.system?.morality?.value) || 0;
  const conflict = Number(character?.system?.conflict?.value) || 0;
  return {
    obligation: editMode || inUse("obligation"),
    duty: editMode || inUse("duty"),
    morality: editMode || forceUser || trackEntries(character?.items, "morality").length > 0 || morality !== 0 || conflict !== 0,
  };
}

/**
 * One character's slices of a track's d100 table. The baseline has to be accounted for
 * as well as the entries:
 *  - an old import's list names the baseline's slices, as long as it still adds up to it;
 *  - otherwise, with exactly one entry, the baseline folds into it -- the common wizard
 *    case of one chosen Obligation at magnitude 0 with the number in the baseline;
 *  - otherwise the baseline takes its own slice, with no entry name (`type: ""`).
 * Every entry with a magnitude then takes its own slice.
 */
function trackSlices(character, track) {
  const { baseline, entries } = characterTrack(character, track);
  const base = entryMagnitude(baseline);
  const legacy = Object.values(character?.system?.[LEGACY_LISTS[track]] ?? {})
    .filter((item) => item != null)
    .map((item) => ({ type: item.type ?? "", magnitude: entryMagnitude(item.magnitude) }));
  const legacySum = legacy.reduce((sum, item) => sum + item.magnitude, 0);

  const slices = [];
  let listed = entries;
  if (legacy.length && legacySum === base) {
    slices.push(...legacy);
  } else if (entries.length === 1) {
    slices.push({ type: entries[0].name, magnitude: base + entryMagnitude(entries[0].system?.magnitude) });
    listed = [];
  } else if (base > 0) {
    slices.push({ type: "", magnitude: base });
  }
  for (const entry of listed) slices.push({ type: entry.name, magnitude: entryMagnitude(entry.system?.magnitude) });
  return slices.filter((slice) => slice.magnitude > 0);
}

/**
 * A track's d100 table: each slice takes the next run of numbers, sized by its
 * magnitude, in the order the characters are given. Built fresh on every call -- the
 * Group Manager once kept its tables on the window and appended to them on every render.
 * @param {Array<Actor>} characters
 * @param {"obligation"|"duty"} track
 * @returns {Array<{playerId: string, name: string, type: string, magnitude: number, rangeStart: number, rangeEnd: number}>}
 */
export function buildTrackTable(characters, track) {
  const table = [];
  let rangeStart = 0;
  for (const character of characters) {
    for (const slice of trackSlices(character, track)) {
      const rangeEnd = rangeStart + slice.magnitude;
      table.push({
        playerId: character.id,
        name: character.name,
        type: slice.type,
        magnitude: slice.magnitude,
        rangeStart: rangeStart + 1,
        rangeEnd,
      });
      rangeStart = rangeEnd;
    }
  }
  return table;
}

/**
 * The table row a d100 result lands on, or null when it falls past every slice.
 * @param {Array<{rangeStart: number, rangeEnd: number}>} table
 * @param {number} roll
 */
export function matchRange(table, roll) {
  return table.find((row) => row.rangeStart <= roll && roll <= row.rangeEnd) ?? null;
}

/**
 * The characters who track Morality -- a score set, or Morality entries -- with the
 * names of their Emotional Strengths and Weaknesses. A score of 0 with no entries is
 * "not tracked", the same reading the Codex alignment colour takes.
 * @param {Array<Actor>} characters
 * @returns {Array<{playerId: string, name: string, morality: number, strengths: string[], weaknesses: string[]}>}
 */
export function buildMoralityList(characters) {
  const list = [];
  for (const character of characters) {
    const entries = trackEntries(character?.items, "morality");
    const morality = Number(character?.system?.morality?.value) || 0;
    if (!entries.length && morality === 0) continue;
    const named = (subtype) => entries.filter((entry) => entry.system?.subtype === subtype).map((entry) => entry.name);
    list.push({
      playerId: character.id,
      name: character.name,
      morality,
      strengths: named(EMOTIONAL_STRENGTH),
      weaknesses: named(EMOTIONAL_WEAKNESS),
    });
  }
  return list;
}

/**
 * Triggering Morality (Force and Destiny Core Rulebook p. 323): the character whose
 * Morality is closest to the d100 result. The rules give no tie-break, so every
 * character equally close is returned and the GM chooses.
 * @param {Array<{morality: number}>} list
 * @param {number} roll
 */
export function closestMorality(list, roll) {
  let best = Infinity;
  let hits = [];
  for (const row of list) {
    const distance = Math.abs(row.morality - roll);
    if (distance < best) {
      best = distance;
      hits = [row];
    } else if (distance === best) {
      hits.push(row);
    }
  }
  return hits;
}
