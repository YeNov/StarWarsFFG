/**
 * The GM's roll option library run (docs/superpowers/specs/2026-10-20-roll-dialog-talents-design.md,
 * "The library run"). Started from a one-line script macro:
 *
 *   game.ffg.rollOptions.installLibrary()
 *
 * It creates the library's macros in a "Roll options" folder (never touching one already there,
 * even if the GM edited it), then links them into every matching talent and quality it can edit:
 * world items, world actors' items, unlinked tokens' items on every scene, and unlocked Item and
 * Actor compendiums. Locked compendiums are skipped and named. A place that already has a live link
 * is left alone, so running it again changes nothing. The decisions are in
 * roll-option-library-plan.js; this gathers the documents, applies the updates and reports.
 *
 * A player can read a GM's macro without permission on it (checked in Foundry 14, plan Task 0), so
 * the macros keep their default ownership.
 */
import { ROLL_OPTION_LIBRARY } from "../config/roll-option-library.js";
import { planItemLinks, planLibraryMacros } from "./roll-option-library-plan.js";

const SCOPE = "starwarsffg";

const escape = (text) => String(text ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Count the entries of `list` by `key(entry)`, in the order first met. */
function countBy(list, key) {
  const counts = new Map();
  for (const entry of list) counts.set(key(entry), (counts.get(key(entry)) ?? 0) + 1);
  return [...counts];
}

async function libraryFolder() {
  const name = game.i18n.localize("SWFFG.RollOptions.Library.FolderName");
  return game.folders.find((folder) => folder.type === "Macro" && folder.name === name)
    ?? Folder.create({ name, type: "Macro" });
}

/** The report, as a whispered chat message's content. */
function reportContent(report) {
  const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
  const names = new Map(ROLL_OPTION_LIBRARY.map((entry) => [entry.id, entry.names[0]]));
  const lines = [`<h3>${escape(t("SWFFG.RollOptions.Library.ReportTitle"))}</h3>`];

  lines.push(`<p>${escape(report.created.length > 0
    ? t("SWFFG.RollOptions.Library.ReportCreated", { names: report.created.join(", ") })
    : t("SWFFG.RollOptions.Library.ReportNoneCreated"))}</p>`);

  if (report.linked.length > 0) {
    lines.push(`<p>${escape(t("SWFFG.RollOptions.Library.ReportLinked", { count: report.linked.length }))}</p>`);
    const byEntry = countBy(report.linked, (link) => names.get(link.entryId) ?? link.entryId);
    lines.push(`<ul>${byEntry.map(([name, count]) => `<li>${escape(name)}: ${count}</li>`).join("")}</ul>`);
    lines.push(`<p>${escape(t("SWFFG.RollOptions.Library.ReportWhere"))}</p>`);
    const byWhere = countBy(report.linked, (link) => link.where);
    lines.push(`<ul>${byWhere.map(([where, count]) => `<li>${escape(where)}: ${count}</li>`).join("")}</ul>`);
  } else {
    lines.push(`<p>${escape(t("SWFFG.RollOptions.Library.ReportNoneLinked"))}</p>`);
  }

  if (report.lockedPacks.length > 0) {
    lines.push(`<p>${escape(t("SWFFG.RollOptions.Library.ReportSkippedLocked", { packs: report.lockedPacks.join(", ") }))}</p>`);
  }
  for (const pack of report.modulePacks) {
    lines.push(`<p>${escape(t("SWFFG.RollOptions.Library.ModuleCompendiumNote", { pack }))}</p>`);
  }
  if (report.errors.length > 0) {
    lines.push(`<p>${escape(t("SWFFG.RollOptions.Library.ReportErrors"))}</p>`);
    lines.push(`<ul>${report.errors.map((error) => `<li>${escape(error)}</li>`).join("")}</ul>`);
  }
  return lines.join("");
}

/**
 * Install the roll option library: create its macros and link them into matching items.
 * @returns {Promise<object|null>} the report, or null when not a GM or cancelled
 */
export async function installRollOptionLibrary() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SWFFG.RollOptions.Library.GMOnly"));
    return null;
  }
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("SWFFG.RollOptions.Library.ConfirmTitle") },
    content: `<p>${escape(game.i18n.localize("SWFFG.RollOptions.Library.ConfirmBody"))}</p>`,
  });
  if (!confirmed) return null;

  const report = { created: [], linked: [], lockedPacks: [], modulePacks: [], errors: [] };

  // 1. The library's macros: reuse every one already in the world, create the rest.
  const existing = game.macros
    .filter((macro) => macro.getFlag(SCOPE, "rollOptionLibraryId"))
    .map((macro) => ({ uuid: macro.uuid, libraryId: macro.getFlag(SCOPE, "rollOptionLibraryId") }));
  const { create, uuidByEntry } = planLibraryMacros(ROLL_OPTION_LIBRARY, existing);
  if (create.length > 0) {
    const folder = await libraryFolder();
    const created = await Macro.createDocuments(create.map((entry) => ({
      name: entry.macroName,
      type: "script",
      command: JSON.stringify(entry.options, null, 2),
      folder: folder?.id ?? null,
      flags: { [SCOPE]: { rollOption: true, rollOptionLibraryId: entry.id } },
    })));
    for (const macro of created) {
      uuidByEntry.set(macro.getFlag(SCOPE, "rollOptionLibraryId"), macro.uuid);
      report.created.push(macro.name);
    }
  }

  // 2. Link them wherever a matching talent or quality has no live link.
  const isLive = (uuid) => {
    try {
      return !!foundry.utils.fromUuidSync(uuid);
    } catch {
      return false;
    }
  };
  const linkItem = async (item, where) => {
    try {
      const { update, linked } = planItemLinks(item.toObject(), { uuidByEntry, isLive });
      if (!update) return 0;
      await item.update(update);
      for (const link of linked) report.linked.push({ ...link, where });
      return linked.length;
    } catch (error) {
      report.errors.push(`${where}: ${item.name}: ${error?.message ?? error}`);
      return 0;
    }
  };

  const worldItems = game.i18n.localize("SWFFG.RollOptions.Library.WorldItems");
  for (const item of game.items) await linkItem(item, worldItems);
  for (const actor of game.actors) {
    for (const item of actor.items) await linkItem(item, actor.name);
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      for (const item of token.actor.items) await linkItem(item, `${scene.name}: ${token.name}`);
    }
  }
  for (const pack of game.packs) {
    if (pack.documentName !== "Item" && pack.documentName !== "Actor") continue;
    if (pack.locked) {
      report.lockedPacks.push(pack.title);
      continue;
    }
    let linkedHere = 0;
    for (const doc of await pack.getDocuments()) {
      if (pack.documentName === "Item") linkedHere += await linkItem(doc, pack.title);
      else for (const item of doc.items) linkedHere += await linkItem(item, `${pack.title}: ${doc.name}`);
    }
    if (linkedHere > 0 && pack.metadata?.packageType === "module") report.modulePacks.push(pack.title);
  }

  // 3. Tell the GM what happened.
  await ChatMessage.create({
    content: reportContent(report),
    whisper: game.users.filter((user) => user.isGM).map((user) => user.id),
  });
  return report;
}
