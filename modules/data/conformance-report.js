/**
 * Read-only conformance reporter for the template.json → System Data Model
 * migration.
 *
 * Walks every document across the four "recursion targets" the migration plan
 * enumerates — world collections, actor-embedded items, unlinked-token
 * `ActorDelta`s on scenes, and compendium packs — runs each through its
 * registered DataModel, and reports any leaf path that would be **dropped** or
 * **changed** relative to the stored `_source`. It NEVER writes anything, so it
 * is safe to run against a live world (locked packs included — read-only).
 *
 * Because this system's DataModels reproduce template.json's exact shape, a
 * clean run (no drops/changes, no invalid documents) means every stored
 * document already conforms and the migration is a data non-event for that
 * world. Any finding is a place a human should look before trusting the upgrade.
 *
 * Run from the console:
 *   await game.ffg.reportDataModelConformance();
 *   await game.ffg.reportDataModelConformance({ compendiums: false }); // skip packs (faster)
 *
 * Plan: docs/superpowers/plans/2026-07-04-template-json-to-datamodel-migration.md
 */

// V14 renamed foundry.utils.objectsEqual → equals; prefer the new name so V14
// doesn't log a deprecation, fall back on V13.
const deepEqual = (a, b) => (foundry.utils.equals ?? foundry.utils.objectsEqual)(a, b);

/**
 * Compare a document's stored source against what its schema produces.
 * Version-independent: flattens both sides and compares leaf-path sets directly
 * (do NOT rely on diffObject/deletionKeys to surface drops — see the plan).
 * `flattenObject` treats arrays as opaque values, so array fields
 * (itemattachment/itemmodifier) compare whole-array — still safe, just coarser.
 *
 * @param {object} oldData  raw `_source.system`
 * @param {object} newData  schema output (`system.toObject()` or a probe's)
 * @param {{ignoreAdded?: boolean}} [opts]  deltas backfill to a full actor, so
 *   freshly-defaulted keys are expected there — ignore "added" for those.
 */
function classifyDiff(oldData, newData, { ignoreAdded = false } = {}) {
  const flatOld = foundry.utils.flattenObject(oldData ?? {});
  const flatNew = foundry.utils.flattenObject(newData ?? {});
  const dropped = [];
  const changed = [];
  const added = [];
  for (const key of Object.keys(flatOld)) {
    if (!(key in flatNew)) dropped.push(key);
    else if (!deepEqual(flatOld[key], flatNew[key])) changed.push(key);
  }
  if (!ignoreAdded) {
    for (const key of Object.keys(flatNew)) if (!(key in flatOld)) added.push(key);
  }
  return { dropped, changed, added };
}

/** Diff a fully-realized document (world/embedded/compendium) via its live model. */
function checkDocument(doc) {
  try {
    return classifyDiff(doc._source.system, doc.system.toObject());
  } catch (err) {
    return { constructError: String(err?.message ?? err) };
  }
}

/**
 * Diff an unlinked token's sparse `ActorDelta`. The delta stores only overridden
 * paths, so we construct the registered model from that sparse source and only
 * assert none of its override paths are dropped/changed — the model backfills a
 * full actor, so "added" keys are expected and ignored (never materialize a
 * delta; that would inflate it into a full override — see the plan).
 */
function checkDelta(delta, type) {
  const ModelClass = CONFIG.Actor.dataModels[type];
  const oldData = foundry.utils.deepClone(delta._source?.system ?? {});
  if (!ModelClass || foundry.utils.isEmpty(oldData)) return null; // no overrides → nothing to check
  let probe;
  try {
    probe = new ModelClass(foundry.utils.deepClone(oldData), { parent: delta });
  } catch (err) {
    return { constructError: String(err?.message ?? err) };
  }
  return classifyDiff(oldData, probe.toObject(), { ignoreAdded: true });
}

/**
 * Run the full conformance report.
 * @param {{compendiums?: boolean}} [opts] set `compendiums: false` to skip packs.
 * @returns {Promise<{findings: object[], invalid: object}>}
 */
export async function reportDataModelConformance({ compendiums = true } = {}) {
  const findings = [];
  let scanned = 0;

  const record = (scope, doc, diff) => {
    scanned += 1;
    if (!diff) return;
    if (diff.constructError) {
      findings.push({ scope, name: doc.name, type: doc.type, error: diff.constructError });
      return;
    }
    if (diff.dropped.length || diff.changed.length) {
      findings.push({
        scope,
        name: doc.name,
        type: doc.type,
        uuid: doc.uuid,
        dropped: diff.dropped,
        changed: diff.changed,
      });
    }
  };

  // 1 + 2. World actors (+ embedded items) and world items.
  for (const actor of game.actors) {
    record("world-actor", actor, checkDocument(actor));
    for (const item of actor.items) record("world-actor-item", item, checkDocument(item));
  }
  for (const item of game.items) record("world-item", item, checkDocument(item));

  // 3. Unlinked-token ActorDeltas on scenes (+ their embedded items).
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.delta) continue;
      const type = token.actor?.type ?? token.baseActor?.type ?? token.delta.type;
      record("token-delta", token.delta, checkDelta(token.delta, type));
      for (const item of token.delta.items ?? []) record("token-delta-item", item, checkDocument(item));
    }
  }

  // 4. Compendium packs (Actor/Item, plus embedded items on compendium actors).
  if (compendiums) {
    for (const pack of game.packs) {
      if (!["Actor", "Item"].includes(pack.documentName)) continue;
      let docs;
      try {
        docs = await pack.getDocuments();
      } catch (err) {
        findings.push({ scope: `pack:${pack.collection}`, error: `getDocuments failed: ${err?.message ?? err}` });
        continue;
      }
      for (const doc of docs) {
        record(`pack:${pack.collection}`, doc, checkDocument(doc));
        if (pack.documentName === "Actor") {
          for (const item of doc.items) record(`pack-item:${pack.collection}`, item, checkDocument(item));
        }
      }
    }
  }

  const invalid = {
    actors: [...game.actors.invalidDocumentIds],
    items: [...game.items.invalidDocumentIds],
  };

  const clean = findings.length === 0 && invalid.actors.length === 0 && invalid.items.length === 0;
  console.log(`%c[DataModel conformance] scanned ${scanned} documents — ${clean ? "CLEAN ✓" : `${findings.length} finding(s)`}`,
    `font-weight:bold;color:${clean ? "#3fb950" : "#f85149"}`);
  console.log("Invalid document ids:", invalid);
  if (findings.length) {
    console.table(findings.map((f) => ({
      scope: f.scope,
      name: f.name ?? "",
      type: f.type ?? "",
      dropped: (f.dropped ?? []).join(", "),
      changed: (f.changed ?? []).join(", "),
      error: f.error ?? "",
    })));
    console.log("Full findings (with uuids):", findings);
  }
  return { findings, invalid, scanned };
}
