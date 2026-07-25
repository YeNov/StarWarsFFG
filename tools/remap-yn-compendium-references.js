/**
 * Foundry script macro: repair stale world-compendium references in YN content.
 *
 * Paste this entire file into a Script Macro and run it as a GM.
 * Leave DRY_RUN true for the first run. Inspect:
 *   globalThis.YN_REFERENCE_REMAP_REPORT
 * and the grouped console output. Set DRY_RUN to false only after review.
 *
 * The macro never guesses between multiple candidates. It applies only references
 * resolved to exactly one current YN document and skips ambiguous/unresolved data.
 */
(async () => {
  const DRY_RUN = true;

  const MODULE_ID = "yehors-sw-ffg-shared-data";
  const SCAN_PACK_IDS = [
    `${MODULE_ID}.yn-specializations`,
    `${MODULE_ID}.yn-species`,
    `${MODULE_ID}.yn-careers`,
    `${MODULE_ID}.yn-talents`,
  ];
  const TARGET_PACKS_BY_TYPE = {
    specialization: [
      `${MODULE_ID}.yn-specializations`,
      `${MODULE_ID}.yn-specializations-respec`,
    ],
    talent: [
      `${MODULE_ID}.yn-talents`,
      `${MODULE_ID}.yn-talents-respec`,
    ],
    career: [`${MODULE_ID}.yn-careers`],
    species: [`${MODULE_ID}.yn-species`],
    signatureability: [`${MODULE_ID}.yn-signature-abilities`],
  };
  const COMPENDIUM_ITEM_UUID = /^Compendium\.([^.]+\.[^.]+)\.Item\.([^.]+)$/;
  const TARGET_PACK_BY_SOURCE_PACK = {
    oggdudetalents: `${MODULE_ID}.yn-talents`,
    "oggdudetalents-respec": `${MODULE_ID}.yn-talents-respec`,
  };

  if (!game.user.isGM) {
    ui.notifications.error("YN reference repair must be run by a GM.");
    return;
  }

  const normalize = (value) => String(value ?? "").trim().toLowerCase();
  const indexKey = (type, value) => {
    const normalizedValue = normalize(value);
    return normalizedValue ? `${type}\0${normalizedValue}` : "";
  };
  const parseItemUuid = (uuid) => {
    const match = String(uuid ?? "").match(COMPENDIUM_ITEM_UUID);
    return match ? { collection: match[1], id: match[2] } : null;
  };
  const isWrongWorldCollection = (collection) => {
    const namespace = String(collection ?? "").split(".")[0];
    if (!namespace || namespace === MODULE_ID) return false;
    if (namespace === "world") return true;
    return !game.packs.has(collection);
  };
  const isWrongWorldUuid = (uuid) => {
    const parsed = parseItemUuid(uuid);
    return parsed ? isWrongWorldCollection(parsed.collection) : false;
  };
  const targetCollectionForSource = (sourceCollection) => {
    const sourcePack = normalize(sourceCollection).split(".").at(-1);
    return TARGET_PACK_BY_SOURCE_PACK[sourcePack] ?? "";
  };
  const uniqueRecords = (records) => {
    const byUuid = new Map();
    for (const record of records ?? []) byUuid.set(record.uuid, record);
    return [...byUuid.values()];
  };
  const addIndex = (index, key, record) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  };

  const allRequiredPackIds = new Set([
    ...SCAN_PACK_IDS,
    ...Object.values(TARGET_PACKS_BY_TYPE).flat(),
  ]);
  const missingPacks = [...allRequiredPackIds].filter((packId) => !game.packs.get(packId));
  if (missingPacks.length) {
    console.error("[YN reference repair] Missing required packs:", missingPacks);
    ui.notifications.error(`YN reference repair stopped: ${missingPacks.length} required pack(s) are missing.`);
    return;
  }

  const documentsByPack = new Map();
  for (const packId of allRequiredPackIds) {
    const pack = game.packs.get(packId);
    documentsByPack.set(packId, await pack.getDocuments());
  }

  const targetRecords = [];
  for (const [expectedType, packIds] of Object.entries(TARGET_PACKS_BY_TYPE)) {
    for (const packId of packIds) {
      for (const document of documentsByPack.get(packId)) {
        if (document.type !== expectedType) continue;
        const source = document.toObject();
        const origin = parseItemUuid(source._stats?.compendiumSource);
        targetRecords.push({
          document,
          id: document.id,
          uuid: document.uuid,
          name: document.name,
          type: document.type,
          collection: document.pack ?? packId,
          importId: source.flags?.starwarsffg?.ffgimportid ?? "",
          originId: origin?.id ?? "",
        });
      }
    }
  }

  const byCurrentId = new Map();
  const byOriginId = new Map();
  const byImportId = new Map();
  const byName = new Map();
  for (const record of targetRecords) {
    addIndex(byCurrentId, indexKey(record.type, record.id), record);
    addIndex(byOriginId, indexKey(record.type, record.originId), record);
    addIndex(byImportId, indexKey(record.type, record.importId), record);
    addIndex(byName, indexKey(record.type, record.name), record);
  }

  function resolveReference({ expectedType, oldId, name, importId, sourceCollection }) {
    const targetCollection = targetCollectionForSource(sourceCollection);
    const lookups = [
      ["current-id", byCurrentId.get(indexKey(expectedType, oldId))],
      ["origin-id", byOriginId.get(indexKey(expectedType, oldId))],
      ["import-id", byImportId.get(indexKey(expectedType, importId))],
      ["unique-name", byName.get(indexKey(expectedType, name))],
    ];

    for (const [strategy, rawCandidates] of lookups) {
      let candidates = uniqueRecords(rawCandidates);
      if (!candidates.length) continue;
      if (targetCollection) {
        candidates = candidates.filter((candidate) => candidate.collection === targetCollection);
        if (!candidates.length) continue;
      }

      if (candidates.length > 1 && name) {
        const sameName = candidates.filter((candidate) => normalize(candidate.name) === normalize(name));
        if (sameName.length) candidates = sameName;
      }
      if (candidates.length > 1 && importId) {
        const sameImportId = candidates.filter(
          (candidate) => normalize(candidate.importId) === normalize(importId),
        );
        if (sameImportId.length) candidates = sameImportId;
      }

      if (candidates.length === 1) {
        const resolutionStrategy = targetCollection ? `${strategy}+source-pack` : strategy;
        return { status: "resolved", strategy: resolutionStrategy, target: candidates[0] };
      }
      return { status: "ambiguous", strategy, candidates };
    }

    return { status: "unresolved", candidates: [] };
  }

  const report = {
    mode: DRY_RUN ? "DRY_RUN" : "APPLY",
    generatedAt: new Date().toISOString(),
    scannedPacks: [...SCAN_PACK_IDS],
    resolved: [],
    ambiguous: [],
    unresolved: [],
    unhandled: [],
    provenanceOnly: [],
    currentTalentTreeReferences: 0,
    appliedDocuments: [],
    failedDocuments: [],
  };
  const plans = new Map();
  const handledPaths = new Map();
  const destinationClaims = new Set();

  const markHandled = (document, path) => {
    if (!handledPaths.has(document.uuid)) handledPaths.set(document.uuid, new Set());
    handledPaths.get(document.uuid).add(path);
  };
  const isHandled = (document, path) => handledPaths.get(document.uuid)?.has(path);
  const queueChange = (document, path, value) => {
    if (!plans.has(document.uuid)) {
      plans.set(document.uuid, {
        document,
        packId: document.pack,
        changes: {},
        referenceCount: 0,
      });
    }
    plans.get(document.uuid).changes[path] = value;
  };
  const noteResolution = (document, path, oldValue, result, extra = {}) => {
    const common = {
      pack: document.pack,
      document: document.name,
      documentUuid: document.uuid,
      path,
      oldValue,
      ...extra,
    };
    if (result.status === "resolved") {
      report.resolved.push({
        ...common,
        strategy: result.strategy,
        replacement: result.target.uuid,
        replacementName: result.target.name,
      });
      return;
    }
    if (result.status === "ambiguous") {
      report.ambiguous.push({
        ...common,
        strategy: result.strategy,
        candidates: result.candidates.map((candidate) => ({
          name: candidate.name,
          uuid: candidate.uuid,
        })),
      });
      return;
    }
    report.unresolved.push(common);
  };

  function repairReferenceMap(document, source, mapPath, expectedType) {
    const entries = foundry.utils.getProperty(source, mapPath) ?? {};
    for (const [oldKey, entry] of Object.entries(entries)) {
      const sourcePath = `${mapPath}.${oldKey}.source`;
      if (!isWrongWorldUuid(entry?.source)) continue;
      markHandled(document, sourcePath);

      const parsed = parseItemUuid(entry.source);
      const result = resolveReference({
        expectedType,
        oldId: parsed?.id ?? entry.id ?? oldKey,
        name: entry.name,
        importId: entry.flags?.starwarsffg?.ffgimportid,
        sourceCollection: parsed?.collection,
      });

      if (result.status !== "resolved") {
        noteResolution(document, sourcePath, entry.source, result, { expectedType });
        continue;
      }

      const destinationPath = `${mapPath}.${result.target.id}`;
      const claim = `${document.uuid}\0${destinationPath}`;
      const existing = entries[result.target.id];
      const existingSource = parseItemUuid(existing?.source);
      const existingIsTarget = existingSource?.collection === result.target.collection
        && existingSource.id === result.target.id;
      if (oldKey !== result.target.id && existingIsTarget) {
        queueChange(document, `${mapPath}.-=${oldKey}`, null);
        plans.get(document.uuid).referenceCount++;
        noteResolution(document, sourcePath, entry.source, {
          ...result,
          strategy: "existing-current-entry",
        }, { expectedType });
        continue;
      }
      if (oldKey !== result.target.id && (existing || destinationClaims.has(claim))) {
        noteResolution(document, sourcePath, entry.source, {
          status: "ambiguous",
          strategy: "destination-collision",
          candidates: [result.target],
        }, { expectedType });
        continue;
      }
      destinationClaims.add(claim);

      const replacement = foundry.utils.deepClone(entry);
      replacement.source = result.target.uuid;
      replacement.id = result.target.id;
      if (oldKey === result.target.id) {
        queueChange(document, sourcePath, result.target.uuid);
        queueChange(document, `${mapPath}.${oldKey}.id`, result.target.id);
      } else {
        queueChange(document, destinationPath, replacement);
        queueChange(document, `${mapPath}.-=${oldKey}`, null);
      }
      plans.get(document.uuid).referenceCount++;
      noteResolution(document, sourcePath, entry.source, result, { expectedType });
    }
  }

  function repairSpecializationTalentSlots(document, source, mapPath) {
    const slots = foundry.utils.getProperty(source, mapPath) ?? {};
    for (const [slotKey, slot] of Object.entries(slots)) {
      const packPath = `${mapPath}.${slotKey}.pack`;
      const itemIdPath = `${mapPath}.${slotKey}.itemId`;
      const sourcePath = `${mapPath}.${slotKey}.source`;
      const collection = String(slot?.pack ?? "").trim();
      const stalePack = collection && isWrongWorldCollection(collection);
      const staleSource = isWrongWorldUuid(slot?.source);
      if (!stalePack && !staleSource) continue;

      if (stalePack) markHandled(document, packPath);
      if (staleSource) markHandled(document, sourcePath);
      const parsedSource = parseItemUuid(slot?.source);
      const oldId = slot?.itemId ?? parsedSource?.id;
      const sourceCollection = staleSource ? parsedSource?.collection : collection;
      const oldValue = staleSource
        ? slot.source
        : `Compendium.${collection}.Item.${oldId}`;
      const result = resolveReference({
        expectedType: "talent",
        oldId,
        name: slot?.name,
        importId: slot?.flags?.starwarsffg?.ffgimportid,
        sourceCollection,
      });

      if (result.status === "resolved") {
        queueChange(document, packPath, result.target.collection);
        queueChange(document, itemIdPath, result.target.id);
        if (staleSource) queueChange(document, sourcePath, result.target.uuid);
        plans.get(document.uuid).referenceCount++;
      }
      noteResolution(document, staleSource ? sourcePath : packPath, oldValue, result, {
        expectedType: "talent",
      });
    }
  }

  function repairTalentTreeIds(document, source) {
    const trees = source.system?.trees;
    if (!Array.isArray(trees)) return;
    const replacements = [...trees];
    let changed = false;

    trees.forEach((treeId, index) => {
      const current = uniqueRecords(byCurrentId.get(indexKey("specialization", treeId)));
      if (current.length === 1) {
        report.currentTalentTreeReferences++;
        return;
      }

      const path = `system.trees.${index}`;
      const result = resolveReference({ expectedType: "specialization", oldId: treeId });
      if (result.status === "resolved") {
        replacements[index] = result.target.id;
        changed = true;
        plans.get(document.uuid) ?? plans.set(document.uuid, {
          document,
          packId: document.pack,
          changes: {},
          referenceCount: 0,
        });
        plans.get(document.uuid).referenceCount++;
      }
      noteResolution(document, path, treeId, result, {
        expectedType: "specialization",
        bareDocumentId: true,
      });
    });

    if (changed) queueChange(document, "system.trees", replacements);
  }

  function walk(value, path, visit) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}.${index}`, visit));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      visit(value, key, entry, childPath);
      walk(entry, childPath, visit);
    }
  }

  function auditUnhandledReferences(document, source) {
    walk(source, "", (parent, key, value, path) => {
      const staleUuid = typeof value === "string" && isWrongWorldUuid(value);
      const stalePack = key === "pack"
        && typeof value === "string"
        && isWrongWorldCollection(value);
      if (!staleUuid && !stalePack) return;

      if (path === "_stats.compendiumSource") {
        report.provenanceOnly.push({
          pack: document.pack,
          document: document.name,
          documentUuid: document.uuid,
          path,
          value,
          note: "Foundry provenance metadata; not a live document reference and not rewritten.",
        });
        return;
      }
      if (isHandled(document, path)) return;
      report.unhandled.push({
        pack: document.pack,
        document: document.name,
        documentUuid: document.uuid,
        path,
        value,
        siblingName: parent?.name ?? null,
      });
    });
  }

  for (const packId of SCAN_PACK_IDS) {
    for (const document of documentsByPack.get(packId)) {
      const source = document.toObject();
      if (packId.endsWith(".yn-careers")) {
        repairReferenceMap(document, source, "system.specializations", "specialization");
        repairReferenceMap(document, source, "system.signatureabilities", "signatureability");
      } else if (packId.endsWith(".yn-species")) {
        repairReferenceMap(document, source, "system.talents", "talent");
      } else if (packId.endsWith(".yn-specializations")) {
        repairSpecializationTalentSlots(document, source, "system.talents");
        repairSpecializationTalentSlots(document, source, "system.collection");
      } else if (packId.endsWith(".yn-talents")) {
        repairTalentTreeIds(document, source);
      }
      auditUnhandledReferences(document, source);
    }
  }

  const planEntries = [...plans.values()].filter((plan) => Object.keys(plan.changes).length);
  report.plannedDocuments = planEntries.map((plan) => ({
    pack: plan.packId,
    document: plan.document.name,
    documentUuid: plan.document.uuid,
    references: plan.referenceCount,
    changedPaths: Object.keys(plan.changes),
  }));

  globalThis.YN_REFERENCE_REMAP_REPORT = report;
  console.group(`[YN reference repair] ${report.mode}`);
  console.table([{
    mode: report.mode,
    scannedPacks: report.scannedPacks.length,
    plannedDocuments: report.plannedDocuments.length,
    resolvedReferences: report.resolved.length,
    ambiguousReferences: report.ambiguous.length,
    unresolvedReferences: report.unresolved.length,
    unhandledReferences: report.unhandled.length,
    provenanceOnly: report.provenanceOnly.length,
    currentTalentTreeReferences: report.currentTalentTreeReferences,
  }]);
  console.log("Full report:", report);
  console.log("Planned document updates:", report.plannedDocuments);
  if (report.ambiguous.length) console.warn("Ambiguous references (never written):", report.ambiguous);
  if (report.unresolved.length) console.warn("Unresolved references (never written):", report.unresolved);
  if (report.unhandled.length) console.warn("Unhandled stale shapes (never written):", report.unhandled);
  console.log("Provenance metadata (reported, never rewritten):", report.provenanceOnly);

  if (DRY_RUN) {
    console.info("DRY_RUN is true. No compendium documents were changed.");
    console.groupEnd();
    ui.notifications.info(`YN dry run complete: ${report.resolved.length} reference(s) can be repaired.`);
    return report;
  }

  const touchedPackIds = [...new Set(planEntries.map((plan) => plan.packId))];
  const lockState = new Map();
  try {
    for (const packId of touchedPackIds) {
      const pack = game.packs.get(packId);
      lockState.set(packId, Boolean(pack.locked));
      if (pack.locked) await pack.configure({ locked: false });
    }

    for (const plan of planEntries) {
      try {
        await plan.document.update(plan.changes);
        report.appliedDocuments.push({
          pack: plan.packId,
          document: plan.document.name,
          documentUuid: plan.document.uuid,
          references: plan.referenceCount,
        });
      } catch (error) {
        report.failedDocuments.push({
          pack: plan.packId,
          document: plan.document.name,
          documentUuid: plan.document.uuid,
          error: error.message,
        });
        console.error(`[YN reference repair] Failed to update ${plan.document.uuid}`, error);
      }
    }
  } finally {
    for (const [packId, wasLocked] of lockState) {
      if (wasLocked) await game.packs.get(packId).configure({ locked: true });
    }
  }

  console.table({
    appliedDocuments: report.appliedDocuments.length,
    failedDocuments: report.failedDocuments.length,
    skippedAmbiguous: report.ambiguous.length,
    skippedUnresolved: report.unresolved.length,
    skippedUnhandled: report.unhandled.length,
  });
  console.log("Applied documents:", report.appliedDocuments);
  if (report.failedDocuments.length) console.error("Failed documents:", report.failedDocuments);
  console.groupEnd();

  if (report.failedDocuments.length) {
    ui.notifications.warn(`YN repair completed with ${report.failedDocuments.length} failed document update(s).`);
  } else {
    ui.notifications.info(`YN repair updated ${report.appliedDocuments.length} document(s).`);
  }
  return report;
})();
