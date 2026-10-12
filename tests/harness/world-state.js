/**
 * Run-level leak check for the functional runner: the state a run must leave as it found it.
 *
 * Captured before the run and compared after fixture cleanup:
 *   - world documents in every world collection, by id, and each one's modification time;
 *   - the world-stored settings (world scope and user scope), by value;
 *   - the open application windows.
 * Every difference is a leak, and a leak fails the run.
 */

import { FIXTURE_NAME_ROOT } from "./fixtures.js";

/** Every rendered application window (ApplicationV2 and legacy). */
function openWindows() {
  return [...foundry.applications.instances.values(), ...Object.values(ui.windows)].filter((app) => app.rendered);
}

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

export function captureWorldState() {
  const documents = new Map();
  for (const [documentName, collection] of game.collections.entries()) {
    if (documentName === "Setting") continue;
    documents.set(documentName, new Map(collection.contents.map((doc) => [
      doc.id,
      { name: doc.name ?? null, modifiedTime: doc._stats?.modifiedTime ?? null },
    ])));
  }
  const settings = new Map();
  for (const setting of game.settings.storage.get("world")) settings.set(settingId(setting), setting._source.value);
  return { documents, settings, windows: new Set(openWindows()) };
}

/**
 * Compares the world with a capture taken before the run.
 * @param {ReturnType<typeof captureWorldState>} before
 * @param {import("./fixtures.js").FixtureTracker} fixtures   Labels windows of the run's own documents.
 * @returns {{leaks: object[], windows: object[]}}  The leaks, and the windows the run left open.
 */
export function findLeaks(before, fixtures) {
  const after = captureWorldState();
  const leaks = [];

  for (const [documentName, previous] of before.documents) {
    const current = after.documents.get(documentName) ?? new Map();
    for (const [id, { name, modifiedTime }] of current) {
      const label = `${documentName} "${name ?? id}"`;
      const was = previous.get(id);
      if (!was) {
        leaks.push({ kind: "document-created", documentName, id, name, message: `${label} was created during the run and is still in the world` });
      } else if (was.modifiedTime !== modifiedTime) {
        leaks.push({ kind: "document-modified", documentName, id, name, message: `pre-existing ${label} was modified during the run` });
      }
    }
    for (const [id, { name }] of previous) {
      if (!current.has(id)) {
        leaks.push({ kind: "document-deleted", documentName, id, name, message: `pre-existing ${documentName} "${name ?? id}" was deleted during the run` });
      }
    }
  }

  for (const key of new Set([...before.settings.keys(), ...after.settings.keys()])) {
    const was = before.settings.get(key);
    const is = after.settings.get(key);
    if (was === is || (was !== undefined && is !== undefined && canonicalJSON(was) === canonicalJSON(is))) continue;
    leaks.push({ kind: "setting-changed", key, before: was ?? null, after: is ?? null, message: `world setting ${key} changed during the run: ${was ?? "(not stored)"} -> ${is ?? "(not stored)"}` });
  }

  const windows = openWindows().filter((app) => !before.windows.has(app));
  for (const app of windows) {
    const doc = app.document ?? app.object;
    const owned = doc instanceof foundry.abstract.Document && fixtures.owns(doc);
    leaks.push({
      kind: "window-open",
      title: app.title ?? app.constructor.name,
      document: doc?.uuid ?? null,
      message: `${owned ? "a test fixture's " : ""}window "${app.title ?? app.constructor.name}" (${app.constructor.name}) was left open`,
    });
  }

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
