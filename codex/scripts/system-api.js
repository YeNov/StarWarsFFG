/**
 * The one door from Codex II into the Star Wars FFG system. codex-main.js imports this module
 * first, so when the check fails the throw below stops every other Codex script from being
 * evaluated: no sheet, setting, hook or stylesheet is registered, and Foundry keeps the classic
 * sheets. The GM is told why at ready.
 */
import { LOADED_MARK, apiProblemMessage, checkSystemApi } from "./api-check.js";

const result = checkSystemApi(globalThis.starwarsffg, globalThis[LOADED_MARK]);
if (!result.ok) {
  Hooks.once("ready", () => {
    if (game.user?.isGM) ui.notifications.error(apiProblemMessage(result), { permanent: true });
  });
  throw new Error(`Codex II did not start: ${result.reason}`);
}
globalThis[LOADED_MARK] = import.meta.url;

/** The system's public API (modules/api/public-api.js in the system), frozen. */
export const systemApi = globalThis.starwarsffg;
