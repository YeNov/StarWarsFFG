import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The planner is unit tested in quality-effect-plan.test.mjs. What that cannot cover is
 * whether the call sites actually route through it -- the original bug was not a bad
 * calculation, it was six places each patching effects their own way. These assertions pin
 * the wiring: every path that changes an item's qualities must reconcile afterwards, and no
 * path may go back to pushing a change whose key might be undefined.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const itemSheet = read("modules/items/item-sheet-ffg.js");
const itemEditor = read("modules/items/item-editor.js");
const itemFfg = read("modules/items/item-ffg.js");
const modifiers = read("modules/helpers/modifiers.js");
const main = read("modules/swffg-main.js");

test("dropping a quality reconciles the parent instead of copying the dropped item's effects", () => {
  assert.match(
    itemSheet,
    /await obj\.update\(formData\);[\s\S]{0,700}?await ItemHelpers\.reconcileModifierEffects\(obj\);/,
  );
});

test("the drop handler no longer branches into a rank-only path that cannot create an effect", () => {
  // syncAEStatus only ever updates effects that already exist, so the rank-only branch left a
  // freshly-stacked quality with no effect at all
  assert.doesNotMatch(itemSheet, /rankOnlyUpdate/);
});

test("deleting a quality awaits the update, then reconciles what is left", () => {
  assert.match(
    itemSheet,
    /await this\.object\.update\(formData\);\s*await ItemHelpers\.reconcileModifierEffects\(this\.object\);/,
  );
});

test("the quality editor reconciles rather than patching the one effect it matched by name", () => {
  assert.match(
    itemEditor,
    /await this\.data\.sourceObject\.update\(\{system: \{itemmodifier: updateData\}\}\);\s*(?:\/\/[^\n]*\n\s*)*await ItemHelpers\.reconcileModifierEffects\(this\.data\.sourceObject\);/,
  );
});

test("the attachment editor branch reconciles too", () => {
  assert.match(
    itemEditor,
    /await this\.data\.sourceObject\.update\(\{system: \{itemattachment: updateData\}\}\);\s*(?:\/\/[^\n]*\n\s*)*await ItemHelpers\.reconcileModifierEffects\(this\.data\.sourceObject\);/,
  );
});

test("equipping reconciles without triggering a re-entrant item write", () => {
  assert.match(
    itemFfg,
    /reconcileModifierEffects\(this, \{ applyRenames: false \}\)/,
  );
});

test("no effect-building site pushes a key it has not checked", () => {
  // `key: ModifierHelpers.getModKeyPath(...)` inline in a change literal is the shape that
  // persisted keyless changes -- getModKeyPath returns undefined for an unrecognised mod
  for (const [name, source] of Object.entries({ itemEditor, itemFfg, modifiers })) {
    assert.doesNotMatch(
      source,
      /key: ModifierHelpers\.getModKeyPath\(/,
      `${name} still builds a change key without guarding against undefined`,
    );
  }
});

test("every remaining getModKeyPath result is guarded before use", () => {
  for (const [name, source] of Object.entries({ itemEditor, itemFfg, modifiers })) {
    const uses = source.match(/const (\w+) = ModifierHelpers\.getModKeyPath\([^)]*\);/g) ?? [];
    assert.ok(uses.length > 0, `${name} should still resolve mod key paths`);
  }
  // the three sites fixed here each guard with an early continue
  assert.match(itemEditor, /if \(!key\) continue;/);
  assert.match(itemFfg, /if \(!key\) continue;/);
  assert.match(modifiers, /if \(!modPath\) continue;/);
});

test("an effect is only deleted when its attribute is gone, not when it yields no key", () => {
  // The distinction that stops the reconciler wiping the placeholder effect of every damage /
  // boost / setback modifier in a world -- `ownedNames`, not `desired`, is the deletion test.
  const helpers = read("modules/helpers/item-helpers.js");
  assert.match(
    helpers,
    /for \(const leftover of bySystemName\.values\(\)\) \{\s*(?:\/\/[^\n]*\n\s*)*if \(!plan\.ownedNames\.has\(leftover\.name\)\) toDelete\.push\(leftover\);/,
  );
});

test("the repair pass is exposed to a GM on the system namespace", () => {
  // Object.assign, not mergeObject: mergeObject deep-clones values on its way through, which
  // is not something to route function references into for no benefit
  assert.match(main, /game\.starwarsffg = Object\.assign\(game\.starwarsffg \?\? \{\}, \{/);
  assert.match(main, /repairModifierEffects: \(options\) => ItemHelpers\.repairModifierEffects\(options\)/);
});

test("swffg-main imports the helper it now calls", () => {
  assert.match(main, /^import ItemHelpers from "\.\/helpers\/item-helpers\.js";$/m);
});
