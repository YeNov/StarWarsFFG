/**
 * Node tests for the content-source descriptors + predicates (Stage 8; N-1, N-4, D7).
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  SOURCE_DESCRIPTORS,
  getDescriptor,
  importCatalogOptions,
  missingSourcePackIds,
  passesSourceAvailabilityGate,
  sourceIdOf,
  sourcePackStatus,
  isSourceEnabled,
  sourceSettingPackIds,
  setSourceEnabled,
  UnknownPoolKeyError,
} from "../../modules/char-creator/source-descriptors.js";

test("forcePower maps to setting forcePowerCompendiums and item type forcepower", () => {
  const d = getDescriptor("forcePower");
  assert.equal(d.settingKey, "forcePowerCompendiums");
  assert.deepEqual(d.worldItemTypes, ["forcepower"]);
});

test("gear unions all five item types under the one itemCompendiums setting", () => {
  const d = getDescriptor("gear");
  assert.equal(d.settingKey, "itemCompendiums");
  assert.deepEqual(d.worldItemTypes, ["weapon", "armour", "gear", "itemattachment", "itemmodifier"]);
});

test("the career pool reads world items of type career", () => {
  const d = getDescriptor("career");
  assert.equal(d.settingKey, "careerCompendiums");
  assert.deepEqual(d.worldItemTypes, ["career"]);
  assert.ok(!d.worldItemTypes.includes("careers"));
});

test("the species, obligation, motivation, background and specialization pools each read their own compendium setting", () => {
  assert.equal(getDescriptor("species").settingKey, "speciesCompendiums");
  assert.equal(getDescriptor("obligation").settingKey, "obligationCompendiums");
  assert.equal(getDescriptor("motivation").settingKey, "motivationCompendiums");
  assert.equal(getDescriptor("background").settingKey, "backgroundCompendiums");
  assert.equal(getDescriptor("specialization").settingKey, "specializationCompendiums");
});

test("talent / signatureAbility pools are deliberately NOT consumed", () => {
  assert.ok(!("talent" in SOURCE_DESCRIPTORS));
  assert.ok(!("signatureAbility" in SOURCE_DESCRIPTORS));
});

test("getDescriptor throws UnknownPoolKeyError on an unknown poolKey", () => {
  assert.throws(() => getDescriptor("nonsense"), UnknownPoolKeyError);
  assert.throws(() => getDescriptor(undefined), UnknownPoolKeyError);
});

test("sourceIdOf derives a pack collection id and the world sentinel", () => {
  assert.equal(sourceIdOf({ collection: "starwarsffg.species" }), "starwarsffg.species");
  assert.equal(sourceIdOf({ metadata: { id: "world.custom" } }), "world.custom");
  assert.equal(sourceIdOf("world"), "world");
});

test("a compendium source is enabled unless the same pool excludes it", () => {
  assert.equal(isSourceEnabled("species", "pack1"), true);
  assert.equal(isSourceEnabled("species", "pack1", {}), true);
  assert.equal(isSourceEnabled("species", "pack1", { species: ["pack1"] }), false);
  // an exclusion in one pool does not disable another pool's same-id source
  assert.equal(isSourceEnabled("gear", "pack1", { species: ["pack1"] }), true);
  // a new (unlisted) pack stays enabled even when the pool has other exclusions
  assert.equal(isSourceEnabled("species", "packNew", { species: ["pack1"] }), true);
});

test("world items default off and require an explicit per-pool enable", () => {
  assert.equal(isSourceEnabled("gear", "world"), false);
  assert.equal(isSourceEnabled("gear", "world", { gear: ["enabled:world"] }), true);
  assert.equal(isSourceEnabled("gear", "world", { species: ["enabled:world"] }), false);
  assert.equal(isSourceEnabled("gear", "world", { gear: ["world", "enabled:world"] }), false);
});

// ---------------------------------------------------------------------------------------------
// Switching sources on and off, the way the Content sources panel does.
//
// The panel stores the user's choice with setSourceEnabled and the pool loader reads it back with
// isSourceEnabled, so these cases toggle and then ask what is enabled. Rules
// (docs/pc-wizard-guide.md, "Content sources panel"): compendia are on by default, World items
// are off by default, and a switch belongs to one pool.
// ---------------------------------------------------------------------------------------------

test("a compendium in the world namespace is a pack source: on by default and off only by its own exclusion", () => {
  const packId = "world.homebrew-species";

  const idOfPack = sourceIdOf({ collection: packId });
  const enabledByDefault = isSourceEnabled("species", packId);
  const enabledAfterExcludingItself = isSourceEnabled("species", packId, { species: [packId] });
  const worldItemsAfterExcludingThePack = isSourceEnabled("species", "world", { species: [packId] });

  assert.equal(idOfPack, "world.homebrew-species");
  assert.equal(enabledByDefault, true);
  assert.equal(enabledAfterExcludingItself, false);
  // excluding the pack does not turn the World items source on
  assert.equal(worldItemsAfterExcludingThePack, false);
});

test("switching a compendium off in one pool leaves it on in every other pool", () => {
  const nothingStored = {};

  const afterSwitchingOff = setSourceEnabled(nothingStored, "gear", "pack.alpha", false);

  assert.equal(isSourceEnabled("gear", "pack.alpha", afterSwitchingOff), false);
  assert.equal(isSourceEnabled("species", "pack.alpha", afterSwitchingOff), true);
  assert.equal(isSourceEnabled("gear", "pack.beta", afterSwitchingOff), true);
});

test("switching a compendium back on enables it again", () => {
  const switchedOff = setSourceEnabled({}, "gear", "pack.alpha", false);

  const switchedBackOn = setSourceEnabled(switchedOff, "gear", "pack.alpha", true);

  assert.equal(isSourceEnabled("gear", "pack.alpha", switchedOff), false);
  assert.equal(isSourceEnabled("gear", "pack.alpha", switchedBackOn), true);
});

test("opting in to World items for one pool leaves World items off in the other pools", () => {
  const optedIn = setSourceEnabled({}, "gear", "world", true);

  const optedOutAgain = setSourceEnabled(optedIn, "gear", "world", false);

  assert.equal(isSourceEnabled("gear", "world", optedIn), true);
  assert.equal(isSourceEnabled("species", "world", optedIn), false);
  assert.equal(isSourceEnabled("career", "world", optedIn), false);
  assert.equal(isSourceEnabled("gear", "world", optedOutAgain), false);
});

test("the World items opt-in and a compendium exclusion in one pool do not undo each other", () => {
  const optedInFirst = setSourceEnabled(setSourceEnabled({}, "gear", "world", true), "gear", "pack.alpha", false);
  const packOffFirst = setSourceEnabled(setSourceEnabled({}, "gear", "pack.alpha", false), "gear", "world", true);

  const worldOptedOutLast = setSourceEnabled(packOffFirst, "gear", "world", false);

  for (const stored of [optedInFirst, packOffFirst]) {
    assert.equal(isSourceEnabled("gear", "world", stored), true);
    assert.equal(isSourceEnabled("gear", "pack.alpha", stored), false);
  }
  assert.equal(isSourceEnabled("gear", "world", worldOptedOutLast), false);
  assert.equal(isSourceEnabled("gear", "pack.alpha", worldOptedOutLast), false);
});

test("the stored selection drops duplicate, blank and malformed entries when it is updated", () => {
  const stored = {
    species: ["pack.alpha", "pack.alpha", "", null],
    gear: "not-a-list",
    career: [],
  };

  const updated = setSourceEnabled(stored, "background", "pack.beta", false);

  assert.deepEqual(updated, { species: ["pack.alpha"], background: ["pack.beta"] });
});

test("import catalogs bypass purchase-time rarity and restricted gates", () => {
  const rarityEight = { system: { rarity: { value: 8, isrestricted: true } } };
  assert.equal(passesSourceAvailabilityGate(rarityEight, {
    maxRarity: 6,
    allowRestricted: false,
  }), false);
  assert.equal(passesSourceAvailabilityGate(rarityEight, {
    maxRarity: 6,
    allowRestricted: false,
    ignoreAvailabilityGates: true,
  }), true);
});

// ---------------------------------------------------------------------------------------------
// The GM's Max Rarity and Allow Restricted limits.
//
// docs/pc-wizard-guide.md: Max Rarity (default 6) and Allow Restricted Items (default off) are
// applied when a pool loads, so gear the GM has ruled out never appears. The pool loader applies
// the same gate to every pool, so an item with no rarity (a species, a career) must get through.
// ---------------------------------------------------------------------------------------------

const wizardLimits = { maxRarity: 6, allowRestricted: false };
const itemWithRarity = (value, isrestricted = false) => ({ system: { rarity: { value, isrestricted } } });

test("an item at the Max Rarity limit is offered and an item one rarity above it is not", () => {
  const belowLimit = itemWithRarity(5);
  const atLimit = itemWithRarity(6);
  const aboveLimit = itemWithRarity(7);

  const offered = [belowLimit, atLimit, aboveLimit].map((item) => passesSourceAvailabilityGate(item, wizardLimits));
  const aboveLimitOnceTheGmRaisesIt = passesSourceAvailabilityGate(aboveLimit, { ...wizardLimits, maxRarity: 8 });

  assert.deepEqual(offered, [true, true, false]);
  assert.equal(aboveLimitOnceTheGmRaisesIt, true);
});

test("a restricted item is offered only when Allow Restricted is on", () => {
  const restrictedWithinLimit = itemWithRarity(2, true);

  const withRestrictedOff = passesSourceAvailabilityGate(restrictedWithinLimit, wizardLimits);
  const withRestrictedOn = passesSourceAvailabilityGate(restrictedWithinLimit, { ...wizardLimits, allowRestricted: true });
  const withMaxRarityRaised = passesSourceAvailabilityGate(restrictedWithinLimit, { ...wizardLimits, maxRarity: 10 });

  assert.equal(withRestrictedOff, false);
  assert.equal(withRestrictedOn, true);
  // raising Max Rarity does not make a restricted item available
  assert.equal(withMaxRarityRaised, false);
});

test("Allow Restricted does not lift the Max Rarity limit", () => {
  const restrictedAboveLimit = itemWithRarity(8, true);
  const unrestrictedAboveLimit = itemWithRarity(8, false);
  const restrictedAllowed = { ...wizardLimits, allowRestricted: true };

  const restrictedResult = passesSourceAvailabilityGate(restrictedAboveLimit, restrictedAllowed);
  const unrestrictedResult = passesSourceAvailabilityGate(unrestrictedAboveLimit, restrictedAllowed);

  assert.equal(restrictedResult, false);
  assert.equal(unrestrictedResult, false);
});

test("items without a rarity, such as species and careers, pass both limits", () => {
  const strictestLimits = { maxRarity: 0, allowRestricted: false };
  const noRarityBlock = { system: { description: "no rarity block" } };
  const noSystemData = {};

  const results = [noRarityBlock, noSystemData].map((item) => passesSourceAvailabilityGate(item, strictestLimits));

  assert.deepEqual(results, [true, true]);
});

test("an import catalog keeps an item above Max Rarity and a restricted item, each on its own", () => {
  // An imported character must keep the gear it owns, so the catalog the Hyperdrive importer
  // reads ignores both gates (modules/importer/hyperdrive/importer-app.js).
  const aboveLimitUnrestricted = itemWithRarity(9, false);
  const restrictedWithinLimit = itemWithRarity(2, true);
  const wizard = { ...wizardLimits, ignoreAvailabilityGates: false };
  const catalog = { ...wizardLimits, ignoreAvailabilityGates: true };

  const wizardResults = [aboveLimitUnrestricted, restrictedWithinLimit].map((item) => passesSourceAvailabilityGate(item, wizard));
  const catalogResults = [aboveLimitUnrestricted, restrictedWithinLimit].map((item) => passesSourceAvailabilityGate(item, catalog));

  assert.deepEqual(wizardResults, [false, false]);
  assert.deepEqual(catalogResults, [true, true]);
});

// ---------------------------------------------------------------------------------------------
// The sources an import reads (ruling R35, extending R20).
//
// An imported character must keep the gear it owns, so the Hyperdrive importer matches against
// every configured pack of a pool plus the world items, whatever the importing player chose in
// their own Content sources panel. importCatalogOptions is the option set it hands to the pool
// loader; the loader itself reads live packs and stays out of Node (load-source.js).
// ---------------------------------------------------------------------------------------------

test("an import reads a compendium the importing player switched off in their Content sources panel", () => {
  const switchedOff = setSourceEnabled({}, "gear", "world.homebrew-gear", false);

  const wizardReadsIt = isSourceEnabled("gear", "world.homebrew-gear", switchedOff);
  const importReadsIt = isSourceEnabled("gear", "world.homebrew-gear", importCatalogOptions("gear").exclusions);

  assert.equal(wizardReadsIt, false);
  assert.equal(importReadsIt, true);
});

test("an import reads the world items although the importing player never opted in to them", () => {
  const wizardReadsWorldItems = isSourceEnabled("gear", "world", {});
  const importReadsWorldItems = isSourceEnabled("gear", "world", importCatalogOptions("gear").exclusions);

  assert.equal(wizardReadsWorldItems, false);
  assert.equal(importReadsWorldItems, true);
});

test("an import reads every source of every pool, not only of the gear pool", () => {
  for (const poolKey of Object.keys(SOURCE_DESCRIPTORS)) {
    const { exclusions } = importCatalogOptions(poolKey);

    assert.equal(isSourceEnabled(poolKey, "world", exclusions), true, `${poolKey}: world items`);
    assert.equal(isSourceEnabled(poolKey, "world.any-pack", exclusions), true, `${poolKey}: a world compendium`);
    assert.equal(isSourceEnabled(poolKey, "starwarsffg.any-pack", exclusions), true, `${poolKey}: a system compendium`);
  }
});

test("an import also ignores the Max Rarity and Allow Restricted limits and never reuses the wizard's pool cache", () => {
  const options = importCatalogOptions("gear");

  assert.equal(options.ignoreAvailabilityGates, true);
  assert.equal(options.fresh, true);
});

test("each call to importCatalogOptions returns an option set of its own", () => {
  const first = importCatalogOptions("gear");
  first.exclusions.gear.push("world.homebrew-gear");

  const second = importCatalogOptions("gear");

  assert.equal(isSourceEnabled("gear", "world.homebrew-gear", second.exclusions), true);
  assert.equal(isSourceEnabled("gear", "world", second.exclusions), true);
});

test("sourceSettingPackIds normalises comma-separated and array settings", () => {
  assert.deepEqual(sourceSettingPackIds(" pack.one,pack.two ,, "), ["pack.one", "pack.two"]);
  assert.deepEqual(sourceSettingPackIds(["pack.one", " pack.two ", "", null]), ["pack.one", "pack.two"]);
  assert.deepEqual(sourceSettingPackIds(null), []);
});

test("a pack named twice in a source setting is listed once, where it was first named", () => {
  // A *Compendiums setting is a free-text, comma-separated list, so a pack can be typed twice (also
  // with different spacing). Each pack contributes its items once (ruling R36).
  const repeatedInString = sourceSettingPackIds("world.gear, world.armour ,world.gear,world.gear");
  const repeatedInArray = sourceSettingPackIds(["world.armour", "world.gear", " world.armour ", "world.gear"]);

  assert.deepEqual(repeatedInString, ["world.gear", "world.armour"]);
  assert.deepEqual(repeatedInArray, ["world.armour", "world.gear"]);
});

test("a pack named twice is counted and reported missing once", () => {
  const nothingResolves = () => false;

  const missing = missingSourcePackIds("world.gone,world.gone", nothingResolves);
  const status = sourcePackStatus("world.gone, world.gone", nothingResolves);

  assert.deepEqual(missing, ["world.gone"]);
  assert.deepEqual(status.packIds, ["world.gone"]);
  assert.deepEqual(status.missingPackIds, ["world.gone"]);
});

test("missingSourcePackIds returns configured pack ids that do not resolve", () => {
  const present = new Set(["pack.one", "pack.three"]);
  assert.deepEqual(
    missingSourcePackIds("pack.one, pack.two, pack.three", (packId) => present.has(packId)),
    ["pack.two"],
  );
});

test("sourcePackStatus flags empty source settings", () => {
  assert.deepEqual(sourcePackStatus("", () => true), {
    packIds: [],
    noConfiguredCompendiums: true,
    missingPackIds: [],
  });
});

test("sourcePackStatus reports missing ids without treating configured settings as empty", () => {
  const present = new Set(["pack.one"]);
  assert.deepEqual(sourcePackStatus("pack.one, pack.two", (packId) => present.has(packId)), {
    packIds: ["pack.one", "pack.two"],
    noConfiguredCompendiums: false,
    missingPackIds: ["pack.two"],
  });
});

test("setSourceEnabled updates exclusion flags without mutating the input", () => {
  const original = { species: ["pack.old"], gear: ["world"] };
  const disabled = setSourceEnabled(original, "species", "pack.new", false);
  assert.deepEqual(disabled, { species: ["pack.old", "pack.new"], gear: ["world"] });
  assert.deepEqual(original, { species: ["pack.old"], gear: ["world"] });

  const enabled = setSourceEnabled(disabled, "species", "pack.old", true);
  assert.deepEqual(enabled, { species: ["pack.new"], gear: ["world"] });

  const cleaned = setSourceEnabled({ species: ["pack.new"] }, "species", "pack.new", true);
  assert.deepEqual(cleaned, {});
});

test("setSourceEnabled stores world item opt-in explicitly", () => {
  assert.deepEqual(setSourceEnabled({}, "gear", "world", true), { gear: ["enabled:world"] });
  assert.deepEqual(setSourceEnabled({ gear: ["world"] }, "gear", "world", true), { gear: ["enabled:world"] });
  assert.deepEqual(setSourceEnabled({ gear: ["enabled:world"] }, "gear", "world", false), {});
});
