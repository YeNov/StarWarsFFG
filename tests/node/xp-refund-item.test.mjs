/**
 * Refunding the purchases that have no Active Effect behind them.
 *
 * Only `_spendXp` (skill ranks, characteristics) ever created an effect named
 * `purchased-<id>`. Every other path charges the actor directly, because an Active
 * Effect can neither grant a document nor tick a talent-tree node:
 *
 *   - item grants  -- a force power / specialization / talent bought as an Item
 *   - tree nodes   -- `…islearned = true` on a specialization or force power
 *   - adjustments  -- a self XP adjustment, which moves available AND total
 *
 * All three logged with no id at all, so the shared ffg-block template hid the refund
 * button and the Codex template rendered it with an EMPTY data-id -- where
 * `ae.name.includes("")` is true for every effect, so a refund click deleted whichever
 * unrelated Active Effect came first (in practice, a talent's).
 *
 * They now carry an `undo` descriptor. Entries written before that carry nothing, and
 * must resolve to `none`: there is no record of what they bought.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveRefundTarget } from "../../modules/helpers/xp-refund.js";
import { buildXpSpendEntry, buildXpEarnEntry } from "../../modules/helpers/xp-entry-builders.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const effects = [
  { id: "ae1", name: "purchased-AAAAAAAAAAAAAAAA" },
  { id: "ae2", name: "purchased-BBBBBBBBBBBBBBBB" },
];

const spend = (statusId, undo) =>
  buildXpSpendEntry({ description: "d", cost: 10, available: 15, total: 25, statusId, undo, date: "2026-08-23" });

test("an empty or missing purchase id resolves to nothing", () => {
  for (const id of ["", undefined, null, 0]) {
    assert.deepEqual(
      resolveRefundTarget(id, { effects, logEntries: [] }),
      { kind: "none" },
      `id ${JSON.stringify(id)} must not match an Active Effect`,
    );
  }
});

test("an Active Effect purchase resolves to its effect", () => {
  assert.deepEqual(resolveRefundTarget("BBBBBBBBBBBBBBBB", { effects, logEntries: [] }), {
    kind: "effect",
    effectId: "ae2",
  });
});

test("an item purchase resolves to the granted item", () => {
  const logEntries = [spend("CCCCCCCCCCCCCCCC", { type: "item", itemId: "item123" })];
  assert.deepEqual(resolveRefundTarget("CCCCCCCCCCCCCCCC", { effects, logEntries }), {
    kind: "item",
    itemId: "item123",
    cost: 10,
  });
});

test("a tree node resolves to the item and the islearned path", () => {
  const logEntries = [
    spend("DDDDDDDDDDDDDDDD", { type: "node", itemId: "spec1", path: "system.talents.talent12.islearned" }),
  ];
  assert.deepEqual(resolveRefundTarget("DDDDDDDDDDDDDDDD", { effects, logEntries }), {
    kind: "node",
    itemId: "spec1",
    path: "system.talents.talent12.islearned",
    cost: 10,
  });
});

test("an XP adjustment resolves to its signed amount, not the entry cost", () => {
  const logEntries = [
    buildXpEarnEntry({
      grant: -5,
      available: 10,
      total: 40,
      note: "correction",
      statusId: "EEEEEEEEEEEEEEEE",
      undo: { type: "xp", amount: -5 },
      date: "2026-08-23",
      granter: "Self",
    }),
  ];
  assert.deepEqual(resolveRefundTarget("EEEEEEEEEEEEEEEE", { effects, logEntries }), { kind: "xp", amount: -5 });
});

test("a legacy entry with no undo descriptor is not refundable", () => {
  const logEntries = [spend("FFFFFFFFFFFFFFFF", undefined)];
  assert.deepEqual(resolveRefundTarget("FFFFFFFFFFFFFFFF", { effects, logEntries }), { kind: "none" });
});

test("a malformed undo descriptor is not refundable", () => {
  for (const undo of [{ type: "item" }, { type: "node", itemId: "x" }, { type: "xp" }, { type: "nonsense" }]) {
    assert.deepEqual(
      resolveRefundTarget("GGGGGGGGGGGGGGGG", { effects, logEntries: [spend("GGGGGGGGGGGGGGGG", undo)] }),
      { kind: "none" },
      JSON.stringify(undo),
    );
  }
});

test("the builders carry the undo descriptor through untouched", () => {
  const undo = { type: "item", itemId: "abc" };
  assert.deepEqual(spend("x", undo).undo, undo);
  assert.equal(spend("x").undo, undefined);
});

const sheet = read("modules/actors/actor-sheet-ffg.js");
const itemSheet = read("modules/items/item-sheet-ffg.js");

test("the item purchase records the granted item, not the source item", () => {
  const start = sheet.indexOf('createEmbeddedDocuments("Item", [purchasedItem])');
  assert.notEqual(start, -1, "could not locate the item purchase");
  const body = sheet.slice(start - 200, sheet.indexOf('action: "cancel"', start));
  // The CREATED document carries the id the refund deletes; the compendium/world
  // source has a different one, so logging `purchasedItem.id` would never resolve.
  assert.match(body, /const \[grantedItem\] = await this\.object\.createEmbeddedDocuments\("Item"/);
  assert.match(body, /type: "item", itemId: grantedItem\.id/);
});

test("both tree-node purchase paths record the islearned path they set", () => {
  // _buyTreeNode learns `system.<treeProp>.<upgradeId>.islearned`; _buyTalent ticks
  // `talents.<talentId>.islearned` through the form. A refund flips that same path,
  // so a drift between the two would silently un-learn nothing.
  assert.match(itemSheet, /type: "node", itemId: this\.object\.id, path: `system\.\$\{config\.treeProp\}\.\$\{upgradeId\}\.islearned`/);
  assert.match(itemSheet, /type: "node", itemId: this\.object\.id, path: `system\.talents\.\$\{talentId\}\.islearned`/);
  assert.match(itemSheet, /\{\[`system\.\$\{config\.treeProp\}\.\$\{upgradeId\}\.islearned`\]: true\}/);
});

test("the XP adjustment records its signed amount", () => {
  const start = sheet.indexOf("SWFFG.XP.Adjust.Window.Title");
  assert.notEqual(start, -1);
  const body = sheet.slice(start, sheet.indexOf("_xpExport", start));
  assert.match(body, /type: "xp", amount: adjustAmount/);
});

test("_refundPurchase reverses every kind and never rematches on a raw id", () => {
  const start = sheet.indexOf("async _refundPurchase(");
  assert.notEqual(start, -1);
  const body = sheet.slice(start, sheet.indexOf("_onRemoveSkill", start));
  assert.match(body, /resolveRefundTarget/, "the lookup must go through the pure helper");
  assert.match(body, /deleteEmbeddedDocuments\("ActiveEffect"/);
  assert.match(body, /deleteEmbeddedDocuments\("Item"/);
  assert.match(body, /treeItem\.update\(\{\[target\.path\]: false\}\)/);
  assert.match(body, /syncAEStatus/, "un-learning a node must withdraw the effects it granted");
  assert.match(body, /_source\.system\.experience\.available/, "must credit the source, not the prepared value");
  // The `.includes` lookup on a raw id is the destructive bug.
  assert.ok(!body.includes("ae.name.includes(purchaseId)"), "the unguarded effect name match must be gone");
});

test("a refunded entry is stripped of both its id and its undo descriptor", () => {
  const start = sheet.indexOf("async _refundPurchase(");
  const body = sheet.slice(start, sheet.indexOf("_onRemoveSkill", start));
  assert.match(body, /entry\.id = undefined/);
  assert.match(body, /entry\.undo = undefined/, "a reversed purchase must not stay refundable");
});

test("an unresolvable entry tells the player instead of only the console", () => {
  // The PC wizard mints `pcw:<commitId>:spend` as a bookkeeping id with no Active Effect
  // behind it, so those entries render a button that can never resolve. A console-only
  // warning left the player clicking a dead control.
  const start = sheet.indexOf("async _refundPurchase(");
  const body = sheet.slice(start, sheet.indexOf("_onRemoveSkill", start));
  assert.match(body, /ui\.notifications\.warn\(game\.i18n\.localize\("SWFFG\.Actors\.Sheets\.Refund\.Unavailable"\)\)/);
  for (const lang of ["lang/en.json", "lang/ua.json"]) {
    const strings = JSON.parse(read(lang).replace(/^﻿/, ""));
    assert.ok(strings["SWFFG.Actors.Sheets.Refund.Unavailable"], `${lang} is missing the string`);
  }
});

test("the Codex XP log hides the refund button for entries with no purchase id", () => {
  const codex = read("templates/actors/codex/codex-character.html");
  const entry = codex.split("\n").find((line) => line.includes('class="xp refund"'));
  assert.ok(entry, "could not locate the Codex refund button");
  assert.match(entry, /\{\{#if entry\.id\}\}/, "legacy id-less entries must not render a refund button");
});

test("a merged talent purchase resolves to the ranks it added", () => {
  const logEntries = [{ id: "RANK000000000001", xp: { cost: 15 }, undo: { type: "talent-rank", itemId: "tal1", ranks: 1 } }];
  assert.deepEqual(resolveRefundTarget("RANK000000000001", { logEntries }), {
    kind: "talent-rank",
    itemId: "tal1",
    ranks: 1,
    cost: 15,
  });
});

test("a talent-rank descriptor with no ranks recorded takes back one", () => {
  const logEntries = [{ id: "RANK000000000002", xp: { cost: 5 }, undo: { type: "talent-rank", itemId: "tal1" } }];
  assert.equal(resolveRefundTarget("RANK000000000002", { logEntries }).ranks, 1);
});

test("a talent-rank descriptor with no item resolves to nothing", () => {
  const logEntries = [{ id: "RANK000000000003", xp: { cost: 5 }, undo: { type: "talent-rank" } }];
  assert.deepEqual(resolveRefundTarget("RANK000000000003", { logEntries }), { kind: "none" });
});

test("an item descriptor logged before merging still deletes the item", () => {
  const logEntries = [{ id: "ITEM000000000001", xp: { cost: 10 }, undo: { type: "item", itemId: "tal9" } }];
  assert.deepEqual(resolveRefundTarget("ITEM000000000001", { logEntries }), { kind: "item", itemId: "tal9", cost: 10 });
});

test("an item purchase distinguishes an explicit merge from refusal or cancellation", () => {
  const start = sheet.indexOf('createEmbeddedDocuments("Item", [purchasedItem])');
  const body = sheet.slice(start - 1200, sheet.indexOf('action: "cancel"', start));
  assert.match(body, /planTalentGrant/);
  assert.match(body, /grantPlan\.action === "refuse"[\s\S]*return;/);
  assert.match(body, /grantPlan\.action === "increment"/);
  const cancellationGuard = body.indexOf("if (!undo)");
  const xpDeduction = body.indexOf("_source.system.experience.available");
  assert.ok(cancellationGuard >= 0 && cancellationGuard < xpDeduction,
    "a cancelled create must abort before XP is deducted");
});
