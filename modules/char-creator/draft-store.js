/**
 * Draft persistence I/O shell (D5).
 *
 * NOT Covered and outside the rule-7 closure — it reads/writes the player's own User
 * flag (verified non-GM-writable, common/documents/user.mjs:204-220) and debounces via
 * timers. The pure serialization/migration/measurement live in draft-schema.js.
 * Verified live at Stage 23; the ≤150 ms setFlag-latency half of the budget is measured
 * there too (the byte half is asserted in the Node tier).
 *
 * The store owns the OUTER record ({data, commit}); "frozen" is derived from
 * commit !== null — there is no persisted `commitFrozen`.
 */

import { FLAG_SCOPE, FLAGS } from "./constants.js";
import {
  serializeDraft,
  deserializeDraft,
  normalizeDraftRules,
  isWithinBudget,
  compactDraft,
  rehydrateRef,
} from "./draft-schema.js";

const DEBOUNCE_MS = 1000;

export class DraftStore {
  #timer = null;
  #pending = null;
  #commit = null;
  #locked = false;

  /** Queue a debounced save (~1 s). Ignored while locked. */
  scheduleSave({ data, commit = this.#commit } = {}) {
    this.#pending = { data, commit };
    this.#commit = commit;
    if (this.#locked) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#flush(); }, DEBOUNCE_MS);
  }

  /** Cancel any pending debounce and write immediately. */
  async saveNow({ data, commit = this.#commit } = {}) {
    this.#pending = { data, commit };
    this.#commit = commit;
    await this.#flush({ force: true });
  }

  async #flush({ force = false } = {}) {
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null; }
    if ((this.#locked && !force) || !this.#pending) return;
    let record = serializeDraft(this.#pending, { systemVersion: game.system?.version });
    if (!isWithinBudget(record)) record = compactDraft(record);
    this.#pending = null;
    await game.user.setFlag(FLAG_SCOPE, FLAGS.draft, record);
  }

  /** Load + migrate the stored record, or null. Throws typed errors on a bad draft. */
  async load() {
    const raw = game.user.getFlag(FLAG_SCOPE, FLAGS.draft);
    if (!raw) return null;
    const record = deserializeDraft(raw);
    this.#normalizeLoadedData(record.data);
    await this.#rehydrateRecord(record);
    this.#commit = record.commit ?? null; // adopt the frozen state on resume
    return record;
  }

  #normalizeLoadedData(data) {
    normalizeDraftRules(data);
  }

  async #rehydrateRecord(record) {
    const refs = [];
    const walk = (value) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (!value || typeof value !== "object") return;
      if (typeof value.uuid === "string" && ("snapshot" in value || "name" in value || "type" in value)) refs.push(value);
      for (const [key, child] of Object.entries(value)) {
        if (key !== "snapshot") walk(child);
      }
    };
    walk(record.data);

    let warned = false;
    for (const ref of refs) {
      if (!ref.uuid?.startsWith?.("Compendium.")) continue;
      let fresh = null;
      try {
        fresh = await fromUuid(ref.uuid);
      } catch (err) {
        CONFIG.logger?.warn?.(`PC wizard draft rehydrate failed for ${ref.uuid}: ${err.message}`);
      }
      const { ref: merged, warning } = rehydrateRef(ref, fresh?.toObject?.() ?? null);
      Object.assign(ref, merged);
      warned ||= warning;
    }
    record.warnings = [...(record.warnings ?? []), ...(warned ? ["SWFFG.CharacterCreator.Draft.RefreshWarning"] : [])];
  }

  /** Freeze (commit object) or clear (null) the commit; marks the draft dirty. */
  setCommit(commit) {
    this.#commit = commit;
  }

  /** Resolve once no save is pending. */
  async idle() {
    if (this.#pending) await this.#flush({ force: true });
  }

  /** Remove the stored draft entirely. */
  async clear() {
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null; }
    this.#pending = null;
    await game.user.unsetFlag(FLAG_SCOPE, FLAGS.draft);
  }

  lock() { this.#locked = true; }
  unlock() { this.#locked = false; }
}
