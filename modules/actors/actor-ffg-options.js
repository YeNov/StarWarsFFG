import ActorHelpers from "../helpers/actor-helpers.js";
import { DialogV2Compat } from "../apps/dialog-v2-compat.js";

export default class ActorOptions {
  /**
   * Per-actor cache of suspended Active Effect state, keyed by actor UUID.
   *
   * `ActorOptions` is reinstantiated on every sheet render (see
   * `actor-sheet-ffg.js` activateListeners), so instance state cannot survive
   * the `sheet.render(true)` call that the edit-mode handler issues itself.
   * The cache must live on the class so the next dialog open can find the
   * original AE state recorded when edit mode was first enabled and use it
   * to revert via `ActorHelpers.endEditMode`. Without this, toggling edit
   * mode OFF after a re-render finds an empty `this.suspended`, skips
   * `endEditMode`, and leaves AEs disabled until world reload.
   *
   * Lost on full page reload, which is acceptable — edit mode is a transient
   * authoring affordance, not persisted state.
   */
  static _suspendedAECache = new Map();

  /**
   * Per-actor Sheet Options dialog instance, keyed by actor uuid. Used to
   * enforce a single-instance policy: a second click on the Sheet Options
   * button while a dialog is already open should focus it rather than open
   * a second copy. Entries are removed when the dialog closes.
   */
  static _openDialogs = new Map();

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
      // matching `.starwarsffg.sheet.actor[data-appid=...]` (e.g. unexpected
      // class list on a token actor sheet or a subclass that strips classes).
      console.warn(`starwarsffg | ActorOptions.init: could not resolve sheet root for appId="${this.data.appId}"; Sheet Options button will not be injected.`);
      return;
    }
    if (root.querySelector(":scope > .window-header > .ffg-sheet-options")) return;

    const header = root.querySelector(":scope > .window-header");
    if (!header) {
      console.warn(`starwarsffg | ActorOptions.init: sheet root for appId="${this.data.appId}" has no :scope > .window-header; Sheet Options button will not be injected.`);
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
    // The injected button is an <a href="#">; without preventDefault the
    // browser navigates to the page URL with `#` appended and can scroll
    // the page. stopPropagation keeps the click from bubbling into V13's
    // window header handling.
    event?.preventDefault?.();
    event?.stopPropagation?.();

    // Allow only one Sheet Options dialog per actor at a time. Repeated
    // clicks should focus the existing dialog rather than stacking new ones.
    const openKey = this.data.object.uuid;
    const existing = ActorOptions._openDialogs.get(openKey);
    if (existing?.app?.rendered) {
      existing.app.bringToFront?.();
      return;
    }
    const title = `${game.i18n.localize("SWFFG.CharacterSheet")} ${game.i18n.localize("SWFFG.Options")}: ${this.data.actor.name}`;

    const dialog = new DialogV2Compat(
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
              const cache = ActorOptions._suspendedAECache;
              const cacheKey = this.data.object.uuid;
              const stored = cache.get(cacheKey);
              if (editMode) {
                if (!stored) {
                  // suspend AEs
                  const suspended = await ActorHelpers.beginEditMode(this.data.object);
                  cache.set(cacheKey, suspended);
                  updateObject[`flags.starwarsffg.config.editModeActor`] = game.user.id;
                }
              } else {
                // unsuspend AEs
                if (stored) {
                  await ActorHelpers.endEditMode(this.data.object, stored);
                  cache.delete(cacheKey);
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
    );
    ActorOptions._openDialogs.set(openKey, dialog);
    // Drop the entry whether the dialog is dismissed via a button, the close
    // (×) control, or Esc, so a fresh click reopens a new dialog.
    const drop = () => {
      if (ActorOptions._openDialogs.get(openKey) === dialog) {
        ActorOptions._openDialogs.delete(openKey);
      }
    };
    const wrappedClose = dialog.close.bind(dialog);
    dialog.close = async (...args) => {
      try { return await wrappedClose(...args); }
      finally { drop(); }
    };
    dialog.render(true);
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
