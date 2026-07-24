/**
 * Convert a SelectionRef into a canonical embedded-item source (issue E, N-5..N-7).
 *
 * Covered (plan §0.6.2). Imports build-item-schema.js (Covered→Covered) and
 * config/ffg-active-effect-modes.js (a named, import-clean exception) — both allowed
 * by the rule-7 closure §0.6.4.
 *
 * DEV-15 — mandatory: this module MUST NOT import helpers/item-helpers.js (proven
 * poisoned). The tree materializer arrives by INJECTION as `options.materializeTree`;
 * production binds the real ItemHelpers.materializeTreePurchases through build-deps.js
 * (DEV-16), and Node tests pass a fake. Rule 7 enforces the boundary.
 */

import { AE_MODES } from "../config/ffg-active-effect-modes.js";
import { projectItemSource } from "./build-item-schema.js";

/**
 * Bake free skill-rank grants deterministically onto an item source (issue E).
 * The legacy code used `attr${Date.now()}` attributes + one AE per rank, which is
 * non-deterministic; this uses `pcwRank<n>_<skillSlug>` attributes and the same
 * effect shape `{key: system.skills.<skill>.rank, mode: ADD, value: 1}`, one per rank.
 * The attribute NAME is slugged; the `mod` and effect `key` use the real skill key.
 *
 * @param {object} source     an item source (mutated)
 * @param {string[]} rankGrants  skill keys, one entry per granted rank
 */
function bakeRankGrants(source, rankGrants) {
  source.system ??= {};
  source.system.attributes ??= {};
  source.effects ??= [];
  rankGrants
    .map((skillKey) => String(skillKey ?? "").trim())
    .filter((skillKey) => skillKey && skillKey.toLowerCase() !== "(none)")
    .forEach((skillKey, n) => {
      const slug = String(skillKey).replace(/[^a-zA-Z0-9]/g, "");
      const attrName = `pcwRank${n}_${slug}`;
      source.system.attributes[attrName] = { modtype: "Skill Rank", mod: skillKey, value: 1 };
      source.effects.push({
        name: attrName,
        changes: [{ key: `system.skills.${skillKey}.rank`, mode: AE_MODES.ADD, value: 1 }],
      });
    });
}

/**
 * Produce a canonical embedded-item source from a SelectionRef.
 *
 * Steps, in order:
 *  1. deep-clone the ref's snapshot (never mutate the stored snapshot — BUG-1 safe);
 *  2. for a tree item with purchased nodes, materialize the tree via the INJECTED
 *     materializer (islearned + synced effects — N-5/N-7); its result is used as-is;
 *  3. bake any free skill-rank grants deterministically (issue E);
 *  4. projectItemSource() is the final mapping step (strips source identity).
 *
 * @param {{uuid, name, type, img, snapshot}} ref
 * @param {object} [options]
 * @param {(source: object, learnedKeys: string[]) => object} [options.materializeTree]
 * @param {string[]} [options.learnedKeys]  purchased node keys for a tree item
 * @param {string[]} [options.rankGrants]   skill keys granted as free ranks
 * @returns {object} the canonical item source
 */
export function toItemData(ref, options = {}) {
  const { materializeTree, learnedKeys = [], rankGrants = [] } = options;

  let source = foundry.utils.deepClone(ref.snapshot);

  if (learnedKeys.length && typeof materializeTree === "function") {
    source = materializeTree(source, learnedKeys);
  }

  if (rankGrants.length) {
    bakeRankGrants(source, rankGrants);
  }

  return projectItemSource(source);
}
