/**
 * Read-only conformance reporter for the template.json → System Data Model
 * migration.
 *
 * Walks every document across the four "recursion targets" the migration plan
 * enumerates — world collections, actor-embedded items, unlinked-token
 * `ActorDelta`s on scenes, and compendium packs — and reports any leaf path a
 * sub-type's DataModel drops or changes relative to the raw stored `_source`.
 * It NEVER writes anything, so it is safe to run against a live world (locked
 * packs included — read-only).
 *
 * ## Why this is written the way it is
 *
 * The original version compared `doc._source.system` against
 * `doc.system.toObject()`. **On a build where the models are registered that is
 * a tautology**: construction already cleaned `_source`, and `toObject(true)`
 * returns `deepClone(this._source)` — an object against its own clone. It could
 * never report a drop, and its "CLEAN across 17,925 documents" run was
 * meaningless (the OggDude packs it scanned carry `rarity.isrestricted` on
 * essentially every weapon, which a real diff flags thousands of times).
 *
 * So the check now builds the model **class** from the raw source itself
 * (`new ModelClass(deepClone(raw))`) via ./models-registry.js — not
 * `CONFIG.*.dataModels`, which is empty under a diagnostic boot — and diffs the
 * result. That reports a real drop even when the models are live.
 *
 * ## Caveats worth knowing before trusting a result
 *
 * - A **drop is not data loss.** The Foundry server never runs the system's
 *   client-side esmodules, so it resolves no model, never prunes, and keeps
 *   writing the full record. Dropped paths are invisible to sheets and code
 *   (`SchemaField.initialize` walks declared fields only) but remain on disk.
 * - This reads `_source` **in the client**, which on a registered build is
 *   itself already cleaned. For ground truth about what the database holds,
 *   read the LevelDB offline — see
 *   docs/superpowers/plans/artifacts/2026-07-14-datamodel-evidence/.
 * - Some drops are **intended**: derived props that leak into stored data
 *   (`renderedDesc`, `hardpoints.current`, `adjusteditemmodifier`,
 *   `collection.*`) and dead importer output (`skill.useBrawn`). Judge findings
 *   against the classification in the plan, not as automatic defects.
 *
 * Run from the console:
 *   await game.ffg.reportDataModelConformance();
 *   await game.ffg.reportDataModelConformance({ compendiums: false }); // skip packs (faster)
 *
 * Plan: docs/superpowers/plans/2026-07-14-datamodel-undeclared-paths-fix.md
 */

import { modelFor } from "./models-registry.js";

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

/**
 * Diff a fully-realized document (world/embedded/compendium) by constructing its
 * model class from the raw source.
 *
 * Do NOT "simplify" this to `doc.system.toObject()` — see the tautology note in
 * the module header. The probe must be built from `_source` independently of
 * whether `CONFIG.*.dataModels` is populated.
 */
function checkDocument(doc) {
  const ModelClass = modelFor(doc.documentName, doc.type);
  const raw = doc._source?.system;
  if (!ModelClass || !raw) return null;
  try {
    const probe = new ModelClass(foundry.utils.deepClone(raw), { parent: doc });
    return classifyDiff(raw, probe.toObject());
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
  const ModelClass = modelFor("Actor", type);
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
