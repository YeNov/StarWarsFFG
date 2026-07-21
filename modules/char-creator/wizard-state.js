/**
 * PC Wizard state factory + pure mutators.
 *
 * Covered (plan §0.6.2). Per the frozen rule-7 closure (§0.6.4) this module may
 * import only constants.js; the starting-bonus mutator therefore lives in
 * starting-bonus.js (applyStartingBonus), not here. No live Documents ever — every
 * selected entity is stored as a plain SelectionRef `{uuid, name, type, img, snapshot}`.
 *
 * Ported from CharacterCreator's `this.data` shape (character-creator.js:118-173),
 * plus the new `identity` and `commitId` fields the rewrite needs.
 */

/**
 * Convert a live item (or item-like) into the plain SelectionRef the state stores.
 * @param {{uuid, name, type, img, toObject: Function}} item
 * @returns {{uuid, name, type, img, snapshot}}
 */
export function toSelectionRef(item) {
  return {
    uuid: item.uuid,
    name: item.name,
    type: item.type,
    img: item.img,
    snapshot: item.toObject(),
  };
}

/**
 * Build the initial draft state. Reads world settings (defaults) through
 * game.settings.get, mints a fresh commitId, and rolls spendingCredits ONCE.
 *
 * @returns {object} a fresh wizard state
 */
export function createInitialData() {
  return {
    identity: {
      name: "",
      img: "",
    },
    commitId: foundry.utils.randomID(16),
    grants: {
      gm: {
        credits: game.settings.get("starwarsffg", "defaultCredits"),
      },
      bonus: {
        xp: 0,
        credits: 0,
        duty: 0,
        obligation: 0,
        conflict: 0,
        morality: 0,
      },
    },
    selected: {
      background: {
        culture: null,
        hook: null,
        forceAttitude: null,
      },
      startingBonus: null,
      obligations: [],
      species: null,
      career: null,
      careerCareerSkillRanks: [],
      specialization: null,
      specializationCareerSkillRanks: [],
      rules: "fad",
      motivations: [],
    },
    available: {
      specializations: [],
    },
    purchases: {
      xp: {
        characteristics: [],
        skills: [],
        talents: [],
        specializations: [],
        forcePowers: [],
      },
      credits: [],
    },
    initial: {
      // decreased with starting bonuses
      duty: game.settings.get("starwarsffg", "defaultDuty"),
      // increased with starting bonuses
      obligation: game.settings.get("starwarsffg", "defaultObligation"),
      // increased or decreased with starting bonuses
      morality: game.settings.get("starwarsffg", "defaultMorality"),
    },
    // d100, rolled once at draft creation and never re-rolled
    spendingCredits: Math.floor(Math.random() * 100) + 1,
  };
}

/**
 * Set the character's identity fields (name/img). Pure state transition.
 * @param {object} data
 * @param {{name?: string, img?: string}} identity
 * @returns {object} data
 */
export function setIdentity(data, { name, img } = {}) {
  if (name !== undefined) data.identity.name = name;
  if (img !== undefined) data.identity.img = img;
  return data;
}

/**
 * Store a single-select SelectionRef under selected[key] (e.g. "species", "career",
 * "specialization"). Pure state transition; `ref` is a plain SelectionRef, never a
 * live Document. Passing null clears the selection.
 * @param {object} data
 * @param {string} key
 * @param {object|null} ref
 * @returns {object} data
 */
export function setSelection(data, key, ref) {
  data.selected[key] = ref;
  return data;
}

/**
 * Append a SelectionRef to a multi-select list under selected[key] (e.g.
 * "motivations", "obligations"). Pure state transition.
 * @param {object} data
 * @param {string} key
 * @param {object} ref
 * @returns {object} data
 */
export function addSelection(data, key, ref) {
  data.selected[key].push(ref);
  return data;
}
