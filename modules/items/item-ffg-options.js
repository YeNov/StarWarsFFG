import { DialogV2Compat } from "../apps/dialog-v2-compat.js";

export default class ItemOptions {
  constructor(data, html) {
    this.data = data;
    this.options = {};
    this.init(html);
  }

  init(html) {
    const root = this._findSheetRoot(html);
    if (!root) {
      // Diagnostic: silent failure here means the Sheet Options button never
      // appears in the header. Most common cause is the sheet root not
      // matching `.starwarsffg.sheet.item[data-appid=...]` (e.g. a subclass
      // that strips one of the expected classes).
      console.warn(`starwarsffg | ItemOptions.init: could not resolve sheet root for appId="${this.data.appId}"; Sheet Options button will not be injected.`);
      return;
    }
    if (root.querySelector(":scope > .window-header > .ffg-sheet-options")) return;

    const header = root.querySelector(":scope > .window-header");
    if (!header) {
      console.warn(`starwarsffg | ItemOptions.init: sheet root for appId="${this.data.appId}" has no :scope > .window-header; Sheet Options button will not be injected.`);
      return;
    }

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
          && node.classList.contains("item")
        ) {
          candidates.push(node);
        }
      }
    };

    const sheetElement = this.data.element?.jquery ? this.data.element[0] : this.data.element;
    const htmlElement = html?.jquery ? html[0] : html?.[0] ?? html;
    addAncestors(sheetElement);
    addAncestors(htmlElement);
    candidates.push(...document.querySelectorAll(`.starwarsffg.sheet.item[data-appid="${appId}"]`));

    return candidates.find((element) => element.querySelector(":scope > .window-header")) ?? candidates[0] ?? null;
  }

  handler(event) {
    // The injected button is an <a href="#">; without preventDefault the
    // browser navigates to the page URL with `#` appended and can scroll
    // the page. stopPropagation keeps the click from bubbling into V13's
    // window header handling.
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const title = `${game.i18n.localize("SWFFG.ItemSheet")} ${game.i18n.localize("SWFFG.Options")}: ${this.data.item.name}`;

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

                updateObject[control.name] = value;
                this.options[control.id].value = value;
              }

              const item = await fromUuid(this.data.item.uuid);
              if (!item) {
                return ui.notifications.warn("Unable to find item");
              }
              for (const flag of Object.keys(updateObject)) {
                await item.setFlag("starwarsffg", flag, updateObject[flag]);
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
