/**
 * What the GM's library run creates and links (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "The library run").
 *
 * The run creates one world macro per library entry that has none yet, and links that macro into
 * every place a matching talent or quality lives: the talent and quality items themselves, the
 * qualities on weapons, armour and attachments, the modifications inside attachments installed on
 * weapons and armour, and specialization tree nodes, learned or not. Species only hold references
 * to their talents and are skipped. A place is linked only when it has no live link: none, or only
 * links to macros that no longer exist. A library macro still holding an earlier library text
 * (`entry.previous`) gets the current one in place, so its links stay good; one the GM edited is
 * left alone, and named when its entry's text changed. Running it again changes nothing.
 *
 * Plain data in, updates out; the runner (roll-option-library-run.js) gathers the documents and
 * applies the result. Free of Foundry globals, so Node covers it
 * (tests/node/roll-option-library-plan.test.mjs).
 */
import { libraryEntryFor } from "../config/roll-option-library.js";

/**
 * A library entry's macro text, as the run writes it when it creates or updates the macro.
 * @param {{options: object[]}} entry
 * @returns {string}
 */
export function libraryMacroText(entry) {
  return JSON.stringify(entry.options, null, 2);
}

/** A value with its object keys sorted, so key order does not tell two option texts apart. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** The macro text's options in canonical form, or null when it is not JSON. */
function parsedText(command) {
  try {
    return JSON.stringify(canonical(JSON.parse(command)));
  } catch {
    return null;
  }
}

/**
 * Which library macros to create, which to update in place, which the GM edited, and the uuid of
 * each entry's macro once it exists.
 *
 * New links point at the first macro of each entry. Every macro is checked against its entry: one
 * still holding an earlier library text (`entry.previous`; key order and spacing aside) was never
 * edited and gets the current text; one holding neither the current text nor an earlier one was
 * edited, and is listed only when its entry's text has changed, so the GM hears about it.
 * @param {Array<{id: string, options: object[], previous?: object[][]}>} entries - the library
 * @param {Array<{uuid: string, libraryId: string, command?: string}>} existing - library macros already in the world
 * @returns {{create: Array<object>, uuidByEntry: Map<string, string>,
 *   update: Array<{uuid: string, entryId: string, command: string}>, edited: Array<{uuid: string, entryId: string}>}}
 */
export function planLibraryMacros(entries, existing) {
  const byId = new Map((entries ?? []).map((entry) => [entry.id, entry]));
  const uuidByEntry = new Map();
  const update = [];
  const edited = [];
  for (const { uuid, libraryId, command } of existing ?? []) {
    if (!uuid || !libraryId) continue;
    if (!uuidByEntry.has(libraryId)) uuidByEntry.set(libraryId, uuid);
    const entry = byId.get(libraryId);
    const previous = entry?.previous ?? [];
    if (!entry || previous.length === 0) continue;
    const text = parsedText(command);
    if (text !== null && text === JSON.stringify(canonical(entry.options))) continue;
    if (text !== null && previous.some((earlier) => text === JSON.stringify(canonical(earlier)))) {
      update.push({ uuid, entryId: libraryId, command: libraryMacroText(entry) });
    } else {
      edited.push({ uuid, entryId: libraryId });
    }
  }
  return { create: (entries ?? []).filter((entry) => !uuidByEntry.has(entry.id)), uuidByEntry, update, edited };
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
