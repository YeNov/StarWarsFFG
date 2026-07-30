import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { assembleCharacterSource } from "../../modules/char-creator/assemble-character-source.js";

function deps() {
  return {
    creationDefaults: {
      img: "default.png",
      prototypeToken: { actorLink: true, sight: { enabled: true } },
      system: {
        characteristics: { Brawn: { value: 0 }, Willpower: { value: 0 } },
        skills: { Brawl: { rank: 0, label: "Brawl", careerskill: false } },
        stats: {
          wounds: { max: 0 },
          strain: { max: 0 },
          soak: { value: 0 },
          encumbrance: { max: 0 },
          credits: { value: 0 },
        },
        experience: {},
      },
    },
    applyCharacteristicDeltas: (system, deltas) => {
      const out = structuredClone(system);
      out.characteristics.Brawn.value += Number(deltas.Brawn ?? 0);
      out.stats.wounds.max += Number(deltas.Brawn ?? 0);
      return out;
    },
  };
}

test("assembles identity, base advances, accounting, track, and best armour", () => {
  const { actorData } = assembleCharacterSource(deps(), {
    name: "",
    tokenImg: "https://example.test/token.webp",
    characteristicDeltas: { Brawn: 1 },
    skillDeltas: { Brawl: 2 },
    experience: { total: 140, available: -5 },
    credits: 321,
    track: { key: "obligation", value: 20 },
    equipmentItems: [
      {
        name: "Light",
        type: "armour",
        system: { soak: { value: 1 }, equippable: {} },
        effects: [{ name: "Light Defence", disabled: false }],
      },
      {
        name: "Heavy",
        type: "armour",
        system: { soak: { value: 2 }, equippable: {} },
        effects: [{ name: "Heavy Soak", disabled: false }],
      },
      {
        name: "Ryyk Blade",
        type: "weapon",
        system: {},
        effects: [{ name: "Defensive Quality", disabled: false }],
      },
    ],
  });
  assert.equal(actorData.name, "New Character");
  assert.deepEqual(actorData.prototypeToken, {
    actorLink: true,
    name: "New Character",
    sight: { enabled: true },
    texture: { src: "https://example.test/token.webp" },
  });
  assert.equal(actorData.system.characteristics.Brawn.value, 1);
  assert.equal(actorData.system.stats.wounds.max, 1);
  assert.equal(actorData.system.skills.Brawl.rank, 2);
  assert.deepEqual(actorData.system.experience, { total: 140, available: -5 });
  assert.equal(actorData.system.stats.credits.value, 321);
  assert.equal(actorData.system.obligation.value, 20);
  assert.equal(actorData.items.find((item) => item.name === "Heavy").system.equippable.equipped, true);
  assert.equal(actorData.items.find((item) => item.name === "Light").system.equippable.equipped, false);
  assert.equal(actorData.items.find((item) => item.name === "Heavy").effects[0].disabled, false);
  assert.equal(actorData.items.find((item) => item.name === "Light").effects[0].disabled, true);
  const blade = actorData.items.find((item) => item.name === "Ryyk Blade");
  assert.equal(blade.system.equippable.equipped, false);
  assert.equal(blade.effects[0].disabled, true);
});
