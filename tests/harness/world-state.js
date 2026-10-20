/**
 * Leak checks: the state a test run must leave as it found it.
 *
 * captureWorld() takes a JSON-serialisable snapshot, so the Playwright fixtures can take one
 * through page.evaluate as well:
 *   documents  every world document and, recursively, every document embedded in one (items and
 *              effects on actors, tokens on scenes, pages in journals, ...), keyed by UUID, with
 *              the modification time of the types that record one; and every entry of every
 *              world compendium pack;
 *   packs      the world compendium packs;
 *   settings   the world-stored settings (world and user scope), by raw value.
 * diffWorld(before, after) lists every difference as a leak.
 *
 * Open windows are state of one page, not of the world: the functional runner checks them with
 * captureWindows() and findWindowLeaks().
 */

import { FIXTURE_NAME_ROOT } from "./fixtures.js";

const settingId = (setting) => (setting.user ? `${setting.key} (user ${setting.user})` : setting.key);

/** A JSON string with its object keys sorted, so a re-serialised but equal value compares equal. */
function canonicalJSON(raw) {
  const sortKeys = (value) => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
    }
    return value;
  };
  try {
    return JSON.stringify(sortKeys(JSON.parse(raw)));
  } catch {
    return raw;
  }
}

/** @returns {Promise<{documents: object, packs: string[], settings: object}>} */
export async function captureWorld() {
  const documents = {};
  const add = (doc) => {
    documents[doc.uuid] = { documentName: doc.documentName, name: doc.name ?? null, modifiedTime: doc._stats?.modifiedTime ?? null };
    for (const collection of Object.values(doc.collections ?? {})) {
      for (const child of collection) add(child);
    }
  };
  for (const [documentName, collection] of game.collections.entries()) {
    if (documentName === "Setting") continue;
    for (const doc of collection) add(doc);
  }

  const packs = [];
  for (const pack of game.packs) {
    if (pack.metadata.packageType !== "world") continue;
    packs.push(pack.collection);
    // Straight from the server, the way getIndex() asks for it: the pack's cached index may be stale.
    const cls = pack.documentClass;
    const index = await cls.database.get(cls, {
      query: {},
      index: true,
      indexFields: ["_id", "name", "_stats.modifiedTime"],
      pack: pack.collection,
    }, game.user);
    for (const entry of index) {
      documents[pack.getUuid(entry._id)] = {
        documentName: pack.documentName,
        name: entry.name ?? null,
        modifiedTime: entry._stats?.modifiedTime ?? null,
      };
    }
  }

  const settings = {};
  for (const setting of game.settings.storage.get("world")) settings[settingId(setting)] = setting._source.value;
  return { documents, packs: packs.sort(), settings };
}

/** `Actor "Hero"`; an embedded or compendium document also shows its UUID. */
function describeDocument(uuid, { documentName, name }) {
  const parts = uuid.split(".");
  const label = `${documentName} "${name ?? parts.at(-1)}"`;
  return parts.length > 2 ? `${label} (${uuid})` : label;
}

/**
 * Every difference between two captureWorld() snapshots.
 * @returns {Array<{kind: string, message: string}>}  Kinds: document-created, document-deleted,
 *   document-modified, pack-created, pack-deleted, setting-changed.
 */
export function diffWorld(before, after) {
  const leaks = [];
  for (const [uuid, doc] of Object.entries(after.documents)) {
    const was = before.documents[uuid];
    const label = describeDocument(uuid, doc);
    if (!was) {
      leaks.push({ kind: "document-created", uuid, documentName: doc.documentName, name: doc.name, message: `${label} was created and is still in the world` });
    } else if (was.modifiedTime !== doc.modifiedTime) {
      leaks.push({ kind: "document-modified", uuid, documentName: doc.documentName, name: doc.name, message: `pre-existing ${label} was modified` });
    }
  }
  for (const [uuid, doc] of Object.entries(before.documents)) {
    if (!(uuid in after.documents)) {
      leaks.push({ kind: "document-deleted", uuid, documentName: doc.documentName, name: doc.name, message: `pre-existing ${describeDocument(uuid, doc)} was deleted` });
    }
  }

  for (const pack of after.packs) {
    if (!before.packs.includes(pack)) leaks.push({ kind: "pack-created", pack, message: `world compendium ${pack} was created` });
  }
  for (const pack of before.packs) {
    if (!after.packs.includes(pack)) leaks.push({ kind: "pack-deleted", pack, message: `world compendium ${pack} was deleted` });
  }

  for (const key of new Set([...Object.keys(before.settings), ...Object.keys(after.settings)])) {
    const was = before.settings[key];
    const is = after.settings[key];
    if (was === is || (was !== undefined && is !== undefined && canonicalJSON(was) === canonicalJSON(is))) continue;
    leaks.push({ kind: "setting-changed", key, before: was ?? null, after: is ?? null, message: `world setting ${key} changed: ${was ?? "(not stored)"} -> ${is ?? "(not stored)"}` });
  }
  return leaks;
}

/** Every rendered application window (ApplicationV2 and legacy). */
function openWindows() {
  return [...foundry.applications.instances.values(), ...Object.values(ui.windows)].filter((app) => app.rendered);
}

/** The windows open in this page now. */
export function captureWindows() {
  return new Set(openWindows());
}

/**
 * The windows opened since `before` and still open.
 * @param {Set<object>} before                                From captureWindows().
 * @param {import("./fixtures.js").FixtureTracker} fixtures   Labels windows of the run's own documents.
 * @returns {{leaks: object[], windows: object[]}}
 */
export function findWindowLeaks(before, fixtures) {
  const windows = openWindows().filter((app) => !before.has(app));
  const leaks = windows.map((app) => {
    const doc = app.document ?? app.object;
    const owned = doc instanceof foundry.abstract.Document && fixtures.owns(doc);
    const title = app.title ?? app.constructor.name;
    return {
      kind: "window-open",
      title,
      document: doc?.uuid ?? null,
      message: `${owned ? "a test fixture's " : ""}window "${title}" (${app.constructor.name}) was left open`,
    };
  });
  return { leaks, windows };
}

/** Closes windows the run left open, once they have been reported. */
export async function closeWindows(windows) {
  await Promise.allSettled(windows.map((app) => app.close({ animate: false, submit: false })));
}

/** World documents named like fixtures: leftovers of an earlier run that was aborted mid-way. */
export function findStaleFixtures() {
  const stale = [];
  for (const [documentName, collection] of game.collections.entries()) {
    for (const doc of collection) {
      if (typeof doc.name === "string" && doc.name.startsWith(FIXTURE_NAME_ROOT)) stale.push({ documentName, id: doc.id, name: doc.name });
    }
  }
  return stale;
}
