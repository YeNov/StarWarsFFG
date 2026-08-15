/**
 * Buying an item (talent, specialization, force power) deducts XP from the stored
 * `system.experience.available`, which is itself AE-modified: every _spendXp
 * purchase carries a `system.experience.available` ADD change, so the prepared
 * value is the source minus everything already bought.
 *
 * The old code handled that by suspending every Active Effect on the actor and on
 * each of its items -- with persistChanges=true, so two DB round-trips per effect
 * -- reading the now-unmodified value, updating, then re-enabling them one at a
 * time. For the duration the character had no effects at all, so buying a talent
 * visibly wrecked the stats and they crawled back afterwards. Reading _source is
 * the same arithmetic with no writes, so the suspension must not come back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sheet = fs.readFileSync(new URL("../../modules/actors/actor-sheet-ffg.js", import.meta.url), "utf8");

/** The item-purchase callback inside _buyCore. */
function purchaseCallback() {
  const start = sheet.indexOf('await this.object.createEmbeddedDocuments("Item", [purchasedItem]);');
  assert.notEqual(start, -1, "could not locate the item purchase");
  const end = sheet.indexOf("action: \"cancel\"", start);
  assert.notEqual(end, -1, "could not locate the end of the purchase callback");
  return sheet.slice(start, end);
}

test("buying an item does not suspend the actor's Active Effects", () => {
  const body = purchaseCallback();
  assert.ok(!body.includes("beginEditMode"), "purchase must not suspend Active Effects");
  assert.ok(!body.includes("endEditMode"), "purchase must not restore Active Effects");
});

test("buying an item deducts XP from the source, not the AE-modified prepared value", () => {
  const body = purchaseCallback();
  assert.match(body, /_source\.system\.experience\.available/);
  // Reading the prepared value here is the bug the suspension existed to hide.
  assert.ok(
    !body.includes("this.actor.system.experience.available"),
    "must not read the prepared (AE-modified) available XP",
  );
});

test("the XP deduction is still applied exactly once", () => {
  const body = purchaseCallback();
  const deductions = body.match(/available: \w+ - cost/g) ?? [];
  assert.equal(deductions.length, 1, "expected exactly one XP deduction");
});

const itemSheet = fs.readFileSync(new URL("../../modules/items/item-sheet-ffg.js", import.meta.url), "utf8");

test("no talent-tree purchase path suspends Active Effects", () => {
  // _buyTalent (specialization talents) and _buyTreeNode (force power / signature
  // ability / specialization upgrades) both entered Edit Mode via _buyHandleClick.
  // _buyTalent did it BEFORE opening its dialog, so the character's stats stayed
  // wrong for as long as the dialog was open.
  assert.ok(!itemSheet.includes("beginEditMode"), "item sheet must not suspend Active Effects");
  assert.ok(!itemSheet.includes("ActorHelpers.endEditMode"), "item sheet must not restore Active Effects");
});

test("_buyHandleClick returns the source available XP", () => {
  const start = itemSheet.indexOf("_buyHandleClick(");
  const body = itemSheet.slice(start, itemSheet.indexOf("async _buyTalent(", start));
  assert.match(body, /owner\._source\.system\.experience\.available/);
  // availableXPToLog is deliberately the PREPARED value -- it is what the player sees
  // and only feeds the XP log, never a write back into the source.
  assert.match(body, /availableXPToLog = foundry\.utils\.deepClone\(owner\.system\.experience\.available\)/);
});

test("the tree-node purchase still gates learning on a successful XP deduction", () => {
  const start = itemSheet.indexOf("async _buyTreeNode(");
  const body = itemSheet.slice(start, itemSheet.indexOf("rejectClose: false", start));
  assert.match(body, /xpDeducted = true/);
  assert.match(body, /if \(!xpDeducted\) return;/);
});
