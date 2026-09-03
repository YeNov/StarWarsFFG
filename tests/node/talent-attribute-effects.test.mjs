import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import ModifierHelpers from "../../modules/helpers/modifiers.js";
import ItemHelpers from "../../modules/helpers/item-helpers.js";

/**
 * A talent carries its modifiers in `system.attributes`, but only an Active Effect ever
 * reaches the actor: the roll paths read `system.skills.<skill>.*` and nothing consults a
 * talent's attributes directly. Two mechanisms used to mint those effects and neither
 * covered a standalone talent item:
 *
 *   - `applyActiveEffectOnUpdate` (item sheet save) creates an effect only for attribute
 *     keys named `attr<timestamp>`, which the item sheet mints. A talent imported from
 *     OggDude names its attributes after the modifier instead ("Piloting:_Space"), so no
 *     effect was ever created and re-saving the sheet did not help either.
 *   - `applyTalentActiveEffects` covers talents embedded in a SPECIALIZATION, which is why
 *     the same talent worked on a PC who bought it from a tree and did nothing on an
 *     adversary, where a standalone talent item is the only way to grant one.
 *
 * `planAttributeEffects` is the shared, pure answer to "which effects should this item's
 * attributes produce", used at item-create time, on sheet save, and by the repair sweep.
 */

const talent = (attributes, ranks = undefined) => ({ type: "talent", system: { attributes, ranks } });

test("plans one effect per attribute, named after the attribute key", () => {
  // The real Skilled Jockey payload, as stored in the yn-talents pack.
  const effects = ModifierHelpers.planAttributeEffects(talent({
    "Piloting:_Planetary": { mod: "Piloting: Planetary", modtype: "Skill Remove Setback", value: 1 },
    "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 },
  }));

  assert.equal(effects.length, 2);
  assert.deepEqual(effects.map((e) => e.name).sort(), ["Piloting:_Planetary", "Piloting:_Space"]);
  assert.deepEqual(effects.find((e) => e.name === "Piloting:_Space").changes, [
    { key: "system.skills.Piloting: Space.remsetback", mode: AE_MODES.ADD, value: 1 },
  ]);
});

test("keeps the sheet's own attr-keyed modifiers, so both naming styles work", () => {
  const effects = ModifierHelpers.planAttributeEffects(talent({
    attr1788201846321: { mod: "Cool", modtype: "Skill Boost", value: 2 },
  }));

  assert.deepEqual(effects, [{
    name: "attr1788201846321",
    changes: [{ key: "system.skills.Cool.boost", mode: AE_MODES.ADD, value: 2 }],
  }]);
});

test("stores a ranked talent's PER-RANK grant, not the multiplied total", () => {
  // The rank multiplier is applied at effect-application time (ActorFFG#applyActiveEffects),
  // so the persisted value stays the per-rank grant and never goes stale when the rank changes.
  const effects = ModifierHelpers.planAttributeEffects(talent({
    "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 },
  }, { ranked: true, current: 3 }));

  assert.equal(effects[0].changes[0].value, 1);
});

test("scales a ranked talent by its current rank at apply time", () => {
  assert.equal(ModifierHelpers.rankMultiplier(talent({}, { ranked: true, current: 3 })), 3);
  assert.equal(ModifierHelpers.rankMultiplier(talent({}, { ranked: false, current: 3 })), 1);
  assert.equal(ModifierHelpers.rankMultiplier(talent({}, undefined)), 1);
});

test("a rank that is not a usable number never scales a grant away", () => {
  // `ranks.current` is a nullable NumberField and a cleared Rank field persists null.
  // Number(null) and Number("") are both 0, which would silently wipe the modifier.
  for (const current of [null, "", undefined, NaN, 0, -2, "nonsense"]) {
    assert.equal(ModifierHelpers.rankMultiplier(talent({}, { ranked: true, current })), 1, `rank ${current}`);
  }
});

test("does not multiply a ranked talent's checkbox grants", () => {
  const effects = ModifierHelpers.planAttributeEffects(talent({
    Brawl: { mod: "Brawl", modtype: "Career Skill", value: true, isCheckbox: true },
  }, { ranked: true, current: 3 }));

  assert.equal(effects[0].changes[0].value, true);
});

test("explodes a modifier that targets more than one path", () => {
  const [effect] = ModifierHelpers.planAttributeEffects(talent({
    Defence: { mod: "Defence", modtype: "Stat", value: 1 },
  }));

  assert.deepEqual(effect.changes.map((c) => c.key), [
    "system.stats.defence.melee",
    "system.stats.defence.ranged",
  ]);
});

test("emits nothing for an attribute that yields no active-effect key", () => {
  // "Remove Setback" (the Roll Modifiers flavour) has no property path -- it is read off a
  // rolled weapon by getDicePoolModifiers. A keyless change would be an effect that applies
  // to nothing and cannot be diagnosed from the sheet.
  assert.deepEqual(ModifierHelpers.planAttributeEffects(talent({
    Setbacks: { mod: "Setback", modtype: "Remove Setback", value: 1 },
  })), []);
});

test("skips incomplete attributes and update-syntax deletion markers", () => {
  assert.deepEqual(ModifierHelpers.planAttributeEffects(talent({
    "-=Piloting:_Space": null,
    Broken: { value: 1 },
    AlsoBroken: null,
  })), []);
});

test("applies only to item types whose attributes no inherent effect owns", () => {
  // A species' non-attr keys ("Brawn") are already carried by its "(inherent)" effect;
  // planning them here would double every species grant.
  const species = {
    type: "species",
    system: { attributes: { Brawn: { mod: "Brawn", modtype: "Characteristic", value: 3 } } },
  };

  assert.deepEqual(ModifierHelpers.planAttributeEffects(species), []);
  assert.deepEqual(ModifierHelpers.planAttributeEffects(undefined), []);
});

test("reconciles talents hydrated inside a newly created actor", async () => {
  const created = [];
  const item = {
    type: "talent",
    name: "Skilled Jockey",
    img: "icons/skilled-jockey.webp",
    uuid: "Actor.adversary.Item.skilled-jockey",
    pack: null,
    isEmbedded: true,
    system: {
      attributes: {
        "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 },
      },
    },
    getEmbeddedCollection: () => [],
    createEmbeddedDocuments: async (_type, effects) => created.push(...effects),
  };
  const actor = { name: "Imported Nemesis", items: [item] };

  const report = await ItemHelpers.reconcileActorAttributeEffects(actor);

  assert.equal(report.scanned, 1);
  assert.deepEqual(report.changed.map((entry) => entry.item), ["Skilled Jockey"]);
  assert.deepEqual(created[0].changes, [
    { key: "system.skills.Piloting: Space.remsetback", mode: AE_MODES.ADD, value: 1 },
  ]);
});

test("leaves an existing ranked effect alone - there is nothing to migrate", async () => {
  // The stored value is the per-rank grant, which is exactly what an effect written before
  // rank scaling existed already holds, so reconciliation stays create-only and no repair
  // pass can rewrite a working effect (or a hand-edited one) behind the user's back.
  let updated = false;
  const item = {
    type: "talent",
    name: "Ranked Skilled Jockey",
    img: "icons/skilled-jockey.webp",
    uuid: "Actor.adversary.Item.ranked-skilled-jockey",
    pack: null,
    isEmbedded: true,
    system: {
      ranks: { ranked: true, current: 3 },
      attributes: {
        "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 },
      },
    },
    getEmbeddedCollection: () => [{
      id: "legacy-effect",
      name: "Piloting:_Space",
      disabled: false,
      changes: [{ key: "system.skills.Piloting: Space.remsetback", mode: AE_MODES.ADD, value: 1 }],
    }],
    updateEmbeddedDocuments: async () => { updated = true; },
  };

  const summary = await ItemHelpers.reconcileAttributeEffects(item);

  assert.deepEqual(summary.created, []);
  assert.deepEqual(summary.updated, []);
  assert.equal(updated, false);
});

test("preserves a hand-edited ranked talent effect during repair", async () => {
  let updated = false;
  const item = {
    type: "talent",
    name: "Customized Skilled Jockey",
    pack: null,
    isEmbedded: true,
    system: {
      ranks: { ranked: true, current: 3 },
      attributes: {
        "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 },
      },
    },
    getEmbeddedCollection: () => [{
      id: "custom-effect",
      name: "Piloting:_Space",
      disabled: false,
      changes: [{ key: "system.skills.Piloting: Space.remsetback", mode: AE_MODES.ADD, value: 2 }],
    }],
    updateEmbeddedDocuments: async () => { updated = true; },
  };

  const summary = await ItemHelpers.reconcileAttributeEffects(item);

  assert.deepEqual(summary.updated, []);
  assert.equal(updated, false);
});

test("the repair sweep includes talent items owned only by an unlinked token actor", async () => {
  const item = {
    type: "talent",
    name: "Token-only Skilled Jockey",
    uuid: "Scene.scene.Token.token.Actor.actor.Item.skilled-jockey",
    pack: null,
    isEmbedded: true,
    actor: { name: "Token Nemesis" },
    system: {
      attributes: {
        "Piloting:_Space": { mod: "Piloting: Space", modtype: "Skill Remove Setback", value: 1 },
      },
    },
    getEmbeddedCollection: () => [],
  };
  Object.assign(game, {
    items: [],
    actors: [],
    scenes: [{ tokens: [{ actorLink: false, actor: { items: [item] } }] }],
  });

  const report = await ItemHelpers.repairModifierEffects({ dryRun: true });

  assert.equal(report.scanned, 1);
  assert.deepEqual(report.changed.map((entry) => entry.uuid), [item.uuid]);
});

test("the repair sweep re-reads synthetic token items after repairing their base actor", async () => {
  let baseCreates = 0;
  let staleTokenCreates = 0;
  const replacement = {
    type: "talent",
    name: "Current token talent",
    uuid: "Scene.scene.Token.token.Actor.actor.Item.talent",
    pack: null,
    isEmbedded: true,
    actor: { name: "Token Nemesis" },
    system: {
      attributes: {
        Cool: { mod: "Cool", modtype: "Skill Boost", value: 1 },
      },
    },
    getEmbeddedCollection: () => [{ name: "Cool" }],
  };
  const tokenActor = { items: [] };
  const staleTokenItem = {
    ...replacement,
    name: "Detached token talent",
    getEmbeddedCollection: () => [],
    createEmbeddedDocuments: async () => { staleTokenCreates += 1; },
  };
  tokenActor.items = [staleTokenItem];

  const baseItem = {
    ...replacement,
    name: "Base talent",
    uuid: "Actor.actor.Item.talent",
    actor: { name: "Base Nemesis" },
    getEmbeddedCollection: () => [],
    createEmbeddedDocuments: async () => {
      baseCreates += 1;
      // Mirrors TokenDocument#_onUpdateBaseActor: the synthetic collection is rebuilt and
      // the Item captured before the base repair becomes detached.
      tokenActor.items = [replacement];
    },
  };
  Object.assign(game, {
    items: [],
    actors: [{ items: [baseItem] }],
    scenes: [{ tokens: [{ actorLink: false, actor: tokenActor }] }],
  });

  const report = await ItemHelpers.repairModifierEffects();

  assert.equal(baseCreates, 1);
  assert.equal(staleTokenCreates, 0);
  assert.equal(report.scanned, 2);
  assert.deepEqual(report.changed.map((entry) => entry.uuid), [baseItem.uuid]);
});
