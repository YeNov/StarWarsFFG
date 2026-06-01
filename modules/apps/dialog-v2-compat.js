const { DialogV2 } = foundry.applications.api;

function normalizeIcon(icon) {
  if (!icon) return undefined;
  const match = String(icon).match(/class=["']([^"']+)["']/);
  return match ? match[1] : String(icon).replace(/<i\s+|\s*><\/i>/g, "").trim();
}

/**
 * Minimal compatibility wrapper for legacy Dialog construction backed by
 * Foundry's DialogV2 implementation.
 *
 * @deprecated FROZEN — being removed in the V2-full migration (Stage 1).
 * Do not add new importers. New code must call
 * foundry.applications.api.DialogV2 directly. See
 * docs/superpowers/plans/2026-05-31-v2-full-migration.md.
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

  render(force = false, options = {}) {
    if (Array.isArray(options.classes) && options.classes.length) {
      const existing = Array.isArray(this.options.classes) ? this.options.classes : [];
      this.options.classes = Array.from(new Set([...existing, ...options.classes]));
    }
    if (options.focus !== undefined) this.options.focus = options.focus;
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

    await dialog.render({ force: !!force });
    if (this.options.focus) {
      dialog.bringToFront?.();
      const root = dialog.element;
      const defaultAction = this.data.default ?? this._buttonActions[0];
      const target = root?.querySelector("[autofocus]")
        ?? root?.querySelector("input:not([type='hidden']):not([type='button']):not([type='submit']), textarea, select")
        ?? root?.querySelector(`[data-action="${defaultAction}"]`);
      target?.focus?.();
    }
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
      // Deliberately omit `buttons` from the template context. DialogV2
      // already renders its own button bar from the `buttons:` constructor
      // argument; passing them into the template too causes legacy
      // templates with their own `{{#each buttons}}` loop (e.g.
      // ffg-sheet-options.html) to render a second, duplicate row.
      const { buttons, ...rest } = this.data;
      const context = {
        ...rest,
        content: this.data.content ?? {},
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
    // Guard against re-entry: the callback is async, so a second click during
    // its await (e.g. a double-click on "Adjust" in the XP dialog) would run
    // the callback twice before the dialog closes -- applying the action twice.
    // Ignore further submits once one is in flight, and disable the dialog
    // buttons for immediate visual feedback.
    if (this._actionSubmitted) return;
    this._actionSubmitted = true;
    const buttons = this.app?.element?.querySelectorAll("button[data-action]");
    buttons?.forEach((b) => (b.disabled = true));

    const button = this.data.buttons?.[action];
    try {
      await button?.callback?.call(this, this.element, event);
      await this.close();
    } catch (err) {
      // Submit failed and the dialog stays open -- allow the user to retry.
      this._actionSubmitted = false;
      buttons?.forEach((b) => (b.disabled = false));
      ui.notifications.error(err.message);
      throw err;
    }
  }
}
