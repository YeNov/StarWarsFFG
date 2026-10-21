import test from "node:test";
import assert from "node:assert/strict";

import "./_stub/foundry-stub.mjs";
import {
  addLink, copyIdentity, linkChangeVerdict, nodeIdentity, removeLink, withCopyLinks,
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
