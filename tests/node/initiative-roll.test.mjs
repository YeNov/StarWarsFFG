import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  initiativeBasePool, initiativeDialogModel, initiativeHidden, initiativeMacroUuids, initiativePool, initiativeRoller,
  initiativeSkillLayer, initiativeSpeaker, initiativeValue, planInitiativeBatch, runInitiativeGroup, talentedCombatants,
} from "../../modules/helpers/initiative-roll.js";
import { layerPool } from "../../modules/dice/roll-option-pool.js";

/**
 * Initiative rolls (docs/superpowers/specs/2026-10-23-initiative-roll-options-design.md): the pool,
 * who rolls, the dialog's model, the per-combatant batch with combatants that cannot roll, and the
 * group flow with its prompt.
 */

const data = { characteristics: { Willpower: { value: 3 } }, skills: { Vigilance: { characteristic: "Willpower", rank: 2, boost: 1, advantage: 0, success: 0 } } };
const coolData = {
  characteristics: { Willpower: { value: 3 }, Presence: { value: 2 } },
  skills: { ...data.skills, Cool: { characteristic: "Presence", rank: 1, boost: 0, advantage: 0, success: 0 } },
};
const dice = (pool) => Object.fromEntries(["proficiency", "ability", "boost", "setback", "force", "success", "advantage", "threat", "failure", "upgrades"].map((key) => [key, pool[key]]));

const actor = (id, name, system, extra = {}) => ({ id, name, type: "character", system, items: [], ...extra });
const vehicle = (id, name, crew) => ({ id, name, type: "vehicle", system: {}, items: [], flags: { starwarsffg: { crew } } });
const combatant = (id, name, who, { token = { id: `t-${id}`, name, hidden: false }, isOwner = true, hidden = false, sceneId = "s1" } = {}) =>
  ({ id, name, actor: who, token, isOwner, hidden, sceneId });
const lookupOf = (actors) => (id) => actors.find((a) => a.id === id);
const combatantsOf = (list) => (id) => list.find((c) => c.id === id);

const INIT = "Macro.init";
const macros = new Map([[INIT, { ok: true, options: [{ id: "rr", offer: { initiative: true } }] }]]);
const talent = (links = [INIT]) => ({ id: "t1", name: "Rapid Reaction", type: "talent", system: { rollOptions: links, ranks: { ranked: false } } });

test("the skill's initiative pool, as before", () => {
  assert.deepEqual(dice(initiativePool(data, "Vigilance")), {
    proficiency: 2, ability: 1, boost: 1, setback: 0, force: 0, success: 0, advantage: 0, threat: 0, failure: 0, upgrades: 0,
  });
  assert.equal(initiativePool(data, "Cool"), null);
  assert.equal(initiativePool(null, "Vigilance"), null);
});

test("the add table, as before, with its upgrades recorded", () => {
  const pool = initiativePool(data, "Vigilance", { boost: 1, setback: 2, upgrades: 1, force: 1, success: 1, threat: 1 });
  assert.deepEqual(dice(pool), {
    proficiency: 3, ability: 0, boost: 2, setback: 2, force: 1, success: 1, advantage: 0, threat: 1, failure: 0, upgrades: 1,
  });
});

test("a base pool even without the skill", () => {
  assert.deepEqual(dice(initiativeBasePool(data, "Cool", { boost: 1, upgrades: 1 })), {
    proficiency: 0, ability: 1, boost: 1, setback: 0, force: 0, success: 0, advantage: 0, threat: 0, failure: 0, upgrades: 1,
  });
  assert.deepEqual(dice(initiativeBasePool(null, "Vigilance")), {
    proficiency: 0, ability: 0, boost: 0, setback: 0, force: 0, success: 0, advantage: 0, threat: 0, failure: 0, upgrades: 0,
  });
  assert.deepEqual(dice(initiativeBasePool(data, "Vigilance")), dice(initiativePool(data, "Vigilance")));
});

test("a Skill Rank buff over added upgrades", () => {
  const pool = layerPool(initiativePool(data, "Vigilance", { upgrades: 1 }), {
    buffs: [{ rows: [{ modtype: "Skill Rank", value: 1 }] }],
    skill: initiativeSkillLayer(data, "Vigilance"),
  });
  assert.deepEqual([pool.proficiency, pool.ability], [3, 1]);
});

test("the skill layer", () => {
  assert.deepEqual(initiativeSkillLayer(data, "Vigilance"), { characteristic: 3, rank: 2 });
  assert.deepEqual(initiativeSkillLayer(data, "Cool"), { characteristic: null, rank: null });
  assert.deepEqual(initiativeSkillLayer(null, "Vigilance"), { characteristic: null, rank: null });
});

test("the initiative value", () => {
  assert.equal(initiativeValue({ success: 2, advantage: 3 }), 2.03);
});

test("who rolls", () => {
  const kira = actor("kira", "Kira", data);
  assert.deepEqual(initiativeRoller(kira, lookupOf([])), { actor: kira, data, needsPilot: false });
  const pilot = actor("p1", "Pilot", coolData);
  const ship = vehicle("ship", "Ship", [{ role: "Pilot", actor_id: "p1" }]);
  const piloted = initiativeRoller(ship, lookupOf([pilot]));
  assert.equal(piloted.actor, pilot);
  assert.deepEqual(piloted.data.skills, pilot.system.skills);
  assert.equal(piloted.needsPilot, false);
  const unpiloted = vehicle("v2", "Hulk", [{ role: "Gunner", actor_id: "p1" }]);
  assert.deepEqual(initiativeRoller(unpiloted, lookupOf([pilot])), { actor: unpiloted, data: unpiloted.system, needsPilot: true });
  assert.deepEqual(initiativeRoller(ship, lookupOf([])), { actor: ship, data: ship.system, needsPilot: true }, "the Pilot cannot be found");
  assert.deepEqual(initiativeRoller(null, lookupOf([])), { actor: null, data: null, needsPilot: false });
});

test("speaker and hidden without a token", () => {
  assert.deepEqual(initiativeSpeaker({ name: "Kira", actor: { id: "a1" }, sceneId: null, token: null }, "s1"), { scene: "s1", actor: "a1", token: null, alias: "Kira" });
  assert.deepEqual(
    initiativeSpeaker({ name: "Kira", actor: { id: "a1" }, sceneId: "s2", token: { id: "t1", name: "Kira T" } }, "s1"),
    { scene: "s2", actor: "a1", token: "t1", alias: "Kira T" },
  );
  assert.equal(initiativeHidden({ hidden: true, token: null }), true);
  assert.equal(initiativeHidden({ hidden: false, token: { hidden: false } }), false);
  assert.equal(initiativeHidden({ hidden: false, token: { hidden: true } }), true);
});

const pc = combatant("pc", "Kira", actor("a-pc", "Kira", coolData));
const tokenless = combatant("tokenless", "Vex", actor("a-vex", "Vex", coolData), { token: null, sceneId: null });
const ghost = combatant("ghost", "Ghost", null);
const ship = combatant("ship", "Ship", vehicle("a-ship", "Ship", []));
const droid = combatant("droid", "Droid", actor("a-droid", "Droid", data));
const stranger = combatant("stranger", "Stranger", actor("a-str", "Stranger", coolData), { isOwner: false });
const all = [pc, tokenless, ghost, ship, droid, stranger];

test("a batch rolls who it can and says why the others cannot", () => {
  const batch = planInitiativeBatch(["pc", "tokenless", "ghost", "ship", "droid", "stranger", "missing"], {
    combatantOf: combatantsOf(all), lookupActor: lookupOf([]), skill: "Cool", added: { boost: 1 },
  });
  assert.deepEqual(batch.rolls.map((r) => r.id), ["pc", "tokenless"]);
  for (const roll of batch.rolls) assert.equal(roll.pool.boost, 1, `${roll.id} rolls the added dice`);
  assert.equal(batch.rolls[1].combatant, tokenless);
  assert.deepEqual(batch.skipped, [
    { id: "ghost", name: "Ghost", reason: "noActor" },
    { id: "ship", name: "Ship", reason: "needsPilot" },
    { id: "droid", name: "Droid", reason: "noSkill" },
  ]);
});

test("the dialog opens for whoever is listed", () => {
  const perception = { ...coolData.skills.Vigilance, useForInitiative: true, label: "Perception" };
  const kira = actor("kira", "Kira", { characteristics: data.characteristics, skills: { Vigilance: data.skills.Vigilance, Perception: perception } });
  const list = [ghost, combatant("kira", "Kira (token)", kira), ship];
  const opts = { combatantOf: combatantsOf(list), lookupActor: lookupOf([]) };
  const standard = [{ name: "Vigilance", label: "SWFFG.SkillsNameVigilance" }, { name: "Cool", label: "SWFFG.SkillsNameCool" }];
  assert.deepEqual(initiativeDialogModel(["ghost"], opts), { name: "Ghost", skills: standard, cardRoller: null });
  const one = initiativeDialogModel(["kira"], opts);
  assert.equal(one.name, "Kira", "the actor's name, as today");
  assert.deepEqual(one.skills.map((s) => s.name), ["Perception", "Vigilance", "Cool"]);
  assert.equal(one.skills[0].label, "Perception");
  assert.equal(one.cardRoller.actor, kira);
  assert.equal(initiativeDialogModel(["ship"], opts).cardRoller, null, "no Pilot, no card");
  assert.deepEqual(initiativeDialogModel(["kira", "ghost"], opts), { name: null, skills: standard, cardRoller: null });
  assert.equal(initiativeDialogModel(["missing"], opts).name, null);
});

test("who is talented", () => {
  const pilot = actor("p1", "Pilot", coolData, { items: [talent()] });
  const list = [
    combatant("pc", "Kira", actor("a-pc", "Kira", coolData, { items: [talent()] })),
    ghost,
    combatant("plain", "Plain", actor("a-plain", "Plain", coolData, { items: [talent([])] })),
    combatant("ship", "Ship", vehicle("a-ship", "Ship", [{ role: "Pilot", actor_id: "p1" }])),
  ];
  const opts = { combatantOf: combatantsOf(list), lookupActor: lookupOf([pilot]) };
  const ids = ["pc", "ghost", "plain", "ship"];
  assert.deepEqual([...talentedCombatants(ids, { ...opts, macros })], ["pc", "ship"]);
  assert.deepEqual(initiativeMacroUuids(ids, opts), [INIT]);
});

/** A fake dialog opener that records its calls and finishes on a later tick, and a fake prompt. */
function recorder(answer) {
  const calls = [];
  const asked = [];
  let active = 0;
  let overlapped = false;
  return {
    calls,
    asked,
    overlapped: () => overlapped,
    open: async (ids, { withCard }) => {
      if (active > 0) overlapped = true;
      active += 1;
      calls.push([ids, withCard]);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    },
    ask: async (names) => {
      asked.push(names);
      return answer;
    },
  };
}
const nameOf = (id) => id.charAt(0).toUpperCase() + id.slice(1);
const group = async (ids, talented, answer) => {
  const r = recorder(answer);
  await runInitiativeGroup(ids, { talented: new Set(talented), nameOf, ask: r.ask, open: r.open });
  assert.equal(r.overlapped(), false, "each dialog waits for the one before");
  return r;
};

test("the group flow", async () => {
  assert.deepEqual((await group([], [], "talents")).calls, []);
  assert.deepEqual((await group(["a"], [], "talents")).calls, [[["a"], true]]);
  const plain = await group(["a", "b"], [], "talents");
  assert.deepEqual([plain.calls, plain.asked], [[[["a", "b"], false]], []]);

  const talents = await group(["a", "ghost", "b"], ["a"], "talents");
  assert.deepEqual(talents.asked, [["A"]]);
  assert.deepEqual(talents.calls, [[["ghost", "b"], false], [["a"], true]]);
  assert.deepEqual((await group(["a", "ghost", "b"], ["a"], "together")).calls, [[["a", "ghost", "b"], false]]);
  assert.deepEqual((await group(["a", "ghost", "b"], ["a"], null)).calls, []);
  assert.deepEqual((await group(["a", "c"], ["a", "c"], "talents")).calls, [[["a"], true], [["c"], true]]);
});

test("a shared dialog holding only an actorless combatant", async () => {
  const r = await group(["a", "ghost"], ["a"], "talents");
  assert.deepEqual(r.calls, [[["ghost"], false], [["a"], true]]);
  const opts = { combatantOf: combatantsOf([ghost]), lookupActor: lookupOf([]) };
  assert.equal(initiativeDialogModel(["ghost"], opts).name, "Ghost");
  assert.deepEqual(planInitiativeBatch(["ghost"], { ...opts, skill: "Vigilance", added: {} }), {
    rolls: [],
    skipped: [{ id: "ghost", name: "Ghost", reason: "noActor" }],
  });
});

test("a dialog closed mid-roll still waits for the roll it started (Codex review)", async () => {
  const { rollTracker } = await import("../../modules/helpers/initiative-roll.js");
  const events = [];
  const tracker = rollTracker();
  const started = tracker.start(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push("charged");
  });
  // The dialog closes (Escape) while the roll is still running; the flow waits for it.
  await tracker.settled();
  events.push("next dialog");
  assert.deepEqual(events, ["charged", "next dialog"]);
  await started;

  const idle = rollTracker();
  await idle.settled();
  assert.ok(true, "nothing started: settles at once");

  const failing = rollTracker();
  failing.start(async () => { throw new Error("post failed"); }).catch(() => {});
  await assert.rejects(failing.settled(), /post failed/);
});
