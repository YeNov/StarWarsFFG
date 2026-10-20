/**
 * Whether Codex II can run on the system it was loaded into. Pure, so Node tests can call it;
 * system-api.js acts on the answer.
 */

/** The public API version (modules/api/public-api.js in the system) this Codex was written for. */
export const REQUIRED_API_VERSION = 2;

/** Set on globalThis by the first Codex copy to start, so a second copy can stand down. */
export const LOADED_MARK = Symbol.for("kelborns-swffg-codex-ii.loaded");

/**
 * @param {object|undefined} api         globalThis.starwarsffg
 * @param {string|undefined} loadedFrom  The URL of a Codex copy that already started, if any.
 * @returns {{ok: true} | {ok: false, reason: "duplicate"|"missing"|"version", detail?: unknown}}
 */
export function checkSystemApi(api, loadedFrom) {
  if (loadedFrom) return { ok: false, reason: "duplicate", detail: loadedFrom };
  if (!api || typeof api !== "object" || typeof api.apiVersion !== "number") return { ok: false, reason: "missing" };
  if (api.apiVersion !== REQUIRED_API_VERSION) return { ok: false, reason: "version", detail: api.apiVersion };
  return { ok: true };
}

/** The GM-facing explanation of a failed check. */
export function apiProblemMessage(result) {
  switch (result.reason) {
    case "duplicate":
      return "Codex II is loaded twice: this Star Wars FFG version still includes it. Disable the Codex II module in Manage Modules.";
    case "missing":
      return "Codex II needs Star Wars FFG 2.2.0 or later. Update the system, or disable the Codex II module.";
    case "version":
      // Which side is behind decides the fix: updating the module cannot help an older system.
      return result.detail < REQUIRED_API_VERSION
        ? `This Codex II version needs a newer Star Wars FFG (system API ${result.detail}, Codex II needs ${REQUIRED_API_VERSION}). Update the system, or install an older Codex II version.`
        : `This Codex II version is too old for this Star Wars FFG (system API ${result.detail}, Codex II needs ${REQUIRED_API_VERSION}). Update the Codex II module.`;
    default:
      return "Codex II could not start.";
  }
}
