/** This package's id; also the id of its per-user sheet resolver in the system. */
export const CODEX_PACKAGE_ID = "kelborns-swffg-codex-ii";

/**
 * Where this package's files are served from, relative to Foundry's data folder: the system's
 * codex/ folder while Codex ships inside the system, the module's own folder once it is a module.
 */
export const CODEX_ROOT = "systems/starwarsffg/codex";

/** The version stylesheet links carry, so a new release is not served from the browser cache. */
export function codexVersion() {
  return game.modules?.get?.(CODEX_PACKAGE_ID)?.version ?? game.system.version;
}
