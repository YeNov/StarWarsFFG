import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { ROLL_OPTION_LIBRARY, libraryEntryFor } from "../../modules/config/roll-option-library.js";
import { defaultSkillList } from "../../modules/config/ffg-skillslist.js";
import { normalizeName, validateOptions } from "../../modules/helpers/roll-options.js";
import { collectOfferedOptions } from "../../modules/helpers/roll-options-offer.js";

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
      hint: "Linked equal to your Force rating",
      offer: { skills: ["Lightsaber"], attack: true },
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
      // Added 2026-10-27, when options could change the weapon's damage.
      weapon: { damage: "ranks" },
    },
  ],
};

const byId = (id) => ROLL_OPTION_LIBRARY.find((e) => e.id === id);

test("every library entry validates", () => {
  for (const entry of ROLL_OPTION_LIBRARY) assert.equal(validateOptions(entry.options).ok, true, entry.id);
});

test("the first eight entries are as reviewed, and the talents bring the library to 218", () => {
  for (const [id, options] of Object.entries(ORIGINAL_ENTRIES)) {
    assert.ok(byId(id), id);
    assert.deepEqual(byId(id).options, options, id);
  }
  assert.equal(byId("auto-fire").kind, "quality");
  assert.deepEqual(ROLL_OPTION_LIBRARY.slice(0, 8).map((e) => e.id), Object.keys(ORIGINAL_ENTRIES));
  // 209 reviewed talents (2026-10-22), plus Deadly Accuracy (2026-10-27).
  assert.equal(ROLL_OPTION_LIBRARY.length, 8 + 210);
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
      for (const text of [option.label, option.hint, option.amount?.label, ...(option.choices ?? []).map((c) => c.label)]) {
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
  assert.equal(option.difficultyFloor, 1, "to a minimum of Easy");
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

test("either/or talents are one row with a switch", () => {
  for (const name of ["Bargain Hunter", "Constructor", "Gatherer", "Historian", "Inquiring", "Inventor", "Swindler*"]) {
    const entry = libraryEntryFor("talent", name);
    assert.equal(entry.options.length, 1, name);
    assert.deepEqual(entry.options[0].choices.map((c) => c.dice), [{ boost: "ranks" }, { removeSetback: "ranks" }], name);
  }
  assert.deepEqual(libraryEntryFor("talent", "Dead-Eye").options[0].choices.map((c) => c.id), ["boost", "called-shot"]);
  assert.deepEqual(libraryEntryFor("talent", "Surgeon (Improved)").options[0].choices.map((c) => c.dice), [{ boost: "amount" }, { removeSetback: "amount" }]);
});

test("names with an asterisk, other spellings and Improved forms resolve to their own entries", () => {
  assert.equal(libraryEntryFor("talent", "Against The Odds*")?.id, "against-the-odds");
  assert.equal(libraryEntryFor("talent", "Against the Odds")?.id, "against-the-odds");
  assert.equal(libraryEntryFor("talent", "Against The Odds*").macroName, "Roll option: Against The Odds*");
  assert.equal(libraryEntryFor("talent", "Surgeon (Improved)*")?.id, "surgeon-improved");
  assert.equal(libraryEntryFor("talent", "Short Cut")?.id, "short-cut");
  assert.equal(libraryEntryFor("talent", "Shortcut")?.id, "short-cut");
  assert.equal(libraryEntryFor("talent", "Shortcut (Improved)")?.id, "shortcut-improved");
  assert.equal(libraryEntryFor("talent", "In The Know (Improved)"), null, "deferred to docs/roll-options-deferred.md");
  assert.equal(libraryEntryFor("talent", "In The Know")?.id, "in-the-know");
});

test("the library is one list, kept as data apart from the code that reads it", async () => {
  const { LIBRARY_ENTRIES } = await import("../../modules/config/roll-option-library-entries.js");
  assert.equal(LIBRARY_ENTRIES.length, 218);
  assert.deepEqual(ROLL_OPTION_LIBRARY.map((e) => e.id), LIBRARY_ENTRIES.map((e) => e.id));
  assert.deepEqual(LIBRARY_ENTRIES.filter((e) => e.kind !== undefined).map((e) => [e.id, e.kind]), [["auto-fire", "quality"]], "every other entry is a talent");
  const fs = await import("node:fs");
  const code = fs.readFileSync(new URL("../../modules/config/roll-option-library.js", import.meta.url), "utf8");
  assert.doesNotMatch(code, /entry\("/, "no entries written in the code file");
  assert.equal(fs.existsSync(new URL("../../modules/config/roll-option-library-talents.js", import.meta.url)), false);
});

/* The talent review batch (2026-10-22, talent-review-batch.md). */

const DROPPED = ["aggressive-negotiations", "analyze-data", "ask-questions-later", "attack-vector", "breakthrough",
  "exit-strategy", "find-the-story", "hunters-quarry", "researcher-improved", "thorough-assessment", "wretched-hive",
  "field-researcher", "inside-person", "tinkerer-improved", "natural-camouflage", "they-cant-refuse"];
const DEFERRED = ["disruptive-strike", "draw-closer", "far-strike", "hawk-bat-swoop", "makashi-finish", "saber-throw",
  "strategic-form", "terrify", "in-the-know-improved", "made-you-talk", "sense-the-scene", "improvised-concoction",
  "hidden-fangs", "design-flaw-imp", "natural-remedy"];

test("dropped and deferred talents are not in the library", () => {
  for (const id of [...DROPPED, ...DEFERRED]) assert.equal(byId(id), undefined, id);
  assert.ok(byId("sarlacc-sweep"), "Sarlacc Sweep stays for now");
  assert.ok(byId("finish-the-fight") && byId("finish-the-fight-improved"), "Finish the Fight stays");
});

test("Against The Odds waits for a Daunting check", () => {
  assert.deepEqual(byId("against-the-odds").options[0].offer, { minDifficulty: 4 });
});

test("fixed results are real", () => {
  assert.deepEqual(byId("blind-spot").options[0].dice, { advantage: 1 });
  assert.deepEqual(byId("by-the-book").options[0].dice, { advantage: "ranks" });
  assert.deepEqual(byId("reckless-charge").options[0].dice, { success: 2, threat: 2 });
  assert.deepEqual(byId("bedside-manners").options[0].choices.map((c) => c.dice), [{ advantage: 2 }, { success: 1, threat: 2 }]);
  assert.deepEqual(byId("rapid-reaction").options[0].dice, { success: "amount" });
});

test("Boost trades take Boost dice and give results", () => {
  const assassinate = byId("assassinate-improved").options[0];
  assert.deepEqual([assassinate.amount, assassinate.cost, assassinate.dice], [{ label: "Boost traded" }, { strain: "amount" }, { removeBoost: "amount", advantage: "amount" }]);
  const clanker = byId("clanker-killer").options[0];
  assert.deepEqual([clanker.amount.max, clanker.dice, clanker.choices.map((c) => c.id)], ["ranks", { removeBoost: "amount" }, ["success", "advantage"]]);
  assert.deepEqual(byId("trigger-discipline").options[0].cost, { strain: 2 });
});

test("the Destiny pool and Force dice are read live", () => {
  assert.deepEqual(byId("beginners-luck").options[0].dice, { success: "destinyLight" });
  assert.deepEqual(byId("strength-from-passion").options[0].dice, { success: "destinyDark", threat: "destinyDark" });
  assert.deepEqual([byId("vaapad-control").options[0].dice, byId("vaapad-control").options[0].amount], [{ downgradeDifficulty: "destinyLight" }, undefined]);
  for (const id of ["animal-empathy", "enhanced-leader", "essential-kill", "force-connection", "intuitive-improvements", "intuitive-navigation",
    "intuitive-shot", "intuitive-strike", "overwhelm-emotions", "quick-movement", "ravage", "sapith-sundering", "transmogrify"]) {
    assert.equal(byId(id).options[0].dice.force, "forceAvailable", id);
  }
});

test("swaps name the characteristic or skill to roll with", () => {
  assert.equal(byId("blending-in").options[0].characteristic, "Cunning");
  assert.equal(byId("imposing-leader").options[0].characteristic, "Willpower");
  assert.deepEqual(byId("martial-prowess").options.map((o) => [o.offer.skills, o.skill]), [[["Melee"], "Athletics"], [["Ranged: Light", "Ranged: Heavy"], "Coordination"]]);
});

test("lowering difficulty: per rank, per strain, with floors", () => {
  assert.deepEqual(byId("confidence").options[0].dice, { difficulty: "-ranks" });
  assert.deepEqual(byId("disciple-of-lore").options[0].dice, { difficulty: "-ranks" });
  const filp = byId("friends-in-low-places-improved").options[0];
  assert.deepEqual([filp.dice, filp.difficultyFloor, filp.amount.max], [{ difficulty: "-amount" }, 1, undefined]);
  for (const id of ["master-artisan", "master-leader", "master-starhopper"]) assert.equal(byId(id).options[0].difficultyFloor, 1, id);
});

test("only real limits cap an amount", () => {
  const capped = ROLL_OPTION_LIBRARY.flatMap((e) => e.options.filter((o) => typeof o.amount?.max === "number").map(() => e.id));
  assert.deepEqual(capped.sort(), ["gliding-step", "one-shot-one-kill"], "two Move or two aim maneuvers at most");
  assert.equal(byId("enough-to-get-by").options[0].amount.label, "Your Knowledge (Education) ranks");
});

test("Saber Swarm is declared with a Lightsaber attack, and Silent Takedown costs its maneuver", () => {
  assert.deepEqual(byId("saber-swarm").options[0].offer, { skills: ["Lightsaber"], attack: true });
  assert.deepEqual(byId("silent-takedown").options[0].cost, { maneuvers: 1 });
});

test("hints keep the conditions the rules set (implementation review)", () => {
  assert.match(byId("respond-in-kind").options[0].hint, /next/i);
  assert.match(byId("improvised-detonation-supreme").options[0].hint, /three times/i);
});

/* Initiative rolls (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md, "The library"). */

test("the initiative talents are offered on initiative rolls only", () => {
  for (const id of ["rapid-reaction", "get-the-drop", "on-the-lookout"]) {
    assert.equal(byId(id).options.length, 1, id);
    assert.deepEqual(byId(id).options[0].offer, { initiative: true }, id);
  }
  assert.deepEqual(byId("ready-for-anything").options.map((o) => [o.id, o.offer, o.dice, o.hint]), [
    ["ready-for-anything", { initiative: true, skills: ["Cool", "Vigilance"] }, { removeSetback: "ranks" }, undefined],
    ["ready-for-anything-mass-combat", { initiative: false, skills: ["Leadership", "Discipline", "Knowledge: Warfare"] }, { removeSetback: "ranks" }, "Mass Combat checks"],
  ]);
  assert.deepEqual(byId("master-strategist").options[0].offer, { initiative: false, skills: ["Leadership", "Cool", "Discipline", "Knowledge: Warfare"] });
  const rapid = byId("rapid-reaction").options[0];
  assert.deepEqual([rapid.hint, rapid.amount, rapid.cost, rapid.dice], [undefined, { max: "ranks", label: "Strain" }, { strain: "amount" }, { success: "amount" }]);
  assert.equal(byId("get-the-drop").options[0].hint, "Once per session; allies add it too");
  assert.equal(byId("on-the-lookout").options[0].hint, "Spend a Destiny Point; also allies up to your Cunning");
});

test("Ready for Anything removes its Setback once per roll", () => {
  const items = [{ id: "t1", name: "Ready for Anything", type: "talent", system: { rollOptions: ["Macro.rfa"], ranks: { ranked: true, current: 2 } } }];
  const macros = new Map([["Macro.rfa", { ok: true, options: byId("ready-for-anything").options }]]);
  const ids = (over) => collectOfferedOptions({
    items, macros,
    context: { skillKey: null, skillType: null, weaponId: null, isAttack: false, isForcePower: false, isInitiative: false, forceRating: 0, ...over },
  }).map((row) => row.key.split(":")[2]);
  assert.deepEqual(ids({ skillKey: "Leadership", isInitiative: true }), []);
  assert.deepEqual(ids({ skillKey: "Cool", isInitiative: true }), ["ready-for-anything"]);
  assert.deepEqual(ids({ skillKey: "Leadership" }), ["ready-for-anything-mass-combat"]);
  assert.deepEqual(ids({ skillKey: "Cool" }), []);
});

test("changed entries keep the text they had", () => {
  const earlier = {
    "rapid-reaction": [{ skills: ["Cool", "Vigilance"] }, "Initiative"],
    "get-the-drop": [{ skills: ["Cool", "Vigilance"] }, "Once per session, initiative; allies add it too"],
    "on-the-lookout": [{ skills: ["Cool", "Vigilance"] }, "Initiative, spend a Destiny Point; also allies up to your Cunning"],
    "ready-for-anything": [{ skills: ["Cool", "Vigilance", "Leadership", "Discipline", "Knowledge: Warfare"] }, "Initiative (Cool or Vigilance) or Mass Combat checks"],
    "master-strategist": [{ skills: ["Leadership", "Cool", "Discipline", "Knowledge: Warfare"] }, "Mass Combat check; once per phase"],
    "point-blank": [{ skills: ["Ranged: Light", "Ranged: Heavy"] }, "Short range or engaged"],
  };
  for (const [id, [offer, hint]] of Object.entries(earlier)) {
    const { previous } = byId(id);
    assert.equal(previous.length, 1, id);
    assert.equal(validateOptions(previous[0]).ok, true, id);
    assert.deepEqual([previous[0][0].offer, previous[0][0].hint], [offer, hint], id);
  }
  for (const entry of ROLL_OPTION_LIBRARY) {
    if (!(entry.id in earlier)) assert.deepEqual(entry.previous, [], entry.id);
  }
});
