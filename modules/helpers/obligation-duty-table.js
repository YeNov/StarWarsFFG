/**
 * The d100 trigger tables behind the Group Manager's Obligation and Duty sections.
 *
 * Each entry takes the next slice of 1-100, sized by its magnitude, and a d100 names
 * whoever's slice it lands in -- so the order characters are given in is the order
 * their slices run.
 *
 * Pure on purpose: every call starts from nothing but the characters it is handed.
 * The window used to push into arrays on its own instance that were only ever emptied
 * in the constructor, and it re-renders on every actor update, so each render appended
 * another copy of every entry and characters who had left the group stayed behind to
 * be named by the roll.
 */

/**
 * @param {Array<Actor>} characters  The group, in the order their slices should run.
 * @param {"obligationlist"|"dutylist"} listKey  Which of each character's lists to read.
 * @returns {Array<{playerId: string, name: string, type: string, magnitude: *, rangeStart: number, rangeEnd: number}>}
 */
export function buildRangeTable(characters, listKey) {
  const table = [];
  let rangeStart = 0;
  for (const character of characters) {
    for (const item of Object.values(character.system?.[listKey] ?? {})) {
      // Only a missing entry can throw here; skip it so one bad record cannot blank the table.
      if (item == null) continue;
      const rangeEnd = rangeStart + parseInt(item.magnitude);
      table.push({
        playerId: character.id,
        name: character.name,
        type: item.type,
        magnitude: item.magnitude,
        rangeStart: rangeStart + 1,
        rangeEnd,
      });
      rangeStart = rangeEnd;
    }
  }
  return table;
}
