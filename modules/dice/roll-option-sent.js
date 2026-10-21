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

function normalize(raw) {
  const options = {};
  for (const [key, amount] of Object.entries(raw?.options ?? {})) {
    if (typeof key === "string" && key && Number.isInteger(amount) && amount >= 1) options[key] = amount;
  }
  return {
    v: VERSION,
    defence: wholeAtLeastZero(raw?.defence),
    adversaryRanks: wholeAtLeastZero(raw?.adversaryRanks),
    adversaryMode: raw?.adversaryMode !== false,
    options,
    buffs: Array.isArray(raw?.buffs) ? raw.buffs.filter((key) => typeof key === "string" && key) : [],
    twoWeapons: TWO_WEAPONS_CHOICES.includes(raw?.twoWeapons) ? raw.twoWeapons : "no",
  };
}

/**
 * The layers to store as `flags.starwarsffg.sentLayers`.
 * @param {object} layers
 * @param {number} [layers.defence] - setback dice the sender's targets gave
 * @param {number} [layers.adversaryRanks]
 * @param {boolean} [layers.adversaryMode] - false when the sender chose the base pool
 * @param {Record<string, number>} [layers.options] - ticked option keys → amounts
 * @param {string[]} [layers.buffs] - ticked optional buff keys
 * @param {"no"|"same"|"different"} [layers.twoWeapons]
 * @returns {object}
 */
export function packSentLayers(layers = {}) {
  return normalize(layers);
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
