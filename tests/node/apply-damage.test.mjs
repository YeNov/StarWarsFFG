import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const translations = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

let dialogOptions;
globalThis.foundry = {
  applications: { api: { DialogV2: { wait: (options) => { dialogOptions = options; } } } },
  utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) },
};
const { ApplyDamage } = await import("../../modules/helpers/apply-damage.js");

const quality = (name, system = {}, flags = {}) => ({ name, system, flags });
const armor = (mods = [], { equipped = true, attachments = [], type = "armour" } = {}) => ({
  type,
  system: { equippable: { equipped }, itemmodifier: mods, itemattachment: attachments },
});

async function applyHit({ items = [], type = "character", pierce = 0, breach = 0, pool = "wounds", damage = 12 } = {}) {
  const updates = [];
  const chats = [];
  const formatted = [];
  const actor = {
    uuid: "Actor.target", name: "Target", type, items,
    system: { stats: { soak: { value: 6 }, armour: { value: 6 }, wounds: { value: 0 }, strain: { value: 0 }, hullTrauma: { value: 0 } } },
    update: async (update) => { updates.push(update); },
  };
  const gm = { id: "gm", isGM: true, active: true };
  const users = [gm];
  users.activeGM = gm;
  globalThis.game = {
    user: { ...gm, targets: new Set([{ actor, document: {} }]) }, users,
    i18n: {
      localize: (key) => translations[key] ?? key,
      format: (key, data) => {
        formatted.push({ key, ...data });
        return (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, field) => data[field]);
      },
    },
  };
  globalThis.fromUuid = async () => actor;
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (chat) => { chats.push(chat); } };
  globalThis.ui = { notifications: { warn: (message) => assert.fail(message) } };
  globalThis.CONFIG = {};
  await ApplyDamage.show({ rolls: [{
    data: { name: "Weapon", system: { damage: { value: damage - 2 }, doNotSubmit: { qualities: [
      { name: "Pierce Quality", totalRanks: pierce }, { name: "Breach Quality", totalRanks: breach },
    ] } } }, ffg: { success: 2 },
  }] });
  const input = (name) => dialogOptions.content.match(new RegExp(`name="${name}" value="(\\d+)"`))[1];
  assert.equal(Number(input("pierce")), pierce + 10 * breach);
  await dialogOptions.buttons[0].callback(null, null, { element: {
    querySelector: (selector) => ({ value: selector.includes("pool") ? pool : input(selector.includes("damage") ? "damage" : "pierce") }),
  } });
  assert.equal(updates.length, 1);
  return { update: updates[0], details: formatted.find((call) => call.key === "SWFFG.ApplyDamage.GMDetails"), chats };
}

for (const name of ["Beskar", "Cortosis Quality"]) {
  for (const attack of [{ pierce: 3 }, { breach: 1 }, { pierce: 2, breach: 1 }]) {
    test(`${name} on worn armor protects full soak against ${JSON.stringify(attack)}`, async () => {
      const result = await applyHit({ items: [armor([quality(name)])], ...attack });
      assert.deepEqual(result.update, { "system.stats.wounds.value": 6 });
      assert.equal(result.details.effectiveSoak, 6);
      assert.equal(result.details.pierce, 0);
      const whisper = result.chats.find((chat) => chat.whisper);
      assert.deepEqual(whisper.whisper, ["gm"]);
      assert.ok(whisper.content.includes(`<strong>${name.split(" ")[0]}</strong>`));
      assert.ok(whisper.content.includes("Pierce and Breach cannot bypass this target's soak."));
      assert.doesNotMatch(result.chats.find((chat) => !chat.whisper).content, /Beskar|Cortosis/);
    });
  }
}

test("import ids identify renamed qualities and unranked qualities still protect soak", async () => {
  for (const id of ["BESKAR", "CORTOSIS"]) {
    const result = await applyHit({ items: [armor([quality("Localized name", { rank: null }, { starwarsffg: { ffgimportid: id } })])], breach: 1 });
    assert.deepEqual(result.update, { "system.stats.wounds.value": 6 });
  }
});

test("only active, unbroken attachment mods grant protection", async () => {
  for (const [system, expected] of [[{ active: true }, 6], [{ active: false }, 12], [{ active: true, broken: true }, 12], [{}, 12]]) {
    const items = [armor([], { attachments: [{ system: { itemmodifier: [quality("Cortosis", system)] } }] })];
    assert.deepEqual((await applyHit({ items, breach: 1 })).update, { "system.stats.wounds.value": expected });
  }
});

test("unworn armor, weapons, and unrelated names do not protect soak", async () => {
  for (const items of [[], [armor([quality("Beskar")], { equipped: false })], [armor([quality("Cortosis")], { type: "weapon" })], [armor([quality("Not Cortosis")])]]) {
    assert.deepEqual((await applyHit({ items, pierce: 3 })).update, { "system.stats.wounds.value": 9 });
    assert.deepEqual((await applyHit({ items, breach: 1 })).update, { "system.stats.wounds.value": 12 });
  }
});

test("protection applies to strain and to all personal actor types, with damage floored at zero", async () => {
  const items = [armor([quality("Beskar")])];
  for (const type of ["character", "nemesis", "rival", "minion"]) {
    assert.deepEqual((await applyHit({ items, type, breach: 1, damage: 4 })).update, { "system.stats.wounds.value": 0 });
  }
  assert.deepEqual((await applyHit({ items, pool: "strain", breach: 1 })).update, { "system.stats.strain.value": 6 });
});

test("personal armor does not grant vehicle armor protection", async () => {
  assert.deepEqual((await applyHit({ items: [armor([quality("Beskar")])], type: "vehicle", breach: 1 })).update, { "system.stats.hullTrauma.value": 12 });
});

test("the GM whisper lists both protective qualities once, including attachment and renamed qualities", async () => {
  const items = [armor([quality("Cortosis"), quality("Beskar Quality")], {
    attachments: [{ system: { itemmodifier: [quality("Renamed", { active: true }, { starwarsffg: { ffgimportid: "BESKAR" } })] } }],
  })];
  // Protection is reported even when the attack has no Pierce or Breach.
  const { chats } = await applyHit({ items });
  const whisper = chats.find((chat) => chat.whisper).content;
  assert.ok(whisper.includes("Worn armor: <strong>Beskar, Cortosis</strong>"));
  assert.equal(whisper.match(/Beskar/g).length, 1);
  assert.equal(whisper.match(/Cortosis/g).length, 1);
});

test("the whisper omits protection for absent, unworn, inactive, or broken qualities", async () => {
  for (const items of [
    [],
    [armor([quality("Beskar")], { equipped: false })],
    [armor([], { attachments: [{ system: { itemmodifier: [quality("Cortosis", { active: false })] } }] })],
    [armor([], { attachments: [{ system: { itemmodifier: [quality("Cortosis", { active: true, broken: true })] } }] })],
  ]) {
    const { chats } = await applyHit({ items, breach: 1 });
    assert.doesNotMatch(chats.find((chat) => chat.whisper).content, /Worn armor|Beskar|Cortosis|cannot bypass/);
  }
});
