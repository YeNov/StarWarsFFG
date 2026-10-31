/**
 * Roll a character's skill from the homestead sheet
 * (docs/superpowers/specs/2026-10-31-homestead-skill-roll-design.md).
 *
 * The user picks one of their characters (no prompt when there is only one) and a skill, with a
 * search box that filters the list as they type. The pool is the character's own, as a crew roll
 * builds it, plus the homestead's upgrade modifiers for that skill; the dialog then offers the
 * upgrades' optional buffs next to the character's (the roll's `homesteadUuid`).
 */
import DiceHelpers, { crewRollBuffOptions, get_dice_pool } from "../helpers/dice-helpers.js";
import { DicePoolFFG } from "../dice/pool.js";
import { firstSkill, groupSkills, homesteadDefaultRows, homesteadItems, homesteadRollers, homesteadRollPool } from "../helpers/homestead-roll.js";

const TEMPLATE = "systems/starwarsffg/templates/dialogs/homestead-roll.html";
const SEARCH_DELAY_MS = 200;

/** The character's skills with what the sheet shows beside them: category, characteristic, rank. */
function skillChoices(actor) {
  return Object.entries(actor?.system?.skills ?? {}).map(([key, skill]) => {
    const characteristic = skill?.characteristic ?? "";
    const abbreviation = CONFIG.FFG?.characteristics?.[characteristic]?.abrev;
    return {
      key,
      label: game.i18n.localize(skill?.label ?? key),
      type: skill?.type ?? "General",
      characteristic: abbreviation ? game.i18n.localize(abbreviation) : characteristic.slice(0, 2),
      rank: Number(skill?.rank) || 0,
    };
  });
}

/** The skill categories in the sheet's order. */
const skillTypes = (actor) => (Array.isArray(actor?.system?.skilltypes) ? actor.system.skilltypes : []);

/** Whether the Sort skills by label setting is on, as the sheet reads it. */
function sortByLabel() {
  try {
    return game.settings.get("starwarsffg", "skillSorting") === true;
  } catch {
    return false;
  }
}

/**
 * Ask which character rolls which skill.
 * @param {Actor} homestead
 * @param {Array<Actor>} rollers - at least one
 * @returns {Promise<{actor: Actor, skillKey: string}|null>} null when the window is closed
 */
async function pickCharacterAndSkill(homestead, rollers) {
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    showCharacters: rollers.length > 1,
    characters: rollers.map((actor) => ({ id: actor.id, name: actor.name })),
  });
  let chosen = null;

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("SWFFG.Homestead.Roll.Title", { name: homestead.name }) },
    position: { width: 680 },
    classes: ["dialog", "ffg-homestead-roll-dialog"],
    content,
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel"), default: true }],
    rejectClose: false,
    render: (_event, dialog) => {
      const root = dialog.element;
      const select = root.querySelector('select[name="character"]');
      const search = root.querySelector('input[name="skill-search"]');
      const list = root.querySelector(".ffg-homestead-roll-skills");
      const currentActor = () => rollers.find((actor) => actor.id === select?.value) ?? rollers[0];
      let skills = skillChoices(currentActor());

      const draw = () => {
        const groups = groupSkills(skills, skillTypes(currentActor()), search.value, sortByLabel());
        list.replaceChildren(...groups.map((group) => {
          const section = document.createElement("section");
          section.className = "ffg-homestead-roll-group";
          const heading = document.createElement("h3");
          heading.textContent = group.label;
          section.append(heading);
          for (const { key, label, characteristic, rank } of group.skills) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.skill = key;
            const name = document.createElement("span");
            name.className = "skill-name";
            name.textContent = label;
            const detail = document.createElement("span");
            detail.className = "skill-detail";
            detail.textContent = `${characteristic} · ${rank}`;
            button.append(name, detail);
            section.append(button);
          }
          return section;
        }));
      };

      const pick = (key) => {
        if (!key) return;
        chosen = { actor: currentActor(), skillKey: key };
        dialog.close();
      };
      list.addEventListener("click", (event) => pick(event.target.closest("button[data-skill]")?.dataset.skill));
      // Enter would submit the form through Cancel; it rolls the first skill the search leaves.
      search.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        pick(firstSkill(skills, search.value, skillTypes(currentActor())));
      });
      search.addEventListener("input", foundry.utils.debounce(draw, SEARCH_DELAY_MS));
      select?.addEventListener("change", () => {
        skills = skillChoices(currentActor());
        draw();
      });
      draw();
      search.focus();
    },
  });

  return chosen;
}

/**
 * Open the dice dialog for a character's skill with the homestead's upgrades added.
 * @param {Actor} homestead
 * @param {Actor} actor - the character who rolls
 * @param {string} skillKey
 */
async function rollWithHomestead(homestead, actor, skillKey) {
  const options = crewRollBuffOptions(actor.id, skillKey);
  if (!options.skillKey) {
    ui.notifications.warn(game.i18n.format("SWFFG.Homestead.Roll.NoSkill", { actor: actor.name }));
    return;
  }
  // The rank the upgrades raise travels on, so a Skill Rank buff or swap ticked in the dialog
  // rebuilds the dice from it.
  const { pool, rank } = homesteadRollPool({
    pool: get_dice_pool(actor.id, skillKey, new DicePoolFFG({ difficulty: 2 })),
    groups: homesteadDefaultRows(homesteadItems(homestead), skillKey),
    characteristic: options.characteristic,
    rank: options.rank,
  });

  const label = game.i18n.localize(actor.system?.skills?.[skillKey]?.label ?? skillKey);
  await DiceHelpers.displayRollDialog(
    actor.sheet,
    pool,
    `${game.i18n.localize("SWFFG.Rolling")} ${label}`,
    label,
    {},
    game.i18n.format("SWFFG.Homestead.Roll.Flavor", { name: homestead.name }),
    undefined,
    { ...options, rank, homesteadUuid: homestead.uuid },
  );
}

/**
 * The homestead sheet's Roll skill button.
 * @param {Actor} homestead
 * @returns {Promise<void>}
 */
export async function rollFromHomestead(homestead) {
  if (homestead?.type !== "homestead" || !homestead.isOwner) return;
  const rollers = homesteadRollers({ actors: game.actors, user: game.user, users: game.users });
  if (rollers.length === 0) {
    ui.notifications.warn(game.i18n.localize("SWFFG.Homestead.Roll.NoCharacters"));
    return;
  }
  const choice = await pickCharacterAndSkill(homestead, rollers);
  if (choice) await rollWithHomestead(homestead, choice.actor, choice.skillKey);
}
