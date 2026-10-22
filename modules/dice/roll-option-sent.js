/**
 * The layers of a pool the GM sends to a player (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "A pool the GM sends to a player").
 *
 * The message carries the GM's base pool (their manual edits, nothing layered) and, apart from it,
 * what the dialog layered on top: the target defence and the Adversary upgrade the GM's targets
 * gave, the ticked roll options with their amounts, the ticked optional buffs and the Two weapons
 * choice. The player's dialog lays them on in the usual order (roll-option-pool.js), so its preview
 * is the GM's, and the player can untick any of them.
 *
 * A message sent before this change has no layers: its pool already holds them, and its buffs open
 * ticked and locked, as they always did.
 *
 * Imports nothing that touches Foundry, so Node covers it (tests/node/roll-option-sent.test.mjs).
 */
import { TWO_WEAPONS_CHOICES } from "../helpers/roll-options.js";

const VERSION = 1;

const wholeAtLeastZero = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.trunc(Number(value)) : 0);

/**
 * Option selections as [key, amount, choice], from the stored list (or, as the dialog holds them,
 * an object of amounts and an object of picked choices).
 */
function optionEntries(options, choices) {
  if (Array.isArray(options)) return options.map((entry) => [entry?.key, entry?.amount, entry?.choice]);
  return Object.entries(options ?? {}).map(([key, amount]) => [key, amount, choices?.[key]]);
}

function normalize(raw) {
  const options = {};
  const choices = {};
  for (const [key, amount, choice] of optionEntries(raw?.options, raw?.choices)) {
    if (!(typeof key === "string" && key && Number.isInteger(amount) && amount >= 1)) continue;
    options[key] = amount;
    if (typeof choice === "string" && choice) choices[key] = choice;
  }
  return {
    v: VERSION,
    defence: wholeAtLeastZero(raw?.defence),
    adversaryRanks: wholeAtLeastZero(raw?.adversaryRanks),
    adversaryMode: raw?.adversaryMode !== false,
    options,
    choices,
    buffs: Array.isArray(raw?.buffs) ? raw.buffs.filter((key) => typeof key === "string" && key) : [],
    twoWeapons: TWO_WEAPONS_CHOICES.includes(raw?.twoWeapons) ? raw.twoWeapons : "no",
  };
}

/**
 * The layers to store as `flags.starwarsffg.sentLayers`, with the options as a list of {key, amount}.
 * @param {object} layers
 * @param {number} [layers.defence] - setback dice the sender's targets gave
 * @param {number} [layers.adversaryRanks]
 * @param {boolean} [layers.adversaryMode] - false when the sender chose the base pool
 * @param {Record<string, number>} [layers.options] - ticked option keys → amounts
 * @param {Record<string, string>} [layers.choices] - option keys → picked branch id
 * @param {string[]} [layers.buffs] - ticked optional buff keys
 * @param {"no"|"same"|"different"} [layers.twoWeapons]
 * @returns {object}
 */
export function packSentLayers(layers = {}) {
  const { choices, ...normalized } = normalize(layers);
  // Option keys hold macro uuids ("Macro.abc:…"), and Foundry expands dotted keys in a document's
  // flags, so the selection is stored as a list of entries rather than an object keyed by them; a
  // picked choice travels in its option's entry.
  return {
    ...normalized,
    options: Object.entries(normalized.options).map(([key, amount]) => (key in choices ? { key, amount, choice: choices[key] } : { key, amount })),
  };
}

/**
 * The base pool as plain data for the message's flags. Foundry 14 does not keep a class instance
 * there (a DicePoolFFG arrived as {}), so only its own fields travel; the recipient rebuilds it.
 * @param {import("./pool.js").DicePoolFFG} pool
 * @returns {object}
 */
export function packSentPool(pool) {
  return JSON.parse(JSON.stringify(pool ?? {}));
}

/**
 * The layers a sent message carries, cleaned, or null for a message from before them.
 * @param {object} flags - the message's `flags.starwarsffg`
 * @returns {object|null}
 */
export function readSentLayers(flags) {
  const raw = flags?.sentLayers;
  if (!raw || typeof raw !== "object") return null;
  return normalize(raw);
}
