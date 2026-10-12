// Hyperdrive import catalog - rulings R35 and R36
// (docs/superpowers/plans/artifacts/2026-10-11-test-audit/open-decisions.md).
//
// Behavior under test: the catalog the Hyperdrive importer matches an imported character's gear
// against (collectLiveEntries) holds every source the Gear pool has - all configured compendiums
// and the world items - whatever the importing player switched off in their own Content sources
// panel, and it is read fresh for every import, so an item edited between two imports is seen
// edited. A compendium listed twice in a source setting contributes its items once.
//
// Each case builds its own empty world Item compendium and deletes it afterwards, and points the
// Gear pool's setting (itemCompendiums) at it for the duration of the case.
//
// The importing player's Content sources choice lives in a flag on the User document. Writing the
// real flag would modify that User, which the run's leak check reports, so a case answers the one
// flag read the pool loader makes (readExclusions) instead and restores the method afterwards.

import { FLAG_SCOPE, FLAGS } from "../modules/char-creator/constants.js";
import { invalidateSourceCache, loadSource } from "../modules/char-creator/load-source.js";
import { setSourceEnabled } from "../modules/char-creator/source-descriptors.js";
import { collectLiveEntries } from "../modules/importer/hyperdrive/importer-app.js";

/** Reading every pool's packs can take a while in a world with the full OggDude data. */
const CATALOG_TIMEOUT = 120_000;

export const HyperdriveImportCatalogTests = (suite, suiteInstance, Test, chai, harness) => {
  const _suite = suiteInstance.create(suite, "Hyperdrive Import Catalog");
  const { expect } = chai;

  /** Runs `body(pack)` with an empty world Item compendium, which is deleted afterwards. */
  const withGearPack = async (label, body) => {
    const name = harness.fixtures.name(label).toLowerCase();
    const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({ type: "Item", label: name, name });
    try {
      return await body(pack);
    } finally {
      invalidateSourceCache("gear");
      await pack.deleteCompendium();
    }
  };

  const createGear = (pack, label) =>
    Item.implementation.create({ name: harness.fixtures.name(label), type: "gear" }, { pack: pack.collection });

  /** Points the Gear pool at exactly these compendiums; the setting is restored after the case. */
  const configureGearPacks = (...packs) =>
    harness.fixtures.setting("starwarsffg", "itemCompendiums", packs.map((pack) => pack.collection).join(","));

  /**
   * Runs `body` as an importing player whose Content sources panel holds `selection`
   * ({ gear: [...] }, the shape setSourceEnabled stores).
   */
  const withWizardChoice = async (selection, body) => {
    const original = game.user.getFlag;
    game.user.getFlag = function (scope, key) {
      if (scope === FLAG_SCOPE && key === FLAGS.sourceSelection) return foundry.utils.deepClone(selection);
      return original.call(this, scope, key);
    };
    try {
      return await body();
    } finally {
      delete game.user.getFlag;
      invalidateSourceCache("gear");
    }
  };

  /** The entry the import catalog holds for a document, or undefined. */
  const catalogEntry = async (uuid) => (await collectLiveEntries()).find((entry) => entry.ref.uuid === uuid);

  /** The ref the wizard's own Gear pool holds for a document, or undefined. */
  const wizardRef = async (uuid, options) => (await loadSource("gear", options)).find((ref) => ref.uuid === uuid);

  _suite.addTest(new Test("the catalog holds gear from a compendium the importing player switched off in the wizard", async function () {
    this.timeout(CATALOG_TIMEOUT);
    await withGearPack("switched-off", async (pack) => {
      const gear = await createGear(pack, "owned-gear");
      await configureGearPacks(pack);

      await withWizardChoice(setSourceEnabled({}, "gear", pack.collection, false), async () => {
        expect(await wizardRef(gear.uuid), "the wizard's own pool follows the player's choice").to.equal(undefined);

        const entry = await catalogEntry(gear.uuid);

        expect(entry, "the import catalog holds the item").to.not.equal(undefined);
        expect(entry.ref.name).to.equal(gear.name);
        expect(entry.ref.source).to.include({ kind: "compendium", id: pack.collection });
      });
    });
  }));

  _suite.addTest(new Test("the catalog holds a world item although the importing player never opted in to World items", async function () {
    this.timeout(CATALOG_TIMEOUT);
    const worldGear = await harness.fixtures.create("Item", { name: "world-gear", type: "gear" });

    await withWizardChoice({}, async () => {
      expect(await wizardRef(worldGear.uuid), "the wizard's own pool leaves World items off").to.equal(undefined);

      const entry = await catalogEntry(worldGear.uuid);

      expect(entry, "the import catalog holds the item").to.not.equal(undefined);
      expect(entry.ref.name).to.equal(worldGear.name);
      expect(entry.ref.source.kind).to.equal("world");
    });
  }));

  _suite.addTest(new Test("the catalog shows a compendium item as it is after an edit made between two imports", async function () {
    this.timeout(CATALOG_TIMEOUT);
    await withGearPack("edited-pack-item", async (pack) => {
      const gear = await createGear(pack, "before-edit");
      await configureGearPacks(pack);
      const originalName = gear.name;
      const editedName = harness.fixtures.name("after-edit");

      const firstImport = await catalogEntry(gear.uuid);
      await gear.update({ name: editedName });
      const secondImport = await catalogEntry(gear.uuid);

      expect(firstImport.ref.name, "the first import saw the item before the edit").to.equal(originalName);
      expect(secondImport.ref.name, "the second import saw the edit").to.equal(editedName);
      expect(secondImport.ref.snapshot.name).to.equal(editedName);
    });
  }));

  _suite.addTest(new Test("the catalog shows a world item as it is after an edit made between two imports", async function () {
    this.timeout(CATALOG_TIMEOUT);
    const worldGear = await harness.fixtures.create("Item", { name: "world-before-edit", type: "gear" });
    const originalName = worldGear.name;
    const editedName = harness.fixtures.name("world-after-edit");

    const firstImport = await catalogEntry(worldGear.uuid);
    await worldGear.update({ name: editedName });
    const secondImport = await catalogEntry(worldGear.uuid);

    expect(firstImport.ref.name, "the first import saw the item before the edit").to.equal(originalName);
    expect(secondImport.ref.name, "the second import saw the edit").to.equal(editedName);
    expect(secondImport.ref.snapshot.name).to.equal(editedName);
  }));

  _suite.addTest(new Test("an import leaves the Gear pool the wizard has cached as it was", async function () {
    this.timeout(CATALOG_TIMEOUT);
    await withGearPack("wizard-cache", async (pack) => {
      await createGear(pack, "cached-gear");
      await configureGearPacks(pack);

      await withWizardChoice({}, async () => {
        const wizardPoolBefore = await loadSource("gear");
        await collectLiveEntries();
        const wizardPoolAfter = await loadSource("gear");

        // the same array: the wizard's cache entry was neither replaced nor refilled by the import
        expect(wizardPoolAfter).to.equal(wizardPoolBefore);
      });
    });
  }));

  _suite.addTest(new Test("a compendium listed twice in a source setting contributes its items once", async function () {
    await withGearPack("listed-twice", async (pack) => {
      const gear = await createGear(pack, "listed-once");
      await harness.fixtures.setting("starwarsffg", "itemCompendiums", `${pack.collection}, ${pack.collection}`);
      invalidateSourceCache("gear");

      const refs = (await loadSource("gear", { exclusions: {}, ignoreAvailabilityGates: true }))
        .filter((ref) => ref.uuid === gear.uuid);

      expect(refs).to.have.length(1);
    });
  }));
};
