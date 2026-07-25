/**
 * Node tests for canonical projection + the R7-1 injective identity layer (Stage 6).
 * All nine checks from plan §6 run here with no stubbing beyond foundry.utils.
 */

import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  projectItemSource,
  b62_3,
  prefix13,
  embedId16,
  sha256Bytes,
  deriveCommitActorId,
  assignWizardIdentity,
  assertWizardIdIntegrity,
  WizardIdRangeError,
  WizardIdIntegrityError,
} from "../../modules/char-creator/build-item-schema.js";

const ID_RE = /^[a-zA-Z0-9]{16}$/;

function rawItem() {
  return {
    _id: "SOURCEID0000001",
    name: "Blaster",
    type: "weapon",
    img: "icons/weapon.png",
    folder: "folder123",
    sort: 200000,
    ownership: { default: 0 },
    _stats: { systemId: "starwarsffg" },
    system: { damage: 6, price: { value: 500 } },
    flags: {
      starwarsffg: { config: { enableAmmo: true } },
      core: { sourceId: "Compendium.x.y", overlay: true },
      "third-party": { keep: "no" },
    },
    effects: [
      {
        _id: "FXSOURCE0000001",
        name: "add wounds",
        img: "icons/fx.png",
        type: "base",
        origin: "Actor.abc",
        _stats: { systemId: "starwarsffg" },
        system: {},
        disabled: false,
        transfer: true,
        sort: 100,
        changes: [{ key: "system.stats.wounds.max", value: "1", mode: 2, priority: 20 }],
        flags: {
          starwarsffg: { treeActiveEffect: true },
          core: { overlay: true, sourceId: "Compendium.a.b" },
        },
      },
    ],
  };
}

// 1 — keep/strip coverage
test("projectItemSource keeps name/type/img/system/effects + starwarsffg flags; strips the rest", () => {
  const out = projectItemSource(rawItem());
  assert.deepEqual(Object.keys(out).sort(), ["effects", "flags", "img", "name", "system", "type"].sort());
  assert.equal(out.name, "Blaster");
  assert.equal(out.type, "weapon");
  assert.ok(!("_id" in out) && !("folder" in out) && !("sort" in out) && !("ownership" in out) && !("_stats" in out));
  assert.deepEqual(Object.keys(out.flags), ["starwarsffg"]);
  assert.ok(!("third-party" in out.flags));
});

test("projectEffectSource strips _id/origin/_stats; keeps normalized changes and sort", () => {
  const out = projectItemSource(rawItem());
  const fx = out.effects[0];
  assert.ok(!("_id" in fx) && !("origin" in fx) && !("_stats" in fx));
  assert.equal(fx.sort, 100);
  assert.deepEqual(fx.changes[0], { key: "system.stats.wounds.max", value: "1", mode: 2, priority: 20 });
});

// 2 — idempotence
test("projection is idempotent", () => {
  const once = projectItemSource(rawItem());
  const twice = projectItemSource(once);
  assert.deepEqual(twice, once);
});

// 3 — priority + flags.core.overlay survive; flags.core.sourceId/origin do not
test("effect priority + flags.core.overlay survive; flags.core.sourceId and origin are dropped", () => {
  const fx = projectItemSource(rawItem()).effects[0];
  assert.equal(fx.changes[0].priority, 20);
  assert.deepEqual(fx.flags.core, { overlay: true });
  assert.ok(!("sourceId" in fx.flags.core));
  assert.ok(!("origin" in fx));
});

test("a change with no priority stays priority-less (not priority: undefined)", () => {
  const raw = rawItem();
  raw.effects[0].changes = [{ key: "k", value: "v", mode: 2 }];
  const fx = projectItemSource(raw).effects[0];
  assert.deepEqual(fx.changes[0], { key: "k", value: "v", mode: 2 });
  assert.ok(!("priority" in fx.changes[0]));
});

// 4 — forced collision proof: one seed, many indices → constant prefix, all-unique ids
test("forced collision: one seed with many distinct indices yields distinct ids sharing a prefix", () => {
  const seed = "item|COMMITabc";
  const ids = Array.from({ length: 2000 }, (_, i) => embedId16(seed, i));
  const prefix = prefix13(seed);
  for (const id of ids) assert.equal(id.slice(0, 13), prefix);
  assert.equal(new Set(ids).size, ids.length);
});

// 5 — prefix13 determinism + shape
test("prefix13 is deterministic and yields 13 base-62 chars", () => {
  assert.equal(prefix13("abc"), prefix13("abc"));
  assert.match(prefix13("abc"), /^[0-9A-Za-z]{13}$/);
  assert.notEqual(prefix13("abc"), prefix13("abd"));
});

// 6 — b62_3 range
test("b62_3: MAX (238328) throws WizardIdRangeError, 238327 succeeds, output is 3 chars", () => {
  assert.throws(() => b62_3(238328), WizardIdRangeError);
  assert.throws(() => b62_3(-1), WizardIdRangeError);
  assert.throws(() => b62_3(1.5), WizardIdRangeError);
  assert.equal(b62_3(238327).length, 3);
  assert.equal(b62_3(0), "000");
});

// 7 — duplicate-id injection throws
test("assertWizardIdIntegrity throws on a duplicate item id and on a bad id shape", () => {
  const dup = "AAAAAAAAAAAAAAAA";
  assert.throws(
    () => assertWizardIdIntegrity({ items: [{ _id: dup, effects: [] }, { _id: dup, effects: [] }] }),
    WizardIdIntegrityError,
  );
  assert.throws(
    () => assertWizardIdIntegrity({ items: [{ _id: "tooShort", effects: [] }] }),
    WizardIdIntegrityError,
  );
  assert.throws(
    () => assertWizardIdIntegrity({ items: [{ _id: dup, effects: [{ _id: "x" }] }] }),
    WizardIdIntegrityError,
  );
});

// 8 — determinism across runs + full re-keying on a changed commitId
test("assignWizardIdentity: deterministic per commitId, fully re-keyed on a new commitId", async () => {
  const build = () => ({
    items: [
      { effects: [{}, {}] },
      { effects: [{}] },
    ],
  });
  const a = await assignWizardIdentity(build(), { userId: "u1", commitId: "C1" });
  const b = await assignWizardIdentity(build(), { userId: "u1", commitId: "C1" });
  assert.equal(a._id, b._id);
  assert.deepEqual(a.items.map((it) => it._id), b.items.map((it) => it._id));
  assert.deepEqual(a.items[0].effects.map((f) => f._id), b.items[0].effects.map((f) => f._id));

  const c = await assignWizardIdentity(build(), { userId: "u1", commitId: "C2" });
  assert.notEqual(a._id, c._id);
  assert.notEqual(a.items[0]._id, c.items[0]._id);
  assert.notEqual(a.items[0].effects[0]._id, c.items[0].effects[0]._id);
});

// 9 — every assigned id matches the document-id regex
test("assignWizardIdentity: every actor/item/effect id matches the document-id regex", async () => {
  const actorData = await assignWizardIdentity(
    { items: [{ effects: [{}, {}] }, { effects: [] }] },
    { userId: "userX", commitId: "commitY" },
  );
  assert.match(actorData._id, ID_RE);
  for (const item of actorData.items) {
    assert.match(item._id, ID_RE);
    for (const fx of item.effects) assert.match(fx._id, ID_RE);
  }
  // item ids are unique across the actor
  const itemIds = actorData.items.map((it) => it._id);
  assert.equal(new Set(itemIds).size, itemIds.length);
});

test("deriveCommitActorId is deterministic, 16 chars, and memoized per {userId, commitId}", async () => {
  const a = await deriveCommitActorId("u", "c");
  const b = await deriveCommitActorId("u", "c");
  assert.equal(a, b);
  assert.match(a, ID_RE);
  assert.notEqual(a, await deriveCommitActorId("u", "c2"));
});

test("SHA-256 fallback matches the standard known vector", async () => {
  const digest = await sha256Bytes(new TextEncoder().encode("abc"), null);
  assert.equal(
    Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("SHA-256 fallback matches WebCrypto for wizard identity input", async () => {
  const input = new TextEncoder().encode("swffg-pcwizard|commit|v1|user|commit");
  const fallback = await sha256Bytes(input, null);
  const webCrypto = await sha256Bytes(input);
  assert.deepEqual(fallback, webCrypto);
});
