import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { collectOfferedBuffs, withAppliedBuffs } from "../../modules/helpers/optional-buffs-offer.js";

/**
 * Which optional buffs a roll offers, with which of their rows, counted how many times
 * (docs/superpowers/specs/2026-10-20-optional-buffs-design.md, "Which items count" onwards).
 */

const row = (modtype, mod, value = 1) => ({ modtype, mod, value });
const buff = (id, rows, name = `Buff ${id}`) => ({ id, name, rows });
const item = (type, { id = type, name = type, buffs = [], equipped, carried, quantity, attachments, ranks, talents } = {}) => ({
  id,
  name,
  type,
  flags: carried === undefined ? {} : { starwarsffg: { carried } },
  system: {
    optionalBuffs: buffs,
    ...(equipped === undefined ? {} : { equippable: { equipped } }),
    ...(quantity === undefined ? {} : { quantity: { value: quantity } }),
    ...(attachments ? { itemattachment: attachments } : {}),
    ...(ranks ? { ranks } : {}),
    ...(talents ? { talents } : {}),
  },
});
const attachment = (id, buffs) => ({ _id: id, name: id, type: "itemattachment", system: { optionalBuffs: buffs } });
const offer = (items, options = {}) =>
  collectOfferedBuffs({ items, skillKey: null, weaponId: null, isForcePower: false, ...options });

const boost = row("Roll Modifiers", "Add Boost");

test("a skill row is offered only on rolls of its skill", () => {
  const items = [item("gear", { id: "g1", name: "Hutt signet", buffs: [buff("b1", [row("Skill Boost", "Charm")], "Hutt contacts")] })];

  assert.deepEqual(offer(items, { skillKey: "Charm" }), [
    { key: "g1:b1", name: "Hutt contacts", source: "Hutt signet", rows: [row("Skill Boost", "Charm", 1)] },
  ]);
  assert.deepEqual(offer(items, { skillKey: "Stealth" }), []);
});

test("a weapon's attack rows count only on its own attack, once", () => {
  const items = [item("weapon", { id: "w1", quantity: 2, buffs: [buff("b1", [boost])] })];

  assert.deepEqual(offer(items, { skillKey: "Ranged: Light", weaponId: "w1" }).map((b) => b.rows),
    [[row("Roll Modifiers", "Add Boost", 1)]]);
  assert.deepEqual(offer(items, { skillKey: "Ranged: Light", weaponId: "w2" }), []);
});

test("a weapon's skill rows count by quantity, equipped or not", () => {
  const items = [item("weapon", { id: "w1", equipped: false, quantity: 2, buffs: [buff("b1", [row("Skill Boost", "Charm")])] })];

  assert.deepEqual(offer(items, { skillKey: "Charm" })[0].rows, [row("Skill Boost", "Charm", 2)]);
});

test("a weapon or gear marked not carried offers nothing", () => {
  const items = [
    item("weapon", { id: "w1", carried: false, buffs: [buff("b1", [boost])], attachments: [attachment("att1", [buff("b2", [boost])])] }),
    item("gear", { id: "g1", carried: false, buffs: [buff("b3", [row("Skill Boost", "Charm")])] }),
  ];

  assert.deepEqual(offer(items, { skillKey: "Charm", weaponId: "w1" }), []);
});

test("armour offers its buffs only while equipped", () => {
  const unequipped = [item("armour", { id: "a1", equipped: false, buffs: [buff("b1", [boost])] })];
  const equipped = [item("armour", { id: "a1", equipped: true, quantity: 1, buffs: [buff("b1", [boost])] })];

  assert.deepEqual(offer(unequipped, { skillKey: "Charm" }), []);
  assert.deepEqual(offer(equipped, { skillKey: "Stealth" }).map((b) => b.key), ["a1:b1"]);
  assert.deepEqual(offer(equipped, { skillKey: "Stealth" })[0].rows, [row("Roll Modifiers", "Add Boost", 1)]);
});

test("gear rows count by quantity", () => {
  const items = [item("gear", { id: "g1", quantity: 3, buffs: [buff("b1", [row("Skill Boost", "Stealth")])] })];

  assert.deepEqual(offer(items, { skillKey: "Stealth" })[0].rows, [row("Skill Boost", "Stealth", 3)]);
});

test("a weapon attachment's attack rows follow its weapon", () => {
  const items = [item("weapon", { id: "w1", attachments: [attachment("att1", [buff("b1", [boost])])] })];

  const own = offer(items, { skillKey: "Ranged: Light", weaponId: "w1" });
  assert.deepEqual(own.map((b) => [b.key, b.rows]), [["w1:att1:b1", [row("Roll Modifiers", "Add Boost", 1)]]]);
  assert.deepEqual(offer(items, { skillKey: "Ranged: Light", weaponId: "w2" }), []);
});

test("an armour attachment's roll rows count while the armour is equipped", () => {
  const setback = row("Roll Modifiers", "Remove Setback");
  const worn = [item("armour", { id: "a1", equipped: true, attachments: [attachment("att1", [buff("b1", [setback])])] })];
  const off = [item("armour", { id: "a1", equipped: false, attachments: [attachment("att1", [buff("b1", [setback])])] })];

  assert.deepEqual(offer(worn, { skillKey: "Cool" }).map((b) => b.key), ["a1:att1:b1"]);
  assert.deepEqual(offer(off, { skillKey: "Cool" }), []);
});

test("a ranked talent's rows count by its ranks, an unranked talent's once", () => {
  const items = [
    item("talent", { id: "t1", name: "Grit", ranks: { ranked: true, current: 2 }, buffs: [buff("b1", [row("Skill Boost", "Charm")])] }),
    item("talent", { id: "t2", name: "Hunter", ranks: { ranked: false, current: 3 }, buffs: [buff("b2", [row("Skill Boost", "Charm")])] }),
  ];

  assert.deepEqual(offer(items, { skillKey: "Charm" }).map((b) => [b.key, b.source, b.rows[0].value]),
    [["talent:grit:b1", "Grit", 2], ["talent:hunter:b2", "Hunter", 1]]);
});

test("a talent learned twice in trees is one buff counted twice", () => {
  const node = { name: "Grit", islearned: true, isRanked: true, optionalBuffs: [buff("b1", [row("Skill Boost", "Charm")])] };
  const items = [item("specialization", { id: "s1", talents: { talent0: node, talent4: { ...node } } })];

  assert.deepEqual(offer(items, { skillKey: "Charm" }), [
    { key: "talent:grit:b1", name: "Buff b1", source: "Grit", rows: [row("Skill Boost", "Charm", 2)] },
  ]);
});

test("unlearned tree nodes offer nothing", () => {
  const node = { name: "Grit", islearned: false, isRanked: true, optionalBuffs: [buff("b1", [row("Skill Boost", "Charm")])] };

  assert.deepEqual(offer([item("specialization", { id: "s1", talents: { talent0: node } })], { skillKey: "Charm" }), []);
});

test("a Force power roll offers nothing", () => {
  const items = [item("gear", { id: "g1", buffs: [buff("b1", [boost])] })];

  assert.deepEqual(offer(items, { isForcePower: true }), []);
});

test("a buff with no row that applies is not offered", () => {
  const items = [item("gear", { id: "g1", buffs: [buff("b1", [row("Skill Boost", "Stealth")]), buff("b2", [])] })];

  assert.deepEqual(offer(items, { skillKey: "Charm" }), []);
});

test("buffs the GM already ticked are marked applied, and unknown ones still listed", () => {
  const offered = [{ key: "g1:b1", name: "A", source: "Signet", rows: [boost] }];

  assert.deepEqual(withAppliedBuffs(offered, [{ key: "g1:b1", name: "A" }, { key: "x:y", name: "Elsewhere" }]), [
    { key: "g1:b1", name: "A", source: "Signet", rows: [boost], applied: true },
    { key: "x:y", name: "Elsewhere", source: "", rows: [], applied: true },
  ]);
});
