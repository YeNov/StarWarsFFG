/**
 * The chat card's roll options line (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "Chat card"):
 *
 *   Roll options: Two weapons (same skill), Guns Blazing (2 strain), Point Blank 2, Frenzied Attack 2 (2 strain),
 *   Clanker Killer 2: Success
 *
 * Each option shows its label, then the amount the player picked (for an option with an amount) or
 * its rank (for a ranked talent), then the branch picked on its switch, then its costs. The costs come from the dialog's row states,
 * already resolved for the chosen amount. Options never change the weapon, so the line is the only
 * record of Linked, extra damage or range on the card.
 *
 * Localization is passed in, so Node covers it (tests/node/roll-option-card.test.mjs).
 */

const TWO_WEAPONS_KEYS = Object.freeze({
  same: "SWFFG.RollOptions.Card.TwoWeaponsSame",
  different: "SWFFG.RollOptions.Card.TwoWeaponsDifferent",
});

/**
 * The entries of the line: Two weapons first, then each ticked option in the order offered.
 * @param {object} params
 * @param {object[]} params.offered - from collectOfferedOptions
 * @param {{rows: object[]}} params.states - from planOptionStates
 * @param {"no"|"same"|"different"} params.twoWeapons
 * @param {"strain"|"wounds"} [params.unit] - what the payer pays in
 * @returns {Array<{label: string|null, labelKey: string|null, number: number|null, strain: number, unit: string, maneuvers: number, weapon?: {damage: number, critical: number}|null}>}
 */
export function rollOptionCardEntries({ offered, states, twoWeapons, unit = "strain" }) {
  const entries = [];
  if (TWO_WEAPONS_KEYS[twoWeapons]) {
    entries.push({ label: null, labelKey: TWO_WEAPONS_KEYS[twoWeapons], number: null, strain: 0, unit, maneuvers: 0 });
  }
  const rows = new Map((states?.rows ?? []).map((row) => [row.key, row]));
  for (const option of offered ?? []) {
    const row = rows.get(option.key);
    if (!row?.ticked) continue;
    const number = option.amount ? row.amount : option.ranked ? option.rank : null;
    const choice = row.choice ? (option.choices ?? []).find((branch) => branch.id === row.choice)?.label ?? null : null;
    entries.push({
      label: option.label, labelKey: null, number, choice, strain: row.cost.strain, unit, maneuvers: row.cost.maneuvers,
      weapon: row.weapon ?? null,
    });
  }
  return entries;
}

/**
 * A row's switch on the card: every branch, the picked one on (the first by default). Shown even
 * when the row is greyed, since the reason may belong to the picked branch only and another
 * branch may be fine.
 * @param {{choices?: Array<{id: string, label: string}>|null}} option - an offered row
 * @param {{choice?: string|null}|null} row - its planned state
 * @returns {Array<{id: string, label: string, on: boolean}>|null}
 */
export function optionChoicesContext(option, row) {
  if (!Array.isArray(option?.choices) || option.choices.length === 0) return null;
  const picked = row?.choice ?? option.choices[0].id;
  return option.choices.map((branch) => ({ id: branch.id, label: branch.label, on: branch.id === picked }));
}

/** "2 strain", "1 wound", "3 wounds". */
function strainText(n, unit, localize) {
  const key = unit === "wounds"
    ? (n === 1 ? "SWFFG.RollOptions.Cost.Wound" : "SWFFG.RollOptions.Cost.Wounds")
    : "SWFFG.RollOptions.Cost.Strain";
  return localize(key, { n });
}

/** "1 maneuver", "2 maneuvers". */
function maneuverText(n, localize) {
  return localize(n === 1 ? "SWFFG.RollOptions.Cost.Maneuver" : "SWFFG.RollOptions.Cost.Maneuvers", { n });
}

/** The costs of one entry or row, in reading order. */
function costParts({ strain = 0, maneuvers = 0 }, unit, localize) {
  const parts = [];
  if (strain > 0) parts.push(strainText(strain, unit, localize));
  if (maneuvers > 0) parts.push(maneuverText(maneuvers, localize));
  return parts;
}

/** "+2", "−1" (a true minus sign). */
const signed = (n) => (n < 0 ? `−${-n}` : `+${n}`);

/** What a ticked row does to the weapon: "+2 damage", "Crit −1"; nothing for a zero. */
function weaponParts(weapon, localize) {
  const parts = [];
  if (weapon?.damage) parts.push(localize("SWFFG.RollOptions.Card.Damage", { value: signed(weapon.damage) }));
  if (weapon?.critical) parts.push(localize("SWFFG.RollOptions.Card.Critical", { value: signed(weapon.critical) }));
  return parts;
}

/**
 * A row's cost on the roll options card: "2 strain · 1 maneuver", or "" when it costs nothing.
 * @param {{strain: number, maneuvers: number}} cost - the row's resolved cost
 * @param {"strain"|"wounds"} unit
 * @param {(key: string, data?: object) => string} localize
 * @returns {string}
 */
export function costText(cost, unit, localize) {
  return costParts(cost ?? {}, unit, localize).join(" · ");
}

/**
 * What a charge warning names: the total cost, and the options that cost it.
 * @param {ReturnType<typeof rollOptionCardEntries>} entries
 * @param {number} total
 * @param {"strain"|"wounds"} unit
 * @param {(key: string, data?: object) => string} localize
 * @returns {{cost: string, options: string}}
 */
export function describeCharge(entries, total, unit, localize) {
  const options = (entries ?? [])
    .filter((entry) => entry.strain > 0)
    .map((entry) => (entry.labelKey ? localize(entry.labelKey) : entry.label))
    .join(", ");
  return { cost: strainText(total, unit, localize), options };
}

/**
 * The line's text, or null when nothing was used.
 * @param {ReturnType<typeof rollOptionCardEntries>} entries
 * @param {(key: string, data?: object) => string} localize - game.i18n.format, or localize when there is no data
 * @returns {string|null}
 */
export function formatRollOptionsLine(entries, localize) {
  if (!entries?.length) return null;
  const parts = entries.map((entry) => {
    let text = entry.labelKey ? localize(entry.labelKey) : entry.label;
    if (entry.number !== null && entry.number !== undefined) text += ` ${entry.number}`;
    if (entry.choice) text += `: ${entry.choice}`;
    const costs = [...weaponParts(entry.weapon, localize), ...costParts(entry, entry.unit, localize)];
    if (costs.length > 0) text += ` (${costs.join(", ")})`;
    return text;
  });
  return localize("SWFFG.RollOptions.CardLine", { entries: parts.join(", ") });
}

/* The card itself (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md, "Sharing the
   card's code"): what the dice dialog and the initiative dialog both draw, kept here so both draw
   it the same way. */

const DIFFICULTY_NAMES = Object.freeze(["Simple", "Easy", "Average", "Hard", "Daunting", "Formidable"]);
const REASON_SUFFIX_ZERO = Object.freeze({ forceAvailable: "Force", destinyLight: "DestinyLight", destinyDark: "DestinyDark" });

/**
 * Why a row is greyed, in words.
 * @param {{code: string, data: object}} reason - from planOptionStates
 * @param {(key: string, data?: object) => string} localize
 * @returns {string}
 */
export function optionReasonText({ code, data }, localize) {
  const unitWord = (unit) => localize(unit === "wounds" ? "SWFFG.RollOptions.Unit.Wounds" : "SWFFG.RollOptions.Unit.Strain");
  switch (code) {
    case "needsTwoWeapons": {
      const suffix = { same: "Same", different: "Different" }[data.choice] ?? "Any";
      return localize(`SWFFG.RollOptions.Reason.NeedsTwoWeapons${suffix}`);
    }
    case "cannotPay": return localize("SWFFG.RollOptions.Reason.CannotPay");
    case "needsWriter": return localize("SWFFG.RollOptions.Reason.NeedsWriter");
    case "zeroMax": return localize("SWFFG.RollOptions.Reason.ZeroMax");
    case "overThreshold":
      return localize("SWFFG.RollOptions.Reason.OverThreshold", { unit: unitWord(data.unit), value: data.value, threshold: data.threshold });
    case "needsDifficulty": {
      const name = DIFFICULTY_NAMES[data.min];
      const level = name ? localize(`SWFFG.Difficulty${name}`) : String(data.min);
      return localize("SWFFG.RollOptions.Reason.NeedsDifficulty", { level });
    }
    case "zeroValue": return localize(`SWFFG.RollOptions.Reason.Zero${REASON_SUFFIX_ZERO[data.word] ?? "Force"}`);
    case "forceTaken": return localize("SWFFG.RollOptions.Reason.ForceTaken", { label: data.label });
    case "swapTaken": return localize("SWFFG.RollOptions.Reason.SwapTaken", { label: data.label });
    case "noBoost": return localize("SWFFG.RollOptions.Reason.NoBoost");
    case "cannotSwap": return localize("SWFFG.RollOptions.Reason.CannotSwap");
    default: return "";
  }
}

/** The option rows as the card shows them. */
function optionRows({ offered, states, amounts, tooltips, unit, localize }) {
  const rows = new Map((states?.rows ?? []).map((row) => [row.key, row]));
  return (offered ?? []).map((option) => {
    const row = rows.get(option.key);
    const amountLabel = option.amount?.label ?? localize("SWFFG.RollOptions.Panel.Amount");
    // No max: an amount with no cap beyond strain, or one whose cap is not known yet.
    const max = row?.maxAmount ?? (Number.isFinite(option.amount?.max) ? option.amount.max : null);
    const typed = amounts?.[option.key] ?? 1;
    return {
      key: option.key,
      label: option.ranked ? `${option.label} ${option.rank}` : option.label,
      cost: costText(row?.cost, unit, localize),
      ticked: row?.ticked === true,
      disabled: row?.disabled === true,
      amount: option.amount && !row?.disabled
        ? { value: row?.ticked ? row.amount : (max === null ? typed : Math.min(typed, max)), max, label: amountLabel }
        : null,
      choices: optionChoicesContext(option, row),
      reason: !!row?.reason,
      note: row?.reason ? optionReasonText(row.reason, localize) : option.hint,
      tooltip: tooltips?.get?.(option.key) ?? null,
    };
  });
}

/** "Strain after roll: 12 / 12" when the payer has a threshold and an offered option costs strain. */
function footerText({ pool, offered, states, localize }) {
  if (!pool || !(Number(pool.threshold) > 0)) return null;
  const costs = (offered ?? []).some((option) => option.cost?.strain === "amount" || Number(option.cost?.strain) > 0);
  if (!costs) return null;
  const key = pool.unit === "wounds" ? "SWFFG.RollOptions.Panel.WoundsAfter" : "SWFFG.RollOptions.Panel.StrainAfter";
  return localize(key, { value: states?.after, threshold: pool.threshold });
}

/**
 * What the card shows, for templates/dice/parts/roll-options-panel.html.
 * @param {object} params
 * @param {boolean} params.twoWeaponsAvailable
 * @param {"no"|"same"|"different"} params.twoWeapons
 * @param {object[]} params.buffs - offered optional buffs (with `applied` for those already in a sent pool)
 * @param {Set<string>} params.tickedBuffKeys
 * @param {object[]} params.offered - from collectOfferedOptions
 * @param {object} params.states - from planOptionStates
 * @param {Record<string, number>} params.amounts - amounts typed into rows not ticked yet
 * @param {Map<string, string>} params.tooltips - row key → description HTML
 * @param {{unit: string, current: number, threshold: number}|null} params.pool - readCostPool(actor)
 * @param {(key: string, data?: object) => string} params.localize
 * @returns {{twoWeapons: object, buffs: object[], options: object[], footer: string|null}}
 */
export function cardPanelContext({ twoWeaponsAvailable, twoWeapons, buffs, tickedBuffKeys, offered, states, amounts, tooltips, pool, localize }) {
  const choice = (value, suffix) => ({
    value,
    label: localize(`SWFFG.RollOptions.Panel.TwoWeapons${suffix}`),
    on: twoWeapons === value,
  });
  const unit = pool?.unit === "wounds" ? "wounds" : "strain";
  return {
    twoWeapons: {
      available: twoWeaponsAvailable === true,
      choices: [choice("no", "No"), choice("same", "Same"), choice("different", "Different")],
    },
    buffs: (buffs ?? []).map((buff) => ({
      key: buff.key,
      name: buff.name || localize("SWFFG.OptionalBuffs.Unnamed"),
      source: buff.source,
      ticked: buff.applied === true || !!tickedBuffKeys?.has(buff.key),
      locked: buff.applied === true,
    })),
    options: optionRows({ offered, states, amounts, tooltips, unit, localize }),
    footer: footerText({ pool, offered, states, localize }),
  };
}

/**
 * How many rows on the card are ticked, for the fold tab.
 * @param {object} params
 * @param {object[]} params.buffs
 * @param {Set<string>} params.tickedBuffKeys
 * @param {{rows: object[]}} params.states
 * @param {"no"|"same"|"different"} params.twoWeapons
 * @returns {number}
 */
export function tickedRowCount({ buffs, tickedBuffKeys, states, twoWeapons }) {
  const ticked = (buffs ?? []).filter((buff) => buff.applied === true || !!tickedBuffKeys?.has(buff.key)).length;
  const options = (states?.rows ?? []).filter((row) => row.ticked).length;
  return ticked + options + (twoWeapons && twoWeapons !== "no" ? 1 : 0);
}

/**
 * The ticks, picked branches and buff ticks a new offer still has rows for, as when the skill of an
 * initiative roll changes: the rest are dropped, the kept values stay as they were.
 * @param {{selection: Record<string, number>, choices: Record<string, string>, buffKeys: Set<string>}} state
 * @param {{offered: Array<{key: string}>, buffs: Array<{key: string}>}} offer
 * @returns {{selection: Record<string, number>, choices: Record<string, string>, buffKeys: Set<string>}}
 */
export function keepOffered({ selection = {}, choices = {}, buffKeys = new Set() }, { offered = [], buffs = [] }) {
  const optionKeys = new Set(offered.map((option) => option.key));
  const buffKeySet = new Set(buffs.map((buff) => buff.key));
  const keep = (object) => Object.fromEntries(Object.entries(object).filter(([key]) => optionKeys.has(key)));
  return {
    selection: keep(selection),
    choices: keep(choices),
    buffKeys: new Set([...buffKeys].filter((key) => buffKeySet.has(key))),
  };
}
