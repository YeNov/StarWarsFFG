import {xpLogEarn} from "./helpers/actor-helpers.js";
import ActorHelpers from "./helpers/actor-helpers.js";
import { FFGFormApplication } from "./apps/ffg-form-application.js";
import { collectXpGrantTargets, defaultXpSelection, rememberXpExclusions } from "./helpers/xp-grant-targets.js";
import { buildTrackTable, matchRange, buildMoralityList, closestMorality } from "./helpers/obligation-tracks.js";

const { DialogV2 } = foundry.applications.api;

export class GroupManager extends FFGFormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
    this.obligations = [];
    this.duties = [];
    this.moralities = [];
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
   * The Obligation / Duty / Morality tables, one tab each. Core keeps the chosen tab in
   * `this.tabGroups.triggers` across renders -- which matters here, since this window
   * re-renders on every actor update. Only the tabs whose table has rows are drawn.
   */
  static TABS = {
    triggers: {
      tabs: [{ id: "obligation" }, { id: "duty" }, { id: "morality" }],
      initial: "obligation",
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
    // The tables come from each character's Obligation/Duty entries plus its baseline
    // (see buildTrackTable) -- they used to read only the old importer's lists, so an
    // entry added on the sheet never reached them.
    this.obligations = buildTrackTable(characters, "obligation");
    this.duties = buildTrackTable(characters, "duty");
    this.moralities = buildMoralityList(characters);

    const dPool = { light: game.settings.get("starwarsffg", "dPoolLight"), dark: game.settings.get("starwarsffg", "dPoolDark") };
    const initiative = CONFIG.Combat.initiative.formula;
    const isGM = game.user.isGM;
    const theme = CONFIG.FFG.theme;
    // A baseline slice carries no entry name; the table shows the track's name instead.
    const labelled = (table, label) => table.map((row) => ({ ...row, label: row.type || label }));
    const obligations = labelled(this.obligations, game.i18n.localize("SWFFG.DescriptionObligation"));
    const duties = labelled(this.duties, game.i18n.localize("SWFFG.DescriptionDuty"));
    const moralities = this.moralities.map((row) => ({ ...row, strengths: row.strengths.join(", "), weaknesses: row.weaknesses.join(", ") }));
    players.hasObligation = obligations.length;
    players.hasDuty = duties.length;
    // GM only: the rules let a player keep their Morality secret from the rest of the table.
    players.hasMorality = isGM && moralities.length;

    // A tab only for each table the group actually uses. If the chosen one has just emptied
    // (its last entry removed, its player gone), fall back to the first that remains.
    const available = [
      ["obligation", players.hasObligation, "SWFFG.DescriptionObligation"],
      ["duty", players.hasDuty, "SWFFG.DescriptionDuty"],
      ["morality", players.hasMorality, "SWFFG.DescriptionMorality"],
    ].filter(([, inUse]) => inUse);
    if (available.length && !available.some(([id]) => id === this.tabGroups.triggers)) this.tabGroups.triggers = available[0][0];
    const tabs = this._prepareTabs("triggers");
    const triggerTabs = available.map(([id, , label]) => ({ ...tabs[id], label: game.i18n.localize(label) }));

    const labels = {
      light: game.settings.get("starwarsffg", "destiny-pool-light"),
      dark: game.settings.get("starwarsffg", "destiny-pool-dark"),
    };

    return { dPool, players, initiative, isGM, pcListMode, characters, obligations, duties, moralities, tabs, triggerTabs, theme, labels };
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

    html.find(".morality-button").click((ev) => {
      this._rollMorality();
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

  /**
   * Triggering Morality (Force and Destiny Core Rulebook p. 323): whoever's Morality is
   * closest to a d100.
   */
  async _rollMorality() {
    const total = await this._rollD100(game.i18n.localize("SWFFG.DescriptionMorality"));
    this._postTrigger(this._moralityResult(total));
  }

  async _rollTable(table, type) {
    const total = await this._rollD100(type);
    this._postTrigger(this._rangeResult(table, total, type));
  }

  /** Roll a d100 to chat, privately when trigger results are private. @returns {Promise<number>} */
  async _rollD100(label) {
    const r = new Roll("1d100");
    await r.evaluate();
    const rollOptions = game.settings.get("starwarsffg", "privateTriggers") ? { rollMode: "gmroll" } : {};
    r.toMessage(
      {
        flavor: `${game.i18n.localize("SWFFG.Rolling")} ${label}...`,
      },
      rollOptions
    );
    return r.total;
  }

  /** "Debt Obligation Triggered For Dax", or "No Obligation Triggered" past every slice. */
  _rangeResult(table, total, type) {
    const hit = matchRange(table, total);
    if (!hit) return `${game.i18n.localize("SWFFG.OptionValueNo")} ${type} ${game.i18n.localize("SWFFG.Triggered")}`;
    // A baseline slice has no entry name to put in front of the track's.
    const what = [hit.type, type].filter(Boolean).join(" ");
    return `${what} ${game.i18n.localize("SWFFG.Triggered")} ${game.i18n.localize("SWFFG.For")} @Actor[${hit.playerId}]{${hit.name}}`;
  }

  /**
   * "Morality Triggered For Sarah (Compassion / Hatred)". Names the character's Emotional
   * Strengths and Weaknesses, which the session is meant to engage -- but never the score,
   * which a player may keep from the rest of the table. Every character equally close is
   * named, since the rules give no tie-break.
   */
  _moralityResult(total) {
    const type = game.i18n.localize("SWFFG.DescriptionMorality");
    const hits = closestMorality(this.moralities, total);
    if (!hits.length) return `${game.i18n.localize("SWFFG.OptionValueNo")} ${type} ${game.i18n.localize("SWFFG.Triggered")}`;
    const who = hits.map((hit) => {
      const emotions = [hit.strengths.join(", "), hit.weaknesses.join(", ")].filter(Boolean).join(" / ");
      return `@Actor[${hit.playerId}]{${hit.name}}${emotions ? ` (${emotions})` : ""}`;
    });
    return `${type} ${game.i18n.localize("SWFFG.Triggered")} ${game.i18n.localize("SWFFG.For")} ${who.join(", ")}`;
  }

  /** Post a trigger result, whispered to the GMs when trigger results are private. */
  _postTrigger(content) {
    const messageOptions = {
      user: game.user.id,
      content,
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
    // Controlled tokens are a one-off "pay these": such an opening neither uses nor
    // overwrites the ticks remembered from the last ordinary one.
    const fromTokens = characters.some((character) => controlledActorIds.includes(character.id));
    const remembered = game.settings.get("starwarsffg", "grantXpExcluded");
    const excludedIds = Array.isArray(remembered) ? remembered : [];
    const selection = defaultXpSelection({ characters, controlledActorIds, excludedIds });

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
        const boxes = () => [...root.querySelectorAll('input[name="grant-target"]')];
        // Remember who is left unticked as it changes -- granted or cancelled, the dialog
        // reopens the way it was left.
        const remember = () => {
          if (fromTokens) return;
          const selectedIds = boxes().filter((box) => box.checked).map((box) => box.value);
          game.settings.set("starwarsffg", "grantXpExcluded", rememberXpExclusions({ characters, selectedIds, previous: excludedIds }));
        };
        const setAll = (checked) => {
          boxes().forEach((box) => (box.checked = checked));
          remember();
        };
        root.querySelector(".grant-xp-all")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          setAll(true);
        });
        root.querySelector(".grant-xp-none")?.addEventListener("click", (ev) => {
          ev.preventDefault();
          setAll(false);
        });
        boxes().forEach((box) => box.addEventListener("change", remember));
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
