const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Compatibility base for porting the existing document sheets to Foundry's
 * ApplicationV2 framework without rewriting every legacy sheet handler at once.
 */
export class FFGDocumentSheetV2 extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /**
   * Per-document active-tab cache keyed by `${appName}:${documentUuid}`. Used
   * to persist the active sheet tab across close-and-reopen within a single
   * page session. We intentionally avoid `document.setFlag` here: writing a
   * flag triggers a re-render of the sheet, which re-runs `_activateCoreListeners`
   * and rebinds the `Tabs` instance — racing with the user's click. An
   * in-memory map sidesteps that loop and keeps ephemeral UI state out of the
   * persisted document data. Lost on full page reload, which is acceptable.
   */
  static _activeTabCache = new Map();

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["app", "window-app", "sheet", "themed", "theme-light"],
    window: {
      contentTag: "form",
      contentClasses: [],
      resizable: true,
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    sheet: {
      root: true,
      template: "",
    },
  };

  static get defaultOptions() {
    return {
      width: null,
      height: null,
      top: null,
      left: null,
      scale: null,
      popOut: true,
      minimizable: true,
      resizable: false,
      id: "",
      classes: ["sheet"],
      dragDrop: [],
      tabs: [],
      filters: [],
      title: "",
      template: null,
      scrollY: [],
      closeOnSubmit: false,
      editable: true,
      sheetConfig: true,
      submitOnChange: true,
      submitOnClose: true,
      secrets: [],
    };
  }

  static _migrateConstructorParams(first, rest) {
    if ((first instanceof Object) && (first.document instanceof foundry.abstract.Document)) {
      return first;
    }

    if (!(first instanceof foundry.abstract.Document)) {
      throw new Error("A DocumentSheetV2 application must be provided a Document instance.");
    }

    const legacyOptions = rest.find((option) => option && (foundry.utils.getType(option) === "Object")) ?? {};
    const options = {
      document: first,
      legacyOptions,
    };

    if (typeof legacyOptions.title === "string") options.window = { title: legacyOptions.title };
    const positionKeys = ["top", "left", "width", "height", "scale", "zIndex"];
    options.position = positionKeys.reduce((position, key) => {
      if (legacyOptions[key] !== undefined) position[key] = legacyOptions[key];
      return position;
    }, {});

    return options;
  }

  constructor(...args) {
    super(...args);
    this.appId = this.id;
    this._dragDrop = [];
    this._tabs = [];
    this._searchFilters = [];
    this._state = 0;
    this._priorState = 0;
    this._submitting = false;
    this.editors = {};
    this._token = this.options.token ?? null;
  }

  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    const legacyOptions = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.constructor.defaultOptions),
      options?.legacyOptions ?? {},
      { inplace: false },
    );

    initialized.legacyOptions = legacyOptions;
    initialized.editable = legacyOptions.editable !== false;
    initialized.closeOnSubmit = legacyOptions.closeOnSubmit;
    initialized.submitOnChange = legacyOptions.submitOnChange;
    initialized.submitOnClose = legacyOptions.submitOnClose;
    initialized.sheetConfig = legacyOptions.sheetConfig;
    initialized.dragDrop = legacyOptions.dragDrop ?? [];
    initialized.tabs = legacyOptions.tabs ?? [];
    initialized.filters = legacyOptions.filters ?? [];
    initialized.scrollY = legacyOptions.scrollY ?? [];
    initialized.template = legacyOptions.template;
    initialized.token = legacyOptions.token ?? null;
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

  get object() {
    return this.document;
  }

  get form() {
    return this.element?.querySelector("form") ?? super.form;
  }

  get isEditable() {
    return (this.options.editable !== false) && super.isEditable;
  }

  get _activeTabCacheKey() {
    const uuid = this.document?.uuid;
    if (!uuid) return null;
    return `${this.constructor.name}:${uuid}`;
  }

  get template() {
    return this.options.template;
  }

  // NOTE: `toObject(false)` returns the raw source document data, not the
  // transformed view that ActiveEffects produce. This matches V1 ActorSheet
  // semantics and is required by edit-mode workflows that need unmodified
  // values (see ActorHelpers.beginEditMode).
  getData(_options = {}) {
    const data = this.document.toObject(false);
    const isEditable = this.isEditable;
    return {
      cssClass: isEditable ? "editable" : "locked",
      editable: isEditable,
      document: this.document,
      data,
      limited: this.document.limited,
      options: this.options,
      owner: this.document.isOwner,
      title: this.title,
    };
  }

  _configureRenderParts(options) {
    return {
      sheet: {
        root: true,
        template: this.template,
        scrollable: this.options.scrollY ?? [],
      },
    };
  }

  async _prepareContext(options) {
    return this.getData(options);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const form = this.form;
    if (form) {
      this._applyLegacyRootClasses(form, context);
      form.dataset.appid = this.appId;
      form.addEventListener("submit", this._onSubmit.bind(this));
      form.addEventListener("change", this._onChangeInput.bind(this));
    }
    this.element.dataset.appid = this.appId;

    this._projectLegacyHeaderControls();
    this.element.querySelector(":scope > .window-resize-handle")?.classList.add("window-resizable-handle");

    const html = $(form ?? this.element);
    this._activateCoreListeners(html);
    this.activateListeners(html);
    this._callLegacyRenderHook(html, context);
    this._activateEditors();
  }

  _applyLegacyRootClasses(form, context = {}) {
    form.setAttribute("autocomplete", "off");
    form.classList.toggle("editable", this.isEditable);
    form.classList.toggle("locked", !this.isEditable);

    for (const cls of this._getLegacyRootClasses(context)) {
      if (cls) form.classList.add(cls);
    }
  }

  /**
   * Actions from V13's controls-dropdown that we mirror as inline,
   * V1-style labeled links in the window header. Empty by default: the
   * V13 `×` icon already covers Close, and every other dropdown entry
   * (Configure Sheet, Prototype Token, Copy Document ID, etc.) is fine
   * to stay inside the `⋮` menu. The only inline header link the user
   * actually wants is Sheet Options, which ActorOptions/ItemOptions
   * inject directly — not via this projection.
   */
  static LEGACY_HEADER_ACTIONS = new Set();

  _projectLegacyHeaderControls() {
    const header = this.element.querySelector(":scope > .window-header");
    const dropdown = this.element.querySelector(":scope > menu.controls-dropdown");
    if (!header) return;

    header.querySelectorAll(":scope > .legacy-header-action").forEach((el) => el.remove());

    if (!dropdown) return;
    const allowed = this.constructor.LEGACY_HEADER_ACTIONS;
    const sources = [
      ...dropdown.querySelectorAll(":scope > .header-control[data-action]"),
      ...header.querySelectorAll(":scope > button.header-control[data-action='close']"),
    ].filter((source) => allowed.has(source.dataset.action));
    if (!sources.length) return;

    const anchor = header.querySelector(":scope > [data-action='toggleControls']") ?? header.lastElementChild;
    for (const source of sources) {
      const action = source.dataset.action;
      const button = source.matches("button") ? source : source.querySelector("button");
      const rawLabel = (source.querySelector(".control-label")?.textContent ?? source.dataset.tooltip ?? source.ariaLabel ?? button?.ariaLabel ?? "").trim();
      const label = this._getLegacyHeaderActionLabel(action, rawLabel);
      if (!action || !label) continue;

      const link = document.createElement("a");
      link.className = "legacy-header-action";
      link.dataset.action = action;
      link.innerHTML = `${source.querySelector("i")?.outerHTML ?? ""} <span>${label}</span>`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        button?.click();
      });
      header.insertBefore(link, anchor);
    }
  }

  _getLegacyHeaderActionLabel(action, fallback) {
    switch (action) {
      case "configureSheet":
        return "Sheet";
      case "close":
        return game.i18n.localize("SWFFG.ButtonClose") || "Close";
      default:
        return fallback;
    }
  }

  _getLegacyRootClasses(_context = {}) {
    return [];
  }

  _callLegacyRenderHook(html, context = {}) {
    const documentName = this.document?.documentName;
    if (!documentName) return;

    Hooks.callAll(`render${documentName}Sheet`, this, html, context);
  }

  _callLegacyCloseHook(html) {
    const documentName = this.document?.documentName;
    if (!documentName) return;

    Hooks.callAll(`close${documentName}Sheet`, this, html);
  }

  async close(options = {}) {
    // Block any render attempts that fire while we're closing. The submit-on-
    // close path runs `document.update`, which can trigger BOTH Foundry's
    // auto-render-on-update hook AND an explicit `this.render(true)` from
    // legacy helpers (see ItemHelpers.itemUpdate / ActorHelpers.updateActor).
    // Either one will race with super.close and re-attach the DOM, leaving
    // the user feeling like × did nothing. The `_closing` flag is consulted
    // by our overridden `render()` to bail out cleanly.
    this._closing = true;
    try {
      if (this.options.submitOnClose && options.submit !== false && this.form && this.isEditable) {
        const event = new Event("submit", { cancelable: true });
        await this._onSubmit(event, { preventClose: true, render: false });
      }
      // Fire while the form is still in the DOM so legacy listeners can inspect it.
      const form = this.form;
      if (form) this._callLegacyCloseHook($(form));
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

    const cacheKey = this._activeTabCacheKey;
    this._tabs = (this.options.tabs ?? []).map((tabConfig) => {
      const cached = cacheKey ? this.constructor._activeTabCache.get(cacheKey) : undefined;
      const tabs = new foundry.applications.ux.Tabs({
        ...tabConfig,
        initial: cached ?? this._sheetTab ?? tabConfig.initial,
        callback: (_event, _tabs, active) => {
          this._sheetTab = active;
          if (cacheKey) this.constructor._activeTabCache.set(cacheKey, active);
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
      html.find("img[data-edit]").on("click", this._onEditImage.bind(this));
      html.find("button.file-picker").on("click", this._activateFilePicker.bind(this));
    }
  }

  /**
   * Wire the V1 `{{editor}}` helper's Edit button to mount a ProseMirror
   * editor inline. V13's HandlebarsApplicationMixin does not auto-bind this;
   * the V1 FormApplication did. The helper emits
   * `.editor-content[data-edit="<name>"]` with a sibling `.editor-edit`
   * anchor inside a `.editor` container.
   */
  _activateEditors() {
    const root = this.element;
    if (!root) return;
    for (const content of root.querySelectorAll(".editor-content[data-edit]")) {
      const name = content.dataset.edit;
      if (!name) continue;
      const containerEl = content.closest(".editor");
      const button = containerEl?.querySelector(".editor-edit");
      if (!button || button.dataset.editorBound) continue;
      button.dataset.editorBound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this._activateEditor(name, content, containerEl, button);
      });
    }
  }

  async _activateEditor(name, contentEl, containerEl, buttonEl) {
    if (this.editors[name]?.active) return;
    const initial = foundry.utils.getProperty(this.document, name) ?? "";
    const { ProseMirrorEditor } = foundry.applications.ux;

    // Register a FormDataExtended-compatible entry BEFORE create() resolves.
    // FormDataExtended iterates `editors` and, for each entry whose
    // `options.engine === "prosemirror"`, serializes the live document out of
    // `instance.view`. Omitting this shape causes both the editor instance
    // AND the matching [data-edit] node to be skipped -- silently losing
    // unsaved content on submit-on-close.
    this.editors[name] = {
      instance: null,
      options: { engine: "prosemirror", target: name, button: true, owner: this.isEditable },
      active: true,
      button: buttonEl,
      container: containerEl,
    };

    const editor = await ProseMirrorEditor.create(contentEl, initial, {
      document: this.document,
      fieldName: name,
      relativeLinks: true,
      plugins: {
        menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
          destroyOnSave: true,
          onSave: () => this._saveEditor(name, { remove: true }),
        }),
        keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
          onSave: () => this._saveEditor(name, { remove: true }),
        }),
      },
    });

    this.editors[name].instance = editor;
    // The `prosemirror` class on the container is what the change-handler
    // editor guard (_onChangeInput) looks for. Without it, every keystroke
    // inside the editor bubbles a `change` to the form and triggers a full
    // submit. V1 added the engine class to the .editor container on mount;
    // mirror that here.
    containerEl.classList.add("editor-active", "prosemirror");
  }

  async _saveEditor(name, { remove = true } = {}) {
    const state = this.editors[name];
    if (!state?.instance) return;
    // Route through the normal submit pipeline so ItemHelpers.itemUpdate /
    // ActorHelpers.updateActor run AE sync, talent propagation, attribute
    // reshaping, and XP logging. FormDataExtended pulls the editor value out
    // of state.instance via the engine="prosemirror" entry on this.editors.
    //
    // render: true so the sheet re-renders and the {{editor}} block redraws
    // with the saved enriched content; otherwise _destroyEditor below tears
    // down the editor and leaves ProseMirror teardown leftovers visible.
    const event = new Event("submit", { cancelable: true });
    await this._onSubmit(event, { preventClose: true, render: true });
    if (remove) this._destroyEditor(name);
  }

  _destroyEditor(name) {
    const state = this.editors[name];
    if (!state) return;
    try { state.instance?.destroy(); } catch (_e) { /* already torn down */ }
    state.container?.classList.remove("editor-active", "prosemirror");
    delete this.editors[name];
  }

  async _onEditImage(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document._source, attr);
    const fp = new foundry.applications.apps.FilePicker({
      current,
      type: "image",
      callback: (path) => {
        target.src = path;
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
    const target = event.currentTarget;
    if (target?.closest?.(".editor.prosemirror, .editor.tinymce")) return;

    const input = event.target;
    if (input?.type === "color" && input.dataset.edit && this.form?.elements[input.dataset.edit]) {
      this.form.elements[input.dataset.edit].value = input.value;
    } else if (input?.type === "range") {
      const field = input.parentElement?.querySelector(".range-value");
      if (field) {
        if (field.tagName === "INPUT") field.value = input.value;
        else field.innerHTML = input.value;
      }
    }

    if (this.options.submitOnChange) return this._onSubmit(event);
  }

  async _onSubmit(event, { updateData = null, preventClose = false, preventRender = false, render = true } = {}) {
    event?.preventDefault?.();
    if (!this.form || !this.isEditable || this._submitting) return false;

    this._submitting = true;
    const formData = this._getSubmitData(updateData);
    const priorState = this._state;
    if (preventRender) this._state = 1;

    try {
      await this._updateObject(event, formData, { render });
    } finally {
      this._submitting = false;
      if (preventRender) this._state = priorState;
    }

    if (this.options.closeOnSubmit && !preventClose) await this.close({ submit: false, force: true });
    return formData;
  }

  _getSubmitData(updateData = {}) {
    if (!this.form) throw new Error("The sheet has no registered form element.");
    const fd = new foundry.applications.ux.FormDataExtended(this.form, { editors: this.editors });
    let data = fd.object;
    if (updateData) data = foundry.utils.mergeObject(data, updateData, { inplace: false });
    return foundry.utils.flattenObject(data);
  }

  _prepareSubmitData(_event, _form, formData, updateData) {
    let data = foundry.utils.deepClone(formData.object);
    if (updateData) data = foundry.utils.mergeObject(data, updateData, { inplace: false });
    return foundry.utils.flattenObject(data);
  }

  async _processSubmitData(event, _form, submitData) {
    return this._updateObject(event, submitData);
  }

  async _updateObject(_event, formData, { render = true } = {}) {
    return this.document.update(formData, { render });
  }

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
