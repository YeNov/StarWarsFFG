/**
 * Fixture tracker for the in-Foundry functional suites.
 *
 * Every world document a suite needs is created through the run's tracker (`harness.fixtures`).
 * The tracker names it uniquely for the run and records its id, so cleanup deletes exactly what
 * this run created, pass or fail, and nothing else in the world. Settings a test changes through
 * the tracker are restored the same way.
 *
 *   const hero = await harness.fixtures.create("Actor", { name: "hero", type: "character" });
 *   hero.name;                                    // "ffgtest-<runId>-hero"
 *   harness.fixtures.track(createdByTheCodeUnderTest);
 *   await harness.fixtures.setting("starwarsffg", "enableDebug", true);
 *
 * Lifetime. What a test (or a beforeEach hook) creates is cleaned up right after that test by the
 * runner's root afterEach hook. What a `before` hook creates lives until the end of the run.
 * Cleanup runs in reverse order, closes the documents' open windows first, and never throws:
 * failures are collected in `errors` and reported by the runner.
 */

/** Every fixture name starts with this, so leftovers of an aborted run are recognisable. */
export const FIXTURE_NAME_ROOT = "ffgtest-";

export class FixtureTracker {
  /** Entries created outside a test: cleaned up at the end of the run. */
  #runEntries = [];

  /** Entries created by the running test, or null between tests. */
  #testEntries = null;

  /** UUIDs of every document ever tracked, for `owns()`. */
  #uuids = new Set();

  #counter = 0;

  /** Cleanup failures: {message, stack}. */
  errors = [];

  /** @param {string} runId */
  constructor(runId) {
    this.runId = runId;
    this.prefix = `${FIXTURE_NAME_ROOT}${runId}-`;
  }

  /**
   * A run-unique name: the prefix plus `label`, or plus a counter when no label is given.
   * @param {string} [label]
   */
  name(label) {
    return `${this.prefix}${label ?? `fixture-${++this.#counter}`}`;
  }

  /**
   * Creates a world document and tracks it. Any world type works: Actor, Item, User, ChatMessage,
   * JournalEntry, Scene, Macro, Folder, RollTable, Playlist, Cards, Combat. A type with a name gets
   * `name(data.name)`.
   * @param {string} documentName
   * @param {object} [data]       Creation data.
   * @param {object} [options]    Creation options.
   * @returns {Promise<foundry.abstract.Document>}
   */
  async create(documentName, data = {}, options = {}) {
    const cls = game.collections.has(documentName) ? getDocumentClass(documentName) : null;
    if (!cls || documentName === "Setting") throw new Error(`"${documentName}" is not a world document type the tracker creates`);
    const source = foundry.utils.deepClone(data);
    if (cls.schema.has("name")) source.name = this.name(data.name);
    const doc = await cls.create(source, options);
    if (!doc) throw new Error(`creating ${documentName} "${source.name ?? ""}" was refused by a preCreate hook`);
    return this.track(doc);
  }

  /**
   * Tracks a world document created elsewhere (for example by the code under test), so cleanup
   * deletes it. Embedded documents go with their parent and are not tracked on their own.
   * @param {foundry.abstract.Document} doc
   * @returns {foundry.abstract.Document}  The same document.
   */
  track(doc) {
    if (!(doc instanceof foundry.abstract.Document) || doc.isEmbedded || doc.pack || !game.collections.has(doc.documentName)) {
      throw new Error("track() takes a world document; embedded documents are removed with their parent");
    }
    this.#uuids.add(doc.uuid);
    this.#push({ kind: "document", documentName: doc.documentName, id: doc.id, label: `${doc.documentName} "${doc.name ?? doc.id}"` });
    return doc;
  }

  /**
   * Sets a game setting, and restores the value and the stored form it had (including "never
   * stored") when the entry is cleaned up.
   * @param {string} namespace
   * @param {string} key
   * @param {any} value
   * @returns {Promise<any>}  The value now in effect.
   */
  async setting(namespace, key, value) {
    const id = `${namespace}.${key}`;
    const config = game.settings.settings.get(id);
    if (!config) throw new Error(`"${id}" is not a registered setting`);
    const current = game.settings.get(namespace, key);
    this.#push({
      kind: "setting",
      namespace,
      key,
      scope: config.scope,
      value: current instanceof foundry.abstract.DataModel ? current.toObject() : foundry.utils.deepClone(current),
      raw: storedSettingValue(namespace, key, config.scope),
      label: `setting ${id}`,
    });
    return game.settings.set(namespace, key, value);
  }

  /**
   * True when `doc`, or the document it is embedded in, was created or tracked by this tracker.
   * @param {foundry.abstract.Document} doc
   */
  owns(doc) {
    for (let current = doc; current; current = current.parent) {
      if (this.#uuids.has(current.uuid)) return true;
    }
    return false;
  }

  /** Opens a test's scope. Called by the runner's root beforeEach hook. */
  beginTest() {
    this.#testEntries = [];
  }

  /** Cleans up the test's scope. Called by the runner's root afterEach hook. Never throws. */
  async endTest() {
    const entries = this.#testEntries ?? [];
    this.#testEntries = null;
    await this.#dispose(entries);
  }

  /** Cleans up everything still tracked. Called by the runner at the end of the run. Never throws. */
  async cleanup() {
    const entries = [...this.#runEntries, ...(this.#testEntries ?? [])];
    this.#runEntries = [];
    this.#testEntries = null;
    await this.#dispose(entries);
  }

  #push(entry) {
    (this.#testEntries ?? this.#runEntries).push(entry);
  }

  async #dispose(entries) {
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.kind === "setting") await restoreSetting(entry);
        else await deleteDocument(entry);
      } catch (error) {
        this.errors.push({ message: `cleanup of ${entry.label} failed: ${error.message}`, stack: error.stack ?? null });
      }
    }
  }
}

/** The stored form of a setting: the raw JSON string, or null when nothing is stored. */
function storedSettingValue(namespace, key, scope) {
  if (scope === CONST.SETTING_SCOPES.CLIENT) return game.settings.storage.get("client").getItem(`${namespace}.${key}`);
  const doc = game.settings.get(namespace, key, { document: true });
  return doc?._id ? doc._source.value : null;
}

async function restoreSetting({ namespace, key, scope, value, raw }) {
  // set() first, so the setting's onChange sees the original value again.
  await game.settings.set(namespace, key, value);
  if (scope === CONST.SETTING_SCOPES.CLIENT) {
    const storage = game.settings.storage.get("client");
    if (raw === null) storage.removeItem(`${namespace}.${key}`);
    else storage.setItem(`${namespace}.${key}`, raw);
    return;
  }
  const doc = game.settings.get(namespace, key, { document: true });
  if (!doc?._id) return;
  if (raw === null) await doc.delete();
  else if (doc._source.value !== raw) await doc.update({ value: raw });
}

async function deleteDocument({ documentName, id }) {
  const doc = game.collections.get(documentName)?.get(id);
  if (!doc) return; // the test deleted it already
  await closeApplications(doc);
  await doc.delete();
}

/** Closes the open windows of a document and of everything embedded in it. */
async function closeApplications(doc) {
  const closing = [];
  const visit = (current) => {
    for (const app of Object.values(current.apps ?? {})) {
      if (app.rendered) closing.push(app.close({ animate: false, submit: false }));
    }
    for (const collection of Object.values(current.collections ?? {})) {
      for (const child of collection) visit(child);
    }
  };
  visit(doc);
  await Promise.allSettled(closing);
}
