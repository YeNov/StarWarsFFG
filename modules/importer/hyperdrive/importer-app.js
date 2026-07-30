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
  bestFindingSuggestion,
  buildImportIndex,
  buildSnapshotIndex,
  buildSkillMetadata,
  collectImportEntries,
  resolveFindingOverride,
} from "./resolve.js";
import { buildInPlace } from "./in-place.js";
import { hyperdriveToActorData } from "./to-actor.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

function compendiumIdFromUuid(uuid) {
  return String(uuid ?? "").match(/^Compendium\.(.+?)\.Item\./)?.[1] ?? null;
}

function sourceForRef(ref, document = null) {
  const uuid = document?.uuid ?? ref?.uuid ?? "";
  const documentPack = document?.pack;
  const packId = (typeof documentPack === "string" ? documentPack : documentPack?.collection)
    ?? compendiumIdFromUuid(uuid);
  if (packId) {
    const pack = game.packs.get(packId);
    return {
      kind: "compendium",
      id: packId,
      label: pack?.metadata?.label ?? pack?.title ?? packId,
    };
  }
  if (document?.parent?.name) {
    return {
      kind: "embedded",
      id: document.parent.uuid,
      label: `Actor: ${document.parent.name}`,
    };
  }
  if (String(uuid).startsWith("Item.") || document?.documentName === "Item") {
    return { kind: "world", id: "world", label: "World Items" };
  }
  return { kind: "other", id: uuid, label: "Other source" };
}

function decorateRefSource(ref, document = null) {
  return {
    ...ref,
    source: ref?.source ?? sourceForRef(ref, document),
  };
}

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
  return collectImportEntries({ selectionRefs, docLists: documentLists })
    .map((entry) => ({
      ...entry,
      ref: decorateRefSource(entry.ref),
    }));
}

async function collectSuggestionEntries() {
  const documentLists = [];
  for (const pack of game.packs) {
    if (pack.documentName !== "Item" && pack.metadata?.type !== "Item") continue;
    try {
      documentLists.push(await pack.getDocuments());
    } catch (error) {
      CONFIG.logger?.warn?.(`Hyperdrive importer could not search pack '${pack.collection}': ${error.message}`);
    }
  }
  return collectImportEntries({
    docLists: documentLists,
    worldItems: game.items ?? [],
  }).map((entry) => ({
    ...entry,
    ref: decorateRefSource(entry.ref),
  }));
}

async function makeLiveDependencies({ overrides = new Map() } = {}) {
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
    entries,
    resolveFinding: (kind, entry, options) =>
      resolveFindingOverride(overrides, kind, entry, options),
    skillMap,
    skillMeta,
    itemmodifierIndex: buildSnapshotIndex(entries, "itemmodifier"),
    attachmentIndex: buildSnapshotIndex(entries, "itemattachment"),
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
      clearResolution: HyperdriveImporter._onClearResolution,
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
  pending = null;
  findings = [];
  resolutions = new Map();

  async _prepareContext() {
    return {
      report: this.report,
      importedActor: this.importedActor,
      error: this.error,
      busy: this.busy,
      pending: Boolean(this.pending),
      pendingFileName: this.pending?.fileName,
      findings: this.findings.map((finding) => ({
        ...finding,
        resolution: this.resolutions.get(finding.slotId) ?? null,
      })),
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (!this.element?.querySelector(".hyperdrive-resolution-drop")) return;
    const dragDrop = new foundry.applications.ux.DragDrop({
      dropSelector: ".hyperdrive-resolution-drop",
      permissions: { drop: () => true },
      callbacks: { drop: this._onDropResolution.bind(this) },
    });
    dragDrop.bind(this.element);
  }

  _resolutionOverrides() {
    const overrides = new Map();
    for (const finding of this.findings) {
      const ref = this.resolutions.get(finding.slotId);
      if (!ref) continue;
      for (const alias of finding.aliases) overrides.set(alias, ref);
    }
    return overrides;
  }

  async _onDropResolution(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return false;
    }
    if (data?.type !== "Item") {
      ui.notifications.warn("Only Items can resolve Hyperdrive findings.");
      return false;
    }
    let document;
    try {
      document = await Item.implementation.fromDropData(data);
    } catch {
      document = null;
    }
    if (!document) {
      ui.notifications.warn("The dropped Item could not be loaded.");
      return false;
    }
    const slot = event.target?.closest?.("[data-finding-id]")
      ?? event.currentTarget?.closest?.("[data-finding-id]");
    const slotId = slot?.dataset?.findingId;
    if (!slotId) return false;
    const snapshot = document.toObject();
    this.resolutions.set(slotId, {
      uuid: document.uuid,
      name: document.name,
      type: document.type,
      img: document.img,
      snapshot,
      source: sourceForRef(null, document),
    });
    await this.render({ parts: ["content"] });
    return true;
  }

  static async _onImport() {
    let parsed = this.pending?.parsed;
    let fileName = this.pending?.fileName;
    let file = null;
    if (!parsed) {
      const input = this.element?.querySelector("input[type='file']");
      file = input?.files?.[0];
      if (!file) {
        ui.notifications.warn("Choose a Hyperdrive character JSON file first.");
        return;
      }
      fileName = file.name;
    }
    this.busy = true;
    this.error = "";
    this.report = null;
    await this.render({ parts: ["content"] });
    try {
      if (!parsed) parsed = parseHyperdrive(JSON.parse(await file.text()));
      const reviewing = Boolean(this.pending);
      const deps = await makeLiveDependencies({
        overrides: reviewing ? this._resolutionOverrides() : new Map(),
      });
      const result = await hyperdriveToActorData(parsed, deps);
      if (!reviewing && result.report.findings.length) {
        this.pending = { parsed, fileName };
        this.findings = result.report.findings.map((finding, index) => ({
          ...finding,
          slotId: `finding-${index}`,
        }));
        this.resolutions.clear();
        const needsBroadSearch = this.findings.some((finding) => !finding.candidateRefs.length);
        const suggestionEntries = needsBroadSearch ? await collectSuggestionEntries() : [];
        for (const finding of this.findings) {
          const suggestion = bestFindingSuggestion(finding, suggestionEntries);
          if (suggestion) {
            this.resolutions.set(finding.slotId, {
              ...decorateRefSource(suggestion),
              suggested: true,
            });
          }
        }
        ui.notifications.info("Review the unresolved Hyperdrive findings, then import again.");
        return;
      }
      const actor = await persistActor(result.actorData);
      if (!actor) {
        this.error = "Import cancelled.";
      } else {
        this.report = result.report;
        this.importedActor = { id: actor.id, name: actor.name };
        this.pending = null;
        this.findings = [];
        this.resolutions.clear();
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
    this.pending = null;
    this.findings = [];
    this.resolutions.clear();
    await this.render({ parts: ["content"] });
  }

  static async _onClearResolution(_event, target) {
    this.resolutions.delete(target?.dataset?.findingId);
    await this.render({ parts: ["content"] });
  }
}

export {
  collectLiveEntries,
  collectSuggestionEntries,
  makeLiveDependencies,
  persistActor,
};
