/**
 * Parry, Reflect and the talents a GM lists beside them: the target suffers strain (wounds, for
 * a rival) to shrink a hit before soak. Minions cannot voluntarily pay this cost.
 *
 * Every rule lives here, free of Foundry globals, so the Apply Damage dialog and the GM bridge's
 * writer share one implementation. The dialog reads the world settings and the target and passes
 * them in; the writer re-checks the cost against the live actor inside its queue. Labels come
 * back as i18n keys for the dialog to localize.
 *
 * @see docs/superpowers/specs/2026-10-04-parry-reflect-apply-damage-design.md
 */
import { MELEE_DEFENCE_SKILLS, RANGED_DEFENCE_SKILLS } from "./defence-helpers.js";

export const RULESET_VANILLA = "vanilla";
export const RULESET_RESPECIALIZED = "respecialized";

/** What using the talent costs before Supreme or Unarmed lowers it, and the floor they stop at. */
export const BASE_DEFENCE_COST = 3;
export const MIN_DEFENCE_COST = 1;

/**
 * Vanilla reduces by 2 plus ranks. reSpecialized v.56's Block and Deflect have no ranks and
 * take a flat 4 off the hit for the same 3 strain; Parry and Reflect stand in for them there.
 */
const VANILLA_BASE_REDUCTION = 2;
const RESPECIALIZED_REDUCTION = 4;

/**
 * The GM-editable name lists: the world setting each lives in, the field planDefensiveTalent
 * reads it from, its segment under `SWFFG.Settings.DefensiveTalents`, and its default. The
 * defaults carry the book names, the OggDude import names and the reSpecialized v.56 names.
 * Unarmed Block has Unarmed Parry's effect; reSpecialized has no Supreme variant.
 */
export const DEFENSIVE_TALENT_LISTS = Object.freeze([
  Object.freeze({ setting: "meleeDefenceTalents", field: "melee", label: "MeleeTalents", default: "Parry, Block" }),
  Object.freeze({ setting: "rangedDefenceTalents", field: "ranged", label: "RangedTalents", default: "Reflect, Deflect" }),
  Object.freeze({ setting: "meleeSupremeTalents", field: "meleeSupreme", label: "MeleeSupreme", default: "Parry (Supreme), Supreme Parry" }),
  Object.freeze({ setting: "rangedSupremeTalents", field: "rangedSupreme", label: "RangedSupreme", default: "Reflect (Supreme), Supreme Reflect" }),
  Object.freeze({ setting: "unarmedParryTalents", field: "unarmed", label: "Unarmed", default: "Unarmed Parry, Unarmed Block" }),
]);

const STRAIN_POOL = Object.freeze({ path: "system.stats.strain.value", thresholdPath: "system.stats.strain.max", unit: "strain" });
const WOUND_POOL = Object.freeze({ path: "system.stats.wounds.value", thresholdPath: "system.stats.wounds.max", unit: "wounds" });

/** Rivals pay wounds; minions cannot voluntarily suffer strain, and vehicles are out of scope. */
const COST_POOLS = Object.freeze({ character: STRAIN_POOL, nemesis: STRAIN_POOL, rival: WOUND_POOL });

const TOGGLE_LABEL_KEYS = Object.freeze({
  [RULESET_VANILLA]: Object.freeze({ melee: "SWFFG.ApplyDamage.Defence.ApplyParry", ranged: "SWFFG.ApplyDamage.Defence.ApplyReflect" }),
  [RULESET_RESPECIALIZED]: Object.freeze({ melee: "SWFFG.ApplyDamage.Defence.ApplyBlock", ranged: "SWFFG.ApplyDamage.Defence.ApplyDeflect" }),
});
const PUBLIC_KEYS = Object.freeze({ melee: "SWFFG.ApplyDamage.Defence.PublicMelee", ranged: "SWFFG.ApplyDamage.Defence.PublicRanged" });

/** `foundry.utils.getProperty`, without Foundry. */
function readPath(object, path) {
  return path.split(".").reduce((value, part) => (value == null ? undefined : value[part]), object);
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * A GM's comma-separated list, ready to match against talent names.
 * @param {string} text
 * @returns {string[]} trimmed, lowercased, deduplicated; blanks dropped
 */
export function parseTalentNames(text) {
  if (typeof text !== "string") return [];
  return [...new Set(text.split(",").map(normalizeName).filter(Boolean))];
}

/**
 * Which talents can answer an attack made with this skill.
 * @param {string} skillValue - the weapon's `system.skill.value`
 * @returns {"melee"|"ranged"|null}
 */
export function classifyAttack(skillValue) {
  if (MELEE_DEFENCE_SKILLS.includes(skillValue)) return "melee";
  if (RANGED_DEFENCE_SKILLS.includes(skillValue)) return "ranged";
  return null;
}

/**
 * The pool an actor type pays a defensive talent's cost from.
 * @param {string} actorType
 * @returns {{path: string, thresholdPath: string, unit: "strain"|"wounds"}|null}
 */
export function defenceCostPool(actorType) {
  return COST_POOLS[actorType] ?? null;
}

/**
 * The cost pool's current value and threshold, read from the actor as it stands now.
 * @param {object} actor
 * @returns {{path: string, unit: string, current: number, threshold: number}|null}
 */
export function readCostPool(actor) {
  const pool = defenceCostPool(actor?.type);
  if (!pool) return null;
  return {
    path: pool.path,
    unit: pool.unit,
    current: Number(readPath(actor, pool.path)) || 0,
    threshold: Number(readPath(actor, pool.thresholdPath)),
  };
}

/** Ranks one talentList entry contributes. An unranked ("N/A") or unreadable rank counts as 1. */
function entryRanks(entry) {
  const rank = Number(entry?.rank);
  return Number.isFinite(rank) && rank >= 1 ? Math.trunc(rank) : 1;
}

function matchingTalents(talentList, names) {
  const wanted = new Set(names ?? []);
  if (!wanted.size || !Array.isArray(talentList)) return [];
  return talentList.filter((entry) => wanted.has(normalizeName(entry?.name)));
}

/**
 * The talent the target can use against this attack, or null when it has none.
 *
 * Reads `actor.talentList`, which ActorFFG builds for characters, nemeses, rivals and minions
 * from specialization trees, standalone talents, species grants and attachment innate talents:
 * the same totals the sheet shows.
 *
 * @param {object} options
 * @param {object} options.actor
 * @param {"melee"|"ranged"|null} options.attack - from classifyAttack
 * @param {string} options.ruleset - RULESET_VANILLA or RULESET_RESPECIALIZED
 * @param {{melee: string[], ranged: string[], meleeSupreme: string[], rangedSupreme: string[], unarmed: string[]}} options.names
 *   - each list already through parseTalentNames
 * @returns {object|null}
 */
export function planDefensiveTalent({ actor, attack, ruleset, names } = {}) {
  if (attack !== "melee" && attack !== "ranged") return null;
  const pool = readCostPool(actor);
  if (!pool) return null;
  const talents = matchingTalents(actor.talentList, names?.[attack]);
  if (!talents.length) return null;

  const respecialized = ruleset === RULESET_RESPECIALIZED;
  const ranks = talents.reduce((sum, entry) => sum + entryRanks(entry), 0);
  const formula = respecialized
    ? { key: "SWFFG.ApplyDamage.Defence.FormulaRespec", ranks }
    : { key: ranks === 1 ? "SWFFG.ApplyDamage.Defence.FormulaVanillaOne" : "SWFFG.ApplyDamage.Defence.FormulaVanilla", ranks };
  // Each talent once, spelled as the target's first entry spells it.
  const talentNames = [];
  const seen = new Set();
  for (const entry of talents) {
    const key = normalizeName(entry.name);
    if (seen.has(key)) continue;
    seen.add(key);
    talentNames.push(String(entry.name).trim());
  }

  return {
    kind: attack,
    talentNames,
    ranks,
    reduction: respecialized ? RESPECIALIZED_REDUCTION : VANILLA_BASE_REDUCTION + ranks,
    formula,
    hasSupreme: matchingTalents(actor.talentList, attack === "melee" ? names?.meleeSupreme : names?.rangedSupreme).length > 0,
    hasUnarmed: attack === "melee" && matchingTalents(actor.talentList, names?.unarmed).length > 0,
    costPath: pool.path,
    unit: pool.unit,
    toggleLabelKey: TOGGLE_LABEL_KEYS[respecialized ? RULESET_RESPECIALIZED : RULESET_VANILLA][attack],
    publicKey: PUBLIC_KEYS[attack],
    current: pool.current,
    threshold: pool.threshold,
  };
}

/**
 * What using the talent costs with these modifiers selected.
 * @param {{supreme?: boolean, unarmed?: boolean}} [selected]
 * @returns {number}
 */
export function defenceCost({ supreme = false, unarmed = false } = {}) {
  const cost = supreme ? MIN_DEFENCE_COST : BASE_DEFENCE_COST;
  return unarmed ? Math.max(MIN_DEFENCE_COST, cost - 1) : cost;
}

/** The lowest cost this target's own modifiers allow. */
export function cheapestCost(plan) {
  return defenceCost({ supreme: !!plan?.hasSupreme, unarmed: !!plan?.hasUnarmed });
}

/**
 * Would paying `cost` take the target past its threshold? Exactly reaching it is allowed: the
 * rules incapacitate only when the threshold is exceeded. A threshold that is not a positive
 * number is unknown, and never refuses.
 * @param {{current: number, threshold: number}} pool
 * @param {number} cost
 * @returns {boolean}
 */
export function wouldIncapacitate(pool, cost) {
  const threshold = Number(pool?.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return (Number(pool?.current) || 0) + cost > threshold;
}

/**
 * The dialog's control state. Unsupported modifiers have no effect, but a selected defence is
 * preserved when its cost becomes unaffordable. Apply stays blocked and the user may explicitly
 * turn the main toggle off; a refresh never converts that choice into ordinary damage.
 * @param {object} plan - from planDefensiveTalent
 * @param {{current: number, threshold: number}|null} pool - readCostPool on the live actor
 * @param {{on?: boolean, supreme?: boolean, unarmed?: boolean}} [selection]
 * @returns {{toggleDisabled: boolean, on: boolean, supreme: boolean, unarmed: boolean, cost: number, applyDisabled: boolean}}
 */
export function planDefenceControls(plan, pool, selection = {}) {
  const live = pool ?? plan;
  const on = !!selection.on;
  const toggleDisabled = !on && wouldIncapacitate(live, cheapestCost(plan));
  const supreme = on && !!plan.hasSupreme && !!selection.supreme;
  const unarmed = on && !!plan.hasUnarmed && !!selection.unarmed;
  const cost = defenceCost({ supreme, unarmed });
  return { toggleDisabled, on, supreme, unarmed, cost, applyDisabled: on && wouldIncapacitate(live, cost) };
}

/** The i18n key for `count` of a cost pool's unit: "strain", "wound" or "wounds". */
export function unitLabelKey(unit, count) {
  if (unit === "strain") return "SWFFG.ApplyDamage.Defence.UnitStrain";
  return count === 1 ? "SWFFG.ApplyDamage.Defence.UnitWound" : "SWFFG.ApplyDamage.Defence.UnitWounds";
}
