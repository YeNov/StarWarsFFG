const { DialogV2 } = foundry.applications.api;

function normalizeIcon(icon) {
  if (!icon) return undefined;
  const match = String(icon).match(/class=["']([^"']+)["']/);
  return match ? match[1] : String(icon).replace(/<i\s+|\s*><\/i>/g, "").trim();
}

/**
 * Minimal compatibility wrapper for legacy Dialog construction backed by
 * Foundry's DialogV2 implementation.
 */
export class DialogV2Compat {
  constructor(data = {}, options = {}) {
    this.data = data;
    this.options = { ...options, jQuery: options.jQuery ?? true };
    this.app = null;
    this._buttonActions = [];
  }

  get element() {
    const element = this.app?.element;
    if (!element) return this.options.jQuery ? $() : null;
    return this.options.jQuery ? $(element) : element;
  }

  render(force = false) {
    this._render(force);
    return this;
  }

  async _render(force = false) {
    const dialog = new DialogV2({
      classes: this.options.classes ?? ["dialog"],
      window: { title: this.data.title ?? "Dialog" },
      content: await this._prepareContent(),
      buttons: this._prepareButtons(),
      modal: this.options.modal,
      position: this._preparePosition(),
    });

    this.app = dialog;
    if (this.data.render instanceof Function) {
      dialog.addEventListener("render", () => this.data.render.call(this, this.element));
    }
    if (this.data.close instanceof Function) {
      dialog.addEventListener("close", () => this.data.close.call(this, this.element), { once: true });
    }
    dialog.addEventListener("render", () => window.setTimeout(() => this._activateLegacyButtons(), 0), { once: true });

    dialog.render({ force: !!force });
    return this;
  }

  async close(options = {}) {
    return this.app?.close(options);
  }

  _prepareButtons() {
    const entries = Object.entries(this.data.buttons ?? {}).filter(([, button]) => button.condition !== false);
    const buttons = entries.map(([action, button], index) => ({
      action,
      label: button.label ?? action,
      icon: normalizeIcon(button.icon),
      class: button.class ?? button.cssClass ?? action,
      disabled: button.disabled,
      default: this.data.default ? this.data.default === action : index === 0,
      callback: async (event) => button.callback?.call(this, this.element, event),
    }));
    const prepared = buttons.length ? buttons : [{ action: "close", label: "Close", default: true }];
    this._buttonActions = prepared.map((button) => button.action);
    return prepared;
  }

  async _prepareContent() {
    if (this.options.template) {
      const context = {
        ...this.data,
        content: this.data.content ?? {},
        buttons: this.data.buttons ?? {},
      };
      return foundry.applications.handlebars.renderTemplate(this.options.template, context);
    }

    const content = this.data.content;
    if (content && (typeof content === "object") && !(content instanceof HTMLElement)) return String(content);
    return content ?? "";
  }

  _preparePosition() {
    const position = {};
    for (const key of ["width", "height", "top", "left", "scale", "zIndex"]) {
      if (this.options[key] !== undefined) position[key] = this.options[key];
    }
    return position;
  }

  _activateLegacyButtons() {
    const form = this.app?.element?.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const action = event.submitter?.dataset.action ?? this.data.default ?? this._buttonActions[0];
      this._submitLegacyAction(action, event);
    }, { capture: true });

    for (const action of this._buttonActions) {
      const button = form.querySelector(`button[data-action="${action}"]`);
      button?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        this._submitLegacyAction(action, event);
      }, { capture: true });
    }
  }

  async _submitLegacyAction(action, event) {
    const button = this.data.buttons?.[action];
    try {
      await button?.callback?.call(this, this.element, event);
      await this.close();
    } catch (err) {
      ui.notifications.error(err.message);
      throw err;
    }
  }
}
