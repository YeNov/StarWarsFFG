/**
 * Rolling a character's skill from the homestead sheet
 * (docs/superpowers/specs/2026-10-31-homestead-skill-roll-design.md): who may roll, the skill
 * search, and which of the homestead's upgrade modifier rows a roll gets.
 *
 * Free of Foundry globals, so Node covers it (tests/node/homestead-roll.test.mjs).
 */
import { BUFF_MODTYPES } from "./optional-buffs.js";
import { applicableRows } from "./optional-buffs-offer.js";
import { applyOfferedBuffs } from "../dice/optional-buff-pool.js";

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
 * The key of the first skill the search leaves, for Enter in the search box; null when none.
 * @param {Array<{key: string, label: string}>} skills
 * @param {string} query
 * @returns {string|null}
 */
export function firstSkill(skills, query, types = []) {
  return groupSkills(skills, types, query)[0]?.skills[0]?.key ?? null;
}

/**
 * The skills the search leaves, grouped as the character sheet shows them: categories in the
 * actor's `skilltypes` order (any other type after them), each sorted by key, or by label when
 * the Sort skills by label setting is on. Categories the search empties are dropped.
 * @param {Array<{key: string, label: string, type?: string}>} skills
 * @param {Array<{type: string, label: string}>} types - the actor's `system.skilltypes`
 * @param {string} query
 * @param {boolean} [byLabel]
 * @returns {Array<{type: string, label: string, skills: Array}>}
 */
export function groupSkills(skills, types, query, byLabel = false) {
  const order = [...(types ?? [])];
  const left = filterSkills(skills, query);
  for (const skill of left) {
    if (!order.some((t) => t.type === skill.type)) order.push({ type: skill.type, label: String(skill.type ?? "") });
  }
  const compare = byLabel
    ? (a, b) => String(a.label).localeCompare(String(b.label))
    : (a, b) => String(a.key).toLowerCase().localeCompare(String(b.key).toLowerCase());
  return order
    .map((t) => ({ type: t.type, label: t.label, skills: left.filter((s) => s.type === t.type).sort(compare) }))
    .filter((g) => g.skills.length > 0);
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

/**
 * Fold the upgrades' default rows into a character's pool, and record them the way a character's
 * own modifiers are recorded: a Skill Rank row raises the rank, a Skill Add Upgrade row the pool's
 * `upgrades`, an Upgrade / Downgrade Ability row its `modUpgrades` / `modDowngrades`. A Skill Rank
 * buff or a swap ticked later in the dialog rebuilds the positive dice from these, so they must
 * describe the dice the pool now holds.
 * @param {object} params
 * @param {DicePoolFFG} params.pool - the character's pool
 * @param {Array<{rows: Array}>} params.groups - from homesteadDefaultRows
 * @param {number} params.characteristic - the rolled characteristic's value
 * @param {number} params.rank - the character's skill rank
 * @returns {{pool: DicePoolFFG, rank: number}}
 */
export function homesteadRollPool({ pool, groups, characteristic, rank }) {
  const rows = (groups ?? []).flatMap((group) => group?.rows ?? []);
  const sum = (match) => rows.filter(match).reduce((total, row) => total + (Number(row.value) || 0), 0);
  const result = applyOfferedBuffs(pool, groups, { characteristic, rank });
  result.upgrades += sum((row) => row.modtype === "Skill Add Upgrade");
  result.modUpgrades += sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Upgrade Ability");
  result.modDowngrades += sum((row) => row.modtype === "Dice Modifiers" && row.mod === "Downgrade Ability");
  return { pool: result, rank: rank + sum((row) => row.modtype === "Skill Rank") };
}
