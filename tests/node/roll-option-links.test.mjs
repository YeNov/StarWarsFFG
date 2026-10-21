import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  addLink, copyIdentity, keepCopyFields, linkChangeVerdict, nodeIdentity, removeLink, withCopyLinks,
} from "../../modules/helpers/roll-option-links.js";

/**
 * Only the GM may change an item's roll option links, while players keep every ordinary way of
 * handling the copies an item holds (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "Link lists on items").
 */

const quality = (id, name, links = [], extra = {}) => ({ _id: id, name, type: "itemmodifier", system: { rollOptions: links, ...extra } });
const attachment = (id, name, links = [], qualities = []) => ({ _id: id, name, type: "itemattachment", system: { rollOptions: links, itemmodifier: qualities } });
const weapon = ({ links = [], qualities = [], attachments = [] } = {}) =>
  ({ type: "weapon", system: { rollOptions: links, itemmodifier: qualities, itemattachment: attachments } });
const player = { isGM: false };

test("a player cannot change an item's own links", () => {
  const before = { system: { rollOptions: ["Macro.a"] } };
  const after = { system: { rollOptions: ["Macro.b"] } };
  assert.deepEqual(linkChangeVerdict(before, after, player), { ok: false, where: "self" });
  assert.deepEqual(linkChangeVerdict(before, after, { isGM: true }), { ok: true });
  assert.deepEqual(linkChangeVerdict(before, { system: { rollOptions: [] } }, player), { ok: false, where: "self" });
});

test("a player cannot change a kept copy's links", () => {
  const before = weapon({ qualities: [quality("q1", "Auto-fire", ["Macro.a"])] });
  const after = weapon({ qualities: [quality("q1", "Auto-fire", [])] });
  assert.deepEqual(linkChangeVerdict(before, after, player), { ok: false, where: "q:q1|Auto-fire" });
});

test("removing, adding and replacing copies is allowed", () => {
  const before = weapon({ qualities: [quality("q1", "Auto-fire", ["Macro.a"])] });
  assert.deepEqual(linkChangeVerdict(before, weapon(), player), { ok: true });
  assert.deepEqual(linkChangeVerdict(weapon(), before, player), { ok: true });

  const spec = (node) => ({ type: "specialization", system: { talents: { talent3: node } } });
  assert.deepEqual(linkChangeVerdict(
    spec({ itemId: "t1", name: "Point Blank", rollOptions: ["Macro.a"] }),
    spec({ itemId: "t2", name: "Guns Blazing", rollOptions: ["Macro.b"] }),
    player,
  ), { ok: true });
  // The same talent kept in its slot cannot have its links changed.
  assert.deepEqual(linkChangeVerdict(
    spec({ itemId: "t1", name: "Point Blank", rollOptions: ["Macro.a"] }),
    spec({ itemId: "t1", name: "Point Blank", rollOptions: [] }),
    player,
  ), { ok: false, where: "t:talent3|t1" });
});

test("reordering copies is allowed", () => {
  const a = quality("q1", "Auto-fire", ["Macro.a"]);
  const b = quality("q2", "Pierce", []);
  assert.deepEqual(linkChangeVerdict(weapon({ qualities: [a, b] }), weapon({ qualities: [b, a] }), player), { ok: true });
});

test("a modification inside an attachment is matched through the attachment", () => {
  const before = weapon({ attachments: [attachment("a1", "Scope", [], [quality("m1", "Mod", ["Macro.a"])])] });
  const after = weapon({ attachments: [attachment("a1", "Scope", [], [quality("m1", "Mod", ["Macro.b"])])] });
  assert.deepEqual(linkChangeVerdict(before, after, player), { ok: false, where: "a:a1|Scope/q:m1|Mod" });
  // The attachment's own links are guarded as well.
  const own = weapon({ attachments: [attachment("a1", "Scope", ["Macro.x"])] });
  assert.deepEqual(linkChangeVerdict(own, weapon({ attachments: [attachment("a1", "Scope", [])] }), player), { ok: false, where: "a:a1|Scope" });
});

test("other changes pass", () => {
  const before = weapon({ links: ["Macro.w"], qualities: [quality("q1", "Pierce", ["Macro.a"], { rank: 1 })] });
  const ranked = weapon({ links: ["Macro.w"], qualities: [quality("q1", "Pierce", ["Macro.a"], { rank: "2" })] });
  assert.deepEqual(linkChangeVerdict(before, ranked, player), { ok: true });
  // A renamed copy is a different copy as far as the guard can tell.
  const renamed = weapon({ links: ["Macro.w"], qualities: [quality("q1", "Pierce 2", ["Macro.a"])] });
  assert.deepEqual(linkChangeVerdict(before, renamed, player), { ok: true });
});

test("addLink and removeLink", () => {
  assert.deepEqual(addLink(undefined, "Macro.a"), ["Macro.a"]);
  assert.deepEqual(addLink(["Macro.a"], "Macro.a"), ["Macro.a"]);
  assert.deepEqual(addLink(["Macro.a"], "Macro.b"), ["Macro.a", "Macro.b"]);
  assert.deepEqual(removeLink(["Macro.a", "Macro.b"], "Macro.a"), ["Macro.b"]);
  assert.deepEqual(removeLink(["Macro.a"], "Macro.z"), ["Macro.a"]);
  assert.deepEqual(removeLink(undefined, "Macro.z"), []);
});

test("withCopyLinks replaces only the matching copy", () => {
  const list = [quality("q1", "Auto-fire", ["Macro.a"]), quality("q2", "Pierce", ["Macro.p"])];
  const next = withCopyLinks(list, copyIdentity(list[0]), ["Macro.b"]);
  assert.deepEqual(next.map((q) => q.system.rollOptions), [["Macro.b"], ["Macro.p"]]);
  assert.deepEqual(list[0].system.rollOptions, ["Macro.a"], "the original list is untouched");
});

test("identities", () => {
  assert.equal(copyIdentity({ _id: "q1", name: "Auto-fire" }), "q1|Auto-fire");
  assert.equal(copyIdentity({ id: "q1", name: "Auto-fire" }), "q1|Auto-fire");
  assert.equal(copyIdentity({ name: "Auto-fire" }), "|Auto-fire");
  assert.equal(nodeIdentity("talent3", { itemId: "t1", name: "X" }), "talent3|t1");
  assert.equal(nodeIdentity("talent3", { name: "X" }), "talent3|X");
});

/* Saving an attachment rebuilds its modifications from the form, which carries neither links nor
 * identity. keepCopyFields puts back what the form never edits (final review, Important 1). */

const stored = (id, name, links, system = {}) =>
  ({ _id: id, name, type: "itemmodifier", img: `${id}.svg`, system: { rollOptions: links, rank: 1, attributes: { a1: { modtype: "x" } }, ...system } });
const fromForm = (name, system = {}) => ({ name, system: { description: "", active: true, rank: 2, attributes: {}, ...system } });

test("a form-rebuilt modification keeps its links and identity, and the form's edits", () => {
  const [kept] = keepCopyFields([stored("m1", "Auto-fire", ["Macro.a"])], [fromForm("Auto-fire")]);
  assert.deepEqual(kept, {
    _id: "m1", name: "Auto-fire", type: "itemmodifier", img: "m1.svg",
    system: { description: "", active: true, rank: 2, attributes: {}, rollOptions: ["Macro.a"] },
  });
});

test("modifications are matched by name when one before them was removed", () => {
  const result = keepCopyFields([stored("m1", "Pierce", ["Macro.p"]), stored("m2", "Auto-fire", ["Macro.a"])], [fromForm("Auto-fire")]);
  assert.equal(result[0]._id, "m2");
  assert.deepEqual(result[0].system.rollOptions, ["Macro.a"]);
});

test("a modification renamed in place keeps its links; a new one gets none", () => {
  // The sheets save on every change, so a rename and an addition never share a save.
  const renamed = keepCopyFields([stored("m1", "Auto-fire", ["Macro.a"])], [fromForm("Autofire")]);
  assert.deepEqual(renamed[0].system.rollOptions, ["Macro.a"]);
  assert.equal(renamed[0]._id, "m1");
  const added = keepCopyFields([stored("m1", "Auto-fire", ["Macro.a"])], [fromForm("Auto-fire"), fromForm("Pierce")]);
  assert.deepEqual(added[0].system.rollOptions, ["Macro.a"]);
  assert.equal(added[1]._id, undefined);
  assert.equal("rollOptions" in added[1].system, false);
});

test("two copies of one name each keep their own", () => {
  const result = keepCopyFields(
    [stored("m1", "Auto-fire", ["Macro.a"]), stored("m2", "Auto-fire", ["Macro.b"])],
    [fromForm("Auto-fire"), fromForm("Auto-fire")],
  );
  assert.deepEqual(result.map((m) => m._id), ["m1", "m2"]);
  assert.deepEqual(result.map((m) => m.system.rollOptions), [["Macro.a"], ["Macro.b"]]);
});

test("a player's attachment save passes the guard once the fields are kept", () => {
  const before = weapon({ attachments: [attachment("a1", "Rapid Recharge", [], [stored("m1", "Auto-fire", ["Macro.a"])])] });
  const saved = keepCopyFields(before.system.itemattachment[0].system.itemmodifier, [fromForm("Auto-fire")]);
  const after = weapon({ attachments: [attachment("a1", "Rapid Recharge", [], saved)] });
  assert.deepEqual(linkChangeVerdict(before, after, player), { ok: true });
});
