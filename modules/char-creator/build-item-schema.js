/**
 * Canonical item/effect projection + the R7-1 injective wizard-identity layer.
 *
 * Covered (plan §0.6.2/§6, R7-1). Imports NOTHING — it uses only global built-ins
 * (foundry.utils.deepClone, crypto.subtle, TextEncoder), so the rule-7 closure keeps
 * it import-clean.
 *
 * Ordering is normative: projectItemSource STRIPS source identity (_id, _stats, …);
 * assignWizardIdentity then ADDS deterministic wizard identity. Never the reverse.
 */

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_INDEX = 62 ** 3; // 238328 — the range of the 3-char base-62 index suffix
const ID_RE = /^[a-zA-Z0-9]{16}$/;
const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Thrown when an embedded index cannot fit the injective 3-char suffix. */
export class WizardIdRangeError extends Error {
  constructor(index) {
    super(`wizard embed index ${index} is out of range [0, ${MAX_INDEX})`);
    this.name = "WizardIdRangeError";
    this.index = index;
  }
}

/** Thrown when the final id set is not all-valid-and-unique. */
export class WizardIdIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "WizardIdIntegrityError";
  }
}

// ---------------------------------------------------------------------------
// Part A — canonical projection
// ---------------------------------------------------------------------------

const EFFECT_SCALAR_KEEP = [
  "name", "img", "type", "system", "disabled", "duration",
  "statuses", "transfer", "description", "tint", "sort",
];

/**
 * Project a single effect source to the canonical wizard shape.
 * Keeps the scalar fields above, normalizes `changes[]` to
 * `{key, value, mode, priority?}` (priority preserved when present), keeps
 * `flags.starwarsffg` and `flags.core.overlay` only. Strips `_id`, `origin`,
 * `_stats`, other `flags.core` keys, third-party flag scopes and unknown keys.
 */
function projectEffectSource(raw) {
  const out = {};
  for (const key of EFFECT_SCALAR_KEEP) {
    if (key in raw) out[key] = foundry.utils.deepClone(raw[key]);
  }
  if (Array.isArray(raw.changes)) {
    out.changes = raw.changes.map((change) => {
      const normalized = { key: change.key, value: change.value, mode: change.mode };
      if ("priority" in change) normalized.priority = change.priority;
      return normalized;
    });
  }
  const flags = {};
  if (raw.flags?.starwarsffg !== undefined) {
    flags.starwarsffg = foundry.utils.deepClone(raw.flags.starwarsffg);
  }
  if (raw.flags?.core && "overlay" in raw.flags.core) {
    flags.core = { overlay: raw.flags.core.overlay };
  }
  if (Object.keys(flags).length) out.flags = flags;
  return out;
}

/**
 * Project an item source to the canonical wizard shape: deterministic, idempotent,
 * pure. Keeps name/type/img/system/effects and the `starwarsffg` flag scope only;
 * strips `_id`, `folder`, `sort`, `ownership`, `_stats`, non-`starwarsffg` flag
 * scopes and unknown keys. Third-party flag scopes are dropped (a recorded product
 * limitation, plan §6).
 *
 * @param {object} raw  an item source (e.g. from `item.toObject()`)
 * @returns {object} the canonical projection
 */
export function projectItemSource(raw) {
  const out = {};
  if ("name" in raw) out.name = raw.name;
  if ("type" in raw) out.type = raw.type;
  if ("img" in raw) out.img = raw.img;
  if ("system" in raw) out.system = foundry.utils.deepClone(raw.system);
  if (Array.isArray(raw.effects)) out.effects = raw.effects.map(projectEffectSource);
  if (raw.flags?.starwarsffg !== undefined) {
    out.flags = { starwarsffg: foundry.utils.deepClone(raw.flags.starwarsffg) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Part B — the injective identity layer (R7-1)
// ---------------------------------------------------------------------------

/**
 * Encode an integer in [0, MAX_INDEX) as a fixed-width 3-char base-62 string.
 * Injective over its domain by construction. Throws WizardIdRangeError otherwise.
 */
export function b62_3(n) {
  if (!Number.isInteger(n) || n < 0 || n >= MAX_INDEX) throw new WizardIdRangeError(n);
  return B62[(n / 3844) | 0] + B62[((n / 62) | 0) % 62] + B62[n % 62];
}

/**
 * A deterministic synchronous fold of an arbitrary seed string into 13 base-62
 * characters. Non-cryptographic — its ONLY job is to be stable per seed; the
 * injectivity guarantee for sibling ids comes from the b62_3 index suffix, since
 * siblings share one prefix and differ only in the (distinct) index.
 */
export function prefix13(seed) {
  const str = String(seed);
  const mask = (1n << 64n) - 1n;
  const prime = 1099511628211n;
  // Two FNV-1a-style 64-bit streams over the bytes (forward + reverse) → 128 bits.
  let forward = 14695981039346656037n;
  for (let i = 0; i < str.length; i++) {
    forward = ((forward ^ BigInt(str.charCodeAt(i))) * prime) & mask;
  }
  let reverse = 14695981039346656037n;
  for (let i = str.length - 1; i >= 0; i--) {
    reverse = ((reverse ^ BigInt(str.charCodeAt(i) + 131)) * prime) & mask;
  }
  let combined = (forward << 64n) | reverse;
  let out = "";
  for (let i = 0; i < 13; i++) {
    out = B62[Number(combined % 62n)] + out;
    combined /= 62n;
  }
  return out;
}

/** 16-char id = a 13-char per-seed prefix + a 3-char injective index suffix. */
export function embedId16(seed, index) {
  return prefix13(seed) + b62_3(index);
}

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function sha256Fallback(bytes) {
  const bitLength = BigInt(bytes.length) * 8n;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  for (let i = 0; i < 8; i++) {
    padded[paddedLength - 1 - i] = Number((bitLength >> BigInt(i * 8)) & 0xffn);
  }

  const state = new Uint32Array(SHA256_INITIAL);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const wordOffset = offset + (i * 4);
      words[i] = (
        (padded[wordOffset] << 24)
        | (padded[wordOffset + 1] << 16)
        | (padded[wordOffset + 2] << 8)
        | padded[wordOffset + 3]
      ) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let i = 0; i < 64; i++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_K[i] + words[i]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const view = new DataView(digest.buffer);
  state.forEach((word, index) => view.setUint32(index * 4, word));
  return digest;
}

/**
 * SHA-256 using WebCrypto when available, with an equivalent synchronous core for
 * insecure HTTP contexts where browsers intentionally omit `crypto.subtle`.
 */
export async function sha256Bytes(bytes, subtle = globalThis.crypto?.subtle) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (subtle?.digest) {
    return new Uint8Array(await subtle.digest("SHA-256", input));
  }
  return sha256Fallback(input);
}

const actorIdCache = new Map();

/**
 * Derive the created Actor's world-collection id from {userId, commitId}. This id
 * IS a collection key, so it must be crypto-grade: SHA-256 over a domain-separated
 * input, base-62 onto 16 chars, memoized per {userId, commitId}.
 *
 * @returns {Promise<string>}
 */
export async function deriveCommitActorId(userId, commitId) {
  const cacheKey = `${userId} ${commitId}`;
  if (actorIdCache.has(cacheKey)) return actorIdCache.get(cacheKey);

  const input = `swffg-pcwizard|commit|v1|${userId}|${commitId}`;
  const digest = await sha256Bytes(new TextEncoder().encode(input));
  let n = 0n;
  for (const byte of digest) n = (n << 8n) | BigInt(byte);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out = B62[Number(n % 62n)] + out;
    n /= 62n;
  }
  actorIdCache.set(cacheKey, out);
  return out;
}

/**
 * Assert every id on an id-bearing actorData is a valid 16-char document id and
 * unique in its collection (items across the Actor; effects within each Item).
 * Throws WizardIdIntegrityError on the first violation. Exported so it is directly
 * testable and reusable as a standalone guard.
 */
export function assertWizardIdIntegrity(actorData) {
  const itemIds = new Set();
  for (const item of actorData.items ?? []) {
    if (!ID_RE.test(item._id)) {
      throw new WizardIdIntegrityError(`item id "${item._id}" is not a valid document id`);
    }
    if (itemIds.has(item._id)) {
      throw new WizardIdIntegrityError(`duplicate item id "${item._id}"`);
    }
    itemIds.add(item._id);

    const effectIds = new Set();
    for (const effect of item.effects ?? []) {
      if (!ID_RE.test(effect._id)) {
        throw new WizardIdIntegrityError(`effect id "${effect._id}" is not a valid document id`);
      }
      if (effectIds.has(effect._id)) {
        throw new WizardIdIntegrityError(`duplicate effect id "${effect._id}" within item "${item._id}"`);
      }
      effectIds.add(effect._id);
    }

    const attachmentIds = new Set();
    for (const attachment of item.system?.itemattachment ?? []) {
      if (!ID_RE.test(attachment?._id)) {
        throw new WizardIdIntegrityError(`attachment id "${attachment?._id}" within item "${item._id}" is not a valid document id`);
      }
      if (attachmentIds.has(attachment._id)) {
        throw new WizardIdIntegrityError(`duplicate attachment id "${attachment._id}" within item "${item._id}"`);
      }
      attachmentIds.add(attachment._id);
    }
  }
  return actorData;
}

/**
 * The single shared caller: stamp deterministic wizard identity onto a fully-built
 * actorData (mutating it) and assert integrity before returning.
 *  - actorData._id = deriveCommitActorId(userId, commitId)   (crypto, cached)
 *  - each item._id = embedId16(`item|${commitId}`, i)        (one prefix ⇒ distinct i)
 *  - each effect._id = embedId16(`fx|${commitId}|${i}`, j)   (one prefix per item ⇒ distinct j)
 *
 * @param {object} actorData          a built actor source with an `items` array
 * @param {{userId: string, commitId: string}} identity
 * @returns {Promise<object>} the same actorData, now id-bearing
 */
export async function assignWizardIdentity(actorData, { userId, commitId }) {
  actorData._id = await deriveCommitActorId(userId, commitId);

  const items = Array.isArray(actorData.items) ? actorData.items : [];
  items.forEach((item, i) => {
    item._id = embedId16(`item|${commitId}`, i);
    const effects = Array.isArray(item.effects) ? item.effects : [];
    effects.forEach((effect, j) => {
      effect._id = embedId16(`fx|${commitId}|${i}`, j);
    });
    const attachments = Array.isArray(item.system?.itemattachment) ? item.system.itemattachment : [];
    attachments.forEach((attachment, j) => {
      attachment._id = embedId16(`att|${commitId}|${i}`, j);
    });
  });

  return assertWizardIdIntegrity(actorData);
}
