import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { ROLL_OPTION_LIBRARY, libraryEntryFor } from "../../modules/config/roll-option-library.js";
import { defaultSkillList } from "../../modules/config/ffg-skillslist.js";
import { normalizeName, validateOptions } from "../../modules/helpers/roll-options.js";

/**
 * The roll option library (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "The library"): the first eight entries and the talents added from the specialization trees.
 */

/** The first eight entries, exactly as they shipped. */
const ORIGINAL_ENTRIES = {
  "auto-fire": [
    { id: "auto-fire", label: "Auto-fire", offer: { attack: true }, dice: { difficulty: 1 } },
  ],
  "intense-focus": [
    { id: "intense-focus", label: "Intense Focus", cost: { strain: 1, maneuvers: 1 }, dice: { upgradeAbility: 1 } },
  ],
  "frenzied-attack": [
    {
      id: "frenzied-attack",
      label: "Frenzied Attack",
      offer: { skills: ["Melee", "Brawl"] },
      amount: { max: "ranks", label: "Strain" },
      cost: { strain: "amount" },
      dice: { upgradeAbility: "amount" },
    },
  ],
  "guns-blazing": [
    {
      id: "guns-blazing",
      label: "Guns Blazing",
      offer: { skills: ["Ranged: Light"], twoWeapons: "same" },
      cost: { strain: 2 },
      dice: { difficulty: -1 },
    },
  ],
  "saber-swarm": [
    {
      id: "saber-swarm",
      label: "Saber Swarm",
      hint: "Once per round",
      offer: { skills: ["Lightsaber"] },
      cost: { strain: 1, maneuvers: 1 },
    },
  ],
  "true-aim": [
    {
      id: "true-aim",
      label: "True Aim",
      hint: "Once per round",
      offer: { skillTypes: ["Combat"] },
      cost: { maneuvers: 1 },
      dice: { boost: 1, upgradeAbility: "ranks" },
    },
  ],
  "sniper-shot": [
    {
      id: "sniper-shot",
      label: "Sniper Shot",
      hint: "Not thrown weapons",
      offer: { skills: ["Ranged: Light", "Ranged: Heavy", "Gunnery"] },
      amount: { max: "ranks", label: "Range bands" },
      cost: { maneuvers: 1 },
      dice: { upgradeDifficulty: "amount" },
    },
  ],
  "point-blank": [
    {
      id: "point-blank",
      label: "Point Blank",
      hint: "Short range or engaged",
      offer: { skills: ["Ranged: Light", "Ranged: Heavy"] },
    },
  ],
};

const byId = (id) => ROLL_OPTION_LIBRARY.find((e) => e.id === id);

test("every library entry validates", () => {
  for (const entry of ROLL_OPTION_LIBRARY) assert.equal(validateOptions(entry.options).ok, true, entry.id);
});

test("the first eight entries are unchanged, and the talents bring the library to 269", () => {
  for (const [id, options] of Object.entries(ORIGINAL_ENTRIES)) {
    assert.ok(byId(id), id);
    assert.deepEqual(byId(id).options, options, id);
  }
  assert.equal(byId("auto-fire").kind, "quality");
  assert.deepEqual(ROLL_OPTION_LIBRARY.slice(0, 8).map((e) => e.id), Object.keys(ORIGINAL_ENTRIES));
  assert.equal(ROLL_OPTION_LIBRARY.length, 8 + 261);
  assert.ok(ROLL_OPTION_LIBRARY.slice(8).every((e) => e.kind === "talent"));
});

test("entry ids are unique and kebab-case", () => {
  const ids = ROLL_OPTION_LIBRARY.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
});

test("names match across case, spacing and punctuation, within their kind", () => {
  for (const name of ["Auto-Fire", "auto fire ", "AUTOFIRE"]) assert.equal(libraryEntryFor("quality", name)?.id, "auto-fire");
  assert.equal(libraryEntryFor("talent", "Auto-fire"), null);
  assert.equal(libraryEntryFor("talent", "Point Blank (Improved)"), null);
  assert.equal(libraryEntryFor("talent", "point blank")?.id, "point-blank");
});

test("no two entries of a kind share a normalized name", () => {
  for (const kind of ["talent", "quality"]) {
    const names = ROLL_OPTION_LIBRARY.filter((e) => e.kind === kind).flatMap((e) => e.names.map(normalizeName));
    assert.equal(new Set(names).size, names.length, kind);
  }
});

test("every offered skill is a skill of the Star Wars skill list", () => {
  const skills = Object.keys(defaultSkillList.find((list) => list.id === "starwars").skills);
  for (const entry of ROLL_OPTION_LIBRARY) {
    for (const option of entry.options) {
      for (const skill of option.offer?.skills ?? []) assert.ok(skills.includes(skill), `${entry.id}: ${skill}`);
    }
  }
});

test("labels and hints are words, with no dice markers", () => {
  for (const entry of ROLL_OPTION_LIBRARY) {
    for (const option of entry.options) {
      for (const text of [option.label, option.hint, option.amount?.label]) {
        if (text !== undefined) assert.doesNotMatch(text, /\[[^\]]*\]/, `${entry.id}: ${text}`);
      }
    }
  }
});

test("Guns Blazing cancels exactly one Two weapons die", () => {
  assert.deepEqual(libraryEntryFor("talent", "Guns Blazing").options[0].dice, { difficulty: -1 });
});

test("each macro is named after the entry's first name", () => {
  for (const entry of ROLL_OPTION_LIBRARY) assert.equal(entry.macroName, `Roll option: ${entry.names[0]}`);
});

test("Master Slicer costs 2 strain on Computers for one less difficulty", () => {
  const [option] = libraryEntryFor("talent", "Master Slicer").options;
  assert.deepEqual(option.offer, { skills: ["Computers"] });
  assert.deepEqual(option.cost, { strain: 2 });
  assert.deepEqual(option.dice, { difficulty: -1 });
});

test("Intimidating downgrades the difficulty once per strain chosen, up to its ranks", () => {
  const [option] = libraryEntryFor("talent", "Intimidating").options;
  assert.deepEqual(option.offer, { skills: ["Coercion"] });
  assert.deepEqual(option.amount, { max: "ranks", label: "Strain" });
  assert.deepEqual(option.cost, { strain: "amount" });
  assert.deepEqual(option.dice, { downgradeDifficulty: "amount" });
});

test("Quick Strike adds a boost die per rank to combat checks", () => {
  const [option] = libraryEntryFor("talent", "Quick Strike").options;
  assert.deepEqual(option.offer, { skillTypes: ["Combat"] });
  assert.deepEqual(option.dice, { boost: "ranks" });
});

test("talents with two rows keep both, each with its own id", () => {
  const entry = libraryEntryFor("talent", "Bargain Hunter");
  assert.deepEqual(entry.options.map((o) => o.id), ["bargain-hunter-boost", "bargain-hunter-setback"]);
  assert.deepEqual(entry.options.map((o) => o.dice), [{ boost: "ranks" }, { removeSetback: "ranks" }]);
});

test("names with an asterisk, other spellings and Improved forms resolve to their own entries", () => {
  assert.equal(libraryEntryFor("talent", "Against The Odds*")?.id, "against-the-odds");
  assert.equal(libraryEntryFor("talent", "Against the Odds")?.id, "against-the-odds");
  assert.equal(libraryEntryFor("talent", "Against The Odds*").macroName, "Roll option: Against The Odds*");
  assert.equal(libraryEntryFor("talent", "Surgeon (Improved)*")?.id, "surgeon-improved");
  assert.equal(libraryEntryFor("talent", "Short Cut")?.id, "short-cut");
  assert.equal(libraryEntryFor("talent", "Shortcut")?.id, "short-cut");
  assert.equal(libraryEntryFor("talent", "Shortcut (Improved)")?.id, "shortcut-improved");
  assert.equal(libraryEntryFor("talent", "In The Know (Improved)")?.id, "in-the-know-improved");
  assert.equal(libraryEntryFor("talent", "In The Know")?.id, "in-the-know");
});
