import {xpLogEarn} from "./helpers/actor-helpers.js";
import ActorHelpers from "./helpers/actor-helpers.js";
import { FFGFormApplication } from "./apps/ffg-form-application.js";
import { collectXpGrantTargets, defaultXpSelection } from "./helpers/xp-grant-targets.js";
import { buildRangeTable } from "./helpers/obligation-duty-table.js";

const { DialogV2 } = foundry.applications.api;

export class GroupManager extends FFGFormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
    this.obligations = [];
    this.duties = [];
  }

  static DEFAULT_OPTIONS = {
    id: "group-manager",
    classes: ["starwarsffg", "form", "group-manager"],
    window: {
      title: "Group Manager",
      resizable: true,
    },
    position: {
      width: 500,
      height: 900,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    submitOnClose: true,
  };

  static PARTS = {
    content: {
      root: true,
      template: "systems/starwarsffg/templates/group-manager.html",
    },
  };

  /**
   * GM-only editable. Computed live -- it cannot live in the static
   * DEFAULT_OPTIONS field, which is evaluated at class-definition time (module
   * load), before `game.user` exists.
   * @override
   */
  get isEditable() {
    return game.user.isGM;
  }

  /**
   * Lower bound for interactive resize. The Player Characters table needs
   * ~500px to show all columns (Name / Wounds / Strain / Soak / Combat / XP)
   * without clipping; don't let the user drag the window narrower than that.
   * Enforced by the base setPosition.
   * @override
   */
  _minDimensions() {
    return { width: 500, height: 200 };
  }

  /* -------------------------------------------- */

  /**
   * Obtain module metadata and merge it with game settings which track current module visibility
   * @return {Object}   The data provided to the template when rendering the form
   */
  async _prepareContext(_options) {
    const pcListMode = game.settings.get("starwarsffg", "pcListMode");
    const players = game.users.contents.filter((u) => {
      const isValidUser = !u.isGM || game.settings.get("starwarsffg", "GMCharactersInGroupManager");
      // if active mode is selected, only return users actively playing a character, otherwise return all valid users
      if (pcListMode === "active") {
        return isValidUser && u.active;
      }
      return isValidUser;
    });
    if (players.length > 0) {
      players.connected = true;
    }
    const characters = [];
    if (pcListMode === "active") {
      players.forEach((player) => {
        if (player.character) {
          characters.push(player.character);
        }
      });
    } else if (pcListMode === "owned") {
      game.actors.filter((actor) => {
      // filter to characters only
  if (actor.type !== "character") {
    return false;
  }
  for (let player of players) {
    if (actor.testUserPermission(player, "OWNER")) {
      // use actor if any player has ownership
      return true;
    }
  }
  return false;
})
      .forEach((c) => {
        characters.push(c);
      });
    }

    // Rebuilt from nothing on every render. They used to be pushed into on each render
    // and only emptied in the constructor -- and this window re-renders on every actor
    // update -- so the tables grew a copy of every entry per render and kept characters
    // who had since left the group, where the d100 could still land on them.
    this.obligations = buildRangeTable(characters, "obligationlist");
    this.duties = buildRangeTable(characters, "dutylist");

    const dPool = { light: game.settings.get("starwarsffg", "dPoolLight"), dark: game.settings.get("starwarsffg", "dPoolDark") };
    const initiative = CONFIG.Combat.initiative.formula;
    const isGM = game.user.isGM;
    const theme = CONFIG.FFG.theme;
    players.hasObligation = this.obligations?.length;
    let obligations = this.obligations;
    players.hasDuty = this.duties?.length;
    let duties = this.duties;

    const labels = {
      light: game.settings.get("starwarsffg", "destiny-pool-light"),
      dark: game.settings.get("starwarsffg", "destiny-pool-dark"),
    };

    return { dPool, players, initiative, isGM, pcListMode, characters, obligations, duties, theme, labels };
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = $(this.element);

    // The PC table is shorter for non-GMs (no editable destiny/XP controls).
    if (!game.user.isGM) this.setPosition({ height: 470 });

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Flip destiny pool DARK to LIGHT
    html.find(".destiny-flip-dtl").click((ev) => {
      let LightPool = this.form.elements["dPool.light"].value;
      let DarkPool = this.form.elements["dPool.dark"].value;
      if (DarkPool > 0) {
        LightPool++;
        DarkPool--;
        this.form.elements["dPool.light"].value = LightPool;
        this.form.elements["dPool.dark"].value = DarkPool;
      }
    });

    // Flip destiny pool LIGHT to DARK
    html.find(".destiny-flip-ltd").click((ev) => {
      let LightPool = this.form.elements["dPool.light"].value;
      let DarkPool = this.form.elements["dPool.dark"].value;
      if (LightPool > 0) {
        LightPool--;
        DarkPool++;
        this.form.elements["dPool.light"].value = LightPool;
        this.form.elements["dPool.dark"].value = DarkPool;
      }
    });

    // Listen for initiative dropdown change and update initiative formula accordingly.
    html.find(".initiative-mode").change((ev) => {
      const init_value = ev.target.value.charAt(0).toLowerCase();
      game.settings.set("starwarsffg", "initiativeRule", init_value);
      ui.notifications.info(`Initiative mode changed to: ${ev.target.value}`);
    });

    // Add individual character to combat tracker.
    html.find(".add-to-combat").click((ev) => {
      const character = ev.currentTarget.dataset.character;
      this._addCharacterToCombat(character, game.combat);
    });
    // Add all characters to combat tracker.
    html.find(".group-to-combat").click((ev) => {
      const characters = [];
      const groupmanager = document.getElementById("group-manager");
      const charlist = groupmanager.querySelectorAll('tr[class="player-character"]');
      const tokens = canvas.tokens.controlled;
      charlist.forEach((element) => {
        characters.push(element.dataset["character"]);
      });
      this._addGroupToCombat(characters, tokens, game.combat);
    });

    // Add XP to individual character.
    html.find(".add-XP").click((ev) => {
      const character = ev.currentTarget.dataset.character;
      const c = game.actors.get(character);
      this._grantXP(c);
    });
    // Grant XP to a chosen set of characters. Deliberately NOT read off the rendered
    // rows: this table is filtered by `pcListMode`, and on its default a character
    // whose player is logged out has no row here at all.
    html.find(".bulk-XP").click((ev) => {
      this._grantGroupXP();
    });

    html.find(".obligation-button").click((ev) => {
      this._rollObligation();
    });

    html.find(".duty-button").click((ev) => {
      this._rollDuty();
    });

    // Open character sheet on row click.
    html.find(".player-character").click((ev) => {
      if (!$(ev.target).hasClass("fas") && ev.target.localName !== "button") {
        const li = $(ev.currentTarget);
        const actorId = li.data("character");
        const actor = game.actors.get(actorId);
        if (actor?.sheet) {
          actor.sheet.render(true);
        }
      }
    });
  }

  /**
   * This method is called upon form submission after form data is validated
   * @param event {Event}       The initial triggering submission event
   * @param formData {Object}   The object of validated form data with which to update the object
   * @private
   */
  _updateObject(event, formData) {
    const formDPool = foundry.utils.expandObject(formData).dPool || {};
    game.settings.set("starwarsffg", "dPoolLight", formDPool.light);
    game.settings.set("starwarsffg", "dPoolDark", formDPool.dark);
    return formData;
  }

  async _rollObligation() {
    this._rollTable(this.obligations, game.i18n.localize("SWFFG.DescriptionObligation"));
  }

  async _rollDuty() {
    this._rollTable(this.duties, game.i18n.localize("SWFFG.DescriptionDuty"));
  }

  async _rollTable(table, type) {
    let r = new Roll("1d100");
    await r.evaluate();
    let rollOptions = game.settings.get("starwarsffg", "privateTriggers") ? { rollMode: "gmroll" } : {};
    r.toMessage(
      {
        flavor: `${game.i18n.localize("SWFFG.Rolling")} ${type}...`,
      },
      rollOptions
    );
    let filteredTable = table.filter((entry) => entry.rangeStart <= r.total && r.total <= entry.rangeEnd);
    let tableResult = filteredTable?.length ? `${filteredTable[0].type} ${type} ${game.i18n.localize("SWFFG.Triggered")} ${game.i18n.localize("SWFFG.For")} @Actor[${filteredTable[0].playerId}]{${filteredTable[0].name}}` : `${game.i18n.localize("SWFFG.OptionValueNo")} ${type} ${game.i18n.localize("SWFFG.Triggered")}`;
    let messageOptions = {
      user: game.user.id,
      content: tableResult,
    };
    if (game.settings.get("starwarsffg", "privateTriggers")) {
      messageOptions.whisper = ChatMessage.getWhisperRecipients("GM");
    }
    ChatMessage.create(messageOptions);
  }

  async _addGroupToCombat(characters, targets, cbt) {
    await this._setupCombat(cbt);
    let tokens = targets.filter((t) => !t.inCombat);
    await Promise.all(
      characters.map(async (c) => {
        let token = await this._getCharacterToken(game.actors.get(c));
        if (token) {
          if (!token._controlled && !token.inCombat) {
            tokens.push(token);
          }
        } else {
          ui.notifications.warn(`${c.name} has no active Token in the current scene.`);
        }
      })
    );
    const createData = tokens.map((t) => {
      return { tokenId: t.id };
    });
    await game.combat.createEmbeddedDocuments('Combatant', createData);
  }

  async _addCharacterToCombat(character, cbt) {
    await this._setupCombat(cbt);
    let token = await this._getCharacterToken(game.actors.get(character));
    if (token && !token.inCombat) {
        await game.combat.createEmbeddedDocuments('Combatant', [{ tokenId: token.id }]);
      //await game.combat.createCombatant({ tokenId: token.id });
    } else {
      ui.notifications.warn(`User has no active Token in the current scene.`);
    }
  }

  async _getCharacterToken(character) {
    let activeTokens = character.getActiveTokens();
    return activeTokens.length ? activeTokens[0] : null;
  }

  async _setupCombat(cbt) {
    // If no combat encounter is active, create one.
    if (!cbt) {
      cbt = await Combat.create({scene: canvas.scene.id, active: true});
    }
  }

  async _grantXP(character) {
    if (character?.type !== "character") {
      return;
    }
    const id = foundry.utils.randomID();
    const description = game.i18n.localize("SWFFG.GrantXPTo") + ` ${character.name}...`;
    const content = await foundry.applications.handlebars.renderTemplate("systems/starwarsffg/templates/grant-xp.html", {
      id,
    });

    DialogV2.wait({
      window: { title: description },
      content,
      buttons: [
        {
          action: "one",
          icon: "fas fa-check",
          label: game.i18n.localize("SWFFG.GrantXP"),
          default: true,
          callback: async () => {
            const container = document.getElementById(id);
            const amount = container.querySelector('input[name="amount"]').value;
            const note = container.querySelector('input[name="note"]').value;
            await this._applyXP(character, amount, note);
          },
        },
        {
          action: "two",
          icon: "fas fa-times",
          label: game.i18n.localize("SWFFG.Cancel"),
        },
      ],
      rejectClose: false,
    });
  }

  /**
   * Add XP to one character and record it in that character's XP log.
   *
   * beginEditMode persists disabled=true on every Active Effect this character carries,
   * so endEditMode MUST run even when the write or the log step throws -- otherwise the
   * character is left with every effect disabled, world-wide. A failure is reported and
   * swallowed rather than thrown, so one bad character cannot abort the rest of a group
   * grant halfway through.
   *
   * @param {Actor} character  The character to pay.
   * @param {number|string} amount  XP to add, as entered in the dialog.
   * @param {string} note  Free-text reason recorded in the XP log.
   */
  async _applyXP(character, amount, note) {
    if (character?.type !== "character") {
      return;
    }
    const state = await ActorHelpers.beginEditMode(character, true);
    try {
      const available = +character.system.experience.available + +amount;
      const total = +character.system.experience.total + +amount;
      await character.update({
        ["system.experience.total"]: total,
        ["system.experience.available"]: available,
      });
      await xpLogEarn(character, amount, available, total, note);
      ui.notifications.info(`Granted ${amount} XP to ${character.name}.`);
    } catch (err) {
      CONFIG.logger.error(`Unable to grant XP to ${character.name}.`, err);
      ui.notifications.error(`Unable to grant XP to ${character.name}; see the console.`);
    } finally {
      await ActorHelpers.endEditMode(character, state, true);
    }
  }

  /**
   * Grant XP to a chosen set of characters.
   *
   * Offers every player-owned character rather than the rows of this window's table:
   * that table obeys the `pcListMode` setting, and on its default ("Active Only") a
   * character whose player is not logged in never appears -- which used to make them
   * unreachable, since the button read the rendered rows. Everyone is ticked by default;
   * controlling tokens before pressing the button ticks just those characters instead.
   */
  async _grantGroupXP() {
    const characters = collectXpGrantTargets({
      actors: game.actors,
      users: game.users,
      includeGMCharacters: game.settings.get("starwarsffg", "GMCharactersInGroupManager"),
    });
    if (!characters.length) {
      ui.notifications.warn(game.i18n.localize("SWFFG.GrantXPNoCharacters"));
      return;
    }

    // A token's own actor is a synthetic copy when the token is unlinked; actorId is the
    // world actor either way, which is the one that owns the XP.
    const controlledActorIds = (canvas?.tokens?.controlled ?? []).map((token) => token.document?.actorId).filter(Boolean);
    const selection = defaultXpSelection({ characters, controlledActorIds });

    const id = foundry.utils.randomID();
    const content = await foundry.applications.handlebars.renderTemplate("systems/starwarsffg/templates/grant-xp.html", {
      id,
      characters: characters.map((character) => ({ ...character, selected: selection.has(character.id) })),
    });

    DialogV2.wait({
      window: { title: game.i18n.localize("SWFFG.GrantXPToCharacters") },
      content,
      buttons: [
        {
          action: "one",
          icon: "fas fa-check",
          label: game.i18n.localize("SWFFG.GrantXP"),
          default: true,
          callback: async () => {
            const container = document.getElementById(id);
            const amount = container.querySelector('input[name="amount"]').value;
            const note = container.querySelector('input[name="note"]').value;
            const chosen = [...container.querySelectorAll('input[name="grant-target"]:checked')].map((box) => box.value);
            if (!chosen.length) {
              ui.notifications.warn(game.i18n.localize("SWFFG.GrantXPNoTargets"));
              return;
            }
            for (const actorId of chosen) {
              await this._applyXP(game.actors.get(actorId), amount, note);
            }
          },
        },
        {
          action: "two",
          icon: "fas fa-times",
          label: game.i18n.localize("SWFFG.Cancel"),
        },
      ],
      render: (event, dialog) => {
        const root = dialog.element;
        const setAll = (checked) => root.querySelectorAll('input[name="grant-target"]').forEach((box) => (box.checked = checked));
        root.querySelector(".grant-xp-all")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          setAll(true);
        });
        root.querySelector(".grant-xp-none")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          setAll(false);
        });
      },
      rejectClose: false,
    });
  }
}

// Catch updates to connected players and update the group manager window if necessary.
Hooks.on("renderPlayerList", (playerList) => {
  const groupmanager = canvas?.groupmanager?.window;
  if (groupmanager) {
    groupmanager.render();
  }
});
// Catch updates to actors and update the group manager window if necessary.
Hooks.on("updateActor", (actor, data, options, id) => {
  const groupmanager = canvas?.groupmanager?.window;
  if (groupmanager) {
    groupmanager.render();
  }
});
Hooks.on("renderActorSheet", (actor, data, options, id) => {
  const groupmanager = canvas?.groupmanager?.window;
  if (groupmanager) {
    groupmanager.render();
  }
});
