/**
 * What the GM's library run creates and links (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "The library run").
 *
 * The run creates one world macro per library entry that has none yet, and links that macro into
 * every place a matching talent or quality lives: the talent and quality items themselves, the
 * qualities on weapons, armour and attachments, the modifications inside attachments installed on
 * weapons and armour, and specialization tree nodes, learned or not. Species only hold references
 * to their talents and are skipped. A place is linked only when it has no live link: none, or only
 * links to macros that no longer exist. Running it again changes nothing.
 *
 * Plain data in, updates out; the runner (roll-option-library-run.js) gathers the documents and
 * applies the result. Free of Foundry globals, so Node covers it
 * (tests/node/roll-option-library-plan.test.mjs).
 */
import { libraryEntryFor } from "../config/roll-option-library.js";

/**
 * Which library macros to create, and the uuid of each entry's macro once it exists.
 * @param {Array<{id: string}>} entries - the library
 * @param {Array<{uuid: string, libraryId: string}>} existing - library macros already in the world
 * @returns {{create: Array<object>, uuidByEntry: Map<string, string>}}
 */
export function planLibraryMacros(entries, existing) {
  const uuidByEntry = new Map();
  for (const { uuid, libraryId } of existing ?? []) {
    if (uuid && libraryId && !uuidByEntry.has(libraryId)) uuidByEntry.set(libraryId, uuid);
  }
  return { create: (entries ?? []).filter((entry) => !uuidByEntry.has(entry.id)), uuidByEntry };
}

/**
 * The links to add to one item, and the places they go.
 * @param {object} itemData - plain item data
 * @param {object} params
 * @param {Map<string, string>} params.uuidByEntry - library entry id → macro uuid
 * @param {(uuid: string) => boolean} params.isLive - whether a linked macro still exists
 * @returns {{update: object|null, linked: Array<{entryId: string, place: string}>}}
 */
export function planItemLinks(itemData, { uuidByEntry, isLive }) {
  const update = {};
  const linked = [];
  const system = itemData?.system ?? {};
  const type = itemData?.type;

  const hasLiveLink = (links) => Array.isArray(links) && links.some((uuid) => isLive(uuid));
  const macroFor = (kind, name) => {
    const entry = libraryEntryFor(kind, name);
    const uuid = entry ? uuidByEntry?.get(entry.id) : null;
    return uuid ? { entryId: entry.id, uuid } : null;
  };
  /** Qualities with their links added where they need one; null when none changed. */
  const linkQualities = (qualities, placePrefix) => {
    if (!Array.isArray(qualities)) return null;
    let changed = false;
    const next = qualities.map((quality) => {
      const found = macroFor("quality", quality?.name);
      if (!found || hasLiveLink(quality?.system?.rollOptions)) return quality;
      changed = true;
      linked.push({ entryId: found.entryId, place: `${placePrefix}quality:${quality.name}` });
      return { ...quality, system: { ...(quality.system ?? {}), rollOptions: [found.uuid] } };
    });
    return changed ? next : null;
  };

  if (type === "talent" || type === "itemmodifier") {
    const found = macroFor(type === "talent" ? "talent" : "quality", itemData.name);
    if (found && !hasLiveLink(system.rollOptions)) {
      update["system.rollOptions"] = [found.uuid];
      linked.push({ entryId: found.entryId, place: "item" });
    }
  }

  if (type === "weapon" || type === "armour" || type === "itemattachment") {
    const qualities = linkQualities(system.itemmodifier, "");
    if (qualities) update["system.itemmodifier"] = qualities;
  }

  if ((type === "weapon" || type === "armour") && Array.isArray(system.itemattachment)) {
    let changed = false;
    const attachments = system.itemattachment.map((attachment) => {
      const modifications = linkQualities(attachment?.system?.itemmodifier, `attachment:${attachment?.name}/`);
      if (!modifications) return attachment;
      changed = true;
      return { ...attachment, system: { ...(attachment.system ?? {}), itemmodifier: modifications } };
    });
    if (changed) update["system.itemattachment"] = attachments;
  }

  if (type === "specialization" && system.talents && typeof system.talents === "object") {
    for (const [slot, node] of Object.entries(system.talents)) {
      const found = macroFor("talent", node?.name);
      if (!found || hasLiveLink(node?.rollOptions)) continue;
      update[`system.talents.${slot}.rollOptions`] = [found.uuid];
      linked.push({ entryId: found.entryId, place: `tree:${slot}:${node.name}` });
    }
  }

  return { update: Object.keys(update).length > 0 ? update : null, linked };
}
