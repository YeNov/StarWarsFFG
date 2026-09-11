import { GroupManager } from "./groupmanager-ffg.js";
import { DestinyQueue, DESTINY_LIGHT, DESTINY_DARK } from "./helpers/destiny-queue.js";
import { createDestinyDispatcher } from "./helpers/destiny-dispatcher.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The floating Destiny Tracker chrome widget: shows the light/dark destiny
 * pool, lets users flip points, and (for the GM) exposes the group-manager
 * menu. A native ApplicationV2 -- not a form. It is draggable by its body and
 * remembers its position per-user, and never closes via the UI.
 *
 * Rendered exactly once at ready (`dTracker.render(true)` in swffg-main); the
 * pool display is updated in place by the dPool settings' onChange (which
 * rewrites #destinyLight/#destinyDark directly), not by re-rendering -- so the
 * one-time _onRender binding of socket / chat hooks below does not accumulate.
 * @extends {ApplicationV2}
 */
export default class DestinyTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(object = {}, options = {}) {
    super(options);
    this.object = object;
    // Every tracker mutation of the pool -- player flip, player roll, GM flip,
    // GM roll, GM add/remove -- goes through this one serialized queue on the
    // active GM's client. See modules/helpers/destiny-queue.js.
    this.destinyQueue = new DestinyQueue({
      get: (key) => game.settings.get("starwarsffg", key),
      set: (key, value) => game.settings.set("starwarsffg", key, value),
      onResult: (result) => this._announceDestinyResult(result),
      // Resolved lazily: CONFIG.logger is installed at init, and this widget can
      // be constructed before then.
      logger: {
        debug: (...args) => CONFIG.logger?.debug?.(...args),
        warn: (...args) => CONFIG.logger?.warn?.(...args),
        error: (...args) => CONFIG.logger?.error?.(...args),
      },
    });
    this.destinyDispatcher = createDestinyDispatcher({
      getUser: () => game.user,
      getActiveGM: () => game.users.activeGM,
      findUser: (id) => game.users.get(id),
      queue: this.destinyQueue,
      send: (data) => game.socket.emit("system.starwarsffg", data),
      onNoGM: () => ui.notifications.warn(game.i18n.localize("SWFFG.GMBridge.NoGM")),
    });
    if (options?.menu) {
      this.menu = options.menu;
    }
  }

  static DEFAULT_OPTIONS = {
    id: "destiny-tracker",
    classes: ["starwarsffg"],
    tag: "div",
    window: {
      title: "Destiny Tracker",
    },
  };

  static PARTS = {
    content: {
      root: true,
      template: "systems/starwarsffg/templates/ffg-destiny-tracker.html",
    },
  };

  /**
   * Persistent chrome: the window header is hidden and the widget is never torn
   * down during a session, so close is a no-op to keep stray calls from
   * removing it. (Natively there is no 300x200 minimum to override anymore --
   * the frame shrinks to the widget; CSS provides the 10px gap.)
   * @override
   */
  async close(_options = {}) {
    return this;
  }

  /** @override */
  async _prepareContext(_options) {
    // Get current value
    let destinyPool = { light: game.settings.get("starwarsffg", DESTINY_LIGHT), dark: game.settings.get("starwarsffg", DESTINY_DARK) };
    let destinyPoolLabel = { light: game.settings.get("starwarsffg", "destiny-pool-light"), dark: game.settings.get("starwarsffg", "destiny-pool-dark") };

    // filter menu based on role.
    const menu = this.menu.filter((m) => game.user.hasRole(m.minimumRole) || !m.minimumRole);

    // Return data
    return {
      destinyPool,
      destinyPoolLabel,
      isGM: game.user.isGM,
      menu,
      theme: game.settings.get("starwarsffg", "dicetheme"),
      campaignDay: game.settings.get("starwarsffg", "campaignDay"),
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Restore this user's saved widget position, or default to the lower-left
    // corner (above the players list). The old `innerWidth - screen.width`
    // formula produced a negative left on any window narrower than the screen,
    // rendering the widget off-screen. Clamp so at least a corner stays visible
    // if the window shrank since the position was saved.
    const vw = $(window).width() || 0;
    const vh = $(window).height() || 0;
    const saved = game.settings.get("starwarsffg", "destinyTrackerPosition");
    let left = 10;
    let top = vh - 300;
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      left = saved.left;
      top = saved.top;
    }
    this.setPosition({
      left: Math.min(Math.max(0, left), Math.max(0, vw - 50)),
      top: Math.min(Math.max(0, top), Math.max(0, vh - 50)),
    });

    this._activateListeners($(this.element));
  }

  _activateListeners(html) {
    // Make the widget draggable by its body and remember the position per-user.
    this._setupDragging(html);

    // future functionality to allow multiple menu items to be passed in

    $.expr.filters.offscreen = function (el) {
      var rect = el.getBoundingClientRect();
      return rect.x + rect.width < 0 || rect.y + rect.height < 0 || rect.y + rect.height > window.innerHeight || rect.x + rect.width > window.innerWidth || rect.x > window.innerWidth || rect.y > window.innerHeight;
    };

    html.find(".dropbtn").click((event) => {
      const id = `#${$(event.currentTarget).attr("id")}Content`;
      $(html.find(id)).toggleClass("show");

      if ($(".dropdown-content").is(":offscreen")) {
        $(html.find(id)).addClass("vertical");
      } else {
        $(html.find(id)).removeClass("vertical");
      }
    });

    html.find(".dropdown-content a").click((event) => {
      event.preventDefault();
      event.stopPropagation();

      const index = event.currentTarget.dataset.value;
      this.menu[index].callback();
    });

    html.find(".destiny-points").click(async (event) => {
      // Ignore the click that fires at the end of a drag (see _setupDragging).
      if (this._suppressFlip) { this._suppressFlip = false; return; }
      const pointType = event.currentTarget.dataset.group;
      var typeName = null;
      const add = event.shiftKey;
      const remove = event.ctrlKey || event.metaKey;
      var flipType = null;
      if (pointType == DESTINY_LIGHT) {
        flipType = DESTINY_DARK;
        typeName = game.i18n.localize(game.settings.get("starwarsffg", "destiny-pool-light"));
      } else {
        flipType = DESTINY_LIGHT;
        typeName = game.i18n.localize(game.settings.get("starwarsffg", "destiny-pool-dark"));
      }

      if (!add && !remove) {
        // A local courtesy check for instant feedback; the GM re-validates the
        // source pool at the moment the flip is actually applied, because by then
        // somebody else may have spent the last point.
        if (game.settings.get("starwarsffg", pointType) == 0) {
          ui.notifications.warn(`Cannot flip a ${typeName} point; 0 remaining.`);
          return;
        }

        // Send the INTENTION (move one point from this pool to the other), not a
        // pair of totals computed from what this client happens to see. The GM
        // client is the only one that touches the pool, and it does so through
        // the serialized queue.
        //
        // The chat card is posted by whichever client APPLIES the flip, not by the
        // one that asks for it -- that is the only client that knows the resulting
        // totals. See _announceDestinyResult(). This includes other GMs.
        await this.destinyDispatcher.submit({ type: "destiny-flip", from: pointType, to: flipType });
        return;
      } else if (add) {
        if (!game.user.isGM) {
          ui.notifications.warn("Only GMs can add or remove points from the Destiny Pool.");
          return;
        }
        await this.destinyDispatcher.submit({ type: "destiny-adjust", pool: pointType, delta: 1 });
      } else if (remove) {
        if (!game.user.isGM) {
          ui.notifications.warn("Only GMs can add or remove points from the Destiny Pool.");
          return;
        }
        await this.destinyDispatcher.submit({ type: "destiny-adjust", pool: pointType, delta: -1 });
      }
    });

    // Campaign-day advance ([+], GM only): bump the world day by 1 directly, no
    // prompt. The setting's onChange rewrites the .ffg-campaign-day-value span in
    // place (live-refresh path 2), so this handler never touches the DOM — leaving
    // the [+] node and its listener intact (no widget re-render).
    html.find(".ffg-campaign-day-advance").click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
      await game.settings.set("starwarsffg", "campaignDay", current + 1);
    });

    // Campaign-day edit (GM only): right-click the readout for a one-item "Edit"
    // context menu that opens a dialog to OVERRIDE the current day with any value.
    // Delegated from the widget root so it survives any re-query of the readout.
    if (game.user.isGM) {
      html.on("contextmenu", "#ffg-campaign-day", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const oe = event.originalEvent || event;
        this._openCampaignDayMenu(oe.clientX, oe.clientY);
      });
    }

    // handle previously created roll destiny chat messages
    $(".ffg-destiny-roll").on("click", this.OnClickRollDestiny.bind(this));

    // setup chat hook for destiny roll
    Hooks.on("renderChatMessageHTML", (...args) => {
      const html = args[1];
      $(html).on("click", ".ffg-destiny-roll", this.OnClickRollDestiny.bind(this));
    });

    // setup socket handler for checking destiny roll
    game.socket.on("system.starwarsffg", async (...args) => {
      if (args[0]?.canIRollDestinyResponse === game.user.id && !game.user.isGM) {
        if (!args[0]?.rolled) {
          const roll = await this._rollDestiny();
          await game.socket.emit("system.starwarsffg", { destiny: game.user.id, light: roll.ffg.light, dark: roll.ffg.dark });
        } else {
          ui.notifications.error(`${game.i18n.localize("SWFFG.DestinyAlreadyRolled")}`);
        }
      }
    });

    if (game.user.isGM) {
      // socket handler for GM
      game.socket.on("system.starwarsffg", async (...args) => {
        // check if this is the GM intended to answer the question or not
        if (game.user.id !== game.users.activeGM?.id) {
          // limit rolling to a single GM
          return;
        }
        if (args[0]?.destinyRequest || args[0]?.destinyFlip) {
          await this.destinyDispatcher.receive(args[0], args[1]);
          return;
        }
        // Can user roll destiny? Or have they already rolled
        if (args[0]?.canIRollDestiny) {
          let rolled = false;

          try {
            rolled = await game.settings.get("starwarsffg", `destinyrollers${args[0]?.canIRollDestiny}`);
          } catch (err) {
            game.settings.register("starwarsffg", `destinyrollers${args[0].canIRollDestiny}`, {
              name: "DestinyRoll",
              scope: "client",
              default: false,
              config: false,
              type: Boolean,
            });
          }

          await game.socket.emit("system.starwarsffg", { canIRollDestinyResponse: args[0]?.canIRollDestiny, rolled });
        }

        // Handle user report for initial Destiny roll
        if (args[0]?.destiny && CONFIG.FFG.DestinyGM === game.user.id) {
          this.destinyQueue.enqueue({
            type: "destiny-roll",
            roller: args[0].destiny,
            light: args[0].light,
            dark: args[0].dark,
          });
        }

        await this.destinyQueue.drain();
      });
    }
  }

  /**
   * Announce each outcome directly from the queue. A GM add/remove or roll can
   * drain someone else's flip; its result must not depend on that caller reading
   * the returned batch. The writer posts measured totals and credits the asker.
   * @param {object} result  the queue's per-request completion result
   * @returns {Promise<void>}
   */
  async _announceDestinyResult(result) {
    const request = result?.request;
    if (!request) return;

    const pointLabel = game.i18n.localize(game.settings.get("starwarsffg",
      (request.from ?? request.pool) === DESTINY_LIGHT ? "destiny-pool-light" : "destiny-pool-dark"));

    if (!result.applied) {
      let content = "Could not change the Destiny Pool: invalid request.";
      if (result.reason === "empty") content = `Cannot flip a ${pointLabel} point; 0 remaining.`;
      if (result.reason === "error") content = "Could not finish changing the Destiny Pool. Check its totals before trying again.";
      const recipient = request.requestedBy ?? request.roller;
      if (!recipient || recipient === game.user.id) {
        ui.notifications.warn(content);
      } else {
        await ChatMessage.create({ content, whisper: [recipient] });
      }
      return;
    }

    if (request.type === "destiny-adjust") {
      await ChatMessage.create({
        author: request.requestedBy ?? game.user.id,
        content: `${request.delta > 0 ? "Added" : "Removed"} a ${pointLabel} point.`,
      });
      return;
    }
    if (request.type === "destiny-reset") {
      await ChatMessage.create({
        author: request.requestedBy ?? game.user.id,
        content: game.i18n.localize("SWFFG.DestinyPoolReset"),
      });
      return;
    }
    // Rolls already post their dice chat before submitting the pool contribution.
    if (request.type !== "destiny-flip") return;
    const pool = result.pool ?? { light: 0, dark: 0 };
    const flipType = request.to;
    await ChatMessage.create({
      author: request.requestedBy ?? game.user.id,
      content: `<div class="destiny-flip ${flipType}">
          <div class="destiny-title">${game.i18n.localize("SWFFG.DestinyFlipMessage")}: <span class="${pointLabel}">${pointLabel}</span></div>
          <div class="destiny-left ${flipType !== DESTINY_DARK} dark">${game.i18n.localize(game.settings.get("starwarsffg", "destiny-pool-dark"))} ${game.i18n.localize("SWFFG.DestinyFlipRemaining")}: ${pool.dark}</div>
          <div class="destiny-left ${flipType !== DESTINY_LIGHT} light">${game.i18n.localize(game.settings.get("starwarsffg", "destiny-pool-light"))} ${game.i18n.localize("SWFFG.DestinyFlipRemaining")}: ${pool.light}</div>
          </div>`,
    });
  }

  /**
   * Show a tiny one-item ("Edit") context menu at the cursor for the campaign-day
   * readout. Appended to <body> (the widget body is pointer-events:none), and
   * dismissed on the next click/right-click/scroll/Escape anywhere.
   * @param {number} x  clientX
   * @param {number} y  clientY
   */
  _openCampaignDayMenu(x, y) {
    document.querySelector(".ffg-campaign-day-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "ffg-campaign-day-menu";
    // Position pinned inline so the menu is cursor-anchored even if the stylesheet
    // rule is absent for the active theme.
    menu.style.position = "fixed";
    menu.style.zIndex = "1000";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const edit = document.createElement("a");
    edit.className = "ffg-campaign-day-edit";
    edit.innerHTML = `<i class="fas fa-pen"></i> ${game.i18n.localize("SWFFG.Codex.CritTrauma.EditDay")}`;
    menu.appendChild(edit);
    document.body.appendChild(menu);

    // Keep it on-screen if opened near the right/bottom edge.
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - r.width - 4)}px`;
    if (r.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - r.height - 4)}px`;

    const cleanup = () => {
      menu.remove();
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("wheel", cleanup, true);
      window.removeEventListener("blur", cleanup);
      document.removeEventListener("keydown", onKey, true);
    };
    // A click inside the menu (i.e. on "Edit") must NOT dismiss before its own
    // handler runs — only outside interactions dismiss.
    const onDoc = (ev) => { if (!menu.contains(ev.target)) cleanup(); };
    const onKey = (ev) => { if (ev.key === "Escape") cleanup(); };
    edit.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
      this._openSetDayDialog();
    });
    // Defer so the right-click that opened the menu doesn't immediately dismiss it.
    setTimeout(() => {
      document.addEventListener("pointerdown", onDoc, true);
      document.addEventListener("wheel", cleanup, true);
      window.addEventListener("blur", cleanup);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  }

  /**
   * Dialog to OVERRIDE the campaign day with an explicit value (GM only). Sets the
   * world setting directly; its onChange refreshes the readout + open Codex sheets.
   */
  async _openSetDayDialog() {
    const current = Math.floor(Number(game.settings.get("starwarsffg", "campaignDay")) || 0);
    const n = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("SWFFG.Codex.CritTrauma.EditDayTitle") },
      content: `<form class="form"><div class="form-group"><label>${game.i18n.localize("SWFFG.Codex.CritTrauma.EditDayLabel")}</label><input type="number" name="day" value="${current}" min="0" step="1" autofocus /></div></form>`,
      rejectClose: false,
      buttons: [{
        action: "set",
        label: game.i18n.localize("SWFFG.Codex.CritTrauma.EditDaySet"),
        default: true,
        callback: (ev, button) => Math.floor(Number(button.form.elements.day.value)),
      }],
    });
    if (n === null || n === undefined || Number.isNaN(n)) return;
    await game.settings.set("starwarsffg", "campaignDay", Math.max(0, n));
  }

  /**
   * Make the floating widget draggable by its body and persist the position
   * per-user. The window header is hidden (this is a chrome widget), so V2's
   * built-in header drag is unavailable. A custom pointer-drag is used so it can
   * coexist with the flip-on-click handlers on the destiny points: a click flips
   * a point, a drag (movement past a small threshold) moves the widget.
   * @param {JQuery} html
   */
  _setupDragging(html) {
    const root = this.element;
    const handle = html.find(".swffg-destiny")[0];
    if (!root || !handle) return;
    // The widget body is pointer-events:none by default (so clicks fall through
    // to the canvas); enable it on the drag handle so it can be grabbed.
    handle.style.pointerEvents = "auto";
    handle.style.cursor = "move";

    let active = false;
    let moved = false;
    let sx = 0, sy = 0, startLeft = 0, startTop = 0;

    const onDown = (event) => {
      if (event.button !== 0) return;
      active = true;
      moved = false;
      sx = event.clientX;
      sy = event.clientY;
      const r = root.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      // Do NOT setPointerCapture here. Capturing on pointerdown retargets the
      // matching pointerup to this handle and suppresses the synthesized `click`
      // on the actual child that was pressed -- so clicks on .destiny-points (the
      // pool flip) and the group-manager menu links (.dropdown-content a) never
      // fire their handlers. Capture is acquired lazily in onMove, only once an
      // actual drag is detected, so a plain click is never swallowed.
    };

    const onMove = (event) => {
      if (!active) return;
      const dx = event.clientX - sx;
      const dy = event.clientY - sy;
      if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        moved = true;
        // This is now a real drag: capture the pointer so movement keeps tracking
        // even if it leaves the handle. (A plain click never reaches here, so its
        // `click` event is left intact -- see onDown.)
        try { handle.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      }
      if (!moved) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      const left = Math.min(Math.max(0, startLeft + dx), Math.max(0, vw - w));
      const top = Math.min(Math.max(0, startTop + dy), Math.max(0, vh - h));
      this.setPosition({ left, top });
    };

    const onUp = (event) => {
      if (!active) return;
      active = false;
      try { handle.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      if (moved) {
        // A click is synthesized at the end of a drag; suppress the next flip so
        // dragging across a destiny point does not also flip it. Auto-clear in
        // case the browser does not emit that click (large drags often do not).
        this._suppressFlip = true;
        setTimeout(() => { this._suppressFlip = false; }, 0);
        game.settings.set("starwarsffg", "destinyTrackerPosition", {
          left: this.position.left,
          top: this.position.top,
        });
      }
    };

    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  // Click event for Roll Destiny Chat Message
  async OnClickRollDestiny(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!game.user.isGM) {
      await game.socket.emit("system.starwarsffg", { canIRollDestiny: game.user.id });
    }

    if (game.user.isGM) {
      const roll = await this._rollDestiny();

      // Through the queue like everything else, so a GM rolling while player
      // requests are in flight cannot clobber them. No `roller`: the "has rolled"
      // marker is a per-player setting and was never stamped for the GM.
      await this.destinyDispatcher.submit({ type: "destiny-roll", light: roll.ffg.light, dark: roll.ffg.dark });
    }
  }

  async _rollDestiny() {
    const pool = new DicePoolFFG({
      force: 1,
    });

    const roll = new game.ffg.RollFFG(pool.renderDiceExpression());
    await roll.toMessage({
      user: game.user.id,
      flavor: `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize("SWFFG.DestinyPool")}...`,
    });

    return roll;
  }
}
