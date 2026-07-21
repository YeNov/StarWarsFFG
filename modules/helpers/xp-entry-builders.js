/**
 * Pure builders for actor XP-log entries.
 *
 * These construct the plain entry objects that get prepended to an actor's
 * `flags.starwarsffg.xpLog` array. They are deliberately free of any Foundry
 * globals, document access, notifications, or side effects, so the PC wizard can
 * assemble XP-log entries offline (Stage 15) without going through the persisting
 * helpers in actor-helpers.js — which whisper the GM and write to the document.
 *
 * The persisting helpers (`xpLogSpend` / `xpLogEarn`) delegate to these builders
 * and supply `date` themselves; here `date` is an explicit argument.
 *
 * D10: the xpLog array shape is NOT changed and no migration is performed.
 *
 * @see modules/helpers/actor-helpers.js  (the document-writing callers)
 */

/**
 * Build a SPEND XP-log entry.
 *
 * `action` is always the constant literal `"purchased"` — the human-readable
 * description of what was bought lands in `description` (this mirrors the
 * original xpLogSpend, whose `action` parameter was stored under `description`,
 * never under the entry's own `action` field).
 *
 * @param {object} params
 * @param {string} params.description  what was purchased (e.g. "skill rank Astrogation 1 --> 2")
 * @param {number} params.cost         XP spent
 * @param {number} params.available    XP available afterwards
 * @param {number} params.total        XP total
 * @param {string} [params.statusId]   id of the associated active effect, if any
 * @param {string} params.date         ISO date (YYYY-MM-DD)
 * @returns {{action: "purchased", id: *, xp: {cost, available, total}, date, description}}
 */
export function buildXpSpendEntry({ description, cost, available, total, statusId, date }) {
  return {
    action: "purchased",
    id: statusId,
    xp: {
      cost,
      available,
      total,
    },
    date,
    description,
  };
}

/**
 * Build an EARN (grant/adjust) XP-log entry.
 *
 * The granted amount is stored under `xp.cost` (as the original xpLogEarn did),
 * and `action` is `"granted"` when the granter is the GM, else `"adjusted"`.
 *
 * @param {object} params
 * @param {number} params.grant        XP granted (stored under xp.cost)
 * @param {number} params.available    XP available afterwards
 * @param {number} params.total        XP total
 * @param {string} params.note         note about the grant (stored under description)
 * @param {string} [params.statusId]   id of the associated active effect, if any
 * @param {string} params.date         ISO date (YYYY-MM-DD)
 * @param {string} [params.granter="GM"]  who did the granting
 * @returns {{action: "granted"|"adjusted", id: *, xp: {cost, available, total}, date, description}}
 */
export function buildXpEarnEntry({ grant, available, total, note, statusId, date, granter = "GM" }) {
  return {
    action: granter === "GM" ? "granted" : "adjusted",
    id: statusId,
    xp: {
      cost: grant,
      available,
      total,
    },
    date,
    description: note,
  };
}
