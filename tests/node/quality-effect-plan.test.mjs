import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import { AE_MODES } from "../../modules/config/ffg-active-effect-modes.js";
import ItemHelpers from "../../modules/helpers/item-helpers.js";

/**
 * `planModifierEffects` is the single source of truth for the Active Effects a weapon /
 * armour derives from its qualities. Everything before it patched those effects
 * incrementally from six different call sites and nothing ever reconciled the result
 * against the qualities actually on the item, which is how a live world accumulated:
 *
 *   - `value:"NaN"` (syncAEStatus multiplying an un-prepared `rank_current`)
 *   - changes with no `key` at all (getModKeyPath returning undefined, unguarded)
 *   - orphan effects left behind by qualities that had since been removed
 *   - two qualities sharing one attribute key, so each clobbered the other
 *
 * The planner is deliberately pure -- plain data in, a plan out -- so all of that is
 * testable here rather than only against a live Foundry world.
 */

const weapon = (system = {}) => ({
  type: "weapon",
  system: {
    attributes: {},
    itemmodifier: [],
    itemattachment: [],
    equippable: { equipped: true },
    ...system,
  },
});

const quality = (name, attributes, extra = {}) => ({
  name,
  type: "itemmodifier",
  system: { rank: 1, attributes, ...extra },
});

const byName = (plan, name) => plan.desired.find((effect) => effect.name === name);

test("a rank-1 Deflective quality yields +1 ranged defence on the right key", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Deflective Quality", {
      attr1750856619648: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
    })],
  }));

  assert.equal(plan.desired.length, 1);
  assert.deepEqual(byName(plan, "attr1750856619648").changes, [
    { key: "system.stats.defence.ranged", mode: AE_MODES.ADD, value: "1" },
  ]);
});

test("the effect value scales with the quality's rank", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Defensive Quality", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { rank: 2 })],
  }));

  assert.equal(byName(plan, "attr1700000000001").changes[0].value, "2");
});

test("derived rank_current never replaces the source quality's own rank", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Defensive Quality", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { rank: 2, rank_current: 3 })],
  }));

  assert.equal(byName(plan, "attr1700000000001").changes[0].value, "2");
});

test("a same-named attachment quality is not counted in both rank_current and its own effect", () => {
  // Live repro: prepareData summarizes the direct and Reflex Grip qualities as rank_current 2.
  // The planner also walks the attachment itself, so using that summary for the direct source
  // would turn two real ranks into three Active Effect ranks.
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [
      quality("Defensive Quality", {
        attr1750856619648: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
      }, { rank: 1, rank_current: 2 }),
      quality("Deflection Quality", {
        attr1783702766974: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
      }, { rank: 1, rank_current: 2 }),
    ],
    itemattachment: [{
      name: "Reflex Grip",
      system: {
        attributes: {},
        itemmodifier: [
          quality("Defensive Quality", {
            attr1784307106492: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
          }, { rank: 1, active: true }),
          quality("Deflection Quality", {
            attr1786133420626: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
          }, { rank: 1, active: true }),
        ],
      },
    }],
  }));

  const defenceChanges = plan.desired.flatMap((effect) => effect.changes)
    .filter((change) => change.key.includes("system.stats.defence"));
  const total = (key) => defenceChanges
    .filter((change) => change.key === key)
    .reduce((sum, change) => sum + Number(change.value), 0);

  assert.equal(total("system.stats.defence.melee"), 2);
  assert.equal(total("system.stats.defence.ranged"), 2);
  assert.ok(defenceChanges.every((change) => change.value === "1"));
});

// --- the NaN that killed Lucan's Lightsaber Pike -------------------------------------

test("a missing rank falls back to 1 instead of producing NaN", () => {
  const mod = quality("Deflective Quality", {
    attr1700000000001: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
  });
  delete mod.system.rank;

  const plan = ItemHelpers.planModifierEffects(weapon({ itemmodifier: [mod] }));

  assert.equal(byName(plan, "attr1700000000001").changes[0].value, "1");
  assert.ok(plan.warnings.some((w) => w.code === "bad-rank"));
});

test("an unparseable rank falls back to 1 instead of producing NaN", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Deflective Quality", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
    }, { rank: "not a number" })],
  }));

  assert.equal(byName(plan, "attr1700000000001").changes[0].value, "1");
});

test("no planned change is ever non-finite", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [
      quality("A", { attr1700000000001: { modtype: "Stat", mod: "Defence-Ranged", value: undefined } }),
      quality("B", { attr1700000000002: { modtype: "Stat", mod: "Defence-Melee", value: "" } }, { rank: undefined }),
    ],
  }));

  for (const effect of plan.desired) {
    for (const change of effect.changes) {
      assert.notEqual(String(change.value), "NaN", `${effect.name} planned a NaN value`);
    }
  }
});

// --- the empty-key effects on the Beskar Vamblades ------------------------------------

test("an unrecognised mod produces no change rather than a change with no key", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Nonsense Quality", {
      attr1700000000001: { modtype: "Bogus Type", mod: "Nope", value: 1 },
    })],
  }));

  assert.equal(plan.desired.length, 0, "an effect with no usable key must not be planned");
  assert.ok(plan.warnings.some((w) => w.code === "no-key"));
});

test("an attribute missing modtype/mod entirely is skipped, not exploded", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Broken Quality", { attr1700000000001: { value: 1 } })],
  }));

  assert.equal(plan.desired.length, 0);
});

test("a mod that explodes to several keys keeps every one of them", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Defence Quality", {
      attr1700000000001: { modtype: "Stat", mod: "Defence", value: 1 },
    })],
  }));

  assert.deepEqual(byName(plan, "attr1700000000001").changes.map((c) => c.key).sort(), [
    "system.stats.defence.melee",
    "system.stats.defence.ranged",
  ]);
});

// --- the Defensive / Deflective shared-attribute-key collision -------------------------

test("two qualities sharing one attribute key get separate effects, not one clobbered pair", () => {
  // The live YN Mods pack ships exactly this: Deflective Quality was duplicated from
  // Defensive Quality and inherited its attribute key `attr1750856619648`.
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [
      quality("Defensive Quality", {
        attr1750856619648: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
      }),
      quality("Deflective Quality", {
        attr1750856619648: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
      }),
    ],
  }));

  assert.equal(plan.desired.length, 2, "both qualities must survive");
  const keys = plan.desired.flatMap((e) => e.changes.map((c) => c.key)).sort();
  assert.deepEqual(keys, ["system.stats.defence.melee", "system.stats.defence.ranged"]);
  assert.equal(new Set(plan.desired.map((e) => e.name)).size, 2, "effect names must be distinct");
});

test("the collision is reported as a rename the caller can persist onto the item", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [
      quality("Defensive Quality", {
        attr1750856619648: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
      }),
      quality("Deflective Quality", {
        attr1750856619648: { modtype: "Stat", mod: "Defence-Ranged", value: 1 },
      }),
    ],
  }));

  assert.equal(plan.renames.length, 1);
  assert.deepEqual(plan.renames[0].path, ["itemmodifier", 1]);
  assert.equal(plan.renames[0].from, "attr1750856619648");
  assert.notEqual(plan.renames[0].to, "attr1750856619648");
  // the first claimant keeps the original key, so existing effects stay matched
  assert.ok(byName(plan, "attr1750856619648"));
});

test("renaming is deterministic — the same item always plans the same keys", () => {
  const build = () => ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [
      quality("A", { attr1700000000009: { modtype: "Stat", mod: "Defence-Melee", value: 1 } }),
      quality("B", { attr1700000000009: { modtype: "Stat", mod: "Defence-Ranged", value: 1 } }),
      quality("C", { attr1700000000009: { modtype: "Stat", mod: "Soak", value: 1 } }),
    ],
  }));

  assert.deepEqual(build().desired.map((e) => e.name), build().desired.map((e) => e.name));
  assert.equal(new Set(build().desired.map((e) => e.name)).size, 3);
});

// --- the orphan effects on Джасек's Shoto ---------------------------------------------

test("ownedNames covers every attribute key the item legitimately carries", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    attributes: { attr1700000000010: { modtype: "Stat", mod: "Soak", value: 1 } },
    itemmodifier: [quality("Q", { attr1700000000011: { modtype: "Stat", mod: "Defence-Melee", value: 1 } })],
    itemattachment: [{
      name: "Att",
      system: {
        attributes: { attr1700000000012: { modtype: "Stat", mod: "Soak", value: 1 } },
        itemmodifier: [quality("AQ", { attr1700000000013: { modtype: "Stat", mod: "Defence-Ranged", value: 1 } })],
      },
    }],
  }));

  assert.deepEqual([...plan.ownedNames].sort(), [
    "attr1700000000010", "attr1700000000011", "attr1700000000012", "attr1700000000013",
  ]);
});

test("an attribute whose mod is unusable is still owned, so its effect is not treated as an orphan twice", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Q", { attr1700000000001: { modtype: "Bogus", mod: "Nope", value: 1 } })],
  }));

  assert.ok(plan.ownedNames.has("attr1700000000001"));
});

// A live dry run over 431 items showed these are the COMMON case, not corruption: damage,
// boost, setback and advantage modifiers are applied by ItemFFG.prepareData and the dice-pool
// builder, not by Active Effects, so getModKeyPath has nothing to return. An effect such an
// attribute already owns must survive reconciliation -- an earlier revision of this planner
// would have deleted roughly ninety of them across one world.
for (const [label, attr] of Object.entries({
  "Accurate (boost dice)": { modtype: "Roll Modifiers", mod: "Add Boost", value: 1 },
  "Inaccurate (setback dice)": { modtype: "Roll Modifiers", mod: "Add Setback", value: 1 },
  "Remove setback": { modtype: "Roll Modifiers", mod: "Remove Setback", value: 1 },
  "Superior (advantage)": { modtype: "Result Modifiers", mod: "Add Advantage", value: 1 },
  "weapon damage": { modtype: "Weapon Stat", mod: "damage", value: 2 },
})) {
  test(`${label} is owned but plans no Active Effect, so its effect is never orphaned`, () => {
    const plan = ItemHelpers.planModifierEffects(weapon({
      itemmodifier: [quality("Q", { attr1700000000001: attr })],
    }));

    assert.equal(plan.desired.length, 0, "there is no actor stat for this modifier to target");
    assert.ok(
      plan.ownedNames.has("attr1700000000001"),
      "owned, so the reconciler leaves any existing effect for it alone",
    );
  });
}

test("a non-`attr` attribute key is owned but never planned", () => {
  // Inherent keys (`Brawn`) and hand-authored ones an imported item can carry are covered by
  // the `(inherent)` effect; planning them here would mint a second, duplicate grant.
  const plan = ItemHelpers.planModifierEffects(weapon({
    attributes: { Coercion: { modtype: "Skill Rank", mod: "Coercion", value: 1 } },
  }));

  assert.equal(plan.desired.length, 0);
  assert.ok(plan.ownedNames.has("Coercion"));
});

// --- reporting -----------------------------------------------------------------------

test("describeEffect renders a change so a before/after can be read at a glance", () => {
  assert.deepEqual(
    ItemHelpers.describeEffect([{ key: "system.stats.defence.ranged", value: "NaN", mode: 2 }], false),
    { disabled: false, changes: ["system.stats.defence.ranged=NaN (mode 2)"] },
  );
});

test("describeEffect names a missing key rather than rendering it blank", () => {
  assert.deepEqual(
    ItemHelpers.describeEffect([{ value: "2", mode: 2 }], true),
    { disabled: true, changes: ["(no key)=2 (mode 2)"] },
  );
});

test("describeEffect tolerates an effect with no changes", () => {
  assert.deepEqual(ItemHelpers.describeEffect(undefined, false), { disabled: false, changes: [] });
});

test("effectMatchesPlan compares values across the string/number boundary", () => {
  const planned = { changes: [{ key: "system.stats.defence.melee", mode: 2, value: "1" }], disabled: false };
  assert.equal(
    ItemHelpers.effectMatchesPlan({ changes: [{ key: "system.stats.defence.melee", mode: 2, value: 1 }], disabled: false }, planned),
    true,
    "a stored numeric 1 and a planned \"1\" are the same grant and must not churn an update",
  );
  assert.equal(
    ItemHelpers.effectMatchesPlan({ changes: [{ key: "system.stats.defence.melee", mode: 5, value: "1" }], disabled: false }, planned),
    false,
    "a different mode is a real difference",
  );
  assert.equal(
    ItemHelpers.effectMatchesPlan({ changes: [{ key: "system.stats.defence.melee", mode: 2, value: "1" }], disabled: true }, planned),
    false,
    "a different suspension state is a real difference",
  );
});

test("isSystemEffectName matches generated names and spares hand-made ones", () => {
  assert.equal(ItemHelpers.isSystemEffectName("attr1750856619648"), true);
  assert.equal(ItemHelpers.isSystemEffectName("attr1750856619648_2"), true);
  assert.equal(ItemHelpers.isSystemEffectName("(inherent)"), false);
  assert.equal(ItemHelpers.isSystemEffectName("My Custom Effect"), false);
  assert.equal(ItemHelpers.isSystemEffectName("Brawn"), false);
});

// --- suspension --------------------------------------------------------------------

test("an unequipped weapon plans its quality effects as disabled", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    equippable: { equipped: false },
    itemmodifier: [quality("Q", { attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 } })],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, true);
});

test("an inactive modification inside an attachment stays suspended even when equipped", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemattachment: [{
      name: "Att",
      system: {
        attributes: {},
        itemmodifier: [quality("Installed?", {
          attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
        }, { active: false })],
      },
    }],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, true);
});

test("a modification inside an attachment with no `active` field is not suspended", () => {
  // Only an explicit `active: false` switches a quality off; a missing field means enabled.
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemattachment: [{
      name: "Att",
      system: {
        attributes: {},
        itemmodifier: [quality("Dropped", {
          attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
        })],
      },
    }],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, false);
});

// A modifier's enabled toggle suspends it wherever it sits -- directly on the weapon or in an
// attachment. Only an explicit `active: false` does; qualities dropped or imported straight onto
// a weapon often carry no `active` field, and reading that absence as "off" would silently
// suspend every one of them.

test("a direct quality switched off with `active: false` is planned disabled on an equipped weapon", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Q", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 2 },
    }, { active: false })],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, true);
});

test("a direct quality with no `active` field is planned enabled on an equipped weapon", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Q", { attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 } })],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, false);
});

test("a direct quality with `active: true` is planned enabled on an equipped weapon", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Q", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { active: true })],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, false);
});

test("switching one direct quality off leaves the other qualities on the weapon enabled", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [
      quality("Off", { attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 } }, { active: false }),
      quality("On", { attr1700000000002: { modtype: "Stat", mod: "Defence-Ranged", value: 1 } }, { active: true }),
      quality("Plain", { attr1700000000003: { modtype: "Stat", mod: "Soak", value: 1 } }),
    ],
  }));

  assert.deepEqual(
    plan.desired.map((effect) => [effect.name, effect.disabled]),
    [
      ["attr1700000000001", true],
      ["attr1700000000002", false],
      ["attr1700000000003", false],
    ],
  );
});

test("a direct quality switched on does not override an unequipped weapon", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    equippable: { equipped: false },
    itemmodifier: [quality("Q", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { active: true })],
  }));

  assert.equal(byName(plan, "attr1700000000001").disabled, true);
});

// The live path that decides whether an equip toggle may flip a quality's effect must read the
// same flag, or equipping a weapon would re-enable a quality the user switched off.

const effectOf = (name) => ({ name });

test("shouldUpdateAEStatus leaves the effect of a switched-off direct quality alone", async () => {
  const item = weapon({
    itemmodifier: [quality("Q", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { active: false })],
  });

  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000001")), false);
});

test("shouldUpdateAEStatus updates the effect of a direct quality with no `active` field", async () => {
  const item = weapon({
    itemmodifier: [quality("Q", { attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 } })],
  });

  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000001")), true);
});

test("shouldUpdateAEStatus updates the effect of a direct quality with `active: true`", async () => {
  const item = weapon({
    itemmodifier: [quality("Q", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { active: true })],
  });

  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000001")), true);
});

test("shouldUpdateAEStatus only holds back the quality that is switched off", async () => {
  const item = weapon({
    itemmodifier: [
      quality("Off", { attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 } }, { active: false }),
      quality("On", { attr1700000000002: { modtype: "Stat", mod: "Defence-Ranged", value: 1 } }, { active: true }),
    ],
  });

  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000001")), false);
  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000002")), true);
});

test("shouldUpdateAEStatus leaves the effect of an uninstalled attachment modification alone", async () => {
  const item = weapon({
    itemattachment: [{
      name: "Att",
      system: {
        attributes: {},
        itemmodifier: [
          quality("Installed", { attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 } }, { active: true }),
          quality("Spare", { attr1700000000002: { modtype: "Stat", mod: "Defence-Ranged", value: 1 } }, { active: false }),
        ],
      },
    }],
  });

  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000001")), true);
  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("attr1700000000002")), false);
});

test("shouldUpdateAEStatus updates an effect that no quality on the item owns", async () => {
  const item = weapon({
    itemmodifier: [quality("Q", {
      attr1700000000001: { modtype: "Stat", mod: "Defence-Melee", value: 1 },
    }, { active: false })],
  });

  assert.equal(await ItemHelpers.shouldUpdateAEStatus(item, effectOf("(inherent)")), true);
});

// --- non-numeric grants --------------------------------------------------------------

test("a checkbox/boolean grant is not multiplied by rank", () => {
  const plan = ItemHelpers.planModifierEffects(weapon({
    itemmodifier: [quality("Career Quality", {
      attr1700000000001: { modtype: "Career Skill", mod: "Brawl", value: true, isCheckbox: true },
    }, { rank: 3 })],
  }));

  assert.equal(byName(plan, "attr1700000000001").changes[0].value, "true");
});

// --- items the planner must not touch --------------------------------------------------

test("a non-equippable item plans nothing as disabled", () => {
  const plan = ItemHelpers.planModifierEffects({
    type: "itemattachment",
    system: {
      attributes: { attr1700000000001: { modtype: "Stat", mod: "Soak", value: 1 } },
      itemmodifier: [],
    },
  });

  assert.equal(byName(plan, "attr1700000000001").disabled, false);
});

test("an item with no qualities at all plans an empty, well-formed result", () => {
  const plan = ItemHelpers.planModifierEffects(weapon());

  assert.deepEqual(plan.desired, []);
  assert.deepEqual(plan.renames, []);
  assert.equal(plan.ownedNames.size, 0);
});

test("missing system collections are tolerated", () => {
  const plan = ItemHelpers.planModifierEffects({ type: "weapon", system: {} });

  assert.deepEqual(plan.desired, []);
});
