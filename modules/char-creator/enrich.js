/**
 * Rich-text helpers for the PC Wizard (BUG-4).
 *
 * The legacy wizard dropped raw item descriptions straight into the DOM with
 * jQuery `.text()` (culture/hook/force-attitude) and rendered escaped `{{description}}`
 * tooltips, so HTML markup leaked as literal tags. These helpers enrich or strip
 * that markup instead.
 *
 * NOT Node-testable and explicitly OUTSIDE the rule-7 import closure — both rely on
 * live Foundry / DOM globals (TextEditor, DOMParser) that the Node stub must never
 * install. Verified at Stage 23.
 */

/**
 * Enrich an item/description HTML string into display-ready HTML (resolves @UUID
 * links, inline rolls, etc.).
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function enrichDescription(html) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? "");
}

/**
 * Strip all HTML markup, returning the plain text content — for contexts that must
 * not render tags (e.g. compact list labels).
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  const parsed = new DOMParser().parseFromString(html ?? "", "text/html");
  return parsed.body.textContent ?? "";
}
