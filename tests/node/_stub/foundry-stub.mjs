/**
 * The minimal Foundry stub for the Node test tier (plan §0.6.6).
 *
 * Imported FIRST by every Node test. It stubs the smallest global surface the Covered pure
 * modules touch — and nothing else.
 *
 * ⚠ THE BOUNDARY IS THE POINT. It must NOT stub `Actor`, `Item`, `ActiveEffect`, `ChatMessage`,
 * `Hooks`, `game.socket`, `game.packs`, `fromUuid`, `ui.notifications`, `TextEditor`,
 * `foundry.applications.*`, or any DOM API. `tests/node/stub-boundary.test.mjs` enforces that
 * both statically and at runtime.
 *
 * The rule this encodes: if a Node test would require stubbing one of the forbidden names,
 * STOP and route the check to Stage 23. Never grow a Foundry simulator here.
 */

// The REAL creator config table. Confirmed import-clean in Node at Stage 1 (it has no imports),
// so there is no hand-maintained fixture to drift out of sync with production.
import { characterCreator } from "../../../modules/config/ffg-character-creator.js";

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Mirrors `foundry.utils.randomID` — a length-`n` alphanumeric id. */
function randomID(length = 16) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return out;
}

function deepClone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepClone);
  if (value instanceof Date) return new Date(value);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
  return out;
}

function getProperty(object, key) {
  if (!key) return undefined;
  let target = object;
  for (const part of key.split(".")) {
    if (target === null || typeof target !== "object") return undefined;
    target = target[part];
  }
  return target;
}

function setProperty(object, key, value) {
  const parts = key.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (typeof target[part] !== "object" || target[part] === null) target[part] = {};
    target = target[part];
  }
  const changed = target[last] !== value;
  target[last] = value;
  return changed;
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** Mirrors `foundry.utils.mergeObject` for the subset of options the pure modules use. */
function mergeObject(original, other = {}, { insertKeys = true, overwrite = true } = {}) {
  const target = original;
  for (const [k, v] of Object.entries(other)) {
    const has = Object.prototype.hasOwnProperty.call(target, k);
    if (!has && !insertKeys) continue;
    if (has && !overwrite) continue;
    if (
      v && typeof v === "object" && !Array.isArray(v) &&
      target[k] && typeof target[k] === "object" && !Array.isArray(target[k])
    ) {
      mergeObject(target[k], v, { insertKeys, overwrite });
    } else {
      target[k] = deepClone(v);
    }
  }
  return target;
}

globalThis.foundry = {
  utils: {
    randomID,
    deepClone,
    mergeObject,
    duplicate: (value) => JSON.parse(JSON.stringify(value)),
    getProperty,
    setProperty,
    isEmpty,
  },
};

globalThis.CONFIG = {
  FFG: { characterCreator },
  // The system's own logging shim (installed by swffg-main at init), not a Foundry API.
  // Pure helpers such as ModifierHelpers.getModKeyPath log diagnostics through it on the
  // paths that matter most to test -- the ones that reject bad input -- so without it those
  // branches throw instead of returning. A sink, deliberately: tests assert on returned
  // plans, never on log output.
  logger: { debug() {}, warn() {}, error() {}, log() {} },
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: Object.freeze({
    INHERIT: -1,
    NONE: 0,
    LIMITED: 1,
    OBSERVER: 2,
    OWNER: 3,
  }),
};

/**
 * Mutable stub settings store. Tests seed it via `setSetting()` rather than by widening the
 * stub — `game.settings.get` is the only settings surface the Covered modules read.
 */
const settings = new Map();

globalThis.game = {
  user: { id: "stubUser00000001", isGM: false, name: "Stub Player" },
  users: { activeGM: null },
  settings: {
    get: (namespace, key) => settings.get(`${namespace}.${key}`),
  },
  // Binding: the pure modules must return i18n KEYS, so the stub localizer is the identity.
  i18n: { localize: (key) => key },
};

/** Test helper — seed a world setting the Covered modules will read. */
export function setSetting(namespace, key, value) {
  settings.set(`${namespace}.${key}`, value);
}

/** Test helper — clear all seeded settings. */
export function resetSettings() {
  settings.clear();
}
