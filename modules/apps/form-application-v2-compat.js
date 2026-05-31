const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Compatibility base for legacy FormApplication-style tools running on
 * Foundry's ApplicationV2 framework.
 */
export class FormApplicationV2Compat extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["form"],
    window: {
      contentTag: "form",
      resizable: false,
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    form: {
      root: true,
      template: "",
    },
  };

  static get defaultOptions() {
    return {
      baseApplication: null,
      width: null,
      height: null,
      top: null,
      left: null,
      scale: null,
      popOut: true,
      minimizable: true,
      resizable: false,
      id: "",
      classes: ["form"],
      dragDrop: [],
      tabs: [],
      filters: [],
      title: "",
      template: null,
      scrollY: [],
      closeOnSubmit: true,
      editable: true,
      sheetConfig: false,
      submitOnChange: false,
      submitOnClose: false,
    };
  }

  constructor(object = {}, options = {}) {
    super({ legacyOptions: options });
    this.object = object;
    this.appId = this.id;
    this._dragDrop = [];
    this._tabs = [];
    this._searchFilters = [];
    this._state = 0;
    this._priorState = 0;
    this._submitting = false;
    this.editors = {};
    this._title = null;
  }

  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    const legacyOptions = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.constructor.defaultOptions),
      options?.legacyOptions ?? {},
      { inplace: false },
    );

    for (const [key, value] of Object.entries(legacyOptions)) {
      if (!(key in initialized)) initialized[key] = value;
    }

    initialized.legacyOptions = legacyOptions;
    initialized.editable = legacyOptions.editable !== false;
    initialized.closeOnSubmit = legacyOptions.closeOnSubmit;
    initialized.submitOnChange = legacyOptions.submitOnChange;
    initialized.submitOnClose = legacyOptions.submitOnClose;
    initialized.dragDrop = legacyOptions.dragDrop ?? [];
    initialized.tabs = legacyOptions.tabs ?? [];
    initialized.filters = legacyOptions.filters ?? [];
    initialized.scrollY = legacyOptions.scrollY ?? [];
    initialized.template = legacyOptions.template;
    if (legacyOptions.id) initialized.id = legacyOptions.id;

    initialized.classes.push(...(legacyOptions.classes ?? []));
    initialized.classes = Array.from(new Set(initialized.classes));

    initialized.window.resizable = legacyOptions.resizable ?? initialized.window.resizable;
    if (legacyOptions.title) initialized.window.title = legacyOptions.title;

    for (const key of ["width", "height", "top", "left", "scale", "zIndex"]) {
      if (legacyOptions[key] !== null && legacyOptions[key] !== undefined) {
        initialized.position[key] = legacyOptions[key];
      }
    }

    // V2's form pipeline is intentionally and unconditionally disabled here;
    // submission is handled manually by _onChangeInput / _onSubmit to match
    // V1 semantics. Do not add `legacyOptions.submitOnChange ?? …` plumbing
    // elsewhere — it would be dead code (overwritten here) and signals an
    // intent we don't actually support. The `closeOnSubmit` semantics that
    // legacy callers expect are preserved via `this.options.closeOnSubmit`
    // (set earlier from legacyOptions) which the manual `_onSubmit` reads;
    // the `form.closeOnSubmit` sub-object here is V2 framework state that
    // does nothing once `handler: null` neuters the pipeline.
    initialized.form = {
      ...initialized.form,
      submitOnChange: false,
      closeOnSubmit: false,
      handler: null,
    };
    return initialized;
  }

  /**
   * Lower bound for interactive resize. Mirror of FFGDocumentSheetV2 so legacy
   * FormApplication-style tools (RollBuilder, DestinyTracker, GroupManager,
   * importers) cannot be dragged down to unusable dimensions.
   */
  static MIN_DIMENSIONS = { width: 300, height: 200 };

  _minDimensions() {
    return this.constructor.MIN_DIMENSIONS;
  }

  setPosition(position = {}) {
    // V13's _updatePosition reads `el.parentElement.offsetWidth` without
    // guarding against a detached element; skip if not yet inserted.
    if (!this.element?.parentElement) return position;
    // While the window is minimizing or already minimized, V13 calls
    // setPosition with header-only dimensions; clamping those up to the
    // interactive-resize minimum would block the collapse.
    if (this._minimizing || this.minimized) return super.setPosition(position);
    const min = this._minDimensions();
    const clamped = { ...position };
    if (typeof clamped.width === "number" && clamped.width < min.width) clamped.width = min.width;
    if (typeof clamped.height === "number" && clamped.height < min.height) clamped.height = min.height;
    return super.setPosition(clamped);
  }

  async minimize(...args) {
    this._minimizing = true;
    try {
      return await super.minimize(...args);
    } finally {
      this._minimizing = false;
    }
  }

  get form() {
    return this.element?.querySelector("form") ?? super.form;
  }

  get isEditable() {
    return this.options.editable !== false;
  }

  get template() {
    return this.options.template;
  }

  get title() {
    return this._title ?? game.i18n.localize(this.options.window.title || this.options.title || "");
  }

  getData(_options = {}) {
    return {
      object: this.object,
      options: this.options,
      title: this.title,
    };
  }

  _configureRenderParts(_options) {
    return {
      form: {
        root: true,
        template: this.template,
        scrollable: this.options.scrollY ?? [],
      },
    };
  }

  async _prepareContext(options) {
    return this.getData(options);
  }

  async _onRender(_context, _options) {
    const form = this.form;
    if (form) {
      form.dataset.appid = this.appId;
      // Attach once per form element: ApplicationV2 reuses the content <form>
      // across re-renders, so re-binding here would stack duplicate handlers.
      if (!form.dataset.ffgListenersBound) {
        form.dataset.ffgListenersBound = "1";
        form.addEventListener("submit", this._onSubmit.bind(this));
        form.addEventListener("change", this._onChangeInput.bind(this));
      }
    }
    this.element.dataset.appid = this.appId;

    // Restore V1's dblclick-header-to-minimize behavior. V13's ApplicationV2
    // only exposes minimize via the controls-dropdown; dblclicking the header
    // otherwise just selects the title text. Capture phase to win against any
    // V13 internal handler that stops propagation.
    const header = this.element?.querySelector(":scope > .window-header");
    if (header && !header.dataset.ffgMinimizeBound) {
      header.dataset.ffgMinimizeBound = "1";
      header.addEventListener("dblclick", (event) => {
        if (event.target.closest("button, a, [data-action]")) return;
        event.preventDefault();
        event.stopPropagation();
        window.getSelection?.()?.removeAllRanges?.();
        try {
          if (this.minimized) this.maximize();
          else this.minimize();
        } catch (err) {
          console.warn("starwarsffg | header minimize toggle failed:", err);
        }
      }, true);
    }

    const html = $(form ?? this.element);
    this._activateCoreListeners(html);
    this.activateListeners(html);
  }

  async close(options = {}) {
    // Block any render attempts that fire while we're closing. Subclasses
    // such as itemEditor / talentEditor / forcePowerEditor call
    // `this.render(true)` from inside their `_updateObject` overrides, which
    // races super.close and re-attaches the DOM. Mirror the FFGDocumentSheetV2
    // approach: set `_closing` and have our `render()` bail while it's set.
    this._closing = true;
    try {
      if (this.options.submitOnClose && options.submit !== false && this.form && this.isEditable) {
        const event = new Event("submit", { cancelable: true });
        await this._onSubmit(event, { preventClose: true });
      }
      return await super.close(options);
    } finally {
      this._closing = false;
    }
  }

  async render(options, _options) {
    if (this._closing) return this;
    return super.render(options, _options);
  }

  activateListeners(_html) {}

  _activateCoreListeners(html) {
    const root = html[0];
    if (!root) return;

    this._tabs = (this.options.tabs ?? []).map((tabConfig) => {
      const tabs = new foundry.applications.ux.Tabs({
        ...tabConfig,
        initial: this._sheetTab ?? tabConfig.initial,
        callback: (_event, _tabs, active) => {
          this._sheetTab = active;
        },
      });
      tabs.bind(root);
      return tabs;
    });

    this._dragDrop = (this.options.dragDrop ?? []).map((dragDropConfig) => {
      const dragDrop = new foundry.applications.ux.DragDrop({
        ...dragDropConfig,
        permissions: {
          dragstart: this._canDragStart.bind(this),
          drop: this._canDragDrop.bind(this),
          ...(dragDropConfig.permissions ?? {}),
        },
        callbacks: {
          dragstart: this._onDragStart.bind(this),
          dragover: this._onDragOver.bind(this),
          drop: this._onDrop.bind(this),
          ...(dragDropConfig.callbacks ?? {}),
        },
      });
      dragDrop.bind(root);
      return dragDrop;
    });

    if (this.isEditable) {
      html.find("button.file-picker").on("click", this._activateFilePicker.bind(this));
    }
  }

  _activateFilePicker(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const field = button.dataset.target;
    const input = this.form?.elements[field];
    const fp = new foundry.applications.apps.FilePicker({
      type: button.dataset.type ?? "image",
      current: input?.value,
      callback: (path) => {
        if (input) input.value = path;
        if (this.options.submitOnChange) {
          this._onSubmit(new Event("submit", { cancelable: true }));
        }
      },
      position: {
        top: this.position.top + 40,
        left: this.position.left + 10,
      },
    });
    return fp.browse();
  }

  _onChangeInput(event) {
    // The change listener is bound to the form, so event.currentTarget is the
    // form itself -- never an editor. Guard on the actual changed element.
    const input = event.target;
    if (input?.closest?.(".editor.prosemirror, .editor.tinymce")) return;

    if (input?.type === "range") {
      const field = input.parentElement?.querySelector(".range-value");
      if (field) {
        if (field.tagName === "INPUT") field.value = input.value;
        else field.innerHTML = input.value;
      }
    }

    if (this.options.submitOnChange) return this._onSubmit(event);
  }

  async _onSubmit(event, options = {}) {
    let { updateData = null, preventClose = false, preventRender = false } = options;
    event?.preventDefault?.();
    if (!this.form || !this.isEditable) return false;

    // Coalesce concurrent submits and return the in-flight promise so callers
    // that await _onSubmit before tearing down DOM (close / inner editor save
    // flows) wait for the flushed submit. Mirrors FFGDocumentSheetV2.
    if (this._submitting) {
      this._submitPending = { updateData, preventClose };
      return this._submitInFlight;
    }

    this._submitting = true;
    let formData;
    let currentPreventClose = preventClose;
    const priorState = this._state;
    if (preventRender) this._state = 1;

    let resolveFlush;
    let rejectFlush;
    this._submitInFlight = new Promise((res, rej) => { resolveFlush = res; rejectFlush = rej; });

    let iter = 0;
    try {
      do {
        if (iter++ > 8) {
          console.warn("starwarsffg | _onSubmit coalesce loop exceeded 8 iterations; bailing");
          break;
        }
        this._submitPending = null;
        formData = this._getSubmitData(updateData);
        await this._updateObject(event, formData);
        if (this._submitPending) {
          if (!this._submitPending.preventClose) currentPreventClose = false;
          updateData = this._submitPending.updateData ?? updateData;
        }
      } while (this._submitPending);

      if (this.options.closeOnSubmit && !currentPreventClose) {
        await this.close({ submit: false, force: true });
      }
      resolveFlush(formData);
      return formData;
    } catch (err) {
      rejectFlush(err);
      throw err;
    } finally {
      this._submitting = false;
      this._submitInFlight = null;
      if (preventRender) this._state = priorState;
    }
  }

  _getSubmitData(updateData = {}) {
    if (!this.form) throw new Error("The form application has no registered form element.");
    const fd = new foundry.applications.ux.FormDataExtended(this.form, { editors: this.editors });
    let data = fd.object;
    if (updateData) data = foundry.utils.mergeObject(data, updateData, { inplace: false });
    return foundry.utils.flattenObject(data);
  }

  async _updateObject(_event, _formData) {}

  _canDragStart(_selector) {
    return this.isEditable;
  }

  _canDragDrop(_selector) {
    return this.isEditable;
  }

  _onDragStart(_event) {}

  _onDragOver(_event) {}

  async _onDrop(_event) {}
}
