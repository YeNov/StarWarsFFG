/**
 * Initiative rolls (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md): the parts
 * of CombatFFG#rollInitiative that decide something, kept free of Foundry globals so Node covers
 * them (tests/node/initiative-roll.test.mjs). Lookups are passed in.
 *
 * - who rolls for a combatant (the Pilot of a vehicle) and from which data;
 * - the pool: the skill's dice as the initiative dialog has always built them, plus the add table,
 *   with the added upgrades recorded so a Skill Rank buff or a swap rebuilds the dice around them;
 * - what the dialog shows, read so that nothing missing (an actor, a skill) can stop it opening;
 * - a batch: who in a dialog can roll, and why the others cannot (no actor, no Pilot, no skill);
 * - a group roll: who has an initiative talent, and the order of the dialogs once the user answers
 *   whether to roll with talents.
 */
import { DicePoolFFG } from "../dice/pool.js";
import { crewRollOptions, withGroupSkillRanks } from "./minion-group.js";
import { hasInitiativeOption, linkedMacroUuids } from "./roll-options-offer.js";

/** The skills the initiative dialog always offers, after any skill flagged for initiative. */
const STANDARD_SKILLS = Object.freeze([
  Object.freeze({ name: "Vigilance", label: "SWFFG.SkillsNameVigilance" }),
  Object.freeze({ name: "Cool", label: "SWFFG.SkillsNameCool" }),
]);

const count = (value) => Number(value) || 0;

/**
 * Who rolls for a combatant's actor, and the data the pool is built from: a vehicle's crew member in
 * the Pilot role (a minion vehicle group's Pilot at the group's strength), anyone else themselves.
 * @param {object|null} actor - the combatant's actor (a token's own actor for an unlinked token)
 * @param {(id: string) => object|undefined} lookupActor - e.g. `(id) => game.actors.get(id)`
 * @returns {{actor: object|null, data: object|null, needsPilot: boolean}}
 */
export function initiativeRoller(actor, lookupActor) {
  if (!actor) return { actor: null, data: null, needsPilot: false };
  if (actor.type !== "vehicle") return { actor, data: actor.system ?? null, needsPilot: false };
  const crew = actor.getFlag?.("starwarsffg", "crew") ?? actor.flags?.starwarsffg?.crew;
  const pilotEntry = Array.isArray(crew) ? crew.find((member) => member?.role === "Pilot") : undefined;
  const pilot = pilotEntry ? lookupActor?.(pilotEntry.actor_id) : undefined;
  if (!pilot?.system) return { actor, data: actor.system ?? null, needsPilot: true };
  return { actor: pilot, data: withGroupSkillRanks(pilot.system, crewRollOptions(actor)), needsPilot: false };
}

/** The add table on a pool, as the initiative dialog has always applied it, upgrades recorded. */
function addTable(pool, added = {}) {
  pool.success += count(added.success);
  pool.advantage += count(added.advantage);
  pool.failure += count(added.failure);
  pool.threat += count(added.threat);
  pool.boost += count(added.boost);
  pool.setback += count(added.setback);
  pool.force = count(added.force);
  // DicePoolFFG#upgrade(undefined) upgrades once, so a missing count must be 0.
  const upgrades = count(added.upgrades);
  pool.upgrade(upgrades);
  pool.upgrades = upgrades;
  return pool;
}

/**
 * The initiative pool for one skill: its dice as the initiative dialog has always built them (the
 * higher of characteristic and rank in Ability, upgraded by the lower; the skill's Boost, Advantage
 * and Success), then the add table. Null when the data has no such skill or characteristic.
 * @param {object|null} data - the roller's system data
 * @param {string} skillKey
 * @param {object} [added] - the add table: boost, setback, upgrades, force, success, advantage, failure, threat
 * @returns {DicePoolFFG|null}
 */
export function initiativePool(data, skillKey, added = {}) {
  const skill = data?.skills?.[skillKey];
  const characteristic = data?.characteristics?.[skill?.characteristic]?.value;
  if (!skill || characteristic === undefined || characteristic === null) return null;
  const pool = new DicePoolFFG({
    ability: Math.max(characteristic, skill.rank),
    boost: skill.boost,
    advantage: skill.advantage,
    success: skill.success,
  });
  pool.upgrade(Math.min(characteristic, skill.rank));
  return addTable(pool, added);
}

/**
 * The pool the card plans on: the skill's initiative pool, or, when the skill has no data, an empty
 * pool with the add table, so the card always has one.
 * @param {object|null} data
 * @param {string} skillKey
 * @param {object} [added]
 * @returns {DicePoolFFG}
 */
export function initiativeBasePool(data, skillKey, added = {}) {
  return initiativePool(data, skillKey, added) ?? addTable(new DicePoolFFG(), added);
}

/**
 * The characteristic value and rank a Skill Rank buff or a swap rebuilds the dice from.
 * @param {object|null} data
 * @param {string} skillKey
 * @returns {{characteristic: number|null, rank: number|null}}
 */
export function initiativeSkillLayer(data, skillKey) {
  const skill = data?.skills?.[skillKey];
  const characteristic = data?.characteristics?.[skill?.characteristic]?.value;
  if (!skill || characteristic === undefined || characteristic === null) return { characteristic: null, rank: null };
  return { characteristic: count(characteristic), rank: count(skill.rank) };
}

/**
 * The initiative a roll gives: Successes, with Advantage as hundredths to break ties.
 * @param {{success: number, advantage: number}} ffg - RollFFG#ffg
 * @returns {number}
 */
export function initiativeValue(ffg) {
  return ffg.success + ffg.advantage * 0.01;
}

/**
 * The message's speaker, for a combatant with or without a token.
 * @param {object} combatant
 * @param {string|null} viewedSceneId
 * @returns {{scene: string|null, actor: string|null, token: string|null, alias: string}}
 */
export function initiativeSpeaker(combatant, viewedSceneId) {
  return {
    scene: combatant?.sceneId ?? viewedSceneId ?? null,
    actor: combatant?.actor?.id ?? null,
    token: combatant?.token?.id ?? null,
    alias: combatant?.token?.name ?? combatant?.name ?? "",
  };
}

/** Whether a combatant rolls hidden: its token or itself is hidden. */
export function initiativeHidden(combatant) {
  return combatant?.token?.hidden === true || combatant?.hidden === true;
}

/**
 * What the initiative dialog shows, read without touching anything that can be missing.
 *
 * For one combatant: its actor's name (else its own), the skills its roller flags for initiative
 * then Vigilance and Cool, and the roller the card is built for (one with an actor, and a Pilot for
 * a vehicle). For several, or a combatant that is gone: no name (the caller titles the dialog),
 * Vigilance and Cool, no card.
 * @param {string[]} ids
 * @param {{combatantOf: (id: string) => object|undefined, lookupActor: (id: string) => object|undefined}} lookups
 * @returns {{name: string|null, skills: Array<{name: string, label: string}>, cardRoller: {actor: object, data: object}|null}}
 */
export function initiativeDialogModel(ids, { combatantOf, lookupActor }) {
  const list = Array.isArray(ids) ? ids : [];
  const combatant = list.length === 1 ? combatantOf(list[0]) : null;
  if (!combatant) return { name: null, skills: STANDARD_SKILLS.map((skill) => ({ ...skill })), cardRoller: null };
  const roller = initiativeRoller(combatant.actor ?? null, lookupActor);
  const skills = [];
  for (const [key, skill] of Object.entries(roller.data?.skills ?? {})) {
    if (skill?.useForInitiative) skills.push({ name: key, label: skill.label ?? key });
  }
  for (const skill of STANDARD_SKILLS) {
    if (!skills.some((listed) => listed.name === skill.name)) skills.push({ ...skill });
  }
  return {
    name: combatant.actor?.name ?? combatant.name ?? "",
    skills,
    cardRoller: roller.actor && !roller.needsPilot ? { actor: roller.actor, data: roller.data } : null,
  };
}

/**
 * Who in a dialog's batch rolls, with the pool each rolls, and who cannot and why. A combatant that
 * is gone or that the user does not own is left out quietly, as the dialog always has.
 * @param {string[]} ids
 * @param {object} params
 * @param {(id: string) => object|undefined} params.combatantOf
 * @param {(id: string) => object|undefined} params.lookupActor
 * @param {string} params.skill - the skill picked in the dialog
 * @param {object} [params.added] - the add table
 * @returns {{rolls: Array<{id: string, combatant: object, actor: object, data: object, pool: DicePoolFFG}>,
 *   skipped: Array<{id: string, name: string, reason: "noActor"|"needsPilot"|"noSkill"}>}}
 */
export function planInitiativeBatch(ids, { combatantOf, lookupActor, skill, added = {} }) {
  const rolls = [];
  const skipped = [];
  for (const id of ids ?? []) {
    const combatant = combatantOf(id);
    if (!combatant || combatant.isOwner !== true) continue;
    const name = combatant.name ?? "";
    if (!combatant.actor) {
      skipped.push({ id, name, reason: "noActor" });
      continue;
    }
    const roller = initiativeRoller(combatant.actor, lookupActor);
    if (roller.needsPilot) {
      skipped.push({ id, name, reason: "needsPilot" });
      continue;
    }
    const pool = initiativePool(roller.data, skill, added);
    if (!pool) {
      skipped.push({ id, name, reason: "noSkill" });
      continue;
    }
    rolls.push({ id, combatant, actor: roller.actor, data: roller.data, pool });
  }
  return { rolls, skipped };
}

/** The rollers' items, for each listed combatant that has an actor. */
function rollerItems(ids, { combatantOf, lookupActor }) {
  return (ids ?? []).map((id) => {
    const roller = initiativeRoller(combatantOf(id)?.actor ?? null, lookupActor);
    return { id, items: roller.actor ? [...(roller.actor.items ?? [])] : [] };
  });
}

/**
 * The option macros the listed combatants' rollers link, once each, to load before telling who is
 * talented.
 * @param {string[]} ids
 * @param {{combatantOf: Function, lookupActor: Function}} lookups
 * @returns {string[]}
 */
export function initiativeMacroUuids(ids, lookups) {
  return linkedMacroUuids(rollerItems(ids, lookups).flatMap((entry) => entry.items));
}

/**
 * The listed combatants whose roller has an option kept to initiative rolls (hasInitiativeOption).
 * @param {string[]} ids
 * @param {{combatantOf: Function, lookupActor: Function, macros: Map<string, object>}} params
 * @returns {Set<string>}
 */
export function talentedCombatants(ids, { combatantOf, lookupActor, macros }) {
  const talented = new Set();
  for (const { id, items } of rollerItems(ids, { combatantOf, lookupActor })) {
    if (items.length > 0 && hasInitiativeOption({ items, macros })) talented.add(id);
  }
  return talented;
}

/**
 * Roll initiative for the listed combatants (design, "Group rolls"). One combatant gets a dialog
 * with the card; several with nobody talented get the shared dialog; otherwise `ask` says whether to
 * roll with talents: "together" is the shared dialog for everyone, "talents" the shared dialog for
 * the others (when there are any) and then a dialog with the card for each talented combatant, in
 * the order listed; anything else rolls nobody. Each dialog is awaited before the next opens.
 * @param {string[]} ids
 * @param {object} params
 * @param {Set<string>} params.talented
 * @param {(id: string) => string} params.nameOf
 * @param {(names: string[]) => Promise<"talents"|"together"|null>} params.ask
 * @param {(ids: string[], options: {withCard: boolean}) => Promise<void>} params.open
 * @returns {Promise<void>}
 */
export async function runInitiativeGroup(ids, { talented, nameOf, ask, open }) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return;
  if (list.length === 1) {
    await open([list[0]], { withCard: true });
    return;
  }
  const withTalents = list.filter((id) => talented.has(id));
  if (withTalents.length === 0) {
    await open(list, { withCard: false });
    return;
  }
  const plain = list.filter((id) => !talented.has(id));
  const answer = await ask(withTalents.map(nameOf));
  if (answer === "together") {
    await open(list, { withCard: false });
  } else if (answer === "talents") {
    if (plain.length > 0) await open(plain, { withCard: false });
    for (const id of withTalents) await open([id], { withCard: true });
  }
}
