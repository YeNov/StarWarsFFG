import { getActorCreationDefaults, applyCharacteristicDeltas } from "../../actors/actor-ffg.js";
import ItemHelpers from "../../helpers/item-helpers.js";
import { assembleCharacterSource } from "../../char-creator/assemble-character-source.js";
import { assignWizardIdentity } from "../../char-creator/build-item-schema.js";
import { makeBuildDependencies } from "../../char-creator/build-deps.js";
import { loadSource } from "../../char-creator/load-source.js";
import {
  SOURCE_DESCRIPTORS,
  sourceSettingPackIds,
} from "../../char-creator/source-descriptors.js";
import { toItemData } from "../../char-creator/to-item-data.js";
import { parseHyperdrive, HYPERDRIVE_CHARACTERISTICS } from "./parse.js";
import {
  buildImportIndex,
  buildSkillMetadata,
  collectImportEntries,
  normalizeName,
} from "./resolve.js";
import { buildInPlace } from "./in-place.js";
import { hyperdriveToActorData } from "./to-actor.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

function preparedCharacteristics(actor) {
  return Object.fromEntries(HYPERDRIVE_CHARACTERISTICS.map((key) => [
    key,
    { value: Number(actor.system?.characteristics?.[key]?.value ?? 0) },
  ]));
}

function preparedSkills(actor) {
  return Object.fromEntries(Object.entries(actor.system?.skills ?? {}).map(([key, skill]) => [
    key,
    { rank: Number(skill?.rank ?? 0) },
  ]));
}

async function collectLiveEntries() {
  const selectionRefs = [];
  const documentLists = [];
  for (const poolKey of Object.keys(SOURCE_DESCRIPTORS)) {
    try {
      selectionRefs.push(...await loadSource(poolKey, { ignoreAvailabilityGates: true }));
    } catch (error) {
      CONFIG.logger?.warn?.(`Hyperdrive importer could not read configured '${poolKey}' sources: ${error.message}`);
    }
  }
  for (const settingKey of ["talentCompendiums", "signatureAbilityCompendiums"]) {
    const settingValue = game.settings.get("starwarsffg", settingKey);
    for (const packId of sourceSettingPackIds(settingValue)) {
      const pack = game.packs.get(packId);
      if (!pack || (pack.documentName !== "Item" && pack.metadata?.type !== "Item")) continue;
      try {
        documentLists.push(await pack.getDocuments());
      } catch (error) {
        CONFIG.logger?.warn?.(`Hyperdrive importer could not read configured pack '${packId}': ${error.message}`);
      }
    }
  }
  return collectImportEntries({ selectionRefs, docLists: documentLists });
}

function indexSnapshots(entries, type) {
  const index = {};
  for (const entry of entries) {
    if (entry.itemType !== type) continue;
    if (entry.ffgimportid && !index[entry.ffgimportid]) {
      index[entry.ffgimportid] = entry.ref.snapshot;
    }
    const name = normalizeName(entry.ref?.name);
    if (name && !index[`name:${name}`]) {
      index[`name:${name}`] = entry.ref.snapshot;
    }
  }
  return index;
}

async function makeLiveDependencies() {
  const entries = await collectLiveEntries();
  const resolve = buildImportIndex(entries);
  const buildDeps = makeBuildDependencies({
    getActorCreationDefaults,
    applyCharacteristicDeltas,
    materializeTreePurchases: ItemHelpers.materializeTreePurchases,
    toItemData,
  });
  const themeId = game.settings.get("starwarsffg", "skilltheme");
  const { skillMap, skillMeta } = buildSkillMetadata({
    entries,
    temporarySkills: CONFIG.temporary?.skills ?? {},
    alternateSkillLists: CONFIG.FFG.alternateskilllists ?? [],
    themeId,
  });
  const assemble = (args) => assembleCharacterSource({
    creationDefaults: buildDeps.creationDefaults,
    applyCharacteristicDeltas: buildDeps.applyCharacteristicDeltas,
  }, args);
  const preparePreview = async (buildItems) => {
    const { actorData } = assemble({ name: "Hyperdrive Preview", buildItems });
    const actor = new CONFIG.Actor.documentClass(actorData, { temporary: true });
    return {
      characteristics: preparedCharacteristics(actor),
      skills: preparedSkills(actor),
    };
  };
  const prepareFinal = async (actorData) => {
    const actor = new CONFIG.Actor.documentClass(actorData, { temporary: true });
    return {
      characteristics: preparedCharacteristics(actor),
      wounds: Number(actor.system?.stats?.wounds?.max ?? 0),
      strain: Number(actor.system?.stats?.strain?.max ?? 0),
      soak: Number(actor.system?.stats?.soak?.value ?? 0),
    };
  };
  return {
    resolve,
    skillMap,
    skillMeta,
    itemmodifierIndex: indexSnapshots(entries, "itemmodifier"),
    attachmentIndex: indexSnapshots(entries, "itemattachment"),
    toItemData: buildDeps.toItemData,
    buildInPlace,
    preparePreview,
    prepareFinal,
    assemble,
  };
}

async function collisionChoice(name) {
  const escape = foundry.utils.escapeHTML ?? ((value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char])));
  return DialogV2.wait({
    window: { title: "Character already exists" },
    content: `<p>An actor named <strong>${escape(name)}</strong> already exists.</p>`,
    buttons: [
      { action: "override", label: "Override", default: true },
      { action: "copy", label: "Create Copy" },
      { action: "cancel", label: "Cancel" },
    ],
    rejectClose: false,
  });
}

async function persistActor(actorData) {
  const existing = game.actors?.find((actor) => actor.name === actorData.name);
  let action = existing ? await collisionChoice(actorData.name) : "create";
  if (!action || action === "cancel") return null;

  const commitId = foundry.utils.randomID(16);
  await assignWizardIdentity(actorData, { userId: game.user.id, commitId });
  if (action === "copy") {
    actorData.name = `${actorData.name} (Copy)`;
    actorData.prototypeToken = { ...(actorData.prototypeToken ?? {}), name: actorData.name };
    return Actor.create(actorData, { keepId: true });
  }
  if (action === "override") {
    const ids = existing.items.map((item) => item.id);
    if (ids.length) await existing.deleteEmbeddedDocuments("Item", ids);
    await existing.update({
      name: actorData.name,
      img: actorData.img,
      system: actorData.system,
      flags: actorData.flags,
      prototypeToken: actorData.prototypeToken,
    });
    if (actorData.items.length) {
      await existing.createEmbeddedDocuments("Item", actorData.items, { keepId: true });
    }
    return existing;
  }
  return Actor.create(actorData, { keepId: true });
}

export default class HyperdriveImporter extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hyperdrive-importer",
    tag: "form",
    classes: ["starwarsffg", "data-import"],
    position: { width: 620, height: 720 },
    window: {
      title: "Import Hyperdrive Character",
      contentClasses: ["standard-form", "hyperdrive-importer-content"],
    },
    actions: {
      import: HyperdriveImporter._onImport,
      reset: HyperdriveImporter._onReset,
    },
  };

  static PARTS = {
    content: {
      root: true,
      template: "systems/starwarsffg/templates/importer/hyperdrive-importer.html",
      scrollable: [""],
    },
  };

  report = null;
  importedActor = null;
  error = "";
  busy = false;

  async _prepareContext() {
    return {
      report: this.report,
      importedActor: this.importedActor,
      error: this.error,
      busy: this.busy,
    };
  }

  static async _onImport() {
    const input = this.element?.querySelector("input[type='file']");
    const file = input?.files?.[0];
    if (!file) {
      ui.notifications.warn("Choose a Hyperdrive character JSON file first.");
      return;
    }
    this.busy = true;
    this.error = "";
    this.report = null;
    await this.render({ parts: ["content"] });
    try {
      const raw = JSON.parse(await file.text());
      const parsed = parseHyperdrive(raw);
      const deps = await makeLiveDependencies();
      const result = await hyperdriveToActorData(parsed, deps);
      const actor = await persistActor(result.actorData);
      if (!actor) {
        this.error = "Import cancelled.";
      } else {
        this.report = result.report;
        this.importedActor = { id: actor.id, name: actor.name };
        ui.notifications.info(`Imported Hyperdrive character '${actor.name}'.`);
      }
    } catch (error) {
      CONFIG.logger?.error?.("Hyperdrive character import failed", error);
      this.error = error?.message ?? String(error);
      ui.notifications.error(`Hyperdrive import failed: ${this.error}`);
    } finally {
      this.busy = false;
      await this.render({ parts: ["content"] });
    }
  }

  static async _onReset() {
    this.report = null;
    this.importedActor = null;
    this.error = "";
    await this.render({ parts: ["content"] });
  }
}

export { collectLiveEntries, makeLiveDependencies, persistActor };
