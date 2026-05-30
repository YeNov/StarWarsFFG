import ActorHelpers from "../helpers/actor-helpers.js";
import { DialogV2Compat } from "../apps/dialog-v2-compat.js";

export default class ActorOptions {
  constructor(data, html) {
    this.data = data;
    this.options = {};
    this.init(html);
    this.suspended = {};
  }

  init(html) {
    const root = this._findSheetRoot(html);
    if (!root || root.querySelector(":scope > .window-header > .ffg-sheet-options")) return;

    const header = root.querySelector(":scope > .window-header");
    if (!header) return;

    const button = document.createElement("a");
    button.href = "#";
    button.classList.add("ffg-sheet-options");
    if (root.classList.contains("application")) button.classList.add("legacy-header-action");
    button.innerHTML = `<i class="fas fa-wrench"></i>${game.i18n.localize("SWFFG.SheetOptions")}`;
    button.addEventListener("click", this.handler.bind(this));

    const anchor = header.querySelector(":scope > a, :scope > button, :scope > [data-action]") ?? header.lastElementChild;
    header.insertBefore(button, anchor);
  }

  _findSheetRoot(html) {
    const appId = `${this.data.appId}`;
    const candidates = [];
    const addAncestors = (element) => {
      for (let node = element; node && node !== document; node = node.parentElement) {
        if (
          node.dataset?.appid === appId
          && node.classList?.contains("starwarsffg")
          && node.classList.contains("sheet")
          && node.classList.contains("actor")
        ) {
          candidates.push(node);
        }
      }
    };

    const sheetElement = this.data.element?.jquery ? this.data.element[0] : this.data.element;
    const htmlElement = html?.jquery ? html[0] : html?.[0] ?? html;
    addAncestors(sheetElement);
    addAncestors(htmlElement);
    candidates.push(...document.querySelectorAll(`.starwarsffg.sheet.actor[data-appid="${appId}"]`));

    return candidates.find((element) => element.querySelector(":scope > .window-header")) ?? candidates[0] ?? null;
  }

  handler(event) {
    const title = `${game.i18n.localize("SWFFG.CharacterSheet")} ${game.i18n.localize("SWFFG.Options")}: ${this.data.actor.name}`;

    new DialogV2Compat(
      {
        title,
        content: {
          options: this.options,
        },
        buttons: {
          one: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("SWFFG.ButtonAccept"),
            callback: async (html) => {
              const controls = html.find("input, select");

              let updateObject = {};

              for (let i = 0; i < controls.length; i += 1) {
                const control = controls[i];
                let value;
                if (control.dataset["dtype"] === "Boolean") {
                  value = control.checked;
                } else {
                  value = control.value;
                }

                updateObject[`flags.starwarsffg.${control.name}`] = value;
                this.options[control.id].value = value;
              }

              // read the most recent version, not the registered flag version
              const editMode = updateObject['flags.starwarsffg.config.enableEditMode'];
              if (editMode) {
                if (Object.keys(this.suspended).length === 0) {
                  // suspend AEs
                  this.suspended = await ActorHelpers.beginEditMode(this.data.object);
                  updateObject[`flags.starwarsffg.config.editModeActor`] = game.user.id;
                }
              } else {
                // unsuspend AEs
                if (Object.keys(this.suspended).length > 0) {
                  await ActorHelpers.endEditMode(this.data.object, this.suspended);
                  this.suspended = {};
                }
                updateObject[`flags.starwarsffg.config.editModeActor`] = "";
              }

              this.data.object.update(updateObject);
              this.data.object.sheet.render(true);
            },
          },
          two: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("SWFFG.Cancel"),
          },
        },
      },
      {
        classes: ["dialog", "starwarsffg"],
        template: "systems/starwarsffg/templates/dialogs/ffg-sheet-options.html",
      }
    ).render(true);
  }

  async register(optionName, options) {
    if (!this.options[optionName]) {
      this.options[optionName] = { ...options };
    }
    if (typeof this.data.object.flags?.starwarsffg?.config == "undefined") {
      await this.data.object.setFlag("starwarsffg", "config", {});
    }

    if (typeof this.data.object.flags?.starwarsffg?.config[optionName] !== "undefined") {
      this.options[optionName].value = this.data.object.flags?.starwarsffg?.config[optionName];
    } else {
      this.options[optionName].value = this.options[optionName].default;
    }
  }

  registerMany(optionsArray) {
    optionsArray.forEach((option) => {
      this.register(option.name, option.options);
    });
  }

  unregister(optionName) {
    delete this.options[optionName];
  }

  clear() {
    this.options = {};
  }
}
