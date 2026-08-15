/**
 * Pure helpers for the crew-role settings form.
 *
 * Kept free of Foundry globals so the row-flattening logic can be unit tested; the dialog
 * itself lives in crew-settings.js.
 */

/**
 * Coerce one form field into a per-row array.
 *
 * FormDataExtended only builds an array when a field name appears more than once in the form,
 * so a form with a single role row hands back plain scalars. Reading `.length` off those
 * scalars is what used to shred a one-row form into one role per character.
 *
 * @param {any} value   The raw value pulled off the submitted form data
 * @param {number} rows The number of rows the form actually contained
 * @returns {any[]}     One entry per row
 */
function asRows(value, rows) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return new Array(rows).fill(undefined);
  return [value];
}

/**
 * Convert submitted crew-role form data into the array stored in the `arrayCrewRoles` setting.
 *
 * @param {object} formData Flattened submit data from the crew-role dialog
 * @param {object} [options]
 * @param {boolean} [options.keepBlank] Retain unnamed rows. Needed when reading the form back
 *   mid-edit (add/remove re-render), where dropping a row would shift the remaining row indices
 *   out from under the delete buttons. Saving drops them.
 * @returns {Array<{role_name: string, role_skill: string, use_handling: boolean, use_weapons: boolean}>}
 */
export function rolesFromFormData(formData = {}, { keepBlank = false } = {}) {
  const names = Array.isArray(formData.role_name)
    ? formData.role_name
    : formData.role_name === undefined || formData.role_name === null
      ? []
      : [formData.role_name];
  const rows = names.length;
  const skills = asRows(formData.role_skill, rows);
  const handling = asRows(formData.use_handling, rows);
  const weapons = asRows(formData.use_weapons, rows);

  const roles = [];
  for (let i = 0; i < rows; i++) {
    const role_name = String(names[i] ?? "").trim();
    // A blank name would render an unusable row on the vehicle sheet, so drop it.
    if (!role_name && !keepBlank) continue;
    roles.push({
      role_name,
      role_skill: String(skills[i] ?? ""),
      use_handling: Boolean(handling[i]),
      use_weapons: Boolean(weapons[i]),
    });
  }
  return roles;
}
