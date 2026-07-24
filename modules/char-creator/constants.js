/**
 * PC Wizard shared constants — the single source of truth (plan §0.6.2 / §0.6.4).
 *
 * This module imports NOTHING and is imported by draft-schema.js, notify-policy.js,
 * wizard-state.js, source-descriptors.js, validate.js, to-item-data.js and
 * commit-normalize.js. Duplicating any of these values to satisfy the rule-7
 * import closure is forbidden — the closure explicitly allows importing this file.
 */

/**
 * The socket channel the wizard shares with the rest of the system. The GM bridge
 * (modules/helpers/gm-bridge.js) already listens here and dispatches on `data.event`;
 * the wizard adds its OWN listener and MUST filter on `data.eventType === SOCKET_EVENT_TYPE`
 * first, so the two never fight over the channel (plan §0.9).
 */
export const SOCKET_CHANNEL = "system.starwarsffg";

/** Discriminator every wizard socket payload carries in `eventType` (plan §0.9). */
export const SOCKET_EVENT_TYPE = "pcWizard";

/**
 * Wizard socket event names, carried in `data.event`. Verified NON-COLLIDING with
 * the GM bridge's event names ("ffgApplyToTarget", "ffgUpdateMessage",
 * "ffgCritRecovery") — see constants.test.mjs, which asserts the disjointness.
 */
export const SOCKET_EVENTS = Object.freeze({
  startNotice: "startNotice",
  startNoticeAck: "startNoticeAck",
  commitRequest: "commitRequest",
  commitResponse: "commitResponse",
});

/** Flag scope + keys on the player's own User / the created Actor. */
export const FLAG_SCOPE = "starwarsffg";
export const FLAGS = Object.freeze({
  draft: "pcWizardDraft",
  sourceSelection: "pcWizardSourceSelection",
  commit: "pcWizardCommit",
});

/** Draft serialization schema version (draft-schema.js migrates older records). */
export const DRAFT_SCHEMA_VERSION = 1;

/** Draft-size budget, in binary KiB / UTF-8 bytes (owner-confirmed 2026-07-21). */
export const DRAFT_MAX_BYTES = 65536; // 64 KiB

/** How long a client waits for an authenticated commitResponse before giving up. */
export const COMMIT_TIMEOUT_MS = 15000;

/** Minimum spacing between repeat start-notice emissions while pending (D9). */
export const START_NOTICE_SPACING_MS = 30000;
