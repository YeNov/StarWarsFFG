/**
 * Rolling a character's skill from the homestead sheet
 * (docs/superpowers/specs/2026-10-31-homestead-skill-roll-design.md): who may roll, the skill
 * search, and which of the homestead's upgrade modifier rows a roll gets.
 *
 * Free of Foundry globals, so Node covers it (tests/node/homestead-roll.test.mjs).
 */
import { BUFF_MODTYPES } from "./optional-buffs.js";
import { applicableRows } from "./optional-buffs-offer.js";

const BUFF_MODTYPE_SET = new Set(BUFF_MODTYPES);

/**
 * The characters a user may roll with from a homestead: their own `character` actors, or for the
 * GM, the `character` actors some player owns. Sorted by name.
 * @param {object} params
 * @param {Iterable<Actor>} params.actors - the world's actors
 * @param {User} params.user - the user who clicked
 * @param {Iterable<User>} params.users - the world's users
 * @returns {Array<Actor>}
 */
export function homesteadRollers({ actors, user, users }) {
  const players = Array.from(users ?? []).filter((u) => !u?.isGM);
  const owns = (actor, u) => actor.testUserPermission?.(u, "OWNER") === true;
  const allowed = user?.isGM
    ? (actor) => players.some((p) => owns(actor, p))
    : (actor) => owns(actor, user);
  return Array.from(actors ?? [])
    .filter((actor) => actor?.type === "character" && allowed(actor))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/**
 * The skills whose label or key contains the query, ignoring case. A blank query keeps them all.
 * @param {Array<{key: string, label: string}>} skills
 * @param {string} query
 * @returns {Array<{key: string, label: string}>}
 */
export function filterSkills(skills, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [...(skills ?? [])];
  return (skills ?? []).filter((skill) =>
    String(skill.label ?? "").toLowerCase().includes(needle) || String(skill.key ?? "").toLowerCase().includes(needle));
}

/**
 * The upgrades of a homestead actor; nothing for anything else.
 * @param {Actor|null} homestead
 * @returns {Array<Item>}
 */
export function homesteadItems(homestead) {
  if (homestead?.type !== "homestead") return [];
  return Array.from(homestead.items ?? []).filter((item) => item?.type === "homesteadupgrade");
}

/**
 * The upgrades' own modifier rows that change this roll's dice, grouped per upgrade and shaped
 * like offered buffs, so applyOfferedBuffs can fold them into the pool. A row switched off adds
 * nothing; a skill row counts only for its skill; other row types (Characteristic, Stat) none.
 * @param {Iterable<Item>} items - the homestead's items
 * @param {string|null} skillKey - the skill rolled
 * @returns {Array<{key: string, name: string, source: string, rows: Array}>}
 */
export function homesteadDefaultRows(items, skillKey) {
  const groups = [];
  for (const item of items ?? []) {
    if (item?.type !== "homesteadupgrade") continue;
    const rows = Object.values(item.system?.attributes ?? {})
      .filter((row) => row && row.active !== false && BUFF_MODTYPE_SET.has(row.modtype))
      .map((row) => ({ modtype: row.modtype, mod: row.mod == null ? "" : String(row.mod), value: parseInt(row.value, 10) || 0 }));
    const applying = applicableRows({ rows }, { skillKey, skillTimes: 1, rollRows: true, rollTimes: 1 });
    if (applying.length > 0) {
      const id = item.id ?? item._id;
      groups.push({ key: `${id}:default`, name: item.name, source: item.name, rows: applying });
    }
  }
  return groups;
}
