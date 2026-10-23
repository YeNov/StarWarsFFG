/**
 * The roll option format (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "The option format").
 *
 * A roll option is one entry in a macro's JSON: something the player can tick in the roll dialog
 * that changes that one roll and may cost strain. The macro's text is data the system reads, never
 * code it runs. Every key is optional:
 *
 *   { id, label, hint,
 *     offer: { skills, skillTypes, attack, twoWeapons, minDifficulty, initiative },
 *     amount: { max, label },
 *     cost: { strain, maneuvers },
 *     dice: { boost, setback, removeSetback, difficulty,
 *             upgradeAbility, downgradeAbility, upgradeDifficulty, downgradeDifficulty,
 *             success, advantage, triumph, threat, failure, despair, force, removeBoost },
 *     difficultyFloor, characteristic, skill,
 *     choices: [{ id, label, dice }, …] }
 *
 * Dice values are whole numbers or words: "ranks", "amount", "forceRating", and the live
 * "forceAvailable" (Force rating less committed dice), "destinyLight" and "destinyDark" (the
 * Destiny pool). A word may carry a minus ("-ranks"). `amount.max` is a positive whole number or
 * one of the words, or is left out for no cap beyond the payer's strain. `choices` are the
 * either/or branches of one row (the first is the default); their dice add to the option's own.
 * `offer.initiative` true offers a row on initiative rolls only, false never on them; left out, an
 * initiative roll is like any check of its skill
 * (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md).
 *
 * The validator collects every problem rather than stopping at the first, so a GM sees them all at
 * once. Errors are data ({option, key, code}); the Foundry side turns them into localized text.
 *
 * Imports nothing, so Node covers it (tests/node/roll-options.test.mjs).
 */

export const SKILL_TYPES = Object.freeze(["Combat", "General", "Knowledge", "Social", "Magic"]);

export const DICE_KEYS = Object.freeze([
  "boost", "setback", "removeSetback", "difficulty",
  "upgradeAbility", "downgradeAbility", "upgradeDifficulty", "downgradeDifficulty",
  "success", "advantage", "triumph", "threat", "failure", "despair", "force", "removeBoost",
]);

/** The characteristics a swap may name, as actor data keys them. */
export const CHARACTERISTICS = Object.freeze(["Brawn", "Agility", "Intellect", "Cunning", "Willpower", "Presence"]);

/** Words read live from the actor and the Destiny pool every time the dialog plans its rows. */
export const LIVE_WORDS = Object.freeze(["forceAvailable", "destinyLight", "destinyDark"]);

/** The Two weapons switch in the dialog. */
export const TWO_WEAPONS_CHOICES = Object.freeze(["no", "same", "different"]);

/** What `offer.twoWeapons` may ask for: a choice, or any choice but "no". */
export const TWO_WEAPONS_OFFERS = Object.freeze(["same", "different", "any"]);

/** The item types that carry a list of links to option macros. */
export const LINK_ITEM_TYPES = Object.freeze(["talent", "weapon", "armour", "gear", "itemattachment", "itemmodifier"]);

const OPTION_KEYS = ["id", "label", "hint", "offer", "amount", "cost", "dice", "difficultyFloor", "characteristic", "skill", "choices"];
const OFFER_KEYS = ["skills", "skillTypes", "attack", "twoWeapons", "minDifficulty", "initiative"];
const AMOUNT_KEYS = ["max", "label"];
const COST_KEYS = ["strain", "maneuvers"];
const CHOICE_KEYS = ["id", "label", "dice"];
const MAX_WORDS = ["ranks", "forceRating", ...LIVE_WORDS];
const DICE_WORDS = ["ranks", "amount", "forceRating", ...LIVE_WORDS];

/**
 * A dice value's word without its sign, and the sign: "-ranks" → {word: "ranks", sign: -1}. Null
 * for a value that is not a known word, signed or not.
 * @param {unknown} value
 * @returns {{word: string, sign: 1|-1}|null}
 */
export function diceWord(value) {
  if (typeof value !== "string") return null;
  const negative = value.startsWith("-");
  const word = negative ? value.slice(1) : value;
  return DICE_WORDS.includes(word) ? { word, sign: negative ? -1 : 1 } : null;
}

/**
 * A name reduced to what matters for matching: no accents, lowercase, letters and digits only.
 * "Auto-Fire", "auto fire " and "AUTOFIRE" are one name; "Point Blank (Improved)" stays apart from
 * "Point Blank".
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The lang key that explains a validation error: `SWFFG.RollOptions.Error.<Code>`, with an option
 * that is not an object told apart from a group (offer, amount, cost, dice) that is not.
 * @param {{code: string, key: string}} error
 * @returns {string}
 */
export function optionErrorKey(error) {
  const code = String(error?.code ?? "");
  const name = code.charAt(0).toUpperCase() + code.slice(1);
  return `SWFFG.RollOptions.Error.${name}${code === "notObject" && !error?.key ? "Option" : ""}`;
}

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Check one option or a list of them.
 * @param {unknown} value
 * @returns {{ok: true, options: object[]} | {ok: false, errors: Array<{option: number|null, key: string, code: string}>}}
 */
export function validateOptions(value) {
  let list;
  if (Array.isArray(value)) list = value;
  else if (isPlainObject(value)) list = [value];
  else return { ok: false, errors: [{ option: null, key: "", code: "notList" }] };

  const errors = [];
  const seenIds = new Set();
  list.forEach((option, index) => checkOption(option, index + 1, errors, seenIds));
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, options: list.map((option) => structuredClone(option)) };
}

/**
 * Parse a macro's text and check it.
 * @param {string} text
 * @returns {ReturnType<typeof validateOptions>}
 */
export function parseOptionText(text) {
  let value;
  try {
    value = JSON.parse(String(text ?? ""));
  } catch (error) {
    return { ok: false, errors: [{ option: null, key: "", code: "json", detail: error.message }] };
  }
  return validateOptions(value);
}

function checkOption(option, number, errors, seenIds) {
  const fail = (key, code) => errors.push({ option: number, key, code });
  if (!isPlainObject(option)) {
    fail("", "notObject");
    return;
  }

  for (const key of Object.keys(option)) {
    if (!OPTION_KEYS.includes(key)) fail(key, "unknownKey");
  }

  if ("id" in option) {
    if (!isText(option.id)) fail("id", "notText");
    else if (seenIds.has(option.id)) fail("id", "duplicateId");
    else seenIds.add(option.id);
  }
  for (const key of ["label", "hint"]) {
    if (key in option && !isText(option[key])) fail(key, "notText");
  }

  // Keys that use "amount", checked once the rest of the option has been.
  const amountUsers = [];

  if ("offer" in option) checkOffer(option.offer, fail);
  if ("amount" in option) checkAmount(option.amount, fail);
  if ("cost" in option) checkCost(option.cost, fail, amountUsers);
  if ("dice" in option) checkDice(option.dice, fail, amountUsers, "dice");
  if ("difficultyFloor" in option && !(Number.isInteger(option.difficultyFloor) && option.difficultyFloor >= 0)) {
    fail("difficultyFloor", "notFloor");
  }
  if ("characteristic" in option && !CHARACTERISTICS.includes(option.characteristic)) fail("characteristic", "notCharacteristic");
  if ("skill" in option && !isText(option.skill)) fail("skill", "notText");
  if ("choices" in option) checkChoices(option.choices, fail, amountUsers);

  if (!("amount" in option)) {
    for (const key of amountUsers) fail(key, "amountWithoutAmount");
  }
}

function checkChoices(choices, fail, amountUsers) {
  if (!Array.isArray(choices) || choices.length < 2) {
    fail("choices", "notChoices");
    return;
  }
  const seen = new Set();
  choices.forEach((choice, index) => {
    const at = `choices[${index + 1}]`;
    if (!isPlainObject(choice)) {
      fail(at, "notObject");
      return;
    }
    checkKnownKeys(at, choice, CHOICE_KEYS, fail);
    if (!isText(choice.id)) fail(`${at}.id`, "notText");
    else if (seen.has(choice.id)) fail(`${at}.id`, "duplicateChoiceId");
    else seen.add(choice.id);
    if (!isText(choice.label)) fail(`${at}.label`, "notText");
    if ("dice" in choice) checkDice(choice.dice, fail, amountUsers, `${at}.dice`);
  });
}

function checkKnownKeys(group, value, known, fail) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) fail(`${group}.${key}`, "unknownKey");
  }
}

function checkOffer(offer, fail) {
  if (!isPlainObject(offer)) {
    fail("offer", "notObject");
    return;
  }
  checkKnownKeys("offer", offer, OFFER_KEYS, fail);
  if ("skills" in offer && !(Array.isArray(offer.skills) && offer.skills.every(isText))) {
    fail("offer.skills", "notTextList");
  }
  if ("skillTypes" in offer) {
    if (!(Array.isArray(offer.skillTypes) && offer.skillTypes.every(isText))) fail("offer.skillTypes", "notTextList");
    else if (!offer.skillTypes.every((type) => SKILL_TYPES.includes(type))) fail("offer.skillTypes", "notSkillType");
  }
  if ("attack" in offer && typeof offer.attack !== "boolean") fail("offer.attack", "notBoolean");
  if ("initiative" in offer && typeof offer.initiative !== "boolean") fail("offer.initiative", "notBoolean");
  if ("twoWeapons" in offer && !TWO_WEAPONS_OFFERS.includes(offer.twoWeapons)) fail("offer.twoWeapons", "notTwoWeapons");
  if ("minDifficulty" in offer && !(Number.isInteger(offer.minDifficulty) && offer.minDifficulty >= 1)) {
    fail("offer.minDifficulty", "notMinDifficulty");
  }
}

function checkAmount(amount, fail) {
  if (!isPlainObject(amount)) {
    fail("amount", "notObject");
    return;
  }
  checkKnownKeys("amount", amount, AMOUNT_KEYS, fail);
  if ("max" in amount) {
    const max = amount.max;
    const validMax = (Number.isInteger(max) && max >= 1) || MAX_WORDS.includes(max);
    if (!validMax) fail("amount.max", "notMax");
  }
  if ("label" in amount && !isText(amount.label)) fail("amount.label", "notText");
}

function checkCost(cost, fail, amountUsers) {
  if (!isPlainObject(cost)) {
    fail("cost", "notObject");
    return;
  }
  checkKnownKeys("cost", cost, COST_KEYS, fail);
  for (const key of COST_KEYS) {
    if (!(key in cost)) continue;
    const value = cost[key];
    if (value === "amount") amountUsers.push(`cost.${key}`);
    else if (!(Number.isInteger(value) && value >= 0)) fail(`cost.${key}`, "notCost");
  }
}

function checkDice(dice, fail, amountUsers, at) {
  if (!isPlainObject(dice)) {
    fail(at, "notObject");
    return;
  }
  checkKnownKeys(at, dice, DICE_KEYS, fail);
  for (const key of DICE_KEYS) {
    if (!(key in dice)) continue;
    const value = dice[key];
    const word = diceWord(value);
    if (word?.word === "amount") amountUsers.push(`${at}.${key}`);
    else if (!(Number.isInteger(value) || word)) fail(`${at}.${key}`, "notDiceValue");
  }
}
