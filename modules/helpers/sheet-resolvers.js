/**
 * Per-user default sheets for optional sheet packages.
 *
 * Foundry's own default sheet is per world (core.sheetClasses). A package such as the Codex II
 * module lets each user pick a sheet style for themselves, so it registers a resolver here.
 * ActorFFG/ItemFFG._getSheetClass ask the resolvers whenever a document has no explicit ⚙ Sheet
 * choice (flags.core.sheetClass) and fall back to Foundry's default when none answers.
 */
const resolvers = new Map();

/**
 * Register, or replace, a package's resolver.
 * @param {string} packageId                        The registering package's id.
 * @param {(document: object) => Function|null} resolver  The sheet class for a document, or null.
 */
export function registerSheetResolver(packageId, resolver) {
  if (typeof packageId !== "string" || !packageId) throw new TypeError("registerSheetResolver: packageId must be a non-empty string");
  if (typeof resolver !== "function") throw new TypeError("registerSheetResolver: resolver must be a function");
  resolvers.set(packageId, resolver);
}

/** Whether a package has registered a resolver, i.e. whether it started. */
export function hasSheetResolver(packageId) {
  return resolvers.has(packageId);
}

/**
 * The first sheet class a resolver picks for this document, or null.
 * A resolver that throws is skipped: one broken package must not stop every sheet from opening.
 */
export function resolveSheetClass(document) {
  for (const [packageId, resolver] of resolvers) {
    try {
      const cls = resolver(document);
      if (cls) return cls;
    } catch (err) {
      CONFIG.logger?.warn?.(`sheet resolver "${packageId}" failed`, err);
    }
  }
  return null;
}
