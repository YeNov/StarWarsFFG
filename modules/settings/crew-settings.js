import { FFGFormApplication } from "../apps/ffg-form-application.js";
import { rolesFromFormData } from "./crew-roles-form.js";

/**
 * Add a blank role to the working set and re-render.
 *
 * Rows are rendered by the template rather than injected by script, so adding one means
 * mutating the working state and re-rendering. In-progress edits are pulled off the form
 * first so they survive the re-render.
 *
 * @this {CrewSettings}
 * @param {PointerEvent} event
 */
function onAddRole(event) {
  event.preventDefault();
  this._syncWorkingState();
  this._roles.push({
    role_name: game.i18n.localize("SWFFG.Crew.Role.New"),
    role_skill: this._skillChoices()[0] ?? "",
    use_handling: false,
    use_weapons: false,
  });
  this.render();
}

/**
 * Remove the clicked role from the working set and re-render.
 *
 * @this {CrewSettings}
 * @param {PointerEvent} event
 * @param {HTMLElement} target
 */
function onRemoveRole(event, target) {
  event.preventDefault();
  const index = Number(target.dataset.index);
  if (!Number.isInteger(index)) return;
  this._syncWorkingState();
  this._roles.splice(index, 1);
  this.render();
}

/**
 * Restore the shipped default roles and close.
 *
 * @this {CrewSettings}
 * @param {PointerEvent} event
 */
async function onResetDefaults(event) {
  event.preventDefault();
  const defaults = game.settings.settings.get("starwarsffg.arrayCrewRoles").default;
  await game.settings.set("starwarsffg", "arrayCrewRoles", foundry.utils.duplicate(defaults));
  this.close();
}

export default class CrewSettings extends FFGFormApplication {
  static DEFAULT_OPTIONS = {
    id: "crew-settings",
    classes: ["starwarsffg", "data-import"],
    window: {
      title: "SWFFG.UISettingsLabel",
      resizable: true,
      contentClasses: ["crew-settings-window"],
    },
    position: {
      width: 480,
      height: 400,
    },
    form: {
      closeOnSubmit: true,
    },
    actions: {
      addRole: onAddRole,
      removeRole: onRemoveRole,
      resetDefaults: onResetDefaults,
    },
  };

  static PARTS = {
    content: {
      root: true,
      template: "systems/starwarsffg/templates/dialogs/crew-settings.html",
    },
  };

  /** Keep the initiative field and the footer buttons reachable when resized down. */
  static MIN_DIMENSIONS = { width: 380, height: 260 };

  /** The role list being edited, seeded from the setting on first render. */
  _roles = null;

  /** The initiative role name being edited, seeded from the setting on first render. */
  _initiativeRoleName = null;

  /**
   * The skill names offered in the per-role dropdown.
   * @returns {string[]}
   */
  _skillChoices() {
    return Object.values(CONFIG.FFG.skills ?? {}).map((skill) => skill.value);
  }

  /**
   * Pull the currently displayed rows back into the working state.
   *
   * Called before any add/remove re-render so unsaved edits are not discarded.
   */
  _syncWorkingState() {
    if (!this.form) return;
    const formData = this._getSubmitData();
    this._roles = rolesFromFormData(formData, { keepBlank: true });
    if (formData.initiativeCrewRole !== undefined) {
      this._initiativeRoleName = String(formData.initiativeCrewRole);
    }
  }

  async _prepareContext(_options) {
    if (this._roles === null) {
      this._roles = foundry.utils.duplicate(game.settings.get("starwarsffg", "arrayCrewRoles") ?? []);
    }
    if (this._initiativeRoleName === null) {
      this._initiativeRoleName = game.settings.get("starwarsffg", "initiativeCrewRole")?.role_name ?? "";
    }

    const skills = this._skillChoices();
    const roles = this._roles.map((role) => ({
      ...role,
      skillOptions: skills.map((value) => ({ value, selected: value === role.role_skill })),
    }));

    return {
      user: game.user,
      canConfigure: game.user.can("SETTINGS_MODIFY"),
      systemTitle: game.system.title,
      roles: roles,
      data: {
        system: { title: game.system.title },
        initiativeRole: { role_name: this._initiativeRoleName },
      },
    };
  }

  /** @override */
  async _updateObject(event, formData) {
    await game.settings.set("starwarsffg", "arrayCrewRoles", rolesFromFormData(formData));
    await game.settings.set("starwarsffg", "initiativeCrewRole", {
      role_name: formData["initiativeCrewRole"] ?? "",
      role_skill: undefined,
      use_weapons: false,
      use_handling: false,
    });
  }
}
