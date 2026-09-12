import { createStatStepCoordinator, statStepSnapshot, statStepState } from "./stat-step-coordinator.js";
import ActorHelpers from "./actor-helpers.js";

const sheets = new Set();
const coordinator = createStatStepCoordinator({
  getUserId: () => game.user.id,
  getUsers: () => game.users,
  resolveActor: (uuid) => fromUuid(uuid),
  snapshot: statStepSnapshot,
  state: (actor, path, sender) => {
    const requesterEditing = ActorHelpers.isEditModeOwner(actor, sender);
    const writerEditing = ActorHelpers.isEditModeOwner(actor, game.user.id);
    if (requesterEditing === writerEditing) return statStepState(actor, path);
    if (requesterEditing) {
      // The editing user sees raw values, even when the GM sees effects.
      return statStepState({ type: actor.type, ...actor._source, _source: actor._source }, path);
    }
    // Conversely, a GM editing the actor has suppressed its effects locally.
    // Prepare a non-persisted copy for a requester who is in play mode.
    const prepared = actor.clone({ "flags.starwarsffg.config.enableEditMode": false }, { keepId: true });
    return statStepState(prepared, path);
  },
  write: (actor, changes) => actor.update(changes),
  makeRequestId: () => foundry.utils.randomID(24),
  send: (data) => game.socket.emit("system.starwarsffg", data),
  onChange: (uuid) => {
    for (const sheet of sheets) if (sheet.actor?.uuid === uuid) paint(sheet);
  },
});

/** Prediction changes only the chip's display, never the document or form data. */
function paint(sheet) {
  for (const chip of sheet.form?.querySelectorAll(".cdx-ratio[data-cdx-path]") ?? []) {
    const path = chip.dataset.cdxPath;
    const value = coordinator.value(sheet.actor, path);
    if (value === undefined) continue;
    const current = chip.querySelector(".cdx-ratio-c");
    if (current?.tagName === "INPUT") {
      if (document.activeElement !== current) current.value = String(value);
    } else if (current) current.textContent = String(value);
    if (chip.classList.contains("cdx-ratio-hot")) {
      const max = Number(sheet.actor.system.stats.speed.max) || 0;
      const pct = max > 0 ? Math.max(0, Math.min(100, Math.round(value / max * 100))) : 0;
      chip.querySelector(".cdx-chip-box")?.style.setProperty("background", `color-mix(in srgb, #e8451c ${pct}%, var(--cdx-paper2))`);
    }
  }
}

export function bindStatStepPrediction(sheet) {
  sheets.add(sheet);
  paint(sheet);
  return () => sheets.delete(sheet);
}

export function adjustCodexStat(actor, path, delta) {
  return coordinator.adjust(actor, path, delta);
}

export function predictedCodexStat(actor, path) {
  return coordinator.value(actor, path);
}

export function registerStatStepBridge() {
  game.socket.on("system.starwarsffg", (data, sender) => {
    coordinator.receive(data, sender).catch((error) => CONFIG.logger.warn("Codex stat request failed", error));
  });
  // Receipts travel in the SAME document update as the stat. This handles both
  // update-before-reply and reply-before-update without counting a click twice.
  Hooks.on("updateActor", (actor) => coordinator.observe(actor.uuid, statStepSnapshot(actor)));
}
