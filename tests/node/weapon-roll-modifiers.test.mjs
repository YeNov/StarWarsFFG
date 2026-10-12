import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import ModifierHelpers from "../../modules/helpers/modifiers.js";

/**
 * What a weapon adds to a dice pool. `DiceHelpers.getModifiers` folds each source returned by
 * `weaponRollSources` into the pool through `getDicePoolModifiers`, which reads each source's
 * value with `getCalculatedValueFromCurrentAndArray`. The pool class itself cannot load under
 * Node (it reads Foundry's dice terms at import), so these cover the two pure halves.
 *
 * The rule is the one every modifier consumer shares (open decisions R14, R33, R34): a quality
 * or modification is off only with `active: false`, and so is one of the item's own rows.
 */

const boost = (value, extra = {}) => ({ modtype: "Roll Modifiers", mod: "Add Boost", value, ...extra });
const valueOf = (source, items = []) =>
  ModifierHelpers.getCalculatedValueFromCurrentAndArray(source, items, "Add Boost", "Roll Modifiers");

test("a quality on the weapon adds its boost unless it is switched off", () => {
  const accurate = (extra) => ({ name: "Accurate", type: "itemmodifier", system: { rank: 1, attributes: { a: boost(1) }, ...extra } });

  assert.equal(valueOf(accurate({})), 1);
  assert.equal(valueOf(accurate({ active: true })), 1);
  assert.equal(valueOf(accurate({ active: false })), 0);
});

test("an attachment adds the boost of each modification not switched off", () => {
  const attachment = { name: "Grip", type: "itemattachment", system: { attributes: {}, itemmodifier: [] } };
  const modification = (extra) => ({ name: "Mod", type: "itemmodifier", system: { rank: 1, attributes: { a: boost(1) }, ...extra } });

  assert.equal(valueOf(attachment, [modification({}), modification({ active: true }), modification({ active: false })]), 2);
});

test("one of the weapon's own rows switched off adds nothing to the pool", () => {
  const weapon = {
    name: "Blaster",
    type: "weapon",
    system: { attributes: { a: boost(1, { active: false }), b: boost(2) } },
  };

  assert.equal(valueOf(weapon), 2);
});

test("the pool folds the weapon, each attachment with its installed modifications, then the qualities still on", () => {
  const weapon = {
    name: "Blaster",
    type: "weapon",
    system: {
      itemattachment: [
        {
          name: "Grip",
          system: { itemmodifier: [{ name: "Dropped", system: {} }, { name: "Spare", system: { active: false } }] },
        },
        { name: "Scope", system: { itemmodifier: [{ name: "Fitted", system: { active: true } }] } },
      ],
      itemmodifier: [{ name: "Switched off", system: { active: false } }, { name: "Accurate", system: {} }],
    },
  };

  assert.deepEqual(
    ModifierHelpers.weaponRollSources(weapon).map((source) => source.name),
    ["Blaster", "Grip", "Dropped", "Scope", "Fitted", "Accurate"],
  );
});

test("only a weapon or a ship weapon adds modifiers to a pool", () => {
  const armour = { name: "Vest", type: "armour", system: { itemmodifier: [{ name: "Q", system: {} }] } };

  assert.deepEqual(ModifierHelpers.weaponRollSources(armour), []);
  assert.deepEqual(
    ModifierHelpers.weaponRollSources({ name: "Laser cannon", type: "shipweapon", system: {} }).map((source) => source.name),
    ["Laser cannon"],
  );
});
