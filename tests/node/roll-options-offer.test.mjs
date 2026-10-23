import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { collectOfferedOptions, hasInitiativeOption, linkedMacroUuids, skillTypeOf } from "../../modules/helpers/roll-options-offer.js";

/**
 * Which roll options a roll offers, from which items, with ranks and Force rating resolved
 * (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md, "Which items offer their options").
 */

const M = "Macro.m1";
const macroMap = (entries) => new Map(Object.entries(entries).map(([uuid, options]) => [uuid, { ok: true, options }]));
const one = (options, uuid = M) => macroMap({ [uuid]: options });
const context = (over = {}) => ({
  skillKey: null, skillType: null, weaponId: null, isAttack: false, isForcePower: false, isInitiative: false, forceRating: 0, ...over,
});
const offer = (items, macros, over) => collectOfferedOptions({ items, macros, context: context(over) });
const labels = (rows) => rows.map((row) => row.label);

const flagsFor = (carried) => (carried === undefined ? {} : { starwarsffg: { carried } });
const talent = ({ id = "t1", name = "Talent", links = [M], ranked = false, current } = {}) =>
  ({ id, name, type: "talent", system: { rollOptions: links, ranks: { ranked, current } } });
const gear = ({ id = "g1", name = "Gear", links = [M], carried } = {}) =>
  ({ id, name, type: "gear", flags: flagsFor(carried), system: { rollOptions: links } });
const quality = ({ id = "q1", name = "Quality", links = [M], rank, active, broken } = {}) => ({
  _id: id, name, type: "itemmodifier",
  system: { rollOptions: links, ...(rank === undefined ? {} : { rank }), ...(active === undefined ? {} : { active }), ...(broken === undefined ? {} : { broken }) },
});
const attachment = ({ id = "a1", name = "Attachment", links = [M], qualities = [] } = {}) =>
  ({ _id: id, name, type: "itemattachment", system: { rollOptions: links, itemmodifier: qualities } });
const weapon = ({ id = "w1", name = "Weapon", links = [M], qualities = [], attachments = [], carried } = {}) =>
  ({ id, name, type: "weapon", flags: flagsFor(carried), system: { rollOptions: links, itemmodifier: qualities, itemattachment: attachments } });
const armour = ({ id = "r1", name = "Armour", links = [M], qualities = [], attachments = [], equipped = true } = {}) =>
  ({ id, name, type: "armour", system: { rollOptions: links, itemmodifier: qualities, itemattachment: attachments, equippable: { equipped } } });
const specialization = (nodes) => ({ id: "s1", name: "Spec", type: "specialization", system: { talents: nodes } });

test("skill and skill type conditions", () => {
  const melee = one([{ label: "Melee only", offer: { skills: ["Melee"] } }]);
  assert.deepEqual(labels(offer([gear()], melee, { skillKey: "Melee" })), ["Melee only"]);
  assert.deepEqual(offer([gear()], melee, { skillKey: "Charm" }), []);

  const combat = one([{ label: "Combat only", offer: { skillTypes: ["Combat"] } }]);
  assert.deepEqual(labels(offer([gear()], combat, { skillType: "Combat" })), ["Combat only"]);
  assert.deepEqual(offer([gear()], combat, { skillType: "Social" }), []);
});

test("a roll with no skill key offers only unconditioned options", () => {
  const macros = one([
    { label: "Free" },
    { label: "Melee only", offer: { skills: ["Melee"] } },
    { label: "Combat only", offer: { skillTypes: ["Combat"] } },
  ]);
  assert.deepEqual(labels(offer([gear()], macros, { skillKey: null, skillType: null })), ["Free"]);
});

test("attack-only options need a weapon roll", () => {
  const macros = one([{ label: "Attack", offer: { attack: true } }]);
  assert.deepEqual(labels(offer([gear()], macros, { isAttack: true })), ["Attack"]);
  assert.deepEqual(offer([gear()], macros, { isAttack: false }), []);
});

test("weapon-borne options only on that weapon's attack", () => {
  const macros = macroMap({
    "Macro.w": [{ label: "Weapon" }],
    "Macro.q": [{ label: "Quality" }],
    "Macro.a": [{ label: "Attachment" }],
    "Macro.aq": [{ label: "Attachment quality" }],
  });
  const build = (carried) => weapon({
    links: ["Macro.w"],
    qualities: [quality({ links: ["Macro.q"] })],
    attachments: [attachment({ links: ["Macro.a"], qualities: [quality({ id: "aq", links: ["Macro.aq"] })] })],
    carried,
  });
  assert.equal(offer([build()], macros, { weaponId: "w1", isAttack: true }).length, 4);
  assert.deepEqual(offer([build()], macros, { weaponId: "w2", isAttack: true }), []);
  assert.deepEqual(offer([build(false)], macros, { weaponId: "w1", isAttack: true }), []);
});

test("switched-off or broken qualities and modifications offer nothing", () => {
  const macros = one([{ label: "Q" }]);
  for (const state of [{ active: false }, { broken: true }]) {
    const onWeapon = weapon({ links: [], qualities: [quality(state)] });
    assert.deepEqual(offer([onWeapon], macros, { weaponId: "w1" }), [], `weapon quality ${JSON.stringify(state)}`);

    const inAttachment = weapon({ links: [], attachments: [attachment({ links: [], qualities: [quality(state)] })] });
    assert.deepEqual(offer([inAttachment], macros, { weaponId: "w1" }), [], `attachment modification ${JSON.stringify(state)}`);

    const onArmour = armour({ links: [], qualities: [quality(state)] });
    assert.deepEqual(offer([onArmour], macros), [], `armour quality ${JSON.stringify(state)}`);
  }
  // Still offered when installed and whole.
  assert.equal(offer([weapon({ links: [], qualities: [quality({ active: true })] })], macros, { weaponId: "w1" }).length, 1);
});

test("armour only while equipped, gear while carried", () => {
  const macros = one([{ label: "X" }]);
  assert.deepEqual(offer([armour({ equipped: false })], macros), []);
  assert.equal(offer([armour({ equipped: true })], macros).length, 1);
  assert.deepEqual(offer([gear({ carried: false })], macros), []);
  assert.equal(offer([gear()], macros).length, 1);
});

test("talent ranks combine across items and tree nodes", () => {
  const macros = one([{ label: "Ranked" }]);
  const items = [
    talent({ ranked: true, current: 2 }),
    specialization({
      talent0: { name: "Talent", islearned: true, isRanked: true, rollOptions: [M] },
      talent1: { name: "Talent", islearned: false, isRanked: true, rollOptions: [M] },
    }),
  ];
  const rows = offer(items, macros);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rank, 3);
  assert.equal(rows[0].ranked, true);

  assert.equal(offer([talent({ ranked: true, current: null })], macros)[0].rank, 1);
});

test("ranks and forceRating resolve to numbers", () => {
  const ranked = offer([talent({ ranked: true, current: 2 })], one([{ dice: { upgradeAbility: "ranks" } }]));
  assert.equal(ranked[0].dice.upgradeAbility, 2);

  const force = offer([talent()], one([{ amount: { max: "forceRating" }, dice: { upgradeAbility: "amount" } }]), { forceRating: 3 });
  assert.equal(force[0].amount.max, 3);
  assert.equal(force[0].dice.upgradeAbility, "amount");
});

test("signed static words resolve with their sign", () => {
  const rows = offer([talent({ ranked: true, current: 2 })], one([{ dice: { difficulty: "-ranks", setback: "-forceRating" } }]), { forceRating: 3 });
  assert.deepEqual(rows[0].dice, { difficulty: -2, setback: -3 });
});

test("live words and amounts wait for the planner", () => {
  const rows = offer([talent()], one([{ amount: { max: "destinyLight" }, dice: { force: "forceAvailable", success: "destinyLight", difficulty: "-amount" } }]));
  assert.deepEqual(rows[0].dice, { force: "forceAvailable", success: "destinyLight", difficulty: "-amount" });
  assert.equal(rows[0].amount.max, "destinyLight");
});

test("an amount without a max is offered without one", () => {
  const [row] = offer([talent()], one([{ amount: { label: "Stealth ranks" }, dice: { success: "amount" } }]));
  assert.deepEqual(row.amount, { max: null, label: "Stealth ranks" });
});

test("the batch's keys travel with the row, choices resolved like the option's dice", () => {
  const option = {
    offer: { minDifficulty: 4 },
    difficultyFloor: 1,
    characteristic: "Cunning",
    skill: "Survival",
    dice: { removeBoost: "amount" },
    amount: { max: "ranks" },
    choices: [{ id: "su", label: "Success", dice: { success: "amount" } }, { id: "ad", label: "Advantage", dice: { advantage: "ranks" } }],
  };
  const [row] = offer([talent({ ranked: true, current: 3 })], one([option]));
  assert.equal(row.minDifficulty, 4);
  assert.equal(row.difficultyFloor, 1);
  assert.equal(row.characteristic, "Cunning");
  assert.equal(row.skill, "Survival");
  assert.deepEqual(row.choices, [{ id: "su", label: "Success", dice: { success: "amount" } }, { id: "ad", label: "Advantage", dice: { advantage: 3 } }]);
  const [plain] = offer([talent()], one([{}]));
  assert.deepEqual([plain.minDifficulty, plain.difficultyFloor, plain.characteristic, plain.skill, plain.choices], [null, null, null, null, null]);
});

test("each row carries the description of the talent or item it comes from, for the card's tooltip", () => {
  const withDescription = (item, description) => ({ ...item, system: { ...item.system, description } });
  const [fromTalent] = offer([withDescription(talent(), "<p>Talent text</p>")], one([{}]));
  assert.equal(fromTalent.description, "<p>Talent text</p>");
  const node = { name: "Point Blank", islearned: true, rollOptions: [M], description: "<p>Node text</p>" };
  assert.equal(offer([specialization({ talent0: node })], one([{}]))[0].description, "<p>Node text</p>");
  const q = quality({ links: [M] });
  q.system.description = "<p>Quality text</p>";
  assert.equal(offer([weapon({ links: [], qualities: [q] })], one([{}]), { weaponId: "w1" })[0].description, "<p>Quality text</p>");
  const empty = withDescription(talent({ id: "t1", name: "Shared" }), "");
  const full = { ...withDescription(talent({ id: "t2", name: "Shared" }), "<p>From the second</p>") };
  assert.equal(offer([empty, full], one([{}]))[0].description, "<p>From the second</p>", "a talent on two items takes the first text there is");
  assert.equal(offer([gear()], one([{}]))[0].description, null);
});

test("a quality's string rank counts as a number", () => {
  const rows = offer([weapon({ links: [], qualities: [quality({ rank: "2" })] })], one([{ dice: { difficulty: "ranks" } }]), { weaponId: "w1" });
  assert.equal(rows[0].dice.difficulty, 2);
});

test("the same macro on two talents shows once per talent name; on two gear items once", () => {
  const macros = one([{ label: "Shared" }]);
  assert.equal(offer([gear({ id: "g1" }), gear({ id: "g2", name: "Other gear" })], macros).length, 1);
  assert.equal(offer([talent({ id: "t1", name: "Alpha" }), talent({ id: "t2", name: "Beta" })], macros).length, 2);
});

test("explicit ids and positions never share a key", () => {
  const rows = offer([gear()], one([{ id: "1", label: "A" }, { label: "B" }]));
  assert.deepEqual(rows.map((row) => row.key), ["Macro.m1:id:1", "Macro.m1:#1"]);
});

test("unresolved or invalid macros contribute nothing", () => {
  assert.deepEqual(offer([gear({ links: ["Macro.gone"] })], one([{ label: "X" }])), []);
  assert.deepEqual(offer([gear()], new Map([[M, { ok: false }]])), []);
});

test("Force power rolls offer nothing", () => {
  assert.deepEqual(offer([gear(), talent()], one([{ label: "X" }]), { isForcePower: true }), []);
});

test("label defaults to the linking item's name and twoWeapons is carried through", () => {
  const [row] = offer([talent({ name: "Guns Blazing" })], one([{ offer: { twoWeapons: "same" }, cost: { strain: 2 } }]));
  assert.equal(row.label, "Guns Blazing");
  assert.equal(row.source, "Guns Blazing");
  assert.equal(row.twoWeapons, "same");
  assert.deepEqual(row.cost, { strain: 2, maneuvers: 0 });
  assert.equal(row.amount, null);
  assert.equal(row.hint, null);
});

test("skillTypeOf reads the actor's skill, then the configured list", () => {
  assert.equal(skillTypeOf({ system: { skills: { Melee: { type: "Combat" } } } }, "Melee", null), "Combat");
  assert.equal(skillTypeOf({ system: { skills: {} } }, "Melee", { Melee: { type: "Combat" } }), "Combat");
  assert.equal(skillTypeOf(null, "Melee", null), null);
  assert.equal(skillTypeOf(null, null, { Melee: { type: "Combat" } }), null);
});

test("linkedMacroUuids walks items and every copy", () => {
  const items = [
    talent({ links: ["Macro.t"] }),
    weapon({
      links: [],
      qualities: [quality({ links: ["Macro.q"] })],
      attachments: [attachment({ links: ["Macro.a"], qualities: [quality({ id: "aq", links: ["Macro.aq", "Macro.t"] })] })],
    }),
    specialization({ talent0: { name: "Node", islearned: false, rollOptions: ["Macro.n"] } }),
  ];
  assert.deepEqual(linkedMacroUuids(items), ["Macro.t", "Macro.q", "Macro.a", "Macro.aq", "Macro.n"]);
});

/* Initiative rolls (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md, "The option format"). */

test("initiative: true only on initiative rolls, false never on them", () => {
  const macros = one([{ label: "Init", offer: { initiative: true } }, { label: "Never", offer: { initiative: false } }, { label: "Any" }]);
  assert.deepEqual(labels(offer([gear()], macros, { skillKey: "Cool", isInitiative: true })), ["Init", "Any"]);
  assert.deepEqual(labels(offer([gear()], macros, { skillKey: "Cool" })), ["Never", "Any"]);
});

test("initiative and skills must both match", () => {
  const macros = one([{ label: "Cool init", offer: { initiative: true, skills: ["Cool"] } }]);
  assert.deepEqual(labels(offer([gear()], macros, { skillKey: "Vigilance", isInitiative: true })), []);
  assert.deepEqual(labels(offer([gear()], macros, { skillKey: "Cool", isInitiative: true })), ["Cool init"]);
});

test("hasInitiativeOption looks at initiative: true only", () => {
  const init = one([{ offer: { initiative: true, skills: ["Cool"] } }]);
  const never = one([{ offer: { initiative: false } }]);
  const plain = one([{ offer: { skills: ["Cool"] } }]);
  assert.equal(hasInitiativeOption({ items: [talent()], macros: init }), true);
  assert.equal(hasInitiativeOption({ items: [talent()], macros: never }), false);
  assert.equal(hasInitiativeOption({ items: [talent()], macros: plain }), false);
  assert.equal(hasInitiativeOption({ items: [gear({ carried: false })], macros: init }), false, "gear not carried");
  assert.equal(hasInitiativeOption({ items: [armour({ equipped: false })], macros: init }), false, "armour not equipped");
  assert.equal(hasInitiativeOption({ items: [armour({ links: [], qualities: [quality({ active: false })] })], macros: init }), false, "quality switched off");
  assert.equal(hasInitiativeOption({ items: [weapon()], macros: init }), false, "no weapon is rolled");
  assert.equal(hasInitiativeOption({ items: [], macros: init }), false);
  assert.equal(hasInitiativeOption({ items: [talent()], macros: new Map() }), false, "macro not loaded");
});
