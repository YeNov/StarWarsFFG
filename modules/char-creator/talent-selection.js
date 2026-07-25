/**
 * PC Wizard talent-selection logic (pure, wizard-side).
 *
 * The shared connected-to-root engine (helpers/talent-tree.js `canPurchaseNode`) is the
 * single authority on the FFG purchase rule and is NOT modified or made wizard-aware. This
 * module only READS it, and layers the two wizard-specific operations on top:
 *
 *   - prepareTalentTree(): render-ready rows/cells for a specialization's tree.
 *   - canLearn():          the buy gate for one node (immediate-neighbour rule).
 *   - rootConnectedKeys():  the safe-unlearn support set — when a talent (or a whole
 *                           spec/career) is dropped, any learned talent that loses its
 *                           path to the root row is dropped with it.
 *
 * Specialization trees are a fixed 4-wide grid of `talent0..talentN-1`; row cost is the
 * FFG tier price (row+1)×5. No Foundry dependencies — Node-testable, imported only by the
 * composition root (pc-wizard.js), so it is outside the rule-7 Covered closure.
 */

import { canPurchaseNode } from "../helpers/talent-tree.js";
import { isDedicationTalent } from "./dedication.js";

const WIDTH = 4;

/** canPurchaseNode opts for a specialization tree of `total` nodes. */
const specOpts = (total) => ({ prefix: "talent", width: WIDTH, total, sizeAware: false });

/** FFG tier price: row 0 = 5, row 1 = 10, … row 4 = 25. */
export function talentTierCost(index) {
  return (Math.floor(index / WIDTH) + 1) * 5;
}

/** Resolve the document UUID retained by stock, compendium, and OggDude talent data. */
export function talentDocumentUuid(talent) {
  const source = typeof talent?.source === "string" ? talent.source.trim() : "";
  if (source) return source;

  const itemId = typeof talent?.itemId === "string" ? talent.itemId.trim() : "";
  if (!itemId) return "";

  const pack = typeof talent?.pack === "string" ? talent.pack.trim() : "";
  return pack ? `Compendium.${pack}.Item.${itemId}` : `Item.${itemId}`;
}

/** The real `talentN` keys of a talents dict, numerically ordered, `-=` deletions skipped. */
function talentKeys(talents) {
  return Object.keys(talents ?? {})
    .filter((key) => /^talent\d+$/.test(key))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
}

/** A shallow clone of the tree with `islearned` set to membership of `learnedSet`. */
function withLearned(talents, learnedSet) {
  const tree = {};
  for (const key of talentKeys(talents)) {
    tree[key] = { ...talents[key], islearned: learnedSet.has(key) };
  }
  return tree;
}

/**
 * The subset of `learnedSet` that is still connected to the root row.
 *
 * Computed as a fixpoint over the pure oracle rather than re-deriving the (size-aware,
 * link-directional) adjacency here: a learned node is root-connected iff it would be
 * purchasable when ONLY the already-confirmed root-connected nodes count as learned. Row-0
 * nodes seed the set (canPurchaseNode returns true for a spec's root row unconditionally);
 * each pass admits nodes that connect to the confirmed frontier until nothing new is added.
 *
 * @param {object} talents         a specialization's `system.talents` dict
 * @param {Set<string>} learnedSet the currently-learned node keys
 * @returns {Set<string>} the root-connected subset (orphans excluded)
 */
export function rootConnectedKeys(talents, learnedSet) {
  const total = talentKeys(talents).length;
  const connected = new Set();
  let added = true;
  while (added) {
    added = false;
    for (const key of learnedSet) {
      if (connected.has(key)) continue;
      const probe = withLearned(talents, connected); // only confirmed nodes count as learned
      probe[key].islearned = false;                  // the oracle evaluates an UNLEARNED candidate
      if (canPurchaseNode(probe, key, specOpts(total))) {
        connected.add(key);
        added = true;
      }
    }
  }
  return connected;
}

/** Whether an unlearned node may be bought given the current learned set. */
export function canLearn(talents, learnedSet, key) {
  if (learnedSet.has(key)) return false;
  const total = talentKeys(talents).length;
  return canPurchaseNode(withLearned(talents, learnedSet), key, specOpts(total));
}

/**
 * Render-ready tree: an array of rows, each `{ tier, cost, cells[] }`. Each cell carries the
 * node key, name, activation label and its learned / purchasable / affordable state.
 *
 * @param {object} talents      a specialization's `system.talents` dict
 * @param {string[]} learnedKeys the learned node keys (from data.purchases.xp.talents)
 * @param {number} availableXp  remaining XP, for the affordable flag
 * @returns {Array<{tier:number, cost:number, cells:Array<object>}>}
 */
export function prepareTalentTree(talents, learnedKeys, availableXp, { dedicationChoices = {}, characteristicChoices = [] } = {}) {
  const learnedSet = new Set(learnedKeys ?? []);
  const keys = talentKeys(talents);
  const total = keys.length;
  const probe = withLearned(talents, learnedSet);
  const rows = [];
  for (const key of keys) {
    const index = Number(key.slice(6));
    const row = Math.floor(index / WIDTH);
    const col = index % WIDTH;
    const node = talents[key];
    const islearned = learnedSet.has(key);
    const isDedication = isDedicationTalent(node);
    const cost = talentTierCost(index);
    const canPurchase = !islearned && canPurchaseNode(probe, key, specOpts(total));
    // Connectors are stored on the lower / left node: `links-top-1` joins upward to the talent
    // directly above, `links-right` joins to the next talent in the row. A connector is "active"
    // (drawn solid) when both endpoints are learned.
    const linkTop = Boolean(node?.["links-top-1"]);
    const linkRight = col < WIDTH - 1 && Boolean(node?.["links-right"]);
    if (!rows[row]) rows[row] = { tier: row + 1, cost, cells: [] };
    rows[row].cells.push({
      key,
      name: node?.name ?? "",
      activation: node?.activationLabel ?? node?.activation ?? "",
      description: node?.description ?? "",
      uuid: talentDocumentUuid(node),
      isDedication,
      dedicationCharacteristic: dedicationChoices[key] ?? "",
      characteristicChoices: isDedication
        ? characteristicChoices.map((choice) => ({ ...choice, selected: choice.key === dedicationChoices[key] }))
        : [],
      islearned,
      canPurchase,
      cost,
      affordable: cost <= availableXp,
      locked: !islearned && !canPurchase,
      linkTop,
      linkRight,
      linkTopActive: linkTop && islearned && learnedSet.has(`talent${index - WIDTH}`),
      linkRightActive: linkRight && islearned && learnedSet.has(`talent${index + 1}`),
    });
  }
  return rows;
}
